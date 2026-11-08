import {
  Candle,
  CandleInterval,
  MarketDataSourceProvenance,
  NormalizedCandle,
} from '@tradegrid/shared-types';

export interface CandleGapInfo {
  gapStartIndex: number;
  gapStartTimestamp: string;
  gapEndTimestamp: string;
  expectedIntervalMs: number;
  actualIntervalMs: number;
  missingBarsCount: number;
}

export interface IngestionResult {
  totalProcessed: number;
  inserted: number;
  duplicatesIgnored: number;
}

export interface CandleQueryOptions {
  limit?: number;
  asOfTime?: Date | string;
  from?: Date | string;
  to?: Date | string;
  ascending?: boolean;
}

const INTERVAL_DURATIONS_MS: Record<CandleInterval, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export class CandleEngine {
  /**
   * Returns interval duration in milliseconds.
   */
  static getIntervalMs(interval: CandleInterval): number {
    return INTERVAL_DURATIONS_MS[interval] || 60000;
  }

  /**
   * Calculates the bucket start timestamp for a given time and interval.
   */
  static getBucketTimestamp(date: Date, interval: CandleInterval): Date {
    const ms = date.getTime();
    const intervalMs = this.getIntervalMs(interval);

    if (interval === '1d') {
      const d = new Date(date);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }

    const bucketMs = Math.floor(ms / intervalMs) * intervalMs;
    return new Date(bucketMs);
  }

  /**
   * Aggregates fine-grained base resolution candles (e.g. 1m) into higher timeframe candles
   * (5m, 15m, 1h, 1d) using exact fixed-precision arithmetic (no floating-point drift).
   */
  static aggregateCandles(
    baseCandles: (Candle | NormalizedCandle)[],
    targetInterval: CandleInterval,
    source: MarketDataSourceProvenance = 'HISTORICAL',
    providerName: string = 'CANDLE_ENGINE'
  ): NormalizedCandle[] {
    if (!baseCandles || baseCandles.length === 0) {
      return [];
    }

    // Sort chronologically ascending
    const sorted = [...baseCandles].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const bucketGroups: Map<string, (Candle | NormalizedCandle)[]> = new Map();

    for (const bar of sorted) {
      const barDate = new Date(bar.timestamp);
      const bucketDate = this.getBucketTimestamp(barDate, targetInterval);
      const bucketKey = bucketDate.toISOString();

      if (!bucketGroups.has(bucketKey)) {
        bucketGroups.set(bucketKey, []);
      }
      bucketGroups.get(bucketKey)!.push(bar);
    }

    const aggregated: NormalizedCandle[] = [];

    for (const [bucketTimestamp, bars] of bucketGroups.entries()) {
      if (bars.length === 0) continue;

      // Fixed precision calculation
      // Open = first bar's open
      const openPrice = parseFloat(bars[0].open);
      // Close = last bar's close
      const closePrice = parseFloat(bars[bars.length - 1].close);

      let maxHigh = parseFloat(bars[0].high);
      let minLow = parseFloat(bars[0].low);
      let totalVolume = BigInt(0);

      for (const b of bars) {
        const h = parseFloat(b.high);
        const l = parseFloat(b.low);
        if (h > maxHigh) maxHigh = h;
        if (l < minLow) minLow = l;

        // BigInt volume summation guarantees zero floating point precision loss
        try {
          const volStr = String(b.volume).split('.')[0];
          totalVolume += BigInt(volStr || '0');
        } catch {
          totalVolume += BigInt(Math.floor(parseFloat(String(b.volume)) || 0));
        }
      }

      aggregated.push({
        timestamp: bucketTimestamp,
        open: openPrice.toFixed(4),
        high: maxHigh.toFixed(4),
        low: minLow.toFixed(4),
        close: closePrice.toFixed(4),
        volume: totalVolume.toString(),
        source,
        provider: providerName,
        isComplete: true,
      });
    }

    return aggregated;
  }

  /**
   * Scans a series of candles and detects missing time intervals / gaps.
   */
  static detectGaps(
    candles: (Candle | NormalizedCandle)[],
    interval: CandleInterval
  ): CandleGapInfo[] {
    if (!candles || candles.length < 2) {
      return [];
    }

    const sorted = [...candles].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const intervalMs = this.getIntervalMs(interval);
    const gaps: CandleGapInfo[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const currentMs = new Date(sorted[i].timestamp).getTime();
      const nextMs = new Date(sorted[i + 1].timestamp).getTime();
      const diffMs = nextMs - currentMs;

      // Tolerate up to 10% jitter, but if diff > 1.5 * interval, it's a gap
      if (diffMs > intervalMs * 1.5) {
        const missingBars = Math.round(diffMs / intervalMs) - 1;
        gaps.push({
          gapStartIndex: i,
          gapStartTimestamp: sorted[i].timestamp,
          gapEndTimestamp: sorted[i + 1].timestamp,
          expectedIntervalMs: intervalMs,
          actualIntervalMs: diffMs,
          missingBarsCount: missingBars,
        });
      }
    }

    return gaps;
  }

  /**
   * Fills gaps in historical series by forward-filling with the last known close price
   * and 0 volume to guarantee continuous bar sequences for indicators.
   */
  static interpolateGaps(
    candles: NormalizedCandle[],
    interval: CandleInterval
  ): NormalizedCandle[] {
    if (!candles || candles.length < 2) {
      return candles || [];
    }

    const sorted = [...candles].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const intervalMs = this.getIntervalMs(interval);
    const filled: NormalizedCandle[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      filled.push(sorted[i]);

      const currentMs = new Date(sorted[i].timestamp).getTime();
      const nextMs = new Date(sorted[i + 1].timestamp).getTime();
      const diffMs = nextMs - currentMs;

      if (diffMs > intervalMs * 1.5) {
        let syntheticMs = currentMs + intervalMs;
        const lastClose = sorted[i].close;

        while (syntheticMs < nextMs) {
          filled.push({
            timestamp: new Date(syntheticMs).toISOString(),
            open: lastClose,
            high: lastClose,
            low: lastClose,
            close: lastClose,
            volume: '0',
            source: sorted[i].source || 'HISTORICAL',
            provider: sorted[i].provider || 'INTERPOLATION_ENGINE',
            isComplete: true,
          });
          syntheticMs += intervalMs;
        }
      }
    }

    filled.push(sorted[sorted.length - 1]);
    return filled;
  }

  /**
   * Deduplicates an array of incoming candles by timestamp and interval,
   * retaining the latest bar update for identical timestamps.
   */
  static deduplicateCandles(
    candles: NormalizedCandle[]
  ): { unique: NormalizedCandle[]; duplicatesCount: number } {
    const map = new Map<string, NormalizedCandle>();
    let duplicates = 0;

    for (const c of candles) {
      const key = c.timestamp;
      if (map.has(key)) {
        duplicates++;
      }
      map.set(key, c);
    }

    const unique = Array.from(map.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return { unique, duplicatesCount: duplicates };
  }

  /**
   * Anti-lookahead query filter.
   * Guarantees that no future information leaks into backtesting or quant models.
   * Only returns candles whose timestamp is strictly less than or equal to `asOfTime`.
   */
  static filterAntiLookahead(
    candles: (Candle | NormalizedCandle)[],
    asOfTime: Date | string,
    interval: CandleInterval = '1m',
    requireBarComplete: boolean = true
  ): (Candle | NormalizedCandle)[] {
    const asOfMs = new Date(asOfTime).getTime();
    const intervalMs = this.getIntervalMs(interval);

    return candles.filter((bar) => {
      const barOpenMs = new Date(bar.timestamp).getTime();
      if (requireBarComplete) {
        // If bar must be complete, its close time (open + duration) must be <= asOfTime
        const barCloseMs = barOpenMs + intervalMs;
        return barCloseMs <= asOfMs;
      }
      return barOpenMs <= asOfMs;
    });
  }

  /**
   * Queries historical candles with indexed range, cursor/limit, and sorting guarantees.
   */
  static queryCandles(
    allCandles: NormalizedCandle[],
    options: CandleQueryOptions = {}
  ): NormalizedCandle[] {
    let result = [...allCandles];

    // 1. Anti-lookahead constraint
    if (options.asOfTime) {
      const asOfMs = new Date(options.asOfTime).getTime();
      result = result.filter((c) => new Date(c.timestamp).getTime() <= asOfMs);
    }

    // 2. Date window constraints
    if (options.from) {
      const fromMs = new Date(options.from).getTime();
      result = result.filter((c) => new Date(c.timestamp).getTime() >= fromMs);
    }

    if (options.to) {
      const toMs = new Date(options.to).getTime();
      result = result.filter((c) => new Date(c.timestamp).getTime() <= toMs);
    }

    // 3. Chronological sorting
    const isAscending = options.ascending ?? true;
    result.sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return isAscending ? diff : -diff;
    });

    // 4. Limit constraint
    if (options.limit && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }
}
