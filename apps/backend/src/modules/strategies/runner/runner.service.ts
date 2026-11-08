import crypto from 'crypto';
import { AppError } from '../../../middleware/error.middleware';
import {
  AutomatedStrategyJob,
  AutomatedStrategyOrder,
} from '@tradegrid/shared-types';
import { ActivateStrategyJobInput, UpdateStrategyJobRiskInput } from '@tradegrid/validation';
import { IAutomatedStrategyJobRepository, automatedStrategyJobRepository as defaultJobRepo } from './runner.repository';
import { StrategyService, defaultStrategyService } from '../strategy.service';
import { OrderService } from '../../orders/order.service';
import { IInstrumentRepository, instrumentRepository as defaultInstrumentRepo } from '../../market/instrument.repository';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../../websocket/realtime.service';

export class AutomatedStrategyRunnerService {
  constructor(
    private readonly jobRepo: IAutomatedStrategyJobRepository = defaultJobRepo,
    private readonly strategyService: StrategyService = defaultStrategyService,
    private readonly orderService?: OrderService,
    private readonly instrumentRepo: IInstrumentRepository = defaultInstrumentRepo,
    private readonly realtimeService: IRealtimeService = defaultRealtimeService
  ) {}

  /**
   * Activates a validated user strategy as an automated background trading runner job.
   */
  async activateStrategyJob(
    userId: number,
    input: ActivateStrategyJobInput
  ): Promise<AutomatedStrategyJob> {
    // 1. Verify Strategy Ownership
    const strategy = await this.strategyService.getStrategy(userId, input.strategyId);

    // 2. Verify Strategy Validity
    if (!strategy.isValid) {
      throw new AppError(
        400,
        'STRATEGY_NOT_VALIDATED',
        'Cannot activate an unvalidated strategy. Validate DSL syntax first.'
      );
    }

    const symbol = input.instrumentSymbol || strategy.instrumentSymbol || 'NSE:RELIANCE';
    const timeframe = input.timeframe || strategy.timeframe || '15m';

    // 3. Check for Existing Active Job (Duplicate Prevention)
    const existingActive = await this.jobRepo.findActiveJobByUserAndStrategy(
      userId,
      strategy.id,
      symbol
    );

    if (existingActive) {
      throw new AppError(
        409,
        'DUPLICATE_ACTIVE_JOB',
        `An active runner job (#${existingActive.jobId}) is already running for this strategy on ${symbol}`
      );
    }

    const jobId = `JOB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // 4. Create Job in database
    const job = await this.jobRepo.createJob({
      jobId,
      userId,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      instrumentSymbol: symbol,
      timeframe,
      status: 'RUNNING',
      isActive: true,
      riskLimits: input.riskLimits || {},
    });

    // 5. Emit Real-time Notification
    if (typeof this.realtimeService?.emitToUser === 'function') {
      this.realtimeService.emitToUser(userId, 'strategy:job_started', {
        jobId: job.jobId,
        strategyId: job.strategyId,
        symbol: job.instrumentSymbol,
        timeframe: job.timeframe,
        timestamp: new Date().toISOString(),
      });
    }

    return job;
  }

  /**
   * Pauses an active running strategy job.
   */
  async pauseStrategyJob(userId: number, jobId: string): Promise<AutomatedStrategyJob> {
    const job = await this.jobRepo.findByJobId(jobId);
    if (!job) {
      throw new AppError(404, 'JOB_NOT_FOUND', `Runner job '${jobId}' not found`);
    }

    if (job.userId !== userId) {
      throw new AppError(403, 'FORBIDDEN_JOB_ACCESS', 'Unauthorized access to runner job');
    }

    if (job.status !== 'RUNNING') {
      throw new AppError(
        400,
        'CANNOT_PAUSE_JOB',
        `Job cannot be paused because it is in '${job.status}' status`
      );
    }

    const updated = await this.jobRepo.updateJobStatus(jobId, 'PAUSED', true);

    if (typeof this.realtimeService?.emitToUser === 'function') {
      this.realtimeService.emitToUser(userId, 'strategy:job_paused', {
        jobId,
        timestamp: new Date().toISOString(),
      });
    }

    return updated || job;
  }

  /**
   * Resumes a paused strategy job.
   */
  async resumeStrategyJob(userId: number, jobId: string): Promise<AutomatedStrategyJob> {
    const job = await this.jobRepo.findByJobId(jobId);
    if (!job) {
      throw new AppError(404, 'JOB_NOT_FOUND', `Runner job '${jobId}' not found`);
    }

    if (job.userId !== userId) {
      throw new AppError(403, 'FORBIDDEN_JOB_ACCESS', 'Unauthorized access to runner job');
    }

    if (job.status !== 'PAUSED') {
      throw new AppError(
        400,
        'CANNOT_RESUME_JOB',
        `Job cannot be resumed because it is in '${job.status}' status`
      );
    }

    const updated = await this.jobRepo.updateJobStatus(jobId, 'RUNNING', true);

    if (typeof this.realtimeService?.emitToUser === 'function') {
      this.realtimeService.emitToUser(userId, 'strategy:job_resumed', {
        jobId,
        timestamp: new Date().toISOString(),
      });
    }

    return updated || job;
  }

  /**
   * Stops and terminates a strategy runner job.
   */
  async stopStrategyJob(userId: number, jobId: string): Promise<AutomatedStrategyJob> {
    const job = await this.jobRepo.findByJobId(jobId);
    if (!job) {
      throw new AppError(404, 'JOB_NOT_FOUND', `Runner job '${jobId}' not found`);
    }

    if (job.userId !== userId) {
      throw new AppError(403, 'FORBIDDEN_JOB_ACCESS', 'Unauthorized access to runner job');
    }

    if (job.status === 'CANCELLED' || job.status === 'COMPLETED') {
      return job;
    }

    const updated = await this.jobRepo.updateJobStatus(jobId, 'CANCELLED', false);

    if (typeof this.realtimeService?.emitToUser === 'function') {
      this.realtimeService.emitToUser(userId, 'strategy:job_stopped', {
        jobId,
        timestamp: new Date().toISOString(),
      });
    }

    return updated || job;
  }

  /**
   * Emergency Kill Switch: immediately halts all user's active jobs and cancels open strategy orders.
   */
  async emergencyKillSwitch(userId: number): Promise<{
    stoppedJobsCount: number;
    cancelledOrdersCount: number;
  }> {
    const stoppedJobsCount = await this.jobRepo.stopAllUserJobs(userId);
    let cancelledOrdersCount = 0;

    // Optional: cancel eligible open orders if orderService is wired
    if (this.orderService) {
      try {
        const userOrders = await (this.orderService as any).getUserOrders?.(userId);
        if (Array.isArray(userOrders)) {
          for (const ord of userOrders) {
            if (ord.status === 'OPEN' || ord.status === 'PARTIALLY_FILLED') {
              try {
                await this.orderService.cancelOrder(userId, ord.id);
                cancelledOrdersCount++;
              } catch {
                // Ignore individual order cancel failures during emergency flush
              }
            }
          }
        }
      } catch {
        // Safe continuation
      }
    }

    if (typeof this.realtimeService?.emitToUser === 'function') {
      this.realtimeService.emitToUser(userId, 'strategy:kill_switch_activated', {
        stoppedJobsCount,
        cancelledOrdersCount,
        timestamp: new Date().toISOString(),
      });
    }

    return { stoppedJobsCount, cancelledOrdersCount };
  }

  /**
   * Lists all background runner jobs belonging to authenticated user.
   */
  async listUserJobs(userId: number): Promise<AutomatedStrategyJob[]> {
    return this.jobRepo.findByUserId(userId);
  }

  /**
   * Retrieves single job details with generated orders audit trail.
   */
  async getJobDetails(
    userId: number,
    jobId: string
  ): Promise<{
    job: AutomatedStrategyJob;
    orders: AutomatedStrategyOrder[];
  }> {
    const job = await this.jobRepo.findByJobId(jobId);
    if (!job) {
      throw new AppError(404, 'JOB_NOT_FOUND', `Runner job '${jobId}' not found`);
    }

    if (job.userId !== userId) {
      throw new AppError(403, 'FORBIDDEN_JOB_ACCESS', 'Unauthorized access to runner job');
    }

    const orders = await this.jobRepo.findOrdersByJobId(jobId, userId);
    return { job, orders };
  }

  /**
   * Lists orders submitted by an automated strategy job.
   */
  async listJobOrders(userId: number, jobId: string): Promise<AutomatedStrategyOrder[]> {
    const job = await this.jobRepo.findByJobId(jobId);
    if (!job) {
      throw new AppError(404, 'JOB_NOT_FOUND', `Runner job '${jobId}' not found`);
    }

    if (job.userId !== userId) {
      throw new AppError(403, 'FORBIDDEN_JOB_ACCESS', 'Unauthorized access to runner job');
    }

    return this.jobRepo.findOrdersByJobId(jobId, userId);
  }
}

export const automatedStrategyRunnerService = new AutomatedStrategyRunnerService();
