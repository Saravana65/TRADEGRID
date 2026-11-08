import {
  BacktestPerformanceMetrics,
  BacktestTrade,
  BacktestEquityPoint,
} from '@tradegrid/shared-types';

export class MetricsCalculator {
  /**
   * Computes comprehensive quantitative backtesting performance metrics.
   * Handles edge cases (zero trades, zero losses, negative equity, flat returns) safely.
   */
  static calculate(params: {
    initialCapital: number;
    finalEquity: number;
    trades: BacktestTrade[];
    equityCurve: BacktestEquityPoint[];
    benchmarkReturnPercent: number;
    durationDays: number;
    riskFreeRatePercent?: number; // default: 4%
  }): BacktestPerformanceMetrics {
    const {
      initialCapital,
      finalEquity,
      trades,
      equityCurve,
      benchmarkReturnPercent,
      durationDays,
      riskFreeRatePercent = 4.0,
    } = params;

    const netProfit = finalEquity - initialCapital;
    const totalReturnPercent =
      initialCapital > 0 ? (netProfit / initialCapital) * 100 : 0;

    // CAGR (Compound Annual Growth Rate)
    let cagrPercent = 0;
    if (durationDays >= 30 && initialCapital > 0 && finalEquity > 0) {
      const years = durationDays / 365.25;
      cagrPercent = (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100;
    } else {
      cagrPercent = totalReturnPercent;
    }

    // Max Drawdown calculation from equity curve
    let peak = initialCapital;
    let maxDrawdownPercent = 0;
    for (const pt of equityCurve) {
      if (pt.equity > peak) {
        peak = pt.equity;
      }
      const dd = peak > 0 ? ((peak - pt.equity) / peak) * 100 : 0;
      if (dd > maxDrawdownPercent) {
        maxDrawdownPercent = dd;
      }
    }

    // Trade statistics
    const totalTrades = trades.length;
    let winningTrades = 0;
    let losingTrades = 0;
    let grossGains = 0;
    let grossLosses = 0;
    let totalWinReturnPct = 0;
    let totalLossReturnPct = 0;
    let totalReturnPctSum = 0;

    for (const t of trades) {
      totalReturnPctSum += t.returnPercent;
      if (t.netProfitLoss > 0) {
        winningTrades++;
        grossGains += t.netProfitLoss;
        totalWinReturnPct += t.returnPercent;
      } else if (t.netProfitLoss < 0) {
        losingTrades++;
        grossLosses += Math.abs(t.netProfitLoss);
        totalLossReturnPct += Math.abs(t.returnPercent);
      }
    }

    const winRatePercent =
      totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    let profitFactor = 0;
    let profitFactorDisplay = '0.00';
    if (grossLosses === 0) {
      if (grossGains > 0) {
        profitFactor = 999.99;
        profitFactorDisplay = '∞';
      } else {
        profitFactor = 0;
        profitFactorDisplay = '0.00';
      }
    } else {
      profitFactor = Number((grossGains / grossLosses).toFixed(2));
      profitFactorDisplay = profitFactor.toFixed(2);
    }

    const avgWinAmount =
      winningTrades > 0 ? grossGains / winningTrades : 0;
    const avgLossAmount =
      losingTrades > 0 ? grossLosses / losingTrades : 0;
    const avgReturnPercent =
      totalTrades > 0 ? totalReturnPctSum / totalTrades : 0;

    // Daily returns series from equity curve for Sharpe & Sortino
    const dailyReturns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prevEq = equityCurve[i - 1].equity;
      const currEq = equityCurve[i].equity;
      if (prevEq > 0) {
        dailyReturns.push((currEq - prevEq) / prevEq);
      }
    }

    const { sharpeRatio, sortinoRatio } = this.calculateRiskRatios(
      dailyReturns,
      riskFreeRatePercent
    );

    // Exposure: percentage of bars held in position vs total equity curve bars
    const totalBarsHeld = trades.reduce((sum, t) => sum + (t.barsHeld || 0), 0);
    const totalBars = Math.max(1, equityCurve.length);
    const exposurePercent = Math.min(100, Number(((totalBarsHeld / totalBars) * 100).toFixed(2)));

    return {
      initialCapital: Number(initialCapital.toFixed(2)),
      finalEquity: Number(finalEquity.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      totalReturnPercent: Number(totalReturnPercent.toFixed(2)),
      benchmarkReturnPercent: Number(benchmarkReturnPercent.toFixed(2)),
      cagrPercent: Number(cagrPercent.toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
      sharpeRatio: Number(sharpeRatio.toFixed(2)),
      sortinoRatio: Number(sortinoRatio.toFixed(2)),
      winRatePercent: Number(winRatePercent.toFixed(2)),
      profitFactor,
      profitFactorDisplay,
      totalTrades,
      winningTrades,
      losingTrades,
      avgWinAmount: Number(avgWinAmount.toFixed(2)),
      avgLossAmount: Number(avgLossAmount.toFixed(2)),
      avgReturnPercent: Number(avgReturnPercent.toFixed(2)),
      exposurePercent,
    };
  }

  /**
   * Calculates annualized Sharpe Ratio and Sortino Ratio from periodic returns.
   * Assumes ~252 trading periods per year (for daily intervals).
   */
  private static calculateRiskRatios(
    returns: number[],
    riskFreeRatePercent: number
  ): { sharpeRatio: number; sortinoRatio: number } {
    if (returns.length < 2) {
      return { sharpeRatio: 0, sortinoRatio: 0 };
    }

    const n = returns.length;
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / n;

    // Daily risk-free rate
    const dailyRf = Math.pow(1 + riskFreeRatePercent / 100, 1 / 252) - 1;

    // Standard deviation of returns (Total Risk)
    let varianceSum = 0;
    // Downside deviation (negative excess returns only)
    let downsideVarianceSum = 0;

    for (const r of returns) {
      const diff = r - meanReturn;
      varianceSum += diff * diff;

      const excessReturn = r - dailyRf;
      if (excessReturn < 0) {
        downsideVarianceSum += excessReturn * excessReturn;
      }
    }

    const totalStdDev = Math.sqrt(varianceSum / (n - 1));
    const downsideStdDev = Math.sqrt(downsideVarianceSum / n);

    const annualFactor = Math.sqrt(252);

    let sharpeRatio = 0;
    if (totalStdDev > 0) {
      sharpeRatio = ((meanReturn - dailyRf) / totalStdDev) * annualFactor;
    }

    let sortinoRatio = 0;
    if (downsideStdDev > 0) {
      sortinoRatio = ((meanReturn - dailyRf) / downsideStdDev) * annualFactor;
    } else if (meanReturn > dailyRf) {
      // If no downside deviation occurred and return is positive
      sortinoRatio = sharpeRatio > 0 ? sharpeRatio * 1.5 : 0;
    }

    // Clamp extreme outliers to reasonable financial bounds (-10 to +10)
    sharpeRatio = Math.max(-10, Math.min(10, isNaN(sharpeRatio) ? 0 : sharpeRatio));
    sortinoRatio = Math.max(-10, Math.min(10, isNaN(sortinoRatio) ? 0 : sortinoRatio));

    return { sharpeRatio, sortinoRatio };
  }
}
