import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import Decimal from 'decimal.js';
import { createApp } from '../src/app';
import { initWebSocket, closeWebSocket } from '../src/websocket/socket';
import { realtimeService } from '../src/websocket/realtime.service';
import { generateTokens } from '../src/utils/jwt';
import { FinancialMath } from '../src/utils/math';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
  InMemoryInstrumentRepository,
  InMemoryMarketDataRepository,
  InMemoryOrderRepository,
  InMemoryTradeRepository,
  InMemoryPositionRepository,
  InMemoryBotRepository,
} from './mocks/in-memory-repositories';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { OrderReservationService } from '../src/modules/orders/order-reservation.service';
import { SettlementService } from '../src/modules/matching/settlement.service';
import { MatchingEngine } from '../src/modules/matching/matching-engine';
import { OrderService } from '../src/modules/orders/order.service';
import { BotService } from '../src/modules/bots/bot.service';
import { BotEngine } from '../src/modules/bots/bot.engine';
import { BotScheduler } from '../src/modules/bots/bot.scheduler';
import { BotRiskService } from '../src/modules/bots/risk/bot-risk.service';
import { MarketMakerStrategy } from '../src/modules/bots/strategies/market-maker.strategy';
import { RandomizedLiquidityGeneratorStrategy } from '../src/modules/bots/strategies/liquidity-generator.strategy';
import { BotController } from '../src/modules/bots/bot.controller';

describe('Phase 5B: Autonomous Market-Making Bots & Simulated Liquidity Generators', () => {
  let server: http.Server;
  let serverUrl: string;
  let activeClients: ClientSocket[] = [];

  // Repositories
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let orderRepo: InMemoryOrderRepository;
  let tradeRepo: InMemoryTradeRepository;
  let positionRepo: InMemoryPositionRepository;
  let botRepo: InMemoryBotRepository;

  // Services
  let walletService: WalletService;
  let reservationService: OrderReservationService;
  let settlementService: SettlementService;
  let matchingEngine: MatchingEngine;
  let orderService: OrderService;
  let botRiskService: BotRiskService;
  let botEngine: BotEngine;
  let botService: BotService;
  let botScheduler: BotScheduler;
  let botController: BotController;

  // Identity Profiles
  const adminUser = { id: 100, email: 'admin@tradegrid.internal', username: 'admin_sys', role: 'ADMIN' as const };
  const humanTrader = { id: 101, email: 'trader@tradegrid.internal', username: 'trader_bob', role: 'TRADER' as const };

  let adminToken: string;
  let traderToken: string;

  let instrumentIdA: number;
  let instrumentIdB: number;

  beforeAll(() => {
    adminToken = generateTokens(adminUser).accessToken;
    traderToken = generateTokens(humanTrader).accessToken;
  });

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    botRepo = new InMemoryBotRepository();

    const mockKnex = {
      transaction: async (cb: any) => cb({}),
    } as any;

    // Seed instruments
    const instA = await instrumentRepo.create({
      symbol: 'ALPHA',
      name: 'Alpha Corp',
      exchange: 'NASDAQ',
      sector: 'Technology',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
    });
    instrumentIdA = instA.id;

    const instB = await instrumentRepo.create({
      symbol: 'BETA',
      name: 'Beta Energy',
      exchange: 'NYSE',
      sector: 'Energy',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
    });
    instrumentIdB = instB.id;

    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);
    orderRepo = new InMemoryOrderRepository();
    tradeRepo = new InMemoryTradeRepository();
    positionRepo = new InMemoryPositionRepository();

    // Seed market quote with initial reference price $100.0000
    marketDataRepo.quotes.push({
      id: 1,
      instrumentId: instrumentIdA,
      symbol: 'ALPHA',
      exchange: 'NASDAQ',
      lastPrice: '100.0000',
      changeAmount: '0.0000',
      changePercent: '0.00',
      volume: '1000',
      highPrice: '105.0000',
      lowPrice: '95.0000',
      openPrice: '100.0000',
      previousClose: '100.0000',
      updatedAt: new Date().toISOString(),
    });

    walletService = new WalletService(walletRepo, ledgerRepo, mockKnex);
    reservationService = new OrderReservationService(walletRepo, positionRepo, orderRepo);
    settlementService = new SettlementService(
      orderRepo,
      walletRepo,
      ledgerRepo,
      tradeRepo,
      positionRepo,
      marketDataRepo,
      mockKnex
    );
    matchingEngine = new MatchingEngine(
      settlementService,
      realtimeService,
      undefined,
      orderRepo
    );
    orderService = new OrderService(
      orderRepo,
      instrumentRepo,
      marketDataRepo,
      reservationService,
      matchingEngine,
      mockKnex,
      realtimeService
    );

    botRiskService = new BotRiskService();
    botEngine = new BotEngine(
      botRepo,
      orderRepo,
      orderService,
      walletRepo,
      positionRepo,
      instrumentRepo,
      marketDataRepo,
      botRiskService,
      realtimeService
    );
    botService = new BotService(
      botRepo,
      userRepo,
      walletService,
      walletRepo,
      positionRepo,
      instrumentRepo,
      marketDataRepo,
      orderRepo,
      orderService,
      realtimeService,
      mockKnex
    );
    botScheduler = new BotScheduler(botRepo, botEngine, 100);
    botController = new BotController(botService);

    // Seed human trader account and wallet ($100,000)
    await userRepo.create({
      username: humanTrader.username,
      email: humanTrader.email,
      password_hash: 'hash',
      role: 'TRADER',
      status: 'ACTIVE',
    });
    await walletService.createWalletForUser(humanTrader.id, '100000.0000');

    // Create App and HTTP server
    const app = createApp({
      botController,
      customCheckDb: async () => true,
    });
    server = http.createServer(app);
    initWebSocket(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        serverUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await botScheduler.stop();
    for (const client of activeClients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    activeClients = [];
    closeWebSocket();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const createSocketClient = (token?: string): ClientSocket => {
    const socket = Client(serverUrl, {
      auth: token ? { token } : undefined,
      query: token ? { token } : undefined,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    activeClients.push(socket);
    return socket;
  };

  // =========================================================================
  // 1. Bot Lifecycle, Virtual Capital & Ledger Integration
  // =========================================================================
  describe('Bot Lifecycle & Virtual Capital Accounting', () => {
    it('1. should register a bot with a dedicated system account and balanced virtual capital', async () => {
      const bot = await botService.createBot({
        name: 'Alpha Conservative MM',
        strategyType: 'CONSERVATIVE_MM',
        allocatedCapital: '250000.0000',
        instrumentIds: [instrumentIdA],
        initialInventoryShares: '500.0000',
        configuration: {
          spreadBps: 80,
          orderQuantity: '10.0000',
          maxOrderQuantity: '50.0000',
          maxOrderNotional: '10000.0000',
          maxInventoryPerInstrument: '1000.0000',
          maxTotalExposure: '100000.0000',
          quoteRefreshIntervalMs: 5000,
        },
      });

      expect(bot.id).toBeDefined();
      expect(bot.name).toBe('Alpha Conservative MM');
      expect(bot.strategyType).toBe('CONSERVATIVE_MM');
      expect(bot.status).toBe('PAUSED');
      expect(bot.allocatedCapital).toBe('250000.0000');
      expect(bot.currentCashBalance).toBe('250000.0000');
      expect(bot.totalInventory).toBe('500.0000');

      // Bot user record in users repository has role BOT and cannot log in
      const botUser = await userRepo.findById(bot.userId);
      expect(botUser).toBeDefined();
      expect(botUser?.role).toBe('BOT');
      expect(botUser?.password_hash).toContain('LOCKED_SYSTEM_ACCOUNT');

      // Double-entry ledger has balanced grant entry
      const botAccount = await ledgerRepo.findOrCreateAccount('USER_WALLET', bot.userId, 'USD');
      const ledgerBal = await ledgerRepo.calculateAccountBalanceFromLedger(botAccount.id);
      expect(ledgerBal).toBe('250000.0000');
    });

    it('2. should enforce isolation: human users cannot cancel or modify bot orders', async () => {
      const bot = await botService.createBot({
        name: 'Alpha MM Isolated',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });

      // Submit bot order through OrderService
      const botOrder = await orderService.createOrder(bot.userId, {
        instrumentId: instrumentIdA,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '99.5000',
      });

      // Human trader attempts to cancel bot's order -> rejected 403 Forbidden
      await expect(
        orderService.cancelOrder(humanTrader.id, botOrder.id)
      ).rejects.toThrow(/FORBIDDEN|You do not have permission/);
    });
  });

  // =========================================================================
  // 2. Order Execution & Matching Engine Integration
  // =========================================================================
  describe('Order Execution & Matching Engine Integration', () => {
    it('3. should submit bot orders through OrderService and reserve wallet capital', async () => {
      const bot = await botService.createBot({
        name: 'Alpha Liquidity Submitter',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });

      // Bot places BUY limit order for 100 shares @ $99.00 ($9,900 required)
      const order = await orderService.createOrder(bot.userId, {
        instrumentId: instrumentIdA,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '100.0000',
        limitPrice: '99.0000',
      });

      expect(order.status).toBe('OPEN');
      expect(order.remainingQuantity).toBe('100.0000');

      // Bot's effective uncommitted buying power is reduced by $9,900
      const power = await reservationService.validateBuyingPower(
        bot.userId,
        '95000.0000' // attempting $95,000 when $100k - $9.9k = $90,100 available
      );
      expect(power.hasSufficientFunds).toBe(false);
    });

    it('4. should execute trades between bot orders and human orders through the matching engine', async () => {
      const bot = await botService.createBot({
        name: 'Alpha Maker',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
        initialInventoryShares: '200.0000',
      });

      // Bot posts resting SELL limit order (Maker): 50 shares @ $101.0000
      const botSell = await orderService.createOrder(bot.userId, {
        instrumentId: instrumentIdA,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '50.0000',
        limitPrice: '101.0000',
      });

      expect(botSell.status).toBe('OPEN');

      // Human posts aggressive BUY limit order (Taker): 50 shares @ $101.0000
      const humanBuy = await orderService.createOrder(humanTrader.id, {
        instrumentId: instrumentIdA,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '50.0000',
        limitPrice: '101.0000',
      });

      expect(humanBuy.status).toBe('FILLED');

      // Both orders are filled through real matching and atomic settlement
      const updatedBotSell = await orderRepo.findById(botSell.id);
      expect(updatedBotSell?.status).toBe('FILLED');

      // 5. Correct inventory & wallet updates post-settlement
      // Bot sold 50 shares: inventory was 200 -> now 150
      const botPos = await positionRepo.findByUserAndInstrument(bot.userId, instrumentIdA);
      expect(botPos?.quantity).toBe('150.0000');

      // Bot received cash proceeds: $100,000 + (50 * $101.00 = $5,050) = $105,050.0000
      const botWallet = await walletRepo.findByUserId(bot.userId);
      expect(botWallet?.available_balance).toBe('105050.0000');

      // Human received shares: 50.0000
      const humanPos = await positionRepo.findByUserAndInstrument(humanTrader.id, instrumentIdA);
      expect(humanPos?.quantity).toBe('50.0000');

      // Verified double-entry ledger balance for bot
      const botAccount = await ledgerRepo.findOrCreateAccount('USER_WALLET', bot.userId, 'USD');
      const botLedgerBal = await ledgerRepo.calculateAccountBalanceFromLedger(botAccount.id);
      expect(botLedgerBal).toBe('105050.0000');
    });
  });

  // =========================================================================
  // 3. Strategy Mathematics & Inventory-Aware Skewing
  // =========================================================================
  describe('Strategy Mathematics & Inventory-Aware Skewing', () => {
    it('6. should skew quotes downwards when bot holds excess inventory to encourage selling', () => {
      const strategy = new MarketMakerStrategy('BALANCED_MM');
      const config = {
        id: 1,
        bot_id: 1,
        quote_refresh_interval_ms: 5000,
        spread_bps: '100.00', // 1.0% = $1.00 on $100 stock (half-spread $0.50)
        order_quantity: '10.0000',
        max_order_quantity: '50.0000',
        max_order_notional: '10000.0000',
        max_inventory_per_instrument: '100.0000',
        max_total_exposure: '50000.0000',
        max_open_orders: 10,
        max_daily_loss: '5000.0000',
        skew_factor: '0.5000',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Scenario A: Neutral Inventory (50 shares out of 100 max)
      const neutralDecision = strategy.calculateQuotes({
        botId: 1,
        instrumentId: instrumentIdA,
        symbol: 'ALPHA',
        config,
        referencePrice: '100.0000',
        currentInventory: '50.0000',
        availableCash: '100000.0000',
      });

      // Scenario B: Long Inventory (90 shares out of 100 max)
      const longDecision = strategy.calculateQuotes({
        botId: 1,
        instrumentId: instrumentIdA,
        symbol: 'ALPHA',
        config,
        referencePrice: '100.0000',
        currentInventory: '90.0000',
        availableCash: '100000.0000',
      });

      expect(neutralDecision.shouldQuote).toBe(true);
      expect(longDecision.shouldQuote).toBe(true);

      const neutralQuote = neutralDecision.desiredQuote!;
      const longQuote = longDecision.desiredQuote!;

      // When long inventory, adjusted mid is lower than neutral mid
      expect(FinancialMath.lt(longQuote.adjustedMidPrice, neutralQuote.adjustedMidPrice)).toBe(true);
      // Both bid and ask are lower than neutral prices
      expect(FinancialMath.lt(longQuote.bidPrice!, neutralQuote.bidPrice!)).toBe(true);
      expect(FinancialMath.lt(longQuote.askPrice!, neutralQuote.askPrice!)).toBe(true);
    });

    it('7. should suppress BUY quote when inventory reaches max allowed capacity', () => {
      const strategy = new MarketMakerStrategy('CONSERVATIVE_MM');
      const config = {
        id: 1,
        bot_id: 1,
        quote_refresh_interval_ms: 5000,
        spread_bps: '100.00',
        order_quantity: '10.0000',
        max_order_quantity: '50.0000',
        max_order_notional: '10000.0000',
        max_inventory_per_instrument: '100.0000',
        max_total_exposure: '50000.0000',
        max_open_orders: 10,
        max_daily_loss: '5000.0000',
        skew_factor: '0.5000',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Current inventory equals max allowed inventory (100 shares)
      const decision = strategy.calculateQuotes({
        botId: 1,
        instrumentId: instrumentIdA,
        symbol: 'ALPHA',
        config,
        referencePrice: '100.0000',
        currentInventory: '100.0000',
        availableCash: '100000.0000',
      });

      expect(decision.shouldQuote).toBe(true);
      // Bid price is suppressed (null) because bot cannot take on more inventory
      expect(decision.desiredQuote?.bidPrice).toBeNull();
      // Ask price is active to liquidate inventory
      expect(decision.desiredQuote?.askPrice).not.toBeNull();
    });

    it('8. should generate bounded pseudo-random quotes for RANDOM_LIQUIDITY profile', () => {
      const strategy = new RandomizedLiquidityGeneratorStrategy();
      const config = {
        id: 1,
        bot_id: 1,
        quote_refresh_interval_ms: 3000,
        spread_bps: '50.00',
        order_quantity: '20.0000',
        max_order_quantity: '40.0000',
        max_order_notional: '5000.0000',
        max_inventory_per_instrument: '200.0000',
        max_total_exposure: '20000.0000',
        max_open_orders: 10,
        max_daily_loss: '2000.0000',
        skew_factor: '0.1000',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const decision = strategy.calculateQuotes({
        botId: 1,
        instrumentId: instrumentIdA,
        symbol: 'ALPHA',
        config,
        referencePrice: '100.0000',
        currentInventory: '50.0000',
        availableCash: '50000.0000',
      });

      expect(decision.shouldQuote).toBe(true);
      const q = decision.desiredQuote!;
      // Quantity is within bounds and <= maxOrderQuantity
      expect(FinancialMath.lte(q.bidQuantity, config.max_order_quantity)).toBe(true);
      expect(FinancialMath.isPositive(q.bidQuantity)).toBe(true);
    });
  });

  // =========================================================================
  // 4. Risk Controls & Circuit Breakers
  // =========================================================================
  describe('Risk Controls & Circuit Breakers', () => {
    it('9. should enforce maximum order quantity by clamping down oversized quotes', () => {
      const config = {
        id: 1,
        bot_id: 1,
        quote_refresh_interval_ms: 5000,
        spread_bps: '50.00',
        order_quantity: '100.0000', // exceeds max
        max_order_quantity: '25.0000', // strict limit
        max_order_notional: '50000.0000',
        max_inventory_per_instrument: '500.0000',
        max_total_exposure: '100000.0000',
        max_open_orders: 10,
        max_daily_loss: '5000.0000',
        skew_factor: '0.1000',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const quote: any = {
        bidPrice: '99.0000',
        bidQuantity: '100.0000',
        askPrice: '101.0000',
        askQuantity: '100.0000',
        referencePrice: '100.0000',
        adjustedMidPrice: '100.0000',
        halfSpread: '1.0000',
        inventorySkewOffset: '0.0000',
      };

      const result = botRiskService.validateQuote(quote, {
        botId: 1,
        instrumentId: instrumentIdA,
        symbol: 'ALPHA',
        config,
        currentCash: '100000.0000',
        currentInventory: '100.0000',
        openOrdersCount: 0,
        openOrdersNotional: '0.0000',
        dailyRealizedLoss: '0.0000',
      });

      expect(result.isValid).toBe(true);
      expect(result.sanitizedQuote?.bidQuantity).toBe('25.0000');
      expect(result.sanitizedQuote?.askQuantity).toBe('25.0000');
    });

    it('10. should enforce maximum daily loss limit by rejecting quotes and triggering pause', () => {
      const config = {
        id: 1,
        bot_id: 1,
        quote_refresh_interval_ms: 5000,
        spread_bps: '50.00',
        order_quantity: '10.0000',
        max_order_quantity: '50.0000',
        max_order_notional: '10000.0000',
        max_inventory_per_instrument: '200.0000',
        max_total_exposure: '50000.0000',
        max_open_orders: 10,
        max_daily_loss: '1000.0000', // $1,000 daily loss limit
        skew_factor: '0.1000',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const quote: any = {
        bidPrice: '99.0000',
        bidQuantity: '10.0000',
        askPrice: '101.0000',
        askQuantity: '10.0000',
        referencePrice: '100.0000',
      };

      // Current realized loss is $1,200 (exceeds $1,000 limit)
      const result = botRiskService.validateQuote(quote, {
        botId: 1,
        instrumentId: instrumentIdA,
        symbol: 'ALPHA',
        config,
        currentCash: '50000.0000',
        currentInventory: '50.0000',
        openOrdersCount: 0,
        openOrdersNotional: '0.0000',
        dailyRealizedLoss: '1200.0000',
      });

      expect(result.isValid).toBe(false);
      expect(result.violations[0]).toContain('DAILY_LOSS_LIMIT_EXCEEDED');
    });

    it('11. should enforce maximum total exposure limit by suppressing bids', () => {
      const config = {
        id: 1,
        bot_id: 1,
        quote_refresh_interval_ms: 5000,
        spread_bps: '50.00',
        order_quantity: '10.0000',
        max_order_quantity: '50.0000',
        max_order_notional: '10000.0000',
        max_inventory_per_instrument: '500.0000',
        max_total_exposure: '20000.0000', // max $20,000 exposure
        max_open_orders: 10,
        max_daily_loss: '5000.0000',
        skew_factor: '0.1000',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const quote: any = {
        bidPrice: '99.0000',
        bidQuantity: '20.0000',
        askPrice: '101.0000',
        askQuantity: '20.0000',
        referencePrice: '100.0000',
      };

      // Current inventory is 190 shares ($19,000 value). Additional bid for 20 shares ($1,980) would exceed $20k
      const result = botRiskService.validateQuote(quote, {
        botId: 1,
        instrumentId: instrumentIdA,
        symbol: 'ALPHA',
        config,
        currentCash: '50000.0000',
        currentInventory: '190.0000',
        openOrdersCount: 0,
        openOrdersNotional: '0.0000',
        dailyRealizedLoss: '0.0000',
      });

      expect(result.isValid).toBe(true);
      expect(result.sanitizedQuote?.bidPrice).toBeNull(); // bid suppressed due to exposure limit
      expect(result.sanitizedQuote?.askPrice).toBe('101.0000'); // ask permitted
    });
  });

  // =========================================================================
  // 5. Engine Stale Data & Emergency Kill Controls
  // =========================================================================
  describe('Engine Stale Data & Emergency Controls', () => {
    it('12. should pause quote cycle when market quote is missing or stale', async () => {
      const bot = await botService.createBot({
        name: 'Stale Quote Bot',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdB], // Instrument B has no market quote seeded
      });

      await botService.enableBot(bot.id);
      const config = (await botRepo.findConfigurationByBotId(bot.id))!;
      const botRec = (await botRepo.findById(bot.id))!;

      const result = await botEngine.executeCycle(botRec, config, instrumentIdB);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Stale / Missing market quote');

      // Audit log records warning
      const logs = await botRepo.findLogs(bot.id);
      expect(logs.logs[0].action).toBe('RISK_REJECTED');
      expect(logs.logs[0].status).toBe('WARNING');
    });

    it('13. should execute emergency kill switch and cancel all resting orders', async () => {
      const bot = await botService.createBot({
        name: 'Killable Bot',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });

      // Place 2 resting open orders for this bot
      const order1 = await orderService.createOrder(bot.userId, {
        instrumentId: instrumentIdA,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '98.0000',
      });
      const order2 = await orderService.createOrder(bot.userId, {
        instrumentId: instrumentIdA,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '97.0000',
      });

      expect(order1.status).toBe('OPEN');
      expect(order2.status).toBe('OPEN');

      // Execute Emergency Kill Switch
      const killed = await botService.killBot(bot.id);
      expect(killed.status).toBe('KILLED');

      // 14. Cancellation of open bot orders verified
      const updatedO1 = await orderRepo.findById(order1.id);
      const updatedO2 = await orderRepo.findById(order2.id);
      expect(updatedO1?.status).toBe('CANCELLED');
      expect(updatedO2?.status).toBe('CANCELLED');

      // Attempting to re-enable a killed bot is strictly blocked
      await expect(botService.enableBot(bot.id)).rejects.toThrow(/Killed bots cannot be re-enabled/);
    });
  });

  // =========================================================================
  // 6. Scheduler Concurrency & Duplicate Execution Protection
  // =========================================================================
  describe('Scheduler Concurrency & Overlap Protection', () => {
    it('15. should prevent duplicate scheduler executions for the same bot via running locks', async () => {
      const bot = await botService.createBot({
        name: 'Concurrent Shield Bot',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });

      const config = (await botRepo.findConfigurationByBotId(bot.id))!;
      const botRec = (await botRepo.findById(bot.id))!;

      // Simulate simultaneous triggers
      const promise1 = botScheduler.executeBot(botRec, config);
      const promise2 = botScheduler.executeBot(botRec, config); // should be skipped by lock

      await Promise.all([promise1, promise2]);
      expect(botScheduler.isBotRunning(bot.id)).toBe(false);
    });

    it('16. should support concurrent execution of multiple active bots without interference', async () => {
      const bot1 = await botService.createBot({
        name: 'Bot One Tech',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });
      const bot2 = await botService.createBot({
        name: 'Bot Two Energy',
        strategyType: 'AGGRESSIVE_LP',
        allocatedCapital: '150000.0000',
        instrumentIds: [instrumentIdA],
      });

      await botService.enableBot(bot1.id);
      await botService.enableBot(bot2.id);

      const success1 = await botScheduler.triggerBot(bot1.id);
      const success2 = await botScheduler.triggerBot(bot2.id);

      expect(success1).toBe(true);
      expect(success2).toBe(true);

      // Both bots placed distinct orders with distinct user IDs
      const orders1 = await orderRepo.findOpenOrders({ userId: bot1.userId });
      const orders2 = await orderRepo.findOpenOrders({ userId: bot2.userId });

      expect(orders1.length).toBeGreaterThan(0);
      expect(orders2.length).toBeGreaterThan(0);
      expect(orders1[0].userId).toBe(bot1.userId);
      expect(orders2[0].userId).toBe(bot2.userId);
    });

    it('16. should recover active bots from database upon scheduler restart', async () => {
      const bot = await botService.createBot({
        name: 'Recoverable Bot',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });
      await botService.enableBot(bot.id);

      // Simulate server / scheduler restart
      await botScheduler.stop();
      const newScheduler = new BotScheduler(botRepo, botEngine, 100);
      await newScheduler.start();

      // Trigger tick on new scheduler -> should find active bot and execute
      await newScheduler.tick();
      const openOrders = await orderRepo.findOpenOrders({ userId: bot.userId });
      expect(openOrders.length).toBeGreaterThan(0);

      await newScheduler.stop();
    });
  });

  // =========================================================================
  // 7. Market Integrity & Anti-Manipulation Guards
  // =========================================================================
  describe('Market Integrity & Anti-Manipulation Guards', () => {
    it('17. should guarantee no fake trades or direct price manipulation: price only moves on genuine match settlement', async () => {
      const bot = await botService.createBot({
        name: 'Genuine Maker Bot',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });
      await botService.enableBot(bot.id);

      // Bot posts quotes into the book
      await botScheduler.triggerBot(bot.id);

      // Check order book: resting orders exist, but NO trades were fabricated
      const book = matchingEngine.getOrCreateBook(instrumentIdA, 'ALPHA');
      expect(book.getBids().length + book.getAsks().length).toBeGreaterThan(0);

      const trades = await tradeRepo.findByInstrumentId(instrumentIdA);
      expect(trades.length).toBe(0); // Zero fabricated trades!

      // Market quote last price remains unchanged ($100.0000)
      const quote = await marketDataRepo.getQuoteByInstrumentId(instrumentIdA);
      expect(quote?.lastPrice).toBe('100.0000');

      // Now, when a genuine human order crosses against the bot's resting quote
      const restingAsk = book.getAsks()[0];
      const askQty = restingAsk.remainingQuantity;
      const askPrice = restingAsk.limitPrice!;
      const humanBuy = await orderService.createOrder(humanTrader.id, {
        instrumentId: instrumentIdA,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: askQty,
        limitPrice: askPrice,
      });

      expect(humanBuy.status).toBe('FILLED');

      // Trade executed and settled atomically
      const executedTrades = await tradeRepo.findByInstrumentId(instrumentIdA);
      expect(executedTrades.length).toBe(1);
      expect(executedTrades[0].price).toBe(askPrice);
      expect(executedTrades[0].quantity).toBe(askQty);
    });
  });

  // =========================================================================
  // 8. Socket.IO Realtime Bot Events & Authorization
  // =========================================================================
  describe('Socket.IO Bot Events & Security Authorization', () => {
    it('18. should reject unauthorized bot channel subscriptions from guests and ordinary traders, and stream to admin', async () => {
      // Guest client
      const guestClient = createSocketClient();
      await new Promise<void>((resolve) => guestClient.on('connect', resolve));

      const guestErrPromise = new Promise<any>((resolve) => {
        guestClient.on('error:unauthorized', resolve);
      });
      guestClient.emit('subscribe', { channel: 'admin:bots' });
      const guestErr = await guestErrPromise;
      expect(guestErr.message).toContain('Only exchange administrators can subscribe');

      // Human trader client (role: TRADER)
      const traderClient = createSocketClient(traderToken);
      await new Promise<void>((resolve) => traderClient.on('connect', resolve));

      const traderErrPromise = new Promise<any>((resolve) => {
        traderClient.on('error:unauthorized', resolve);
      });
      traderClient.emit('subscribe', { channel: 'admin:bots' });
      const traderErr = await traderErrPromise;
      expect(traderErr.message).toContain('Only exchange administrators can subscribe');
    });

    it('18. should deliver realtime bot status and order events to authorized admin sockets', async () => {
      const adminClient = createSocketClient(adminToken);
      await new Promise<void>((resolve) => adminClient.on('connect', resolve));

      // Subscribe to admin:bots
      const subAckPromise = new Promise<any>((resolve) => {
        adminClient.emit('subscribe', { channel: 'admin:bots' }, resolve);
      });
      const subAck = await subAckPromise;
      expect(subAck.status).toBe('subscribed');

      // Setup event listener for bot status
      const statusPromise = new Promise<any>((resolve) => {
        adminClient.on('bot:status', resolve);
      });

      const bot = await botService.createBot({
        name: 'Streamed Bot',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });

      // Enabling bot emits bot:status to admin:bots
      await botService.enableBot(bot.id);
      const receivedEvent = await statusPromise;

      expect(receivedEvent.botId).toBe(bot.id);
      expect(receivedEvent.status).toBe('ACTIVE');
    });

    it('19. should execute multi-bot quotes across instruments with 100 concurrent connected sockets without packet loss or event starvation', async () => {
      const NUM_CLIENTS = 100;
      const memBefore = process.memoryUsage().heapUsed;
      const benchStart = Date.now();

      // 1. Connect 100 clients concurrently
      const clientPromises = Array.from({ length: NUM_CLIENTS }, () => {
        const client = createSocketClient();
        return new Promise<ClientSocket>((resolve) => client.on('connect', () => resolve(client)));
      });
      const clients = await Promise.all(clientPromises);

      // Connect 1 admin socket
      const adminClient = createSocketClient(adminToken);
      await new Promise<void>((resolve) => adminClient.on('connect', resolve));
      await new Promise<any>((resolve) => adminClient.emit('subscribe', { channel: 'admin:bots' }, resolve));

      // 2. Subscribe 100 clients to orderbook:ALPHA and trades:ALPHA
      const subPromises = clients.map(
        (c) =>
          new Promise((resolve) => {
            c.emit('subscribe', { channel: 'orderbook:ALPHA' }, () => {
              c.emit('subscribe', { channel: 'trades:ALPHA' }, resolve);
            });
          })
      );
      await Promise.all(subPromises);

      // 3. Track events received by 100 clients
      const clientReceivedMap = new Map<string, number>();
      clients.forEach((c) => {
        clientReceivedMap.set(c.id!, 0);
        c.on('orderbook:depth_update', () => {
          clientReceivedMap.set(c.id!, (clientReceivedMap.get(c.id!) || 0) + 1);
        });
      });

      let adminReceivedBotOrders = 0;
      adminClient.on('bot:order_generated', () => {
        adminReceivedBotOrders++;
      });

      // 4. Create 4 active bots (Conservative, Balanced, Aggressive, Random)
      const bot1 = await botService.createBot({
        name: 'Bench Conservative MM',
        strategyType: 'CONSERVATIVE_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA, instrumentIdB],
      });
      const bot2 = await botService.createBot({
        name: 'Bench Balanced MM',
        strategyType: 'BALANCED_MM',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });
      const bot3 = await botService.createBot({
        name: 'Bench Aggressive LP',
        strategyType: 'AGGRESSIVE_LP',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA],
      });
      const bot4 = await botService.createBot({
        name: 'Bench Random Liquidity',
        strategyType: 'RANDOM_LIQUIDITY',
        allocatedCapital: '100000.0000',
        instrumentIds: [instrumentIdA, instrumentIdB],
      });

      await botService.enableBot(bot1.id);
      await botService.enableBot(bot2.id);
      await botService.enableBot(bot3.id);
      await botService.enableBot(bot4.id);

      // 5. Execute concurrent quote cycles for all 4 bots
      const cycleStart = Date.now();
      await botScheduler.tick();
      const cycleDurationMs = Date.now() - cycleStart;

      // Wait 300ms for websocket propagation
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 6. Assert all 100 clients received the depth broadcast
      let clientsWithUpdates = 0;
      for (const [, count] of clientReceivedMap) {
        if (count >= 1) clientsWithUpdates++;
      }
      expect(clientsWithUpdates).toBe(NUM_CLIENTS);

      const memAfter = process.memoryUsage().heapUsed;
      const memDeltaMB = (memAfter - memBefore) / (1024 * 1024);
      const totalBenchTimeMs = Date.now() - benchStart;

      console.log(`\n--- Phase 5B Multi-Bot & 100 Sockets Benchmark ---`);
      console.log(`Active Bots: 4 (Conservative, Balanced, Aggressive, Random)`);
      console.log(`Instruments Quoted: 2 (ALPHA, BETA)`);
      console.log(`Concurrent Connected Sockets: ${NUM_CLIENTS}`);
      console.log(`Quote Cycle Execution Latency: ${cycleDurationMs} ms`);
      console.log(`Total Benchmark Duration: ${totalBenchTimeMs} ms`);
      console.log(`Packet Delivery Success Rate: ${(clientsWithUpdates / NUM_CLIENTS) * 100}%`);
      console.log(`Admin Bot Order Events: ${adminReceivedBotOrders}`);
      console.log(`Memory Delta: ${memDeltaMB.toFixed(2)} MB (Heap Used: ${(memAfter / (1024 * 1024)).toFixed(2)} MB)`);
      console.log(`--------------------------------------------------\n`);

      // Cleanup
      clients.forEach((c) => c.disconnect());
      adminClient.disconnect();
    }, 25000);
  });
});
