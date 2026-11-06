import { Knex } from 'knex';
import { db } from '../../database/connection';
import {
  Candle,
  CandleInterval,
  DataClassification,
  MarketOverviewSummary,
  MarketQuote,
} from '@tradegrid/shared-types';

export interface MarketQuoteRow {
  id: number;
  instrument_id: number;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  last_price: string;
  previous_close: string;
  open_price: string;
  high_price: string;
  low_price: string;
  volume: string;
  change_amount: string;
  change_percent: string;
  data_source: string;
  data_classification: DataClassification;
  timestamp: Date;
  updated_at: Date;
}

export interface MarketCandleRow {
  id: number;
  instrument_id: number;
  interval: string;
  timestamp: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  data_classification: DataClassification;
  created_at: Date;
}

export function mapRowToQuote(row: any): MarketQuote {
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    sector: row.sector,
    lastPrice: parseFloat(row.last_price || '0').toFixed(4),
    previousClose: parseFloat(row.previous_close || '0').toFixed(4),
    openPrice: parseFloat(row.open_price || '0').toFixed(4),
    highPrice: parseFloat(row.high_price || '0').toFixed(4),
    lowPrice: parseFloat(row.low_price || '0').toFixed(4),
    volume: String(row.volume || '0'),
    changeAmount: parseFloat(row.change_amount || '0').toFixed(4),
    changePercent: parseFloat(row.change_percent || '0').toFixed(4),
    dataSource: row.data_source,
    dataClassification: row.data_classification,
    timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export function mapRowToCandle(row: any): Candle {
  return {
    timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
    open: parseFloat(row.open || '0').toFixed(4),
    high: parseFloat(row.high || '0').toFixed(4),
    low: parseFloat(row.low || '0').toFixed(4),
    close: parseFloat(row.close || '0').toFixed(4),
    volume: String(row.volume || '0'),
  };
}

export interface IMarketDataRepository {
  getQuoteByInstrumentId(instrumentId: number): Promise<MarketQuote | null>;
  getQuoteBySymbol(symbol: string): Promise<MarketQuote | null>;
  getAllQuotes(classification?: DataClassification): Promise<MarketQuote[]>;
  getCandles(
    instrumentId: number,
    interval: CandleInterval,
    limit?: number,
    from?: Date,
    to?: Date
  ): Promise<Candle[]>;
  getTopGainers(limit?: number, classification?: DataClassification): Promise<MarketQuote[]>;
  getTopLosers(limit?: number, classification?: DataClassification): Promise<MarketQuote[]>;
  getMostActive(limit?: number, classification?: DataClassification): Promise<MarketQuote[]>;
  getMarketSummary(): Promise<MarketOverviewSummary>;
  upsertQuote(data: Partial<MarketQuoteRow> & { instrument_id: number }): Promise<void>;
  insertCandles(candles: Partial<MarketCandleRow>[]): Promise<void>;
}

export class KnexMarketDataRepository implements IMarketDataRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  private baseQuoteQuery() {
    return this.knexInstance('market_quotes')
      .join('instruments', 'market_quotes.instrument_id', 'instruments.id')
      .select(
        'market_quotes.id',
        'market_quotes.instrument_id',
        'instruments.symbol',
        'instruments.name',
        'instruments.exchange',
        'instruments.sector',
        'market_quotes.last_price',
        'market_quotes.previous_close',
        'market_quotes.open_price',
        'market_quotes.high_price',
        'market_quotes.low_price',
        'market_quotes.volume',
        'market_quotes.change_amount',
        'market_quotes.change_percent',
        'market_quotes.data_source',
        'market_quotes.data_classification',
        'market_quotes.timestamp',
        'market_quotes.updated_at'
      );
  }

  async getQuoteByInstrumentId(instrumentId: number): Promise<MarketQuote | null> {
    const row = await this.baseQuoteQuery()
      .where('market_quotes.instrument_id', instrumentId)
      .first();
    return row ? mapRowToQuote(row) : null;
  }

  async getQuoteBySymbol(symbol: string): Promise<MarketQuote | null> {
    const row = await this.baseQuoteQuery()
      .where('instruments.symbol', symbol.toUpperCase())
      .first();
    return row ? mapRowToQuote(row) : null;
  }

  async getAllQuotes(classification?: DataClassification): Promise<MarketQuote[]> {
    const qb = this.baseQuoteQuery();
    if (classification) {
      qb.where('market_quotes.data_classification', classification);
    }
    const rows = await qb.orderBy('instruments.symbol', 'asc');
    return rows.map(mapRowToQuote);
  }

  async getCandles(
    instrumentId: number,
    interval: CandleInterval,
    limit: number = 100,
    from?: Date,
    to?: Date
  ): Promise<Candle[]> {
    const qb = this.knexInstance('market_candles')
      .where('instrument_id', instrumentId)
      .andWhere('interval', interval);

    if (from) {
      qb.andWhere('timestamp', '>=', from);
    }

    if (to) {
      qb.andWhere('timestamp', '<=', to);
    }

    // Retrieve newest first up to limit, then reverse so candles flow chronologically ascending
    const rows = await qb
      .orderBy('timestamp', 'desc')
      .limit(limit);

    return rows.reverse().map(mapRowToCandle);
  }

  async getTopGainers(
    limit: number = 5,
    classification?: DataClassification
  ): Promise<MarketQuote[]> {
    const qb = this.baseQuoteQuery().where('market_quotes.change_percent', '>', 0);
    if (classification) {
      qb.andWhere('market_quotes.data_classification', classification);
    }
    const rows = await qb.orderBy('market_quotes.change_percent', 'desc').limit(limit);
    return rows.map(mapRowToQuote);
  }

  async getTopLosers(
    limit: number = 5,
    classification?: DataClassification
  ): Promise<MarketQuote[]> {
    const qb = this.baseQuoteQuery().where('market_quotes.change_percent', '<', 0);
    if (classification) {
      qb.andWhere('market_quotes.data_classification', classification);
    }
    const rows = await qb.orderBy('market_quotes.change_percent', 'asc').limit(limit);
    return rows.map(mapRowToQuote);
  }

  async getMostActive(
    limit: number = 5,
    classification?: DataClassification
  ): Promise<MarketQuote[]> {
    const qb = this.baseQuoteQuery();
    if (classification) {
      qb.where('market_quotes.data_classification', classification);
    }
    const rows = await qb.orderBy('market_quotes.volume', 'desc').limit(limit);
    return rows.map(mapRowToQuote);
  }

  async getMarketSummary(): Promise<MarketOverviewSummary> {
    const now = new Date();

    const instrumentsCount = await this.knexInstance('instruments')
      .count<{ count: string | number }>('id as count')
      .first();
    const activeCount = await this.knexInstance('instruments')
      .where('market_status', 'ACTIVE')
      .count<{ count: string | number }>('id as count')
      .first();
    const haltedCount = await this.knexInstance('instruments')
      .where('market_status', 'HALTED')
      .count<{ count: string | number }>('id as count')
      .first();

    const advancing = await this.knexInstance('market_quotes')
      .where('change_percent', '>', 0)
      .count<{ count: string | number }>('id as count')
      .first();
    const declining = await this.knexInstance('market_quotes')
      .where('change_percent', '<', 0)
      .count<{ count: string | number }>('id as count')
      .first();
    const unchanged = await this.knexInstance('market_quotes')
      .where('change_percent', '=', 0)
      .count<{ count: string | number }>('id as count')
      .first();

    const totalVol = await this.knexInstance('market_quotes')
      .sum<{ total_vol: string | number }>('volume as total_vol')
      .first();

    const realCount = await this.knexInstance('instruments')
      .where('data_classification', 'REAL')
      .count<{ count: string | number }>('id as count')
      .first();
    const simCount = await this.knexInstance('instruments')
      .where('data_classification', 'SIMULATED')
      .count<{ count: string | number }>('id as count')
      .first();

    return {
      totalInstruments: parseInt(String(instrumentsCount?.count || 0), 10),
      activeInstruments: parseInt(String(activeCount?.count || 0), 10),
      haltedInstruments: parseInt(String(haltedCount?.count || 0), 10),
      advancingCount: parseInt(String(advancing?.count || 0), 10),
      decliningCount: parseInt(String(declining?.count || 0), 10),
      unchangedCount: parseInt(String(unchanged?.count || 0), 10),
      totalVolume: String(totalVol?.total_vol || '0'),
      realInstrumentsCount: parseInt(String(realCount?.count || 0), 10),
      simulatedInstrumentsCount: parseInt(String(simCount?.count || 0), 10),
      timestamp: now.toISOString(),
    };
  }

  async upsertQuote(data: Partial<MarketQuoteRow> & { instrument_id: number }): Promise<void> {
    const existing = await this.knexInstance('market_quotes')
      .where('instrument_id', data.instrument_id)
      .first();

    if (existing) {
      await this.knexInstance('market_quotes')
        .where('instrument_id', data.instrument_id)
        .update({
          ...data,
          updated_at: new Date(),
        });
    } else {
      await this.knexInstance('market_quotes').insert({
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  async insertCandles(candles: Partial<MarketCandleRow>[]): Promise<void> {
    if (candles.length === 0) return;
    await this.knexInstance('market_candles')
      .insert(candles)
      .onConflict(['instrument_id', 'interval', 'timestamp'])
      .merge();
  }
}

export const marketDataRepository = new KnexMarketDataRepository();
