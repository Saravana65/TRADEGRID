import { logger } from '../../utils/logger';
import { IOrderRepository, orderRepository as defaultOrderRepo } from '../orders/order.repository';
import { IInstrumentRepository, instrumentRepository as defaultInstrumentRepo } from '../market/instrument.repository';
import { MatchingEngine, matchingEngine as defaultMatchingEngine } from './matching-engine';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../websocket/realtime.service';
import { FinancialMath } from '../../utils/math';

export interface RecoverySummary {
  totalRecovered: number;
  instrumentsCount: number;
}

export class OrderBookRecoveryService {
  constructor(
    private readonly orderRepo: IOrderRepository = defaultOrderRepo,
    private readonly instrumentRepo: IInstrumentRepository = defaultInstrumentRepo,
    private readonly matchingEngine: MatchingEngine = defaultMatchingEngine,
    private readonly realtimeService: IRealtimeService = defaultRealtimeService
  ) {}

  /**
   * Deterministically recovers all resting limit orders from persistent database storage
   * into the in-memory order books.
   *
   * Invariants:
   * 1. Only orders with status IN ('OPEN', 'PARTIALLY_FILLED') are recovered.
   * 2. Only LIMIT orders are recovered (market orders never rest).
   * 3. Only orders with remainingQuantity > 0.0000 are recovered.
   * 4. Orders are loaded in strict created_at ASC order to preserve FIFO priority.
   * 5. No duplicates: Book deduplication is enforced.
   * 6. Realtime service snapshot cache is refreshed.
   */
  async recoverAllBooks(): Promise<RecoverySummary> {
    logger.info('[RECOVERY] Initiating deterministic order book recovery from database...');

    try {
      const openOrders = await this.orderRepo.findOpenOrders();
      const eligibleOrders = openOrders.filter(
        (o) =>
          (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED') &&
          o.orderType === 'LIMIT' &&
          FinancialMath.isPositive(o.remainingQuantity)
      );

      const instrumentsMap = new Map<number, string>();
      let totalRecovered = 0;

      for (const order of eligibleOrders) {
        let symbol = order.symbol;
        if (!symbol) {
          if (!instrumentsMap.has(order.instrumentId)) {
            const inst = await this.instrumentRepo.findById(order.instrumentId);
            instrumentsMap.set(order.instrumentId, inst?.symbol || `INST-${order.instrumentId}`);
          }
          symbol = instrumentsMap.get(order.instrumentId)!;
        }

        const book = this.matchingEngine.getOrCreateBook(order.instrumentId, symbol);
        book.addOrder({
          ...order,
          symbol,
        });
        totalRecovered++;
      }

      // Refresh snapshots in realtime service
      for (const [instrumentId] of this.matchingEngine.getAllBooks().entries()) {
        const book = this.matchingEngine.getOrCreateBook(instrumentId);
        const depth = this.matchingEngine.getOrderBookDepth(instrumentId, 15, book.symbol);
        this.realtimeService.broadcastOrderBookUpdate(book.symbol, instrumentId, depth);
      }

      const instrumentsCount = this.matchingEngine.getAllBooks().size;
      logger.info(
        `[RECOVERY] Successfully recovered ${totalRecovered} resting orders across ${instrumentsCount} order books.`
      );

      return { totalRecovered, instrumentsCount };
    } catch (err: any) {
      logger.error(`[RECOVERY] Failed to recover order books from database: ${err.message}`);
      return { totalRecovered: 0, instrumentsCount: 0 };
    }
  }

  /**
   * Deterministically rebuilds a specific instrument's order book from database records.
   */
  async rebuildBookForInstrument(instrumentId: number): Promise<number> {
    const inst = await this.instrumentRepo.findById(instrumentId);
    const symbol = inst?.symbol || `INST-${instrumentId}`;

    const book = this.matchingEngine.getOrCreateBook(instrumentId, symbol);
    book.clear();

    const openOrders = await this.orderRepo.findOpenOrders({ instrumentId });
    const eligible = openOrders.filter(
      (o) =>
        (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED') &&
        o.orderType === 'LIMIT' &&
        FinancialMath.isPositive(o.remainingQuantity)
    );

    for (const order of eligible) {
      book.addOrder({ ...order, symbol });
    }

    const depth = this.matchingEngine.getOrderBookDepth(instrumentId, 15, symbol);
    this.realtimeService.broadcastOrderBookUpdate(symbol, instrumentId, depth);

    logger.info(`[RECOVERY] Rebuilt book for ${symbol} (#${instrumentId}): ${eligible.length} orders loaded.`);
    return eligible.length;
  }
}

export const orderBookRecoveryService = new OrderBookRecoveryService();
