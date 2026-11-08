import { describe, it, expect, beforeEach } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import {
  validateProductionSecrets,
  assertSecurityReadiness,
} from '../src/infrastructure/security/secret-validator';
import {
  createRateLimiter,
} from '../src/middleware/rate-limiter.middleware';
import { AuthService } from '../src/modules/auth/auth.service';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
} from './mocks/in-memory-repositories';
import { WalletService } from '../src/modules/wallet/wallet.service';

describe('Phase 11C: Security & Secrets Management Hardening', () => {
  describe('1. Startup Secrets & Environment Validation', () => {
    it('should reject secrets shorter than 32 characters in production', () => {
      const result = validateProductionSecrets({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'short_secret_under_32',
        JWT_REFRESH_SECRET: 'another_short_secret',
        DB_PASSWORD: 'secure_password_987654321',
        CORS_ORIGIN: 'https://tradegrid.app',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('minimum 32 required'))).toBe(true);
    });

    it('should reject development default passwords and keywords in production', () => {
      const result = validateProductionSecrets({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'my_production_dev_access_secret_with_32_characters',
        JWT_REFRESH_SECRET: 'my_production_test_refresh_secret_with_32_characters',
        DB_PASSWORD: 'tradegrid_secure_password', // default dev password
        CORS_ORIGIN: '*', // wildcard prohibited in production
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("insecure development keyword 'dev'"))).toBe(true);
      expect(result.errors.some((e) => e.includes('default development password'))).toBe(true);
      expect(result.errors.some((e) => e.includes('wildcard (*) in production'))).toBe(true);
    });

    it('should reject identical access and refresh tokens', () => {
      const secret = 'valid_high_entropy_secret_with_length_greater_than_32_characters_123';
      const result = validateProductionSecrets({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: secret,
        JWT_REFRESH_SECRET: secret,
        DB_PASSWORD: 'super_strong_production_database_password_99',
        CORS_ORIGIN: 'https://tradegrid.app',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('must not be identical'))).toBe(true);
    });

    it('should pass cleanly when high-entropy, distinct production secrets are provided', () => {
      const result = validateProductionSecrets({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: '8b7f14a29c4e81d603a55b21e90fa47d9c12b48e6f3a71c82904b5e28a1c93f0',
        JWT_REFRESH_SECRET: '3d9a10c7e42b89f51a63c80e72b491fa58c03d7e19b2a64c8f50e7193b2a84c6',
        DB_PASSWORD: 'prod_db_strong_unique_pass_928174!',
        CORS_ORIGIN: 'https://tradegrid.app',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('2. Tiered Rate Limiting & Abuse Prevention', () => {
    let testApp: express.Application;

    beforeEach(() => {
      testApp = express();
      const limiter = createRateLimiter({
        windowMs: 2000,
        maxRequests: 3,
        tierName: 'AUTH_TEST',
        skipInTest: false,
      });

      testApp.use('/test/limited', limiter, (_req: Request, res: Response) => {
        res.json({ success: true });
      });
    });

    it('should allow requests within limit and return accurate rate limit headers', async () => {
      const res1 = await request(testApp).get('/test/limited');
      expect(res1.status).toBe(200);
      expect(res1.headers['ratelimit-limit']).toBe('3');
      expect(res1.headers['ratelimit-remaining']).toBe('2');

      const res2 = await request(testApp).get('/test/limited');
      expect(res2.status).toBe(200);
      expect(res2.headers['ratelimit-remaining']).toBe('1');

      const res3 = await request(testApp).get('/test/limited');
      expect(res3.status).toBe(200);
      expect(res3.headers['ratelimit-remaining']).toBe('0');
    });

    it('should block requests exceeding limit with 429 Too Many Requests and Retry-After header', async () => {
      await request(testApp).get('/test/limited');
      await request(testApp).get('/test/limited');
      await request(testApp).get('/test/limited');

      // 4th request must be throttled
      const res4 = await request(testApp).get('/test/limited');
      expect(res4.status).toBe(429);
      expect(res4.body.success).toBe(false);
      expect(res4.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res4.headers['retry-after']).toBeDefined();
    });
  });

  describe('3. JWT Refresh Token Rotation & Family Revocation', () => {
    let userRepo: InMemoryUserRepository;
    let sessionRepo: InMemorySessionRepository;
    let walletRepo: InMemoryWalletRepository;
    let ledgerRepo: InMemoryLedgerRepository;
    let authService: AuthService;

    beforeEach(() => {
      userRepo = new InMemoryUserRepository();
      sessionRepo = new InMemorySessionRepository();
      walletRepo = new InMemoryWalletRepository();
      ledgerRepo = new InMemoryLedgerRepository();
      const walletService = new WalletService(walletRepo, ledgerRepo);
      authService = new AuthService(userRepo, sessionRepo, walletService);
    });

    it('should rotate refresh token on valid refresh request', async () => {
      const reg = await authService.register({
        email: 'trader.secure@tradegrid.internal',
        username: 'trader_secure',
        password: 'Password123!',
      });

      const initialRefreshToken = reg.tokens.refreshToken;

      // First refresh
      const refreshed = await authService.refresh(initialRefreshToken);
      expect(refreshed.tokens.accessToken).toBeDefined();
      expect(refreshed.tokens.refreshToken).toBeDefined();
      expect(refreshed.tokens.refreshToken).not.toBe(initialRefreshToken);
    });

    it('should detect refresh token reuse attack and revoke all user sessions', async () => {
      const reg = await authService.register({
        email: 'victim.trader@tradegrid.internal',
        username: 'victim_trader',
        password: 'Password123!',
      });

      const stolenInitialToken = reg.tokens.refreshToken;

      // Legitimate user refreshes token
      const legitRefresh = await authService.refresh(stolenInitialToken);
      expect(legitRefresh.tokens.refreshToken).toBeDefined();

      // Attacker attempts to reuse stolenInitialToken
      await expect(authService.refresh(stolenInitialToken)).rejects.toThrow(
        /Session has been revoked/
      );

      // Verify that the legitimate user's new token is ALSO revoked for protection
      await expect(authService.refresh(legitRefresh.tokens.refreshToken)).rejects.toThrow(
        /Session has been revoked/
      );
    });
  });
});
