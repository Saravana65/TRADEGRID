import { Knex } from 'knex';
import { db } from '../../database/connection';
import {
  BacktestResult,
  QuantitativeSignal,
} from '@tradegrid/shared-types';
import {
  BacktestEquitySnapshotRecord,
  BacktestRunRecord,
  BacktestTradeRecord,
  IResearchRepository,
  QuantitativeSignalRecord,
} from './research.types';

export * from './research.types';

export class KnexResearchRepository implements IResearchRepository {
  constructor(private readonly knex: Knex = db) {}

  async saveBacktestResult(result: BacktestResult): Promise<number> {
    const { parameters, metrics, trades, equityCurve, aiAnalysis } = result;

    const [runId] = await this.knex('backtest_runs').insert({
      user_id: result.userId,
      instrument_id: parameters.instrumentId,
      symbol: parameters.symbol,
      strategy_type: parameters.strategyType,
      interval: parameters.interval,
      start_date: new Date(parameters.startDate),
      end_date: new Date(parameters.endDate),
      initial_capital: metrics.initialCapital.toFixed(4),
      final_equity: metrics.finalEquity.toFixed(4),
      net_profit: metrics.netProfit.toFixed(4),
      total_return_percent: metrics.totalReturnPercent.toFixed(4),
      benchmark_return_percent: metrics.benchmarkReturnPercent.toFixed(4),
      cagr_percent: metrics.cagrPercent.toFixed(4),
      max_drawdown_percent: metrics.maxDrawdownPercent.toFixed(4),
      sharpe_ratio: metrics.sharpeRatio.toFixed(4),
      sortino_ratio: metrics.sortinoRatio.toFixed(4),
      win_rate_percent: metrics.winRatePercent.toFixed(4),
      profit_factor: isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(4) : '999.9900',
      total_trades: metrics.totalTrades,
      winning_trades: metrics.winningTrades,
      losing_trades: metrics.losingTrades,
      parameters: JSON.stringify(parameters),
      ai_analysis: aiAnalysis ? JSON.stringify(aiAnalysis) : null,
      execution_time_ms: result.executionTimeMs,
      created_at: new Date(result.createdAt),
    });

    // Bulk insert trades
    if (trades.length > 0) {
      const tradeRows = trades.map((t) => ({
        backtest_run_id: runId,
        trade_number: t.tradeNumber,
        entry_timestamp: new Date(t.entryTimestamp),
        exit_timestamp: new Date(t.exitTimestamp),
        side: t.side,
        entry_price: t.entryPrice.toFixed(4),
        exit_price: t.exitPrice.toFixed(4),
        quantity: t.quantity.toFixed(4),
        notional: t.notional.toFixed(4),
        gross_profit_loss: t.grossProfitLoss.toFixed(4),
        net_profit_loss: t.netProfitLoss.toFixed(4),
        return_percent: t.returnPercent.toFixed(4),
        commission: t.commission.toFixed(4),
        slippage: t.slippage.toFixed(4),
        exit_reason: t.exitReason,
        bars_held: t.barsHeld,
      }));
      // Chunk inserts of 100
      for (let i = 0; i < tradeRows.length; i += 100) {
        await this.knex('backtest_trades').insert(tradeRows.slice(i, i + 100));
      }
    }

    // Bulk insert equity snapshots
    if (equityCurve.length > 0) {
      const snapRows = equityCurve.map((pt) => ({
        backtest_run_id: runId,
        timestamp: new Date(pt.timestamp),
        equity: pt.equity.toFixed(4),
        cash: pt.cash.toFixed(4),
        drawdown_percent: pt.drawdownPercent.toFixed(4),
        benchmark_equity: pt.benchmarkEquity.toFixed(4),
      }));
      for (let i = 0; i < snapRows.length; i += 100) {
        await this.knex('backtest_equity_snapshots').insert(snapRows.slice(i, i + 100));
      }
    }

    return runId;
  }

  async findBacktestRunById(id: number): Promise<BacktestResult | null> {
    const run: BacktestRunRecord | undefined = await this.knex('backtest_runs')
      .where('id', id)
      .first();

    if (!run) return null;

    const tradeRows: BacktestTradeRecord[] = await this.knex('backtest_trades')
      .where('backtest_run_id', id)
      .orderBy('trade_number', 'asc');

    const snapRows: BacktestEquitySnapshotRecord[] = await this.knex('backtest_equity_snapshots')
      .where('backtest_run_id', id)
      .orderBy('timestamp', 'asc');

    return this.mapToBacktestResult(run, tradeRows, snapRows);
  }

  async findBacktestRunsByUserId(userId: number, limit: number = 20): Promise<BacktestResult[]> {
    const runs: BacktestRunRecord[] = await this.knex('backtest_runs')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .limit(limit);

    const results: BacktestResult[] = [];
    for (const run of runs) {
      results.push(this.mapToBacktestResult(run, [], []));
    }
    return results;
  }

  async saveSignals(signals: QuantitativeSignal[]): Promise<void> {
    if (signals.length === 0) return;
    const rows = signals.map((s) => ({
      instrument_id: s.instrumentId,
      symbol: s.symbol,
      strategy_type: s.strategyType,
      signal_type: s.signalType,
      strength: s.strength,
      score: s.score.toFixed(2),
      current_price: s.currentPrice.toFixed(4),
      indicator_values: JSON.stringify(s.indicatorValues),
      explanation: s.explanation,
      timestamp: new Date(s.timestamp),
      created_at: new Date(),
    }));

    for (let i = 0; i < rows.length; i += 50) {
      await this.knex('quantitative_signals').insert(rows.slice(i, i + 50));
    }
  }

  async findLatestSignals(options?: {
    symbol?: string;
    strategyType?: string;
    signalType?: string;
    limit?: number;
  }): Promise<QuantitativeSignal[]> {
    const { symbol, strategyType, signalType, limit = 20 } = options || {};

    const qb = this.knex('quantitative_signals').orderBy('timestamp', 'desc');
    if (symbol) qb.where('symbol', symbol.toUpperCase());
    if (strategyType) qb.where('strategy_type', strategyType);
    if (signalType) qb.where('signal_type', signalType);

    const rows: QuantitativeSignalRecord[] = await qb.limit(limit);

    return rows.map((r) => ({
      id: r.id,
      instrumentId: r.instrument_id,
      symbol: r.symbol,
      name: r.symbol,
      strategyType: r.strategy_type as any,
      signalType: r.signal_type as any,
      strength: r.strength as any,
      score: parseFloat(r.score),
      currentPrice: parseFloat(r.current_price),
      indicatorValues: typeof r.indicator_values === 'string' ? JSON.parse(r.indicator_values) : r.indicator_values,
      explanation: r.explanation,
      timestamp: new Date(r.timestamp).toISOString(),
      disclaimer: 'EDUCATIONAL RESEARCH SIGNAL — Generated by rule-based quantitative models.',
    }));
  }

  private mapToBacktestResult(
    run: BacktestRunRecord,
    tradeRows: BacktestTradeRecord[],
    snapRows: BacktestEquitySnapshotRecord[]
  ): BacktestResult {
    const params = typeof run.parameters === 'string' ? JSON.parse(run.parameters) : run.parameters;
    const aiAnalysis =
      run.ai_analysis && typeof run.ai_analysis === 'string'
        ? JSON.parse(run.ai_analysis)
        : run.ai_analysis;

    const trades = tradeRows.map((t) => ({
      id: t.id,
      tradeNumber: t.trade_number,
      entryTimestamp: new Date(t.entry_timestamp).toISOString(),
      exitTimestamp: new Date(t.exit_timestamp).toISOString(),
      side: t.side as 'LONG',
      entryPrice: parseFloat(t.entry_price),
      exitPrice: parseFloat(t.exit_price),
      quantity: parseFloat(t.quantity),
      notional: parseFloat(t.notional),
      grossProfitLoss: parseFloat(t.gross_profit_loss),
      netProfitLoss: parseFloat(t.net_profit_loss),
      returnPercent: parseFloat(t.return_percent),
      commission: parseFloat(t.commission),
      slippage: parseFloat(t.slippage),
      exitReason: t.exit_reason as any,
      barsHeld: t.bars_held,
    }));

    const equityCurve = snapRows.map((pt) => ({
      timestamp: new Date(pt.timestamp).toISOString(),
      equity: parseFloat(pt.equity),
      cash: parseFloat(pt.cash),
      drawdownPercent: parseFloat(pt.drawdown_percent),
      benchmarkEquity: parseFloat(pt.benchmark_equity),
    }));

    const profitFactor = parseFloat(run.profit_factor);

    return {
      runId: run.id,
      userId: run.user_id,
      parameters: params,
      metrics: {
        initialCapital: parseFloat(run.initial_capital),
        finalEquity: parseFloat(run.final_equity),
        netProfit: parseFloat(run.net_profit),
        totalReturnPercent: parseFloat(run.total_return_percent),
        benchmarkReturnPercent: parseFloat(run.benchmark_return_percent),
        cagrPercent: parseFloat(run.cagr_percent),
        maxDrawdownPercent: parseFloat(run.max_drawdown_percent),
        sharpeRatio: parseFloat(run.sharpe_ratio),
        sortinoRatio: parseFloat(run.sortino_ratio),
        winRatePercent: parseFloat(run.win_rate_percent),
        profitFactor,
        profitFactorDisplay: profitFactor >= 999 ? '∞' : profitFactor.toFixed(2),
        totalTrades: run.total_trades,
        winningTrades: run.winning_trades,
        losingTrades: run.losing_trades,
        avgWinAmount: 0,
        avgLossAmount: 0,
        avgReturnPercent: 0,
        exposurePercent: 0,
      },
      trades,
      equityCurve,
      aiAnalysis,
      candlesAnalyzed: equityCurve.length,
      executionTimeMs: run.execution_time_ms,
      createdAt: new Date(run.created_at).toISOString(),
    };
  }
}

export const researchRepo = new KnexResearchRepository();
