import { Order, OrderBookLevel } from '@tradegrid/shared-types';
import { FinancialMath } from '../../utils/math';

/**
 * Limit Order Book (LOB) implementing strict Price-Time Priority (FIFO) using exact Decimal math.
 *
 * Rules:
 * 1. Bids (Buy orders) are prioritized by:
 *    - Highest Price (Descending)
 *    - Earliest Submission Time (Ascending ID / Timestamp)
 * 2. Asks (Sell orders) are prioritized by:
 *    - Lowest Price (Ascending)
 *    - Earliest Submission Time (Ascending ID / Timestamp)
 */
export class OrderBook {
  private bids: Order[] = [];
  private asks: Order[] = [];

  constructor(public readonly instrumentId: number, public readonly symbol: string) {}

  /**
   * Checks whether an order is already resting in the book.
   */
  hasOrder(orderId: number): boolean {
    return this.bids.some((o) => o.id === orderId) || this.asks.some((o) => o.id === orderId);
  }

  /**
   * Adds a resting order to the appropriate side of the book with price-time priority.
   */
  addOrder(order: Order): void {
    if (order.instrumentId !== this.instrumentId) {
      throw new Error(`Order instrument #${order.instrumentId} does not match book #${this.instrumentId}`);
    }

    // Do not insert zero or negative remaining quantity
    if (!FinancialMath.isPositive(order.remainingQuantity)) {
      return;
    }

    // Prevent duplicate insertion
    if (this.hasOrder(order.id)) {
      this.removeOrder(order.id);
    }

    if (order.side === 'BUY') {
      this.insertBid(order);
    } else {
      this.insertAsk(order);
    }
  }

  /**
   * Inserts a BUY order in descending price order, breaking ties by earliest timestamp/id.
   */
  private insertBid(order: Order): void {
    const price = order.limitPrice || '0';
    let idx = 0;
    while (idx < this.bids.length) {
      const existingPrice = this.bids[idx].limitPrice || '0';
      if (FinancialMath.gt(price, existingPrice)) {
        break;
      }
      if (FinancialMath.eq(price, existingPrice)) {
        // Equal price: earlier order stays first
        const orderTime = new Date(order.createdAt).getTime();
        const existingTime = new Date(this.bids[idx].createdAt).getTime();
        if (orderTime < existingTime || (orderTime === existingTime && order.id < this.bids[idx].id)) {
          break;
        }
      }
      idx++;
    }
    this.bids.splice(idx, 0, order);
  }

  /**
   * Inserts a SELL order in ascending price order, breaking ties by earliest timestamp/id.
   */
  private insertAsk(order: Order): void {
    const price = order.limitPrice || '0';
    let idx = 0;
    while (idx < this.asks.length) {
      const existingPrice = this.asks[idx].limitPrice || '0';
      if (FinancialMath.lt(price, existingPrice)) {
        break;
      }
      if (FinancialMath.eq(price, existingPrice)) {
        // Equal price: earlier order stays first
        const orderTime = new Date(order.createdAt).getTime();
        const existingTime = new Date(this.asks[idx].createdAt).getTime();
        if (orderTime < existingTime || (orderTime === existingTime && order.id < this.asks[idx].id)) {
          break;
        }
      }
      idx++;
    }
    this.asks.splice(idx, 0, order);
  }

  /**
   * Cancels and removes an order from the book by order ID.
   */
  removeOrder(orderId: number): Order | null {
    const bidIdx = this.bids.findIndex((o) => o.id === orderId);
    if (bidIdx !== -1) {
      return this.bids.splice(bidIdx, 1)[0];
    }
    const askIdx = this.asks.findIndex((o) => o.id === orderId);
    if (askIdx !== -1) {
      return this.asks.splice(askIdx, 1)[0];
    }
    return null;
  }

  /**
   * Returns the best (highest priced) bid, or null if book has no bids.
   */
  getBestBid(): Order | null {
    return this.bids.length > 0 ? this.bids[0] : null;
  }

  /**
   * Returns the best (lowest priced) ask, or null if book has no asks.
   */
  getBestAsk(): Order | null {
    return this.asks.length > 0 ? this.asks[0] : null;
  }

  /**
   * Peeks all resting bids in priority order.
   */
  getBids(): readonly Order[] {
    return this.bids;
  }

  /**
   * Peeks all resting asks in priority order.
   */
  getAsks(): readonly Order[] {
    return this.asks;
  }

  /**
   * Aggregates book depth into discrete price levels with exact decimal math.
   */
  getDepth(maxLevels: number = 10): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
    const aggregate = (orders: Order[]): OrderBookLevel[] => {
      const levelsMap = new Map<string, { quantity: string; count: number }>();
      for (const order of orders) {
        const p = FinancialMath.toFixed(order.limitPrice || '0');
        const q = FinancialMath.toFixed(order.remainingQuantity);
        const curr = levelsMap.get(p) || { quantity: '0.0000', count: 0 };
        curr.quantity = FinancialMath.add(curr.quantity, q);
        curr.count += 1;
        levelsMap.set(p, curr);
      }

      const levels: OrderBookLevel[] = [];
      let runningTotal = '0.0000';
      for (const [price, data] of levelsMap.entries()) {
        runningTotal = FinancialMath.add(runningTotal, data.quantity);
        levels.push({
          price,
          quantity: data.quantity,
          orderCount: data.count,
          total: runningTotal,
        });
        if (levels.length >= maxLevels) {
          break;
        }
      }
      return levels;
    };

    return {
      bids: aggregate(this.bids),
      asks: aggregate(this.asks),
    };
  }

  /**
   * Calculates top-of-book spread and mid-price using exact Decimal math.
   */
  getSpreadAndMid(): { spread: string; midPrice: string | null } {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();

    if (!bestBid || !bestAsk) {
      return { spread: '0.0000', midPrice: null };
    }

    const spread = FinancialMath.sub(bestAsk.limitPrice!, bestBid.limitPrice!);
    const midPrice = FinancialMath.div(
      FinancialMath.add(bestBid.limitPrice!, bestAsk.limitPrice!),
      '2.0000'
    );

    return { spread, midPrice };
  }

  /**
   * Clears all resting orders from the book.
   */
  clear(): void {
    this.bids = [];
    this.asks = [];
  }
}
