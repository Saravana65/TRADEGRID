import { Candle, QuantitativeStrategyType, SignalType } from '@tradegrid/shared-types';
import { IQuantitativeStrategy, StrategySignalResult } from './strategy.interface';
import { calculateBollingerBands } from '../indicators';

export class BollingerBandsStrategy implements IQuantitativeStrategy {
  readonly type: QuantitativeStrategyType = 'BOLLINGER_REVERSION';
  readonly name = 'Bollinger Bands Mean Reversion';
  readonly description =
    'Trades statistical price deviations relative to a 20-period moving average. Triggers BUY when price tags or dips below the Lower Band, and SELL at the Upper Band.';
  readonly defaultParams = {
    period: 20,
    multiplier: 2.0,
  };

  evaluate(candles: Candle[], params?: Record<string, any>): StrategySignalResult {
    const period = Number(params?.period ?? this.defaultParams.period);
    const multiplier = Number(params?.multiplier ?? this.defaultParams.multiplier);

    const closes = candles.map((c) => parseFloat(c.close));
    const { upper, middle, lower } = calculateBollingerBands(closes, period, multiplier);

    const signals: SignalType[] = new Array(candles.length).fill('HOLD');

    for (let i = 1; i < candles.length; i++) {
      const prevClose = closes[i - 1];
      const currClose = closes[i];
      const prevLower = lower[i - 1];
      const currLower = lower[i];
      const prevUpper = upper[i - 1];
      const currUpper = upper[i];

      if (
        prevLower !== null &&
        currLower !== null &&
        prevUpper !== null &&
        currUpper !== null
      ) {
        // Bullish bounce off lower band
        if (prevClose <= prevLower && currClose > currLower) {
          signals[i] = 'BUY';
        }
        // Bearish rejection from upper band
        else if (prevClose >= prevUpper && currClose < currUpper) {
          signals[i] = 'SELL';
        }
      }
    }

    return {
      signals,
      indicatorValues: {
        upperBand: upper,
        middleBand: middle,
        lowerBand: lower,
      },
      metadata: {
        name: this.name,
        description: this.description,
        parameters: { period, multiplier },
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
        explanation: 'Insufficient historical data to calculate Bollinger Bands.',
      };
    }

    const latestSignal = evalResult.signals[n - 1];
    const currClose = parseFloat(candles[n - 1].close);
    const upper = evalResult.indicatorValues.upperBand[n - 1];
    const middle = evalResult.indicatorValues.middleBand[n - 1];
    const lower = evalResult.indicatorValues.lowerBand[n - 1];

    let score = 0;
    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    let explanation = '';

    if (upper !== null && middle !== null && lower !== null) {
      const bandwidth = upper - lower;
      const percentB = bandwidth > 0 ? (currClose - lower) / bandwidth : 0.5;
      score = Math.round((0.5 - percentB) * 160); // Low %B gives positive buy score

      if (latestSignal === 'BUY') {
        strength = 'STRONG';
        score = 80;
        explanation = `Lower Band Bounce: Price bounced from Lower Band ($${lower.toFixed(2)}) back inside the envelope.`;
      } else if (latestSignal === 'SELL') {
        strength = 'STRONG';
        score = -80;
        explanation = `Upper Band Rejection: Price tagged Upper Band ($${upper.toFixed(2)}) and pulled back.`;
      } else if (currClose < lower) {
        strength = 'MODERATE';
        explanation = `Oversold Deviation: Price ($${currClose.toFixed(2)}) is stretched below the Lower Band ($${lower.toFixed(2)}).`;
      } else if (currClose > upper) {
        strength = 'MODERATE';
        explanation = `Overbought Deviation: Price ($${currClose.toFixed(2)}) is stretched above the Upper Band ($${upper.toFixed(2)}).`;
      } else {
        explanation = `Mean Band Zone: Price ($${currClose.toFixed(2)}) is oscillating within normal standard deviation bands.`;
      }
    } else {
      explanation = 'Bollinger Bands warming up; period requirement not yet met.';
    }

    return {
      signal: latestSignal,
      score,
      strength,
      indicatorValues: {
        upperBand: upper !== null ? Number(upper.toFixed(4)) : null,
        middleBand: middle !== null ? Number(middle.toFixed(4)) : null,
        lowerBand: lower !== null ? Number(lower.toFixed(4)) : null,
      },
      explanation,
    };
  }
}
