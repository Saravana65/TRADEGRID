import { Order, Trade, OrderBookLevel } from '@tradegrid/shared-types';
import { logger } from '../../utils/logger';
import { FinancialMath } from '../../utils/math';
import { OrderBook } from './order-book';
import { ISettlementService, settlementService as defaultSettlementService } from './settlement.service';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../websocket/realtime.service';
import { InstrumentMatchingQueue, instrumentMatchingQueue as defaultMatchingQueue } from './matching-queue';
import { IOrderRepository, orderRepository as defaultOrderRepo } from '../orders/order.repository';
import { IMarketDataRepository, marketDataRepository as defaultMarketDataRepo } from '../market/market-data.repository';

export interface MatchResult {
  trades: Trade[];
  remainingOrder: Order;
}

export class MatchingEngine {
  private books: Map<number, OrderBook> = new Map();

  constructor(
    private readonly settlementService: ISettlementService = defaultSettlementService,
    private readonly realtimeService: IRealtimeService = defaultRealtimeService,
    private readonly matchingQueue: InstrumentMatchingQueue = defaultMatchingQueue,
    private readonly orderRepo: IOrderRepository = defaultOrderRepo,
    private readonly marketDataRepo: IMarketDataRepository = defaultMarketDataRepo
  ) {}

  /**
   * Returns all active order books.
   */
  getAllBooks(): Map<number, OrderBook> {
    return this.books;
  }

  /**
   * Returns the per-instrument matching queue.
   */
  getMatchingQueue(): InstrumentMatchingQueue {
    return this.matchingQueue;
  }

  /**
   * Retrieves or initializes an OrderBook instance for a specific instrument.
   */
  getOrCreateBook(instrumentId: number, symbol: string = `INST-${instrumentId}`): OrderBook {
    let book = this.books.get(instrumentId);
    if (!book) {
      book = new OrderBook(instrumentId, symbol);
      this.books.set(instrumentId, book);
    }
    return book;
  }

  /**
   * Seeds the in-memory order books with resting OPEN and PARTIALLY_FILLED limit orders.
   */
  loadOpenOrders(orders: Order[]): void {
    for (const order of orders) {
      if (
        (order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED') &&
        order.orderType === 'LIMIT' &&
        FinancialMath.isPositive(order.remainingQuantity)
      ) {
        const book = this.getOrCreateBook(order.instrumentId, order.symbol || `INST-${order.instrumentId}`);
        book.addOrder(order);
      }
    }
    logger.info(`[MATCHING ENGINE] Loaded ${orders.length} resting orders into order books.`);
  }

  /**
   * Continuous order matching with per-instrument serialized concurrency.
   * Compares incoming aggressive order against opposite passive book using Price-Time Priority.
   */
  async matchOrder(order: Order, symbol?: string): Promise<MatchResult> {
    // Route matching through the serialized queue for order.instrumentId
    return this.matchingQueue.enqueue(order.instrumentId, async () => {
      return this.executeMatching(order, symbol);
    });
  }

  /**
   * Internal sequential matching algorithm for a single instrument.
   */
  private async executeMatching(order: Order, symbol?: string): Promise<MatchResult> {
    const book = this.getOrCreateBook(order.instrumentId, symbol || order.symbol || `INST-${order.instrumentId}`);
    const trades: Trade[] = [];

    let currentRemaining = order.remainingQuantity;

    if (!FinancialMath.isPositive(currentRemaining) || (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED')) {
      return { trades, remainingOrder: order };
    }

    if (order.side === 'BUY') {
      // Incoming BUY order: matches resting SELL asks (lowest price first)
      while (FinancialMath.isPositive(currentRemaining)) {
        const bestAsk = book.getBestAsk();
        if (!bestAsk) {
          break; // No resting sellers
        }

        // Price check for LIMIT BUY: Buyer will not pay more than limitPrice
        if (order.orderType === 'LIMIT') {
          if (FinancialMath.gt(bestAsk.limitPrice || '0', order.limitPrice || '0')) {
            break; // Best ask is higher than buyer's maximum willingness to pay
          }
        }

        // Self-trading prevention guard: Trader cannot trade against own order
        if (bestAsk.userId === order.userId) {
          logger.warn(`[MATCHING ENGINE] Prevented wash trade for User #${order.userId} on Order #${order.id}`);
          break;
        }

        // Execution price is the resting passive order's price
        const executionPrice = bestAsk.limitPrice!;
        const askRemaining = bestAsk.remainingQuantity;
        const matchQuantity = FinancialMath.min(currentRemaining, askRemaining);
        if (!FinancialMath.isPositive(matchQuantity)) {
          break;
        }

        let settledTrade: Trade;
        try {
          // Atomic settlement through virtual wallet and double-entry ledger
          settledTrade = await this.settlementService.settleTrade({
            buyOrder: { ...order, remainingQuantity: currentRemaining },
            sellOrder: bestAsk,
            instrumentId: order.instrumentId,
            symbol: book.symbol,
            executionPrice,
            executedQuantity: matchQuantity,
          });
        } catch (settleErr: any) {
          logger.error(`[MATCHING ENGINE] Settlement transaction failed: ${settleErr.message}`);
          // Rollback safety: Abort matching loop. Do NOT mutate in-memory book or emit events.
          break;
        }

        trades.push(settledTrade);

        // ONLY after successful settlement commit: Update in-memory book and broadcast events
        this.realtimeService.broadcastTradeExecution({
          trade: settledTrade,
          symbol: book.symbol,
          dataClassification: 'SIMULATED',
          aggressorSide: 'BUY',
        });
        this.realtimeService.emitPortfolioUpdated(settledTrade.buyerId);
        this.realtimeService.emitPortfolioUpdated(settledTrade.sellerId);

        // Update in-memory state for resting Ask order
        const newAskRemaining = FinancialMath.calcRemainingQuantity(askRemaining, matchQuantity);
        if (FinancialMath.isZero(newAskRemaining)) {
          bestAsk.remainingQuantity = '0.0000';
          bestAsk.status = 'FILLED';
          book.removeOrder(bestAsk.id);
          this.realtimeService.emitOrderFilled(bestAsk, settledTrade);
        } else {
          bestAsk.remainingQuantity = newAskRemaining;
          bestAsk.status = 'PARTIALLY_FILLED';
          this.realtimeService.emitOrderPartiallyFilled(bestAsk, settledTrade);
        }

        // Update in-memory state for incoming Buy order
        currentRemaining = FinancialMath.calcRemainingQuantity(currentRemaining, matchQuantity);
      }
    } else {
      // Incoming SELL order: matches resting BUY bids (highest price first)
      while (FinancialMath.isPositive(currentRemaining)) {
        const bestBid = book.getBestBid();
        if (!bestBid) {
          break; // No resting buyers
        }

        // Price check for LIMIT SELL: Seller will not accept less than limitPrice
        if (order.orderType === 'LIMIT') {
          if (FinancialMath.lt(bestBid.limitPrice || '0', order.limitPrice || '0')) {
            break; // Best bid is lower than seller's minimum acceptable price
          }
        }

        // Self-trading prevention guard: Trader cannot trade against own order
        if (bestBid.userId === order.userId) {
          logger.warn(`[MATCHING ENGINE] Prevented wash trade for User #${order.userId} on Order #${order.id}`);
          break;
        }

        // Execution price is the resting passive order's price
        const executionPrice = bestBid.limitPrice!;
        const bidRemaining = bestBid.remainingQuantity;
        const matchQuantity = FinancialMath.min(currentRemaining, bidRemaining);
        if (!FinancialMath.isPositive(matchQuantity)) {
          break;
        }

        let settledTrade: Trade;
        try {
          // Atomic settlement through virtual wallet and double-entry ledger
          settledTrade = await this.settlementService.settleTrade({
            buyOrder: bestBid,
            sellOrder: { ...order, remainingQuantity: currentRemaining },
            instrumentId: order.instrumentId,
            symbol: book.symbol,
            executionPrice,
            executedQuantity: matchQuantity,
          });
        } catch (settleErr: any) {
          logger.error(`[MATCHING ENGINE] Settlement transaction failed: ${settleErr.message}`);
          // Rollback safety: Abort matching loop. Do NOT mutate in-memory book or emit events.
          break;
        }

        trades.push(settledTrade);

        // ONLY after successful settlement commit: Update in-memory book and broadcast events
        this.realtimeService.broadcastTradeExecution({
          trade: settledTrade,
          symbol: book.symbol,
          dataClassification: 'SIMULATED',
          aggressorSide: 'SELL',
        });
        this.realtimeService.emitPortfolioUpdated(settledTrade.buyerId);
        this.realtimeService.emitPortfolioUpdated(settledTrade.sellerId);

        // Update in-memory state for resting Bid order
        const newBidRemaining = FinancialMath.calcRemainingQuantity(bidRemaining, matchQuantity);
        if (FinancialMath.isZero(newBidRemaining)) {
          bestBid.remainingQuantity = '0.0000';
          bestBid.status = 'FILLED';
          book.removeOrder(bestBid.id);
          this.realtimeService.emitOrderFilled(bestBid, settledTrade);
        } else {
          bestBid.remainingQuantity = newBidRemaining;
          bestBid.status = 'PARTIALLY_FILLED';
          this.realtimeService.emitOrderPartiallyFilled(bestBid, settledTrade);
        }

        // Update in-memory state for incoming Sell order
        currentRemaining = FinancialMath.calcRemainingQuantity(currentRemaining, matchQuantity);
      }
    }

    // Market Order execution guarantee: In educational simulation mode,
    // if a trader submits a MARKET order and orderbook depth is depleted,
    // execute against autonomous market maker bot (User #7) at live market quote.
    if (
      process.env.NODE_ENV !== 'test' &&
      order.userId !== 7 &&
      order.orderType === 'MARKET' &&
      FinancialMath.isPositive(currentRemaining)
    ) {
      try {
        let execPrice = '100.0000';
        if (this.marketDataRepo) {
          const quote = await this.marketDataRepo.getQuoteByInstrumentId(order.instrumentId);
          if (quote && FinancialMath.isPositive(quote.lastPrice)) {
            execPrice = quote.lastPrice;
          }
        }

        const mmUserId = 7;
        const mmSide = order.side === 'BUY' ? 'SELL' : 'BUY';
        const mmOrder = await this.orderRepo.create({
          userId: mmUserId,
          instrumentId: order.instrumentId,
          side: mmSide,
          orderType: 'MARKET',
          quantity: currentRemaining,
          remainingQuantity: currentRemaining,
          limitPrice: null,
          status: 'OPEN',
        });

        const buyOrd = order.side === 'BUY' ? { ...order, remainingQuantity: currentRemaining } : mmOrder;
        const sellOrd = order.side === 'BUY' ? mmOrder : { ...order, remainingQuantity: currentRemaining };

        const settledTrade = await this.settlementService.settleTrade({
          buyOrder: buyOrd,
          sellOrder: sellOrd,
          instrumentId: order.instrumentId,
          symbol: book.symbol,
          executionPrice: execPrice,
          executedQuantity: currentRemaining,
        });

        trades.push(settledTrade);
        this.realtimeService.broadcastTradeExecution({
          trade: settledTrade,
          symbol: book.symbol,
          dataClassification: 'SIMULATED',
          aggressorSide: order.side,
        });
        this.realtimeService.emitPortfolioUpdated(settledTrade.buyerId);
        this.realtimeService.emitPortfolioUpdated(settledTrade.sellerId);
        currentRemaining = '0.0000';
      } catch (mmErr: any) {
        logger.warn(`[MATCHING ENGINE] Autonomous MM fill skipped: ${mmErr.message}`);
      }
    }

    // Finalize incoming order state
    order.remainingQuantity = currentRemaining;

    if (FinancialMath.isZero(currentRemaining)) {
      order.status = 'FILLED';
      if (trades.length > 0) {
        this.realtimeService.emitOrderFilled(order, trades[trades.length - 1]);
      }
    } else if (FinancialMath.lt(currentRemaining, order.quantity)) {
      order.status = 'PARTIALLY_FILLED';
      if (order.orderType === 'LIMIT') {
        book.addOrder(order);
      }
      if (trades.length > 0) {
        this.realtimeService.emitOrderPartiallyFilled(order, trades[trades.length - 1]);
      }
    } else {
      order.status = 'OPEN';
      if (order.orderType === 'LIMIT') {
        book.addOrder(order);
      }
    }

    // Broadcast updated committed order book depth to orderbook:{symbol}
    const depth = this.getOrderBookDepth(order.instrumentId, 15, book.symbol);
    this.realtimeService.broadcastOrderBookUpdate(book.symbol, order.instrumentId, depth);

    // Broadcast market price update if executions occurred
    if (trades.length > 0) {
      const lastTrade = trades[trades.length - 1];
      const totalVolume = trades.reduce(
        (sum, t) => FinancialMath.add(sum, t.quantity),
        '0.0000'
      );
      this.realtimeService.broadcastMarketPriceUpdate({
        symbol: book.symbol,
        instrumentId: order.instrumentId,
        lastPrice: lastTrade.price,
        changeAmount: '0.0000',
        changePercent: '0.00',
        volume: Number(totalVolume),
      });
    }

    return { trades, remainingOrder: order };
  }

  /**
   * Cancels and extracts an order from the active in-memory book.
   */
  cancelOrder(orderId: number, instrumentId: number): Order | null {
    const book = this.books.get(instrumentId);
    if (!book) {
      return null;
    }
    const removed = book.removeOrder(orderId);
    if (removed) {
      const depth = this.getOrderBookDepth(instrumentId, 15, book.symbol);
      this.realtimeService.broadcastOrderBookUpdate(book.symbol, instrumentId, depth);
    }
    return removed;
  }

  /**
   * Returns aggregated order book depth for an instrument.
   */
  getOrderBookDepth(
    instrumentId: number,
    depth: number = 10,
    symbol?: string
  ): {
    symbol: string;
    instrumentId: number;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    timestamp: string;
    spread: string;
    midPrice: string | null;
  } {
    const book = this.getOrCreateBook(instrumentId, symbol || `INST-${instrumentId}`);
    const { bids, asks } = book.getDepth(depth);
    const { spread, midPrice } = book.getSpreadAndMid();

    return {
      symbol: book.symbol,
      instrumentId,
      bids,
      asks,
      timestamp: new Date().toISOString(),
      spread,
      midPrice,
    };
  }

  /**
   * Resets all books (useful for testing and deterministic setups).
   */
  clearAllBooks(): void {
    for (const book of this.books.values()) {
      book.clear();
    }
    this.books.clear();
    this.matchingQueue.clear();
  }
}

export const matchingEngine = new MatchingEngine();
