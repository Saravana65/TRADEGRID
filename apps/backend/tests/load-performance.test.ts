import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
  InMemoryInstrumentRepository,
  InMemoryMarketDataRepository,
  InMemoryOrderRepository,
  InMemoryStrategyRepository,
  InMemoryAutomatedStrategyJobRepository,
} from './mocks/in-memory-repositories';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { MatchingEngine } from '../src/modules/matching/matching-engine';
import { OrderService } from '../src/modules/orders/order.service';
import { OrderReservationService } from '../src/modules/orders/order-reservation.service';
import { RealtimeService } from '../src/websocket/realtime.service';
import { DSLLexer, DSLParser } from '../src/modules/strategies/dsl';
import { StrategyService } from '../src/modules/strategies/strategy.service';
import { AutomatedStrategyRunnerService } from '../src/modules/strategies/runner/runner.service';

describe('Phase 11E: 100 Concurrent Users Load & Performance Verification ($0 Infrastructure)', () => {
  let userRepo: InMemoryUserRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let orderRepo: InMemoryOrderRepository;
  let matchingEngine: MatchingEngine;
  let orderService: OrderService;
  let walletService: WalletService;
  let realtimeService: RealtimeService;
  let strategyRepo: InMemoryStrategyRepository;
  let jobRepo: InMemoryAutomatedStrategyJobRepository;
  let strategyService: StrategyService;
  let runnerService: AutomatedStrategyRunnerService;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);
    orderRepo = new InMemoryOrderRepository();

    const mockKnex = {
      transaction: async (cb: any) => cb({}),
      fn: { now: () => new Date() },
    } as any;

    walletService = new WalletService(walletRepo, ledgerRepo, mockKnex);
    realtimeService = new RealtimeService();
    matchingEngine = new MatchingEngine();
    const reservationService = new OrderReservationService(walletRepo, ledgerRepo);

    orderService = new OrderService(
      orderRepo,
      instrumentRepo,
      marketDataRepo,
      reservationService,
      matchingEngine,
      mockKnex,
      realtimeService
    );

    strategyRepo = new InMemoryStrategyRepository();
    jobRepo = new InMemoryAutomatedStrategyJobRepository();
    strategyService = new StrategyService(strategyRepo);

    runnerService = new AutomatedStrategyRunnerService(
      jobRepo,
      strategyService,
      orderService,
      instrumentRepo,
      realtimeService
    );

    // Register active instruments in repository
    await instrumentRepo.createInstrument({
      id: 10,
      symbol: 'TGRID',
      name: 'TradeGrid Systems Inc',
      exchange: 'TRADEGRID',
      sector: 'Technology',
      instrumentType: 'EQUITY',
      currency: 'USD',
      marketStatus: 'ACTIVE',
      dataClassification: 'SIMULATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await instrumentRepo.createInstrument({
      id: 20,
      symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd',
      exchange: 'NSE',
      sector: 'Energy',
      instrumentType: 'EQUITY',
      currency: 'INR',
      marketStatus: 'ACTIVE',
      dataClassification: 'REAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it('should sustain 100 concurrent simulated user personas with p95 < 100ms and zero ledger discrepancies', async () => {
    const TOTAL_USERS = 100;
    const initialBalance = '100000.0000';

    // 1. Provision 100 simulated accounts and wallets
    const userIds: number[] = [];
    for (let i = 1; i <= TOTAL_USERS; i++) {
      const user = await userRepo.create({
        email: `load_user_${i}@tradegrid.internal`,
        username: `load_trader_${i}`,
        password_hash: 'mock_argon2_hash',
        role: 'TRADER',
        status: 'ACTIVE',
      });
      userIds.push(user.id);
      await walletService.createWalletForUser(user.id, initialBalance, 'USD');
    }

    expect(userIds.length).toBe(100);

    // Initial memory usage
    const initialMemory = process.memoryUsage().heapUsed;

    // Latency tracking arrays
    const orderPlacementLatencies: number[] = [];
    const queryLatencies: number[] = [];
    const dslLatencies: number[] = [];
    const runnerLatencies: number[] = [];

    // Persona slices:
    // 40 Active Traders: userIds[0..39]
    // 30 Market Viewers: userIds[40..69]
    // 20 Quant Researchers: userIds[70..89]
    // 10 Background Strategy Runners: userIds[90..99]
    const traderIds = userIds.slice(0, 40);
    const viewerIds = userIds.slice(40, 70);
    const quantIds = userIds.slice(70, 90);
    const runnerIds = userIds.slice(90, 100);

    const testStartTime = Date.now();

    // 2. Dispatch all 100 concurrent personas simultaneously via Promise.all
    const personaTasks: Promise<any>[] = [];

    // --- Persona Group 1: 40 Active Traders ---
    for (let i = 0; i < traderIds.length; i++) {
      const uId = traderIds[i];
      const task = (async () => {
        const price = (140.0 + (i % 5) * 0.5).toFixed(4);
        const qty = '10.0000';

        const t0 = performance.now();
        const order = await orderService.createOrder(uId, {
          instrumentId: 10,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: qty,
          limitPrice: price,
        });
        const t1 = performance.now();
        orderPlacementLatencies.push(t1 - t0);

        // Cancel order for 10% of traders to test cancellation under load
        if (i % 10 === 0 && order.status === 'OPEN') {
          await orderService.cancelOrder(uId, order.id);
        }
      })();
      personaTasks.push(task);
    }

    // --- Persona Group 2: 30 Market Viewers ---
    for (const vId of viewerIds) {
      const task = (async () => {
        const t0 = performance.now();
        const depth = matchingEngine.getOrCreateBook(10, 'TGRID').getDepth(5);
        const quote = await marketDataRepo.getQuoteBySymbol('TGRID');
        const t1 = performance.now();
        queryLatencies.push(t1 - t0);

        expect(depth).toBeDefined();
        expect(quote).toBeDefined();
      })();
      personaTasks.push(task);
    }

    // --- Persona Group 3: 20 Quantitative Researchers ---
    for (const qId of quantIds) {
      const task = (async () => {
        const dslScript = `
strategy "HighLoadQuantStrategy"
description "High concurrency stress test"
instrument "TGRID"
timeframe "15m"

indicator fast = EMA(close, 9)
indicator slow = EMA(close, 21)

entry:
    fast crosses_above slow

exit:
    fast crosses_below slow

risk:
    stop_loss = 2%
    take_profit = 5%
    max_position_size = 10%
        `.trim();

        const t0 = performance.now();
        const lexer = new DSLLexer(dslScript);
        const tokens = lexer.tokenize();
        const parser = new DSLParser(tokens);
        const ast = parser.parse();
        const t1 = performance.now();
        dslLatencies.push(t1 - t0);

        expect(ast.name).toBe('HighLoadQuantStrategy');
      })();
      personaTasks.push(task);
    }

    // --- Persona Group 4: 10 Automated Background Strategy Runners ---
    for (let i = 0; i < runnerIds.length; i++) {
      const rId = runnerIds[i];
      const task = (async () => {
        const validDsl = `
strategy "AutoQuant_${rId}"
description "Automated runner load strategy"
instrument "TGRID"
timeframe "15m"

indicator fast = SMA(close, 5)
indicator slow = SMA(close, 20)

entry:
    fast crosses_above slow

exit:
    fast crosses_below slow
        `.trim();

        const t0 = performance.now();
        const strategy = await strategyService.createStrategy(rId, {
          name: `AutoQuant_${rId}`,
          dslCode: validDsl,
          instrumentSymbol: 'TGRID',
          timeframe: '15m',
        });

        const job = await runnerService.activateStrategyJob(rId, {
          strategyId: strategy.id,
          instrumentSymbol: 'TGRID',
          timeframe: '15m',
        });

        const details = await runnerService.getJobDetails(rId, job.jobId);
        const t1 = performance.now();
        runnerLatencies.push(t1 - t0);

        expect(details.job.jobId).toBe(job.jobId);
        expect(details.job.status).toBe('RUNNING');
      })();
      personaTasks.push(task);
    }

    // Await all 100 concurrent tasks
    await Promise.all(personaTasks);
    const testDurationMs = Date.now() - testStartTime;

    // Final memory usage
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowthMB = (finalMemory - initialMemory) / (1024 * 1024);

    // 3. Calculate latency percentiles
    const calcPercentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)];
    };

    const orderP50 = calcPercentile(orderPlacementLatencies, 50);
    const orderP95 = calcPercentile(orderPlacementLatencies, 95);
    const orderP99 = calcPercentile(orderPlacementLatencies, 99);

    const queryP50 = calcPercentile(queryLatencies, 50);
    const queryP95 = calcPercentile(queryLatencies, 95);

    const dslP50 = calcPercentile(dslLatencies, 50);
    const dslP95 = calcPercentile(dslLatencies, 95);

    const runnerP50 = calcPercentile(runnerLatencies, 50);
    const runnerP95 = calcPercentile(runnerLatencies, 95);

    // 4. Invariant Assertions
    // Target: p95 order latency < 100ms
    expect(orderP95).toBeLessThan(100);
    // Target: p95 market query latency < 50ms
    expect(queryP95).toBeLessThan(50);
    // Target: p95 DSL parsing latency < 50ms
    expect(dslP95).toBeLessThan(50);
    // Target: p95 runner latency < 100ms
    expect(runnerP95).toBeLessThan(100);
    // Memory growth should be stable (less than 100MB growth under in-process benchmark)
    expect(memoryGrowthMB).toBeLessThan(100);

    // 5. Strict Double-Entry Ledger Integrity Audit across ALL 100 accounts
    let totalLedgerDiscrepancies = 0;
    for (const uId of userIds) {
      const summary = await walletService.getWalletSummary(uId);
      // Double entry balance invariant: Inflow (Debits) - Outflow (Credits) = Available Balance
      const balance = parseFloat(summary.availableBalance);
      const debits = parseFloat(summary.totalDebited);
      const credits = parseFloat(summary.totalCredited);

      // Verify no floating point deviation
      const calculatedExpected = debits - credits;
      if (Math.abs(balance - calculatedExpected) > 0.0001) {
        totalLedgerDiscrepancies++;
      }
      expect(summary.isConsistentWithLedger).toBe(true);
    }

    expect(totalLedgerDiscrepancies).toBe(0);

    // Log benchmark summary
    console.log(`
================================================================================
TRADEGRID 100 CONCURRENT USERS LOAD TEST BENCHMARK REPORT
================================================================================
Concurrent Simulated Users : 100 (40 Traders, 30 Viewers, 20 Quants, 10 Runners)
Total Elapsed Duration     : ${testDurationMs} ms
Order Placement Latencies  : p50 = ${orderP50.toFixed(2)}ms | p95 = ${orderP95.toFixed(2)}ms | p99 = ${orderP99.toFixed(2)}ms
Market Query Latencies     : p50 = ${queryP50.toFixed(2)}ms | p95 = ${queryP95.toFixed(2)}ms
DSL Parsing Latencies      : p50 = ${dslP50.toFixed(2)}ms | p95 = ${dslP95.toFixed(2)}ms
Runner Job Latencies       : p50 = ${runnerP50.toFixed(2)}ms | p95 = ${runnerP95.toFixed(2)}ms
Memory Heap Delta          : ${memoryGrowthMB.toFixed(2)} MB
Ledger Discrepancies       : ${totalLedgerDiscrepancies} (0.00% error rate across all 100 wallets)
Infrastructure Cost        : $0.00 / ₹0.00
Result                     : PASS (All Production SLA Targets Met)
================================================================================
    `);
  });
});
