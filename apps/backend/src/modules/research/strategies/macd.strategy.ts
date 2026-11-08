import { Candle, QuantitativeStrategyType, SignalType } from '@tradegrid/shared-types';
import { IQuantitativeStrategy, StrategySignalResult } from './strategy.interface';
import { calculateMACD } from '../indicators';

export class MacdStrategy implements IQuantitativeStrategy {
  readonly type: QuantitativeStrategyType = 'MACD_TREND';
  readonly name = 'MACD Trend & Momentum Strategy';
  readonly description =
    'Tracks MACD line crossovers with the 9-period Signal line to capture emerging trend momentum and reversals.';
  readonly defaultParams = {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
  };

  evaluate(candles: Candle[], params?: Record<string, any>): StrategySignalResult {
    const fastPeriod = Number(params?.fastPeriod ?? this.defaultParams.fastPeriod);
    const slowPeriod = Number(params?.slowPeriod ?? this.defaultParams.slowPeriod);
    const signalPeriod = Number(params?.signalPeriod ?? this.defaultParams.signalPeriod);

    const closes = candles.map((c) => parseFloat(c.close));
    const { macd, signal, histogram } = calculateMACD(
      closes,
      fastPeriod,
      slowPeriod,
      signalPeriod
    );

    const signals: SignalType[] = new Array(candles.length).fill('HOLD');

    for (let i = 1; i < candles.length; i++) {
      const prevMacd = macd[i - 1];
      const prevSig = signal[i - 1];
      const currMacd = macd[i];
      const currSig = signal[i];

      if (
        prevMacd !== null &&
        prevSig !== null &&
        currMacd !== null &&
        currSig !== null
      ) {
        // Bullish crossover (MACD crosses above Signal)
        if (prevMacd <= prevSig && currMacd > currSig) {
          signals[i] = 'BUY';
        }
        // Bearish crossunder (MACD crosses below Signal)
        else if (prevMacd >= prevSig && currMacd < currSig) {
          signals[i] = 'SELL';
        }
      }
    }

    return {
      signals,
      indicatorValues: {
        macd,
        signal,
        histogram,
      },
      metadata: {
        name: this.name,
        description: this.description,
        parameters: { fastPeriod, slowPeriod, signalPeriod },
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
        explanation: 'Insufficient historical data to calculate MACD.',
      };
    }

    const latestSignal = evalResult.signals[n - 1];
    const currMacd = evalResult.indicatorValues.macd[n - 1];
    const currSig = evalResult.indicatorValues.signal[n - 1];
    const currHist = evalResult.indicatorValues.histogram[n - 1];

    let score = 0;
    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    let explanation = '';

    if (currMacd !== null && currSig !== null && currHist !== null) {
      score = currHist > 0 ? Math.min(100, Math.round(currHist * 20)) : Math.max(-100, Math.round(currHist * 20));

      if (latestSignal === 'BUY') {
        strength = 'STRONG';
        score = 85;
        explanation = `Bullish MACD Cross: MACD (${currMacd.toFixed(2)}) crossed above Signal line (${currSig.toFixed(2)}).`;
      } else if (latestSignal === 'SELL') {
        strength = 'STRONG';
        score = -85;
        explanation = `Bearish MACD Cross: MACD (${currMacd.toFixed(2)}) crossed below Signal line (${currSig.toFixed(2)}).`;
      } else if (currHist > 0) {
        strength = 'MODERATE';
        explanation = `Positive Momentum: MACD histogram is positive (+${currHist.toFixed(2)}), confirming upward bias.`;
      } else {
        strength = 'MODERATE';
        explanation = `Negative Momentum: MACD histogram is negative (${currHist.toFixed(2)}), confirming downward bias.`;
      }
    } else {
      explanation = 'MACD indicators warming up; minimum data requirements not yet satisfied.';
    }

    return {
      signal: latestSignal,
      score,
      strength,
      indicatorValues: {
        macd: currMacd !== null ? Number(currMacd.toFixed(4)) : null,
        signal: currSig !== null ? Number(currSig.toFixed(4)) : null,
        histogram: currHist !== null ? Number(currHist.toFixed(4)) : null,
      },
      explanation,
    };
  }
}
