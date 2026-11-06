import { PortfolioPosition, PortfolioSummaryResponse } from '@tradegrid/shared-types';
import { IPositionRepository, positionRepository as defaultPositionRepo } from './position.repository';
import { IWalletRepository, walletRepository as defaultWalletRepo } from '../wallet/wallet.repository';
import {
  IInstrumentRepository,
  instrumentRepository as defaultInstrumentRepo,
} from '../market/instrument.repository';
import {
  IMarketDataRepository,
  marketDataRepository as defaultMarketDataRepo,
} from '../market/market-data.repository';

export class PortfolioService {
  constructor(
    private readonly positionRepo: IPositionRepository = defaultPositionRepo,
    private readonly walletRepo: IWalletRepository = defaultWalletRepo,
    private readonly instrumentRepo: IInstrumentRepository = defaultInstrumentRepo,
    private readonly marketDataRepo: IMarketDataRepository = defaultMarketDataRepo
  ) {}

  /**
   * Calculates real-time portfolio holdings, average cost basis, unrealized P&L,
   * realized gains, and total net worth for an authenticated trader.
   */
  async getPortfolioSummary(userId: number): Promise<PortfolioSummaryResponse> {
    const wallet = await this.walletRepo.findByUserId(userId);
    const cashBalance = wallet?.available_balance || '0.0000';
    const cashNum = parseFloat(cashBalance);

    const positionRecords = await this.positionRepo.findByUserId(userId);

    const positions: PortfolioPosition[] = [];
    let totalInvestedNum = 0;
    let totalMarketValueNum = 0;
    let totalUnrealizedNum = 0;
    let totalRealizedNum = 0;

    for (const record of positionRecords) {
      const qtyNum = parseFloat(record.quantity);
      const avgBuyNum = parseFloat(record.average_buy_price);
      const realizedNum = parseFloat(record.realized_pnl);
      totalRealizedNum += realizedNum;

      // Only display positions with active quantity or historical activity
      if (qtyNum <= 0 && realizedNum === 0) {
        continue;
      }

      const instrument = await this.instrumentRepo.findById(record.instrument_id);
      const quote = await this.marketDataRepo.getQuoteByInstrumentId(record.instrument_id);

      const symbol = instrument?.symbol || `INST-${record.instrument_id}`;
      const name = instrument?.name || 'Unknown Instrument';
      const exchange = instrument?.exchange || 'TRADEGRID';
      const dataClassification = instrument?.dataClassification || 'SIMULATED';

      const currentPriceNum = quote ? parseFloat(quote.lastPrice) : avgBuyNum;
      const marketValueNum = qtyNum * currentPriceNum;
      const costBasisNum = qtyNum * avgBuyNum;
      const unrealizedNum = marketValueNum - costBasisNum;
      const returnPctNum = costBasisNum > 0 ? (unrealizedNum / costBasisNum) * 100 : 0;

      if (qtyNum > 0) {
        totalInvestedNum += costBasisNum;
        totalMarketValueNum += marketValueNum;
        totalUnrealizedNum += unrealizedNum;
      }

      positions.push({
        id: record.id,
        userId: record.user_id,
        instrumentId: record.instrument_id,
        symbol,
        name,
        exchange,
        dataClassification,
        quantity: record.quantity,
        averageBuyPrice: record.average_buy_price,
        currentPrice: currentPriceNum.toFixed(4),
        marketValue: marketValueNum.toFixed(4),
        unrealizedPnL: unrealizedNum.toFixed(4),
        returnPercent: returnPctNum.toFixed(2),
        realizedPnL: record.realized_pnl,
        updatedAt: record.updated_at ? new Date(record.updated_at).toISOString() : new Date().toISOString(),
      });
    }

    const totalPortfolioValue = (cashNum + totalMarketValueNum).toFixed(4);

    return {
      userId,
      cashBalance,
      totalInvested: totalInvestedNum.toFixed(4),
      totalPortfolioValue,
      totalUnrealizedPnL: totalUnrealizedNum.toFixed(4),
      totalRealizedPnL: totalRealizedNum.toFixed(4),
      positions,
      updatedAt: new Date().toISOString(),
    };
  }
}

export const portfolioService = new PortfolioService();
