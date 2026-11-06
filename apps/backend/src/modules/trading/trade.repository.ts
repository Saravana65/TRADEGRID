import { Knex } from 'knex';
import { db } from '../../database/connection';
import { TradeFilterQuery, TradeStatus } from '@tradegrid/shared-types';

export interface TradeRecord {
  id: number;
  trade_reference: string;
  buy_order_id: number;
  sell_order_id: number;
  instrument_id: number;
  buyer_id: number;
  seller_id: number;
  price: string;
  quantity: string;
  trade_amount: string;
  buyer_fee: string;
  seller_fee: string;
  status: TradeStatus;
  settlement_transaction_id: number | null;
  created_at: Date;
}

export interface CreateTradeData {
  trade_reference: string;
  buy_order_id: number;
  sell_order_id: number;
  instrument_id: number;
  buyer_id: number;
  seller_id: number;
  price: string;
  quantity: string;
  trade_amount: string;
  buyer_fee?: string;
  seller_fee?: string;
  status?: TradeStatus;
  settlement_transaction_id?: number | null;
}

export interface ITradeRepository {
  create(data: CreateTradeData, trx?: Knex.Transaction): Promise<TradeRecord>;
  findById(id: number, trx?: Knex.Transaction): Promise<TradeRecord | null>;
  findByReference(reference: string, trx?: Knex.Transaction): Promise<TradeRecord | null>;
  findByUserId(
    userId: number,
    filter?: TradeFilterQuery,
    trx?: Knex.Transaction
  ): Promise<{ trades: TradeRecord[]; total: number }>;
  findByInstrumentId(
    instrumentId: number,
    limit?: number,
    trx?: Knex.Transaction
  ): Promise<TradeRecord[]>;
  findByOrderId(orderId: number, trx?: Knex.Transaction): Promise<TradeRecord[]>;
}

export class KnexTradeRepository implements ITradeRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  private getQueryBuilder(trx?: Knex.Transaction) {
    return trx ? trx<TradeRecord>('trades') : this.knexInstance<TradeRecord>('trades');
  }

  async create(data: CreateTradeData, trx?: Knex.Transaction): Promise<TradeRecord> {
    const qb = this.getQueryBuilder(trx);
    const [insertedId] = await qb.insert({
      trade_reference: data.trade_reference,
      buy_order_id: data.buy_order_id,
      sell_order_id: data.sell_order_id,
      instrument_id: data.instrument_id,
      buyer_id: data.buyer_id,
      seller_id: data.seller_id,
      price: data.price as any,
      quantity: data.quantity as any,
      trade_amount: data.trade_amount as any,
      buyer_fee: (data.buyer_fee || '0.0000') as any,
      seller_fee: (data.seller_fee || '0.0000') as any,
      status: data.status || 'SETTLED',
      settlement_transaction_id: data.settlement_transaction_id || null,
      created_at: (trx || this.knexInstance).fn.now(),
    });

    const created = await this.findById(insertedId, trx);
    if (!created) {
      throw new Error(`Failed to retrieve trade #${insertedId} after insertion`);
    }
    return created;
  }

  async findById(id: number, trx?: Knex.Transaction): Promise<TradeRecord | null> {
    const record = await this.getQueryBuilder(trx).where({ id }).first();
    return record ? this.formatRecord(record) : null;
  }

  async findByReference(reference: string, trx?: Knex.Transaction): Promise<TradeRecord | null> {
    const record = await this.getQueryBuilder(trx).where({ trade_reference: reference }).first();
    return record ? this.formatRecord(record) : null;
  }

  async findByUserId(
    userId: number,
    filter: TradeFilterQuery = {},
    trx?: Knex.Transaction
  ): Promise<{ trades: TradeRecord[]; total: number }> {
    const qb = this.getQueryBuilder(trx);

    qb.where((builder) => {
      builder.where('buyer_id', userId).orWhere('seller_id', userId);
    });

    if (filter.instrumentId) {
      qb.andWhere('instrument_id', filter.instrumentId);
    }

    if (filter.startDate) {
      qb.andWhere('created_at', '>=', new Date(filter.startDate));
    }

    if (filter.endDate) {
      qb.andWhere('created_at', '<=', new Date(filter.endDate));
    }

    // Count total matches
    const countResult = await qb.clone().count<{ count: string | number }>('id as count').first();
    const total = countResult ? Number(countResult.count) : 0;

    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const offset = (page - 1) * limit;

    const records = await qb
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      trades: records.map((r) => this.formatRecord(r)),
      total,
    };
  }

  async findByInstrumentId(
    instrumentId: number,
    limit: number = 50,
    trx?: Knex.Transaction
  ): Promise<TradeRecord[]> {
    const records = await this.getQueryBuilder(trx)
      .where({ instrument_id: instrumentId })
      .orderBy('created_at', 'desc')
      .limit(limit);

    return records.map((r) => this.formatRecord(r));
  }

  async findByOrderId(orderId: number, trx?: Knex.Transaction): Promise<TradeRecord[]> {
    const records = await this.getQueryBuilder(trx)
      .where((builder) => {
        builder.where('buy_order_id', orderId).orWhere('sell_order_id', orderId);
      })
      .orderBy('created_at', 'asc');

    return records.map((r) => this.formatRecord(r));
  }

  private formatRecord(record: any): TradeRecord {
    return {
      id: Number(record.id),
      trade_reference: record.trade_reference,
      buy_order_id: Number(record.buy_order_id),
      sell_order_id: Number(record.sell_order_id),
      instrument_id: Number(record.instrument_id),
      buyer_id: Number(record.buyer_id),
      seller_id: Number(record.seller_id),
      price: String(record.price),
      quantity: String(record.quantity),
      trade_amount: String(record.trade_amount),
      buyer_fee: String(record.buyer_fee),
      seller_fee: String(record.seller_fee),
      status: record.status,
      settlement_transaction_id: record.settlement_transaction_id
        ? Number(record.settlement_transaction_id)
        : null,
      created_at: record.created_at,
    };
  }
}

export const tradeRepository: ITradeRepository = new KnexTradeRepository();
