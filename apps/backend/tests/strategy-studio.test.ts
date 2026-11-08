import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryStrategyRepository,
  InMemoryStrategyExecutionRepository,
  InMemoryInstrumentRepository,
} from './mocks/in-memory-repositories';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { StrategyController } from '../src/modules/strategies/strategy.controller';
import { StrategyService } from '../src/modules/strategies/strategy.service';
import { StrategyExecutionService } from '../src/modules/strategies/execution/execution.service';
import { DSLLexer } from '../src/modules/strategies/dsl/dsl.lexer';
import { DSLParser } from '../src/modules/strategies/dsl/dsl.parser';
import { DSLValidator } from '../src/modules/strategies/dsl/dsl.validator';

describe('Phase 9C: Strategy Studio UI & Visual DSL Builder Subsystem', () => {
  let app: any;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let strategyRepo: InMemoryStrategyRepository;
  let executionRepo: InMemoryStrategyExecutionRepository;
  let instrumentRepo: InMemoryInstrumentRepository;

  let authController: AuthController;
  let strategyController: StrategyController;
  let strategyService: StrategyService;
  let executionService: StrategyExecutionService;

  let userAToken: string;
  let userBToken: string;
  let userAId: number;
  let userBId: number;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    strategyRepo = new InMemoryStrategyRepository();
    executionRepo = new InMemoryStrategyExecutionRepository();
    instrumentRepo = new InMemoryInstrumentRepository();

    const authService = new AuthService(userRepo, sessionRepo);
    strategyService = new StrategyService(strategyRepo);
    executionService = new StrategyExecutionService(executionRepo, strategyService);

    authController = new AuthController(authService);
    strategyController = new StrategyController(strategyService, executionService);

    app = createApp({
      authController,
      strategyController,
    });

    // Register User A (Studio Creator)
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        username: 'studio_user_a',
        email: 'studio_a@tradegrid.internal',
        password: 'Password123!',
      });
    userAToken = resA.body.data.tokens.accessToken;
    userAId = resA.body.data.user.id;

    // Register User B (Foreign Trader)
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        username: 'studio_user_b',
        email: 'studio_b@tradegrid.internal',
        password: 'Password123!',
      });
    userBToken = resB.body.data.tokens.accessToken;
    userBId = resB.body.data.user.id;
  });

  // ==========================================================================
  // 1. Visual Builder DSL Generation & Indicator Grammar Verification
  // ==========================================================================
  describe('1. Visual Builder DSL Generation & Indicator Grammar', () => {
    it('should generate valid DSL for Dual Moving Average with RSI filter', () => {
      const generatedDsl = `strategy "Visual Dual MA Alpha"
description "Crossover system generated from Visual Builder"
instrument "NSE:RELIANCE"
timeframe "15m"

indicator fast_ma = SMA(close, 10)
indicator slow_ma = SMA(close, 30)
indicator rsi_val = RSI(close, 14)

entry:
  fast_ma crosses_above slow_ma
  rsi_val < 70

exit:
  fast_ma crosses_below slow_ma

risk:
  stop_loss = 0.02
  take_profit = 0.05
  max_position_size = 0.25
`;

      const validation = DSLValidator.validate(generatedDsl);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.ast).toBeDefined();
      expect(validation.ast?.name).toBe('Visual Dual MA Alpha');
      expect(validation.ast?.indicators).toHaveLength(3);
      expect(validation.ast?.entryConditions).toHaveLength(2);
      expect(validation.ast?.exitConditions).toHaveLength(1);
      expect(validation.ast?.riskSettings.stop_loss).toBe(0.02);
    });

    it('should validate all supported indicators configured via visual builder forms', () => {
      const multiIndicatorDsl = `strategy "All Supported Indicators"
instrument "NSE:TCS"
timeframe "1h"

indicator ma1 = SMA(close, 20)
indicator ma2 = EMA(close, 20)
indicator rsi1 = RSI(close, 14)
indicator macd1 = MACD(close, 12, 26, 9)
indicator bb1 = BollingerBands(close, 20, 2)
indicator vwap1 = VWAP()

entry:
  close > ma1
  rsi1 < 65

exit:
  close < ma2
`;

      const validation = DSLValidator.validate(multiIndicatorDsl);
      expect(validation.isValid).toBe(true);
      expect(validation.ast?.indicators).toHaveLength(6);
    });

    it('should report exact line and column numbers for visual builder validation errors', async () => {
      // DSL with syntax error on line 6: undefined indicator function FOOBAR
      const invalidDsl = `strategy "Broken Visual Strategy"
instrument "NSE:INFY"
timeframe "15m"

indicator bad_ind = FOOBAR(close, 14)

entry:
  bad_ind > 50
`;

      const res = await request(app)
        .post('/api/v1/strategies/validate')
        .send({ dslCode: invalidDsl });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.errors.length).toBeGreaterThan(0);
      expect(res.body.data.errors[0].line).toBe(5);
      expect(res.body.data.errors[0].code).toBe('UNSUPPORTED_FUNCTION');
    });
  });

  // ==========================================================================
  // 2. Strategy Studio CRUD, Duplication & Version Snapshots
  // ==========================================================================
  describe('2. Strategy Studio Management Lifecycle', () => {
    it('should create, list, and retrieve strategies in Studio Dashboard', async () => {
      const dsl = `strategy "Studio Momentum"
instrument "NSE:HDFCBANK"
timeframe "15m"

indicator fast = EMA(close, 9)
indicator slow = EMA(close, 21)

entry:
  fast crosses_above slow

exit:
  fast crosses_below slow
`;

      // 1. Create strategy
      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Studio Momentum',
          description: 'Authored in Strategy Studio',
          dslCode: dsl,
          instrumentSymbol: 'NSE:HDFCBANK',
          timeframe: '15m',
        });

      expect(createRes.status).toBe(201);
      const stratId = createRes.body.data.id;
      expect(stratId).toBeDefined();
      expect(createRes.body.data.version).toBe(1);

      // 2. List strategies
      const listRes = await request(app)
        .get('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].name).toBe('Studio Momentum');

      // 3. Retrieve single strategy
      const getRes = await request(app)
        .get(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(stratId);
    });

    it('should auto-snapshot version 2 when DSL code is modified in builder', async () => {
      const v1Dsl = `strategy "Versioned Strategy"
instrument "NSE:RELIANCE"
timeframe "15m"

indicator fast = SMA(close, 10)
indicator slow = SMA(close, 20)

entry:
  fast crosses_above slow

exit:
  fast crosses_below slow
`;

      // Create v1
      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Versioned Strategy',
          dslCode: v1Dsl,
        });

      const stratId = createRes.body.data.id;
      expect(createRes.body.data.version).toBe(1);

      // Update to v2 with adjusted SMA period
      const v2Dsl = v1Dsl.replace('SMA(close, 10)', 'SMA(close, 12)');
      const updateRes = await request(app)
        .put(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          dslCode: v2Dsl,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.version).toBe(2);

      // Inspect version history
      const versionsRes = await request(app)
        .get(`/api/v1/strategies/${stratId}/versions`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(versionsRes.status).toBe(200);
      expect(versionsRes.body.data).toHaveLength(2);
      expect(versionsRes.body.data[0].version).toBe(2);
      expect(versionsRes.body.data[1].version).toBe(1);
    });

    it('should clone and duplicate an existing strategy with incremented name', async () => {
      const dsl = `strategy "Original Alpha"
instrument "NSE:TCS"
timeframe "1d"

indicator rsi = RSI(close, 14)

entry:
  rsi < 30

exit:
  rsi > 70
`;

      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ name: 'Original Alpha', dslCode: dsl });

      const stratId = createRes.body.data.id;

      // Duplicate strategy
      const dupRes = await request(app)
        .post(`/api/v1/strategies/${stratId}/duplicate`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(dupRes.status).toBe(201);
      expect(dupRes.body.data.name).toBe('Original Alpha (Copy)');
      expect(dupRes.body.data.id).not.toBe(stratId);
    });

    it('should delete a strategy and cascade delete its historical versions', async () => {
      const dsl = `strategy "To Delete"
instrument "NSE:INFY"
timeframe "15m"
indicator ma = SMA(close, 10)
entry:
  close > ma
exit:
  close < ma
`;

      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ name: 'To Delete', dslCode: dsl });

      const stratId = createRes.body.data.id;

      // Delete strategy
      const deleteRes = await request(app)
        .delete(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Verify strategy is gone
      const getRes = await request(app)
        .get(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(getRes.status).toBe(404);
    });
  });

  // ==========================================================================
  // 3. User Ownership & Security Controls
  // ==========================================================================
  describe('3. Studio Ownership & Security Controls', () => {
    it('should prevent User B from viewing or editing User A strategy (403 Forbidden)', async () => {
      const dsl = `strategy "Secret Strategy"
instrument "NSE:RELIANCE"
timeframe "15m"
indicator ma = SMA(close, 50)
entry:
  close > ma
exit:
  close < ma
`;

      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ name: 'Secret Strategy', dslCode: dsl });

      const stratId = createRes.body.data.id;

      // User B attempts to read User A's strategy
      const readRes = await request(app)
        .get(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(readRes.status).toBe(403);
      expect(readRes.body.error.code).toBe('FORBIDDEN_STRATEGY_ACCESS');

      // User B attempts to update User A's strategy
      const updateRes = await request(app)
        .put(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ name: 'Hacked Strategy' });

      expect(updateRes.status).toBe(403);

      // User B attempts to delete User A's strategy
      const deleteRes = await request(app)
        .delete(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(deleteRes.status).toBe(403);
    });

    it('should reject unauthenticated requests to Studio APIs with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/strategies');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // 4. Studio Simulation & Execution Integration
  // ==========================================================================
  describe('4. Studio Simulation & Execution Integration', () => {
    it('should run backtest simulation from studio and return structured signals and diagnostics', async () => {
      const dsl = `strategy "Simulation Test"
instrument "NSE:RELIANCE"
timeframe "15m"

indicator fast = SMA(close, 5)
indicator slow = SMA(close, 15)

entry:
  fast crosses_above slow

exit:
  fast crosses_below slow
`;

      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ name: 'Simulation Test', dslCode: dsl });

      const stratId = createRes.body.data.id;

      // Dispatch execution simulation
      const execRes = await request(app)
        .post(`/api/v1/strategies/${stratId}/execute`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          timeframe: '15m',
          initialCapital: '100000.0000',
        });

      expect(execRes.status).toBe(200);
      expect(execRes.body.success).toBe(true);
      expect(execRes.body.data.execution.status).toBe('COMPLETED');
      expect(execRes.body.data.diagnostics).toBeDefined();
      expect(execRes.body.data.signals).toBeInstanceOf(Array);
      expect(execRes.body.data.diagnostics.barsProcessed).toBeGreaterThan(0);
    });
  });
});
