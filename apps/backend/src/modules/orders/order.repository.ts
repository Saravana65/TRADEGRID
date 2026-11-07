import { Knex } from 'knex';
import { db } from '../../database/connection';
import {
  Order,
  OrderSide,
  OrderType,
  OrderStatus,
  OrderFilterQuery,
} from '@tradegrid/shared-types';

export interface OrderRow {
  id: number;
  user_id: number;
  instrument_id: number;
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: string;
  remaining_quantity: string;
  limit_price: string | null;
  status: OrderStatus;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateOrderDbData {
  userId: number;
  instrumentId: number;
  side: OrderSide;
  orderType: OrderType;
  quantity: string;
  remainingQuantity: string;
  limitPrice: string | null;
  status: OrderStatus;
  idempotencyKey?: string | null;
}

export function mapRowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    instrumentId: row.instrument_id,
    symbol: row.symbol,
    instrumentName: row.name,
    exchange: row.exchange,
    currency: row.currency,
    side: row.side,
    orderType: row.order_type,
    quantity: String(row.quantity),
    remainingQuantity: String(row.remaining_quantity),
    limitPrice: row.limit_price !== null ? String(row.limit_price) : null,
    status: row.status,
    idempotencyKey: row.idempotency_key || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export interface IOrderRepository {
  create(data: CreateOrderDbData, trx?: Knex.Transaction): Promise<Order>;
  findById(id: number, trx?: Knex.Transaction): Promise<Order | null>;
  findByUserId(
    userId: number,
    filter?: OrderFilterQuery,
    trx?: Knex.Transaction
  ): Promise<{ orders: Order[]; total: number }>;
  findByIdempotencyKey(key: string, trx?: Knex.Transaction): Promise<Order | null>;
  updateStatus(
    id: number,
    status: OrderStatus,
    remainingQuantity?: string,
    trx?: Knex.Transaction
  ): Promise<Order | null>;
  update(
    id: number,
    data: { status?: OrderStatus; remainingQuantity?: string },
    trx?: Knex.Transaction
  ): Promise<Order | null>;
  findOpenOrders(
    filter?: { userId?: number; instrumentId?: number; side?: OrderSide },
    trx?: Knex.Transaction
  ): Promise<Order[]>;
}

export class KnexOrderRepository implements IOrderRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  private getQueryBuilder(trx?: Knex.Transaction) {
    return trx ? trx('orders') : this.knexInstance('orders');
  }

  async create(data: CreateOrderDbData, trx?: Knex.Transaction): Promise<Order> {
    const qb = this.getQueryBuilder(trx);
    const knexContext = trx || this.knexInstance;

    const [insertedId] = await qb.insert({
      user_id: data.userId,
      instrument_id: data.instrumentId,
      side: data.side,
      order_type: data.orderType,
      quantity: data.quantity as any,
      remaining_quantity: data.remainingQuantity as any,
      limit_price: (data.limitPrice as any) || null,
      status: data.status,
      idempotency_key: data.idempotencyKey || null,
      created_at: knexContext.fn.now(),
      updated_at: knexContext.fn.now(),
    });

    const order = await this.findById(insertedId, trx);
    if (!order) {
      throw new Error(`Failed to retrieve order #${insertedId} after creation`);
    }
    return order;
  }

  async findById(id: number, trx?: Knex.Transaction): Promise<Order | null> {
    const knexContext = trx || this.knexInstance;
    const row = await knexContext('orders')
      .join('instruments', 'orders.instrument_id', 'instruments.id')
      .where('orders.id', id)
      .select<OrderRow[]>([
        'orders.*',
        'instruments.symbol as symbol',
        'instruments.name as name',
        'instruments.exchange as exchange',
        'instruments.currency as currency',
      ])
      .first();

    return row ? mapRowToOrder(row) : null;
  }

  async findByUserId(
    userId: number,
    filter: OrderFilterQuery = {},
    trx?: Knex.Transaction
  ): Promise<{ orders: Order[]; total: number }> {
    const knexContext = trx || this.knexInstance;
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    const baseQuery = knexContext('orders')
      .join('instruments', 'orders.instrument_id', 'instruments.id')
      .where('orders.user_id', userId);

    if (filter.status) {
      baseQuery.andWhere('orders.status', filter.status);
    }
    if (filter.side) {
      baseQuery.andWhere('orders.side', filter.side);
    }
    if (filter.orderType) {
      baseQuery.andWhere('orders.order_type', filter.orderType);
    }
    if (filter.instrumentId) {
      baseQuery.andWhere('orders.instrument_id', filter.instrumentId);
    }
    if (filter.symbol) {
      baseQuery.andWhere('instruments.symbol', filter.symbol.toUpperCase());
    }

    // Count total matching
    const countResult = await baseQuery
      .clone()
      .clearSelect()
      .count<{ count: string | number }>('orders.id as count')
      .first();
    const total = countResult ? Number(countResult.count) : 0;

    // Fetch paginated rows
    const rows = await baseQuery
      .select<OrderRow[]>([
        'orders.*',
        'instruments.symbol as symbol',
        'instruments.name as name',
        'instruments.exchange as exchange',
        'instruments.currency as currency',
      ])
      .orderBy('orders.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      orders: rows.map(mapRowToOrder),
      total,
    };
  }

  async findByIdempotencyKey(key: string, trx?: Knex.Transaction): Promise<Order | null> {
    const knexContext = trx || this.knexInstance;
    const row = await knexContext('orders')
      .join('instruments', 'orders.instrument_id', 'instruments.id')
      .where('orders.idempotency_key', key)
      .select<OrderRow[]>([
        'orders.*',
        'instruments.symbol as symbol',
        'instruments.name as name',
        'instruments.exchange as exchange',
        'instruments.currency as currency',
      ])
      .first();

    return row ? mapRowToOrder(row) : null;
  }

  async updateStatus(
    id: number,
    status: OrderStatus,
    remainingQuantity?: string,
    trx?: Knex.Transaction
  ): Promise<Order | null> {
    const qb = this.getQueryBuilder(trx);
    const knexContext = trx || this.knexInstance;

    const updatePayload: Record<string, any> = {
      status,
      updated_at: knexContext.fn.now(),
    };

    if (remainingQuantity !== undefined) {
      updatePayload.remaining_quantity = remainingQuantity;
    }

    const affected = await qb.where({ id }).update(updatePayload);
    if (affected === 0) {
      return null;
    }

    return this.findById(id, trx);
  }

  async update(
    id: number,
    data: { status?: OrderStatus; remainingQuantity?: string },
    trx?: Knex.Transaction
  ): Promise<Order | null> {
    const qb = this.getQueryBuilder(trx);
    const knexContext = trx || this.knexInstance;

    const payload: Record<string, any> = {
      updated_at: knexContext.fn.now(),
    };
    if (data.status) {
      payload.status = data.status;
    }
    if (data.remainingQuantity !== undefined) {
      payload.remaining_quantity = data.remainingQuantity;
    }

    const affected = await qb.where({ id }).update(payload);
    if (affected === 0) {
      return null;
    }
    return this.findById(id, trx);
  }

  async findOpenOrders(
    filter?: { userId?: number; instrumentId?: number; side?: OrderSide },
    trx?: Knex.Transaction
  ): Promise<Order[]> {
    const knexContext = trx || this.knexInstance;
    let query = knexContext('orders')
      .join('instruments', 'orders.instrument_id', 'instruments.id')
      .whereIn('orders.status', ['OPEN', 'PARTIALLY_FILLED'])
      .where('orders.remaining_quantity', '>', 0);

    if (filter?.userId) {
      query = query.where('orders.user_id', filter.userId);
    }
    if (filter?.instrumentId) {
      query = query.where('orders.instrument_id', filter.instrumentId);
    }
    if (filter?.side) {
      query = query.where('orders.side', filter.side);
    }

    const rows = await query
      .select<OrderRow[]>([
        'orders.*',
        'instruments.symbol as symbol',
        'instruments.name as name',
        'instruments.exchange as exchange',
        'instruments.currency as currency',
      ])
      .orderBy('orders.created_at', 'asc')
      .orderBy('orders.id', 'asc');

    return rows.map(mapRowToOrder);
  }
}

export const orderRepository = new KnexOrderRepository();
