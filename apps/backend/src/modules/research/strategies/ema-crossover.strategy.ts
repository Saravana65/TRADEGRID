import { Candle, QuantitativeStrategyType, SignalType } from '@tradegrid/shared-types';
import { IQuantitativeStrategy, StrategySignalResult } from './strategy.interface';
import { calculateEMA } from '../indicators';

export class EmaCrossoverStrategy implements IQuantitativeStrategy {
  readonly type: QuantitativeStrategyType = 'EMA_CROSSOVER';
  readonly name = 'Exponential Moving Average (EMA) Crossover';
  readonly description =
    'Generates fast-reacting momentum signals when a Fast EMA crosses above or below a Slow EMA.';
  readonly defaultParams = {
    fastPeriod: 12,
    slowPeriod: 26,
  };

  evaluate(candles: Candle[], params?: Record<string, any>): StrategySignalResult {
    const fastPeriod = Number(params?.fastPeriod ?? this.defaultParams.fastPeriod);
    const slowPeriod = Number(params?.slowPeriod ?? this.defaultParams.slowPeriod);

    const closes = candles.map((c) => parseFloat(c.close));
    const fastEMA = calculateEMA(closes, fastPeriod);
    const slowEMA = calculateEMA(closes, slowPeriod);

    const signals: SignalType[] = new Array(candles.length).fill('HOLD');

    for (let i = 1; i < candles.length; i++) {
      const prevFast = fastEMA[i - 1];
      const prevSlow = slowEMA[i - 1];
      const currFast = fastEMA[i];
      const currSlow = slowEMA[i];

      if (
        prevFast !== null &&
        prevSlow !== null &&
        currFast !== null &&
        currSlow !== null
      ) {
        if (prevFast <= prevSlow && currFast > currSlow) {
          signals[i] = 'BUY';
        } else if (prevFast >= prevSlow && currFast < currSlow) {
          signals[i] = 'SELL';
        }
      }
    }

    return {
      signals,
      indicatorValues: {
        fastEMA,
        slowEMA,
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
        explanation: 'Insufficient historical data to calculate exponential moving averages.',
      };
    }

    const latestSignal = evalResult.signals[n - 1];
    const fastVal = evalResult.indicatorValues.fastEMA[n - 1];
    const slowVal = evalResult.indicatorValues.slowEMA[n - 1];

    let score = 0;
    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    let explanation = '';

    if (fastVal !== null && slowVal !== null) {
      const spreadPct = ((fastVal - slowVal) / slowVal) * 100;
      score = Math.max(-100, Math.min(100, Math.round(spreadPct * 12)));

      if (latestSignal === 'BUY') {
        strength = 'STRONG';
        score = 85;
        explanation = `Bullish EMA Crossover: Fast EMA (${fastVal.toFixed(2)}) crossed above Slow EMA (${slowVal.toFixed(2)}).`;
      } else if (latestSignal === 'SELL') {
        strength = 'STRONG';
        score = -85;
        explanation = `Bearish EMA Crossunder: Fast EMA (${fastVal.toFixed(2)}) crossed below Slow EMA (${slowVal.toFixed(2)}).`;
      } else if (fastVal > slowVal) {
        strength = Math.abs(spreadPct) > 1.5 ? 'MODERATE' : 'WEAK';
        explanation = `EMA Trend Positive: Fast EMA (${fastVal.toFixed(2)}) leads Slow EMA (${slowVal.toFixed(2)}) by ${Math.abs(spreadPct).toFixed(2)}%.`;
      } else {
        strength = Math.abs(spreadPct) > 1.5 ? 'MODERATE' : 'WEAK';
        explanation = `EMA Trend Negative: Fast EMA (${fastVal.toFixed(2)}) lags Slow EMA (${slowVal.toFixed(2)}) by ${Math.abs(spreadPct).toFixed(2)}%.`;
      }
    } else {
      explanation = 'Exponential moving averages still warming up; period requirement not yet met.';
    }

    return {
      signal: latestSignal,
      score,
      strength,
      indicatorValues: {
        fastEMA: fastVal !== null ? Number(fastVal.toFixed(4)) : null,
        slowEMA: slowVal !== null ? Number(slowVal.toFixed(4)) : null,
      },
      explanation,
    };
  }
}
