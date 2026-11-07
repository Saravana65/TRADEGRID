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
} from './mocks/in-memory-repositories';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { OrderReservationService } from '../src/modules/orders/order-reservation.service';
import { SettlementService } from '../src/modules/matching/settlement.service';
import { MatchingEngine } from '../src/modules/matching/matching-engine';
import { OrderService } from '../src/modules/orders/order.service';
import { OrderBookRecoveryService } from '../src/modules/matching/order-book-recovery.service';
import {
  OrderBookDepthUpdateEvent,
  OrderBookSnapshotEvent,
  TradeTapeUpdateEvent,
  PrivateTradeExecutedEvent,
  OrderLifecycleEvent,
} from '@tradegrid/shared-types';

describe('Phase 5A.1: Financial Reliability & Hardened Matching Integration', () => {
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

  // Services
  let walletService: WalletService;
  let reservationService: OrderReservationService;
  let settlementService: SettlementService;
  let matchingEngine: MatchingEngine;
  let orderService: OrderService;
  let recoveryService: OrderBookRecoveryService;

  // Test Traders
  const buyer = { id: 201, email: 'buyer@tradegrid.internal', username: 'trader_buyer', role: 'TRADER' as const };
  const seller = { id: 202, email: 'seller@tradegrid.internal', username: 'trader_seller', role: 'TRADER' as const };
  const bystander = { id: 203, email: 'bystander@tradegrid.internal', username: 'trader_bystander', role: 'TRADER' as const };

  let buyerToken: string;
  let sellerToken: string;
  let bystanderToken: string;

  let instrumentAId: number;
  let instrumentBId: number;

  beforeAll(() => {
    buyerToken = generateTokens(buyer).accessToken;
    sellerToken = generateTokens(seller).accessToken;
    bystanderToken = generateTokens(bystander).accessToken;
  });

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();

    const mockKnex = {
      transaction: async (cb: any) => cb({}),
    } as any;

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
    instrumentAId = instA.id;

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
    instrumentBId = instB.id;

    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);
    orderRepo = new InMemoryOrderRepository();
    tradeRepo = new InMemoryTradeRepository();
    positionRepo = new InMemoryPositionRepository();

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
    recoveryService = new OrderBookRecoveryService(
      orderRepo,
      instrumentRepo,
      matchingEngine,
      realtimeService
    );

    // Initial funding
    await walletService.createWalletForUser(buyer.id, '200000.0000');
    await walletService.createWalletForUser(seller.id, '100000.0000');
    await walletService.createWalletForUser(bystander.id, '50000.0000');

    // Provide seller with initial stock position for ALPHA and BETA
    await positionRepo.upsertPosition({
      user_id: seller.id,
      instrument_id: instrumentAId,
      quantity: '500.0000',
      average_buy_price: '100.0000',
      realized_pnl: '0.0000',
    });
    await positionRepo.upsertPosition({
      user_id: seller.id,
      instrument_id: instrumentBId,
      quantity: '500.0000',
      average_buy_price: '50.0000',
      realized_pnl: '0.0000',
    });

    // Start HTTP Server with Socket.IO
    const app = createApp({ customCheckDb: async () => true });
    server = http.createServer(app);
    initWebSocket(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const client of activeClients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    activeClients = [];

    await closeWebSocket();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    matchingEngine.clearAllBooks();
  });

  function createClient(token?: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = Client(serverUrl, {
        auth: token ? { token } : undefined,
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
      });

      activeClients.push(client);

      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  }

  // =========================================================================
  // 1. Transaction Boundaries & Deferred Outbox Event Safety
  // =========================================================================
  describe('Transaction Boundaries & Post-Commit Publishing', () => {
    it('should emit order:accepted only after order is committed to database', async () => {
      const buyerSocket = await createClient(buyerToken);
      const events: OrderLifecycleEvent[] = [];
      buyerSocket.on('order:accepted', (e) => events.push(e));

      const order = await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.00',
      });

      await new Promise((r) => setTimeout(r, 60));

      const dbOrder = await orderRepo.findById(order.id);
      expect(dbOrder).toBeDefined();
      expect(dbOrder?.status).toBe('OPEN');
      expect(events.length).toBe(1);
      expect(events[0].order.id).toBe(order.id);
    });

    it('should not emit false trade events or corrupt in-memory book when settlement fails', async () => {
      const buyerSocket = await createClient(buyerToken);
      const tapeUpdates: TradeTapeUpdateEvent[] = [];
      const privateTrades: PrivateTradeExecutedEvent[] = [];

      buyerSocket.on('trade:tape_update', (e) => tapeUpdates.push(e));
      buyerSocket.on('trade:executed', (e) => privateTrades.push(e));

      // 1. Resting seller: 10 shares @ $150
      await orderService.createOrder(seller.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '150.00',
      });

      const book = matchingEngine.getOrCreateBook(instrumentAId, 'ALPHA');
      expect(book.getAsks().length).toBe(1);

      // 2. Buyer attempts to match, but we simulate a settlement error (e.g. database failure)
      const originalSettle = settlementService.settleTrade;
      settlementService.settleTrade = async () => {
        throw new Error('SIMULATED_DATABASE_SETTLEMENT_CRASH');
      };

      try {
        await orderService.createOrder(buyer.id, {
          instrumentId: instrumentAId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '150.00',
        });
      } finally {
        settlementService.settleTrade = originalSettle;
      }

      await new Promise((r) => setTimeout(r, 60));

      // CRITICAL CHECK: In-memory book must NOT lose the resting seller!
      expect(book.getAsks().length).toBe(1);
      expect(book.getAsks()[0].remainingQuantity).toBe('10.0000');

      // Zero false trade events emitted
      expect(tapeUpdates.length).toBe(0);
      expect(privateTrades.length).toBe(0);
    });
  });

  // =========================================================================
  // 2. Financial Precision & Exact Decimal Math
  // =========================================================================
  describe('Financial Precision & Exact Decimal Math', () => {
    it('should handle fractional quantities and prices without IEEE 754 precision drift', async () => {
      // Seller places 0.3333 shares @ $133.3333
      const sellOrder = await orderService.createOrder(seller.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '0.3333',
        limitPrice: '133.3333',
      });

      // Buyer places matching buy
      const buyOrder = await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '0.3333',
        limitPrice: '133.3333',
      });

      expect(buyOrder.status).toBe('FILLED');
      expect(buyOrder.remainingQuantity).toBe('0.0000');

      const trades = await tradeRepo.findByOrderId(buyOrder.id);
      expect(trades.length).toBe(1);

      // Exact Decimal: 0.3333 * 133.3333 = 44.43998889 -> rounded to 4 decimals = 44.4400
      const expectedAmount = FinancialMath.calcTradeAmount('133.3333', '0.3333');
      expect(trades[0].trade_amount).toBe(expectedAmount);
    });

    it('should maintain exact wallet and ledger balance consistency across 10 repeated partial fills', async () => {
      // Resting Seller: 10.0000 shares @ $100.0000 ($1000 total)
      await orderService.createOrder(seller.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.0000',
      });

      const buyerInitialBalance = '200000.0000';
      const sellerInitialBalance = '100000.0000';

      // Execute 10 consecutive partial fills of 1.0000 share each
      for (let i = 0; i < 10; i++) {
        await orderService.createOrder(buyer.id, {
          instrumentId: instrumentAId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '1.0000',
          limitPrice: '100.0000',
        });
      }

      const buyerWallet = await walletRepo.findByUserId(buyer.id);
      const sellerWallet = await walletRepo.findByUserId(seller.id);

      // Buyer should have paid exactly $1000.0000; seller should have received exactly $1000.0000
      expect(buyerWallet?.available_balance).toBe('199000.0000');
      expect(sellerWallet?.available_balance).toBe('101000.0000');

      // Verify double-entry ledger balance strictly matches wallet balance
      const buyerAccount = await ledgerRepo.findOrCreateAccount('USER_WALLET', buyer.id, 'USD');
      const sellerAccount = await ledgerRepo.findOrCreateAccount('USER_WALLET', seller.id, 'USD');
      const buyerLedgerBal = await ledgerRepo.calculateAccountBalanceFromLedger(buyerAccount.id);
      const sellerLedgerBal = await ledgerRepo.calculateAccountBalanceFromLedger(sellerAccount.id);

      expect(buyerLedgerBal).toBe(buyerWallet?.available_balance);
      expect(sellerLedgerBal).toBe(sellerWallet?.available_balance);

      // Verify trial balance: Debits === Credits
      let totalDebits = new Decimal(0);
      let totalCredits = new Decimal(0);
      for (const entry of (ledgerRepo as InMemoryLedgerRepository).entries) {
        if (entry.entry_type === 'DEBIT') totalDebits = totalDebits.plus(entry.amount);
        else totalCredits = totalCredits.plus(entry.amount);
      }
      expect(totalDebits.toFixed(4)).toBe(totalCredits.toFixed(4));
    });

    it('should compute weighted-average cost basis and realized P&L with exact Decimal precision', async () => {
      // Step 1: Buyer buys 10 shares @ $100
      await orderService.createOrder(seller.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.0000',
      });
      await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.0000',
      });

      let buyerPos = await positionRepo.findByUserAndInstrument(buyer.id, instrumentAId);
      expect(buyerPos?.quantity).toBe('10.0000');
      expect(buyerPos?.average_buy_price).toBe('100.0000');

      // Step 2: Buyer buys another 10 shares @ $120 -> New Average = (1000 + 1200) / 20 = $110.0000
      await orderService.createOrder(seller.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '120.0000',
      });
      await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '120.0000',
      });

      buyerPos = await positionRepo.findByUserAndInstrument(buyer.id, instrumentAId);
      expect(buyerPos?.quantity).toBe('20.0000');
      expect(buyerPos?.average_buy_price).toBe('110.0000');

      // Step 3: Buyer sells 15 shares @ $140
      // Realized P&L = (140 - 110) * 15 = $450.0000
      // Remaining shares = 5.0000
      await orderService.createOrder(bystander.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '15.0000',
        limitPrice: '140.0000',
      });
      await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '15.0000',
        limitPrice: '140.0000',
      });

      buyerPos = await positionRepo.findByUserAndInstrument(buyer.id, instrumentAId);
      expect(buyerPos?.quantity).toBe('5.0000');
      expect(buyerPos?.average_buy_price).toBe('110.0000');
      expect(buyerPos?.realized_pnl).toBe('450.0000');
    });
  });

  // =========================================================================
  // 3. Concurrency Protection & Per-Instrument Serialization
  // =========================================================================
  describe('Matching Engine Concurrency & Per-Instrument Serialization', () => {
    it('should process concurrent orders on the same instrument sequentially preserving FIFO priority', async () => {
      // Place a resting ask: 50 shares @ $100
      await orderService.createOrder(seller.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '50.0000',
        limitPrice: '100.0000',
      });

      // Submit 5 concurrent buy orders of 10 shares each simultaneously
      const results = await Promise.all([
        orderService.createOrder(buyer.id, { instrumentId: instrumentAId, side: 'BUY', orderType: 'LIMIT', quantity: '10.0000', limitPrice: '100.0000' }),
        orderService.createOrder(buyer.id, { instrumentId: instrumentAId, side: 'BUY', orderType: 'LIMIT', quantity: '10.0000', limitPrice: '100.0000' }),
        orderService.createOrder(buyer.id, { instrumentId: instrumentAId, side: 'BUY', orderType: 'LIMIT', quantity: '10.0000', limitPrice: '100.0000' }),
        orderService.createOrder(buyer.id, { instrumentId: instrumentAId, side: 'BUY', orderType: 'LIMIT', quantity: '10.0000', limitPrice: '100.0000' }),
        orderService.createOrder(buyer.id, { instrumentId: instrumentAId, side: 'BUY', orderType: 'LIMIT', quantity: '10.0000', limitPrice: '100.0000' }),
      ]);

      // All 5 orders must be completely filled without race conditions
      for (const res of results) {
        expect(res.status).toBe('FILLED');
        expect(res.remainingQuantity).toBe('0.0000');
      }

      // Order book ask must be completely filled
      const book = matchingEngine.getOrCreateBook(instrumentAId, 'ALPHA');
      expect(book.getAsks().length).toBe(0);
    });

    it('should execute concurrent orders for different instruments in parallel without blocking', async () => {
      // Instrument A order & Instrument B order submitted simultaneously
      const [orderA, orderB] = await Promise.all([
        orderService.createOrder(seller.id, { instrumentId: instrumentAId, side: 'SELL', orderType: 'LIMIT', quantity: '10.0000', limitPrice: '100.0000' }),
        orderService.createOrder(seller.id, { instrumentId: instrumentBId, side: 'SELL', orderType: 'LIMIT', quantity: '20.0000', limitPrice: '50.0000' }),
      ]);

      expect(orderA.instrumentId).toBe(instrumentAId);
      expect(orderB.instrumentId).toBe(instrumentBId);

      const bookA = matchingEngine.getOrCreateBook(instrumentAId, 'ALPHA');
      const bookB = matchingEngine.getOrCreateBook(instrumentBId, 'BETA');

      expect(bookA.getAsks().length).toBe(1);
      expect(bookB.getAsks().length).toBe(1);
    });
  });

  // =========================================================================
  // 4. Price-Time Priority & Self-Trade Prevention
  // =========================================================================
  describe('Price-Time Priority & Wash Trading Prevention', () => {
    it('should break price ties by earliest arrival (FIFO priority)', async () => {
      const book = matchingEngine.getOrCreateBook(instrumentAId, 'ALPHA');

      // Seller 1 places 10 shares @ $150
      const order1 = await orderService.createOrder(seller.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '150.0000',
      });

      // Seller 2 places 10 shares @ $150 slightly later
      const order2 = await orderService.createOrder(seller.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '150.0000',
      });

      // Buyer places 10 shares @ $150: MUST match Order 1, leaving Order 2 resting
      await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '150.0000',
      });

      const o1 = await orderRepo.findById(order1.id);
      const o2 = await orderRepo.findById(order2.id);

      expect(o1?.status).toBe('FILLED');
      expect(o2?.status).toBe('OPEN');
      expect(book.getAsks().length).toBe(1);
      expect(book.getAsks()[0].id).toBe(order2.id);
    });

    it('should prevent self-trading when a user attempts to match against their own resting order', async () => {
      // Buyer places resting limit buy: 10 shares @ $100
      const restingBuy = await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.0000',
      });

      // Buyer attempts to place aggressive limit sell matching own order
      const selfSell = await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.0000',
      });

      // Self trade prevented: both orders must not trade against each other
      const bOrder = await orderRepo.findById(restingBuy.id);
      expect(bOrder?.status).toBe('OPEN');
      expect(bOrder?.remainingQuantity).toBe('10.0000');

      const trades = await tradeRepo.findByOrderId(restingBuy.id);
      expect(trades.length).toBe(0);
    });
  });

  // =========================================================================
  // 5. Order Cancellation & Reservation Guarantees
  // =========================================================================
  describe('Order Cancellation & Risk Reservation Controls', () => {
    it('should reject an order attempting to spend more cash than uncommitted available balance', async () => {
      // Buyer has $200,000. Commit $150,000 into a resting limit buy
      await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '1500.0000',
        limitPrice: '100.0000',
      });

      // Attempting to place an additional BUY for $60,000 ($150,000 + $60,000 = $210,000 > $200,000)
      await expect(
        orderService.createOrder(buyer.id, {
          instrumentId: instrumentAId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '600.0000',
          limitPrice: '100.0000',
        })
      ).rejects.toThrow(/Insufficient virtual funds/);
    });

    it('should safely cancel an open order and release committed cash for subsequent orders', async () => {
      // Buyer has $200,000. Commit $150,000 into a resting limit buy
      const order = await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '1500.0000',
        limitPrice: '100.0000',
      });

      // Cancel the order
      const cancelled = await orderService.cancelOrder(buyer.id, order.id);
      expect(cancelled.status).toBe('CANCELLED');

      // In-memory book must remove the cancelled order
      const book = matchingEngine.getOrCreateBook(instrumentAId, 'ALPHA');
      expect(book.getBids().length).toBe(0);

      // Now the buyer can successfully place an order using the released cash
      const newOrder = await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '1800.0000',
        limitPrice: '100.0000',
      });
      expect(newOrder.id).toBeDefined();
    });

    it('should prevent cancellation of an already filled order', async () => {
      await orderService.createOrder(seller.id, {
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.0000',
      });

      const buyOrder = await orderService.createOrder(buyer.id, {
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.0000',
      });

      expect(buyOrder.status).toBe('FILLED');

      await expect(orderService.cancelOrder(buyer.id, buyOrder.id)).rejects.toThrow(/already been filled/);
    });
  });

  // =========================================================================
  // 6. Deterministic Order Book Recovery from Database
  // =========================================================================
  describe('Deterministic Order Book Recovery from Database', () => {
    it('should completely recover all open and partially filled limit orders on server restart', async () => {
      // Seed orders directly into persistent database
      await orderRepo.create({
        userId: seller.id,
        instrumentId: instrumentAId,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '20.0000',
        remainingQuantity: '15.0000', // Partially filled
        limitPrice: '150.0000',
        status: 'PARTIALLY_FILLED',
      });

      await orderRepo.create({
        userId: buyer.id,
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '30.0000',
        remainingQuantity: '30.0000',
        limitPrice: '140.0000',
        status: 'OPEN',
      });

      // Exclude filled and cancelled orders
      await orderRepo.create({
        userId: buyer.id,
        instrumentId: instrumentAId,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        remainingQuantity: '0.0000',
        limitPrice: '130.0000',
        status: 'FILLED',
      });

      // Simulate clean server restart: clear all in-memory state
      matchingEngine.clearAllBooks();
      expect(matchingEngine.getOrCreateBook(instrumentAId, 'ALPHA').getAsks().length).toBe(0);

      // Execute deterministic recovery procedure
      const summary = await recoveryService.recoverAllBooks();
      expect(summary.totalRecovered).toBe(2);

      const recoveredBook = matchingEngine.getOrCreateBook(instrumentAId, 'ALPHA');
      expect(recoveredBook.getAsks().length).toBe(1);
      expect(recoveredBook.getAsks()[0].remainingQuantity).toBe('15.0000');
      expect(recoveredBook.getBids().length).toBe(1);
      expect(recoveredBook.getBids()[0].remainingQuantity).toBe('30.0000');
    });
  });
});
