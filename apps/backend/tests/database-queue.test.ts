import { describe, it, expect, beforeEach } from 'vitest';
import {
  isDeadlockError,
  withDeadlockRetry,
} from '../src/database/resilience';
import {
  HardenedJobQueue,
} from '../src/infrastructure/queue/job-queue';

describe('Phase 11B: Database & Background Infrastructure Hardening', () => {
  describe('1. Deadlock Detection and Retry Logic', () => {
    it('should correctly identify MySQL deadlock error codes and messages', () => {
      expect(isDeadlockError({ code: 'ER_LOCK_DEADLOCK', errno: 1213 })).toBe(true);
      expect(isDeadlockError({ code: 'ER_LOCK_WAIT_TIMEOUT', errno: 1205 })).toBe(true);
      expect(isDeadlockError({ message: 'Deadlock found when trying to get lock; try restarting transaction' })).toBe(true);
      expect(isDeadlockError({ code: 'ER_DUP_ENTRY', errno: 1062 })).toBe(false);
      expect(isDeadlockError(null)).toBe(false);
    });

    it('should retry operation upon deadlock and succeed if resolved within maxRetries', async () => {
      let attemptsCount = 0;

      const result = await withDeadlockRetry(
        async (attempt) => {
          attemptsCount++;
          if (attempt < 3) {
            const deadlockErr: any = new Error('Deadlock found when trying to get lock');
            deadlockErr.code = 'ER_LOCK_DEADLOCK';
            deadlockErr.errno = 1213;
            throw deadlockErr;
          }
          return 'SETTLEMENT_SUCCESS';
        },
        { maxRetries: 3, baseDelayMs: 10 }
      );

      expect(attemptsCount).toBe(3);
      expect(result).toBe('SETTLEMENT_SUCCESS');
    });

    it('should immediately rethrow non-deadlock errors without retrying', async () => {
      let attemptsCount = 0;

      await expect(
        withDeadlockRetry(
          async () => {
            attemptsCount++;
            const syntaxErr: any = new Error('Syntax error in SQL query');
            syntaxErr.code = 'ER_PARSE_ERROR';
            throw syntaxErr;
          },
          { maxRetries: 3, baseDelayMs: 10 }
        )
      ).rejects.toThrow('Syntax error in SQL query');

      expect(attemptsCount).toBe(1);
    });

    it('should exhaust retries and throw error when deadlock persists continuously', async () => {
      let attemptsCount = 0;

      await expect(
        withDeadlockRetry(
          async () => {
            attemptsCount++;
            const persistentDeadlock: any = new Error('Deadlock found when trying to get lock');
            persistentDeadlock.code = 'ER_LOCK_DEADLOCK';
            persistentDeadlock.errno = 1213;
            throw persistentDeadlock;
          },
          { maxRetries: 3, baseDelayMs: 10 }
        )
      ).rejects.toThrow('Deadlock found');

      // Initial attempt (1) + 3 retries (2, 3, 4) = 4 total calls
      expect(attemptsCount).toBe(4);
    });
  });

  describe('2. In-Process Background Queue Hardening', () => {
    let queue: HardenedJobQueue;

    beforeEach(() => {
      queue = new HardenedJobQueue({
        maxCapacity: 5,
        concurrency: 2,
        defaultMaxAttempts: 3,
        retryBaseDelayMs: 20,
      });
    });

    it('should enqueue and successfully execute registered job handlers', async () => {
      let handled = false;
      queue.registerHandler('ORDER_AUDIT', async (job) => {
        if (job.data.orderId === 42) handled = true;
      });

      const jobId = await queue.enqueue('ORDER_AUDIT', { orderId: 42 });
      expect(jobId).toBeDefined();

      // Give worker brief moment to process
      await new Promise((r) => setTimeout(r, 50));
      expect(handled).toBe(true);
      expect(queue.getMetrics().completedCount).toBe(1);
    });

    it('should reject new jobs when capacity limit is reached (backpressure)', async () => {
      // Register a blocking handler so jobs accumulate in queue
      let unblock: () => void;
      const blocker = new Promise<void>((res) => { unblock = res; });
      queue.registerHandler('BLOCKING_JOB', async () => {
        await blocker;
      });

      // Concurrency is 2, capacity is 5.
      // First 2 go into in-flight, next 5 go into queue (total 7 or queue = 5).
      for (let i = 0; i < 7; i++) {
        await queue.enqueue('BLOCKING_JOB', { idx: i });
      }

      expect(queue.size()).toBe(5);

      // 8th job must exceed capacity and be rejected with capacity error
      await expect(queue.enqueue('BLOCKING_JOB', { idx: 8 })).rejects.toThrow(
        /QUEUE_CAPACITY_EXCEEDED/
      );

      // Unblock to let queue finish cleanly
      unblock!();
      await queue.drain(1000);
    });

    it('should retry failed jobs with exponential backoff and route to DLQ upon final failure', async () => {
      let callCount = 0;
      queue.registerHandler('FAILING_JOB', async () => {
        callCount++;
        throw new Error('Downstream simulated settlement failure');
      });

      await queue.enqueue('FAILING_JOB', { tradeId: 101 });

      // Wait for 3 attempts with 20ms exponential delay
      await new Promise((r) => setTimeout(r, 250));

      expect(callCount).toBe(3);
      expect(queue.dlqSize()).toBe(1);

      const dlq = queue.getDLQ();
      expect(dlq[0].finalError).toContain('Downstream simulated settlement failure');
      expect(dlq[0].totalAttempts).toBe(3);
      expect(dlq[0].job.data.tradeId).toBe(101);
    });

    it('should support retrying jobs from the Dead Letter Queue', async () => {
      let shouldFail = true;
      let executedSuccess = false;

      queue.registerHandler('RECOVERABLE_JOB', async () => {
        if (shouldFail) {
          throw new Error('Temporary failure');
        }
        executedSuccess = true;
      });

      const jobId = await queue.enqueue('RECOVERABLE_JOB', { id: 99 });
      await new Promise((r) => setTimeout(r, 200));

      expect(queue.dlqSize()).toBe(1);

      // Now heal the service and retry from DLQ
      shouldFail = false;
      const retried = await queue.retryDLQJob(jobId);
      expect(retried).toBe(true);
      expect(queue.dlqSize()).toBe(0);

      await new Promise((r) => setTimeout(r, 100));
      expect(executedSuccess).toBe(true);
    });

    it('should gracefully drain in-flight jobs during shutdown', async () => {
      let completedJobs = 0;
      queue.registerHandler('SLOW_JOB', async () => {
        await new Promise((r) => setTimeout(r, 50));
        completedJobs++;
      });

      await queue.enqueue('SLOW_JOB', { n: 1 });
      await queue.enqueue('SLOW_JOB', { n: 2 });

      const drainedCleanly = await queue.drain(1000);
      expect(drainedCleanly).toBe(true);
      expect(completedJobs).toBe(2);
      expect(queue.size()).toBe(0);
      expect(queue.inFlightCount()).toBe(0);
    });
  });
});
