import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { BetaEnvironmentService, BetaController } from '../src/modules/beta';
import { AuthService } from '../src/modules/auth/auth.service';
import { generateTokens } from '../src/utils/jwt';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
} from './mocks/in-memory-repositories';

describe('Phase 12A: Controlled Beta Environment & Release Management', () => {
  let app: any;
  let betaService: BetaEnvironmentService;
  let betaController: BetaController;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let authService: AuthService;
  let authController: AuthController;

  let traderToken: string;
  let adminToken: string;
  let traderId: number;
  let adminId: number;

  beforeEach(async () => {
    betaService = new BetaEnvironmentService();
    betaController = new BetaController(betaService);

    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();

    app = createApp({
      betaController,
      customCheckDb: async () => true,
    });

    // Create Beta Trader User & Token
    const traderUser = await userRepo.create({
      username: 'beta_trader',
      email: 'trader@tradegrid.beta',
      password_hash: 'mock_argon2_hash',
      role: 'TRADER',
      status: 'ACTIVE',
    });
    traderId = traderUser.id;
    const traderTokens = generateTokens({
      id: traderUser.id,
      email: traderUser.email,
      username: traderUser.username,
      role: 'TRADER',
    });
    traderToken = traderTokens.accessToken;

    // Create Admin User & Token
    const adminUser = await userRepo.create({
      username: 'beta_admin',
      email: 'admin@tradegrid.beta',
      password_hash: 'mock_argon2_hash',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    adminId = adminUser.id;
    const adminTokens = generateTokens({
      id: adminUser.id,
      email: adminUser.email,
      username: adminUser.username,
      role: 'ADMIN',
    });
    adminToken = adminTokens.accessToken;
  });

  describe('1. Release Metadata & Safety Invariant', () => {
    it('should report release version v1.0.0-rc.1 on beta channel', () => {
      const status = betaService.getBetaStatus();
      expect(status.version).toBe('1.0.0-rc.1');
      expect(status.releaseChannel).toBe('beta');
      expect(status.isVirtualTradingOnly).toBe(true);
      expect(status.disclaimer).toContain('100% VIRTUAL SIMULATOR');
    });

    it('should strictly reject any attempt to disable VIRTUAL_TRADING_ONLY invariant', () => {
      expect(() => {
        betaService.setFeatureFlag('VIRTUAL_TRADING_ONLY', false);
      }).toThrow(/immutable safety invariant/i);
    });

    it('should allow toggling other feature flags safely', () => {
      expect(betaService.isFeatureEnabled('STRATEGY_STUDIO_ENABLED')).toBe(true);
      betaService.setFeatureFlag('STRATEGY_STUDIO_ENABLED', false);
      expect(betaService.isFeatureEnabled('STRATEGY_STUDIO_ENABLED')).toBe(false);
      betaService.setFeatureFlag('STRATEGY_STUDIO_ENABLED', true);
      expect(betaService.isFeatureEnabled('STRATEGY_STUDIO_ENABLED')).toBe(true);
    });
  });

  describe('2. Deterministic Cohort Rollout', () => {
    it('should deterministically assign user cohorts when percentage is restricted', () => {
      betaService.setRolloutPercentage(50);

      // Testing 20 users with 50% rollout: should produce deterministic booleans
      const results1 = [1, 2, 3, 4, 5].map((id) =>
        betaService.isFeatureEnabled('INDIAN_EQUITIES_ENABLED', id)
      );
      const results2 = [1, 2, 3, 4, 5].map((id) =>
        betaService.isFeatureEnabled('INDIAN_EQUITIES_ENABLED', id)
      );

      expect(results1).toEqual(results2); // Must be strictly deterministic
    });

    it('should reject invalid rollout percentages', () => {
      expect(() => betaService.setRolloutPercentage(-5)).toThrow();
      expect(() => betaService.setRolloutPercentage(105)).toThrow();
    });
  });

  describe('3. Beta REST Endpoints & Feedback Telemetry', () => {
    it('GET /api/v1/beta/status should return beta status publicly', async () => {
      const res = await request(app).get('/api/v1/beta/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe('1.0.0-rc.1');
      expect(res.body.data.isVirtualTradingOnly).toBe(true);
      expect(res.body.data.features.VIRTUAL_TRADING_ONLY).toBe(true);
    });

    it('POST /api/v1/beta/feedback should record user feedback with diagnostics', async () => {
      const res = await request(app)
        .post('/api/v1/beta/feedback')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          category: 'PERFORMANCE',
          rating: 5,
          message: 'Order matching executed flawlessly under 100ms latency!',
          diagnostics: { browser: 'Chrome', simulatedUsers: 100 },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toMatch(/^FB-/);
      expect(res.body.data.userId).toBe(traderId);
      expect(res.body.data.category).toBe('PERFORMANCE');
      expect(res.body.data.rating).toBe(5);
    });

    it('POST /api/v1/beta/feedback should reject invalid rating or empty message', async () => {
      const resInvalidRating = await request(app)
        .post('/api/v1/beta/feedback')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          category: 'BUG',
          rating: 6, // Out of range
          message: 'Test bug',
        });
      expect(resInvalidRating.status).toBe(400);

      const resEmptyMessage = await request(app)
        .post('/api/v1/beta/feedback')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          category: 'BUG',
          rating: 4,
          message: '   ',
        });
      expect(resEmptyMessage.status).toBe(400);
    });

    it('GET /api/v1/beta/feedback should enforce admin authorization', async () => {
      // First submit one feedback
      betaService.submitFeedback(traderId, {
        category: 'UX',
        rating: 4,
        message: 'Great charting UI',
      });

      // Regular trader cannot read feedback reports (403 Forbidden)
      const resTrader = await request(app)
        .get('/api/v1/beta/feedback')
        .set('Authorization', `Bearer ${traderToken}`);
      expect(resTrader.status).toBe(403);

      // Admin can read feedback reports (200 OK)
      const resAdmin = await request(app)
        .get('/api/v1/beta/feedback')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.data.feedback.length).toBeGreaterThanOrEqual(1);
    });
  });
});
