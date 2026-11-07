import { Order, Trade, OrderBookLevel } from '@tradegrid/shared-types';
import { logger } from '../../utils/logger';
import { OrderBook } from './order-book';
import { ISettlementService, settlementService as defaultSettlementService } from './settlement.service';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../websocket/realtime.service';

export interface MatchResult {
  trades: Trade[];
  remainingOrder: Order;
}

export class MatchingEngine {
  private books: Map<number, OrderBook> = new Map();

  constructor(
    private readonly settlementService: ISettlementService = defaultSettlementService,
    private readonly realtimeService: IRealtimeService = defaultRealtimeService
  ) {}

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
        parseFloat(order.remainingQuantity) > 0
      ) {
        const book = this.getOrCreateBook(order.instrumentId, order.symbol || `INST-${order.instrumentId}`);
        book.addOrder(order);
      }
    }
    logger.info(`[MATCHING ENGINE] Loaded ${orders.length} resting orders into order books.`);
  }

  /**
   * Core continuous matching algorithm.
   * Compares incoming aggressive order against opposite passive book using Price-Time Priority.
   */
  async matchOrder(order: Order, symbol?: string): Promise<MatchResult> {
    const book = this.getOrCreateBook(order.instrumentId, symbol || order.symbol || `INST-${order.instrumentId}`);
    const trades: Trade[] = [];

    let currentRemaining = parseFloat(order.remainingQuantity);

    if (currentRemaining <= 0 || (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED')) {
      return { trades, remainingOrder: order };
    }

    if (order.side === 'BUY') {
      // Incoming BUY order: matches resting SELL asks (lowest price first)
      while (currentRemaining > 0.0001) {
        const bestAsk = book.getBestAsk();
        if (!bestAsk) {
          break; // No resting sellers
        }

        // Price check for LIMIT BUY: Buyer will not pay more than limitPrice
        if (order.orderType === 'LIMIT') {
          const buyerLimit = parseFloat(order.limitPrice || '0');
          const sellerLimit = parseFloat(bestAsk.limitPrice || '0');
          if (sellerLimit > buyerLimit) {
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
        const askRemaining = parseFloat(bestAsk.remainingQuantity);
        const matchQuantity = Math.min(currentRemaining, askRemaining);
        if (matchQuantity <= 0.0001) {
          break;
        }
        const matchQuantityStr = matchQuantity.toFixed(4);

        // Atomic settlement through virtual wallet and double-entry ledger
        const settledTrade = await this.settlementService.settleTrade({
          buyOrder: { ...order, remainingQuantity: currentRemaining.toFixed(4) },
          sellOrder: bestAsk,
          instrumentId: order.instrumentId,
          symbol: book.symbol,
          executionPrice,
          executedQuantity: matchQuantityStr,
        });

        trades.push(settledTrade);

        // Phase 5A: Broadcast trade and counterparty updates
        this.realtimeService.broadcastTradeExecution({
          trade: settledTrade,
          symbol: book.symbol,
          dataClassification: 'SIMULATED',
          aggressorSide: 'BUY',
        });
        this.realtimeService.emitPortfolioUpdated(settledTrade.buyerId);
        this.realtimeService.emitPortfolioUpdated(settledTrade.sellerId);

        // Update in-memory state for resting Ask order
        const newAskRemaining = parseFloat((askRemaining - matchQuantity).toFixed(4));
        if (newAskRemaining <= 0.0001) {
          bestAsk.remainingQuantity = '0.0000';
          bestAsk.status = 'FILLED';
          book.removeOrder(bestAsk.id);
          this.realtimeService.emitOrderFilled(bestAsk, settledTrade);
        } else {
          bestAsk.remainingQuantity = newAskRemaining.toFixed(4);
          bestAsk.status = 'PARTIALLY_FILLED';
          this.realtimeService.emitOrderPartiallyFilled(bestAsk, settledTrade);
        }

        // Update in-memory state for incoming Buy order
        currentRemaining = parseFloat((currentRemaining - matchQuantity).toFixed(4));
      }
    } else {
      // Incoming SELL order: matches resting BUY bids (highest price first)
      while (currentRemaining > 0.0001) {
        const bestBid = book.getBestBid();
        if (!bestBid) {
          break; // No resting buyers
        }

        // Price check for LIMIT SELL: Seller will not accept less than limitPrice
        if (order.orderType === 'LIMIT') {
          const sellerLimit = parseFloat(order.limitPrice || '0');
          const buyerLimit = parseFloat(bestBid.limitPrice || '0');
          if (buyerLimit < sellerLimit) {
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
        const bidRemaining = parseFloat(bestBid.remainingQuantity);
        const matchQuantity = Math.min(currentRemaining, bidRemaining);
        if (matchQuantity <= 0.0001) {
          break;
        }
        const matchQuantityStr = matchQuantity.toFixed(4);

        // Atomic settlement through virtual wallet and double-entry ledger
        const settledTrade = await this.settlementService.settleTrade({
          buyOrder: bestBid,
          sellOrder: { ...order, remainingQuantity: currentRemaining.toFixed(4) },
          instrumentId: order.instrumentId,
          symbol: book.symbol,
          executionPrice,
          executedQuantity: matchQuantityStr,
        });

        trades.push(settledTrade);

        // Phase 5A: Broadcast trade and counterparty updates
        this.realtimeService.broadcastTradeExecution({
          trade: settledTrade,
          symbol: book.symbol,
          dataClassification: 'SIMULATED',
          aggressorSide: 'SELL',
        });
        this.realtimeService.emitPortfolioUpdated(settledTrade.buyerId);
        this.realtimeService.emitPortfolioUpdated(settledTrade.sellerId);

        // Update in-memory state for resting Bid order
        const newBidRemaining = parseFloat((bidRemaining - matchQuantity).toFixed(4));
        if (newBidRemaining <= 0.0001) {
          bestBid.remainingQuantity = '0.0000';
          bestBid.status = 'FILLED';
          book.removeOrder(bestBid.id);
          this.realtimeService.emitOrderFilled(bestBid, settledTrade);
        } else {
          bestBid.remainingQuantity = newBidRemaining.toFixed(4);
          bestBid.status = 'PARTIALLY_FILLED';
          this.realtimeService.emitOrderPartiallyFilled(bestBid, settledTrade);
        }

        // Update in-memory state for incoming Sell order
        currentRemaining = parseFloat((currentRemaining - matchQuantity).toFixed(4));
      }
    }

    // Finalize incoming order state
    const remainingQtyFormatted = Math.max(0, currentRemaining).toFixed(4);
    order.remainingQuantity = remainingQtyFormatted;

    if (parseFloat(remainingQtyFormatted) === 0) {
      order.status = 'FILLED';
      if (trades.length > 0) {
        this.realtimeService.emitOrderFilled(order, trades[trades.length - 1]);
      }
    } else if (parseFloat(remainingQtyFormatted) < parseFloat(order.quantity)) {
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

    // Phase 5A: Broadcast updated committed order book depth to orderbook:{symbol}
    const depth = this.getOrderBookDepth(order.instrumentId, 15, book.symbol);
    this.realtimeService.broadcastOrderBookUpdate(book.symbol, order.instrumentId, depth);

    // Phase 5A: Broadcast market price update if executions occurred
    if (trades.length > 0) {
      const lastTrade = trades[trades.length - 1];
      const totalVolume = trades.reduce((sum, t) => sum + parseFloat(t.quantity), 0);
      this.realtimeService.broadcastMarketPriceUpdate({
        symbol: book.symbol,
        instrumentId: order.instrumentId,
        lastPrice: lastTrade.price,
        changeAmount: '0.0000',
        changePercent: '0.00',
        volume: totalVolume,
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
      // Phase 5A: Broadcast updated order book depth after order cancellation
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
  ): { symbol: string; instrumentId: number; bids: OrderBookLevel[]; asks: OrderBookLevel[]; timestamp: string; spread: string; midPrice: string | null } {
    const book = this.getOrCreateBook(instrumentId, symbol || `INST-${instrumentId}`);
    const { bids, asks } = book.getDepth(depth);
    const bestBid = book.getBestBid();
    const bestAsk = book.getBestAsk();
    let spread = '0.0000';
    let midPrice: string | null = null;
    if (bestBid && bestAsk && bestBid.limitPrice && bestAsk.limitPrice) {
      const bidP = parseFloat(bestBid.limitPrice);
      const askP = parseFloat(bestAsk.limitPrice);
      spread = Math.max(0, askP - bidP).toFixed(4);
      midPrice = ((askP + bidP) / 2).toFixed(4);
    }
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
  }
}

export const matchingEngine = new MatchingEngine();
