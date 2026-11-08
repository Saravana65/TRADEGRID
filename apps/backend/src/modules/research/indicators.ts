/**
 * Pure, deterministic technical indicator calculations for quantitative research and backtesting.
 * All functions operate chronologically (index 0 is oldest, index N-1 is newest).
 */

/**
 * Calculates Simple Moving Average (SMA)
 */
export function calculateSMA(values: number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error('Period must be greater than 0');
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  result[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }

  return result;
}

/**
 * Calculates Exponential Moving Average (EMA)
 * Uses standard multiplier: 2 / (period + 1)
 * Seeded with the SMA of the initial `period` items
 */
export function calculateEMA(values: number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error('Period must be greater than 0');
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;

  const k = 2 / (period + 1);

  // Initial seed is SMA
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += values[i];
  }
  let prevEma = initialSum / period;
  result[period - 1] = prevEma;

  for (let i = period; i < values.length; i++) {
    const currentEma = values[i] * k + prevEma * (1 - k);
    result[i] = currentEma;
    prevEma = currentEma;
  }

  return result;
}

/**
 * Calculates Relative Strength Index (RSI) using Wilder's smoothing method
 * Period default is typically 14
 */
export function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
  if (period <= 0) throw new Error('Period must be greater than 0');
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // First average gain and loss (SMA)
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);
  }

  // Subsequent values using Wilder's smoothing
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      result[i + 1] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i + 1] = 100 - 100 / (1 + rs);
    }
  }

  return result;
}

export interface MACDResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/**
 * Calculates Moving Average Convergence Divergence (MACD)
 * Fast EMA (default 12) - Slow EMA (default 26)
 * Signal line = EMA of MACD (default 9)
 */
export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  const macd: (number | null)[] = new Array(closes.length).fill(null);
  const validMacdValues: number[] = [];
  const validIndices: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      const val = (fastEMA[i] as number) - (slowEMA[i] as number);
      macd[i] = val;
      validMacdValues.push(val);
      validIndices.push(i);
    }
  }

  const signal: (number | null)[] = new Array(closes.length).fill(null);
  const histogram: (number | null)[] = new Array(closes.length).fill(null);

  if (validMacdValues.length >= signalPeriod) {
    const signalEma = calculateEMA(validMacdValues, signalPeriod);
    for (let j = 0; j < validIndices.length; j++) {
      const originalIdx = validIndices[j];
      const sigVal = signalEma[j];
      signal[originalIdx] = sigVal;
      if (sigVal !== null && macd[originalIdx] !== null) {
        histogram[originalIdx] = (macd[originalIdx] as number) - sigVal;
      }
    }
  }

  return { macd, signal, histogram };
}

export interface BollingerBandsResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

/**
 * Calculates Bollinger Bands (SMA +/- multiplier * standard deviation)
 */
export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  multiplier: number = 2
): BollingerBandsResult {
  const middle = calculateSMA(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const mid = middle[i];
    if (mid === null) continue;

    // Standard deviation of window
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - mid;
      sumSq += diff * diff;
    }
    const stdDev = Math.sqrt(sumSq / period);

    upper[i] = mid + multiplier * stdDev;
    lower[i] = mid - multiplier * stdDev;
  }

  return { upper, middle, lower };
}

export interface BreakoutResult {
  highestHigh: (number | null)[];
  lowestLow: (number | null)[];
}

/**
 * Calculates Breakout Channel (Donchian-style highest high and lowest low of previous N bars)
 * Note: Bar i's channel values exclude bar i to prevent lookahead bias!
 */
export function calculateBreakout(
  highs: number[],
  lows: number[],
  period: number = 20
): BreakoutResult {
  const highestHigh: (number | null)[] = new Array(highs.length).fill(null);
  const lowestLow: (number | null)[] = new Array(lows.length).fill(null);

  if (highs.length <= period) return { highestHigh, lowestLow };

  for (let i = period; i < highs.length; i++) {
    let maxHigh = -Infinity;
    let minLow = Infinity;
    // Look back period bars PRIOR to index i
    for (let j = i - period; j < i; j++) {
      if (highs[j] > maxHigh) maxHigh = highs[j];
      if (lows[j] < minLow) minLow = lows[j];
    }
    highestHigh[i] = maxHigh;
    lowestLow[i] = minLow;
  }

  return { highestHigh, lowestLow };
}

/**
 * Calculates Volume-Weighted Average Price (VWAP)
 * VWAP_t = sum(typicalPrice_i * volume_i) / sum(volume_i)
 * where typicalPrice = (high + low + close) / 3
 */
export function calculateVWAP(
  candles: { high: number; low: number; close: number; volume: number }[]
): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length === 0) return result;

  let cumulativeTypicalPriceVolume = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = Math.max(0, c.volume);

    cumulativeTypicalPriceVolume += typicalPrice * vol;
    cumulativeVolume += vol;

    if (cumulativeVolume > 0) {
      result[i] = cumulativeTypicalPriceVolume / cumulativeVolume;
    } else {
      result[i] = typicalPrice;
    }
  }

  return result;
}

export interface StochasticResult {
  k: (number | null)[];
  d: (number | null)[];
}

/**
 * Calculates Stochastic Oscillator (%K and %D)
 * %K_raw = ((Close - LowestLow_N) / (HighestHigh_N - LowestLow_N)) * 100
 * %K = SMA(%K_raw, slowing)
 * %D = SMA(%K, dPeriod)
 */
export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3,
  slowing: number = 3
): StochasticResult {
  const length = closes.length;
  const kRaw: (number | null)[] = new Array(length).fill(null);
  const kResult: (number | null)[] = new Array(length).fill(null);
  const dResult: (number | null)[] = new Array(length).fill(null);

  if (length < kPeriod || kPeriod <= 0 || dPeriod <= 0 || slowing <= 0) {
    return { k: kResult, d: dResult };
  }

  // 1. Calculate raw %K
  for (let i = kPeriod - 1; i < length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > highest) highest = highs[j];
      if (lows[j] < lowest) lowest = lows[j];
    }

    if (highest === lowest) {
      kRaw[i] = 50.0;
    } else {
      kRaw[i] = Math.min(100, Math.max(0, ((closes[i] - lowest) / (highest - lowest)) * 100));
    }
  }

  // 2. Smooth %K with slowing period (SMA)
  if (slowing === 1) {
    for (let i = 0; i < length; i++) {
      kResult[i] = kRaw[i];
    }
  } else {
    for (let i = kPeriod - 1 + slowing - 1; i < length; i++) {
      let sum = 0;
      let valid = true;
      for (let j = i - slowing + 1; j <= i; j++) {
        if (kRaw[j] === null) {
          valid = false;
          break;
        }
        sum += kRaw[j] as number;
      }
      if (valid) {
        kResult[i] = sum / slowing;
      }
    }
  }

  // 3. Calculate %D as SMA of %K over dPeriod
  for (let i = 0; i < length; i++) {
    if (i < dPeriod - 1) continue;
    let sum = 0;
    let valid = true;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (kResult[j] === null) {
        valid = false;
        break;
      }
      sum += kResult[j] as number;
    }
    if (valid) {
      dResult[i] = sum / dPeriod;
    }
  }

  return { k: kResult, d: dResult };
}

export interface VolumeProfileBinCalc {
  priceLow: number;
  priceHigh: number;
  midPrice: number;
  volume: number;
  percentage: number;
  isInValueArea: boolean;
}

export interface VolumeProfileCalcResult {
  bins: VolumeProfileBinCalc[];
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  totalVolume: number;
  valueAreaVolume: number;
  isEstimated: true;
  disclaimer: string;
}

/**
 * Calculates Estimated Volume Profile from OHLCV candles
 * Allocates bar volume across overlapping price bins, identifies Point of Control (POC),
 * and computes Value Area (VAH and VAL) enclosing the specified percentage of total volume.
 */
export function calculateVolumeProfile(
  candles: { high: number; low: number; close: number; volume: number }[],
  binsCount: number = 24,
  valueAreaPercent: number = 70
): VolumeProfileCalcResult {
  const disclaimer =
    'Derived estimated volume profile calculated from bar OHLCV. Not exchange tick-level order flow.';

  if (candles.length === 0) {
    return {
      bins: [],
      pocPrice: 0,
      vahPrice: 0,
      valPrice: 0,
      totalVolume: 0,
      valueAreaVolume: 0,
      isEstimated: true,
      disclaimer,
    };
  }

  const validCandles = candles.filter((c) => !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.volume));
  if (validCandles.length === 0) {
    return {
      bins: [],
      pocPrice: 0,
      vahPrice: 0,
      valPrice: 0,
      totalVolume: 0,
      valueAreaVolume: 0,
      isEstimated: true,
      disclaimer,
    };
  }

  let minLow = Infinity;
  let maxHigh = -Infinity;
  let totalVolume = 0;

  for (const c of validCandles) {
    if (c.low < minLow) minLow = c.low;
    if (c.high > maxHigh) maxHigh = c.high;
    totalVolume += Math.max(0, c.volume);
  }

  const actualBinsCount = Math.max(5, Math.min(100, binsCount));
  const range = maxHigh - minLow;

  if (range <= 0 || totalVolume <= 0) {
    const singleBin: VolumeProfileBinCalc = {
      priceLow: minLow,
      priceHigh: maxHigh,
      midPrice: minLow,
      volume: totalVolume,
      percentage: 100,
      isInValueArea: true,
    };
    return {
      bins: [singleBin],
      pocPrice: minLow,
      vahPrice: maxHigh,
      valPrice: minLow,
      totalVolume,
      valueAreaVolume: totalVolume,
      isEstimated: true,
      disclaimer,
    };
  }

  const binWidth = range / actualBinsCount;
  const bins: VolumeProfileBinCalc[] = [];

  for (let b = 0; b < actualBinsCount; b++) {
    const priceLow = minLow + b * binWidth;
    const priceHigh = minLow + (b + 1) * binWidth;
    bins.push({
      priceLow,
      priceHigh,
      midPrice: (priceLow + priceHigh) / 2,
      volume: 0,
      percentage: 0,
      isInValueArea: false,
    });
  }

  // Allocate candle volume into overlapping bins
  for (const c of validCandles) {
    const vol = Math.max(0, c.volume);
    if (vol === 0) continue;

    if (c.high === c.low) {
      const idx = Math.min(actualBinsCount - 1, Math.max(0, Math.floor((c.close - minLow) / binWidth)));
      bins[idx].volume += vol;
    } else {
      const startBin = Math.max(0, Math.min(actualBinsCount - 1, Math.floor((c.low - minLow) / binWidth)));
      const endBin = Math.max(0, Math.min(actualBinsCount - 1, Math.floor((c.high - minLow) / binWidth)));
      const overlapCount = Math.max(1, endBin - startBin + 1);
      const volPerBin = vol / overlapCount;

      for (let b = startBin; b <= endBin; b++) {
        bins[b].volume += volPerBin;
      }
    }
  }

  // Find Point of Control (POC) - bin with greatest volume
  let maxBinVol = -1;
  let pocIdx = 0;
  for (let b = 0; b < bins.length; b++) {
    if (bins[b].volume > maxBinVol) {
      maxBinVol = bins[b].volume;
      pocIdx = b;
    }
  }

  const pocPrice = bins[pocIdx].midPrice;

  // Calculate Value Area (expanding from POC outward until total >= valueAreaPercent %)
  const targetAreaVolume = totalVolume * (Math.min(95, Math.max(10, valueAreaPercent)) / 100);
  let lowIdx = pocIdx;
  let highIdx = pocIdx;
  let accumulatedVol = bins[pocIdx].volume;
  bins[pocIdx].isInValueArea = true;

  while (accumulatedVol < targetAreaVolume && (lowIdx > 0 || highIdx < actualBinsCount - 1)) {
    const nextLowVol = lowIdx > 0 ? bins[lowIdx - 1].volume : -1;
    const nextHighVol = highIdx < actualBinsCount - 1 ? bins[highIdx + 1].volume : -1;

    if (nextHighVol >= nextLowVol && highIdx < actualBinsCount - 1) {
      highIdx++;
      accumulatedVol += bins[highIdx].volume;
      bins[highIdx].isInValueArea = true;
    } else if (lowIdx > 0) {
      lowIdx--;
      accumulatedVol += bins[lowIdx].volume;
      bins[lowIdx].isInValueArea = true;
    } else if (highIdx < actualBinsCount - 1) {
      highIdx++;
      accumulatedVol += bins[highIdx].volume;
      bins[highIdx].isInValueArea = true;
    } else {
      break;
    }
  }

  for (let b = lowIdx; b <= highIdx; b++) {
    bins[b].isInValueArea = true;
  }

  const vahPrice = bins[highIdx].priceHigh;
  const valPrice = bins[lowIdx].priceLow;

  for (let b = 0; b < bins.length; b++) {
    bins[b].percentage = totalVolume > 0 ? (bins[b].volume / totalVolume) * 100 : 0;
  }

  return {
    bins,
    pocPrice,
    vahPrice,
    valPrice,
    totalVolume,
    valueAreaVolume: accumulatedVol,
    isEstimated: true,
    disclaimer,
  };
}

/**
 * Calculates sample standard deviation
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

