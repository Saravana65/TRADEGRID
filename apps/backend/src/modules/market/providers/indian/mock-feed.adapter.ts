import {
  CandleInterval,
  MarketDataSourceProvenance,
  NormalizedCandle,
  NormalizedMarketQuote,
  NormalizedOrderBook,
  ProviderHealthMetrics,
} from '@tradegrid/shared-types';
import { IMarketDataProvider } from '../../market-data-provider.interface';
import { IndianSymbolMapper, INDIAN_EQUITIES_MASTER } from './symbol-mapper';
import { IndianTradingHoursService } from './trading-hours';

export interface MockIndianFeedOptions {
  exchange?: 'NSE' | 'BSE';
  basePrices?: Record<string, number>;
  volatility?: number; // 0.001 to 0.05
}

/**
 * MockIndianFeedAdapter
 *
 * High-fidelity, deterministic simulated feed adapter for Indian equities (NSE & BSE).
 * Adheres strictly to ₹0 budget constraints, generating realistic quotes, depth levels,
 * circuit limit bounds, and Indian Standard Time exchange timestamps.
 */
export class MockIndianFeedAdapter implements IMarketDataProvider {
  readonly id = 'MOCK_INDIAN_FEED_ADAPTER';
  readonly name = 'High-Fidelity Indian NSE/BSE Mock Feed Engine';
  readonly source: MarketDataSourceProvenance = 'SIMULATED';
  readonly supportedExchanges = ['NSE', 'BSE'];

  private connected: boolean = true;
  private exchange: 'NSE' | 'BSE';
  private currentPrices: Map<string, number> = new Map();
  private prevClosePrices: Map<string, number> = new Map();
  private volumes: Map<string, number> = new Map();
  private lastHeartbeatTime: Date = new Date();
  private messageCount: number = 0;
  private subscribers: Map<string, Set<(quote: NormalizedMarketQuote) => void>> = new Map();

  constructor(options: MockIndianFeedOptions = {}) {
    this.exchange = options.exchange || 'NSE';

    const defaultPrices: Record<string, number> = {
      RELIANCE: 2950.0,
      TCS: 3850.0,
      INFY: 1480.0,
      HDFCBANK: 1620.0,
      ICICIBANK: 1100.0,
      SBIN: 820.0,
      TATAMOTORS: 940.0,
      ...(options.basePrices || {}),
    };

    for (const [sym, price] of Object.entries(defaultPrices)) {
      this.currentPrices.set(sym, price);
      this.prevClosePrices.set(sym, price);
      this.volumes.set(sym, 250000);
    }
  }

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
    return {
      providerId: this.id,
      providerName: this.name,
      source: this.source,
      status: this.connected ? 'CONNECTED' : 'DISCONNECTED',
      lastHeartbeat: this.lastHeartbeatTime.toISOString(),
      latencyMs: 1,
      reconnectCount: 0,
      messageRatePerSecond: Math.max(1, Math.round(this.messageCount / 60)),
      totalMessagesReceived: this.messageCount,
      errorCount: 0,
      isFallbackActive: false,
      activeFeedName: `MOCK_${this.exchange}_SIM_ENGINE`,
      lastError: null,
    };
  }

  /**
   * Generates or retrieves a normalized quote for an Indian stock symbol.
   */
  async getQuote(symbol: string, exchange?: string): Promise<NormalizedMarketQuote | null> {
    if (!this.connected) {
      throw new Error(`Provider ${this.id} is disconnected`);
    }

    const parsed = IndianSymbolMapper.parseSymbol(symbol);
    const meta = IndianSymbolMapper.getMetadata(parsed.baseSymbol);
    const price = this.currentPrices.get(parsed.baseSymbol) || 1000.0;
    const prevClose = this.prevClosePrices.get(parsed.baseSymbol) || price;
    const volume = this.volumes.get(parsed.baseSymbol) || 100000;

    const changeAmount = price - prevClose;
    const changePercent = prevClose > 0 ? (changeAmount / prevClose) * 100 : 0;
    const now = new Date();

    this.messageCount++;
    this.lastHeartbeatTime = now;

    const quote: NormalizedMarketQuote = {
      symbol: parsed.baseSymbol,
      exchange: exchange || this.exchange,
      lastPrice: price.toFixed(4),
      openPrice: (prevClose * 1.002).toFixed(4),
      highPrice: Math.max(price, prevClose * 1.01).toFixed(4),
      lowPrice: Math.min(price, prevClose * 0.99).toFixed(4),
      previousClose: prevClose.toFixed(4),
      changeAmount: changeAmount.toFixed(4),
      changePercent: changePercent.toFixed(2),
      volume: String(volume),
      source: this.source,
      provider: this.id,
      exchangeTimestamp: now.toISOString(),
      ingestionTimestamp: now.toISOString(),
      isDelayed: false,
      delaySeconds: 0,
    };

    return quote;
  }

  async getQuotes(symbols?: string[]): Promise<NormalizedMarketQuote[]> {
    const targetSymbols = symbols && symbols.length > 0
      ? symbols
      : Array.from(this.currentPrices.keys());

    const result: NormalizedMarketQuote[] = [];
    for (const sym of targetSymbols) {
      const q = await this.getQuote(sym);
      if (q) result.push(q);
    }
    return result;
  }

  /**
   * Generates a 5-level Indian order book depth matching NSE/BSE tick size standards.
   */
  async getOrderBook(symbol: string, depth: number = 5): Promise<NormalizedOrderBook | null> {
    const parsed = IndianSymbolMapper.parseSymbol(symbol);
    const meta = IndianSymbolMapper.getMetadata(parsed.baseSymbol);
    const ltp = this.currentPrices.get(parsed.baseSymbol) || 1000.0;
    const tick = meta.tickSize;

    const bids = [];
    const asks = [];

    for (let i = 1; i <= depth; i++) {
      const bidPrice = Math.max(tick, ltp - i * tick);
      const askPrice = ltp + i * tick;
      bids.push({
        price: bidPrice.toFixed(4),
        quantity: String(meta.lotSize * 50 * i),
        ordersCount: i * 2,
      });
      asks.push({
        price: askPrice.toFixed(4),
        quantity: String(meta.lotSize * 50 * i),
        ordersCount: i * 2,
      });
    }

    return {
      symbol: parsed.baseSymbol,
      exchange: this.exchange,
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
    limit: number = 100
  ): Promise<NormalizedCandle[]> {
    const parsed = IndianSymbolMapper.parseSymbol(symbol);
    const basePrice = this.currentPrices.get(parsed.baseSymbol) || 1000.0;
    const candles: NormalizedCandle[] = [];
    const now = Date.now();
    const intervalMillis = interval === '1d' ? 86400000 : interval === '1h' ? 3600000 : 60000;

    for (let i = limit; i >= 1; i--) {
      const t = new Date(now - i * intervalMillis).toISOString();
      const open = basePrice * (1 + (Math.sin(i) * 0.005));
      const close = basePrice * (1 + (Math.cos(i) * 0.005));
      const high = Math.max(open, close) * 1.002;
      const low = Math.min(open, close) * 0.998;

      candles.push({
        timestamp: t,
        open: open.toFixed(4),
        high: high.toFixed(4),
        low: low.toFixed(4),
        close: close.toFixed(4),
        volume: String(10000 + i * 500),
        source: this.source,
        provider: this.id,
        isComplete: true,
      });
    }

    return candles;
  }

  /**
   * Ingests a new tick price, automatically rounding to the nearest tick and clamping to circuit limits.
   */
  applyTick(symbol: string, newPrice: number): NormalizedMarketQuote {
    const parsed = IndianSymbolMapper.parseSymbol(symbol);
    const meta = IndianSymbolMapper.getMetadata(parsed.baseSymbol);
    const prevClose = this.prevClosePrices.get(parsed.baseSymbol) || newPrice;

    // Circuit limit calculation (e.g. ±10%)
    const maxPrice = prevClose * (1 + meta.upperCircuitLimitPercent / 100);
    const minPrice = prevClose * (1 - meta.lowerCircuitLimitPercent / 100);
    const clamped = Math.max(minPrice, Math.min(maxPrice, newPrice));

    // Round to tick
    const rounded = parseFloat(IndianSymbolMapper.roundToTick(clamped, meta.tickSize));
    this.currentPrices.set(parsed.baseSymbol, rounded);

    const oldVol = this.volumes.get(parsed.baseSymbol) || 0;
    this.volumes.set(parsed.baseSymbol, oldVol + meta.lotSize * 25);

    const quote: NormalizedMarketQuote = {
      symbol: parsed.baseSymbol,
      exchange: this.exchange,
      lastPrice: rounded.toFixed(4),
      openPrice: (prevClose * 1.002).toFixed(4),
      highPrice: rounded.toFixed(4),
      lowPrice: rounded.toFixed(4),
      previousClose: prevClose.toFixed(4),
      changeAmount: (rounded - prevClose).toFixed(4),
      changePercent: (((rounded - prevClose) / prevClose) * 100).toFixed(2),
      volume: String(oldVol + meta.lotSize * 25),
      source: this.source,
      provider: this.id,
      exchangeTimestamp: new Date().toISOString(),
      ingestionTimestamp: new Date().toISOString(),
      isDelayed: false,
      delaySeconds: 0,
    };

    const subs = this.subscribers.get(parsed.baseSymbol);
    if (subs) {
      for (const cb of subs) {
        cb(quote);
      }
    }

    return quote;
  }

  subscribeQuotes(symbols: string[], callback: (quote: NormalizedMarketQuote) => void): void {
    for (const s of symbols) {
      const parsed = IndianSymbolMapper.parseSymbol(s);
      if (!this.subscribers.has(parsed.baseSymbol)) {
        this.subscribers.set(parsed.baseSymbol, new Set());
      }
      this.subscribers.get(parsed.baseSymbol)!.add(callback);
    }
  }

  unsubscribeQuotes(symbols?: string[]): void {
    if (!symbols) {
      this.subscribers.clear();
      return;
    }
    for (const s of symbols) {
      const parsed = IndianSymbolMapper.parseSymbol(s);
      this.subscribers.delete(parsed.baseSymbol);
    }
  }
}

export const mockIndianFeedAdapter = new MockIndianFeedAdapter();
