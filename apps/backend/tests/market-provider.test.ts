import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  SimulatedMarketDataProvider,
  normalizeQuote,
  normalizeCandle,
} from '../src/modules/market/providers/simulated.provider';
import {
  LicensedIndianMarketDataProvider,
} from '../src/modules/market/providers/licensed-indian.provider';
import {
  HistoricalMarketDataProvider,
} from '../src/modules/market/providers/historical.provider';
import {
  MarketDataProviderRegistry,
} from '../src/modules/market/provider-registry';
import {
  MarketDataService,
} from '../src/modules/market/market-data.service';
import {
  MarketDataController,
} from '../src/modules/market/market-data.controller';
import {
  InMemoryMarketDataRepository,
  InMemoryInstrumentRepository,
} from './mocks/in-memory-repositories';

describe('Phase 10A: Market Data Provider Architecture & Source Attribution', () => {
  let app: any;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let simulatedProvider: SimulatedMarketDataProvider;
  let licensedProvider: LicensedIndianMarketDataProvider;
  let historicalProvider: HistoricalMarketDataProvider;
  let registry: MarketDataProviderRegistry;
  let marketDataService: MarketDataService;

  beforeEach(() => {
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);

    simulatedProvider = new SimulatedMarketDataProvider(marketDataRepo, instrumentRepo);
    licensedProvider = new LicensedIndianMarketDataProvider({
      exchange: 'NSE',
      isDelayed: false,
    });
    historicalProvider = new HistoricalMarketDataProvider(marketDataRepo, instrumentRepo);

    registry = new MarketDataProviderRegistry(simulatedProvider);
    registry.registerProvider(licensedProvider);
    registry.registerProvider(historicalProvider);

    marketDataService = new MarketDataService(
      marketDataRepo,
      instrumentRepo,
      simulatedProvider,
      undefined,
      undefined,
      registry
    );

    const marketDataController = new MarketDataController(marketDataService);
    app = createApp({
      marketDataController,
      customCheckDb: async () => true,
    });
  });

  describe('1. Provider Registration & Health Monitoring', () => {
    it('should register providers and report comprehensive health metrics', () => {
      const providers = registry.getAllProviders();
      expect(providers.length).toBeGreaterThanOrEqual(3);

      const health = simulatedProvider.getHealth();
      expect(health.providerId).toBe('SIMULATED_PROVIDER');
      expect(health.source).toBe('SIMULATED');
      expect(health.status).toBe('CONNECTED');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.lastHeartbeat).toBeDefined();

      const status = registry.getRegistryStatus();
      expect(status.defaultProvider).toBe('SIMULATED_PROVIDER');
      expect(status.isFallbackActive).toBe(false);
      expect(status.providers.length).toBeGreaterThanOrEqual(3);
    });

    it('should track connection lifecycle and failure states', async () => {
      await licensedProvider.connect();
      expect(licensedProvider.isConnected()).toBe(true);

      licensedProvider.simulateFailure('Connection reset by peer');
      expect(licensedProvider.isConnected()).toBe(false);

      const degradedHealth = licensedProvider.getHealth();
      expect(degradedHealth.status).toBe('DEGRADED');
      expect(degradedHealth.lastError).toContain('Connection reset');
      expect(degradedHealth.errorCount).toBe(1);

      licensedProvider.simulateReconnect();
      expect(licensedProvider.isConnected()).toBe(true);
      expect(licensedProvider.getHealth().reconnectCount).toBe(1);
    });
  });

  describe('2. Source Provenance & Data Normalization', () => {
    it('should normalize simulated quotes with explicit SIMULATED source attribution', async () => {
      const quote = await simulatedProvider.getQuote('RELIANCE');
      expect(quote).not.toBeNull();
      expect(quote?.symbol).toBe('RELIANCE');
      expect(quote?.lastPrice).toBe('2950.0000');
      expect(quote?.source).toBe('SIMULATED');
      expect(quote?.provider).toBe('SIMULATED_PROVIDER');
      expect(quote?.isDelayed).toBe(false);
      expect(quote?.delaySeconds).toBe(0);
      expect(quote?.exchangeTimestamp).toBeDefined();
      expect(quote?.ingestionTimestamp).toBeDefined();
    });

    it('should normalize delayed market data with DELAYED provenance and delay duration', () => {
      const delayedAdapter = new LicensedIndianMarketDataProvider({
        isDelayed: true,
        delaySeconds: 900,
      });

      const delayedQuote = delayedAdapter.registerFeedQuote({
        symbol: 'INFY',
        exchange: 'NSE',
        lastPrice: '1450.5000',
      });

      expect(delayedQuote.source).toBe('DELAYED');
      expect(delayedQuote.isDelayed).toBe(true);
      expect(delayedQuote.delaySeconds).toBe(900);
      expect(delayedQuote.provider).toBe('LICENSED_INDIAN_PROVIDER');
    });

    it('should generate normalized order book and historical candles', async () => {
      const book = await simulatedProvider.getOrderBook('RELIANCE', 5);
      expect(book).not.toBeNull();
      expect(book?.symbol).toBe('RELIANCE');
      expect(book?.source).toBe('SIMULATED');
      expect(book?.bids.length).toBe(5);
      expect(book?.asks.length).toBe(5);

      const candles = await historicalProvider.getCandles('RELIANCE', '1d', 10);
      expect(Array.isArray(candles)).toBe(true);
    });
  });

  describe('3. Automated Fallback Switching', () => {
    it('should serve quote from primary licensed provider when connected and available', async () => {
      await licensedProvider.connect();
      licensedProvider.registerFeedQuote({
        symbol: 'RELIANCE',
        exchange: 'NSE',
        lastPrice: '2550.0000',
      });

      registry.setPrimaryProvider(licensedProvider.id);

      const quote = await registry.getQuoteWithFallback('RELIANCE');
      expect(quote).not.toBeNull();
      expect(quote?.lastPrice).toBe('2550.0000');
      expect(quote?.source).toBe('LICENSED_LIVE');
      expect(registry.isFallbackInEffect()).toBe(false);
    });

    it('should seamlessly fallback to simulated provider when primary provider disconnects', async () => {
      await licensedProvider.connect();
      licensedProvider.registerFeedQuote({
        symbol: 'RELIANCE',
        lastPrice: '2550.0000',
      });

      registry.setPrimaryProvider(licensedProvider.id);

      // Simulate provider disconnection
      licensedProvider.simulateFailure('Upstream network unreachable');

      // Request should not fail; should seamlessly return simulated quote
      const fallbackQuote = await registry.getQuoteWithFallback('RELIANCE');
      expect(fallbackQuote).not.toBeNull();
      expect(fallbackQuote?.lastPrice).toBe('2950.0000');
      expect(fallbackQuote?.source).toBe('SIMULATED');
      expect(registry.isFallbackInEffect()).toBe(true);

      const status = registry.getRegistryStatus();
      expect(status.isFallbackActive).toBe(true);
      expect(status.activeProvider).toBe('SIMULATED_PROVIDER');
    });

    it('should seamlessly fallback to simulated provider when primary throws an unexpected error', async () => {
      await licensedProvider.connect();
      registry.setPrimaryProvider(licensedProvider.id);

      // Provider has no quote for TCS and throws when disconnected
      await licensedProvider.disconnect();

      const quote = await registry.getQuoteWithFallback('RELIANCE');
      expect(quote).not.toBeNull();
      expect(quote?.symbol).toBe('RELIANCE');
      expect(quote?.source).toBe('SIMULATED');
      expect(registry.isFallbackInEffect()).toBe(true);
    });
  });

  describe('4. Provider Health API Endpoint', () => {
    it('should expose GET /api/v1/market/providers/health', async () => {
      const res = await request(app).get('/api/v1/market/providers/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activeProvider).toBeDefined();
      expect(res.body.data.defaultProvider).toBe('SIMULATED_PROVIDER');
      expect(Array.isArray(res.body.data.providers)).toBe(true);
      expect(res.body.data.providers.length).toBeGreaterThanOrEqual(1);

      const simProviderHealth = res.body.data.providers.find(
        (p: any) => p.providerId === 'SIMULATED_PROVIDER'
      );
      expect(simProviderHealth).toBeDefined();
      expect(simProviderHealth.source).toBe('SIMULATED');
      expect(simProviderHealth.status).toBe('CONNECTED');
    });
  });
});
