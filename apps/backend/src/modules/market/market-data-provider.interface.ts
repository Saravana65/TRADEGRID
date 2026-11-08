import {
  Candle,
  CandleInterval,
  DataClassification,
  MarketQuote,
  MarketDataSourceProvenance,
  NormalizedCandle,
  NormalizedMarketQuote,
  NormalizedOrderBook,
  ProviderHealthMetrics,
} from '@tradegrid/shared-types';

/**
 * Market Data Provider Interface (Legacy / Direct Adapter Compatibility)
 *
 * Pluggable abstraction allowing TRADEGRID to source quotes and historical candles
 * from deterministic simulation fixtures, or future licensed live exchange feeds
 * (e.g. AlphaVantage, Polygon, NSE feed adapters).
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly classification: DataClassification;
  readonly supportedExchanges: string[];

  /**
   * Fetches the latest quote for a single instrument symbol.
   */
  getQuote(symbol: string, exchange?: string): Promise<MarketQuote | null>;

  /**
   * Fetches latest quotes for multiple symbols or all symbols in the universe.
   */
  getQuotes(symbols?: string[]): Promise<MarketQuote[]>;

  /**
   * Fetches historical OHLCV candles for a given interval and date window.
   */
  getCandles(
    symbol: string,
    interval: CandleInterval,
    limit?: number,
    from?: Date,
    to?: Date
  ): Promise<Candle[]>;
}

/**
 * Phase 10: Advanced Market Data Provider Interface
 *
 * Standardized pluggable interface with source provenance, health metrics,
 * order book depth, streaming subscriptions and seamless fallback capabilities.
 */
export interface IMarketDataProvider {
  readonly id: string;
  readonly name: string;
  readonly source: MarketDataSourceProvenance;
  readonly supportedExchanges: string[];

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getHealth(): ProviderHealthMetrics;

  getQuote(symbol: string, exchange?: string): Promise<NormalizedMarketQuote | null>;
  getQuotes(symbols?: string[]): Promise<NormalizedMarketQuote[]>;
  getOrderBook?(symbol: string, depth?: number): Promise<NormalizedOrderBook | null>;
  getCandles(
    symbol: string,
    interval: CandleInterval,
    limit?: number,
    from?: Date,
    to?: Date
  ): Promise<NormalizedCandle[]>;

  subscribeQuotes?(symbols: string[], callback: (quote: NormalizedMarketQuote) => void): void;
  unsubscribeQuotes?(symbols: string[]): void;
}

