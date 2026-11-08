import { Knex } from 'knex';
import { db } from '../../../database/connection';
import { StrategyExecution, StrategySignal, ExecutionStatus } from '@tradegrid/shared-types';
import {
  IStrategyExecutionRepository,
  StrategyExecutionRow,
  CreateExecutionData,
} from './execution.types';

export class KnexStrategyExecutionRepository implements IStrategyExecutionRepository {
  constructor(private readonly knex: Knex = db) {}

  private mapRow(row: StrategyExecutionRow): StrategyExecution {
    let diag: any = undefined;
    if (row.diagnostics) {
      diag = typeof row.diagnostics === 'string' ? JSON.parse(row.diagnostics) : row.diagnostics;
    }

    return {
      id: row.id,
      executionId: row.execution_id,
      userId: row.user_id,
      strategyId: row.strategy_id,
      strategyVersion: row.strategy_version,
      status: row.status,
      instrumentSymbol: row.instrument_symbol,
      timeframe: row.timeframe,
      startDate: new Date(row.start_date).toISOString(),
      endDate: new Date(row.end_date).toISOString(),
      initialCapital: String(row.initial_capital),
      totalSignalsCount: row.total_signals_count,
      buySignalsCount: row.buy_signals_count,
      sellSignalsCount: row.sell_signals_count,
      executionDurationMs: diag?.executionTimeMs,
      errorMessage: row.error_message || undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async createExecution(data: CreateExecutionData): Promise<StrategyExecution> {
    const [id] = await this.knex('strategy_executions').insert({
      execution_id: data.executionId,
      user_id: data.userId,
      strategy_id: data.strategyId,
      strategy_version: data.strategyVersion,
      instrument_symbol: data.instrumentSymbol,
      timeframe: data.timeframe,
      status: data.status || 'QUEUED',
      start_date: new Date(data.startDate),
      end_date: new Date(data.endDate),
      initial_capital: data.initialCapital || '100000.0000',
      total_signals_count: 0,
      buy_signals_count: 0,
      sell_signals_count: 0,
    });

    const execution = await this.findById(id);
    if (!execution) {
      throw new Error(`Failed to create strategy execution #${id}`);
    }
    return execution;
  }

  async findById(id: number): Promise<StrategyExecution | null> {
    const row = await this.knex<StrategyExecutionRow>('strategy_executions')
      .where({ id })
      .first();
    return row ? this.mapRow(row) : null;
  }

  async findByExecutionId(executionId: string): Promise<StrategyExecution | null> {
    const row = await this.knex<StrategyExecutionRow>('strategy_executions')
      .where({ execution_id: executionId })
      .first();
    return row ? this.mapRow(row) : null;
  }

  async findByStrategyId(strategyId: number, userId: number): Promise<StrategyExecution[]> {
    const rows = await this.knex<StrategyExecutionRow>('strategy_executions')
      .where({ strategy_id: strategyId, user_id: userId })
      .orderBy('created_at', 'desc');
    return rows.map((r) => this.mapRow(r));
  }

  async findByUserId(userId: number): Promise<StrategyExecution[]> {
    const rows = await this.knex<StrategyExecutionRow>('strategy_executions')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');
    return rows.map((r) => this.mapRow(r));
  }

  async updateStatus(
    executionId: string,
    userId: number,
    status: ExecutionStatus,
    errorMessage?: string
  ): Promise<StrategyExecution | null> {
    const updates: any = {
      status,
      updated_at: new Date(),
    };
    if (errorMessage) updates.error_message = errorMessage;
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' || status === 'TIMED_OUT') {
      updates.completed_at = new Date();
    }

    const affected = await this.knex('strategy_executions')
      .where({ execution_id: executionId, user_id: userId })
      .update(updates);

    if (affected === 0) return null;
    return this.findByExecutionId(executionId);
  }

  async saveResults(
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
  ): Promise<StrategyExecution | null> {
    const buyCount = data.signals.filter((s) => s.signalType === 'BUY').length;
    const sellCount = data.signals.filter((s) => s.signalType === 'SELL').length;

    await this.knex('strategy_executions')
      .where({ execution_id: executionId, user_id: userId })
      .update({
        status: data.status,
        total_signals_count: data.signals.length,
        buy_signals_count: buyCount,
        sell_signals_count: sellCount,
        signals_data: JSON.stringify(data.signals),
        diagnostics: JSON.stringify(data.diagnostics),
        error_message: data.errorMessage || null,
        completed_at: new Date(),
        updated_at: new Date(),
      });

    return this.findByExecutionId(executionId);
  }

  async getSignals(executionId: string, userId: number): Promise<StrategySignal[]> {
    const row = await this.knex<StrategyExecutionRow>('strategy_executions')
      .where({ execution_id: executionId, user_id: userId })
      .first();

    if (!row || !row.signals_data) return [];
    return typeof row.signals_data === 'string'
      ? JSON.parse(row.signals_data)
      : row.signals_data;
  }
}

export const strategyExecutionRepository = new KnexStrategyExecutionRepository();
