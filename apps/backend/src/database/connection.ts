import knex, { Knex } from 'knex';
import knexConfig from './knexfile';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const environment = config.NODE_ENV || 'development';
const activeConfig = knexConfig[environment] || knexConfig.development;

export const db: Knex = knex(activeConfig);

/**
 * Check whether the database connection is healthy.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database health check failed', error);
    return false;
  }
}

/**
 * Close all database pool connections gracefully.
 */
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await db.destroy();
    logger.info('Database connection pool closed successfully.');
  } catch (error) {
    logger.error('Error closing database pool', error);
  }
}
