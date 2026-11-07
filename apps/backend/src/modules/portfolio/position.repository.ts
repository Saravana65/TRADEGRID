import { Knex } from 'knex';
import { db } from '../../database/connection';

export interface PositionRecord {
  id: number;
  user_id: number;
  instrument_id: number;
  quantity: string;
  average_buy_price: string;
  realized_pnl: string;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertPositionData {
  user_id: number;
  instrument_id: number;
  quantity: string;
  average_buy_price: string;
  realized_pnl: string;
}

export interface IPositionRepository {
  findByUserAndInstrument(
    userId: number,
    instrumentId: number,
    trx?: Knex.Transaction
  ): Promise<PositionRecord | null>;
  findByUserId(userId: number, trx?: Knex.Transaction): Promise<PositionRecord[]>;
  upsertPosition(data: UpsertPositionData, trx?: Knex.Transaction): Promise<PositionRecord>;
  lockPosition(
    userId: number,
    instrumentId: number,
    trx: Knex.Transaction
  ): Promise<PositionRecord | null>;
}

export class KnexPositionRepository implements IPositionRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  private getQueryBuilder(trx?: Knex.Transaction) {
    if (trx && typeof trx === 'function') {
      return trx<PositionRecord>('portfolio_positions');
    }
    return this.knexInstance<PositionRecord>('portfolio_positions');
  }

  async findByUserAndInstrument(
    userId: number,
    instrumentId: number,
    trx?: Knex.Transaction
  ): Promise<PositionRecord | null> {
    const record = await this.getQueryBuilder(trx)
      .where({ user_id: userId, instrument_id: instrumentId })
      .first();

    return record ? this.formatRecord(record) : null;
  }

  async findByUserId(userId: number, trx?: Knex.Transaction): Promise<PositionRecord[]> {
    const records = await this.getQueryBuilder(trx)
      .where({ user_id: userId })
      .orderBy('updated_at', 'desc');

    return records.map((r) => this.formatRecord(r));
  }

  async upsertPosition(data: UpsertPositionData, trx?: Knex.Transaction): Promise<PositionRecord> {
    const qb = this.getQueryBuilder(trx);
    const existing = await this.findByUserAndInstrument(data.user_id, data.instrument_id, trx);

    if (existing) {
      await qb
        .where({ id: existing.id })
        .update({
          quantity: data.quantity as any,
          average_buy_price: data.average_buy_price as any,
          realized_pnl: data.realized_pnl as any,
          updated_at: (trx || this.knexInstance).fn.now(),
        });
      const updated = await this.findByUserAndInstrument(data.user_id, data.instrument_id, trx);
      return updated!;
    }

    const [insertedId] = await qb.insert({
      user_id: data.user_id,
      instrument_id: data.instrument_id,
      quantity: data.quantity as any,
      average_buy_price: data.average_buy_price as any,
      realized_pnl: data.realized_pnl as any,
      created_at: (trx || this.knexInstance).fn.now(),
      updated_at: (trx || this.knexInstance).fn.now(),
    });

    const created = await this.getQueryBuilder(trx).where({ id: insertedId }).first();
    return this.formatRecord(created);
  }

  async lockPosition(
    userId: number,
    instrumentId: number,
    trx: Knex.Transaction
  ): Promise<PositionRecord | null> {
    const record = await trx<PositionRecord>('portfolio_positions')
      .where({ user_id: userId, instrument_id: instrumentId })
      .forUpdate()
      .first();

    return record ? this.formatRecord(record) : null;
  }

  private formatRecord(record: any): PositionRecord {
    return {
      id: Number(record.id),
      user_id: Number(record.user_id),
      instrument_id: Number(record.instrument_id),
      quantity: String(record.quantity),
      average_buy_price: String(record.average_buy_price),
      realized_pnl: String(record.realized_pnl),
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}

export const positionRepository: IPositionRepository = new KnexPositionRepository();
