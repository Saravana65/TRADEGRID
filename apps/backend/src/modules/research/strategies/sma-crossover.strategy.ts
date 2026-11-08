import { Candle, QuantitativeStrategyType, SignalType } from '@tradegrid/shared-types';
import { IQuantitativeStrategy, StrategySignalResult } from './strategy.interface';
import { calculateSMA } from '../indicators';

export class SmaCrossoverStrategy implements IQuantitativeStrategy {
  readonly type: QuantitativeStrategyType = 'SMA_CROSSOVER';
  readonly name = 'Simple Moving Average (SMA) Crossover';
  readonly description =
    'Generates BUY signals when a Fast SMA crosses above a Slow SMA (golden cross), and SELL signals when it crosses below (death cross).';
  readonly defaultParams = {
    fastPeriod: 10,
    slowPeriod: 30,
  };

  evaluate(candles: Candle[], params?: Record<string, any>): StrategySignalResult {
    const fastPeriod = Number(params?.fastPeriod ?? this.defaultParams.fastPeriod);
    const slowPeriod = Number(params?.slowPeriod ?? this.defaultParams.slowPeriod);

    const closes = candles.map((c) => parseFloat(c.close));
    const fastSMA = calculateSMA(closes, fastPeriod);
    const slowSMA = calculateSMA(closes, slowPeriod);

    const signals: SignalType[] = new Array(candles.length).fill('HOLD');

    for (let i = 1; i < candles.length; i++) {
      const prevFast = fastSMA[i - 1];
      const prevSlow = slowSMA[i - 1];
      const currFast = fastSMA[i];
      const currSlow = slowSMA[i];

      if (
        prevFast !== null &&
        prevSlow !== null &&
        currFast !== null &&
        currSlow !== null
      ) {
        // Bullish crossover (Fast crosses above Slow)
        if (prevFast <= prevSlow && currFast > currSlow) {
          signals[i] = 'BUY';
        }
        // Bearish crossunder (Fast crosses below Slow)
        else if (prevFast >= prevSlow && currFast < currSlow) {
          signals[i] = 'SELL';
        }
      }
    }

    return {
      signals,
      indicatorValues: {
        fastSMA,
        slowSMA,
      },
      metadata: {
        name: this.name,
        description: this.description,
        parameters: { fastPeriod, slowPeriod },
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
        explanation: 'Insufficient historical data to calculate moving averages.',
      };
    }

    const latestSignal = evalResult.signals[n - 1];
    const fastVal = evalResult.indicatorValues.fastSMA[n - 1];
    const slowVal = evalResult.indicatorValues.slowSMA[n - 1];
    const prevFast = n > 1 ? evalResult.indicatorValues.fastSMA[n - 2] : null;
    const prevSlow = n > 1 ? evalResult.indicatorValues.slowSMA[n - 2] : null;

    let score = 0;
    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    let explanation = '';

    if (fastVal !== null && slowVal !== null) {
      const spreadPct = ((fastVal - slowVal) / slowVal) * 100;
      score = Math.max(-100, Math.min(100, Math.round(spreadPct * 10)));

      if (latestSignal === 'BUY') {
        strength = 'STRONG';
        score = 80;
        explanation = `Golden Cross: Fast SMA (${fastVal.toFixed(2)}) crossed above Slow SMA (${slowVal.toFixed(2)}).`;
      } else if (latestSignal === 'SELL') {
        strength = 'STRONG';
        score = -80;
        explanation = `Death Cross: Fast SMA (${fastVal.toFixed(2)}) crossed below Slow SMA (${slowVal.toFixed(2)}).`;
      } else if (fastVal > slowVal) {
        strength = Math.abs(spreadPct) > 2 ? 'MODERATE' : 'WEAK';
        explanation = `Bullish Trend: Fast SMA (${fastVal.toFixed(2)}) is above Slow SMA (${slowVal.toFixed(2)}) by ${Math.abs(spreadPct).toFixed(2)}%.`;
      } else {
        strength = Math.abs(spreadPct) > 2 ? 'MODERATE' : 'WEAK';
        explanation = `Bearish Trend: Fast SMA (${fastVal.toFixed(2)}) is below Slow SMA (${slowVal.toFixed(2)}) by ${Math.abs(spreadPct).toFixed(2)}%.`;
      }
    } else {
      explanation = 'Moving averages still warming up; period requirement not yet met.';
    }

    return {
      signal: latestSignal,
      score,
      strength,
      indicatorValues: {
        fastSMA: fastVal !== null ? Number(fastVal.toFixed(4)) : null,
        slowSMA: slowVal !== null ? Number(slowVal.toFixed(4)) : null,
      },
      explanation,
    };
  }
}
