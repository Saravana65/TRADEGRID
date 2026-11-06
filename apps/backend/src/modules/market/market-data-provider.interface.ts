import {
  Candle,
  CandleInterval,
  DataClassification,
  MarketQuote,
} from '@tradegrid/shared-types';

/**
 * Market Data Provider Interface
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
