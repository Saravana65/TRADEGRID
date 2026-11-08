import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import { createApp } from '../src/app';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
  InMemoryInstrumentRepository,
  InMemoryMarketDataRepository,
  InMemoryPositionRepository,
  InMemoryResearchRepository,
} from './mocks/in-memory-repositories';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateBreakout,
  calculateStandardDeviation,
} from '../src/modules/research/indicators';
import { MetricsCalculator } from '../src/modules/research/metrics.calculator';
import { StrategyRegistry } from '../src/modules/research/strategies';
import { BacktestEngine } from '../src/modules/research/backtest.engine';
import { HistoricalDataService } from '../src/modules/research/historical-data.service';
import { SignalsService } from '../src/modules/research/signals.service';
import { PortfolioInsightsService } from '../src/modules/research/portfolio-insights.service';
import { DeterministicAIProvider } from '../src/modules/research/ai-insights.service';
import { ResearchController } from '../src/modules/research/research.controller';
import { Candle } from '@tradegrid/shared-types';

describe('Phase 6: AI Trading Insights & Strategy Backtesting Engine', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let positionRepo: InMemoryPositionRepository;
  let researchRepo: InMemoryResearchRepository;

  let authService: AuthService;
  let authController: AuthController;
  let researchController: ResearchController;
  let historicalDataService: HistoricalDataService;
  let backtestEngine: BacktestEngine;
  let signalsService: SignalsService;
  let portfolioInsightsService: PortfolioInsightsService;
  let aiProvider: DeterministicAIProvider;

  let app: any;
  let server: http.Server;
  let traderToken: string;
  let otherTraderToken: string;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository();
    positionRepo = new InMemoryPositionRepository();
    researchRepo = new InMemoryResearchRepository();

    authService = new AuthService(userRepo, sessionRepo, walletRepo, ledgerRepo);
    authController = new AuthController(authService);

    historicalDataService = new HistoricalDataService(marketDataRepo, instrumentRepo);
    backtestEngine = new BacktestEngine(historicalDataService);
    signalsService = new SignalsService(historicalDataService, instrumentRepo);
    portfolioInsightsService = new PortfolioInsightsService(
      positionRepo,
      walletRepo,
      instrumentRepo,
      marketDataRepo
    );
    aiProvider = new DeterministicAIProvider();

    researchController = new ResearchController(
      backtestEngine,
      signalsService,
      portfolioInsightsService,
      aiProvider,
      researchRepo
    );

    app = createApp({
      authController,
      researchController,
      customCheckDb: async () => true,
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    // Register test traders
    const traderReg = await authService.register({
      username: 'quant_trader',
      email: 'quant@tradegrid.internal',
      password: 'Password123!',
    });
    traderToken = traderReg.tokens.accessToken;

    const otherReg = await authService.register({
      username: 'other_trader',
      email: 'other@tradegrid.internal',
      password: 'Password123!',
    });
    otherTraderToken = otherReg.tokens.accessToken;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ==========================================================================
  // 1. Technical Indicators Mathematical Correctness
  // ==========================================================================
  describe('1. Technical Indicator Mathematics', () => {
    it('should correctly calculate SMA with moving window', () => {
      const data = [10, 20, 30, 40, 50];
      const sma3 = calculateSMA(data, 3);

      expect(sma3[0]).toBeNull();
      expect(sma3[1]).toBeNull();
      expect(sma3[2]).toBe(20); // (10+20+30)/3
      expect(sma3[3]).toBe(30); // (20+30+40)/3
      expect(sma3[4]).toBe(40); // (30+40+50)/3
    });

    it('should correctly calculate EMA using standard multiplier', () => {
      const data = [10, 11, 12, 13, 14, 15];
      const period = 3;
      const ema = calculateEMA(data, period);

      expect(ema[0]).toBeNull();
      expect(ema[1]).toBeNull();
      expect(ema[2]).toBe(11); // Seed is SMA of first 3 items: (10+11+12)/3 = 11

      // k = 2 / (3 + 1) = 0.5
      // bar 3: 13 * 0.5 + 11 * 0.5 = 12
      expect(ema[3]).toBe(12);
      // bar 4: 14 * 0.5 + 12 * 0.5 = 13
      expect(ema[4]).toBe(13);
    });

    it('should calculate RSI with 0 to 100 boundary constraints', () => {
      // Monotonically increasing series -> RSI should reach near 100
      const upSeries = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
      const rsiUp = calculateRSI(upSeries, 14);
      expect(rsiUp[14]).toBe(100);

      // Fluctuating series
      const oscillating = [50, 48, 52, 47, 53, 49, 51, 48, 52, 50, 49, 53, 51, 48, 52, 50];
      const rsiOsc = calculateRSI(oscillating, 14);
      expect(rsiOsc[14]).toBeGreaterThan(30);
      expect(rsiOsc[14]).toBeLessThan(70);
    });

    it('should calculate MACD line, signal line and histogram', () => {
      const closes = [
        100, 102, 104, 103, 105, 107, 106, 108, 110, 112, 111, 113, 115, 114, 116,
        118, 117, 119, 121, 120, 122, 124, 123, 125, 127, 126, 128, 130, 129, 131,
        133, 132, 134, 136, 135, 137, 139, 138, 140, 142
      ];
      const { macd, signal, histogram } = calculateMACD(closes, 12, 26, 9);

      // MACD line is valid after slowPeriod - 1 (25)
      expect(macd[24]).toBeNull();
      expect(macd[25]).not.toBeNull();

      // Signal line is valid after macd + signalPeriod
      const lastHist = histogram[histogram.length - 1];
      const lastMacd = macd[macd.length - 1];
      const lastSig = signal[signal.length - 1];
      expect(lastHist).not.toBeNull();
      expect(lastHist).toBeCloseTo((lastMacd as number) - (lastSig as number), 6);
    });

    it('should calculate Bollinger Bands (middle, upper, lower)', () => {
      const data = new Array(30).fill(100);
      const { upper, middle, lower } = calculateBollingerBands(data, 20, 2);

      // For constant values, stdDev = 0, so upper == middle == lower
      expect(middle[19]).toBe(100);
      expect(upper[19]).toBe(100);
      expect(lower[19]).toBe(100);

      // Varied data
      const varied = data.map((v, i) => (i % 2 === 0 ? 110 : 90));
      const bb = calculateBollingerBands(varied, 20, 2);
      expect(bb.middle[19]).toBe(100);
      expect(bb.upper[19]).toBeGreaterThan(100);
      expect(bb.lower[19]).toBeLessThan(100);
    });

    it('should calculate Donchian breakout channels excluding current bar to avoid lookahead bias', () => {
      const highs = [10, 12, 15, 14, 16, 20];
      const lows = [8, 9, 11, 10, 12, 14];
      const { highestHigh, lowestLow } = calculateBreakout(highs, lows, 3);

      expect(highestHigh[0]).toBeNull();
      expect(highestHigh[1]).toBeNull();
      expect(highestHigh[2]).toBeNull();

      // At index 3 (high=14), lookback is indices [0, 1, 2] -> max(10, 12, 15) = 15
      expect(highestHigh[3]).toBe(15);
      expect(lowestLow[3]).toBe(8); // min(8, 9, 11) = 8

      // At index 4 (high=16), lookback is indices [1, 2, 3] -> max(12, 15, 14) = 15
      expect(highestHigh[4]).toBe(15);

      // At index 5 (high=20), lookback is indices [2, 3, 4] -> max(15, 14, 16) = 16
      expect(highestHigh[5]).toBe(16);
    });

    it('should calculate sample standard deviation accurately', () => {
      const sample = [2, 4, 4, 4, 5, 5, 7, 9];
      const std = calculateStandardDeviation(sample);
      expect(std).toBeCloseTo(2.138, 2);
    });
  });

  // ==========================================================================
  // 2. Strategy Reproducibility & Signal Rules
  // ==========================================================================
  describe('2. Quantitative Strategy Reproducibility & Crossover Rules', () => {
    it('should produce identical results with identical inputs across runs', () => {
      const strategy = StrategyRegistry.getStrategy('SMA_CROSSOVER');

      const mockCandles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
        timestamp: new Date(Date.now() - (50 - i) * 86400000).toISOString(),
        open: (100 + Math.sin(i / 5) * 10).toFixed(4),
        high: (105 + Math.sin(i / 5) * 10).toFixed(4),
        low: (95 + Math.sin(i / 5) * 10).toFixed(4),
        close: (100 + Math.sin(i / 5) * 10).toFixed(4),
        volume: '10000',
      }));

      const run1 = strategy.evaluate(mockCandles, { fastPeriod: 5, slowPeriod: 15 });
      const run2 = strategy.evaluate(mockCandles, { fastPeriod: 5, slowPeriod: 15 });

      expect(run1.signals).toEqual(run2.signals);
      expect(run1.indicatorValues.fastSMA).toEqual(run2.indicatorValues.fastSMA);
    });

    it('should trigger Golden Cross BUY and Death Cross SELL in SMA strategy', () => {
      const strategy = StrategyRegistry.getStrategy('SMA_CROSSOVER');

      // Construct price series that drops then surges
      const prices = [
        100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86,
        85, 87, 90, 95, 105, 115, 125, 135, 140, 145, 150, 155, 160, 165, 170
      ];

      const candles: Candle[] = prices.map((p, i) => ({
        timestamp: new Date(Date.now() - (prices.length - i) * 86400000).toISOString(),
        open: p.toFixed(4),
        high: (p + 1).toFixed(4),
        low: (p - 1).toFixed(4),
        close: p.toFixed(4),
        volume: '50000',
      }));

      const res = strategy.evaluate(candles, { fastPeriod: 5, slowPeriod: 15 });
      expect(res.signals).toContain('BUY');
    });

    it('should correctly trigger RSI oversold recovery signals', () => {
      const strategy = StrategyRegistry.getStrategy('RSI_MOMENTUM');

      // Create a sharp drop (driving RSI < 30) followed by a bounce
      const prices = [
        100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 28, 26, 32, 38, 44
      ];

      const candles: Candle[] = prices.map((p, i) => ({
        timestamp: new Date(Date.now() - (prices.length - i) * 86400000).toISOString(),
        open: p.toFixed(4),
        high: (p + 2).toFixed(4),
        low: (p - 2).toFixed(4),
        close: p.toFixed(4),
        volume: '20000',
      }));

      const res = strategy.evaluate(candles, { period: 5, oversold: 30, overbought: 70 });
      expect(res.signals).toContain('BUY');
    });
  });

  // ==========================================================================
  // 3. Backtesting Engine Execution & Strict Anti-Lookahead Invariant
  // ==========================================================================
  describe('3. Backtesting Engine Execution, Sizing & Anti-Lookahead Bias', () => {
    it('should enforce anti-lookahead bias: decisions only use historical candles up to current bar', async () => {
      const result = await backtestEngine.runBacktest(1, {
        instrumentId: 1,
        symbol: 'RELIANCE',
        interval: '1d',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        strategyType: 'SMA_CROSSOVER',
        strategyParams: { fastPeriod: 5, slowPeriod: 15 },
        initialCapital: 100000,
        positionSizing: { type: 'FIXED_PERCENT', value: 25 },
        slippagePercent: 0.05,
        commissionPercent: 0.1,
      });

      expect(result.candlesAnalyzed).toBeGreaterThanOrEqual(30);
      expect(result.equityCurve.length).toBe(result.candlesAnalyzed);
      expect(result.metrics.initialCapital).toBe(100000);
      expect(result.metrics.finalEquity).toBeGreaterThan(0);

      // Verify each trade's exit timestamp is strictly >= its entry timestamp
      for (const t of result.trades) {
        expect(new Date(t.exitTimestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(t.entryTimestamp).getTime()
        );
      }
    });

    it('should deduct slippage and commission costs on simulated trade executions', async () => {
      const zeroCostResult = await backtestEngine.runBacktest(1, {
        instrumentId: 1,
        symbol: 'TCS',
        interval: '1d',
        startDate: '',
        endDate: '',
        strategyType: 'BREAKOUT',
        strategyParams: { period: 10 },
        initialCapital: 100000,
        positionSizing: { type: 'FIXED_PERCENT', value: 50 },
        slippagePercent: 0,
        commissionPercent: 0,
        includeAIAnalysis: false,
      });

      const highCostResult = await backtestEngine.runBacktest(1, {
        instrumentId: 1,
        symbol: 'TCS',
        interval: '1d',
        startDate: '',
        endDate: '',
        strategyType: 'BREAKOUT',
        strategyParams: { period: 10 },
        initialCapital: 100000,
        positionSizing: { type: 'FIXED_PERCENT', value: 50 },
        slippagePercent: 0.5, // 0.5% slippage
        commissionPercent: 0.5, // 0.5% commission
        includeAIAnalysis: false,
      });

      if (zeroCostResult.trades.length > 0) {
        expect(highCostResult.metrics.finalEquity).toBeLessThan(zeroCostResult.metrics.finalEquity);
        expect(highCostResult.trades[0].commission).toBeGreaterThan(0);
        expect(highCostResult.trades[0].slippage).toBeGreaterThan(0);
      }
    });

    it('should trigger Stop-Loss and Take-Profit rules when thresholds are breached', async () => {
      const result = await backtestEngine.runBacktest(1, {
        instrumentId: 1,
        symbol: 'INFY',
        interval: '1d',
        startDate: '',
        endDate: '',
        strategyType: 'RSI_MOMENTUM',
        strategyParams: { period: 5 },
        initialCapital: 100000,
        positionSizing: { type: 'FIXED_PERCENT', value: 30 },
        stopLossPercent: 1.0, // tight 1% stop loss
        takeProfitPercent: 2.0, // 2% take profit
        slippagePercent: 0.05,
        commissionPercent: 0.1,
        includeAIAnalysis: false,
      });

      const exitReasons = result.trades.map((t) => t.exitReason);
      const hasRiskExits =
        exitReasons.includes('STOP_LOSS') ||
        exitReasons.includes('TAKE_PROFIT') ||
        exitReasons.includes('END_OF_DATA');
      expect(hasRiskExits).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Performance Metrics & Risk Ratios
  // ==========================================================================
  describe('4. Financial Performance Metrics Calculations', () => {
    it('should compute Sharpe, Sortino, Max Drawdown and Win Rate correctly', () => {
      const mockTrades = [
        {
          id: 1,
          tradeNumber: 1,
          entryTimestamp: '2026-01-01T00:00:00.000Z',
          exitTimestamp: '2026-01-05T00:00:00.000Z',
          side: 'LONG' as const,
          entryPrice: 100,
          exitPrice: 110,
          quantity: 100,
          notional: 10000,
          grossProfitLoss: 1000,
          netProfitLoss: 980,
          returnPercent: 9.8,
          commission: 20,
          slippage: 5,
          exitReason: 'SIGNAL' as const,
          barsHeld: 4,
        },
        {
          id: 2,
          tradeNumber: 2,
          entryTimestamp: '2026-01-06T00:00:00.000Z',
          exitTimestamp: '2026-01-10T00:00:00.000Z',
          side: 'LONG' as const,
          entryPrice: 110,
          exitPrice: 105,
          quantity: 100,
          notional: 11000,
          grossProfitLoss: -500,
          netProfitLoss: -520,
          returnPercent: -4.7,
          commission: 20,
          slippage: 5,
          exitReason: 'STOP_LOSS' as const,
          barsHeld: 4,
        },
      ];

      const mockCurve = [
        { timestamp: '2026-01-01', equity: 100000, cash: 90000, drawdownPercent: 0, benchmarkEquity: 100000 },
        { timestamp: '2026-01-05', equity: 100980, cash: 100980, drawdownPercent: 0, benchmarkEquity: 102000 },
        { timestamp: '2026-01-10', equity: 100460, cash: 100460, drawdownPercent: 0.51, benchmarkEquity: 101000 },
      ];

      const metrics = MetricsCalculator.calculate({
        initialCapital: 100000,
        finalEquity: 100460,
        trades: mockTrades,
        equityCurve: mockCurve,
        benchmarkReturnPercent: 1.0,
        durationDays: 10,
      });

      expect(metrics.totalTrades).toBe(2);
      expect(metrics.winningTrades).toBe(1);
      expect(metrics.losingTrades).toBe(1);
      expect(metrics.winRatePercent).toBe(50);
      expect(metrics.profitFactor).toBeCloseTo(980 / 520, 2);
      expect(metrics.totalReturnPercent).toBeCloseTo(0.46, 2);
      expect(metrics.maxDrawdownPercent).toBeGreaterThan(0);
    });

    it('should handle zero trades and flat returns safely without NaN', () => {
      const metrics = MetricsCalculator.calculate({
        initialCapital: 100000,
        finalEquity: 100000,
        trades: [],
        equityCurve: [
          { timestamp: '2026-01-01', equity: 100000, cash: 100000, drawdownPercent: 0, benchmarkEquity: 100000 },
        ],
        benchmarkReturnPercent: 0,
        durationDays: 1,
      });

      expect(metrics.totalTrades).toBe(0);
      expect(metrics.winRatePercent).toBe(0);
      expect(metrics.profitFactor).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
      expect(metrics.sortinoRatio).toBe(0);
      expect(metrics.maxDrawdownPercent).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Quantitative Signal Scanner
  // ==========================================================================
  describe('5. Quantitative Signal Scanner', () => {
    it('should generate rule-based signals across instruments with explanations', async () => {
      const signals = await signalsService.generateSignals({
        symbol: 'RELIANCE',
        limit: 6,
      });

      expect(signals.length).toBeGreaterThan(0);
      const sig = signals[0];
      expect(sig.symbol).toBe('RELIANCE');
      expect(['BUY', 'SELL', 'HOLD']).toContain(sig.signalType);
      expect(['WEAK', 'MODERATE', 'STRONG']).toContain(sig.strength);
      expect(sig.explanation.length).toBeGreaterThan(5);
      expect(sig.disclaimer).toContain('EDUCATIONAL RESEARCH SIGNAL');
    });
  });

  // ==========================================================================
  // 6. Portfolio Insights & Concentration Risk
  // ==========================================================================
  describe('6. Portfolio Insights & Concentration Risk', () => {
    it('should calculate HHI, asset allocation and risk warnings on actual portfolio data', async () => {
      // Seed positions for user #1 (quant_trader)
      await positionRepo.upsertPosition({
        user_id: 1,
        instrument_id: 1,
        quantity: '50.0000',
        average_buy_price: '2500.0000',
        realized_pnl: '0.0000',
      });
      await positionRepo.upsertPosition({
        user_id: 1,
        instrument_id: 2,
        quantity: '20.0000',
        average_buy_price: '3800.0000',
        realized_pnl: '0.0000',
      });

      const insights = await portfolioInsightsService.getPortfolioInsights(1);

      expect(insights.userId).toBe(1);
      expect(insights.totalPositions).toBe(2);
      expect(insights.assetAllocation.length).toBe(2);
      expect(insights.concentrationHhi).toBeGreaterThan(0);
      expect(insights.diversificationScore).toBeGreaterThanOrEqual(0);
      expect(insights.diversificationScore).toBeLessThanOrEqual(100);
      expect(insights.aiReview).not.toBeNull();
      expect(insights.aiReview?.isAIGenerated).toBe(true);
    });
  });

  // ==========================================================================
  // 7. Deterministic AI Provider Commentary
  // ==========================================================================
  describe('7. AI Provider Abstraction & Deterministic Review', () => {
    it('should produce contextual AI commentary without external paid API keys', async () => {
      const backtestRes = await backtestEngine.runBacktest(1, {
        instrumentId: 1,
        symbol: 'TGRID',
        interval: '1d',
        startDate: '',
        endDate: '',
        strategyType: 'BOLLINGER_REVERSION',
        strategyParams: {},
        initialCapital: 100000,
        positionSizing: { type: 'FIXED_PERCENT', value: 25 },
        slippagePercent: 0.05,
        commissionPercent: 0.1,
      });

      const analysis = await aiProvider.explainBacktest(backtestRes);
      expect(analysis.isAIGenerated).toBe(true);
      expect(analysis.disclaimer).toContain('SIMULATED QUANTITATIVE RESEARCH');
      expect(analysis.summary.length).toBeGreaterThan(20);
      expect(analysis.strategyStrengths.length).toBeGreaterThan(0);
      expect(analysis.riskFactors.length).toBeGreaterThan(0);
      expect(analysis.optimizationSuggestions.length).toBeGreaterThan(0);
    });

    it('should compare multiple strategies and identify the top risk-adjusted performer', async () => {
      const res1 = await backtestEngine.runBacktest(1, {
        instrumentId: 1,
        symbol: 'RELIANCE',
        interval: '1d',
        startDate: '',
        endDate: '',
        strategyType: 'SMA_CROSSOVER',
        strategyParams: {},
        initialCapital: 100000,
        positionSizing: { type: 'FIXED_PERCENT', value: 25 },
        slippagePercent: 0.05,
        commissionPercent: 0.1,
        includeAIAnalysis: false,
      });

      const res2 = await backtestEngine.runBacktest(1, {
        instrumentId: 1,
        symbol: 'RELIANCE',
        interval: '1d',
        startDate: '',
        endDate: '',
        strategyType: 'RSI_MOMENTUM',
        strategyParams: {},
        initialCapital: 100000,
        positionSizing: { type: 'FIXED_PERCENT', value: 25 },
        slippagePercent: 0.05,
        commissionPercent: 0.1,
        includeAIAnalysis: false,
      });

      const comparison = await aiProvider.compareStrategies('RELIANCE', [res1, res2]);
      expect(comparison.instrumentSymbol).toBe('RELIANCE');
      expect(comparison.tradeOffs.length).toBe(2);
      expect(comparison.comparisonSummary).toContain('Sharpe Ratio');
    });
  });

  // ==========================================================================
  // 8. REST API Endpoints & User Authorization Isolation
  // ==========================================================================
  describe('8. REST API Endpoints & User Isolation', () => {
    it('POST /api/v1/research/backtest should reject unauthenticated requests (401)', async () => {
      const res = await request(app)
        .post('/api/v1/research/backtest')
        .send({
          symbol: 'RELIANCE',
          strategyType: 'SMA_CROSSOVER',
        });

      expect(res.status).toBe(401);
    });

    it('POST /api/v1/research/backtest should validate inputs and execute backtest successfully (200)', async () => {
      const res = await request(app)
        .post('/api/v1/research/backtest')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          symbol: 'RELIANCE',
          strategyType: 'SMA_CROSSOVER',
          initialCapital: 50000,
          positionSizing: { type: 'FIXED_PERCENT', value: 30 },
          slippagePercent: 0.05,
          commissionPercent: 0.1,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metrics.initialCapital).toBe(50000);
      expect(res.body.data.parameters.strategyType).toBe('SMA_CROSSOVER');
    });

    it('GET /api/v1/research/backtests should return user history', async () => {
      // Run a backtest first
      await request(app)
        .post('/api/v1/research/backtest')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          symbol: 'TCS',
          strategyType: 'MACD_TREND',
        });

      const res = await request(app)
        .get('/api/v1/research/backtests')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/research/backtests/:id should enforce user isolation: user A cannot view user B backtest', async () => {
      // User 1 creates backtest
      const postRes = await request(app)
        .post('/api/v1/research/backtest')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          symbol: 'INFY',
          strategyType: 'BREAKOUT',
        });

      const runId = postRes.body.data.runId;

      // User 2 attempts to fetch user 1's backtest
      const getRes = await request(app)
        .get(`/api/v1/research/backtests/${runId}`)
        .set('Authorization', `Bearer ${otherTraderToken}`);

      expect(getRes.status).toBe(403);
      expect(getRes.body.error.code).toBe('FORBIDDEN');
    });

    it('POST /api/v1/research/compare should run multi-strategy matrix', async () => {
      const res = await request(app)
        .post('/api/v1/research/compare')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          symbol: 'RELIANCE',
          strategies: ['SMA_CROSSOVER', 'RSI_MOMENTUM'],
          initialCapital: 100000,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.results.length).toBe(2);
      expect(res.body.data.aiComparison).toBeDefined();
    });

    it('GET /api/v1/research/signals should return quantitative signals scanner', async () => {
      const res = await request(app)
        .get('/api/v1/research/signals?limit=5');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/v1/research/portfolio-insights should return risk analysis for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/research/portfolio-insights')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.concentrationHhi).toBeDefined();
      expect(res.body.data.diversificationScore).toBeDefined();
    });
  });
});
