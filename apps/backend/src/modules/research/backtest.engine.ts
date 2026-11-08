import {
  BacktestEquityPoint,
  BacktestExitReason,
  BacktestParameters,
  BacktestResult,
  BacktestTrade,
  Candle,
} from '@tradegrid/shared-types';
import { StrategyRegistry } from './strategies';
import { MetricsCalculator } from './metrics.calculator';
import { HistoricalDataService, historicalDataService as defaultHistoricalDataService } from './historical-data.service';
import { aiInsightsService } from './ai-insights.service';

export class BacktestEngine {
  constructor(
    private readonly historicalData: HistoricalDataService = defaultHistoricalDataService
  ) {}

  /**
   * Executes a server-authoritative backtest run against historical candles.
   * Strictly enforces anti-lookahead bias, realistic slippage, commissions,
   * position sizing, and stop-loss / take-profit mechanisms.
   */
  async runBacktest(
    userId: number,
    params: BacktestParameters & { includeAIAnalysis?: boolean }
  ): Promise<BacktestResult> {
    const startTimeMs = Date.now();

    // 1. Fetch validated historical candle data
    const dataset = await this.historicalData.getHistoricalCandles({
      symbol: params.symbol,
      interval: params.interval,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    const candles = dataset.candles;
    if (candles.length < 5) {
      throw new Error(
        `Insufficient historical candle data for ${params.symbol} (${candles.length} candles found; at least 5 required)`
      );
    }

    // 2. Load strategy & evaluate signals chronologically
    const strategy = StrategyRegistry.getStrategy(params.strategyType);
    const { signals } = strategy.evaluate(candles, params.strategyParams);

    // 3. Execution Simulation State
    const initialCapital = params.initialCapital || 100000;
    let cash = initialCapital;
    let openPosition: {
      entryBarIndex: number;
      entryTimestamp: string;
      entryPrice: number;
      quantity: number;
      notional: number;
      entryCommission: number;
      entrySlippage: number;
    } | null = null;

    const trades: BacktestTrade[] = [];
    const equityCurve: BacktestEquityPoint[] = [];

    const slippageRate = (params.slippagePercent || 0) / 100;
    const commissionRate = (params.commissionPercent || 0) / 100;
    const stopLossRate = params.stopLossPercent ? params.stopLossPercent / 100 : null;
    const takeProfitRate = params.takeProfitPercent ? params.takeProfitPercent / 100 : null;

    // Benchmark Buy & Hold tracking
    const benchmarkFirstPrice = parseFloat(candles[0].close);
    const benchmarkShares = benchmarkFirstPrice > 0 ? initialCapital / benchmarkFirstPrice : 0;

    let peakEquity = initialCapital;

    // 4. Bar-by-bar chronological processing
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const close = parseFloat(candle.close);
      const high = parseFloat(candle.high);
      const low = parseFloat(candle.low);
      const timestamp = candle.timestamp;
      const signal = signals[i];

      // A. Evaluate open position exits first (Stop-Loss, Take-Profit, or Strategy SELL Signal)
      if (openPosition !== null) {
        let shouldExit = false;
        let exitReason: BacktestExitReason = 'SIGNAL';
        let rawExitPrice = close;

        // Check Stop-Loss
        if (stopLossRate !== null) {
          const stopPrice = openPosition.entryPrice * (1 - stopLossRate);
          if (low <= stopPrice) {
            shouldExit = true;
            exitReason = 'STOP_LOSS';
            // Exit at stopPrice or low, whichever is higher (gap handling)
            rawExitPrice = Math.min(openPosition.entryPrice, Math.max(low, stopPrice));
          }
        }

        // Check Take-Profit (if not already stopped out)
        if (!shouldExit && takeProfitRate !== null) {
          const tpPrice = openPosition.entryPrice * (1 + takeProfitRate);
          if (high >= tpPrice) {
            shouldExit = true;
            exitReason = 'TAKE_PROFIT';
            rawExitPrice = Math.max(openPosition.entryPrice, Math.min(high, tpPrice));
          }
        }

        // Check Strategy SELL signal
        if (!shouldExit && signal === 'SELL') {
          shouldExit = true;
          exitReason = 'SIGNAL';
          rawExitPrice = close;
        }

        // Check if final candle (close any remaining open trade)
        if (!shouldExit && i === candles.length - 1) {
          shouldExit = true;
          exitReason = 'END_OF_DATA';
          rawExitPrice = close;
        }

        // Execute exit
        if (shouldExit) {
          // Unfavorable slippage for seller
          const effectiveExitPrice = rawExitPrice * (1 - slippageRate);
          const exitNotional = effectiveExitPrice * openPosition.quantity;
          const exitCommission = exitNotional * commissionRate;
          const totalSlippage =
            (rawExitPrice - effectiveExitPrice) * openPosition.quantity + openPosition.entrySlippage;
          const totalCommission = openPosition.entryCommission + exitCommission;

          const grossPnl = exitNotional - openPosition.notional;
          const netPnl = grossPnl - totalCommission;
          const returnPct =
            openPosition.notional > 0 ? (netPnl / openPosition.notional) * 100 : 0;

          trades.push({
            id: trades.length + 1,
            tradeNumber: trades.length + 1,
            entryTimestamp: openPosition.entryTimestamp,
            exitTimestamp: timestamp,
            side: 'LONG',
            entryPrice: Number(openPosition.entryPrice.toFixed(4)),
            exitPrice: Number(effectiveExitPrice.toFixed(4)),
            quantity: Number(openPosition.quantity.toFixed(4)),
            notional: Number(openPosition.notional.toFixed(2)),
            grossProfitLoss: Number(grossPnl.toFixed(2)),
            netProfitLoss: Number(netPnl.toFixed(2)),
            returnPercent: Number(returnPct.toFixed(2)),
            commission: Number(totalCommission.toFixed(2)),
            slippage: Number(totalSlippage.toFixed(2)),
            exitReason,
            barsHeld: i - openPosition.entryBarIndex,
          });

          cash += exitNotional - exitCommission;
          openPosition = null;
        }
      }

      // B. Evaluate entry signal ('BUY') if currently flat and not the final candle
      if (openPosition === null && signal === 'BUY' && i < candles.length - 1) {
        // Calculate position sizing
        const currentEquity = cash;
        let capitalToAllocate = currentEquity * 0.25; // default 25%

        if (params.positionSizing) {
          const { type, value } = params.positionSizing;
          if (type === 'FIXED_PERCENT') {
            capitalToAllocate = currentEquity * (Math.min(100, Math.max(1, value)) / 100);
          } else if (type === 'FIXED_AMOUNT') {
            capitalToAllocate = Math.min(currentEquity, Math.max(100, value));
          } else if (type === 'FIXED_QUANTITY') {
            capitalToAllocate = Math.min(currentEquity, value * close);
          }
        }

        // Clamp to available cash with safety margin for commission
        const maxDeployable = Math.max(0, cash * 0.98);
        capitalToAllocate = Math.min(capitalToAllocate, maxDeployable);

        if (capitalToAllocate > 100) {
          // Unfavorable slippage for buyer
          const effectiveEntryPrice = close * (1 + slippageRate);
          const quantity = Math.floor(capitalToAllocate / effectiveEntryPrice);

          if (quantity > 0) {
            const notional = quantity * effectiveEntryPrice;
            const entryCommission = notional * commissionRate;
            const entrySlippage = (effectiveEntryPrice - close) * quantity;

            cash -= notional + entryCommission;

            openPosition = {
              entryBarIndex: i,
              entryTimestamp: timestamp,
              entryPrice: effectiveEntryPrice,
              quantity,
              notional,
              entryCommission,
              entrySlippage,
            };
          }
        }
      }

      // C. Record Equity Curve Point
      const positionValue = openPosition ? openPosition.quantity * close : 0;
      const totalEquity = cash + positionValue;

      if (totalEquity > peakEquity) {
        peakEquity = totalEquity;
      }

      const drawdownPercent =
        peakEquity > 0 ? ((peakEquity - totalEquity) / peakEquity) * 100 : 0;
      const benchmarkEquity = benchmarkShares * close;

      equityCurve.push({
        timestamp,
        equity: Number(totalEquity.toFixed(2)),
        cash: Number(cash.toFixed(2)),
        drawdownPercent: Number(drawdownPercent.toFixed(2)),
        benchmarkEquity: Number(benchmarkEquity.toFixed(2)),
      });
    }

    const finalEquity =
      equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialCapital;

    // Benchmark return
    const benchmarkLastPrice = parseFloat(candles[candles.length - 1].close);
    const benchmarkReturnPercent =
      benchmarkFirstPrice > 0
        ? ((benchmarkLastPrice - benchmarkFirstPrice) / benchmarkFirstPrice) * 100
        : 0;

    // Duration in days
    const firstTime = new Date(candles[0].timestamp).getTime();
    const lastTime = new Date(candles[candles.length - 1].timestamp).getTime();
    const durationDays = Math.max(1, (lastTime - firstTime) / (24 * 60 * 60 * 1000));

    // 5. Calculate performance metrics
    const metrics = MetricsCalculator.calculate({
      initialCapital,
      finalEquity,
      trades,
      equityCurve,
      benchmarkReturnPercent,
      durationDays,
    });

    const executionTimeMs = Date.now() - startTimeMs;

    const result: BacktestResult = {
      runId: Math.floor(Date.now() / 1000),
      userId,
      parameters: {
        instrumentId: dataset.instrumentId,
        symbol: dataset.symbol,
        interval: dataset.interval,
        startDate: dataset.startDate,
        endDate: dataset.endDate,
        strategyType: params.strategyType,
        strategyParams: params.strategyParams,
        initialCapital,
        positionSizing: params.positionSizing || { type: 'FIXED_PERCENT', value: 25 },
        stopLossPercent: params.stopLossPercent,
        takeProfitPercent: params.takeProfitPercent,
        slippagePercent: params.slippagePercent,
        commissionPercent: params.commissionPercent,
      },
      metrics,
      trades,
      equityCurve,
      candlesAnalyzed: candles.length,
      executionTimeMs,
      createdAt: new Date().toISOString(),
    };

    // 6. Optional AI Analysis
    if (params.includeAIAnalysis !== false) {
      try {
        result.aiAnalysis = await aiInsightsService.explainBacktest(result);
      } catch {
        result.aiAnalysis = null;
      }
    }

    return result;
  }
}

export const backtestEngine = new BacktestEngine();
