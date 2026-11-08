import {
  BacktestEquityPoint,
  BacktestParameters,
  BacktestPerformanceMetrics,
  BacktestResult,
  BacktestTrade,
  QuantitativeSignal,
} from '@tradegrid/shared-types';

export interface BacktestRunRecord {
  id: number;
  user_id: number;
  instrument_id: number;
  symbol: string;
  strategy_type: string;
  interval: string;
  start_date: Date;
  end_date: Date;
  initial_capital: string;
  final_equity: string;
  net_profit: string;
  total_return_percent: string;
  benchmark_return_percent: string;
  cagr_percent: string;
  max_drawdown_percent: string;
  sharpe_ratio: string;
  sortino_ratio: string;
  win_rate_percent: string;
  profit_factor: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  parameters: any;
  ai_analysis?: any;
  execution_time_ms: number;
  created_at: Date;
}

export interface BacktestTradeRecord {
  id: number;
  backtest_run_id: number;
  trade_number: number;
  entry_timestamp: Date;
  exit_timestamp: Date;
  side: string;
  entry_price: string;
  exit_price: string;
  quantity: string;
  notional: string;
  gross_profit_loss: string;
  net_profit_loss: string;
  return_percent: string;
  commission: string;
  slippage: string;
  exit_reason: string;
  bars_held: number;
  created_at: Date;
}

export interface BacktestEquitySnapshotRecord {
  id: number;
  backtest_run_id: number;
  timestamp: Date;
  equity: string;
  cash: string;
  drawdown_percent: string;
  benchmark_equity: string;
}

export interface QuantitativeSignalRecord {
  id: number;
  instrument_id: number;
  symbol: string;
  strategy_type: string;
  signal_type: string;
  strength: string;
  score: string;
  current_price: string;
  indicator_values: any;
  explanation: string;
  timestamp: Date;
  created_at: Date;
}

export interface IResearchRepository {
  saveBacktestResult(result: BacktestResult): Promise<number>;
  findBacktestRunById(id: number): Promise<BacktestResult | null>;
  findBacktestRunsByUserId(userId: number, limit?: number): Promise<BacktestResult[]>;
  saveSignals(signals: QuantitativeSignal[]): Promise<void>;
  findLatestSignals(options?: {
    symbol?: string;
    strategyType?: string;
    signalType?: string;
    limit?: number;
  }): Promise<QuantitativeSignal[]>;
}
