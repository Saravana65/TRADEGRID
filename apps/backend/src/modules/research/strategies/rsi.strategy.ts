import { Candle, QuantitativeStrategyType, SignalType } from '@tradegrid/shared-types';
import { IQuantitativeStrategy, StrategySignalResult } from './strategy.interface';
import { calculateRSI } from '../indicators';

export class RsiStrategy implements IQuantitativeStrategy {
  readonly type: QuantitativeStrategyType = 'RSI_MOMENTUM';
  readonly name = 'RSI Momentum & Mean Reversion';
  readonly description =
    'Identifies oversold and overbought conditions. Triggers BUY when RSI recovers from oversold levels, and SELL when RSI rolls over from overbought territory.';
  readonly defaultParams = {
    period: 14,
    oversold: 30,
    overbought: 70,
  };

  evaluate(candles: Candle[], params?: Record<string, any>): StrategySignalResult {
    const period = Number(params?.period ?? this.defaultParams.period);
    const oversold = Number(params?.oversold ?? this.defaultParams.oversold);
    const overbought = Number(params?.overbought ?? this.defaultParams.overbought);

    const closes = candles.map((c) => parseFloat(c.close));
    const rsi = calculateRSI(closes, period);

    const signals: SignalType[] = new Array(candles.length).fill('HOLD');

    for (let i = 1; i < candles.length; i++) {
      const prevRsi = rsi[i - 1];
      const currRsi = rsi[i];

      if (prevRsi !== null && currRsi !== null) {
        // Bullish bounce: RSI crosses above oversold boundary
        if (prevRsi <= oversold && currRsi > oversold) {
          signals[i] = 'BUY';
        }
        // Bearish exhaustion: RSI crosses below overbought boundary
        else if (prevRsi >= overbought && currRsi < overbought) {
          signals[i] = 'SELL';
        }
      }
    }

    return {
      signals,
      indicatorValues: {
        rsi,
      },
      metadata: {
        name: this.name,
        description: this.description,
        parameters: { period, oversold, overbought },
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
        explanation: 'Insufficient historical data to calculate RSI.',
      };
    }

    const latestSignal = evalResult.signals[n - 1];
    const currRsi = evalResult.indicatorValues.rsi[n - 1];
    const oversold = Number(params?.oversold ?? this.defaultParams.oversold);
    const overbought = Number(params?.overbought ?? this.defaultParams.overbought);

    let score = 0;
    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    let explanation = '';

    if (currRsi !== null) {
      // Scale RSI from 0..100 into -100..+100 score relative to 50
      score = Math.round((50 - currRsi) * 2); // Lower RSI = higher buying score

      if (latestSignal === 'BUY') {
        strength = 'STRONG';
        score = 80;
        explanation = `RSI Recovery: RSI (${currRsi.toFixed(1)}) crossed above oversold barrier (${oversold}).`;
      } else if (latestSignal === 'SELL') {
        strength = 'STRONG';
        score = -80;
        explanation = `RSI Reversal: RSI (${currRsi.toFixed(1)}) fell below overbought barrier (${overbought}).`;
      } else if (currRsi <= oversold) {
        strength = 'MODERATE';
        explanation = `Oversold Condition: RSI at ${currRsi.toFixed(1)} is below ${oversold}, suggesting potential impending bounce.`;
      } else if (currRsi >= overbought) {
        strength = 'MODERATE';
        explanation = `Overbought Condition: RSI at ${currRsi.toFixed(1)} is above ${overbought}, suggesting high risk of pullback.`;
      } else {
        explanation = `Neutral Momentum: RSI is ${currRsi.toFixed(1)}, within the normal ${oversold}–${overbought} zone.`;
      }
    } else {
      explanation = 'RSI still warming up; period requirement not yet met.';
    }

    return {
      signal: latestSignal,
      score,
      strength,
      indicatorValues: {
        rsi: currRsi !== null ? Number(currRsi.toFixed(2)) : null,
      },
      explanation,
    };
  }
}
