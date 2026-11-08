import {
  AutomatedJobStatus,
  AutomatedJobRiskLimits,
  AutomatedStrategyJob,
  AutomatedStrategyOrder,
  SignalType,
} from '@tradegrid/shared-types';

export interface AutomatedJobRow {
  id: number;
  job_id: string;
  user_id: number;
  strategy_id: number;
  strategy_version: number;
  instrument_symbol: string;
  timeframe: string;
  status: AutomatedJobStatus;
  is_active: boolean | number;
  risk_limits: any;
  last_processed_candle_time: Date | string | null;
  last_signal: SignalType | null;
  last_signal_time: Date | string | null;
  total_signals_count: number;
  total_orders_count: number;
  consecutive_failures_count: number;
  error_details: string | null;
  started_at: Date | string | null;
  stopped_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AutomatedOrderRow {
  id: number;
  job_id: string;
  user_id: number;
  order_id: number;
  signal_type: SignalType;
  order_price: string | number;
  order_quantity: string | number;
  idempotency_key: string;
  created_at: Date | string;
}

export interface CreateJobData {
  jobId: string;
  userId: number;
  strategyId: number;
  strategyVersion: number;
  instrumentSymbol: string;
  timeframe: string;
  status?: AutomatedJobStatus;
  isActive?: boolean;
  riskLimits?: AutomatedJobRiskLimits;
}

export interface IAutomatedStrategyJobRepository {
  createJob(data: CreateJobData): Promise<AutomatedStrategyJob>;
  findById(id: number): Promise<AutomatedStrategyJob | null>;
  findByJobId(jobId: string): Promise<AutomatedStrategyJob | null>;
  findActiveJobs(): Promise<AutomatedStrategyJob[]>;
  findByUserId(userId: number): Promise<AutomatedStrategyJob[]>;
  findActiveJobByUserAndStrategy(
    userId: number,
    strategyId: number,
    instrumentSymbol: string
  ): Promise<AutomatedStrategyJob | null>;
  updateJobStatus(
    jobId: string,
    status: AutomatedJobStatus,
    isActive?: boolean,
    errorDetails?: string
  ): Promise<AutomatedStrategyJob | null>;
  updateJobCheckpoint(
    jobId: string,
    candleTime: string,
    signal?: SignalType,
    orderSubmitted?: boolean
  ): Promise<void>;
  updateConsecutiveFailures(jobId: string, failures: number, errorDetails?: string): Promise<void>;
  recordStrategyOrder(
    jobId: string,
    userId: number,
    orderId: number,
    signalType: SignalType,
    orderPrice: string,
    orderQuantity: string,
    idempotencyKey: string
  ): Promise<AutomatedStrategyOrder>;
  findOrdersByJobId(jobId: string, userId: number): Promise<AutomatedStrategyOrder[]>;
  stopAllUserJobs(userId: number): Promise<number>;
}
