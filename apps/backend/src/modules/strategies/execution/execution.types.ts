import {
  StrategyExecution,
  StrategyExecutionResult,
  StrategySignal,
  ExecutionStatus,
} from '@tradegrid/shared-types';

export interface StrategyExecutionRow {
  id: number;
  execution_id: string;
  user_id: number;
  strategy_id: number;
  strategy_version: number;
  instrument_symbol: string;
  timeframe: string;
  status: ExecutionStatus;
  start_date: Date | string;
  end_date: Date | string;
  initial_capital: string | number;
  total_signals_count: number;
  buy_signals_count: number;
  sell_signals_count: number;
  signals_data: string | any;
  diagnostics: string | any;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

export interface CreateExecutionData {
  executionId: string;
  userId: number;
  strategyId: number;
  strategyVersion: number;
  instrumentSymbol: string;
  timeframe: string;
  status?: ExecutionStatus;
  startDate: string;
  endDate: string;
  initialCapital?: string;
}

export interface MarketCandle {
  timestamp: string | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IStrategyExecutionRepository {
  createExecution(data: CreateExecutionData): Promise<StrategyExecution>;
  findById(id: number): Promise<StrategyExecution | null>;
  findByExecutionId(executionId: string): Promise<StrategyExecution | null>;
  findByStrategyId(strategyId: number, userId: number): Promise<StrategyExecution[]>;
  findByUserId(userId: number): Promise<StrategyExecution[]>;
  updateStatus(
    executionId: string,
    userId: number,
    status: ExecutionStatus,
    errorMessage?: string
  ): Promise<StrategyExecution | null>;
  saveResults(
    executionId: string,
    userId: number,
    data: {
      status: ExecutionStatus;
      signals: StrategySignal[];
      diagnostics: {
        executionTimeMs: number;
        barsProcessed: number;
        memoryUsedKb?: number;
      };
      errorMessage?: string;
    }
  ): Promise<StrategyExecution | null>;
  getSignals(executionId: string, userId: number): Promise<StrategySignal[]>;
}
