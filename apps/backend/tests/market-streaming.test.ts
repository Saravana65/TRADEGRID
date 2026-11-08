import { describe, it, expect, beforeEach } from 'vitest';
import {
  MarketDataStreamManager,
} from '../src/modules/market/streaming-manager';
import {
  SimulatedMarketDataProvider,
} from '../src/modules/market/providers/simulated.provider';
import {
  LicensedIndianMarketDataProvider,
} from '../src/modules/market/providers/licensed-indian.provider';
import {
  NormalizedMarketQuote,
} from '@tradegrid/shared-types';
import {
  InMemoryMarketDataRepository,
  InMemoryInstrumentRepository,
} from './mocks/in-memory-repositories';

describe('Phase 10D: Real-Time Streaming and Recovery', () => {
  let primaryProvider: LicensedIndianMarketDataProvider;
  let fallbackProvider: SimulatedMarketDataProvider;
  let streamManager: MarketDataStreamManager;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;

  beforeEach(() => {
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);

    primaryProvider = new LicensedIndianMarketDataProvider({
      exchange: 'NSE',
      isDelayed: false,
    });

    fallbackProvider = new SimulatedMarketDataProvider(marketDataRepo, instrumentRepo);

    streamManager = new MarketDataStreamManager(primaryProvider, fallbackProvider, {
      heartbeatIntervalMs: 1000,
      heartbeatTimeoutMs: 5000,
      staleFeedThresholdSeconds: 10,
      baseBackoffMs: 500,
      maxBackoffMs: 8000,
      backoffJitterPercent: 0.1,
      maxConsecutiveFailuresBeforeFailover: 2,
    });
  });

  describe('1. Connection Lifecycle & Exponential Backoff Math', () => {
    it('should compute exponentially increasing backoff delays with jitter bounded limits', () => {
      const delay1 = streamManager.calculateBackoff(1);
      const delay2 = streamManager.calculateBackoff(2);
      const delay3 = streamManager.calculateBackoff(3);
      const delay4 = streamManager.calculateBackoff(4);
      const delay10 = streamManager.calculateBackoff(10); // Should be clamped at maxBackoffMs

      expect(delay1).toBeGreaterThanOrEqual(450); // 500 - 10%
      expect(delay1).toBeLessThanOrEqual(550); // 500 + 10%

      expect(delay2).toBeGreaterThanOrEqual(900); // 1000 - 10%
      expect(delay2).toBeLessThanOrEqual(1100);

      expect(delay3).toBeGreaterThanOrEqual(1800); // 2000 - 10%
      expect(delay3).toBeLessThanOrEqual(2200);

      expect(delay4).toBeGreaterThan(delay2);

      // Max backoff clamp check (8000 + 10% = 8800)
      expect(delay10).toBeLessThanOrEqual(8800);
    });

    it('should track connection states across start and disconnect', async () => {
      expect(streamManager.getState()).toBe('DISCONNECTED');

      await streamManager.start();
      expect(streamManager.getState()).toBe('CONNECTED');
      expect(streamManager.getActiveProviderId()).toBe(primaryProvider.id);
    });
  });

  describe('2. Heartbeat Watchdog & Timeout Detection', () => {
    it('should report healthy when heartbeats arrive within threshold', async () => {
      await streamManager.start();

      const now = new Date();
      streamManager.recordHeartbeat(now);

      const checkTime = new Date(now.getTime() + 2000); // 2s elapsed, timeout is 5s
      const isAlive = streamManager.checkHeartbeat(checkTime);
      expect(isAlive).toBe(true);
    });

    it('should trigger connection failure when heartbeat times out', async () => {
      await streamManager.start();

      const now = new Date();
      streamManager.recordHeartbeat(now);

      const expiredTime = new Date(now.getTime() + 7000); // 7s elapsed > 5s timeout
      const isAlive = streamManager.checkHeartbeat(expiredTime);

      expect(isAlive).toBe(false);
      expect(streamManager.getState()).toBe('RECONNECTING');
    });
  });

  describe('3. Packet Sequence Gap & Loss Detection', () => {
    it('should detect packet drops when incoming sequence numbers skip values', () => {
      // Ingest packet 1
      const res1 = streamManager.processPacketSequence('RELIANCE', 1);
      expect(res1.isExpected).toBe(true);
      expect(res1.gapCount).toBe(0);

      // Ingest packet 2
      const res2 = streamManager.processPacketSequence('RELIANCE', 2);
      expect(res2.isExpected).toBe(true);
      expect(res2.gapCount).toBe(0);

      // Ingest packet 5 (skipped packets 3 and 4 -> 2 packets lost)
      const res5 = streamManager.processPacketSequence('RELIANCE', 5);
      expect(res5.isExpected).toBe(false);
      expect(res5.gapCount).toBe(2);

      const metrics = streamManager.getMetrics();
      expect(metrics.packetsLostCount).toBe(2);
    });
  });

  describe('4. Ingestion Deduplication & Stale Feed Detection', () => {
    it('should deduplicate identical incoming ticks', () => {
      const quote: NormalizedMarketQuote = {
        symbol: 'RELIANCE',
        exchange: 'NSE',
        lastPrice: '2950.0000',
        openPrice: '2940.0000',
        highPrice: '2960.0000',
        lowPrice: '2935.0000',
        previousClose: '2940.0000',
        changeAmount: '10.0000',
        changePercent: '0.34',
        volume: '50000',
        source: 'LICENSED_LIVE',
        provider: 'TEST_FEED',
        exchangeTimestamp: '2026-04-15T09:30:00.000Z',
        ingestionTimestamp: '2026-04-15T09:30:00.000Z',
        isDelayed: false,
        delaySeconds: 0,
      };

      const acceptedFirst = streamManager.ingestQuote(quote, 1);
      expect(acceptedFirst).toBe(true);

      // Duplicate tick with same symbol, timestamp, and price
      const acceptedSecond = streamManager.ingestQuote(quote, 2);
      expect(acceptedSecond).toBe(false);
    });

    it('should identify stale feeds when no updates are received within threshold', () => {
      const now = Date.now();

      const quote: NormalizedMarketQuote = {
        symbol: 'TCS',
        exchange: 'NSE',
        lastPrice: '3850.0000',
        openPrice: '3840.0000',
        highPrice: '3860.0000',
        lowPrice: '3830.0000',
        previousClose: '3840.0000',
        changeAmount: '10.0000',
        changePercent: '0.26',
        volume: '20000',
        source: 'LICENSED_LIVE',
        provider: 'TEST_FEED',
        exchangeTimestamp: new Date(now).toISOString(),
        ingestionTimestamp: new Date(now).toISOString(),
        isDelayed: false,
        delaySeconds: 0,
      };

      streamManager.ingestQuote(quote);

      // 5 seconds later (threshold is 10s): not stale
      expect(streamManager.isSymbolStale('TCS', now + 5000)).toBe(false);

      // 12 seconds later: stale
      expect(streamManager.isSymbolStale('TCS', now + 12000)).toBe(true);

      const metrics = streamManager.getMetrics();
      expect(metrics.staleSymbolsCount).toBe(0); // evaluated at current time
    });
  });

  describe('5. Failover and Consumer Recovery', () => {
    it('should automatically failover to simulated provider after consecutive failures', async () => {
      await streamManager.start();
      expect(streamManager.isUsingFailover()).toBe(false);

      const receivedQuotes: NormalizedMarketQuote[] = [];
      streamManager.subscribe('RELIANCE', (q) => {
        receivedQuotes.push(q);
      });

      // Simulate failure 1
      streamManager.handleConnectionFailure('Network drop 1');
      expect(streamManager.isUsingFailover()).toBe(false);

      // Simulate failure 2 (reaches maxConsecutiveFailuresBeforeFailover = 2)
      streamManager.handleConnectionFailure('Network drop 2');
      expect(streamManager.isUsingFailover()).toBe(true);
      expect(streamManager.getActiveProviderId()).toBe(fallbackProvider.id);
      expect(streamManager.getState()).toBe('CONNECTED');

      // Dispatch quote through fallback provider
      fallbackProvider.dispatchTick({
        symbol: 'RELIANCE',
        exchange: 'NSE',
        lastPrice: '2955.0000',
        openPrice: '2940.0000',
        highPrice: '2960.0000',
        lowPrice: '2935.0000',
        previousClose: '2940.0000',
        changeAmount: '15.0000',
        changePercent: '0.51',
        volume: '60000',
        source: 'SIMULATED',
        provider: 'SIMULATED_PROVIDER',
        exchangeTimestamp: new Date().toISOString(),
        ingestionTimestamp: new Date().toISOString(),
        isDelayed: false,
        delaySeconds: 0,
      });

      expect(receivedQuotes.length).toBe(1);
      expect(receivedQuotes[0].lastPrice).toBe('2955.0000');
      expect(receivedQuotes[0].source).toBe('SIMULATED');
    });

    it('should seamlessly recover primary provider when back online', async () => {
      await streamManager.start();
      streamManager.triggerFailover('Forced test failover');
      expect(streamManager.isUsingFailover()).toBe(true);

      streamManager.recoverPrimary();
      expect(streamManager.isUsingFailover()).toBe(false);
      expect(streamManager.getActiveProviderId()).toBe(primaryProvider.id);
      expect(streamManager.getMetrics().reconnectAttempts).toBe(0);
    });
  });
});
