import { logger } from '../../utils/logger';

/**
 * Per-instrument serialized matching queue.
 *
 * Guarantees that orders targeting the same instrument are matched strictly sequentially,
 * preserving Price-Time FIFO priority and eliminating concurrent race conditions on order books
 * and settlement transactions.
 *
 * Orders targeting different instruments execute in parallel without cross-instrument contention.
 */
export class InstrumentMatchingQueue {
  private queues: Map<number, Promise<unknown>> = new Map();
  private pendingCounts: Map<number, number> = new Map();

  /**
   * Enqueues an asynchronous task for a specific instrument.
   */
  async enqueue<T>(instrumentId: number, task: () => Promise<T>): Promise<T> {
    const currentQueue = this.queues.get(instrumentId) || Promise.resolve();
    this.pendingCounts.set(instrumentId, (this.pendingCounts.get(instrumentId) || 0) + 1);

    let resolveTask!: (val: T) => void;
    let rejectTask!: (err: unknown) => void;

    const taskPromise = new Promise<T>((res, rej) => {
      resolveTask = res;
      rejectTask = rej;
    });

    const nextQueue = currentQueue
      .then(async () => {
        try {
          const result = await task();
          resolveTask(result);
        } catch (err: unknown) {
          logger.error(`[MATCHING QUEUE] Task failed for instrument #${instrumentId}: ${(err as Error).message}`);
          rejectTask(err);
        } finally {
          const count = (this.pendingCounts.get(instrumentId) || 1) - 1;
          if (count <= 0) {
            this.pendingCounts.delete(instrumentId);
            if (this.queues.get(instrumentId) === nextQueue) {
              this.queues.delete(instrumentId);
            }
          } else {
            this.pendingCounts.set(instrumentId, count);
          }
        }
      })
      .catch((err: unknown) => {
        // Prevent unhandled promise rejection from breaking future queued tasks
        logger.warn(`[MATCHING QUEUE] Prior task error caught in chain for #${instrumentId}: ${(err as Error).message}`);
      });

    this.queues.set(instrumentId, nextQueue);
    return taskPromise;
  }

  /**
   * Returns current pending task count for an instrument.
   */
  getPendingCount(instrumentId: number): number {
    return this.pendingCounts.get(instrumentId) || 0;
  }

  /**
   * Clears all queued state (used during test teardown).
   */
  clear(): void {
    this.queues.clear();
    this.pendingCounts.clear();
  }
}

export const instrumentMatchingQueue = new InstrumentMatchingQueue();
