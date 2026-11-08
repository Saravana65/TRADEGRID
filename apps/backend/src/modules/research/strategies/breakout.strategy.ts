import { Candle, QuantitativeStrategyType, SignalType } from '@tradegrid/shared-types';
import { IQuantitativeStrategy, StrategySignalResult } from './strategy.interface';
import { calculateBreakout } from '../indicators';

export class BreakoutStrategy implements IQuantitativeStrategy {
  readonly type: QuantitativeStrategyType = 'BREAKOUT';
  readonly name = 'Donchian Channel Breakout';
  readonly description =
    'Trend-following breakout strategy. Enters BUY when price breaches the highest high of the previous N bars, and exits or SELLs when price drops below the lowest low of the previous N bars.';
  readonly defaultParams = {
    period: 20,
  };

  evaluate(candles: Candle[], params?: Record<string, any>): StrategySignalResult {
    const period = Number(params?.period ?? this.defaultParams.period);

    const highs = candles.map((c) => parseFloat(c.high));
    const lows = candles.map((c) => parseFloat(c.low));
    const closes = candles.map((c) => parseFloat(c.close));

    const { highestHigh, lowestLow } = calculateBreakout(highs, lows, period);

    const signals: SignalType[] = new Array(candles.length).fill('HOLD');

    for (let i = period; i < candles.length; i++) {
      const currClose = closes[i];
      const hHigh = highestHigh[i];
      const lLow = lowestLow[i];

      if (hHigh !== null && lLow !== null) {
        // Bullish breakout above previous N-period high
        if (currClose > hHigh) {
          signals[i] = 'BUY';
        }
        // Bearish breakdown below previous N-period low
        else if (currClose < lLow) {
          signals[i] = 'SELL';
        }
      }
    }

    return {
      signals,
      indicatorValues: {
        highestHigh,
        lowestLow,
      },
      metadata: {
        name: this.name,
        description: this.description,
        parameters: { period },
      },
    };
  }

  evaluateLatest(
    candles: Candle[],
    params?: Record<string, any>
  ): {
    signal: SignalType;
    score: number;
    strength: 'WEAK' | 'MODERATE' | 'STRONG';
    indicatorValues: Record<string, number | string | null>;
    explanation: string;
  } {
    const evalResult = this.evaluate(candles, params);
    const n = candles.length;
    if (n === 0) {
      return {
        signal: 'HOLD',
        score: 0,
        strength: 'WEAK',
        indicatorValues: {},
        explanation: 'Insufficient historical data to calculate breakout levels.',
      };
    }

    const latestSignal = evalResult.signals[n - 1];
    const currClose = parseFloat(candles[n - 1].close);
    const hHigh = evalResult.indicatorValues.highestHigh[n - 1];
    const lLow = evalResult.indicatorValues.lowestLow[n - 1];
    const period = Number(params?.period ?? this.defaultParams.period);

    let score = 0;
    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    let explanation = '';

    if (hHigh !== null && lLow !== null) {
      if (latestSignal === 'BUY') {
        strength = 'STRONG';
        score = 90;
        explanation = `New High Breakout: Close ($${currClose.toFixed(2)}) broke above ${period}-bar high ($${hHigh.toFixed(2)}).`;
      } else if (latestSignal === 'SELL') {
        strength = 'STRONG';
        score = -90;
        explanation = `New Low Breakdown: Close ($${currClose.toFixed(2)}) collapsed below ${period}-bar low ($${lLow.toFixed(2)}).`;
      } else {
        const range = hHigh - lLow;
        const pos = range > 0 ? (currClose - lLow) / range : 0.5;
        score = Math.round((pos - 0.5) * 140);
        strength = Math.abs(score) > 40 ? 'MODERATE' : 'WEAK';
        explanation = `Trading Range: Price ($${currClose.toFixed(2)}) is consolidating between ${period}-bar low ($${lLow.toFixed(2)}) and high ($${hHigh.toFixed(2)}).`;
      }
    } else {
      explanation = 'Breakout channel requires more bars to establish lookback boundary.';
    }

    return {
      signal: latestSignal,
      score,
      strength,
      indicatorValues: {
        highestHigh: hHigh !== null ? Number(hHigh.toFixed(4)) : null,
        lowestLow: lLow !== null ? Number(lLow.toFixed(4)) : null,
      },
      explanation,
    };
  }
}
