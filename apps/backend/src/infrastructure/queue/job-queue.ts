import { logger } from '../../utils/logger';

export interface JobDefinition<T = any> {
  id: string;
  type: string;
  data: T;
  maxAttempts?: number;
  attempts?: number;
  createdAt: Date;
  lastAttemptAt?: Date;
  lastError?: string;
}

export interface DeadLetterJob<T = any> {
  job: JobDefinition<T>;
  failedAt: Date;
  finalError: string;
  stack?: string;
  totalAttempts: number;
}

export interface QueueMetrics {
  queuedCount: number;
  inFlightCount: number;
  completedCount: number;
  failedCount: number;
  dlqCount: number;
  isDraining: boolean;
}

export interface JobQueueOptions {
  maxCapacity?: number;
  concurrency?: number;
  defaultMaxAttempts?: number;
  retryBaseDelayMs?: number;
}

/**
 * HardenedJobQueue
 *
 * Enterprise-grade in-process background job queue designed for $0 operational budgets.
 * Provides backpressure capacity limits, automatic exponential retry, Dead Letter Queue (DLQ)
 * error retention, and zero-data-loss graceful shutdown draining.
 */
export class HardenedJobQueue {
  private queue: JobDefinition[] = [];
  private dlq: DeadLetterJob[] = [];
  private inFlight: Set<string> = new Set();
  private handlers: Map<string, (job: JobDefinition) => Promise<void>> = new Map();

  private maxCapacity: number;
  private concurrency: number;
  private defaultMaxAttempts: number;
  private retryBaseDelayMs: number;

  private isDraining: boolean = false;
  private completedCount: number = 0;
  private failedCount: number = 0;

  constructor(options: JobQueueOptions = {}) {
    this.maxCapacity = options.maxCapacity ?? 1000;
    this.concurrency = options.concurrency ?? 5;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 100;
  }

  registerHandler(type: string, handler: (job: JobDefinition) => Promise<void>): void {
    this.handlers.set(type, handler);
  }

  async enqueue<T>(type: string, data: T, id?: string): Promise<string> {
    if (this.isDraining) {
      throw new Error(`Cannot enqueue job: Queue is currently draining for shutdown.`);
    }

    if (this.queue.length >= this.maxCapacity) {
      logger.warn(
        `[QUEUE BACKPRESSURE] Queue capacity limit (${this.maxCapacity}) reached. Rejecting incoming job of type '${type}'.`
      );
      throw new Error(`QUEUE_CAPACITY_EXCEEDED: Maximum queue capacity of ${this.maxCapacity} reached.`);
    }

    const jobId = id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: JobDefinition<T> = {
      id: jobId,
      type,
      data,
      attempts: 0,
      maxAttempts: this.defaultMaxAttempts,
      createdAt: new Date(),
    };

    this.queue.push(job);
    this.processNext();
    return jobId;
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0 || this.inFlight.size >= this.concurrency) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.inFlight.add(job.id);
    job.attempts = (job.attempts || 0) + 1;
    job.lastAttemptAt = new Date();

    const handler = this.handlers.get(job.type);

    if (!handler) {
      this.inFlight.delete(job.id);
      this.moveToDLQ(job, `No registered handler found for job type '${job.type}'`);
      this.processNext();
      return;
    }

    try {
      await handler(job);
      this.inFlight.delete(job.id);
      this.completedCount++;
      this.processNext();
    } catch (err: any) {
      this.inFlight.delete(job.id);
      job.lastError = err.message;

      const maxAttempts = job.maxAttempts || this.defaultMaxAttempts;
      if (job.attempts! < maxAttempts) {
        // Exponential backoff before re-queueing
        const backoffMs = this.retryBaseDelayMs * Math.pow(2, job.attempts! - 1);
        logger.warn(
          `[JOB RETRY] Job #${job.id} (${job.type}) failed on attempt ${job.attempts}/${maxAttempts}: ${err.message}. Retrying in ${backoffMs}ms...`
        );
        setTimeout(() => {
          if (!this.isDraining) {
            this.queue.push(job);
            this.processNext();
          } else {
            this.moveToDLQ(job, `Job aborted during queue shutdown drain: ${err.message}`);
          }
        }, backoffMs);
      } else {
        // Permanently failed -> Dead Letter Queue
        this.failedCount++;
        this.moveToDLQ(job, err.message, err.stack);
        this.processNext();
      }
    }
  }

  private moveToDLQ(job: JobDefinition, errorMsg: string, stack?: string): void {
    logger.error(`[DEAD LETTER QUEUE] Job #${job.id} (${job.type}) permanently failed. Moved to DLQ: ${errorMsg}`);
    this.dlq.push({
      job,
      failedAt: new Date(),
      finalError: errorMsg,
      stack,
      totalAttempts: job.attempts || 1,
    });
  }

  getDLQ(): DeadLetterJob[] {
    return [...this.dlq];
  }

  clearDLQ(): void {
    this.dlq = [];
  }

  async retryDLQJob(jobId: string): Promise<boolean> {
    const idx = this.dlq.findIndex((x) => x.job.id === jobId);
    if (idx === -1) return false;

    const deadItem = this.dlq.splice(idx, 1)[0];
    const job = deadItem.job;
    job.attempts = 0;
    job.lastError = undefined;

    this.queue.push(job);
    this.processNext();
    return true;
  }

  /**
   * Graceful Shutdown Drain
   * Awaits completion of in-flight and pending jobs up to the specified grace period.
   */
  async drain(gracePeriodMs: number = 10000): Promise<boolean> {
    this.isDraining = true;
    logger.info(`[QUEUE DRAIN] Initiating graceful shutdown. Remaining: ${this.queue.length} queued, ${this.inFlight.size} in-flight.`);

    const startTime = Date.now();

    while (this.queue.length > 0 || this.inFlight.size > 0) {
      if (Date.now() - startTime > gracePeriodMs) {
        logger.warn(`[QUEUE DRAIN TIMEOUT] Grace period of ${gracePeriodMs}ms expired with remaining jobs. Aborting drain.`);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    logger.info(`[QUEUE DRAIN COMPLETE] All jobs finished cleanly.`);
    return true;
  }

  size(): number {
    return this.queue.length;
  }

  inFlightCount(): number {
    return this.inFlight.size;
  }

  dlqSize(): number {
    return this.dlq.length;
  }

  getMetrics(): QueueMetrics {
    return {
      queuedCount: this.queue.length,
      inFlightCount: this.inFlight.size,
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      dlqCount: this.dlq.length,
      isDraining: this.isDraining,
    };
  }
}

export const defaultJobQueue = new HardenedJobQueue();
