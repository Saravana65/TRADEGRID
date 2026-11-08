import { StrategyAST, ExpressionNode } from '../dsl/dsl.ast';
import { StrategySignal, StrategyExecutionResult } from '@tradegrid/shared-types';
import { MarketCandle } from './execution.types';
import { ASTEvaluator, EvaluationContext } from './ast.evaluator';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateVWAP,
} from '../../research/indicators';

export interface InterpreterOptions {
  maxExecutionTimeMs?: number;
  maxBars?: number;
}

export class StrategyInterpreter {
  public static readonly DEFAULT_MAX_TIME_MS = 5000;
  public static readonly DEFAULT_MAX_BARS = 10000;

  /**
   * Safely executes an AST strategy over historical candles without dynamic code evaluation.
   */
  public static execute(
    ast: StrategyAST,
    candles: MarketCandle[],
    options: InterpreterOptions = {}
  ): {
    signals: StrategySignal[];
    diagnostics: {
      executionTimeMs: number;
      barsProcessed: number;
      memoryUsedKb: number;
    };
  } {
    const startTime = Date.now();
    const maxTime = options.maxExecutionTimeMs ?? this.DEFAULT_MAX_TIME_MS;
    const maxBars = options.maxBars ?? this.DEFAULT_MAX_BARS;

    if (candles.length > maxBars) {
      throw new Error(`Execution candles (${candles.length}) exceed maximum allowed limit of ${maxBars}`);
    }

    if (candles.length === 0) {
      return {
        signals: [],
        diagnostics: {
          executionTimeMs: Date.now() - startTime,
          barsProcessed: 0,
          memoryUsedKb: Math.round(process.memoryUsage().heapUsed / 1024),
        },
      };
    }

    // 1. Prepare raw OHLCV series
    const opens = candles.map((c) => c.open);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);

    const series = { open: opens, high: highs, low: lows, close: closes, volume: volumes };

    // 2. Pre-calculate declared indicators
    const indicators: Record<string, (number | null)[]> = {};

    for (const ind of ast.indicators) {
      const funcName = ind.indicatorName.toUpperCase();
      const targetSeries = this.resolveSeries(ind.args[0], series, closes);

      switch (funcName) {
        case 'SMA': {
          const period = ind.args.length > 1 ? Number((ind.args[1] as any).value ?? 14) : 14;
          indicators[ind.name] = calculateSMA(targetSeries, period);
          break;
        }

        case 'EMA': {
          const period = ind.args.length > 1 ? Number((ind.args[1] as any).value ?? 14) : 14;
          indicators[ind.name] = calculateEMA(targetSeries, period);
          break;
        }

        case 'RSI': {
          const period = ind.args.length > 1 ? Number((ind.args[1] as any).value ?? 14) : 14;
          indicators[ind.name] = calculateRSI(targetSeries, period);
          break;
        }

        case 'MACD': {
          const fast = ind.args.length > 1 ? Number((ind.args[1] as any).value ?? 12) : 12;
          const slow = ind.args.length > 2 ? Number((ind.args[2] as any).value ?? 26) : 26;
          const signal = ind.args.length > 3 ? Number((ind.args[3] as any).value ?? 9) : 9;
          const res = calculateMACD(targetSeries, fast, slow, signal);
          indicators[ind.name] = res.macd;
          indicators[`${ind.name}_signal`] = res.signal;
          indicators[`${ind.name}_hist`] = res.histogram;
          break;
        }

        case 'BOLLINGERBANDS': {
          const period = ind.args.length > 1 ? Number((ind.args[1] as any).value ?? 20) : 20;
          const mult = ind.args.length > 2 ? Number((ind.args[2] as any).value ?? 2) : 2;
          const res = calculateBollingerBands(targetSeries, period, mult);
          indicators[ind.name] = res.middle;
          indicators[`${ind.name}_upper`] = res.upper;
          indicators[`${ind.name}_lower`] = res.lower;
          break;
        }

        case 'VWAP': {
          // VWAP takes full OHLCV candles
          const researchCandles = candles.map((c) => ({
            timestamp: new Date(c.timestamp),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));
          indicators[ind.name] = calculateVWAP(researchCandles);
          break;
        }

        default:
          throw new Error(`Unsupported indicator function: ${ind.indicatorName}`);
      }
    }

    // 3. Chronological Sequential Bar-by-Bar Evaluation
    const signals: StrategySignal[] = [];
    let inPosition = false;

    for (let t = 0; t < candles.length; t++) {
      // Periodic timeout check
      if (t % 100 === 0 && Date.now() - startTime > maxTime) {
        throw new Error('STRATEGY_EXECUTION_TIMED_OUT');
      }

      // Ensure all indicators are warmed up (non-null at bar t) before evaluating signals
      const allWarmedUp = Object.values(indicators).every(
        (arr) => arr[t] !== null && arr[t] !== undefined && !isNaN(arr[t] as number)
      );
      if (!allWarmedUp) continue;

      const evalCtx: EvaluationContext = {
        barIndex: t,
        series,
        indicators,
      };

      // Collect indicator snapshot at current bar
      const indicatorSnapshot: Record<string, number> = {};
      for (const [k, arr] of Object.entries(indicators)) {
        const v = arr[t];
        if (v !== null && v !== undefined && !isNaN(v)) {
          indicatorSnapshot[k] = Math.round(v * 10000) / 10000;
        }
      }

      // Check Entry Conditions (All entry lines must be true)
      const entrySatisfied =
        ast.entryConditions.length > 0 &&
        ast.entryConditions.every((cond) => Boolean(ASTEvaluator.evaluate(cond, evalCtx)));

      // Check Exit Conditions (Any exit line being true triggers exit)
      const exitSatisfied =
        ast.exitConditions.length > 0 &&
        ast.exitConditions.some((cond) => Boolean(ASTEvaluator.evaluate(cond, evalCtx)));

      const currentCandle = candles[t];
      const timestampStr =
        currentCandle.timestamp instanceof Date
          ? currentCandle.timestamp.toISOString()
          : new Date(currentCandle.timestamp).toISOString();

      if (entrySatisfied && !inPosition) {
        signals.push({
          timestamp: timestampStr,
          signalType: 'BUY',
          price: currentCandle.close,
          reason: 'Entry conditions satisfied',
          indicatorValues: indicatorSnapshot,
        });
        inPosition = true;
      } else if (exitSatisfied && inPosition) {
        signals.push({
          timestamp: timestampStr,
          signalType: 'SELL',
          price: currentCandle.close,
          reason: 'Exit conditions satisfied',
          indicatorValues: indicatorSnapshot,
        });
        inPosition = false;
      }
    }

    const duration = Date.now() - startTime;
    return {
      signals,
      diagnostics: {
        executionTimeMs: duration,
        barsProcessed: candles.length,
        memoryUsedKb: Math.round(process.memoryUsage().heapUsed / 1024),
      },
    };
  }

  private static resolveSeries(
    argNode: ExpressionNode | undefined,
    series: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] },
    defaultCloses: number[]
  ): number[] {
    if (!argNode) return defaultCloses;
    if (argNode.type === 'SeriesRef') {
      return series[argNode.series] ?? defaultCloses;
    }
    return defaultCloses;
  }
}
