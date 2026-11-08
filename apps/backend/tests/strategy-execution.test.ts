import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  StrategyService,
  StrategyController,
  StrategyExecutionService,
  StrategyInterpreter,
  ASTEvaluator,
} from '../src/modules/strategies';
import { StrategyAST } from '../src/modules/strategies/dsl/dsl.ast';
import {
  InMemoryStrategyRepository,
  InMemoryStrategyExecutionRepository,
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
} from './mocks/in-memory-repositories';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { MarketCandle } from '../src/modules/strategies/execution/execution.types';

describe('Phase 9B: Sandboxed Strategy Execution Engine', () => {
  let app: any;
  let strategyRepo: InMemoryStrategyRepository;
  let executionRepo: InMemoryStrategyExecutionRepository;
  let strategyService: StrategyService;
  let executionService: StrategyExecutionService;
  let strategyController: StrategyController;

  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let authService: AuthService;
  let authController: AuthController;

  let userAToken: string;
  let userBToken: string;
  let userAId: number;
  let userBId: number;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    authService = new AuthService(userRepo, sessionRepo, walletRepo, ledgerRepo);
    authController = new AuthController(authService);

    strategyRepo = new InMemoryStrategyRepository();
    executionRepo = new InMemoryStrategyExecutionRepository();
    strategyService = new StrategyService(strategyRepo);
    executionService = new StrategyExecutionService(executionRepo, strategyService);
    strategyController = new StrategyController(strategyService, executionService);

    app = createApp({
      authController,
      strategyController,
      customCheckDb: async () => true,
    });

    // Register User A
    const resA = await request(app).post('/api/v1/auth/register').send({
      username: 'quant_exec_alice',
      email: 'alice.exec@tradegrid.internal',
      password: 'Password123!',
    });
    userAToken = resA.body.data.tokens.accessToken;
    userAId = resA.body.data.user.id;

    // Register User B
    const resB = await request(app).post('/api/v1/auth/register').send({
      username: 'quant_exec_bob',
      email: 'bob.exec@tradegrid.internal',
      password: 'Password123!',
    });
    userBToken = resB.body.data.tokens.accessToken;
    userBId = resB.body.data.user.id;
  });

  afterEach(() => {
    strategyRepo.clear();
    executionRepo.clear();
    userRepo.clear();
    sessionRepo.clear();
    walletRepo.clear();
    ledgerRepo.clear();
  });

  // Helper: Generates realistic mock test candles
  function generateTestCandles(count: number, basePrice: number = 2500): MarketCandle[] {
    const candles: MarketCandle[] = [];
    const baseTime = new Date('2026-01-01T09:15:00Z').getTime();

    let price = basePrice;
    for (let i = 0; i < count; i++) {
      const time = new Date(baseTime + i * 15 * 60 * 1000);
      const delta = (Math.sin(i / 4) + Math.cos(i / 2)) * 10;
      const open = price;
      const close = price + delta;
      const high = Math.max(open, close) + 4;
      const low = Math.min(open, close) - 4;
      const volume = 1500 + (i % 5) * 200;

      candles.push({
        timestamp: time.toISOString(),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume,
      });

      price = close;
    }
    return candles;
  }

  // ==========================================================================
  // 1. Sandboxed AST Evaluator Unit Verification
  // ==========================================================================

  describe('1. Sandboxed AST Evaluator Unit Verification', () => {
    it('should evaluate arithmetic operations with division-by-zero protection', () => {
      const ctx = {
        barIndex: 0,
        series: { open: [100], high: [110], low: [90], close: [105], volume: [500] },
        indicators: {},
      };

      // 10 + 5 * 2
      const expr: any = {
        type: 'BinaryOp',
        op: '+',
        left: { type: 'Literal', value: 10, rawType: 'number' },
        right: {
          type: 'BinaryOp',
          op: '*',
          left: { type: 'Literal', value: 5, rawType: 'number' },
          right: { type: 'Literal', value: 2, rawType: 'number' },
        },
      };
      expect(ASTEvaluator.evaluate(expr, ctx)).toBe(20);

      // Division by zero: 100 / 0 -> 0 (graceful safety)
      const divZeroExpr: any = {
        type: 'BinaryOp',
        op: '/',
        left: { type: 'Literal', value: 100, rawType: 'number' },
        right: { type: 'Literal', value: 0, rawType: 'number' },
      };
      expect(ASTEvaluator.evaluate(divZeroExpr, ctx)).toBe(0);
    });

    it('should evaluate boolean operators with short-circuiting', () => {
      const ctx = {
        barIndex: 0,
        series: { open: [100], high: [110], low: [90], close: [105], volume: [500] },
        indicators: {},
      };

      // false and (close > 0) -> false (short circuits)
      const andExpr: any = {
        type: 'BinaryOp',
        op: 'and',
        left: { type: 'Literal', value: false, rawType: 'boolean' },
        right: {
          type: 'BinaryOp',
          op: '>',
          left: { type: 'SeriesRef', series: 'close' },
          right: { type: 'Literal', value: 0, rawType: 'number' },
        },
      };
      expect(ASTEvaluator.evaluate(andExpr, ctx)).toBe(false);

      // true or (anything) -> true (short circuits)
      const orExpr: any = {
        type: 'BinaryOp',
        op: 'or',
        left: { type: 'Literal', value: true, rawType: 'boolean' },
        right: { type: 'Literal', value: false, rawType: 'boolean' },
      };
      expect(ASTEvaluator.evaluate(orExpr, ctx)).toBe(true);
    });

    it('should accurately detect crosses_above and crosses_below boundaries', () => {
      // Bar 0: fast = 10, slow = 15
      // Bar 1: fast = 20, slow = 15 -> crosses_above!
      // Bar 2: fast = 12, slow = 15 -> crosses_below!
      const ctx = {
        barIndex: 1,
        series: { open: [1, 2, 3], high: [1, 2, 3], low: [1, 2, 3], close: [1, 2, 3], volume: [1, 2, 3] },
        indicators: {
          fast: [10, 20, 12],
          slow: [15, 15, 15],
        },
      };

      const crossAboveExpr: any = {
        type: 'BinaryOp',
        op: 'crosses_above',
        left: { type: 'IdentifierRef', name: 'fast' },
        right: { type: 'IdentifierRef', name: 'slow' },
      };

      // Bar 0: No previous bar -> false
      expect(ASTEvaluator.evaluate(crossAboveExpr, { ...ctx, barIndex: 0 })).toBe(false);

      // Bar 1: crosses_above -> true
      expect(ASTEvaluator.evaluate(crossAboveExpr, { ...ctx, barIndex: 1 })).toBe(true);

      // Bar 2: not crosses_above -> false
      expect(ASTEvaluator.evaluate(crossAboveExpr, { ...ctx, barIndex: 2 })).toBe(false);

      // Bar 2: crosses_below -> true
      const crossBelowExpr: any = {
        type: 'BinaryOp',
        op: 'crosses_below',
        left: { type: 'IdentifierRef', name: 'fast' },
        right: { type: 'IdentifierRef', name: 'slow' },
      };
      expect(ASTEvaluator.evaluate(crossBelowExpr, { ...ctx, barIndex: 2 })).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Deterministic Signal Generation & Anti-Lookahead Guarantee
  // ==========================================================================

  describe('2. Deterministic Signal Generation & Anti-Lookahead Guarantee', () => {
    it('should generate BUY and SELL signals deterministically over candle series', () => {
      const candles = generateTestCandles(60, 2500);

      const ast: StrategyAST = {
        name: 'SMA Test Strategy',
        indicators: [
          {
            name: 'fast',
            indicatorName: 'SMA',
            args: [{ type: 'SeriesRef', series: 'close', line: 1, column: 1 }, { type: 'Literal', value: 5, rawType: 'number', line: 1, column: 1 }],
            line: 1,
            column: 1,
          },
          {
            name: 'slow',
            indicatorName: 'SMA',
            args: [{ type: 'SeriesRef', series: 'close', line: 2, column: 1 }, { type: 'Literal', value: 15, rawType: 'number', line: 2, column: 1 }],
            line: 2,
            column: 1,
          },
        ],
        entryConditions: [
          {
            type: 'BinaryOp',
            op: 'crosses_above',
            left: { type: 'IdentifierRef', name: 'fast', line: 3, column: 1 },
            right: { type: 'IdentifierRef', name: 'slow', line: 3, column: 1 },
            line: 3,
            column: 1,
          },
        ],
        exitConditions: [
          {
            type: 'BinaryOp',
            op: 'crosses_below',
            left: { type: 'IdentifierRef', name: 'fast', line: 4, column: 1 },
            right: { type: 'IdentifierRef', name: 'slow', line: 4, column: 1 },
            line: 4,
            column: 1,
          },
        ],
        riskSettings: {},
      };

      const result = StrategyInterpreter.execute(ast, candles);
      expect(result.signals.length).toBeGreaterThan(0);

      // Verify signal structure and values
      for (const sig of result.signals) {
        expect(['BUY', 'SELL']).toContain(sig.signalType);
        expect(sig.price).toBeGreaterThan(0);
        expect(sig.timestamp).toBeDefined();
        expect(sig.indicatorValues).toHaveProperty('fast');
        expect(sig.indicatorValues).toHaveProperty('slow');
      }

      // Verify alternating positions (BUY followed by SELL)
      for (let i = 0; i < result.signals.length - 1; i++) {
        expect(result.signals[i].signalType).not.toBe(result.signals[i + 1].signalType);
      }
    });

    it('should guarantee zero lookahead bias by matching truncation prefix results', () => {
      const fullCandles = generateTestCandles(50, 2500);
      const truncatedCandles = fullCandles.slice(0, 30);

      const ast: StrategyAST = {
        name: 'Anti-Lookahead Verification',
        indicators: [
          {
            name: 'sma',
            indicatorName: 'SMA',
            args: [{ type: 'SeriesRef', series: 'close', line: 1, column: 1 }, { type: 'Literal', value: 10, rawType: 'number', line: 1, column: 1 }],
            line: 1,
            column: 1,
          },
        ],
        entryConditions: [
          {
            type: 'BinaryOp',
            op: '>',
            left: { type: 'SeriesRef', series: 'close', line: 2, column: 1 },
            right: { type: 'IdentifierRef', name: 'sma', line: 2, column: 1 },
            line: 2,
            column: 1,
          },
        ],
        exitConditions: [
          {
            type: 'BinaryOp',
            op: '<',
            left: { type: 'SeriesRef', series: 'close', line: 3, column: 1 },
            right: { type: 'IdentifierRef', name: 'sma', line: 3, column: 1 },
            line: 3,
            column: 1,
          },
        ],
        riskSettings: {},
      };

      const fullResult = StrategyInterpreter.execute(ast, fullCandles);
      const truncatedResult = StrategyInterpreter.execute(ast, truncatedCandles);

      // Signals emitted up to bar 29 in fullResult must match truncatedResult identically
      const fullSignalsInWindow = fullResult.signals.filter(
        (s) => new Date(s.timestamp).getTime() <= new Date(truncatedCandles[29].timestamp).getTime()
      );

      expect(fullSignalsInWindow.length).toBe(truncatedResult.signals.length);
      for (let i = 0; i < fullSignalsInWindow.length; i++) {
        expect(fullSignalsInWindow[i].signalType).toBe(truncatedResult.signals[i].signalType);
        expect(fullSignalsInWindow[i].timestamp).toBe(truncatedResult.signals[i].timestamp);
        expect(fullSignalsInWindow[i].price).toBe(truncatedResult.signals[i].price);
      }
    });

    it('should gracefully handle empty or zero-candle arrays', () => {
      const ast: StrategyAST = {
        name: 'Empty Test',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        riskSettings: {},
      };

      const result = StrategyInterpreter.execute(ast, []);
      expect(result.signals).toEqual([]);
      expect(result.diagnostics.barsProcessed).toBe(0);
    });
  });

  // ==========================================================================
  // 3. Execution Limits & Safety Guards
  // ==========================================================================

  describe('3. Execution Limits & Safety Guards', () => {
    it('should reject execution exceeding maximum allowed bars limit', () => {
      const hugeCandles = generateTestCandles(105, 2500);
      const ast: StrategyAST = {
        name: 'Limit Test',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        riskSettings: {},
      };

      expect(() => {
        StrategyInterpreter.execute(ast, hugeCandles, { maxBars: 100 });
      }).toThrow('exceed maximum allowed limit');
    });

    it('should abort execution and throw on execution timeout limit', () => {
      const candles = generateTestCandles(1000, 2500);
      const ast: StrategyAST = {
        name: 'Timeout Test',
        indicators: [
          {
            name: 's',
            indicatorName: 'SMA',
            args: [{ type: 'SeriesRef', series: 'close', line: 1, column: 1 }, { type: 'Literal', value: 10, rawType: 'number', line: 1, column: 1 }],
            line: 1,
            column: 1,
          },
        ],
        entryConditions: [
          {
            type: 'BinaryOp',
            op: '>',
            left: { type: 'SeriesRef', series: 'close', line: 2, column: 1 },
            right: { type: 'IdentifierRef', name: 's', line: 2, column: 1 },
            line: 2,
            column: 1,
          },
        ],
        exitConditions: [],
        riskSettings: {},
      };

      // Set maxExecutionTimeMs = 0 to trigger immediate timeout
      expect(() => {
        StrategyInterpreter.execute(ast, candles, { maxExecutionTimeMs: 0 });
      }).toThrow('STRATEGY_EXECUTION_TIMED_OUT');
    });
  });

  // ==========================================================================
  // 4. REST API Execution Endpoints & Lifecycle State Machine
  // ==========================================================================

  describe('4. REST API Execution Endpoints & Lifecycle State Machine', () => {
    let createdStrategyId: number;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Momentum Scalper',
          instrumentSymbol: 'NSE:RELIANCE',
          timeframe: '15m',
          dslCode: `
            strategy "Momentum Scalper"
            instrument "NSE:RELIANCE"
            timeframe "15m"
            indicator fast = SMA(close, 5)
            indicator slow = SMA(close, 15)

            entry:
                fast crosses_above slow
            exit:
                fast crosses_below slow
            risk:
                stop_loss = 2%
          `,
        });
      createdStrategyId = createRes.body.data.id;
    });

    it('POST /api/v1/strategies/:id/execute should execute strategy and return signals with COMPLETED status', async () => {
      const res = await request(app)
        .post(`/api/v1/strategies/${createdStrategyId}/execute`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          startDate: '2026-01-01',
          endDate: '2026-02-01',
          initialCapital: '250000.0000',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.execution).toBeDefined();
      expect(res.body.data.execution.status).toBe('COMPLETED');
      expect(res.body.data.execution.instrumentSymbol).toBe('NSE:RELIANCE');
      expect(res.body.data.execution.strategyVersion).toBe(1);
      expect(res.body.data.diagnostics).toBeDefined();
      expect(Array.isArray(res.body.data.signals)).toBe(true);
    });

    it('GET /api/v1/strategies/:id/executions should list all historical execution runs for user strategy', async () => {
      // Execute twice
      await request(app)
        .post(`/api/v1/strategies/${createdStrategyId}/execute`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({});

      await request(app)
        .post(`/api/v1/strategies/${createdStrategyId}/execute`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({});

      const listRes = await request(app)
        .get(`/api/v1/strategies/${createdStrategyId}/executions`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.length).toBe(2);
      expect(listRes.body.data[0].status).toBe('COMPLETED');
    });

    it('GET /api/v1/strategies/executions/:executionId should return execution details and signals', async () => {
      const execRes = await request(app)
        .post(`/api/v1/strategies/${createdStrategyId}/execute`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({});

      const executionId = execRes.body.data.execution.executionId;

      const getRes = await request(app)
        .get(`/api/v1/strategies/executions/${executionId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.data.execution.executionId).toBe(executionId);
      expect(getRes.body.data.signals).toBeDefined();
    });

    it('POST /api/v1/strategies/executions/:executionId/cancel should cancel a running or queued execution', async () => {
      // Create a queued execution in repository
      const exec = await executionRepo.createExecution({
        executionId: 'EXEC-CANCEL-TEST',
        userId: userAId,
        strategyId: createdStrategyId,
        strategyVersion: 1,
        instrumentSymbol: 'NSE:RELIANCE',
        timeframe: '15m',
        startDate: '2026-01-01',
        endDate: '2026-02-01',
        status: 'RUNNING',
      });

      const cancelRes = await request(app)
        .post(`/api/v1/strategies/executions/${exec.executionId}/cancel`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
    });

    it('POST /api/v1/strategies/:id/execute should reject execution when DSL has invalid syntax', async () => {
      // Update strategy to invalid DSL
      await request(app)
        .put(`/api/v1/strategies/${createdStrategyId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          dslCode: `
            strategy "Broken Syntax"
            entry:
                undefined_var > 100
          `,
        });

      const execRes = await request(app)
        .post(`/api/v1/strategies/${createdStrategyId}/execute`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({});

      expect(execRes.status).toBe(400);
      expect(execRes.body.error.code).toBe('INVALID_STRATEGY_DSL');
    });
  });

  // ==========================================================================
  // 5. Strict User Ownership & Unauthorized Access Prevention
  // ==========================================================================

  describe('5. Strict User Ownership & Unauthorized Access Prevention', () => {
    let userAStrategyId: number;
    let userAExecutionId: string;

    beforeEach(async () => {
      const sRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: "Alice's Secret Quant Strategy",
          dslCode: `
            strategy "Alice Private"
            indicator s = SMA(close, 10)
            entry:
                close > s
          `,
        });
      userAStrategyId = sRes.body.data.id;

      const eRes = await request(app)
        .post(`/api/v1/strategies/${userAStrategyId}/execute`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({});
      userAExecutionId = eRes.body.data.execution.executionId;
    });

    it("should prevent User B from executing User A's private strategy (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/v1/strategies/${userAStrategyId}/execute`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_STRATEGY_ACCESS');
    });

    it("should prevent User B from viewing User A's strategy executions (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/strategies/${userAStrategyId}/executions`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_STRATEGY_ACCESS');
    });

    it("should prevent User B from reading User A's execution result (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/strategies/executions/${userAExecutionId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_EXECUTION_ACCESS');
    });

    it("should prevent User B from cancelling User A's execution (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/v1/strategies/executions/${userAExecutionId}/cancel`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_EXECUTION_ACCESS');
    });
  });

  // ==========================================================================
  // 6. Strict Financial Isolation Invariant
  // ==========================================================================

  describe('6. Strict Financial Isolation Invariant', () => {
    it('should guarantee zero modification to wallets, cash balances, or ledger transactions', async () => {
      // Check initial wallet balance
      const initialWallet = await walletRepo.findByUserId(userAId);
      const initialBalance = initialWallet?.balance;
      const initialLedgerCount = ledgerRepo.transactions.length;

      // Create and execute strategy
      const sRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Financial Isolation Invariant Check',
          dslCode: `
            strategy "Invariant Check"
            indicator s = SMA(close, 5)
            entry:
                close > s
            exit:
                close < s
          `,
        });

      await request(app)
        .post(`/api/v1/strategies/${sRes.body.data.id}/execute`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ initialCapital: '500000.0000' });

      // Verify wallet balance is 100% unchanged
      const finalWallet = await walletRepo.findByUserId(userAId);
      expect(finalWallet?.balance).toBe(initialBalance);

      // Verify no ledger transactions were created
      const finalLedgerCount = ledgerRepo.transactions.length;
      expect(finalLedgerCount).toBe(initialLedgerCount);
    });
  });

  // ==========================================================================
  // 7. 100 Concurrent Executions Benchmark
  // ==========================================================================

  describe('7. 100 Concurrent Executions Benchmark', () => {
    it('should handle 100 concurrent strategy executions without race conditions or memory corruption', async () => {
      const sRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Concurrent Benchmark Strategy',
          dslCode: `
            strategy "Concurrent"
            indicator f = SMA(close, 5)
            indicator s = SMA(close, 10)
            entry:
                f > s
            exit:
                f < s
          `,
        });
      const strategyId = sRes.body.data.id;

      // Dispatch 100 simultaneous execution requests
      const promises = Array.from({ length: 100 }, (_, i) =>
        request(app)
          .post(`/api/v1/strategies/${strategyId}/execute`)
          .set('Authorization', `Bearer ${userAToken}`)
          .send({
            initialCapital: String(100000 + i * 1000),
          })
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(100);

      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.execution.status).toBe('COMPLETED');
      }

      // Check all 100 executions recorded
      const listRes = await request(app)
        .get(`/api/v1/strategies/${strategyId}/executions`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(listRes.body.data.length).toBe(100);
    }, 20000);
  });
});
