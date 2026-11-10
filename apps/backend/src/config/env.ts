import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from backend root or monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to current working directory

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5005').transform((val) => parseInt(val, 10)),
  
  // Database
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('3306').transform((val) => parseInt(val, 10)),
  DB_NAME: z.string().default('tradegrid'),
  DB_USER: z.string().default('tradegrid_user'),
  DB_PASSWORD: z.string().default('tradegrid_secure_password'),
  DB_CONNECTION_LIMIT: z.string().default('10').transform((val) => parseInt(val, 10)),

  // JWT (Default fallback provided for test environment)
  JWT_ACCESS_SECRET: z.string().default(
    process.env.NODE_ENV === 'test'
      ? 'test_jwt_access_secret_key_1234567890_min32chars'
      : ''
  ).refine((val) => val.length >= 16, {
    message: 'JWT_ACCESS_SECRET must be at least 16 characters',
  }),
  JWT_REFRESH_SECRET: z.string().default(
    process.env.NODE_ENV === 'test'
      ? 'test_jwt_refresh_secret_key_1234567890_min32chars'
      : ''
  ).refine((val) => val.length >= 16, {
    message: 'JWT_REFRESH_SECRET must be at least 16 characters',
  }),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CLIENT_URL: z.string().default('http://localhost:5173'),

  // Argon2 Cost parameters
  ARGON2_MEMORY_COST: z.string().default('65536').transform((val) => parseInt(val, 10)),
  ARGON2_TIME_COST: z.string().default('3').transform((val) => parseInt(val, 10)),
  ARGON2_PARALLELISM: z.string().default('1').transform((val) => parseInt(val, 10)),

  // Phase 2: Wallet & Ledger
  INITIAL_WALLET_BALANCE: z.string().default('100000.0000'),
  DEFAULT_CURRENCY: z.string().default('USD'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success && process.env.NODE_ENV !== 'test') {
  console.error('❌ FATAL: Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.success
  ? parsed.data
  : {
      NODE_ENV: 'test' as const,
      PORT: 5005,
      DB_HOST: 'localhost',
      DB_PORT: 3306,
      DB_NAME: 'tradegrid_test',
      DB_USER: 'tradegrid_user',
      DB_PASSWORD: 'tradegrid_secure_password',
      DB_CONNECTION_LIMIT: 5,
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_key_1234567890_min32chars',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_key_1234567890_min32chars',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      CLIENT_URL: 'http://localhost:5173',
      ARGON2_MEMORY_COST: 65536,
      ARGON2_TIME_COST: 3,
      ARGON2_PARALLELISM: 1,
      INITIAL_WALLET_BALANCE: '100000.0000',
      DEFAULT_CURRENCY: 'USD',
    };
