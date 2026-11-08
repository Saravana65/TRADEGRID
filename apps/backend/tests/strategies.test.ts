import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { StrategyService, StrategyController } from '../src/modules/strategies';
import { DSLLexer, DSLParser, DSLValidator, DSLSyntaxError } from '../src/modules/strategies/dsl';
import {
  InMemoryStrategyRepository,
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
} from './mocks/in-memory-repositories';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';

describe('Phase 9A: Custom User Strategy Scripting (DSL) & Validation Engine', () => {
  let app: any;
  let strategyRepo: InMemoryStrategyRepository;
  let strategyService: StrategyService;
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
    strategyService = new StrategyService(strategyRepo);
    strategyController = new StrategyController(strategyService);

    app = createApp({
      authController,
      strategyController,
      customCheckDb: async () => true,
    });

    // Register User A
    const resA = await request(app).post('/api/v1/auth/register').send({
      username: 'quant_alice',
      email: 'alice@tradegrid.internal',
      password: 'Password123!',
    });
    userAToken = resA.body.data.tokens.accessToken;
    userAId = resA.body.data.user.id;

    // Register User B
    const resB = await request(app).post('/api/v1/auth/register').send({
      username: 'quant_bob',
      email: 'bob@tradegrid.internal',
      password: 'Password123!',
    });
    userBToken = resB.body.data.tokens.accessToken;
    userBId = resB.body.data.user.id;
  });

  afterEach(() => {
    strategyRepo.clear();
    userRepo.clear();
    sessionRepo.clear();
  });

  // ==========================================================================
  // 1. DSL Lexer & Tokenizer
  // ==========================================================================

  describe('1. DSL Lexer & Tokenizer', () => {
    it('should tokenize valid keywords, literals, and operators', () => {
      const code = `
        strategy "Test Strategy"
        description "A test strategy description"
        instrument "NSE:RELIANCE"
        timeframe "15m"

        indicator fast_sma = SMA(close, 9)
        indicator slow_sma = SMA(close, 21)

        entry:
            fast_sma crosses_above slow_sma and close > 2500

        exit:
            fast_sma crosses_below slow_sma

        risk:
            stop_loss = 2.5%
            take_profit = 5%
      `;

      const lexer = new DSLLexer(code);
      const tokens = lexer.tokenize();

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.some((t) => t.type === 'STRATEGY')).toBe(true);
      expect(tokens.some((t) => t.type === 'CROSSES_ABOVE')).toBe(true);
      expect(tokens.some((t) => t.type === 'CROSSES_BELOW')).toBe(true);
      expect(tokens.some((t) => t.type === 'PERCENT' && t.value === '2.5')).toBe(true);
      expect(tokens[tokens.length - 1].type).toBe('EOF');
    });

    it('should ignore single-line comments starting with // and #', () => {
      const code = `
        // Header comment
        strategy "Comment Test"
        # Hash comment
        timeframe "1d"
      `;

      const lexer = new DSLLexer(code);
      const tokens = lexer.tokenize();

      const idents = tokens.filter((t) => t.type === 'STRING').map((t) => t.value);
      expect(idents).toEqual(['Comment Test', '1d']);
    });

    it('should throw DSLSyntaxError with line and column on unexpected characters', () => {
      const code = `
        strategy "Invalid Char"
        indicator bad = SMA(close, 10) @
      `;

      const lexer = new DSLLexer(code);
      expect(() => lexer.tokenize()).toThrow(DSLSyntaxError);
      try {
        lexer.tokenize();
      } catch (err: any) {
        expect(err.line).toBe(3);
        expect(err.column).toBeGreaterThan(0);
        expect(err.message).toContain("Unexpected character '@'");
      }
    });

    it('should throw DSLSyntaxError on unterminated string literals', () => {
      const code = `strategy "Unterminated string`;
      const lexer = new DSLLexer(code);
      expect(() => lexer.tokenize()).toThrow('Unterminated string literal');
    });
  });

  // ==========================================================================
  // 2. DSL Parser & AST Generation
  // ==========================================================================

  describe('2. DSL Parser & AST Generation', () => {
    it('should parse a complete valid strategy into a strongly typed AST', () => {
      const code = `
        strategy "Momentum Alpha"
        description "Trend following crossover"
        instrument "NSE:TCS"
        timeframe "1h"

        indicator fast = EMA(close, 12)
        indicator slow = EMA(close, 26)
        indicator rsi14 = RSI(close, 14)

        entry:
            fast crosses_above slow and rsi14 < 65

        exit:
            fast crosses_below slow or rsi14 > 80

        risk:
            stop_loss = 2%
            take_profit = 6%
            max_position_size = 15%
      `;

      const lexer = new DSLLexer(code);
      const parser = new DSLParser(lexer.tokenize());
      const ast = parser.parse();

      expect(ast.name).toBe('Momentum Alpha');
      expect(ast.description).toBe('Trend following crossover');
      expect(ast.instrument).toBe('NSE:TCS');
      expect(ast.timeframe).toBe('1h');
      expect(ast.indicators).toHaveLength(3);
      expect(ast.entryConditions).toHaveLength(1);
      expect(ast.exitConditions).toHaveLength(1);
      expect(ast.riskSettings.stop_loss).toBeCloseTo(0.02, 4);
      expect(ast.riskSettings.take_profit).toBeCloseTo(0.06, 4);
      expect(ast.riskSettings.max_position_size).toBeCloseTo(0.15, 4);
    });

    it('should parse multiple entry and exit condition lines', () => {
      const code = `
        strategy "Multi Condition"
        indicator sma50 = SMA(close, 50)
        indicator sma200 = SMA(close, 200)
        indicator rsi = RSI(close, 14)

        entry:
            close > sma50
            sma50 > sma200
            rsi < 70

        exit:
            close < sma50
      `;

      const lexer = new DSLLexer(code);
      const parser = new DSLParser(lexer.tokenize());
      const ast = parser.parse();

      expect(ast.entryConditions).toHaveLength(3);
      expect(ast.exitConditions).toHaveLength(1);
    });

    it('should enforce AST complexity limits against DoS attacks', () => {
      // Generate a massive nested expression
      let massiveExpr = '1';
      for (let i = 0; i < 300; i++) {
        massiveExpr = `(${massiveExpr} + 1)`;
      }

      const code = `
        strategy "Complexity Bomb"
        entry:
            ${massiveExpr} > 0
      `;

      const lexer = new DSLLexer(code);
      const parser = new DSLParser(lexer.tokenize());

      expect(() => parser.parse()).toThrow('AST complexity exceeds safety limit');
    });

    it('should fail with missing strategy name error', () => {
      const code = `
        timeframe "15m"
        entry:
            close > 100
      `;

      const lexer = new DSLLexer(code);
      const parser = new DSLParser(lexer.tokenize());
      expect(() => parser.parse()).toThrow("Missing required 'strategy' declaration");
    });
  });

  // ==========================================================================
  // 3. DSL Static Validation & Type Checking
  // ==========================================================================

  describe('3. DSL Static Validation & Type Checking', () => {
    it('should validate valid strategy source successfully without errors', () => {
      const code = `
        strategy "Golden Cross"
        description "Classic 50/200 SMA golden cross"
        instrument "NSE:INFY"
        timeframe "1d"

        indicator ma_fast = SMA(close, 50)
        indicator ma_slow = SMA(close, 200)

        entry:
            ma_fast crosses_above ma_slow

        exit:
            ma_fast crosses_below ma_slow

        risk:
            stop_loss = 3%
            take_profit = 10%
      `;

      const result = DSLValidator.validate(code);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.ast).toBeDefined();
      expect(result.declaredIndicators).toContain('ma_fast');
      expect(result.declaredIndicators).toContain('ma_slow');
      expect(result.inferredInstrument).toBe('NSE:INFY');
      expect(result.inferredTimeframe).toBe('1d');
    });

    it('should reject undeclared variables in entry and exit conditions', () => {
      const code = `
        strategy "Undeclared Var"
        indicator fast = SMA(close, 10)

        entry:
            fast > ghost_variable
      `;

      const result = DSLValidator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNDECLARED_VARIABLE')).toBe(true);
      expect(result.errors[0].message).toContain("Undeclared variable or indicator 'ghost_variable'");
    });

    it('should reject unsupported indicator functions', () => {
      const code = `
        strategy "Bad Indicator"
        indicator custom = SUPER_SECRET_ORACLE(close, 10)

        entry:
            custom > 100
      `;

      const result = DSLValidator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNSUPPORTED_FUNCTION')).toBe(true);
      expect(result.errors[0].message).toContain("Unsupported indicator function 'SUPER_SECRET_ORACLE'");
    });

    it('should reject invalid indicator parameters (e.g. negative or zero periods)', () => {
      const code = `
        strategy "Invalid Period"
        indicator bad_sma = SMA(close, 0)

        entry:
            bad_sma > 100
      `;

      const result = DSLValidator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_INDICATOR_ARGS')).toBe(true);
      expect(result.errors[0].message).toContain('SMA period argument must be a positive integer >= 1');
    });

    it('should reject duplicate indicator variable declarations', () => {
      const code = `
        strategy "Duplicate Identifiers"
        indicator dup = SMA(close, 10)
        indicator dup = EMA(close, 20)

        entry:
            dup > 100
      `;

      const result = DSLValidator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_INDICATOR')).toBe(true);
    });

    it('should reject malicious prototype/runtime identifiers', () => {
      const code = `
        strategy "Prototype Pollution Attempt"
        indicator __proto__ = SMA(close, 10)

        entry:
            __proto__ > 10
      `;

      const result = DSLValidator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'FORBIDDEN_IDENTIFIER')).toBe(true);
    });

    it('should reject type mismatches in logical operators', () => {
      const code = `
        strategy "Type Mismatch"
        indicator sma = SMA(close, 10)

        entry:
            (close > 100) and (close + 10)
      `;

      const result = DSLValidator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'TYPE_MISMATCH')).toBe(true);
    });

    it('should reject invalid risk parameter values', () => {
      const code = `
        strategy "Bad Risk"
        indicator sma = SMA(close, 10)

        entry:
            close > sma

        risk:
            stop_loss = 150%
            max_position_size = -5%
      `;

      const result = DSLValidator.validate(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_RISK_VALUE')).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Strategy Management REST APIs & User Ownership
  // ==========================================================================

  describe('4. Strategy Management REST APIs & User Ownership', () => {
    it('POST /api/v1/strategies/validate should validate DSL source via public/authenticated API', async () => {
      const validCode = `
        strategy "API Test"
        indicator s = SMA(close, 10)
        entry:
            close > s
      `;

      const res = await request(app).post('/api/v1/strategies/validate').send({
        dslCode: validCode,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.errors).toHaveLength(0);
      expect(res.body.data.ast.name).toBe('API Test');
    });

    it('POST /api/v1/strategies/validate should return detailed error list with line and column numbers on invalid DSL', async () => {
      const badCode = `
        strategy "Broken Code"
        indicator s = SMA(close, -5)
        entry:
            close > unknown_indicator
      `;

      const res = await request(app).post('/api/v1/strategies/validate').send({
        dslCode: badCode,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.errors.length).toBeGreaterThan(0);
      expect(res.body.data.errors[0]).toHaveProperty('line');
      expect(res.body.data.errors[0]).toHaveProperty('column');
      expect(res.body.data.errors[0]).toHaveProperty('message');
    });

    it('POST /api/v1/strategies should create a new strategy and auto-snapshot version 1', async () => {
      const dsl = `
        strategy "Alice Breakout"
        instrument "NSE:HDFCBANK"
        timeframe "15m"
        indicator bb = BollingerBands(close, 20, 2.0)
        entry:
            close > bb
      `;

      const res = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Alice Breakout',
          description: 'Bollinger upper band breakout strategy',
          dslCode: dsl,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.userId).toBe(userAId);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.instrumentSymbol).toBe('NSE:HDFCBANK');
      expect(res.body.data.timeframe).toBe('15m');
    });

    it('GET /api/v1/strategies should return only strategies belonging to the authenticated user', async () => {
      // Create one strategy for Alice
      await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: "Alice's Unique Strategy",
          dslCode: 'strategy "Alice Strat"\nentry:\nclose > 100',
        });

      // Create one strategy for Bob
      await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          name: "Bob's Secret Strategy",
          dslCode: 'strategy "Bob Strat"\nentry:\nclose < 50',
        });

      // Alice lists strategies
      const resA = await request(app)
        .get('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data).toHaveLength(1);
      expect(resA.body.data[0].name).toBe("Alice's Unique Strategy");

      // Bob lists strategies
      const resB = await request(app)
        .get('/api/v1/strategies')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data).toHaveLength(1);
      expect(resB.body.data[0].name).toBe("Bob's Secret Strategy");
    });

    it('PUT /api/v1/strategies/:id should increment version and save version snapshot when DSL code is updated', async () => {
      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Version Evolution',
          dslCode: 'strategy "Ver 1"\nentry:\nclose > 100',
        });

      const stratId = createRes.body.data.id;
      expect(createRes.body.data.version).toBe(1);

      // Update DSL code
      const updateRes = await request(app)
        .put(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          dslCode: 'strategy "Ver 2"\nentry:\nclose > 150',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.version).toBe(2);

      // Verify versions history
      const versRes = await request(app)
        .get(`/api/v1/strategies/${stratId}/versions`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(versRes.status).toBe(200);
      expect(versRes.body.data).toHaveLength(2);
      expect(versRes.body.data[0].version).toBe(2);
      expect(versRes.body.data[1].version).toBe(1);
    });

    it('POST /api/v1/strategies/:id/duplicate should clone an existing strategy', async () => {
      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Original Strategy',
          dslCode: 'strategy "Orig"\nentry:\nclose > 200',
        });

      const stratId = createRes.body.data.id;

      const dupRes = await request(app)
        .post(`/api/v1/strategies/${stratId}/duplicate`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ newName: 'Cloned Strategy' });

      expect(dupRes.status).toBe(201);
      expect(dupRes.body.data.name).toBe('Cloned Strategy');
      expect(dupRes.body.data.id).not.toBe(stratId);
      expect(dupRes.body.data.version).toBe(1);
    });

    it('DELETE /api/v1/strategies/:id should delete the strategy and cascade versions', async () => {
      const createRes = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Ephemeral Strat',
          dslCode: 'strategy "Delete Me"\nentry:\nclose > 10',
        });

      const stratId = createRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deleted).toBe(true);

      // Check subsequent fetch 404
      const fetchRes = await request(app)
        .get(`/api/v1/strategies/${stratId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(fetchRes.status).toBe(404);
    });
  });

  // ==========================================================================
  // 5. Strict User Ownership & Unauthorized Access Prevention
  // ==========================================================================

  describe('5. Strict User Ownership & Unauthorized Access Prevention', () => {
    let aliceStratId: number;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: "Alice's Proprietary Alpha",
          dslCode: 'strategy "Alpha"\nentry:\nclose > 500',
        });
      aliceStratId = res.body.data.id;
    });

    it("should prevent User B from reading User A's private strategy (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/strategies/${aliceStratId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_STRATEGY_ACCESS');
    });

    it("should prevent User B from editing User A's strategy (403 Forbidden)", async () => {
      const res = await request(app)
        .put(`/api/v1/strategies/${aliceStratId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ name: 'Hacked Strategy' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_STRATEGY_ACCESS');
    });

    it("should prevent User B from duplicating User A's private strategy (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/v1/strategies/${aliceStratId}/duplicate`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ newName: 'Stolen Strategy' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_STRATEGY_ACCESS');
    });

    it("should prevent User B from deleting User A's strategy (403 Forbidden)", async () => {
      const res = await request(app)
        .delete(`/api/v1/strategies/${aliceStratId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_STRATEGY_ACCESS');
    });

    it("should prevent User B from viewing User A's strategy version history (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/strategies/${aliceStratId}/versions`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_STRATEGY_ACCESS');
    });

    it('should reject unauthenticated requests to strategy endpoints with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/strategies');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // 6. 100 Concurrent Users Stress Verification
  // ==========================================================================

  describe('6. 100 Concurrent Users Stress Verification', () => {
    it('should handle 100 concurrent strategy validations, listings, and reads without race conditions', async () => {
      // Seed a few strategies
      const stratResA = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Concurrent Strat A',
          dslCode: 'strategy "A"\nindicator s = SMA(close, 10)\nentry:\nclose > s',
        });
      const idA = stratResA.body.data.id;

      const stratResB = await request(app)
        .post('/api/v1/strategies')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          name: 'Concurrent Strat B',
          dslCode: 'strategy "B"\nindicator e = EMA(close, 20)\nentry:\nclose < e',
        });
      const idB = stratResB.body.data.id;

      const concurrentRequests = 100;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const isUserA = i % 2 === 0;
        const token = isUserA ? userAToken : userBToken;
        const targetId = isUserA ? idA : idB;

        if (i % 3 === 0) {
          promises.push(
            request(app)
              .post('/api/v1/strategies/validate')
              .send({
                dslCode: `strategy "Req ${i}"\nindicator fast = SMA(close, 9)\nentry:\nclose > fast`,
              })
          );
        } else if (i % 3 === 1) {
          promises.push(
            request(app).get('/api/v1/strategies').set('Authorization', `Bearer ${token}`)
          );
        } else {
          promises.push(
            request(app)
              .get(`/api/v1/strategies/${targetId}`)
              .set('Authorization', `Bearer ${token}`)
          );
        }
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);

      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });
  });
});
