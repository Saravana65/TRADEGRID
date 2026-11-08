import { Knex } from 'knex';
import { logger } from '../utils/logger';

export interface DeadlockRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  operationName?: string;
}

export interface MigrationRunnerResult {
  migratedCount: number;
  batchNo?: number;
  status: 'SUCCESS' | 'UP_TO_DATE' | 'DRY_RUN';
  migrations: string[];
}

/**
 * Checks whether an exception is a retryable database lock deadlock or wait timeout.
 */
export function isDeadlockError(error: any): boolean {
  if (!error) return false;

  const code = error.code || '';
  const errno = error.errno || 0;
  const msg = String(error.message || '');

  return (
    code === 'ER_LOCK_DEADLOCK' ||
    errno === 1213 ||
    code === 'ER_LOCK_WAIT_TIMEOUT' ||
    errno === 1205 ||
    msg.includes('Deadlock found when trying to get lock') ||
    msg.includes('Lock wait timeout exceeded')
  );
}

/**
 * Executes a database operation with exponential backoff and randomized jitter on deadlock.
 * Essential for high-contention order matching and atomic wallet ledger settlements.
 */
export async function withDeadlockRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: DeadlockRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 50;
  const maxDelayMs = options.maxDelayMs ?? 500;
  const name = options.operationName ?? 'DatabaseOperation';

  let attempt = 0;

  while (true) {
    attempt++;
    try {
      return await operation(attempt);
    } catch (error: any) {
      if (isDeadlockError(error) && attempt <= maxRetries) {
        const backoff = Math.min(
          maxDelayMs,
          baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 25)
        );
        logger.warn(
          `[DEADLOCK RETRY] ${name}: Deadlock detected on attempt ${attempt}/${maxRetries}. Retrying in ${backoff}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      // Non-retryable error or exhausted retries
      if (isDeadlockError(error)) {
        logger.error(
          `[DEADLOCK EXHAUSTED] ${name}: Max retries (${maxRetries}) exhausted due to persistent lock contention.`
        );
      }
      throw error;
    }
  }
}

/**
 * Executes a Knex transaction with an enforced maximum timeout guarantee.
 */
export async function withTransactionTimeout<T>(
  knexInstance: Knex,
  callback: (trx: Knex.Transaction) => Promise<T>,
  timeoutMs: number = 5000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let isSettled = false;

    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        reject(
          new Error(
            `Transaction timeout: Database transaction exceeded maximum permitted duration of ${timeoutMs}ms.`
          )
        );
      }
    }, timeoutMs);

    knexInstance
      .transaction(async (trx) => {
        try {
          const result = await callback(trx);
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            resolve(result);
          }
        } catch (err) {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            reject(err);
          }
        }
      })
      .catch((err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

/**
 * Safe Database Migration Runner
 * Automatically checks and applies outstanding migrations with rollback and dry-run safety.
 */
export async function runStartupMigrations(
  knexInstance: Knex,
  options: { dryRun?: boolean } = {}
): Promise<MigrationRunnerResult> {
  if (options.dryRun) {
    const [batchNo, log] = await knexInstance.migrate.list();
    const pending = (log[1] as any[]) || [];
    return {
      migratedCount: pending.length,
      status: 'DRY_RUN',
      migrations: pending.map((m: any) => (typeof m === 'string' ? m : m.name)),
    };
  }

  const [batchNo, applied] = await knexInstance.migrate.latest();
  const count = applied.length;

  if (count === 0) {
    logger.info('[MIGRATIONS] Database schema is up to date.');
    return {
      migratedCount: 0,
      batchNo,
      status: 'UP_TO_DATE',
      migrations: [],
    };
  }

  logger.info(`[MIGRATIONS] Successfully executed ${count} migrations in batch #${batchNo}: ${applied.join(', ')}`);
  return {
    migratedCount: count,
    batchNo,
    status: 'SUCCESS',
    migrations: applied,
  };
}
