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
 * Calculates sample standard deviation
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
