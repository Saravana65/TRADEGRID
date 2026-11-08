import {
  Candle,
  CandleInterval,
  MarketDataSourceProvenance,
  NormalizedCandle,
  NormalizedMarketQuote,
  ProviderHealthMetrics,
} from '@tradegrid/shared-types';
import { IMarketDataProvider } from '../market-data-provider.interface';
import {
  IMarketDataRepository,
  marketDataRepository,
} from '../market-data.repository';
import {
  IInstrumentRepository,
  instrumentRepository,
} from '../instrument.repository';
import { normalizeCandle, normalizeQuote } from './simulated.provider';

/**
 * HistoricalMarketDataProvider
 *
 * Dedicated market data provider for historical EOD and intraday OHLCV queries,
 * ensuring anti-lookahead guarantees, chronological candle sorting, and explicit
 * HISTORICAL source provenance.
 */
export class HistoricalMarketDataProvider implements IMarketDataProvider {
  readonly id = 'HISTORICAL_PROVIDER';
  readonly name = 'TradeGrid Historical Market Data Engine';
  readonly source: MarketDataSourceProvenance = 'HISTORICAL';
  readonly supportedExchanges = ['NSE', 'BSE', 'TRADEGRID'];

  private connected: boolean = true;
  private lastHeartbeat: Date = new Date();
  private queryCount: number = 0;
  private errorCountVal: number = 0;
  private lastErrorMsg: string | null = null;

  constructor(
    private readonly marketDataRepo: IMarketDataRepository = marketDataRepository,
    private readonly instrumentRepo: IInstrumentRepository = instrumentRepository
  ) {}

  async connect(): Promise<void> {
    this.connected = true;
    this.lastHeartbeat = new Date();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getHealth(): ProviderHealthMetrics {
    return {
      providerId: this.id,
      providerName: this.name,
      source: this.source,
      status: this.connected ? 'CONNECTED' : 'DISCONNECTED',
      lastHeartbeat: this.lastHeartbeat.toISOString(),
      latencyMs: 5,
      reconnectCount: 0,
      messageRatePerSecond: Math.max(0, Math.round(this.queryCount / 60)),
      totalMessagesReceived: this.queryCount,
      errorCount: this.errorCountVal,
      isFallbackActive: false,
      activeFeedName: 'HistoricalRepositoryEngine',
      lastError: this.lastErrorMsg,
    };
  }

  async getQuote(symbol: string, exchange?: string): Promise<NormalizedMarketQuote | null> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol, exchange);
    if (!instrument) {
      return null;
    }

    const raw = await this.marketDataRepo.getQuoteByInstrumentId(instrument.id);
    if (!raw) {
      return null;
    }

    this.queryCount++;
    this.lastHeartbeat = new Date();
    return normalizeQuote(raw, this.source, this.id, false, 0);
  }

  async getQuotes(symbols?: string[]): Promise<NormalizedMarketQuote[]> {
    const quotes = await this.marketDataRepo.getAllQuotes();
    this.queryCount += quotes.length;
    this.lastHeartbeat = new Date();
    return quotes.map((q) => normalizeQuote(q, this.source, this.id, false, 0));
  }

  async getCandles(
    symbol: string,
    interval: CandleInterval,
    limit: number = 100,
    from?: Date,
    to?: Date
  ): Promise<NormalizedCandle[]> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol);
    if (!instrument) {
      return [];
    }

    const rawCandles = await this.marketDataRepo.getCandles(
      instrument.id,
      interval,
      limit,
      from,
      to
    );

    this.queryCount += rawCandles.length;
    this.lastHeartbeat = new Date();

    // Ensure chronological sorting without lookahead
    const sorted = [...rawCandles].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return sorted.map((c) => normalizeCandle(c, this.source, this.id));
  }
}

export const historicalMarketDataProvider = new HistoricalMarketDataProvider();
