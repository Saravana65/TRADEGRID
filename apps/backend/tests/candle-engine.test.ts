import { describe, it, expect, beforeEach } from 'vitest';
import {
  CandleEngine,
} from '../src/modules/market/candle-engine';
import {
  NormalizedCandle,
} from '@tradegrid/shared-types';
import {
  InMemoryMarketDataRepository,
  InMemoryInstrumentRepository,
} from './mocks/in-memory-repositories';

describe('Phase 10C: Historical Market Data & Candle Engine', () => {
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;

  beforeEach(() => {
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);
  });

  describe('1. Multi-Timeframe Candle Aggregation Math', () => {
    it('should aggregate 1m base candles into exact 5m and 15m candles without floating-point drift', () => {
      // Create 15 consecutive 1-minute bars starting at 09:15:00 UTC
      const baseBars: NormalizedCandle[] = [];
      const startTime = Date.UTC(2026, 3, 15, 9, 15, 0); // 09:15:00

      for (let i = 0; i < 15; i++) {
        const barTime = new Date(startTime + i * 60 * 1000).toISOString();
        const base = 2500.0 + i * 2;
        baseBars.push({
          timestamp: barTime,
          open: base.toFixed(4),
          high: (base + 3.0).toFixed(4),
          low: (base - 1.5).toFixed(4),
          close: (base + 1.0).toFixed(4),
          volume: '1000',
          source: 'HISTORICAL',
          provider: 'TEST_FEED',
          isComplete: true,
        });
      }

      // 1. Aggregate to 5m bars (should yield exactly 3 bars: 09:15, 09:20, 09:25)
      const bars5m = CandleEngine.aggregateCandles(baseBars, '5m');
      expect(bars5m.length).toBe(3);

      // Verify Bar 0 (09:15 - 09:19)
      const b0 = bars5m[0];
      expect(b0.open).toBe(baseBars[0].open); // First bar's open: 2500.0000
      expect(b0.close).toBe(baseBars[4].close); // 5th bar's close: 2509.0000
      expect(b0.low).toBe(baseBars[0].low); // Minimum low
      expect(b0.high).toBe(baseBars[4].high); // Maximum high
      expect(b0.volume).toBe('5000'); // Exactly 5 * 1000 = 5000
      expect(b0.source).toBe('HISTORICAL');

      // 2. Aggregate to 15m bar (should yield exactly 1 bar)
      const bars15m = CandleEngine.aggregateCandles(baseBars, '15m');
      expect(bars15m.length).toBe(1);
      const b15 = bars15m[0];
      expect(b15.open).toBe(baseBars[0].open);
      expect(b15.close).toBe(baseBars[14].close);
      expect(b15.volume).toBe('15000'); // Exactly 15 * 1000 = 15000
      expect(b15.timestamp).toBe(new Date(startTime).toISOString());
    });

    it('should aggregate into 1h and 1d bars accurately', () => {
      const bars: NormalizedCandle[] = [];
      const startTime = Date.UTC(2026, 3, 15, 9, 0, 0);

      for (let i = 0; i < 60; i++) {
        bars.push({
          timestamp: new Date(startTime + i * 60 * 1000).toISOString(),
          open: '100.0000',
          high: '105.0000',
          low: '98.0000',
          close: '102.0000',
          volume: '200',
          source: 'HISTORICAL',
          provider: 'TEST_FEED',
          isComplete: true,
        });
      }

      const hourly = CandleEngine.aggregateCandles(bars, '1h');
      expect(hourly.length).toBe(1);
      expect(hourly[0].open).toBe('100.0000');
      expect(hourly[0].close).toBe('102.0000');
      expect(hourly[0].volume).toBe('12000'); // 60 * 200 = 12000
    });
  });

  describe('2. Gap Detection & Interpolation', () => {
    it('should detect missing time intervals in a candle series', () => {
      const start = Date.UTC(2026, 3, 15, 10, 0, 0);
      const candles: NormalizedCandle[] = [
        {
          timestamp: new Date(start).toISOString(),
          open: '100.0000',
          high: '101.0000',
          low: '99.0000',
          close: '100.5000',
          volume: '1000',
          source: 'HISTORICAL',
          provider: 'TEST',
          isComplete: true,
        },
        // Missing 5 minutes (jump from 10:00 to 10:06)
        {
          timestamp: new Date(start + 6 * 60 * 1000).toISOString(),
          open: '101.0000',
          high: '102.0000',
          low: '100.5000',
          close: '101.5000',
          volume: '1500',
          source: 'HISTORICAL',
          provider: 'TEST',
          isComplete: true,
        },
      ];

      const gaps = CandleEngine.detectGaps(candles, '1m');
      expect(gaps.length).toBe(1);
      expect(gaps[0].missingBarsCount).toBe(5);
      expect(gaps[0].gapStartTimestamp).toBe(candles[0].timestamp);
      expect(gaps[0].gapEndTimestamp).toBe(candles[1].timestamp);
    });

    it('should interpolate missing bars using forward-fill with 0 volume', () => {
      const start = Date.UTC(2026, 3, 15, 10, 0, 0);
      const candles: NormalizedCandle[] = [
        {
          timestamp: new Date(start).toISOString(),
          open: '100.0000',
          high: '101.0000',
          low: '99.0000',
          close: '100.5000',
          volume: '1000',
          source: 'HISTORICAL',
          provider: 'TEST',
          isComplete: true,
        },
        {
          timestamp: new Date(start + 3 * 60 * 1000).toISOString(), // 3-minute gap
          open: '102.0000',
          high: '103.0000',
          low: '101.5000',
          close: '102.5000',
          volume: '1200',
          source: 'HISTORICAL',
          provider: 'TEST',
          isComplete: true,
        },
      ];

      const filled = CandleEngine.interpolateGaps(candles, '1m');
      expect(filled.length).toBe(4); // 10:00, 10:01, 10:02, 10:03

      // Synthetic bar at 10:01 should carry previous close 100.5000 with 0 volume
      expect(filled[1].close).toBe('100.5000');
      expect(filled[1].open).toBe('100.5000');
      expect(filled[1].volume).toBe('0');
      expect(filled[1].timestamp).toBe(new Date(start + 1 * 60 * 1000).toISOString());
    });
  });

  describe('3. Ingestion Deduplication & Storage Safety', () => {
    it('should deduplicate candle batches before insertion', () => {
      const bar = {
        timestamp: '2026-04-15T10:00:00.000Z',
        open: '100.0000',
        high: '102.0000',
        low: '99.0000',
        close: '101.0000',
        volume: '500',
        source: 'HISTORICAL' as const,
        provider: 'FEED',
        isComplete: true,
      };

      const duplicates = [bar, { ...bar, close: '101.5000' }, bar];
      const result = CandleEngine.deduplicateCandles(duplicates);

      expect(result.unique.length).toBe(1);
      expect(result.duplicatesCount).toBe(2);
      expect(result.unique[0].close).toBe('101.0000');
    });

    it('should safely merge duplicate candles into repository without conflict errors', async () => {
      const ts = new Date('2026-04-15T10:00:00.000Z');

      await marketDataRepo.insertCandles([
        {
          instrument_id: 1,
          interval: '1m',
          timestamp: ts,
          open: '2500.0000',
          high: '2510.0000',
          low: '2495.0000',
          close: '2505.0000',
          volume: '1000',
        },
      ]);

      // Re-insert identical composite key (instrument 1, 1m, ts) with updated close
      await marketDataRepo.insertCandles([
        {
          instrument_id: 1,
          interval: '1m',
          timestamp: ts,
          open: '2500.0000',
          high: '2512.0000',
          low: '2495.0000',
          close: '2511.0000',
          volume: '1200',
        },
      ]);

      const candles = await marketDataRepo.getCandles(1, '1m', 10);
      const matching = candles.filter((c) => c.timestamp === ts.toISOString());

      // Must have exactly 1 record with merged values
      expect(matching.length).toBe(1);
      expect(matching[0].close).toBe('2511.0000');
      expect(matching[0].volume).toBe('1200');
    });
  });

  describe('4. Anti-Lookahead Guarantee & Query Constraints', () => {
    it('should strictly exclude future bars when querying historical asOfTime', () => {
      const start = Date.UTC(2026, 3, 15, 10, 0, 0);
      const allBars: NormalizedCandle[] = [];

      for (let i = 0; i < 10; i++) {
        allBars.push({
          timestamp: new Date(start + i * 60 * 1000).toISOString(),
          open: (100 + i).toFixed(4),
          high: (105 + i).toFixed(4),
          low: (98 + i).toFixed(4),
          close: (102 + i).toFixed(4),
          volume: '1000',
          source: 'HISTORICAL',
          provider: 'TEST',
          isComplete: true,
        });
      }

      // Query as of 10:04:00 (index 4)
      const asOfTime = new Date(start + 4 * 60 * 1000).toISOString();
      const visibleBars = CandleEngine.filterAntiLookahead(allBars, asOfTime, '1m', true);

      // Bar at 10:04 closes at 10:05, so completed bars up to 10:04 are index 0, 1, 2, 3 (4 bars)
      expect(visibleBars.length).toBe(4);
      for (const bar of visibleBars) {
        const barCloseMs = new Date(bar.timestamp).getTime() + 60 * 1000;
        expect(barCloseMs).toBeLessThanOrEqual(new Date(asOfTime).getTime());
      }
    });

    it('should respect range windows and sorting directions in queryCandles', () => {
      const start = Date.UTC(2026, 3, 15, 10, 0, 0);
      const candles: NormalizedCandle[] = [];

      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: new Date(start + i * 60000).toISOString(),
          open: '100.0000',
          high: '105.0000',
          low: '95.0000',
          close: '101.0000',
          volume: '100',
          source: 'HISTORICAL',
          provider: 'TEST',
          isComplete: true,
        });
      }

      // Range query from index 5 to index 15
      const from = new Date(start + 5 * 60000).toISOString();
      const to = new Date(start + 15 * 60000).toISOString();

      const rangeResult = CandleEngine.queryCandles(candles, { from, to, ascending: true });
      expect(rangeResult.length).toBe(11);
      expect(rangeResult[0].timestamp).toBe(from);
      expect(rangeResult[rangeResult.length - 1].timestamp).toBe(to);

      // Reverse sorting query
      const descResult = CandleEngine.queryCandles(candles, { limit: 5, ascending: false });
      expect(descResult.length).toBe(5);
      expect(new Date(descResult[0].timestamp).getTime()).toBeGreaterThan(
        new Date(descResult[1].timestamp).getTime()
      );
    });
  });
});
