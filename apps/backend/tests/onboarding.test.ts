import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { OnboardingService, OnboardingController } from '../src/modules/onboarding';
import { generateTokens } from '../src/utils/jwt';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
  InMemoryOrderRepository,
  InMemoryStrategyRepository,
} from './mocks/in-memory-repositories';

describe('Phase 12B: User Onboarding and Interactive Documentation', () => {
  let app: any;
  let onboardingService: OnboardingService;
  let onboardingController: OnboardingController;
  let userRepo: InMemoryUserRepository;
  let walletRepo: InMemoryWalletRepository;
  let orderRepo: InMemoryOrderRepository;
  let strategyRepo: InMemoryStrategyRepository;

  let traderToken: string;
  let traderId: number;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    walletRepo = new InMemoryWalletRepository();
    orderRepo = new InMemoryOrderRepository();
    strategyRepo = new InMemoryStrategyRepository();

    onboardingService = new OnboardingService(walletRepo, orderRepo, strategyRepo);
    onboardingController = new OnboardingController(onboardingService);

    app = createApp({
      onboardingController,
      customCheckDb: async () => true,
    });

    const user = await userRepo.create({
      username: 'onboarding_trader',
      email: 'trader@onboarding.tradegrid',
      password_hash: 'mock_argon2_hash',
      role: 'TRADER',
      status: 'ACTIVE',
    });
    traderId = user.id;

    // Seed initial wallet
    await walletRepo.createWallet({
      user_id: traderId,
      currency: 'USD',
      available_balance: '100000.0000',
    });

    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      username: user.username,
      role: 'TRADER',
    });
    traderToken = tokens.accessToken;
  });

  describe('1. Onboarding Guide & Platform Manual API', () => {
    it('GET /api/v1/onboarding/guide should return platform manual overview publicly', async () => {
      const res = await request(app).get('/api/v1/onboarding/guide');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe('1.0.0-rc.1');
      expect(res.body.data.disclaimer).toContain('100% VIRTUAL SIMULATOR');
      expect(res.body.data.keyFeatures.length).toBeGreaterThanOrEqual(5);
      expect(res.body.data.checklist).toBeUndefined(); // Unauthenticated call has no personalized checklist
    });

    it('GET /api/v1/onboarding/guide should attach personalized checklist when authenticated', async () => {
      const res = await request(app)
        .get('/api/v1/onboarding/guide')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checklist).toBeDefined();
      expect(res.body.data.checklist.userId).toBe(traderId);
      expect(res.body.data.checklist.hasFundedWallet).toBe(true);
    });
  });

  describe('2. Mandatory Disclaimer Acknowledgment', () => {
    it('POST /api/v1/onboarding/acknowledge-disclaimer should reject unauthenticated requests', async () => {
      const res = await request(app).post('/api/v1/onboarding/acknowledge-disclaimer');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/onboarding/acknowledge-disclaimer should record user acknowledgment', async () => {
      const res = await request(app)
        .post('/api/v1/onboarding/acknowledge-disclaimer')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.acknowledged).toBe(true);
      expect(res.body.data.timestamp).toBeDefined();

      // Verify checklist reflects acknowledgment
      const checklist = await onboardingService.getChecklist(traderId);
      expect(checklist.disclaimerAcknowledged).toBe(true);
    });
  });

  describe('3. Dynamic Checklist Progress', () => {
    it('GET /api/v1/onboarding/checklist should calculate dynamic user progress', async () => {
      // Step 0: Initial state - disclaimer not acknowledged, has wallet, no orders, no strategies
      let res = await request(app)
        .get('/api/v1/onboarding/checklist')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.disclaimerAcknowledged).toBe(false);
      expect(res.body.data.hasFundedWallet).toBe(true);
      expect(res.body.data.hasPlacedOrder).toBe(false);
      expect(res.body.data.hasCreatedStrategy).toBe(false);
      expect(res.body.data.completedStepsCount).toBe(1); // Only WALLET_GRANT is completed

      // Step 1: Acknowledge disclaimer
      await onboardingService.acknowledgeDisclaimer(traderId);

      // Step 2: Create a strategy
      await strategyRepo.createStrategy({
        userId: traderId,
        name: 'Alpha Cross',
        dslCode: 'strategy "Alpha Cross"',
        isValid: true,
      });

      // Step 3: Place an order
      await orderRepo.create({
        userId: traderId,
        instrumentId: 10,
        orderType: 'LIMIT',
        side: 'BUY',
        quantity: '10.0000',
        limitPrice: '142.0000',
        remainingQuantity: '10.0000',
        status: 'OPEN',
      } as any);

      // Query updated checklist
      res = await request(app)
        .get('/api/v1/onboarding/checklist')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.disclaimerAcknowledged).toBe(true);
      expect(res.body.data.hasPlacedOrder).toBe(true);
      expect(res.body.data.hasCreatedStrategy).toBe(true);
      expect(res.body.data.completedStepsCount).toBe(5); // All steps completed
      expect(res.body.data.progressPercentage).toBe(100);
    });
  });
});
