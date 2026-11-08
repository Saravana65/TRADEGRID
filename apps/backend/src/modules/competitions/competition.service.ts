import {
  ICompetitionRepository,
} from './competition.types';
import { IMarketDataRepository, IInstrumentRepository } from '../market';
import { CompetitionMatchingService } from './competition-matching.service';
import { CompetitionLeaderboardService } from './competition-leaderboard.service';
import {
  CreateCompetitionInput,
  JoinCompetitionInput,
  CreateCompetitionOrderInput,
  CompetitionQueryInput,
} from '@tradegrid/validation';
import {
  Competition,
  CompetitionParticipant,
  CompetitionOrder,
  CompetitionTrade,
  CompetitionLeaderboardEntry,
  CompetitionPortfolioSummary,
} from '@tradegrid/shared-types';
import { AppError } from '../../middleware/error.middleware';
import { FinancialMath } from '../../utils/math';
import { logger } from '../../utils/logger';
import { RealtimeService } from '../../websocket/realtime.service';

export class CompetitionService {
  constructor(
    private competitionRepo: ICompetitionRepository,
    private marketDataRepo: IMarketDataRepository,
    private instrumentRepo: IInstrumentRepository,
    private matchingService: CompetitionMatchingService,
    private leaderboardService: CompetitionLeaderboardService,
    private realtimeService?: RealtimeService
  ) {}

  // ==========================================================================
  // Competition Lifecycle & Enrollment
  // ==========================================================================

  async createCompetition(
    creatorId: number,
    input: CreateCompetitionInput
  ): Promise<Competition> {
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);

    if (endTime.getTime() <= startTime.getTime()) {
      throw new AppError(400, 'INVALID_DATES', 'Competition end time must be strictly after start time');
    }

    const competition = await this.competitionRepo.transaction(async (trx) => {
      // 1. Create Competition Master Record
      const comp = await this.competitionRepo.createCompetition(
        {
          name: input.name,
          description: input.description || null,
          creator_id: creatorId,
          visibility: input.visibility,
          join_code: input.joinCode || null,
          starting_capital: input.startingCapital,
          max_participants: input.maxParticipants,
          min_participants: input.minParticipants,
          start_time: startTime,
          end_time: endTime,
          allowed_instruments: input.allowedInstruments
            ? JSON.stringify(input.allowedInstruments)
            : null,
          permitted_order_types: JSON.stringify(input.permittedOrderTypes),
          status: 'UPCOMING',
        },
        trx
      );

      // 2. Creator automatically joins the competition
      await this.competitionRepo.addParticipant(
        {
          competitionId: comp.id,
          userId: creatorId,
          startingCapital: input.startingCapital,
        },
        trx
      );

      // 3. Provision creator's isolated competition account
      await this.competitionRepo.createAccount(
        {
          competitionId: comp.id,
          userId: creatorId,
          startingCapital: input.startingCapital,
        },
        trx
      );

      // 4. Audit Log
      await this.competitionRepo.createAuditLog(
        comp.id,
        'CREATED',
        { name: comp.name, creatorId, startingCapital: comp.startingCapital },
        creatorId,
        trx
      );

      return comp;
    });

    logger.info(`[COMPETITIONS] Created Competition #${competition.id} "${competition.name}" by User #${creatorId}`);
    return competition;
  }

  async getCompetitionById(id: number): Promise<Competition> {
    const comp = await this.competitionRepo.findById(id);
    if (!comp) {
      throw new AppError(404, 'COMPETITION_NOT_FOUND', `Competition #${id} not found`);
    }
    const participantCount = await this.competitionRepo.countParticipants(id);
    return { ...comp, participantCount };
  }

  async listCompetitions(query: CompetitionQueryInput, currentUserId?: number): Promise<{
    competitions: Competition[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const res = await this.competitionRepo.findCompetitions({
      status: query.status,
      visibility: query.visibility,
      search: query.search,
      limit,
      offset,
    });

    return {
      competitions: res.competitions,
      total: res.total,
      page,
      limit,
    };
  }

  async listUserCompetitions(userId: number): Promise<Competition[]> {
    const res = await this.competitionRepo.findCompetitions({
      userId,
      limit: 100,
    });
    return res.competitions;
  }

  async joinCompetition(
    competitionId: number,
    userId: number,
    input?: JoinCompetitionInput
  ): Promise<CompetitionParticipant> {
    const comp = await this.getCompetitionById(competitionId);

    // Guard: Can only join if competition is UPCOMING or DRAFT
    if (comp.status !== 'UPCOMING' && comp.status !== 'DRAFT') {
      throw new AppError(
        422,
        'CANNOT_JOIN',
        `Cannot join competition with status "${comp.status}". Joining is only allowed before start.`
      );
    }

    // Guard: Private competition join code verification
    if (comp.visibility === 'PRIVATE') {
      if (!input?.joinCode || input.joinCode !== comp.joinCode) {
        throw new AppError(403, 'INVALID_JOIN_CODE', 'Invalid or missing join code for private competition');
      }
    }

    // Guard: Duplicate participation check
    const existing = await this.competitionRepo.findParticipant(competitionId, userId);
    if (existing && existing.status === 'JOINED') {
      throw new AppError(409, 'ALREADY_JOINED', 'You have already joined this competition');
    }

    // Guard: Maximum participant capacity check
    const currentCount = await this.competitionRepo.countParticipants(competitionId);
    if (currentCount >= comp.maxParticipants) {
      throw new AppError(422, 'COMPETITION_FULL', `Competition has reached its capacity of ${comp.maxParticipants} participants`);
    }

    const participant = await this.competitionRepo.transaction(async (trx) => {
      let p: CompetitionParticipant;
      if (existing) {
        // Re-join after previously leaving
        await this.competitionRepo.updateParticipant(
          competitionId,
          userId,
          { status: 'JOINED' },
          trx
        );
        p = (await this.competitionRepo.findParticipant(competitionId, userId, trx))!;
      } else {
        p = await this.competitionRepo.addParticipant(
          {
            competitionId,
            userId,
            startingCapital: comp.startingCapital,
          },
          trx
        );

        // Provision isolated competition account
        await this.competitionRepo.createAccount(
          {
            competitionId,
            userId,
            startingCapital: comp.startingCapital,
          },
          trx
        );
      }

      await this.competitionRepo.createAuditLog(
        competitionId,
        'JOINED',
        { userId, participantCount: currentCount + 1 },
        userId,
        trx
      );

      return p;
    });

    // Real-time broadcast
    if (this.realtimeService) {
      this.realtimeService.emitCompetitionParticipantJoined?.({
        eventId: `join-${Date.now()}`,
        competitionId,
        userId,
        username: participant.username || `User #${userId}`,
        participantCount: currentCount + 1,
        timestamp: new Date().toISOString(),
      });
    }

    // Refresh leaderboard
    this.leaderboardService.computeLeaderboard(competitionId).catch((err) => {
      logger.warn(`[COMPETITIONS] Leaderboard update failed after join: ${err.message}`);
    });

    return participant;
  }

  async leaveCompetition(competitionId: number, userId: number): Promise<void> {
    const comp = await this.getCompetitionById(competitionId);

    // Can only leave before start
    if (comp.status !== 'UPCOMING' && comp.status !== 'DRAFT') {
      throw new AppError(
        422,
        'CANNOT_LEAVE',
        `Cannot leave competition in "${comp.status}" status. Withdrawals are only allowed before start.`
      );
    }

    const participant = await this.competitionRepo.findParticipant(competitionId, userId);
    if (!participant || participant.status !== 'JOINED') {
      throw new AppError(404, 'NOT_PARTICIPATING', 'You are not an active participant in this competition');
    }

    // Creator cannot leave their own competition
    if (comp.creatorId === userId) {
      throw new AppError(422, 'CREATOR_CANNOT_LEAVE', 'Creator cannot leave the competition. You may cancel it instead.');
    }

    await this.competitionRepo.transaction(async (trx) => {
      await this.competitionRepo.updateParticipant(competitionId, userId, { status: 'LEFT' }, trx);
      await this.competitionRepo.createAuditLog(competitionId, 'LEFT', { userId }, userId, trx);
    });

    const newCount = await this.competitionRepo.countParticipants(competitionId);

    if (this.realtimeService) {
      this.realtimeService.emitCompetitionParticipantLeft?.({
        eventId: `leave-${Date.now()}`,
        competitionId,
        userId,
        username: participant.username || `User #${userId}`,
        participantCount: newCount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async listParticipants(competitionId: number): Promise<CompetitionParticipant[]> {
    await this.getCompetitionById(competitionId);
    return this.competitionRepo.listParticipants(competitionId);
  }

  // ==========================================================================
  // Competition Trading & Order Execution
  // ==========================================================================

  async submitOrder(
    competitionId: number,
    userId: number,
    input: CreateCompetitionOrderInput
  ): Promise<{ order: CompetitionOrder; trades: CompetitionTrade[] }> {
    const comp = await this.getCompetitionById(competitionId);

    // Guard 1: Competition must be ACTIVE
    if (comp.status !== 'ACTIVE') {
      throw new AppError(
        422,
        'COMPETITION_NOT_ACTIVE',
        `Competition is currently "${comp.status}". Trading is only permitted during ACTIVE competitions.`
      );
    }

    // Guard 2: User must be an active participant
    const participant = await this.competitionRepo.findParticipant(competitionId, userId);
    if (!participant || participant.status !== 'JOINED') {
      throw new AppError(403, 'NOT_ENROLLED', 'You are not an enrolled participant in this competition');
    }

    // Guard 3: Permitted order types check
    if (!comp.permittedOrderTypes.includes(input.orderType)) {
      throw new AppError(
        422,
        'ORDER_TYPE_NOT_PERMITTED',
        `Order type "${input.orderType}" is not permitted in this competition (Allowed: ${comp.permittedOrderTypes.join(', ')})`
      );
    }

    // Guard 4: Validate target instrument exists and is tradable
    const instrument = await this.instrumentRepo.findById(input.instrumentId);
    if (!instrument || instrument.marketStatus !== 'ACTIVE') {
      throw new AppError(
        422,
        'INSTRUMENT_NOT_TRADABLE',
        `Instrument #${input.instrumentId} is not active or tradable`
      );
    }

    // Guard 5: Allowed instruments check
    if (comp.allowedInstruments && comp.allowedInstruments.length > 0) {
      if (!comp.allowedInstruments.includes(instrument.symbol.toUpperCase())) {
        throw new AppError(
          422,
          'INSTRUMENT_NOT_ALLOWED',
          `Instrument ${instrument.symbol} is not permitted in this competition`
        );
      }
    }

    // Guard 6: Idempotency Replay Check
    if (input.idempotencyKey) {
      const existingOrder = await this.competitionRepo.findOrderByIdempotencyKey(
        competitionId,
        input.idempotencyKey
      );
      if (existingOrder) {
        return { order: existingOrder, trades: [] };
      }
    }

    // Compute reference and reservation price
    const quote = await this.marketDataRepo.getQuoteByInstrumentId(input.instrumentId);
    const lastPrice = quote?.lastPrice ? String(quote.lastPrice) : '100.0000';

    let reservationPrice = '0.0000';
    if (input.orderType === 'LIMIT') {
      reservationPrice = FinancialMath.toFixed(input.limitPrice!);
    } else {
      reservationPrice = lastPrice;
    }

    // Pre-Trade Risk Reservation (Phase 1 DB Transaction)
    const committedOrder = await this.competitionRepo.transaction(async (trx) => {
      if (input.side === 'BUY') {
        const requiredCash = FinancialMath.calcTradeAmount(reservationPrice, input.quantity);
        const account = await this.competitionRepo.getAccount(competitionId, userId, trx);
        if (!account) {
          throw new AppError(500, 'ACCOUNT_ERROR', 'Competition account not found');
        }

        if (FinancialMath.lt(account.availableCash, requiredCash)) {
          throw new AppError(
            422,
            'INSUFFICIENT_FUNDS',
            `Insufficient competition cash. Required: ₹${requiredCash}, Available: ₹${account.availableCash}`
          );
        }

        // Reserve cash
        const newAvailable = FinancialMath.sub(account.availableCash, requiredCash);
        const newReserved = FinancialMath.add(account.reservedCash, requiredCash);

        await this.competitionRepo.updateAccount(
          competitionId,
          userId,
          {
            available_cash: newAvailable,
            reserved_cash: newReserved,
          },
          trx
        );
      } else {
        // SELL: Reserve shares
        const position = await this.competitionRepo.getPosition(competitionId, userId, input.instrumentId, trx);
        const totalShares = position?.quantity || '0.0000';
        const reservedShares = position?.reservedQuantity || '0.0000';
        const uncommittedShares = FinancialMath.sub(totalShares, reservedShares);

        if (FinancialMath.lt(uncommittedShares, input.quantity)) {
          throw new AppError(
            422,
            'INSUFFICIENT_SHARES',
            `Insufficient uncommitted shares. Required: ${input.quantity}, Available: ${uncommittedShares}`
          );
        }

        // Reserve shares
        const newReserved = FinancialMath.add(reservedShares, input.quantity);
        await this.competitionRepo.upsertPosition(
          {
            competitionId,
            userId,
            instrumentId: input.instrumentId,
            quantity: totalShares,
            reservedQuantity: newReserved,
            averageEntryPrice: position?.averageEntryPrice || '0.0000',
            realizedPnl: position?.realizedPnL || '0.0000',
          },
          trx
        );
      }

      // Create Competition Order record in OPEN status
      return this.competitionRepo.createOrder(
        {
          competitionId,
          userId,
          instrumentId: input.instrumentId,
          side: input.side,
          orderType: input.orderType,
          quantity: input.quantity,
          limitPrice: input.orderType === 'LIMIT' ? reservationPrice : null,
          idempotencyKey: input.idempotencyKey || null,
        },
        trx
      );
    });

    // Match order using CompetitionMatchingService
    const matchResult = await this.matchingService.matchOrder(
      committedOrder,
      instrument.symbol,
      reservationPrice
    );

    // Update remaining order state in DB
    await this.competitionRepo.updateOrder(committedOrder.id, {
      filled_quantity: matchResult.remainingOrder.filledQuantity,
      remaining_quantity: matchResult.remainingOrder.remainingQuantity,
      status: matchResult.remainingOrder.status,
    });

    // Real-time broadcasts
    if (this.realtimeService) {
      this.realtimeService.emitCompetitionOrderPlaced?.({
        eventId: `ord-${Date.now()}`,
        competitionId,
        orderId: committedOrder.id,
        userId,
        instrumentId: input.instrumentId,
        side: input.side,
        orderType: input.orderType,
        price: input.limitPrice || null,
        quantity: input.quantity,
        timestamp: new Date().toISOString(),
      });

      for (const trade of matchResult.trades) {
        this.realtimeService.emitCompetitionTradeExecuted?.({
          eventId: `trd-${Date.now()}`,
          competitionId,
          tradeReference: trade.tradeReference,
          instrumentId: trade.instrumentId,
          symbol: instrument.symbol,
          price: trade.price,
          quantity: trade.quantity,
          buyerId: trade.buyerId,
          sellerId: trade.sellerId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Refresh Leaderboard
    this.leaderboardService.computeLeaderboard(competitionId).catch((err) => {
      logger.warn(`[COMPETITIONS] Leaderboard update failed post-match: ${err.message}`);
    });

    return {
      order: matchResult.remainingOrder,
      trades: matchResult.trades,
    };
  }

  async cancelOrder(
    competitionId: number,
    userId: number,
    orderId: number
  ): Promise<CompetitionOrder> {
    const comp = await this.getCompetitionById(competitionId);

    const order = await this.competitionRepo.getOrderById(orderId);
    if (!order || order.competitionId !== competitionId) {
      throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${orderId} not found in Competition #${competitionId}`);
    }

    if (order.userId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Cannot cancel an order belonging to another trader');
    }

    if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
      throw new AppError(422, 'CANNOT_CANCEL', `Order #${orderId} cannot be cancelled (Status: ${order.status})`);
    }

    // Release remaining reservation in DB transaction
    await this.competitionRepo.transaction(async (trx) => {
      if (order.side === 'BUY') {
        const orderPrice = order.limitPrice || '0.0000';
        const reservedSlice = FinancialMath.calcTradeAmount(orderPrice, order.remainingQuantity);
        const account = await this.competitionRepo.getAccount(competitionId, userId, trx);
        if (account) {
          const newReserved = FinancialMath.max(
            '0.0000',
            FinancialMath.sub(account.reservedCash, reservedSlice)
          );
          const newAvailable = FinancialMath.add(account.availableCash, reservedSlice);

          await this.competitionRepo.updateAccount(
            competitionId,
            userId,
            {
              available_cash: newAvailable,
              reserved_cash: newReserved,
            },
            trx
          );
        }
      } else {
        // SELL: Release reserved shares back to uncommitted
        const position = await this.competitionRepo.getPosition(competitionId, userId, order.instrumentId, trx);
        if (position) {
          const newReserved = FinancialMath.max(
            '0.0000',
            FinancialMath.sub(position.reservedQuantity, order.remainingQuantity)
          );

          await this.competitionRepo.upsertPosition(
            {
              competitionId,
              userId,
              instrumentId: order.instrumentId,
              quantity: position.quantity,
              reservedQuantity: newReserved,
              averageEntryPrice: position.averageEntryPrice,
              realizedPnl: position.realizedPnL,
            },
            trx
          );
        }
      }

      await this.competitionRepo.updateOrder(
        orderId,
        { status: 'CANCELLED' },
        trx
      );
    });

    const updated = await this.competitionRepo.getOrderById(orderId);
    return updated!;
  }

  // ==========================================================================
  // Portfolio & History
  // ==========================================================================

  async getPortfolio(
    competitionId: number,
    userId: number
  ): Promise<CompetitionPortfolioSummary> {
    const comp = await this.getCompetitionById(competitionId);
    const participant = await this.competitionRepo.findParticipant(competitionId, userId);
    if (!participant) {
      throw new AppError(404, 'NOT_ENROLLED', 'User is not a participant in this competition');
    }

    const account = await this.competitionRepo.getAccount(competitionId, userId);
    const availableCash = account?.availableCash || comp.startingCapital;
    const reservedCash = account?.reservedCash || '0.0000';

    const positions = await this.competitionRepo.listPositions(competitionId, userId);
    const openOrders = await this.competitionRepo.listOrders({
      competitionId,
      userId,
      status: 'OPEN',
    });

    let holdingsMarketValue = '0.0000';
    let totalRealizedPnL = '0.0000';
    let totalUnrealizedPnL = '0.0000';

    const enrichedPositions = [];
    for (const pos of positions) {
      const quote = await this.marketDataRepo.getQuoteByInstrumentId(pos.instrumentId);
      let currentPrice = quote?.lastPrice ? String(quote.lastPrice) : '0.0000';
      if (!FinancialMath.isPositive(currentPrice)) {
        currentPrice = pos.averageEntryPrice;
      }

      const marketVal = FinancialMath.calcTradeAmount(currentPrice, pos.quantity);
      holdingsMarketValue = FinancialMath.add(holdingsMarketValue, marketVal);

      const costBasis = FinancialMath.calcTradeAmount(pos.averageEntryPrice, pos.quantity);
      const unrealized = FinancialMath.sub(marketVal, costBasis);
      totalUnrealizedPnL = FinancialMath.add(totalUnrealizedPnL, unrealized);
      totalRealizedPnL = FinancialMath.add(totalRealizedPnL, pos.realizedPnL);

      enrichedPositions.push({
        ...pos,
        currentPrice,
        marketValue: marketVal,
        unrealizedPnL: unrealized,
      });
    }

    const totalCash = FinancialMath.add(availableCash, reservedCash);
    const totalPortfolioValue = FinancialMath.add(totalCash, holdingsMarketValue);

    const profitLoss = FinancialMath.sub(totalPortfolioValue, participant.startingCapital);
    const returnRatio = FinancialMath.isPositive(participant.startingCapital)
      ? FinancialMath.div(profitLoss, participant.startingCapital)
      : '0.0000';
    const totalReturnPercent = FinancialMath.mul(returnRatio, '100.0000');

    return {
      competitionId,
      userId,
      startingCapital: participant.startingCapital,
      availableCash,
      reservedCash,
      holdingsMarketValue,
      totalPortfolioValue,
      totalReturnPercent,
      realizedPnL: totalRealizedPnL,
      unrealizedPnL: totalUnrealizedPnL,
      tradeCount: participant.tradeCount,
      rank: participant.rank,
      positions: enrichedPositions,
      openOrders,
    };
  }

  async getLeaderboard(competitionId: number): Promise<CompetitionLeaderboardEntry[]> {
    const comp = await this.getCompetitionById(competitionId);
    if (comp.status === 'COMPLETED') {
      const snapshot = await this.competitionRepo.getLatestLeaderboardSnapshot(competitionId);
      if (snapshot && snapshot.length > 0) return snapshot;
    }
    return this.leaderboardService.computeLeaderboard(competitionId);
  }

  async getTrades(
    competitionId: number,
    options?: { limit?: number; userId?: number }
  ): Promise<CompetitionTrade[]> {
    await this.getCompetitionById(competitionId);
    return this.competitionRepo.listTrades(competitionId, options);
  }

  async getOrders(
    competitionId: number,
    userId?: number,
    limit?: number
  ): Promise<CompetitionOrder[]> {
    await this.getCompetitionById(competitionId);
    return this.competitionRepo.listOrders({
      competitionId,
      userId,
      limit: limit || 50,
    });
  }

  async cancelCompetition(
    competitionId: number,
    userId: number,
    reason?: string
  ): Promise<Competition> {
    const comp = await this.getCompetitionById(competitionId);
    if (comp.creatorId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Only the competition creator can cancel the competition');
    }

    if (comp.status === 'COMPLETED' || comp.status === 'CANCELLED') {
      throw new AppError(422, 'ALREADY_TERMINATED', `Competition is already ${comp.status}`);
    }

    const updated = await this.competitionRepo.transaction(async (trx) => {
      const c = await this.competitionRepo.updateCompetition(
        competitionId,
        { status: 'CANCELLED' },
        trx
      );
      await this.competitionRepo.createAuditLog(
        competitionId,
        'CANCELLED',
        { reason: reason || 'Cancelled by creator' },
        userId,
        trx
      );
      return c;
    });

    this.matchingService.clearCompetitionBooks(competitionId);

    if (this.realtimeService) {
      this.realtimeService.emitCompetitionCancelled?.({
        eventId: `cancel-${Date.now()}`,
        competitionId,
        name: comp.name,
        reason,
        timestamp: new Date().toISOString(),
      });
    }

    return updated;
  }
}
