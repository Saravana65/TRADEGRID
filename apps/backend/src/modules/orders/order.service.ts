import { Knex } from 'knex';
import { db } from '../../database/connection';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/error.middleware';
import { Order, OrderFilterQuery } from '@tradegrid/shared-types';
import { CreateOrderInput } from '@tradegrid/validation';
import { FinancialMath } from '../../utils/math';
import { IOrderRepository, orderRepository as defaultOrderRepo } from './order.repository';
import { IInstrumentRepository, instrumentRepository as defaultInstrumentRepo } from '../market/instrument.repository';
import {
  IMarketDataRepository,
  marketDataRepository as defaultMarketDataRepo,
} from '../market/market-data.repository';
import {
  IOrderReservationService,
  orderReservationService as defaultReservationService,
} from './order-reservation.service';
import { MatchingEngine, matchingEngine as defaultMatchingEngine } from '../matching/matching-engine';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../websocket/realtime.service';

export class OrderService {
  private readonly matchingEngine: MatchingEngine;
  private readonly knexInstance: Knex;
  private readonly realtimeService: IRealtimeService;

  constructor(
    private readonly orderRepo: IOrderRepository = defaultOrderRepo,
    private readonly instrumentRepo: IInstrumentRepository = defaultInstrumentRepo,
    private readonly marketDataRepo: IMarketDataRepository = defaultMarketDataRepo,
    private readonly reservationService: IOrderReservationService = defaultReservationService,
    matchingEngineOrKnex?: MatchingEngine | Knex,
    knexParam?: Knex,
    realtimeServiceParam?: IRealtimeService
  ) {
    this.realtimeService = realtimeServiceParam || defaultRealtimeService;
    if (matchingEngineOrKnex && typeof (matchingEngineOrKnex as any).matchOrder === 'function') {
      this.matchingEngine = matchingEngineOrKnex as MatchingEngine;
      this.knexInstance = knexParam || db;
    } else if (matchingEngineOrKnex) {
      this.matchingEngine = defaultMatchingEngine;
      this.knexInstance = matchingEngineOrKnex as Knex;
    } else {
      this.matchingEngine = defaultMatchingEngine;
      this.knexInstance = db;
    }
  }

  private async withTransaction<T>(
    trx: Knex.Transaction | undefined,
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    if (trx) {
      return callback(trx);
    }
    return this.knexInstance.transaction(async (newTrx) => {
      return callback(newTrx);
    });
  }

  /**
   * Accepts and processes an order submission with strict transaction separation:
   * 1. Validates risk & purchasing power/shares.
   * 2. Commits the order as OPEN into database storage (Phase 1 Commit).
   * 3. Emits order:accepted ONLY post-commit.
   * 4. Enqueues the committed order into the per-instrument matching queue (Phase 2).
   */
  async createOrder(
    userId: number,
    input: CreateOrderInput,
    trx?: Knex.Transaction
  ): Promise<Order> {
    // 1. Idempotency Check
    if (input.idempotencyKey) {
      const existing = await this.orderRepo.findByIdempotencyKey(input.idempotencyKey, trx);
      if (existing) {
        logger.info(
          `[OMS] Idempotent order replay detected for key: ${input.idempotencyKey} (Order #${existing.id})`
        );
        return existing;
      }
    }

    // 2. Validate Target Instrument Exists and is Tradable
    const instrument = await this.instrumentRepo.findById(input.instrumentId);
    if (!instrument) {
      throw new AppError(
        404,
        'INSTRUMENT_NOT_FOUND',
        `Instrument with ID #${input.instrumentId} not found`
      );
    }

    if (instrument.marketStatus !== 'ACTIVE') {
      throw new AppError(
        422,
        'INSTRUMENT_NOT_TRADABLE',
        `Instrument ${instrument.symbol} is not currently tradable (Market status: ${instrument.marketStatus})`
      );
    }

    // 3. Validate Quantity with exact Decimal math
    if (!FinancialMath.isPositive(input.quantity)) {
      throw new AppError(400, 'INVALID_QUANTITY', 'Order quantity must be greater than zero');
    }

    // 4. Validate Price Requirements based on Order Type
    let finalLimitPrice: string | null = null;
    let referencePrice = '0.0000';

    if (input.orderType === 'LIMIT') {
      if (!input.limitPrice || !FinancialMath.isPositive(input.limitPrice)) {
        throw new AppError(
          400,
          'INVALID_LIMIT_PRICE',
          'Limit orders require a positive limit price greater than zero'
        );
      }
      finalLimitPrice = FinancialMath.toFixed(input.limitPrice);
      referencePrice = finalLimitPrice;
    } else {
      // MARKET Order: limitPrice is null; look up latest quote for purchasing power validation
      finalLimitPrice = null;
      const quote = await this.marketDataRepo.getQuoteByInstrumentId(input.instrumentId);
      if (quote && FinancialMath.isPositive(quote.lastPrice)) {
        referencePrice = quote.lastPrice;
      } else {
        referencePrice = '100.0000';
      }
    }

    // 5. Phase 1: Pre-Trade Validation and Order Creation in committed database transaction
    const committedOrder = await this.withTransaction(trx, async (activeTrx) => {
      // Pre-Trade Risk: Check uncommitted purchasing power for BUY orders
      if (input.side === 'BUY') {
        const estimatedRequiredCash = FinancialMath.calcTradeAmount(referencePrice, input.quantity);
        const powerCheck = await this.reservationService.validateBuyingPower(
          userId,
          estimatedRequiredCash,
          activeTrx
        );

        if (!powerCheck.hasSufficientFunds) {
          throw new AppError(
            422,
            'INSUFFICIENT_FUNDS',
            `Insufficient virtual funds to submit BUY order. Required: $${estimatedRequiredCash}, Available: $${powerCheck.availableBalance}`
          );
        }
      }

      // Pre-Trade Risk: Check uncommitted share balance for SELL orders
      if (input.side === 'SELL') {
        const sellCheck = await this.reservationService.validateSellingPower(
          userId,
          input.instrumentId,
          input.quantity,
          activeTrx
        );

        if (!sellCheck.hasSufficientShares) {
          throw new AppError(
            422,
            'INSUFFICIENT_SHARES',
            `Insufficient shares to submit SELL order. Required: ${input.quantity}, Available: ${sellCheck.availableShares}`
          );
        }
      }

      // Persist order with OPEN status
      const created = await this.orderRepo.create(
        {
          userId,
          instrumentId: input.instrumentId,
          side: input.side,
          orderType: input.orderType,
          quantity: FinancialMath.toFixed(input.quantity),
          remainingQuantity: FinancialMath.toFixed(input.quantity),
          limitPrice: finalLimitPrice,
          status: 'OPEN',
          idempotencyKey: input.idempotencyKey || null,
        },
        activeTrx
      );

      logger.info(
        `[OMS] Order #${created.id} accepted for User #${userId}: ${created.side} ${created.quantity} ${instrument.symbol} (${created.orderType})`
      );

      return created;
    });

    // 6. Post-Commit Realtime Event
    this.realtimeService.emitOrderAccepted(committedOrder);

    // 7. Phase 2: Hand off committed order to per-instrument matching queue
    const { remainingOrder } = await this.matchingEngine.matchOrder(committedOrder, instrument.symbol);

    return remainingOrder;
  }

  /**
   * Retrieves orders for an authenticated user with pagination and multi-facet filters.
   */
  async getUserOrders(
    userId: number,
    filter: OrderFilterQuery = {},
    trx?: Knex.Transaction
  ): Promise<{
    items: Order[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));

    const { orders, total } = await this.orderRepo.findByUserId(
      userId,
      { ...filter, page, limit },
      trx
    );

    return {
      items: orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves a single order by ID with strict ownership enforcement.
   */
  async getOrderById(userId: number, orderId: number, trx?: Knex.Transaction): Promise<Order> {
    const order = await this.orderRepo.findById(orderId, trx);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${orderId} was not found`);
    }

    if (order.userId !== userId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You do not have permission to access orders belonging to another user'
      );
    }

    return order;
  }

  /**
   * Cancels an eligible open order owned by the authenticated user.
   * Serialized through the instrument matching queue to prevent race conditions against matching executions.
   */
  async cancelOrder(userId: number, orderId: number, trx?: Knex.Transaction): Promise<Order> {
    const order = await this.getOrderById(userId, orderId, trx);

    // Route cancellation through the instrument queue to prevent concurrent matching races
    return this.matchingEngine.getMatchingQueue().enqueue(order.instrumentId, async () => {
      return this.withTransaction(trx, async (activeTrx) => {
        const current = await this.orderRepo.findById(orderId, activeTrx);
        if (!current) {
          throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${orderId} was not found`);
        }

        // Safe state machine validation
        if (current.status === 'CANCELLED') {
          throw new AppError(
            422,
            'ORDER_ALREADY_CANCELLED',
            `Order #${orderId} has already been cancelled`
          );
        }

        if (current.status === 'FILLED') {
          throw new AppError(
            422,
            'ORDER_ALREADY_FILLED',
            `Order #${orderId} has already been filled and cannot be cancelled`
          );
        }

        if (current.status === 'REJECTED') {
          throw new AppError(
            422,
            'ORDER_ALREADY_REJECTED',
            `Order #${orderId} was rejected and cannot be cancelled`
          );
        }

        if (current.status !== 'OPEN' && current.status !== 'PENDING' && current.status !== 'PARTIALLY_FILLED') {
          throw new AppError(
            422,
            'INVALID_STATE_TRANSITION',
            `Order #${orderId} in status ${current.status} is not eligible for cancellation`
          );
        }

        const updated = await this.orderRepo.updateStatus(orderId, 'CANCELLED', undefined, activeTrx);
        if (!updated) {
          throw new AppError(500, 'ORDER_UPDATE_FAILED', `Failed to cancel order #${orderId}`);
        }

        // Remove cancelled order from in-memory Order Book
        this.matchingEngine.cancelOrder(order.id, order.instrumentId);

        // Emit order cancelled to private user room
        this.realtimeService.emitOrderCancelled(updated);

        logger.info(`[OMS] Order #${orderId} cancelled by User #${userId}`);
        return updated;
      });
    });
  }
}

export const orderService = new OrderService();
