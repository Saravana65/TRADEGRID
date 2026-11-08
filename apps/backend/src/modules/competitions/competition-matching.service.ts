import { OrderBook } from '../matching/order-book';
import { InstrumentMatchingQueue } from '../matching/matching-queue';
import { ICompetitionRepository } from './competition.types';
import { CompetitionOrder, CompetitionTrade } from '@tradegrid/shared-types';
import { FinancialMath } from '../../utils/math';
import { logger } from '../../utils/logger';
import { RealtimeService } from '../../websocket/realtime.service';

export interface CompetitionMatchResult {
  trades: CompetitionTrade[];
  remainingOrder: CompetitionOrder;
}

export class CompetitionMatchingService {
  // Scoped order books: map key = `${competitionId}:${instrumentId}`
  private books: Map<string, OrderBook> = new Map();
  private queue: InstrumentMatchingQueue;

  constructor(
    private competitionRepo: ICompetitionRepository,
    private realtimeService?: RealtimeService
  ) {
    this.queue = new InstrumentMatchingQueue();
  }

  private getBookKey(competitionId: number, instrumentId: number): string {
    return `${competitionId}:${instrumentId}`;
  }

  private getOrCreateBook(competitionId: number, instrumentId: number, symbol: string): OrderBook {
    const key = this.getBookKey(competitionId, instrumentId);
    let book = this.books.get(key);
    if (!book) {
      book = new OrderBook(instrumentId, symbol);
      this.books.set(key, book);
    }
    return book;
  }

  /**
   * Clears order books for a completed or cancelled competition
   */
  clearCompetitionBooks(competitionId: number): void {
    const prefix = `${competitionId}:`;
    for (const key of Array.from(this.books.keys())) {
      if (key.startsWith(prefix)) {
        this.books.delete(key);
      }
    }
  }

  /**
   * Matches an incoming competition order against resting competition orders.
   * Serialized per competition & instrument to guarantee deterministic FIFO execution.
   */
  async matchOrder(
    order: CompetitionOrder,
    symbol: string,
    reservationPrice: string
  ): Promise<CompetitionMatchResult> {
    const key = this.getBookKey(order.competitionId, order.instrumentId);

    // Route matching sequentially per competition book
    return this.queue.enqueue(order.instrumentId, async () => {
      const book = this.getOrCreateBook(order.competitionId, order.instrumentId, symbol);
      const trades: CompetitionTrade[] = [];

      let currentRemaining = order.remainingQuantity;

      if (
        !FinancialMath.isPositive(currentRemaining) ||
        (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED')
      ) {
        return { trades, remainingOrder: order };
      }

      // Convert order to compatible format for OrderBook
      const takerOrder: any = {
        id: order.id,
        userId: order.userId,
        instrumentId: order.instrumentId,
        symbol,
        side: order.side,
        orderType: order.orderType,
        quantity: order.quantity,
        filledQuantity: order.filledQuantity,
        remainingQuantity: currentRemaining,
        limitPrice: order.limitPrice,
        status: order.status,
        createdAt: order.createdAt,
      };

      if (order.side === 'BUY') {
        // Match against resting SELL asks (lowest price first)
        while (FinancialMath.isPositive(currentRemaining)) {
          const bestAsk = book.getBestAsk();
          if (!bestAsk) break;

          // Price guard for LIMIT BUY
          if (order.orderType === 'LIMIT') {
            if (FinancialMath.gt(bestAsk.limitPrice || '0', order.limitPrice || '0')) {
              break;
            }
          }

          // Self-trading prevention guard
          if (bestAsk.userId === order.userId) {
            logger.warn(
              `[COMPETITION MATCHING] Wash trade prevented in Comp #${order.competitionId} for User #${order.userId}`
            );
            break;
          }

          const executionPrice = bestAsk.limitPrice!;
          const matchQuantity = FinancialMath.min(currentRemaining, bestAsk.remainingQuantity);

          if (!FinancialMath.isPositive(matchQuantity)) break;

          // Settle the trade atomically
          const trade = await this.settleCompetitionTrade({
            competitionId: order.competitionId,
            buyOrderId: order.id,
            sellOrderId: bestAsk.id,
            buyerId: order.userId,
            sellerId: bestAsk.userId,
            instrumentId: order.instrumentId,
            symbol,
            price: executionPrice,
            quantity: matchQuantity,
            buyerReservationPrice: reservationPrice,
          });

          trades.push(trade);

          // Update book
          bestAsk.remainingQuantity = FinancialMath.sub(bestAsk.remainingQuantity, matchQuantity);
          (bestAsk as any).filledQuantity = FinancialMath.add((bestAsk as any).filledQuantity || '0', matchQuantity);

          if (FinancialMath.isZero(bestAsk.remainingQuantity)) {
            bestAsk.status = 'FILLED';
            book.removeOrder(bestAsk.id);
          } else {
            bestAsk.status = 'PARTIALLY_FILLED';
          }

          currentRemaining = FinancialMath.sub(currentRemaining, matchQuantity);
          takerOrder.remainingQuantity = currentRemaining;
          takerOrder.filledQuantity = FinancialMath.add(takerOrder.filledQuantity, matchQuantity);
        }
      } else {
        // Incoming SELL order: matches resting BUY bids (highest price first)
        while (FinancialMath.isPositive(currentRemaining)) {
          const bestBid = book.getBestBid();
          if (!bestBid) break;

          // Price guard for LIMIT SELL
          if (order.orderType === 'LIMIT') {
            if (FinancialMath.lt(bestBid.limitPrice || '0', order.limitPrice || '0')) {
              break;
            }
          }

          // Self-trading prevention guard
          if (bestBid.userId === order.userId) {
            logger.warn(
              `[COMPETITION MATCHING] Wash trade prevented in Comp #${order.competitionId} for User #${order.userId}`
            );
            break;
          }

          const executionPrice = bestBid.limitPrice!;
          const matchQuantity = FinancialMath.min(currentRemaining, bestBid.remainingQuantity);

          if (!FinancialMath.isPositive(matchQuantity)) break;

          // Settle the trade atomically
          const trade = await this.settleCompetitionTrade({
            competitionId: order.competitionId,
            buyOrderId: bestBid.id,
            sellOrderId: order.id,
            buyerId: bestBid.userId,
            sellerId: order.userId,
            instrumentId: order.instrumentId,
            symbol,
            price: executionPrice,
            quantity: matchQuantity,
            buyerReservationPrice: bestBid.limitPrice || executionPrice,
          });

          trades.push(trade);

          // Update book
          bestBid.remainingQuantity = FinancialMath.sub(bestBid.remainingQuantity, matchQuantity);
          (bestBid as any).filledQuantity = FinancialMath.add((bestBid as any).filledQuantity || '0', matchQuantity);

          if (FinancialMath.isZero(bestBid.remainingQuantity)) {
            bestBid.status = 'FILLED';
            book.removeOrder(bestBid.id);
          } else {
            bestBid.status = 'PARTIALLY_FILLED';
          }

          currentRemaining = FinancialMath.sub(currentRemaining, matchQuantity);
          takerOrder.remainingQuantity = currentRemaining;
          takerOrder.filledQuantity = FinancialMath.add(takerOrder.filledQuantity, matchQuantity);
        }
      }

      // If unfilled quantity remains on a LIMIT order, rest on the book
      if (FinancialMath.isPositive(currentRemaining)) {
        if (order.orderType === 'LIMIT') {
          takerOrder.status = trades.length > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
          book.addOrder(takerOrder);
        } else {
          // Unfilled market orders cancel
          takerOrder.status = trades.length > 0 ? 'PARTIALLY_FILLED' : 'CANCELLED';
        }
      } else {
        takerOrder.status = 'FILLED';
      }

      return {
        trades,
        remainingOrder: {
          ...order,
          filledQuantity: takerOrder.filledQuantity,
          remainingQuantity: takerOrder.remainingQuantity,
          status: takerOrder.status,
        },
      };
    });
  }

  /**
   * Atomically settles a competition trade across buyer & seller competition accounts and positions.
   */
  private async settleCompetitionTrade(params: {
    competitionId: number;
    buyOrderId: number;
    sellOrderId: number;
    buyerId: number;
    sellerId: number;
    instrumentId: number;
    symbol: string;
    price: string;
    quantity: string;
    buyerReservationPrice: string;
  }): Promise<CompetitionTrade> {
    const tradeAmount = FinancialMath.calcTradeAmount(params.price, params.quantity);
    const tradeRef = `CMPTRD-${params.competitionId}-${params.instrumentId}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 7)}`;

    return this.competitionRepo.transaction(async (trx) => {
      // 1. Settle Buyer's Competition Cash & Holdings
      const buyerAccount = await this.competitionRepo.getAccount(
        params.competitionId,
        params.buyerId,
        trx
      );
      if (!buyerAccount) {
        throw new Error(`Buyer account not found for User #${params.buyerId} in Comp #${params.competitionId}`);
      }

      // Compute how much cash was reserved for this slice
      const reservedSlice = FinancialMath.calcTradeAmount(
        params.buyerReservationPrice,
        params.quantity
      );
      // New reserved cash = max(0, reserved_cash - reservedSlice)
      const newBuyerReserved = FinancialMath.max(
        '0.0000',
        FinancialMath.sub(buyerAccount.reservedCash, reservedSlice)
      );

      // If execution price < reservation price, refund difference to available_cash
      let newBuyerAvailable = buyerAccount.availableCash;
      if (FinancialMath.gt(reservedSlice, tradeAmount)) {
        const refund = FinancialMath.sub(reservedSlice, tradeAmount);
        newBuyerAvailable = FinancialMath.add(buyerAccount.availableCash, refund);
      } else if (FinancialMath.lt(reservedSlice, tradeAmount)) {
        // Market order slippage: deduct excess from available cash
        const excess = FinancialMath.sub(tradeAmount, reservedSlice);
        newBuyerAvailable = FinancialMath.sub(buyerAccount.availableCash, excess);
      }

      await this.competitionRepo.updateAccount(
        params.competitionId,
        params.buyerId,
        {
          available_cash: newBuyerAvailable,
          reserved_cash: newBuyerReserved,
        },
        trx
      );

      // Buyer Position: Add quantity and compute weighted average entry price
      const buyerPosition = await this.competitionRepo.getPosition(
        params.competitionId,
        params.buyerId,
        params.instrumentId,
        trx
      );

      const oldBuyerQty = buyerPosition?.quantity || '0.0000';
      const oldBuyerAvg = buyerPosition?.averageEntryPrice || '0.0000';
      const newBuyerQty = FinancialMath.add(oldBuyerQty, params.quantity);

      const oldBuyerCost = FinancialMath.calcTradeAmount(oldBuyerAvg, oldBuyerQty);
      const newTotalCost = FinancialMath.add(oldBuyerCost, tradeAmount);
      const newBuyerAvgPrice = FinancialMath.isPositive(newBuyerQty)
        ? FinancialMath.div(newTotalCost, newBuyerQty)
        : '0.0000';

      await this.competitionRepo.upsertPosition(
        {
          competitionId: params.competitionId,
          userId: params.buyerId,
          instrumentId: params.instrumentId,
          quantity: newBuyerQty,
          averageEntryPrice: newBuyerAvgPrice,
          realizedPnl: buyerPosition?.realizedPnL || '0.0000',
        },
        trx
      );

      // 2. Settle Seller's Competition Cash & Holdings
      const sellerAccount = await this.competitionRepo.getAccount(
        params.competitionId,
        params.sellerId,
        trx
      );
      if (!sellerAccount) {
        throw new Error(`Seller account not found for User #${params.sellerId} in Comp #${params.competitionId}`);
      }

      // Seller receives cash
      const newSellerAvailable = FinancialMath.add(sellerAccount.availableCash, tradeAmount);
      await this.competitionRepo.updateAccount(
        params.competitionId,
        params.sellerId,
        {
          available_cash: newSellerAvailable,
        },
        trx
      );

      // Seller Position: Deduct shares from both reserved_quantity and quantity, compute realized P&L
      const sellerPosition = await this.competitionRepo.getPosition(
        params.competitionId,
        params.sellerId,
        params.instrumentId,
        trx
      );

      if (!sellerPosition) {
        throw new Error(`Seller position not found for User #${params.sellerId} in Comp #${params.competitionId}`);
      }

      const newSellerQty = FinancialMath.sub(sellerPosition.quantity, params.quantity);
      const newSellerReserved = FinancialMath.max(
        '0.0000',
        FinancialMath.sub(sellerPosition.reservedQuantity, params.quantity)
      );

      // Realized P&L = (executionPrice - averageEntryPrice) * quantity
      const priceDiff = FinancialMath.sub(params.price, sellerPosition.averageEntryPrice);
      const realizedGain = FinancialMath.mul(priceDiff, params.quantity);
      const newSellerRealizedPnL = FinancialMath.add(sellerPosition.realizedPnL, realizedGain);

      await this.competitionRepo.upsertPosition(
        {
          competitionId: params.competitionId,
          userId: params.sellerId,
          instrumentId: params.instrumentId,
          quantity: newSellerQty,
          reservedQuantity: newSellerReserved,
          averageEntryPrice: sellerPosition.averageEntryPrice,
          realizedPnl: newSellerRealizedPnL,
        },
        trx
      );

      // 3. Update Competition Orders
      const buyOrder = await this.competitionRepo.getOrderById(params.buyOrderId, trx);
      if (buyOrder) {
        const newFilled = FinancialMath.add(buyOrder.filledQuantity, params.quantity);
        const newRemaining = FinancialMath.sub(buyOrder.remainingQuantity, params.quantity);
        const status = FinancialMath.isZero(newRemaining) ? 'FILLED' : 'PARTIALLY_FILLED';
        await this.competitionRepo.updateOrder(
          buyOrder.id,
          {
            filled_quantity: newFilled,
            remaining_quantity: newRemaining,
            status,
          },
          trx
        );
      }

      const sellOrder = await this.competitionRepo.getOrderById(params.sellOrderId, trx);
      if (sellOrder) {
        const newFilled = FinancialMath.add(sellOrder.filledQuantity, params.quantity);
        const newRemaining = FinancialMath.sub(sellOrder.remainingQuantity, params.quantity);
        const status = FinancialMath.isZero(newRemaining) ? 'FILLED' : 'PARTIALLY_FILLED';
        await this.competitionRepo.updateOrder(
          sellOrder.id,
          {
            filled_quantity: newFilled,
            remaining_quantity: newRemaining,
            status,
          },
          trx
        );
      }

      // 4. Update Participant Trade Counts
      const buyerParticipant = await this.competitionRepo.findParticipant(
        params.competitionId,
        params.buyerId,
        trx
      );
      if (buyerParticipant) {
        await this.competitionRepo.updateParticipant(
          params.competitionId,
          params.buyerId,
          { trade_count: buyerParticipant.tradeCount + 1 },
          trx
        );
      }

      const sellerParticipant = await this.competitionRepo.findParticipant(
        params.competitionId,
        params.sellerId,
        trx
      );
      if (sellerParticipant) {
        await this.competitionRepo.updateParticipant(
          params.competitionId,
          params.sellerId,
          { trade_count: sellerParticipant.tradeCount + 1 },
          trx
        );
      }

      // 5. Create Trade Record
      const trade = await this.competitionRepo.createTrade(
        {
          tradeReference: tradeRef,
          competitionId: params.competitionId,
          buyOrderId: params.buyOrderId,
          sellOrderId: params.sellOrderId,
          buyerId: params.buyerId,
          sellerId: params.sellerId,
          instrumentId: params.instrumentId,
          price: params.price,
          quantity: params.quantity,
          amount: tradeAmount,
        },
        trx
      );

      logger.info(
        `[COMPETITION SETTLEMENT] Trade #${trade.id} settled in Comp #${params.competitionId}: ${params.quantity} ${params.symbol} @ $${params.price}`
      );

      return trade;
    });
  }
}
