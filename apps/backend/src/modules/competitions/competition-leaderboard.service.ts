import { ICompetitionRepository } from './competition.types';
import { IMarketDataRepository } from '../market';
import { CompetitionLeaderboardEntry } from '@tradegrid/shared-types';
import { FinancialMath } from '../../utils/math';
import { RealtimeService } from '../../websocket/realtime.service';
import { logger } from '../../utils/logger';

export class CompetitionLeaderboardService {
  constructor(
    private competitionRepo: ICompetitionRepository,
    private marketDataRepo: IMarketDataRepository,
    private realtimeService?: RealtimeService
  ) {}

  /**
   * Recalculates, ranks, updates, and broadcasts the competition leaderboard.
   */
  async computeLeaderboard(
    competitionId: number,
    isFinal = false
  ): Promise<CompetitionLeaderboardEntry[]> {
    const competition = await this.competitionRepo.findById(competitionId);
    if (!competition) {
      throw new Error(`Competition #${competitionId} not found`);
    }

    const participants = await this.competitionRepo.listParticipants(competitionId);
    if (participants.length === 0) {
      return [];
    }

    const entries: (CompetitionLeaderboardEntry & {
      joinedAt: string;
      rawReturnNum: number;
      rawPnlNum: number;
    })[] = [];

    for (const participant of participants) {
      // 1. Fetch participant account cash
      const account = await this.competitionRepo.getAccount(competitionId, participant.userId);
      const availableCash = account?.availableCash || participant.startingCapital;
      const reservedCash = account?.reservedCash || '0.0000';
      const totalCash = FinancialMath.add(availableCash, reservedCash);

      // 2. Fetch participant positions & market values
      const positions = await this.competitionRepo.listPositions(competitionId, participant.userId);
      let holdingsMarketValue = '0.0000';
      let totalRealizedPnL = '0.0000';
      let totalUnrealizedPnL = '0.0000';

      for (const pos of positions) {
        if (!FinancialMath.isPositive(pos.quantity)) continue;

        // Fetch current instrument quote
        const quote = await this.marketDataRepo.getQuoteByInstrumentId(pos.instrumentId);
        let currentPrice = quote?.lastPrice ? String(quote.lastPrice) : '0.0000';

        // Safe fallback if price is stale or unavailable
        if (!FinancialMath.isPositive(currentPrice)) {
          currentPrice = pos.averageEntryPrice;
        }

        const posMarketVal = FinancialMath.calcTradeAmount(currentPrice, pos.quantity);
        holdingsMarketValue = FinancialMath.add(holdingsMarketValue, posMarketVal);

        // Position P&L
        const costBasis = FinancialMath.calcTradeAmount(pos.averageEntryPrice, pos.quantity);
        const unrealized = FinancialMath.sub(posMarketVal, costBasis);
        totalUnrealizedPnL = FinancialMath.add(totalUnrealizedPnL, unrealized);
        totalRealizedPnL = FinancialMath.add(totalRealizedPnL, pos.realizedPnL);
      }

      // 3. Compute Total Portfolio Value
      // Portfolio Value = Available Cash + Reserved Cash + Market Value of Holdings
      const portfolioValue = FinancialMath.add(totalCash, holdingsMarketValue);

      // 4. Compute Total Return Percentage
      // ((Portfolio Value - Starting Capital) / Starting Capital) * 100
      const startingCapital = participant.startingCapital;
      const profitLoss = FinancialMath.sub(portfolioValue, startingCapital);
      const returnRatio = FinancialMath.isPositive(startingCapital)
        ? FinancialMath.div(profitLoss, startingCapital)
        : '0.0000';
      const totalReturnPercent = FinancialMath.mul(returnRatio, '100.0000');

      entries.push({
        rank: 0,
        participantId: participant.id,
        userId: participant.userId,
        username: participant.username || `Trader #${participant.userId}`,
        portfolioValue,
        totalReturnPercent,
        realizedPnL: totalRealizedPnL,
        unrealizedPnL: totalUnrealizedPnL,
        tradeCount: participant.tradeCount,
        joinedAt: participant.joinedAt,
        rawReturnNum: parseFloat(totalReturnPercent) || 0,
        rawPnlNum: parseFloat(totalRealizedPnL) || 0,
      });
    }

    // 5. Deterministic Ranking & Tie-Breaker Sorting:
    // Rule 1: Total Return % (descending)
    // Rule 2: Realized PnL (descending)
    // Rule 3: Trade Count (descending)
    // Rule 4: Joined At timestamp (ascending)
    entries.sort((a, b) => {
      if (b.rawReturnNum !== a.rawReturnNum) {
        return b.rawReturnNum - a.rawReturnNum;
      }
      if (b.rawPnlNum !== a.rawPnlNum) {
        return b.rawPnlNum - a.rawPnlNum;
      }
      if (b.tradeCount !== a.tradeCount) {
        return b.tradeCount - a.tradeCount;
      }
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });

    // 6. Assign Ranks and Update Participant Records
    const finalLeaderboard: CompetitionLeaderboardEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rank = i + 1;

      finalLeaderboard.push({
        rank,
        participantId: entry.participantId,
        userId: entry.userId,
        username: entry.username,
        portfolioValue: entry.portfolioValue,
        totalReturnPercent: entry.totalReturnPercent,
        realizedPnL: entry.realizedPnL,
        unrealizedPnL: entry.unrealizedPnL,
        tradeCount: entry.tradeCount,
      });

      // Update participant row in database
      await this.competitionRepo.updateParticipant(competitionId, entry.userId, {
        current_portfolio_value: entry.portfolioValue,
        total_return_percent: entry.totalReturnPercent,
        rank,
      });
    }

    // 7. Save Leaderboard Snapshot
    await this.competitionRepo.saveLeaderboardSnapshot(
      competitionId,
      finalLeaderboard,
      isFinal
    );

    // 8. Broadcast over Socket.IO
    if (this.realtimeService) {
      this.realtimeService.emitCompetitionLeaderboardUpdated?.({
        eventId: `lb-${Date.now()}`,
        competitionId,
        leaderboard: finalLeaderboard,
        timestamp: new Date().toISOString(),
      });
    }

    logger.debug(
      `[COMPETITION LEADERBOARD] Recalculated leaderboard for Comp #${competitionId}: ${finalLeaderboard.length} participants ranked`
    );

    return finalLeaderboard;
  }
}
