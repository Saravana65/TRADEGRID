import { Knex } from 'knex';
import { db } from '../../database/connection';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/error.middleware';
import { Order, OrderFilterQuery, OrderStatus } from '@tradegrid/shared-types';
import { CreateOrderInput } from '@tradegrid/validation';
import { IOrderRepository, orderRepository as defaultOrderRepo } from './order.repository';
import {
  IInstrumentRepository,
  instrumentRepository as defaultInstrumentRepo,
} from '../market/instrument.repository';
import {
  IMarketDataRepository,
  marketDataRepository as defaultMarketDataRepo,
} from '../market/market-data.repository';
import {
  IOrderReservationService,
  orderReservationService as defaultReservationService,
} from './order-reservation.service';
import { MatchingEngine, matchingEngine as defaultMatchingEngine } from '../matching/matching-engine';

export class OrderService {
  private readonly matchingEngine: MatchingEngine;
  private readonly knexInstance: Knex;

  constructor(
    private readonly orderRepo: IOrderRepository = defaultOrderRepo,
    private readonly instrumentRepo: IInstrumentRepository = defaultInstrumentRepo,
    private readonly marketDataRepo: IMarketDataRepository = defaultMarketDataRepo,
    private readonly reservationService: IOrderReservationService = defaultReservationService,
    matchingEngineOrKnex?: MatchingEngine | Knex,
    knexParam?: Knex
  ) {
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

  /**
   * Helper to execute in an existing transaction or create a new managed transaction.
   */
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
   * Places a new order in the Order Management System (OMS).
   */
  async createOrder(
    userId: number,
    input: CreateOrderInput,
    trx?: Knex.Transaction
  ): Promise<Order> {
    return this.withTransaction(trx, async (activeTrx) => {
      // 1. Enforce Idempotency Guard
      if (input.idempotencyKey) {
        const existing = await this.orderRepo.findByIdempotencyKey(
          input.idempotencyKey,
          activeTrx
        );
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

      // 3. Validate Quantity
      const quantityNum = parseFloat(input.quantity);
      if (isNaN(quantityNum) || quantityNum <= 0) {
        throw new AppError(400, 'INVALID_QUANTITY', 'Order quantity must be greater than zero');
      }

      // 4. Validate Price Requirements based on Order Type
      let finalLimitPrice: string | null = null;
      let referencePrice: string = '0.0000';

      if (input.orderType === 'LIMIT') {
        if (!input.limitPrice || parseFloat(input.limitPrice) <= 0) {
          throw new AppError(
            400,
            'INVALID_LIMIT_PRICE',
            'Limit orders require a positive limit price greater than zero'
          );
        }
        finalLimitPrice = input.limitPrice;
        referencePrice = input.limitPrice;
      } else {
        // MARKET Order: limitPrice is null; look up latest quote for purchasing power validation
        finalLimitPrice = null;
        const quote = await this.marketDataRepo.getQuoteByInstrumentId(input.instrumentId);
        if (quote && parseFloat(quote.lastPrice) > 0) {
          referencePrice = quote.lastPrice;
        } else {
          // If no quote exists, default to safe nominal value for simulation
          referencePrice = '100.0000';
        }
      }

      // 5. Pre-Trade Purchasing Power Validation for BUY Orders
      if (input.side === 'BUY') {
        const estimatedRequiredCash = (quantityNum * parseFloat(referencePrice)).toFixed(4);
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

      // 6. Accept Order into OMS with OPEN Status
      // (Order starts with remaining_quantity = quantity)
      const order = await this.orderRepo.create(
        {
          userId,
          instrumentId: input.instrumentId,
          side: input.side,
          orderType: input.orderType,
          quantity: input.quantity,
          remainingQuantity: input.quantity,
          limitPrice: finalLimitPrice,
          status: 'OPEN',
          idempotencyKey: input.idempotencyKey || null,
        },
        activeTrx
      );

      logger.info(
        `[OMS] Order #${order.id} accepted for User #${userId}: ${order.side} ${order.quantity} ${instrument.symbol} (${order.orderType})`
      );

      // Phase 4B: Continuous Matching Engine Execution
      const { remainingOrder } = await this.matchingEngine.matchOrder(order, instrument.symbol);

      return remainingOrder;
    });
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
   */
  async cancelOrder(userId: number, orderId: number, trx?: Knex.Transaction): Promise<Order> {
    return this.withTransaction(trx, async (activeTrx) => {
      const order = await this.getOrderById(userId, orderId, activeTrx);

      // Safe state machine validation
      if (order.status === 'CANCELLED') {
        throw new AppError(
          422,
          'ORDER_ALREADY_CANCELLED',
          `Order #${orderId} has already been cancelled`
        );
      }

      if (order.status === 'FILLED') {
        throw new AppError(
          422,
          'ORDER_ALREADY_FILLED',
          `Order #${orderId} has already been filled and cannot be cancelled`
        );
      }

      if (order.status === 'REJECTED') {
        throw new AppError(
          422,
          'ORDER_ALREADY_REJECTED',
          `Order #${orderId} was rejected and cannot be cancelled`
        );
      }

      if (order.status !== 'OPEN' && order.status !== 'PENDING' && order.status !== 'PARTIALLY_FILLED') {
        throw new AppError(
          422,
          'INVALID_STATE_TRANSITION',
          `Order #${orderId} in status ${order.status} is not eligible for cancellation`
        );
      }

      const updated = await this.orderRepo.updateStatus(orderId, 'CANCELLED', undefined, activeTrx);
      if (!updated) {
        throw new AppError(500, 'ORDER_UPDATE_FAILED', `Failed to cancel order #${orderId}`);
      }

      // Phase 4B: Remove cancelled order from in-memory Order Book
      this.matchingEngine.cancelOrder(order.id, order.instrumentId);

      logger.info(`[OMS] Order #${orderId} cancelled by User #${userId}`);
      return updated;
    });
  }
}

export const orderService = new OrderService();
