import { Order, OrderBookLevel } from '@tradegrid/shared-types';

/**
 * Limit Order Book (LOB) implementing strict Price-Time Priority (FIFO).
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
   * Adds a resting order to the appropriate side of the book with price-time priority.
   */
  addOrder(order: Order): void {
    if (order.instrumentId !== this.instrumentId) {
      throw new Error(`Order instrument #${order.instrumentId} does not match book #${this.instrumentId}`);
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
    const price = parseFloat(order.limitPrice || '0');
    let idx = 0;
    while (idx < this.bids.length) {
      const existingPrice = parseFloat(this.bids[idx].limitPrice || '0');
      if (price > existingPrice) {
        break;
      }
      if (price === existingPrice) {
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
    const price = parseFloat(order.limitPrice || '0');
    let idx = 0;
    while (idx < this.asks.length) {
      const existingPrice = parseFloat(this.asks[idx].limitPrice || '0');
      if (price < existingPrice) {
        break;
      }
      if (price === existingPrice) {
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
   * Aggregates book depth into discrete price levels for visualization and API consumers.
   */
  getDepth(maxLevels: number = 10): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
    const aggregate = (orders: Order[]): OrderBookLevel[] => {
      const levelsMap = new Map<string, { quantity: number; count: number }>();
      for (const order of orders) {
        const p = parseFloat(order.limitPrice || '0').toFixed(4);
        const q = parseFloat(order.remainingQuantity);
        const curr = levelsMap.get(p) || { quantity: 0, count: 0 };
        curr.quantity += q;
        curr.count += 1;
        levelsMap.set(p, curr);
      }

      const levels: OrderBookLevel[] = [];
      let runningTotal = 0;
      for (const [price, data] of levelsMap.entries()) {
        runningTotal += data.quantity;
        levels.push({
          price,
          quantity: data.quantity.toFixed(4),
          orderCount: data.count,
          total: runningTotal.toFixed(4),
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
   * Clears all bids and asks from the book.
   */
  clear(): void {
    this.bids = [];
    this.asks = [];
  }
}
