import {
  CandleInterval,
  NormalizedCandle,
  NormalizedMarketQuote,
  ProviderHealthMetrics,
  ProviderRegistryStatus,
} from '@tradegrid/shared-types';
import { IMarketDataProvider } from './market-data-provider.interface';
import {
  simulatedMarketDataProvider,
  SimulatedMarketDataProvider,
} from './providers/simulated.provider';
import { licensedIndianMarketDataProvider } from './providers/licensed-indian.provider';
import { historicalMarketDataProvider } from './providers/historical.provider';
import { logger } from '../../utils/logger';

/**
 * MarketDataProviderRegistry
 *
 * Central coordinator for market data providers. Manages active provider routing,
 * health monitoring, and seamless fallback to the $0 deterministic simulated provider
 * whenever a primary feed suffers an outage or is not connected.
 */
export class MarketDataProviderRegistry {
  private providers: Map<string, IMarketDataProvider> = new Map();
  private primaryProviderId: string = 'SIMULATED_PROVIDER';
  private defaultFallbackProvider: IMarketDataProvider;
  private fallbackActive: boolean = false;
  private fallbackCount: number = 0;

  constructor(defaultFallback: IMarketDataProvider = simulatedMarketDataProvider) {
    this.defaultFallbackProvider = defaultFallback;
    this.registerProvider(defaultFallback);
    this.registerProvider(licensedIndianMarketDataProvider);
    this.registerProvider(historicalMarketDataProvider);
  }

  registerProvider(provider: IMarketDataProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): IMarketDataProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): IMarketDataProvider[] {
    return Array.from(this.providers.values());
  }

  setPrimaryProvider(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Provider '${id}' is not registered in MarketDataProviderRegistry`);
    }
    this.primaryProviderId = id;
    this.fallbackActive = false;
  }

  getPrimaryProvider(): IMarketDataProvider {
    const prov = this.providers.get(this.primaryProviderId);
    return prov || this.defaultFallbackProvider;
  }

  isFallbackInEffect(): boolean {
    return this.fallbackActive;
  }

  resetFallback(): void {
    this.fallbackActive = false;
  }

  async getQuoteWithFallback(symbol: string, exchange?: string): Promise<NormalizedMarketQuote | null> {
    const primary = this.getPrimaryProvider();

    // If primary is not connected, fall back immediately
    if (!primary.isConnected() && primary.id !== this.defaultFallbackProvider.id) {
      if (!this.fallbackActive) {
        this.fallbackActive = true;
        this.fallbackCount++;
        logger.warn(
          `[MARKET REGISTRY] Primary provider ${primary.id} disconnected. Seamlessly switching to ${this.defaultFallbackProvider.id} fallback.`
        );
      }
      return this.defaultFallbackProvider.getQuote(symbol, exchange);
    }

    try {
      const quote = await primary.getQuote(symbol, exchange);
      if (quote) {
        this.fallbackActive = false;
        return quote;
      }
      // If primary returned null, check fallback if primary is not simulated
      if (primary.id !== this.defaultFallbackProvider.id) {
        this.fallbackActive = true;
        this.fallbackCount++;
        return this.defaultFallbackProvider.getQuote(symbol, exchange);
      }
      return null;
    } catch (err: any) {
      this.fallbackActive = true;
      this.fallbackCount++;
      logger.warn(
        `[MARKET REGISTRY] Error from primary provider ${primary.id}: ${err.message}. Falling back to ${this.defaultFallbackProvider.id}.`
      );
      return this.defaultFallbackProvider.getQuote(symbol, exchange);
    }
  }

  async getCandlesWithFallback(
    symbol: string,
    interval: CandleInterval,
    limit: number = 100,
    from?: Date,
    to?: Date
  ): Promise<NormalizedCandle[]> {
    const primary = this.getPrimaryProvider();

    if (!primary.isConnected() && primary.id !== this.defaultFallbackProvider.id) {
      this.fallbackActive = true;
      return this.defaultFallbackProvider.getCandles(symbol, interval, limit, from, to);
    }

    try {
      const candles = await primary.getCandles(symbol, interval, limit, from, to);
      if (candles && candles.length > 0) {
        return candles;
      }
      if (primary.id !== this.defaultFallbackProvider.id) {
        this.fallbackActive = true;
        return this.defaultFallbackProvider.getCandles(symbol, interval, limit, from, to);
      }
      return [];
    } catch (err: any) {
      this.fallbackActive = true;
      logger.warn(
        `[MARKET REGISTRY] Error fetching candles from ${primary.id}: ${err.message}. Falling back to default.`
      );
      return this.defaultFallbackProvider.getCandles(symbol, interval, limit, from, to);
    }
  }

  getRegistryStatus(): ProviderRegistryStatus {
    const primary = this.getPrimaryProvider();
    const metricsList: ProviderHealthMetrics[] = [];

    for (const prov of this.providers.values()) {
      const health = prov.getHealth();
      metricsList.push({
        ...health,
        isFallbackActive: this.fallbackActive && prov.id === primary.id,
      });
    }

    return {
      activeProvider: this.fallbackActive
        ? this.defaultFallbackProvider.id
        : primary.id,
      defaultProvider: this.defaultFallbackProvider.id,
      isFallbackActive: this.fallbackActive,
      providers: metricsList,
    };
  }
}

export const marketDataProviderRegistry = new MarketDataProviderRegistry();
