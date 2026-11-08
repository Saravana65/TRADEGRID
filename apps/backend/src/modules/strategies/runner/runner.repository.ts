import { Knex } from 'knex';
import { db } from '../../../database/connection';
import {
  AutomatedStrategyJob,
  AutomatedStrategyOrder,
  AutomatedJobStatus,
  SignalType,
} from '@tradegrid/shared-types';
import {
  IAutomatedStrategyJobRepository,
  AutomatedJobRow,
  AutomatedOrderRow,
  CreateJobData,
} from './runner.types';

export * from './runner.types';

export class KnexAutomatedStrategyJobRepository implements IAutomatedStrategyJobRepository {
  constructor(private readonly knex: Knex = db) {}

  private mapJobRow(row: AutomatedJobRow): AutomatedStrategyJob {
    let limits = row.risk_limits;
    if (typeof limits === 'string') {
      try {
        limits = JSON.parse(limits);
      } catch {
        limits = {};
      }
    }

    return {
      id: row.id,
      jobId: row.job_id,
      userId: row.user_id,
      strategyId: row.strategy_id,
      strategyVersion: row.strategy_version,
      instrumentSymbol: row.instrument_symbol,
      timeframe: row.timeframe,
      status: row.status,
      isActive: Boolean(row.is_active),
      riskLimits: limits || {},
      lastProcessedCandleTime: row.last_processed_candle_time
        ? new Date(row.last_processed_candle_time).toISOString()
        : null,
      lastSignal: row.last_signal || null,
      lastSignalTime: row.last_signal_time ? new Date(row.last_signal_time).toISOString() : null,
      totalSignalsCount: row.total_signals_count,
      totalOrdersCount: row.total_orders_count,
      consecutiveFailuresCount: row.consecutive_failures_count,
      errorDetails: row.error_details || null,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      stoppedAt: row.stopped_at ? new Date(row.stopped_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapOrderRow(row: AutomatedOrderRow): AutomatedStrategyOrder {
    return {
      id: row.id,
      jobId: row.job_id,
      userId: row.user_id,
      orderId: row.order_id,
      signalType: row.signal_type,
      orderPrice: String(row.order_price),
      orderQuantity: String(row.order_quantity),
      idempotencyKey: row.idempotency_key,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async createJob(data: CreateJobData): Promise<AutomatedStrategyJob> {
    const [id] = await this.knex('automated_strategy_jobs').insert({
      job_id: data.jobId,
      user_id: data.userId,
      strategy_id: data.strategyId,
      strategy_version: data.strategyVersion,
      instrument_symbol: data.instrumentSymbol,
      timeframe: data.timeframe,
      status: data.status || 'RUNNING',
      is_active: data.isActive !== undefined ? data.isActive : true,
      risk_limits: data.riskLimits ? JSON.stringify(data.riskLimits) : JSON.stringify({}),
      started_at: new Date(),
    });

    const created = await this.findById(id);
    if (!created) {
      throw new Error(`Failed to create automated strategy job #${id}`);
    }
    return created;
  }

  async findById(id: number): Promise<AutomatedStrategyJob | null> {
    const row = await this.knex<AutomatedJobRow>('automated_strategy_jobs').where({ id }).first();
    return row ? this.mapJobRow(row) : null;
  }

  async findByJobId(jobId: string): Promise<AutomatedStrategyJob | null> {
    const row = await this.knex<AutomatedJobRow>('automated_strategy_jobs')
      .where({ job_id: jobId })
      .first();
    return row ? this.mapJobRow(row) : null;
  }

  async findActiveJobs(): Promise<AutomatedStrategyJob[]> {
    const rows = await this.knex<AutomatedJobRow>('automated_strategy_jobs')
      .where({ status: 'RUNNING', is_active: true })
      .orderBy('id', 'asc');
    return rows.map((r) => this.mapJobRow(r));
  }

  async findByUserId(userId: number): Promise<AutomatedStrategyJob[]> {
    const rows = await this.knex<AutomatedJobRow>('automated_strategy_jobs')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');
    return rows.map((r) => this.mapJobRow(r));
  }

  async findActiveJobByUserAndStrategy(
    userId: number,
    strategyId: number,
    instrumentSymbol: string
  ): Promise<AutomatedStrategyJob | null> {
    const row = await this.knex<AutomatedJobRow>('automated_strategy_jobs')
      .where({
        user_id: userId,
        strategy_id: strategyId,
        instrument_symbol: instrumentSymbol,
        is_active: true,
      })
      .whereIn('status', ['RUNNING', 'QUEUED'])
      .first();
    return row ? this.mapJobRow(row) : null;
  }

  async updateJobStatus(
    jobId: string,
    status: AutomatedJobStatus,
    isActive?: boolean,
    errorDetails?: string
  ): Promise<AutomatedStrategyJob | null> {
    const updates: any = {
      status,
      updated_at: new Date(),
    };

    if (isActive !== undefined) {
      updates.is_active = isActive;
    }

    if (status === 'RUNNING') {
      updates.started_at = new Date();
    } else if (status === 'CANCELLED' || status === 'COMPLETED' || status === 'FAILED') {
      updates.stopped_at = new Date();
    }

    if (errorDetails !== undefined) {
      updates.error_details = errorDetails;
    }

    await this.knex('automated_strategy_jobs').where({ job_id: jobId }).update(updates);
    return this.findByJobId(jobId);
  }

  async updateJobCheckpoint(
    jobId: string,
    candleTime: string,
    signal?: SignalType,
    orderSubmitted?: boolean
  ): Promise<void> {
    const updates: any = {
      last_processed_candle_time: new Date(candleTime),
      consecutive_failures_count: 0,
      updated_at: new Date(),
    };

    if (signal) {
      updates.last_signal = signal;
      updates.last_signal_time = new Date();
      updates.total_signals_count = this.knex.raw('total_signals_count + 1');
    }

    if (orderSubmitted) {
      updates.total_orders_count = this.knex.raw('total_orders_count + 1');
    }

    await this.knex('automated_strategy_jobs').where({ job_id: jobId }).update(updates);
  }

  async updateConsecutiveFailures(
    jobId: string,
    failures: number,
    errorDetails?: string
  ): Promise<void> {
    await this.knex('automated_strategy_jobs')
      .where({ job_id: jobId })
      .update({
        consecutive_failures_count: failures,
        error_details: errorDetails || null,
        updated_at: new Date(),
      });
  }

  async recordStrategyOrder(
    jobId: string,
    userId: number,
    orderId: number,
    signalType: SignalType,
    orderPrice: string,
    orderQuantity: string,
    idempotencyKey: string
  ): Promise<AutomatedStrategyOrder> {
    const [id] = await this.knex('automated_strategy_orders').insert({
      job_id: jobId,
      user_id: userId,
      order_id: orderId,
      signal_type: signalType,
      order_price: orderPrice,
      order_quantity: orderQuantity,
      idempotency_key: idempotencyKey,
    });

    const row = await this.knex<AutomatedOrderRow>('automated_strategy_orders')
      .where({ id })
      .first();

    if (!row) {
      throw new Error(`Failed to record automated strategy order #${id}`);
    }
    return this.mapOrderRow(row);
  }

  async findOrdersByJobId(jobId: string, userId: number): Promise<AutomatedStrategyOrder[]> {
    const rows = await this.knex<AutomatedOrderRow>('automated_strategy_orders')
      .where({ job_id: jobId, user_id: userId })
      .orderBy('created_at', 'desc');
    return rows.map((r) => this.mapOrderRow(r));
  }

  async stopAllUserJobs(userId: number): Promise<number> {
    return this.knex('automated_strategy_jobs')
      .where({ user_id: userId, is_active: true })
      .update({
        status: 'CANCELLED',
        is_active: false,
        stopped_at: new Date(),
        updated_at: new Date(),
      });
  }
}

export const automatedStrategyJobRepository = new KnexAutomatedStrategyJobRepository();
