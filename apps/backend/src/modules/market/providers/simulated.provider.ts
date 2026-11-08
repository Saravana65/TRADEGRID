import {
  Candle,
  CandleInterval,
  DataClassification,
  MarketDataSourceProvenance,
  MarketQuote,
  NormalizedCandle,
  NormalizedMarketQuote,
  NormalizedOrderBook,
  ProviderHealthMetrics,
} from '@tradegrid/shared-types';
import { IMarketDataProvider, MarketDataProvider } from '../market-data-provider.interface';
import {
  IMarketDataRepository,
  marketDataRepository,
} from '../market-data.repository';
import {
  IInstrumentRepository,
  instrumentRepository,
} from '../instrument.repository';

/**
 * Normalizes a standard MarketQuote into a source-attributed NormalizedMarketQuote.
 */
export function normalizeQuote(
  quote: MarketQuote,
  source: MarketDataSourceProvenance = 'SIMULATED',
  providerName: string = 'SIMULATED_PROVIDER',
  isDelayed: boolean = false,
  delaySeconds: number = 0
): NormalizedMarketQuote {
  const ingestionTime = new Date().toISOString();
  return {
    symbol: quote.symbol,
    exchange: quote.exchange,
    lastPrice: quote.lastPrice,
    openPrice: quote.openPrice,
    highPrice: quote.highPrice,
    lowPrice: quote.lowPrice,
    previousClose: quote.previousClose,
    changeAmount: quote.changeAmount,
    changePercent: quote.changePercent,
    volume: quote.volume,
    source,
    provider: providerName,
    exchangeTimestamp: quote.timestamp || ingestionTime,
    ingestionTimestamp: ingestionTime,
    isDelayed,
    delaySeconds,
  };
}

/**
 * Normalizes a standard Candle into a source-attributed NormalizedCandle.
 */
export function normalizeCandle(
  candle: Candle,
  source: MarketDataSourceProvenance = 'SIMULATED',
  providerName: string = 'SIMULATED_PROVIDER'
): NormalizedCandle {
  return {
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    source,
    provider: providerName,
    isComplete: true,
  };
}

/**
 * SimulatedMarketDataProvider
 *
 * Primary default market data provider for zero-cost operation ($0 budget).
 * Serves deterministic simulated quotes and reference catalog data with full
 * source attribution, health monitoring, and in-memory subscriptions.
 */
export class SimulatedMarketDataProvider implements IMarketDataProvider {
  readonly id = 'SIMULATED_PROVIDER';
  readonly name = 'TradeGrid Simulated Market Engine';
  readonly source: MarketDataSourceProvenance = 'SIMULATED';
  readonly classification: DataClassification = 'SIMULATED';
  readonly supportedExchanges = ['TRADEGRID', 'NSE', 'BSE'];

  private connected: boolean = true;
  private lastHeartbeatTime: Date = new Date();
  private reconnectCountVal: number = 0;
  private messageCount: number = 0;
  private errorCountVal: number = 0;
  private lastErrorMsg: string | null = null;
  private subscribers: Map<string, Set<(quote: NormalizedMarketQuote) => void>> = new Map();

  constructor(
    private readonly marketDataRepo: IMarketDataRepository = marketDataRepository,
    private readonly instrumentRepo: IInstrumentRepository = instrumentRepository
  ) {}

  async connect(): Promise<void> {
    this.connected = true;
    this.lastHeartbeatTime = new Date();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getHealth(): ProviderHealthMetrics {
    const isDegraded = !this.connected;
    return {
      providerId: this.id,
      providerName: this.name,
      source: this.source,
      status: this.connected ? 'CONNECTED' : 'DISCONNECTED',
      lastHeartbeat: this.lastHeartbeatTime.toISOString(),
      latencyMs: 1, // In-memory deterministic latency
      reconnectCount: this.reconnectCountVal,
      messageRatePerSecond: Math.max(1, Math.round(this.messageCount / 60)),
      totalMessagesReceived: this.messageCount,
      errorCount: this.errorCountVal,
      isFallbackActive: false,
      activeFeedName: 'DeterministicSimEngine',
      lastError: this.lastErrorMsg,
    };
  }

  async getQuote(symbol: string, exchange?: string): Promise<NormalizedMarketQuote | null> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol, exchange);
    if (!instrument) {
      return null;
    }
    const rawQuote = await this.marketDataRepo.getQuoteByInstrumentId(instrument.id);
    if (!rawQuote) {
      return null;
    }

    this.messageCount++;
    this.lastHeartbeatTime = new Date();
    return normalizeQuote(rawQuote, this.source, this.id, false, 0);
  }

  async getQuotes(symbols?: string[]): Promise<NormalizedMarketQuote[]> {
    let rawQuotes: MarketQuote[];
    if (!symbols || symbols.length === 0) {
      rawQuotes = await this.marketDataRepo.getAllQuotes();
    } else {
      rawQuotes = [];
      for (const sym of symbols) {
        const inst = await this.instrumentRepo.findBySymbol(sym);
        if (inst) {
          const q = await this.marketDataRepo.getQuoteByInstrumentId(inst.id);
          if (q) rawQuotes.push(q);
        }
      }
    }

    this.messageCount += rawQuotes.length;
    this.lastHeartbeatTime = new Date();
    return rawQuotes.map((q) => normalizeQuote(q, this.source, this.id, false, 0));
  }

  async getOrderBook(symbol: string, depth: number = 10): Promise<NormalizedOrderBook | null> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol);
    if (!instrument) {
      return null;
    }

    const quote = await this.marketDataRepo.getQuoteByInstrumentId(instrument.id);
    const midPrice = quote ? parseFloat(quote.lastPrice) : 100.0;
    const bids = [];
    const asks = [];

    for (let i = 1; i <= depth; i++) {
      const bidPrice = Math.max(0.05, midPrice - i * 0.1).toFixed(4);
      const askPrice = (midPrice + i * 0.1).toFixed(4);
      bids.push({ price: bidPrice, quantity: String(100 * i), ordersCount: i });
      asks.push({ price: askPrice, quantity: String(100 * i), ordersCount: i });
    }

    return {
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      source: this.source,
      provider: this.id,
      timestamp: new Date().toISOString(),
      bids,
      asks,
    };
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

    const candles = await this.marketDataRepo.getCandles(instrument.id, interval, limit, from, to);
    this.messageCount += candles.length;
    this.lastHeartbeatTime = new Date();

    return candles.map((c) => normalizeCandle(c, this.source, this.id));
  }

  subscribeQuotes(symbols: string[], callback: (quote: NormalizedMarketQuote) => void): void {
    for (const symbol of symbols) {
      const upper = symbol.toUpperCase();
      if (!this.subscribers.has(upper)) {
        this.subscribers.set(upper, new Set());
      }
      this.subscribers.get(upper)!.add(callback);
    }
  }

  unsubscribeQuotes(symbols?: string[]): void {
    if (!symbols) {
      this.subscribers.clear();
      return;
    }
    for (const sym of symbols) {
      this.subscribers.delete(sym.toUpperCase());
    }
  }

  /**
   * Helper for tests/engine to dispatch a mock live tick to registered subscribers.
   */
  dispatchTick(quote: NormalizedMarketQuote): void {
    const subs = this.subscribers.get(quote.symbol.toUpperCase());
    if (subs) {
      for (const cb of subs) {
        cb(quote);
      }
    }
  }
}

export const simulatedMarketDataProvider = new SimulatedMarketDataProvider();
