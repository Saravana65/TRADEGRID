import { Knex } from 'knex';
import { db } from '../../database/connection';
import {
  Instrument,
  InstrumentFilterQuery,
  InstrumentStatus,
  DataClassification,
  InstrumentType,
} from '@tradegrid/shared-types';
import { CreateInstrumentInput, UpdateInstrumentInput } from '@tradegrid/validation';

export interface InstrumentRow {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  instrument_type: InstrumentType;
  currency: string;
  market_status: InstrumentStatus;
  data_classification: DataClassification;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToInstrument(row: InstrumentRow): Instrument {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    sector: row.sector,
    instrumentType: row.instrument_type,
    currency: row.currency,
    marketStatus: row.market_status,
    dataClassification: row.data_classification,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export interface IInstrumentRepository {
  findAll(filter?: InstrumentFilterQuery): Promise<{ instruments: Instrument[]; total: number }>;
  findById(id: number): Promise<Instrument | null>;
  findBySymbol(symbol: string, exchange?: string): Promise<Instrument | null>;
  create(data: CreateInstrumentInput, trx?: Knex.Transaction): Promise<Instrument>;
  update(id: number, data: UpdateInstrumentInput, trx?: Knex.Transaction): Promise<Instrument | null>;
  updateStatus(id: number, status: InstrumentStatus, trx?: Knex.Transaction): Promise<Instrument | null>;
  getDistinctSectors(): Promise<string[]>;
  getDistinctExchanges(): Promise<string[]>;
}

export class KnexInstrumentRepository implements IInstrumentRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  private getQueryBuilder(trx?: Knex.Transaction) {
    return trx ? trx<InstrumentRow>('instruments') : this.knexInstance<InstrumentRow>('instruments');
  }

  async findAll(
    filter: InstrumentFilterQuery = {}
  ): Promise<{ instruments: Instrument[]; total: number }> {
    const qb = this.getQueryBuilder();

    if (filter.q) {
      const searchTerm = `%${filter.q}%`;
      qb.where((builder) => {
        builder.whereILike('symbol', searchTerm).orWhereILike('name', searchTerm);
      });
    }

    if (filter.exchange) {
      qb.where('exchange', filter.exchange.toUpperCase());
    }

    if (filter.sector) {
      qb.whereILike('sector', filter.sector);
    }

    if (filter.classification) {
      qb.where('data_classification', filter.classification);
    }

    if (filter.status) {
      qb.where('market_status', filter.status);
    }

    // Clone query to count total matching rows
    const countResult = await qb.clone().count<{ count: string | number }>('id as count').first();
    const total = countResult ? parseInt(String(countResult.count), 10) : 0;

    // Apply pagination and ordering
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const offset = (page - 1) * limit;

    const rows = await qb
      .orderBy('symbol', 'asc')
      .limit(limit)
      .offset(offset);

    return {
      instruments: rows.map(mapRowToInstrument),
      total,
    };
  }

  async findById(id: number): Promise<Instrument | null> {
    const row = await this.getQueryBuilder().where({ id }).first();
    return row ? mapRowToInstrument(row) : null;
  }

  async findBySymbol(symbol: string, exchange?: string): Promise<Instrument | null> {
    const qb = this.getQueryBuilder().where('symbol', symbol.toUpperCase());
    if (exchange) {
      qb.andWhere('exchange', exchange.toUpperCase());
    }
    const row = await qb.first();
    return row ? mapRowToInstrument(row) : null;
  }

  async create(data: CreateInstrumentInput, trx?: Knex.Transaction): Promise<Instrument> {
    const qb = this.getQueryBuilder(trx);

    const [insertedId] = await qb.insert({
      symbol: data.symbol.toUpperCase(),
      name: data.name,
      exchange: data.exchange.toUpperCase(),
      sector: data.sector,
      instrument_type: data.instrumentType || 'EQUITY',
      currency: data.currency || 'USD',
      market_status: data.marketStatus || 'ACTIVE',
      data_classification: data.dataClassification || 'SIMULATED',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const created = await this.findById(insertedId);
    if (!created) {
      throw new Error(`Failed to retrieve newly created instrument id ${insertedId}`);
    }
    return created;
  }

  async update(
    id: number,
    data: UpdateInstrumentInput,
    trx?: Knex.Transaction
  ): Promise<Instrument | null> {
    const qb = this.getQueryBuilder(trx);

    const updatePayload: Partial<InstrumentRow> = {
      updated_at: new Date(),
    };

    if (data.name) updatePayload.name = data.name;
    if (data.sector) updatePayload.sector = data.sector;
    if (data.currency) updatePayload.currency = data.currency;
    if (data.marketStatus) updatePayload.market_status = data.marketStatus;

    await qb.where({ id }).update(updatePayload);
    return this.findById(id);
  }

  async updateStatus(
    id: number,
    status: InstrumentStatus,
    trx?: Knex.Transaction
  ): Promise<Instrument | null> {
    const qb = this.getQueryBuilder(trx);
    await qb.where({ id }).update({
      market_status: status,
      updated_at: new Date(),
    });
    return this.findById(id);
  }

  async getDistinctSectors(): Promise<string[]> {
    const rows = await this.getQueryBuilder().distinct('sector').orderBy('sector', 'asc');
    return rows.map((r) => r.sector);
  }

  async getDistinctExchanges(): Promise<string[]> {
    const rows = await this.getQueryBuilder().distinct('exchange').orderBy('exchange', 'asc');
    return rows.map((r) => r.exchange);
  }
}

export const instrumentRepository = new KnexInstrumentRepository();
