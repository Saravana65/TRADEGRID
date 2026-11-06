import { Trade, TradeFilterQuery } from '@tradegrid/shared-types';
import { TradeQueryInput } from '@tradegrid/validation';
import { AppError } from '../../middleware/error.middleware';
import { ITradeRepository, tradeRepository as defaultTradeRepo } from './trade.repository';
import {
  IInstrumentRepository,
  instrumentRepository as defaultInstrumentRepo,
} from '../market/instrument.repository';

export class TradeService {
  constructor(
    private readonly tradeRepo: ITradeRepository = defaultTradeRepo,
    private readonly instrumentRepo: IInstrumentRepository = defaultInstrumentRepo
  ) {}

  /**
   * Retrieves paginated trades executed by an authenticated user.
   */
  async getUserTrades(
    userId: number,
    query: Partial<TradeQueryInput> = {}
  ): Promise<{ items: Trade[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
    let instrumentId: number | undefined = query.instrumentId;

    if (query.symbol && !instrumentId) {
      const instrument = await this.instrumentRepo.findBySymbol(query.symbol);
      if (instrument) {
        instrumentId = instrument.id;
      }
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const filter: TradeFilterQuery = {
      instrumentId,
      startDate: query.startDate,
      endDate: query.endDate,
      page,
      limit,
    };

    const { trades, total } = await this.tradeRepo.findByUserId(userId, filter);

    const items: Trade[] = trades.map((t) => ({
      id: t.id,
      tradeReference: t.trade_reference,
      buyOrderId: t.buy_order_id,
      sellOrderId: t.sell_order_id,
      instrumentId: t.instrument_id,
      buyerId: t.buyer_id,
      sellerId: t.seller_id,
      price: t.price,
      quantity: t.quantity,
      tradeAmount: t.trade_amount,
      buyerFee: t.buyer_fee,
      sellerFee: t.seller_fee,
      status: t.status,
      settlementTransactionId: t.settlement_transaction_id,
      createdAt: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
    }));

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves recent public trade executions for a specific instrument.
   */
  async getRecentTrades(symbol: string, limit: number = 50): Promise<Trade[]> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol);
    if (!instrument) {
      throw new AppError(404, 'INSTRUMENT_NOT_FOUND', `Instrument '${symbol.toUpperCase()}' not found`);
    }

    const records = await this.tradeRepo.findByInstrumentId(instrument.id, limit);

    return records.map((t) => ({
      id: t.id,
      tradeReference: t.trade_reference,
      buyOrderId: t.buy_order_id,
      sellOrderId: t.sell_order_id,
      instrumentId: t.instrument_id,
      symbol: instrument.symbol,
      buyerId: t.buyer_id,
      sellerId: t.seller_id,
      price: t.price,
      quantity: t.quantity,
      tradeAmount: t.trade_amount,
      buyerFee: t.buyer_fee,
      sellerFee: t.seller_fee,
      status: t.status,
      settlementTransactionId: t.settlement_transaction_id,
      createdAt: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
    }));
  }

  /**
   * Retrieves single trade details by ID.
   */
  async getTradeById(tradeId: number, userId?: number): Promise<Trade> {
    const t = await this.tradeRepo.findById(tradeId);
    if (!t) {
      throw new AppError(404, 'TRADE_NOT_FOUND', `Trade #${tradeId} not found`);
    }

    if (userId && t.buyer_id !== userId && t.seller_id !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view this trade execution');
    }

    return {
      id: t.id,
      tradeReference: t.trade_reference,
      buyOrderId: t.buy_order_id,
      sellOrderId: t.sell_order_id,
      instrumentId: t.instrument_id,
      buyerId: t.buyer_id,
      sellerId: t.seller_id,
      price: t.price,
      quantity: t.quantity,
      tradeAmount: t.trade_amount,
      buyerFee: t.buyer_fee,
      sellerFee: t.seller_fee,
      status: t.status,
      settlementTransactionId: t.settlement_transaction_id,
      createdAt: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
    };
  }
}

export const tradeService = new TradeService();
