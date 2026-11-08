import type { Knex } from 'knex';
import path from 'path';
import { config } from '../config/env';

const migrationsPath = path.resolve(__dirname, '../../../../database/migrations');
const seedsPath = path.resolve(__dirname, '../../../../database/seeds');

const knexConfig: { [key: string]: Knex.Config } = {
  development: {
    client: 'mysql2',
    connection: {
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      charset: 'utf8mb4',
    },
    pool: {
      min: 2,
      max: config.DB_CONNECTION_LIMIT,
    },
    migrations: {
      directory: migrationsPath,
      extension: 'ts',
      loadExtensions: ['.ts', '.js'],
    },
    seeds: {
      directory: seedsPath,
      extension: 'ts',
      loadExtensions: ['.ts', '.js'],
    },
  },

  test: {
    client: 'mysql2',
    connection: {
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: `${config.DB_NAME}_test`,
      charset: 'utf8mb4',
    },
    pool: {
      min: 1,
      max: 5,
    },
    migrations: {
      directory: migrationsPath,
      extension: 'ts',
      loadExtensions: ['.ts', '.js'],
    },
    seeds: {
      directory: seedsPath,
      extension: 'ts',
      loadExtensions: ['.ts', '.js'],
    },
  },

  production: {
    client: 'mysql2',
    connection: {
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      charset: 'utf8mb4',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
    },
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '5', 10),
      max: parseInt(process.env.DB_POOL_MAX || String(config.DB_CONNECTION_LIMIT || 25), 10),
      acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT_MS || '10000', 10),
      createTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    },
    migrations: {
      directory: migrationsPath,
      extension: 'js',
    },
  },
};

export default knexConfig;
