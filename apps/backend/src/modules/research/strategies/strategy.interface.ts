import { Candle, QuantitativeStrategyType, SignalType } from '@tradegrid/shared-types';

export interface StrategySignalResult {
  signals: SignalType[]; // Array corresponding index-by-index to input candles
  indicatorValues: Record<string, (number | null)[]>;
  metadata: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface IQuantitativeStrategy {
  readonly type: QuantitativeStrategyType;
  readonly name: string;
  readonly description: string;
  readonly defaultParams: Record<string, any>;

  /**
   * Evaluates historical candle series and emits BUY/SELL/HOLD signals for each candle.
   * MUST NOT exhibit look-ahead bias: at candle index i, signal decisions only use data up to i.
   */
  evaluate(candles: Candle[], params?: Record<string, any>): StrategySignalResult;

  /**
   * Evaluates the latest market state for an instrument and generates a current actionable signal with reasoning.
   */
  evaluateLatest(
    candles: Candle[],
    params?: Record<string, any>
  ): {
    signal: SignalType;
    score: number; // -100 to +100
    strength: 'WEAK' | 'MODERATE' | 'STRONG';
    indicatorValues: Record<string, number | string | null>;
    explanation: string;
  };
}
