import {
  AIBacktestAnalysis,
  AIPortfolioReview,
  AIStrategyComparison,
  BacktestResult,
  PortfolioInsight,
  QuantitativeStrategyType,
} from '@tradegrid/shared-types';

export interface IAIProvider {
  explainBacktest(result: BacktestResult): Promise<AIBacktestAnalysis>;
  reviewPortfolio(insight: PortfolioInsight): Promise<AIPortfolioReview>;
  compareStrategies(symbol: string, results: BacktestResult[]): Promise<AIStrategyComparison>;
}

const AI_DISCLAIMER =
  'SIMULATED QUANTITATIVE RESEARCH — AI-generated commentary is for educational and illustrative purposes only. Not financial advice. Past simulated performance does not guarantee future results.';

/**
 * Deterministic Quantitative AI Provider.
 * Generates context-rich, mathematically rigorous analysis of backtest results,
 * portfolio risks, and strategy comparisons without requiring external paid API keys.
 */
export class DeterministicAIProvider implements IAIProvider {
  async explainBacktest(result: BacktestResult): Promise<AIBacktestAnalysis> {
    const { metrics, parameters, trades } = result;
    const { totalReturnPercent, benchmarkReturnPercent, maxDrawdownPercent, sharpeRatio, winRatePercent, profitFactor } = metrics;
    const stratName = parameters.strategyType.replace(/_/g, ' ');

    const outperforming = totalReturnPercent > benchmarkReturnPercent;
    const returnDiff = (totalReturnPercent - benchmarkReturnPercent).toFixed(1);

    // Strengths
    const strategyStrengths: string[] = [];
    if (outperforming) {
      strategyStrengths.push(
        `Generated ${totalReturnPercent.toFixed(1)}% total return, outperforming the buy-and-hold benchmark by +${returnDiff}%.`
      );
    }
    if (sharpeRatio >= 1.0) {
      strategyStrengths.push(
        `Favorable risk-adjusted return profile with an annualized Sharpe Ratio of ${sharpeRatio.toFixed(2)}.`
      );
    }
    if (winRatePercent >= 50) {
      strategyStrengths.push(
        `Solid trade profitability with a ${winRatePercent.toFixed(1)}% win rate across ${metrics.totalTrades} closed trades.`
      );
    }
    if (profitFactor >= 1.5) {
      strategyStrengths.push(
        `Strong profit factor of ${metrics.profitFactorDisplay}, indicating gains significantly outweighed losses.`
      );
    }
    if (strategyStrengths.length === 0) {
      strategyStrengths.push(
        'Active risk containment: avoided severe single-day ruin during downward trend periods.'
      );
    }

    // Risk Factors
    const riskFactors: string[] = [];
    if (maxDrawdownPercent > 20) {
      riskFactors.push(
        `Elevated drawdown risk: experienced a peak-to-trough decline of ${maxDrawdownPercent.toFixed(1)}%, requiring strong emotional resilience.`
      );
    }
    if (metrics.totalTrades < 5) {
      riskFactors.push(
        `Low sample size: only ${metrics.totalTrades} trades were triggered, meaning statistical significance is limited.`
      );
    }
    if (winRatePercent < 40 && profitFactor < 1.0) {
      riskFactors.push(
        `Low win rate (${winRatePercent.toFixed(1)}%) coupled with unfavorable profit factor suggests frequent false breakout signals.`
      );
    }
    if (metrics.exposurePercent > 80) {
      riskFactors.push(
        `High market exposure (${metrics.exposurePercent.toFixed(1)}% of time invested) leaves the portfolio vulnerable to overnight systemic gaps.`
      );
    }
    if (riskFactors.length === 0) {
      riskFactors.push(
        'Slippage and transaction cost sensitivity: frequent trading in choppy regimes could degrade margins.'
      );
    }

    // Suggestions
    const optimizationSuggestions: string[] = [];
    if (maxDrawdownPercent > 15) {
      optimizationSuggestions.push(
        'Consider introducing a trailing stop-loss (e.g. 2–3%) or ATR-based volatility bands to truncate tail losses.'
      );
    }
    if (parameters.strategyType === 'SMA_CROSSOVER' || parameters.strategyType === 'EMA_CROSSOVER') {
      optimizationSuggestions.push(
        'Pair moving average crossovers with an RSI or ADX trend-strength filter to avoid whipsaws in sideways consolidation.'
      );
    } else if (parameters.strategyType === 'RSI_MOMENTUM') {
      optimizationSuggestions.push(
        'Combine RSI oversold triggers with longer-term 200-day trend confirmation to prevent catching falling knives.'
      );
    } else {
      optimizationSuggestions.push(
        'Test varying position sizing (e.g. volatility-weighted or Kelly-fractional sizing) rather than fixed percentage.'
      );
    }

    // Verdict
    let verdict: 'STRONG_CANDIDATE' | 'MODERATE_POTENTIAL' | 'HIGH_RISK_WARNING' =
      'MODERATE_POTENTIAL';
    if (totalReturnPercent > 15 && sharpeRatio >= 1.0 && maxDrawdownPercent < 20) {
      verdict = 'STRONG_CANDIDATE';
    } else if (totalReturnPercent < 0 || maxDrawdownPercent > 35) {
      verdict = 'HIGH_RISK_WARNING';
    }

    const summary = `${stratName} produced a ${totalReturnPercent >= 0 ? '+' : ''}${totalReturnPercent.toFixed(1)}% return over ${trades.length} trades with ${maxDrawdownPercent.toFixed(1)}% maximum drawdown. Relative to the benchmark (${benchmarkReturnPercent.toFixed(1)}%), this strategy ${outperforming ? 'generated alpha' : 'underperformed'}, with a Sharpe ratio of ${sharpeRatio.toFixed(2)}.`;

    const marketRegimeFit =
      parameters.strategyType.includes('CROSSOVER') || parameters.strategyType === 'BREAKOUT'
        ? 'Best suited for strong directional trending markets; vulnerable to sideways whipsaws.'
        : 'Best suited for mean-reverting, range-bound market regimes; susceptible to breakout runs.';

    return {
      summary,
      strategyStrengths,
      riskFactors,
      optimizationSuggestions,
      marketRegimeFit,
      verdict,
      isAIGenerated: true,
      disclaimer: AI_DISCLAIMER,
    };
  }

  async reviewPortfolio(insight: PortfolioInsight): Promise<AIPortfolioReview> {
    const { cashRatioPercent, concentrationHhi, maxAssetWeightPercent, maxAssetSymbol, riskWarnings, diversificationScore } = insight;

    let healthGrade: 'A' | 'B' | 'C' | 'D' | 'F' = 'B';
    if (diversificationScore >= 80 && riskWarnings.length === 0) healthGrade = 'A';
    else if (diversificationScore >= 60 && riskWarnings.length <= 1) healthGrade = 'B';
    else if (diversificationScore >= 40) healthGrade = 'C';
    else if (diversificationScore >= 20) healthGrade = 'D';
    else healthGrade = 'F';

    const concentrationAssessment =
      concentrationHhi > 3500
        ? `High Concentration Risk: HHI is ${concentrationHhi.toFixed(0)}, with ${maxAssetSymbol} representing ${maxAssetWeightPercent.toFixed(1)}% of total equity.`
        : concentrationHhi > 1800
        ? `Moderate Concentration: Top holding (${maxAssetSymbol}) accounts for ${maxAssetWeightPercent.toFixed(1)}% of equity.`
        : `Well Balanced: Maximum single-stock allocation is safely capped at ${maxAssetWeightPercent.toFixed(1)}%.`;

    const actionableRecommendations: string[] = [];
    if (cashRatioPercent > 70) {
      actionableRecommendations.push(
        `High Cash Drag: ${cashRatioPercent.toFixed(1)}% of capital is uninvested cash. Consider deploying into diversified index baskets.`
      );
    } else if (cashRatioPercent < 5) {
      actionableRecommendations.push(
        'Low Cash Buffer: Cash reserve is below 5%. Maintain liquidity to cushion against unexpected volatility or margin needs.'
      );
    }

    if (maxAssetWeightPercent > 35) {
      actionableRecommendations.push(
        `Trim ${maxAssetSymbol}: Position represents over 35% of total portfolio value. Rebalance to mitigate idiosyncratic company risk.`
      );
    }

    if (insight.sectorAllocation.length < 3 && insight.totalPositions > 2) {
      actionableRecommendations.push(
        'Sector Concentration: Portfolio holdings are clustered in few industries. Expand into non-correlated sectors (e.g. Healthcare, Energy, FMCG).'
      );
    }

    if (actionableRecommendations.length === 0) {
      actionableRecommendations.push(
        'Maintain current disciplined asset allocation. Periodically rebalance to harvest gains and preserve target risk profile.'
      );
    }

    const summary = `Overall Portfolio Health Grade: ${healthGrade}. Diversification Score: ${diversificationScore}/100. Portfolio holds ${insight.totalPositions} active positions across ${insight.sectorAllocation.length} distinct sectors with a ${cashRatioPercent.toFixed(1)}% cash allocation.`;

    return {
      summary,
      healthGrade,
      concentrationAssessment,
      actionableRecommendations,
      isAIGenerated: true,
      disclaimer: AI_DISCLAIMER,
    };
  }

  async compareStrategies(
    symbol: string,
    results: BacktestResult[]
  ): Promise<AIStrategyComparison> {
    if (results.length === 0) {
      throw new Error('No strategy results provided for comparison');
    }

    // Rank by Sharpe Ratio first, then Total Return
    const sorted = [...results].sort((a, b) => {
      if (b.metrics.sharpeRatio !== a.metrics.sharpeRatio) {
        return b.metrics.sharpeRatio - a.metrics.sharpeRatio;
      }
      return b.metrics.totalReturnPercent - a.metrics.totalReturnPercent;
    });

    const winner = sorted[0];
    const bestPerformingStrategy: QuantitativeStrategyType = winner.parameters.strategyType;

    const tradeOffs: string[] = sorted.map((res) => {
      const type = res.parameters.strategyType.replace(/_/g, ' ');
      return `${type}: Return ${res.metrics.totalReturnPercent >= 0 ? '+' : ''}${res.metrics.totalReturnPercent.toFixed(1)}%, Max DD ${res.metrics.maxDrawdownPercent.toFixed(1)}%, Sharpe ${res.metrics.sharpeRatio.toFixed(2)}, Trades ${res.metrics.totalTrades}`;
    });

    const comparisonSummary = `Across ${results.length} quantitative strategies evaluated on ${symbol}, ${bestPerformingStrategy.replace(/_/g, ' ')} demonstrated the superior risk-adjusted profile with a Sharpe Ratio of ${winner.metrics.sharpeRatio.toFixed(2)} and total return of ${winner.metrics.totalReturnPercent.toFixed(1)}%.`;

    const recommendation = `For ${symbol}, ${bestPerformingStrategy.replace(/_/g, ' ')} offers the most favorable balance between upside participation and capital preservation under recent market volatility.`;

    return {
      instrumentSymbol: symbol,
      bestPerformingStrategy,
      comparisonSummary,
      tradeOffs,
      recommendation,
      isAIGenerated: true,
      disclaimer: AI_DISCLAIMER,
    };
  }
}

export const aiInsightsService = new DeterministicAIProvider();
