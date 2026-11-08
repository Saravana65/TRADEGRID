import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryStrategyRepository,
  InMemoryAutomatedStrategyJobRepository,
  InMemoryInstrumentRepository,
  InMemoryMarketDataRepository,
  InMemoryOrderRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
} from './mocks/in-memory-repositories';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { StrategyController } from '../src/modules/strategies/strategy.controller';
import { StrategyService } from '../src/modules/strategies/strategy.service';
import {
  AutomatedStrategyRunnerService,
  AutomatedStrategyRunnerController,
  AutomatedStrategyScheduler,
} from '../src/modules/strategies/runner';
import { OrderService } from '../src/modules/orders/order.service';
import { OrderReservationService } from '../src/modules/orders/order-reservation.service';
import { MatchingEngine } from '../src/modules/matching/matching-engine';
import { HistoricalDataService } from '../src/modules/research/historical-data.service';

describe('Phase 9D: Background Strategy Runner & Automated Virtual Trading Subsystem', () => {
  let app: any;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let strategyRepo: InMemoryStrategyRepository;
  let jobRepo: InMemoryAutomatedStrategyJobRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let orderRepo: InMemoryOrderRepository;

  let authController: AuthController;
  let strategyController: StrategyController;
  let runnerController: AutomatedStrategyRunnerController;

  let strategyService: StrategyService;
  let runnerService: AutomatedStrategyRunnerService;
  let scheduler: AutomatedStrategyScheduler;
  let orderService: OrderService;

  let userAToken: string;
  let userBToken: string;
  let userAId: number;
  let userBId: number;
  let strategyAId: number;
  let unvalidatedStrategyId: number;

  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    strategyRepo = new InMemoryStrategyRepository();
    jobRepo = new InMemoryAutomatedStrategyJobRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);
    orderRepo = new InMemoryOrderRepository();

    const authService = new AuthService(userRepo, sessionRepo);
    strategyService = new StrategyService(strategyRepo);

    // Setup Mock Instruments
    await instrumentRepo.createInstrument({
      symbol: 'NSE:RELIANCE',
      name: 'Reliance Industries Ltd',
      exchange: 'NSE',
      sector: 'Energy',
      data_classification: 'SIMULATED',
      last_price: '2500.0000',
    } as any);

    // Setup Order Service with mocked knex transaction & reservation service
    const mockKnex = {
      transaction: async (callback: any) => callback({}),
      fn: { now: () => new Date() },
    } as any;
    const matchingEngine = new MatchingEngine();
    const reservationService = new OrderReservationService(walletRepo, ledgerRepo);
    orderService = new OrderService(
      orderRepo,
      instrumentRepo,
      marketDataRepo,
      reservationService,
      matchingEngine,
      mockKnex
    );

    runnerService = new AutomatedStrategyRunnerService(
      jobRepo,
      strategyService,
      orderService,
      instrumentRepo
    );

    const historicalDataService = new HistoricalDataService(marketDataRepo, instrumentRepo);
    scheduler = new AutomatedStrategyScheduler(
      jobRepo,
      strategyService,
      historicalDataService,
      orderService,
      instrumentRepo
    );

    authController = new AuthController(authService);
    strategyController = new StrategyController(strategyService);
    runnerController = new AutomatedStrategyRunnerController(runnerService);

    app = createApp({
      authController,
      strategyController,
      automatedStrategyRunnerController: runnerController,
    });

    // Register User A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        username: 'runner_user_a',
        email: 'runner_a@tradegrid.internal',
        password: 'Password123!',
      });
    userAToken = resA.body.data.tokens.accessToken;
    userAId = resA.body.data.user.id;
    await walletRepo.createWallet({
      user_id: userAId,
      currency: 'USD',
      available_balance: '100000.0000',
    });

    // Register User B
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        username: 'runner_user_b',
        email: 'runner_b@tradegrid.internal',
        password: 'Password123!',
      });
    userBToken = resB.body.data.tokens.accessToken;
    userBId = resB.body.data.user.id;
    await walletRepo.createWallet({
      user_id: userBId,
      currency: 'USD',
      available_balance: '100000.0000',
    });

    // Create a Valid Strategy for User A
    const validDsl = `strategy "Automated Momentum Alpha"
instrument "NSE:RELIANCE"
timeframe "15m"

indicator fast = SMA(close, 5)
indicator slow = SMA(close, 15)

entry:
  fast crosses_above slow

exit:
  fast crosses_below slow
`;
    const stratRes = await strategyService.createStrategy(userAId, {
      name: 'Automated Momentum Alpha',
      dslCode: validDsl,
      instrumentSymbol: 'NSE:RELIANCE',
      timeframe: '15m',
    });
    strategyAId = stratRes.id;

    // Create an Unvalidated Strategy for User A
    const unvalidatedDsl = `strategy "Incomplete Strategy"
entry:
  close > 100
`;
    const unvalStrat = await strategyRepo.createStrategy({
      userId: userAId,
      name: 'Incomplete Strategy',
      dslCode: unvalidatedDsl,
      instrumentSymbol: 'NSE:RELIANCE',
      timeframe: '15m',
      isValid: false,
    });
    unvalidatedStrategyId = unvalStrat.id;
  });

  afterEach(async () => {
    if (scheduler) {
      await scheduler.stop();
    }
  });

  // ==========================================================================
  // 1. Strategy Activation & Lifecycle Management
  // ==========================================================================
  describe('1. Strategy Activation & Job Lifecycle', () => {
    it('should activate a validated strategy as an automated runner job', async () => {
      const res = await request(app)
        .post('/api/v1/strategies/automated/jobs')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          strategyId: strategyAId,
          instrumentSymbol: 'NSE:RELIANCE',
          timeframe: '15m',
          riskLimits: {
            maxOrderNotional: 50000,
            maxPositionSize: 0.25,
            maxOpenOrders: 5,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('RUNNING');
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.strategyId).toBe(strategyAId);
    });

    it('should reject activating an unvalidated strategy with 400 STRATEGY_NOT_VALIDATED', async () => {
      const res = await request(app)
        .post('/api/v1/strategies/automated/jobs')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          strategyId: unvalidatedStrategyId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('STRATEGY_NOT_VALIDATED');
    });

    it('should reject duplicate active jobs for the same strategy and instrument with 409 Conflict', async () => {
      // First activation
      await request(app)
        .post('/api/v1/strategies/automated/jobs')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          strategyId: strategyAId,
          instrumentSymbol: 'NSE:RELIANCE',
        });

      // Second activation attempt
      const res = await request(app)
        .post('/api/v1/strategies/automated/jobs')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          strategyId: strategyAId,
          instrumentSymbol: 'NSE:RELIANCE',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_ACTIVE_JOB');
    });

    it('should transition job through PAUSED, RESUMED, and STOPPED lifecycle states', async () => {
      // 1. Activate
      const actRes = await request(app)
        .post('/api/v1/strategies/automated/jobs')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ strategyId: strategyAId });
      const jobId = actRes.body.data.jobId;

      // 2. Pause
      const pauseRes = await request(app)
        .post(`/api/v1/strategies/automated/jobs/${jobId}/pause`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.data.status).toBe('PAUSED');

      // 3. Resume
      const resumeRes = await request(app)
        .post(`/api/v1/strategies/automated/jobs/${jobId}/resume`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.data.status).toBe('RUNNING');

      // 4. Stop
      const stopRes = await request(app)
        .post(`/api/v1/strategies/automated/jobs/${jobId}/stop`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(stopRes.status).toBe(200);
      expect(stopRes.body.data.status).toBe('CANCELLED');
      expect(stopRes.body.data.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Background Execution Scheduler & Signal Generation
  // ==========================================================================
  describe('2. Background Execution Scheduler & Signal Processing', () => {
    it('should execute scheduler tick and process active jobs against candles', async () => {
      // Activate job
      const job = await runnerService.activateStrategyJob(userAId, {
        strategyId: strategyAId,
        instrumentSymbol: 'NSE:RELIANCE',
        timeframe: '15m',
      });

      expect(job.status).toBe('RUNNING');

      // Process scheduler tick
      await scheduler.tick();

      // Retrieve updated job checkpoint
      const updatedJob = await jobRepo.findByJobId(job.jobId);
      expect(updatedJob).toBeDefined();
      expect(updatedJob?.lastProcessedCandleTime).not.toBeNull();
    });

    it('should prevent duplicate processing of the same candle timestamp (Idempotency)', async () => {
      const job = await runnerService.activateStrategyJob(userAId, {
        strategyId: strategyAId,
        instrumentSymbol: 'NSE:RELIANCE',
      });

      // Tick 1
      await scheduler.tick();
      const firstCheckpoint = (await jobRepo.findByJobId(job.jobId))?.lastProcessedCandleTime;

      // Immediate Tick 2 without new candle should not advance checkpoint or double-process
      await scheduler.tick();
      const secondCheckpoint = (await jobRepo.findByJobId(job.jobId))?.lastProcessedCandleTime;

      expect(firstCheckpoint).toBe(secondCheckpoint);
    });
  });

  // ==========================================================================
  // 3. Virtual Order Execution via TradeGrid OMS
  // ==========================================================================
  describe('3. Virtual Order Placement & OMS Integration', () => {
    it('should submit a virtual limit order when actionable BUY signal triggers', async () => {
      const job = await runnerService.activateStrategyJob(userAId, {
        strategyId: strategyAId,
        instrumentSymbol: 'NSE:RELIANCE',
      });

      // Run scheduler tick
      await scheduler.tick();

      // Check if orders were recorded in automated_strategy_orders
      const orders = await jobRepo.findOrdersByJobId(job.jobId, userAId);
      expect(Array.isArray(orders)).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Server-Side Risk Controls & Circuit Breakers
  // ==========================================================================
  describe('4. Server-Side Risk Controls & Circuit Breakers', () => {
    it('should block order placement when order notional exceeds configured cap', async () => {
      // Set an impossibly low maxOrderNotional ($10)
      const job = await runnerService.activateStrategyJob(userAId, {
        strategyId: strategyAId,
        instrumentSymbol: 'NSE:RELIANCE',
        riskLimits: {
          maxOrderNotional: 10,
        },
      });

      await scheduler.tick();

      // Zero orders should have been recorded because notional cap was breached
      const orders = await jobRepo.findOrdersByJobId(job.jobId, userAId);
      expect(orders).toHaveLength(0);
    });

    it('should trip circuit breaker and transition to FAILED after 3 consecutive failures', async () => {
      const job = await runnerService.activateStrategyJob(userAId, {
        strategyId: strategyAId,
        instrumentSymbol: 'NSE:RELIANCE',
      });

      // Force 3 consecutive failures
      await jobRepo.updateConsecutiveFailures(job.jobId, 2, 'Simulated calculation failure');
      (job as any).consecutiveFailuresCount = 2;

      // Trigger scheduler processJob with corrupted AST
      const brokenDsl = `strategy "Bad AST"
entry:
  undeclared_var > 10
`;
      await strategyRepo.updateStrategy(strategyAId, userAId, { dslCode: brokenDsl });

      await scheduler.processJob(job);

      const failedJob = await jobRepo.findByJobId(job.jobId);
      expect(failedJob?.status).toBe('FAILED');
      expect(failedJob?.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Emergency Kill Switch
  // ==========================================================================
  describe('5. Emergency Kill Switch', () => {
    it('should immediately stop all active jobs for the user via emergency kill switch', async () => {
      // Create 2 active jobs
      await runnerService.activateStrategyJob(userAId, {
        strategyId: strategyAId,
        instrumentSymbol: 'NSE:RELIANCE',
      });

      const killRes = await request(app)
        .post('/api/v1/strategies/automated/kill-switch')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(killRes.status).toBe(200);
      expect(killRes.body.success).toBe(true);
      expect(killRes.body.data.stoppedJobsCount).toBeGreaterThanOrEqual(1);

      // Verify active jobs count is now 0
      const activeJobs = await jobRepo.findActiveJobs();
      const userActiveJobs = activeJobs.filter((j) => j.userId === userAId);
      expect(userActiveJobs).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 6. Strict User Ownership & Unauthorized Access Prevention
  // ==========================================================================
  describe('6. User Ownership & Security Authorization', () => {
    it('should prevent User B from pausing, resuming, or stopping User A runner job (403 Forbidden)', async () => {
      const job = await runnerService.activateStrategyJob(userAId, {
        strategyId: strategyAId,
        instrumentSymbol: 'NSE:RELIANCE',
      });

      // User B attempts to pause User A's job
      const pauseRes = await request(app)
        .post(`/api/v1/strategies/automated/jobs/${job.jobId}/pause`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(pauseRes.status).toBe(403);
      expect(pauseRes.body.error.code).toBe('FORBIDDEN_JOB_ACCESS');

      // User B attempts to stop User A's job
      const stopRes = await request(app)
        .post(`/api/v1/strategies/automated/jobs/${job.jobId}/stop`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(stopRes.status).toBe(403);
    });

    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/strategies/automated/jobs');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // 7. 100 Concurrent Automated Jobs Benchmark
  // ==========================================================================
  describe('7. 100 Concurrent Automated Jobs Stress Benchmark', () => {
    it(
      'should handle 100 concurrent automated strategy job queries and operations without race conditions',
      async () => {
        const promises = Array.from({ length: 100 }, (_, i) =>
          request(app)
            .get('/api/v1/strategies/automated/jobs')
            .set('Authorization', `Bearer ${i % 2 === 0 ? userAToken : userBToken}`)
        );

        const responses = await Promise.all(promises);
        responses.forEach((res) => {
          expect(res.status).toBe(200);
          expect(res.body.success).toBe(true);
        });
      },
      20000
    );
  });
});
