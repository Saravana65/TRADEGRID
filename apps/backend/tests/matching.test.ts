import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { generateTokens } from '../src/utils/jwt';
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
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { UsersController } from '../src/modules/users/users.controller';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { WalletController } from '../src/modules/wallet/wallet.controller';
import { InstrumentService } from '../src/modules/market/instrument.service';
import { InstrumentController } from '../src/modules/market/instrument.controller';
import { MarketDataService } from '../src/modules/market/market-data.service';
import { MarketDataController } from '../src/modules/market/market-data.controller';
import { OrderService } from '../src/modules/orders/order.service';
import { OrderController } from '../src/modules/orders/order.controller';
import { OrderReservationService } from '../src/modules/orders/order-reservation.service';
import { TradeService } from '../src/modules/trading/trade.service';
import { TradeController } from '../src/modules/trading/trade.controller';
import { PortfolioService } from '../src/modules/portfolio/portfolio.service';
import { PortfolioController } from '../src/modules/portfolio/portfolio.controller';
import { OrderBook } from '../src/modules/matching/order-book';
import { MatchingEngine } from '../src/modules/matching/matching-engine';
import { SettlementService } from '../src/modules/matching/settlement.service';

describe('Phase 4B: Continuous Matching Engine, Trade Execution & Atomic Settlement', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let orderRepo: InMemoryOrderRepository;
  let tradeRepo: InMemoryTradeRepository;
  let positionRepo: InMemoryPositionRepository;

  let walletService: WalletService;
  let reservationService: OrderReservationService;
  let settlementService: SettlementService;
  let matchingEngine: MatchingEngine;
  let orderService: OrderService;
  let tradeService: TradeService;
  let portfolioService: PortfolioService;
  let marketDataService: MarketDataService;

  let app: any;

  // Test Traders
  const traderBuyer = { id: 10, email: 'buyer@tradegrid.internal', username: 'trader_buyer', role: 'TRADER' as const };
  const traderSeller1 = { id: 20, email: 'seller1@tradegrid.internal', username: 'trader_seller1', role: 'TRADER' as const };
  const traderSeller2 = { id: 30, email: 'seller2@tradegrid.internal', username: 'trader_seller2', role: 'TRADER' as const };

  let buyerToken: string;
  let seller1Token: string;
  let seller2Token: string;
  let tgridId: number;

  const mockKnex = {
    transaction: async (callback: any) => callback({}),
    fn: { now: () => new Date() },
  } as any;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    // Provision Tradable Instrument: TGRID ($142.50)
    await instrumentRepo.create({
      symbol: 'TGRID',
      name: 'TradeGrid Technologies',
      exchange: 'TRADEGRID',
      sector: 'Technology',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
    });

    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);
    orderRepo = new InMemoryOrderRepository();
    tradeRepo = new InMemoryTradeRepository();
    positionRepo = new InMemoryPositionRepository();

    walletService = new WalletService(walletRepo, ledgerRepo, mockKnex);
    reservationService = new OrderReservationService(walletRepo, ledgerRepo);

    settlementService = new SettlementService(
      orderRepo,
      walletRepo,
      ledgerRepo,
      tradeRepo,
      positionRepo,
      marketDataRepo,
      mockKnex
    );

    matchingEngine = new MatchingEngine(settlementService);

    orderService = new OrderService(
      orderRepo,
      instrumentRepo,
      marketDataRepo,
      reservationService,
      matchingEngine,
      mockKnex
    );

    tradeService = new TradeService(tradeRepo, instrumentRepo);
    portfolioService = new PortfolioService(positionRepo, walletRepo, instrumentRepo, marketDataRepo);
    marketDataService = new MarketDataService(marketDataRepo, instrumentRepo, undefined, matchingEngine, tradeService);

    // Provision User Wallets with Virtual Capital
    await walletService.createWalletForUser(traderBuyer.id, '100000.0000');
    await walletService.createWalletForUser(traderSeller1.id, '50000.0000');
    await walletService.createWalletForUser(traderSeller2.id, '50000.0000');

    // Initialize Tokens
    buyerToken = generateTokens(traderBuyer).accessToken;
    seller1Token = generateTokens(traderSeller1).accessToken;
    seller2Token = generateTokens(traderSeller2).accessToken;

    const tgridInst = await instrumentRepo.findBySymbol('TGRID');
    tgridId = tgridInst!.id;
    matchingEngine.clearAllBooks();

    // Create Express App with Injected Controllers
    const authService = new AuthService(userRepo, sessionRepo, walletService);
    const authController = new AuthController(authService);
    const usersController = new UsersController(userRepo);
    const walletController = new WalletController(walletService);
    const instrumentService = new InstrumentService(instrumentRepo);
    const instrumentController = new InstrumentController(instrumentService);
    const marketDataController = new MarketDataController(marketDataService);
    const orderController = new OrderController(orderService);
    const tradeController = new TradeController(tradeService);
    const portfolioController = new PortfolioController(portfolioService);

    app = createApp({
      authController,
      usersController,
      walletController,
      instrumentController,
      marketDataController,
      orderController,
      tradeController,
      portfolioController,
      customCheckDb: async () => true,
    });
  });

  // ==========================================================================
  // 1. Order Book & Price-Time Priority (FIFO)
  // ==========================================================================
  describe('Limit Order Book & Price-Time Priority', () => {
    it('should correctly prioritize bids by highest price first', () => {
      const book = new OrderBook(1, 'TGRID');

      book.addOrder({
        id: 1,
        userId: 1,
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        remainingQuantity: '10.0000',
        limitPrice: '100.0000',
        status: 'OPEN',
        idempotencyKey: null,
        createdAt: new Date('2026-01-01T10:00:00Z').toISOString(),
        updatedAt: new Date().toISOString(),
      });

      book.addOrder({
        id: 2,
        userId: 2,
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '5.0000',
        remainingQuantity: '5.0000',
        limitPrice: '105.0000', // Higher price
        status: 'OPEN',
        idempotencyKey: null,
        createdAt: new Date('2026-01-01T10:01:00Z').toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const bestBid = book.getBestBid();
      expect(bestBid).toBeDefined();
      expect(bestBid?.id).toBe(2);
      expect(bestBid?.limitPrice).toBe('105.0000');
    });

    it('should break price ties by earliest timestamp (FIFO)', () => {
      const book = new OrderBook(1, 'TGRID');

      // Order A placed at 10:00:00 for $100
      book.addOrder({
        id: 101,
        userId: 1,
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        remainingQuantity: '10.0000',
        limitPrice: '100.0000',
        status: 'OPEN',
        idempotencyKey: null,
        createdAt: new Date('2026-01-01T10:00:00Z').toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Order B placed at 10:00:05 for same $100
      book.addOrder({
        id: 102,
        userId: 2,
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        remainingQuantity: '10.0000',
        limitPrice: '100.0000',
        status: 'OPEN',
        idempotencyKey: null,
        createdAt: new Date('2026-01-01T10:00:05Z').toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const bestBid = book.getBestBid();
      expect(bestBid?.id).toBe(101); // Earlier order gets priority
    });

    it('should correctly prioritize asks by lowest price first', () => {
      const book = new OrderBook(1, 'TGRID');

      book.addOrder({
        id: 201,
        userId: 1,
        instrumentId: 1,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        remainingQuantity: '10.0000',
        limitPrice: '110.0000',
        status: 'OPEN',
        idempotencyKey: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      book.addOrder({
        id: 202,
        userId: 2,
        instrumentId: 1,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        remainingQuantity: '10.0000',
        limitPrice: '108.0000', // Lower ask price
        status: 'OPEN',
        idempotencyKey: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const bestAsk = book.getBestAsk();
      expect(bestAsk?.id).toBe(202);
      expect(bestAsk?.limitPrice).toBe('108.0000');
    });
  });

  // ==========================================================================
  // 2. Buy/Sell Matching, Partial Fills, and Multiple Counterparties
  // ==========================================================================
  describe('Continuous Order Matching & Partial Executions', () => {
    it('should match an incoming BUY order against a resting SELL order and execute trade', async () => {
      // 1. Seller posts resting limit sell: 10 shares @ $100
      const sellRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });
      expect(sellRes.status).toBe(201);
      expect(sellRes.body.data.status).toBe('OPEN');

      // 2. Buyer posts aggressive limit buy: 10 shares @ $100
      const buyRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });
      expect(buyRes.status).toBe(201);

      // Both orders should be FILLED
      expect(buyRes.body.data.status).toBe('FILLED');
      expect(buyRes.body.data.remainingQuantity).toBe('0.0000');

      const sellerOrder = await orderRepo.findById(sellRes.body.data.id);
      expect(sellerOrder?.status).toBe('FILLED');
      expect(sellerOrder?.remainingQuantity).toBe('0.0000');

      // Verify Trade Execution Record Created
      const trades = await tradeRepo.findByInstrumentId(tgridId);
      expect(trades.length).toBe(1);
      expect(trades[0].price).toBe('100.0000');
      expect(trades[0].quantity).toBe('10.0000');
      expect(trades[0].trade_amount).toBe('1000.0000');
      expect(trades[0].buyer_id).toBe(traderBuyer.id);
      expect(trades[0].seller_id).toBe(traderSeller1.id);
    });

    it('should support partial fills when order sizes differ', async () => {
      // 1. Seller posts 15 shares @ $102
      const sellRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '15.0000',
          limitPrice: '102.0000',
        });
      expect(sellRes.status).toBe(201);

      // 2. Buyer buys 10 shares @ $102
      const buyRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '102.0000',
        });
      expect(buyRes.status).toBe(201);

      // Buyer order is FILLED
      expect(buyRes.body.data.status).toBe('FILLED');
      expect(buyRes.body.data.remainingQuantity).toBe('0.0000');

      // Seller order is PARTIALLY_FILLED (5 remaining)
      const sellerOrder = await orderRepo.findById(sellRes.body.data.id);
      expect(sellerOrder?.status).toBe('PARTIALLY_FILLED');
      expect(sellerOrder?.remainingQuantity).toBe('5.0000');
    });

    it('should match a single order against multiple counterparties across price levels', async () => {
      // Seller 1 offers 5 shares @ $100
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '5.0000',
          limitPrice: '100.0000',
        });

      // Seller 2 offers 10 shares @ $101
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller2Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '101.0000',
        });

      // Buyer submits BUY 12 shares @ $101 (sweeps Seller 1 for 5 @ 100, then Seller 2 for 7 @ 101)
      const buyRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '12.0000',
          limitPrice: '101.0000',
        });

      expect(buyRes.status).toBe(201);
      expect(buyRes.body.data.status).toBe('FILLED');

      // Verify 2 separate trades executed
      const trades = await tradeRepo.findByInstrumentId(tgridId);
      expect(trades.length).toBe(2);

      // First execution: 5 shares @ $100 from Seller 1
      expect(trades[0].seller_id).toBe(traderSeller1.id);
      expect(trades[0].quantity).toBe('5.0000');
      expect(trades[0].price).toBe('100.0000');

      // Second execution: 7 shares @ $101 from Seller 2
      expect(trades[1].seller_id).toBe(traderSeller2.id);
      expect(trades[1].quantity).toBe('7.0000');
      expect(trades[1].price).toBe('101.0000');
    });

    it('should not match when buyer limit price is below seller limit price', async () => {
      // Seller offers @ $105
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '105.0000',
        });

      // Buyer bids @ $102 (below ask)
      const buyRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '102.0000',
        });

      expect(buyRes.status).toBe(201);
      expect(buyRes.body.data.status).toBe('OPEN');

      // No trades executed
      const trades = await tradeRepo.findByInstrumentId(tgridId);
      expect(trades.length).toBe(0);
    });

    it('should prevent wash trading (self-matching)', async () => {
      // Buyer places sell order
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      // Same user places buy order matching own price
      const buyRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      expect(buyRes.status).toBe(201);
      // Wash trade prevented: order rests open instead of executing against self
      expect(buyRes.body.data.status).toBe('OPEN');

      const trades = await tradeRepo.findByInstrumentId(tgridId);
      expect(trades.length).toBe(0);
    });
  });

  // ==========================================================================
  // 3. Atomic Settlement & Double-Entry Ledger Invariants
  // ==========================================================================
  describe('Atomic Settlement & Accounting Invariants', () => {
    it('should correctly transfer funds, update balances, and maintain ledger debits = credits', async () => {
      const buyerInitialWallet = await walletRepo.findByUserId(traderBuyer.id);
      const sellerInitialWallet = await walletRepo.findByUserId(traderSeller1.id);

      const initialBuyerBalance = parseFloat(buyerInitialWallet!.available_balance);
      const initialSellerBalance = parseFloat(sellerInitialWallet!.available_balance);

      // Trade: 10 shares @ $100 -> Cost = $1,000.0000
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      // Verify Buyer Balance Decremented by $1000
      const buyerUpdatedWallet = await walletRepo.findByUserId(traderBuyer.id);
      expect(parseFloat(buyerUpdatedWallet!.available_balance)).toBe(initialBuyerBalance - 1000);

      // Verify Seller Balance Incremented by $1000
      const sellerUpdatedWallet = await walletRepo.findByUserId(traderSeller1.id);
      expect(parseFloat(sellerUpdatedWallet!.available_balance)).toBe(initialSellerBalance + 1000);

      // Verify Buyer Summary is fully consistent with ledger
      const summary = await walletService.getWalletSummary(traderBuyer.id);
      expect(summary.isConsistentWithLedger).toBe(true);

      // Verify Portfolio Position: Buyer received 10 shares @ $100 avg
      const buyerPos = await positionRepo.findByUserAndInstrument(traderBuyer.id, tgridId);
      expect(buyerPos).toBeDefined();
      expect(buyerPos?.quantity).toBe('10.0000');
      expect(buyerPos?.average_buy_price).toBe('100.0000');
    });

    it('should update weighted average cost basis when buyer accumulates shares at multiple prices', async () => {
      // Seller 1 sells 10 shares @ $100
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      // Buyer buys 10 shares @ $100 (Position: 10 @ $100)
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      // Seller 2 sells 10 shares @ $110
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller2Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '110.0000',
        });

      // Buyer buys another 10 shares @ $110
      // Total: 20 shares, Total Cost: $1,000 + $1,100 = $2,100 -> Avg = $105.0000
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '110.0000',
        });

      const buyerPos = await positionRepo.findByUserAndInstrument(traderBuyer.id, tgridId);
      expect(buyerPos?.quantity).toBe('20.0000');
      expect(buyerPos?.average_buy_price).toBe('105.0000');
    });

    it('should calculate realized profit and loss when seller closes position', async () => {
      // 1. Give Seller 1 initial position: 10 shares @ $90 average cost
      await positionRepo.upsertPosition({
        user_id: traderSeller1.id,
        instrument_id: tgridId,
        quantity: '10.0000',
        average_buy_price: '90.0000',
        realized_pnl: '0.0000',
      });

      // 2. Seller 1 sells 10 shares @ $100
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      // 3. Buyer buys 10 shares @ $100
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      // Realized Gain = (100 - 90) * 10 = $100.0000
      const sellerPos = await positionRepo.findByUserAndInstrument(traderSeller1.id, tgridId);
      expect(sellerPos?.quantity).toBe('0.0000');
      expect(parseFloat(sellerPos?.realized_pnl || '0')).toBe(100);
    });
  });

  // ==========================================================================
  // 4. Order Cancellation from Active Matching Engine
  // ==========================================================================
  describe('Order Cancellation & Book Depth Synchronization', () => {
    it('should remove cancelled order from matching engine so it cannot match', async () => {
      // 1. Seller posts sell order @ $100
      const sellRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      const orderId = sellRes.body.data.id;

      // 2. Seller cancels order
      const cancelRes = await request(app)
        .delete(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${seller1Token}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      // 3. Buyer submits buy order matching cancelled price
      const buyRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      expect(buyRes.status).toBe(201);
      // Order should remain OPEN because seller order was removed from book
      expect(buyRes.body.data.status).toBe('OPEN');

      const trades = await tradeRepo.findByInstrumentId(tgridId);
      expect(trades.length).toBe(0);
    });

    it('should allow cancelling a PARTIALLY_FILLED order for its remaining quantity', async () => {
      // 1. Seller posts 20 shares @ $100
      const sellRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '20.0000',
          limitPrice: '100.0000',
        });
      const orderId = sellRes.body.data.id;

      // 2. Buyer buys 5 shares @ $100 -> Seller becomes PARTIALLY_FILLED (15 remaining)
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '5.0000',
          limitPrice: '100.0000',
        });

      const partiallyFilledOrder = await orderRepo.findById(orderId);
      expect(partiallyFilledOrder?.status).toBe('PARTIALLY_FILLED');

      // 3. Seller cancels the remaining 15 shares
      const cancelRes = await request(app)
        .delete(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${seller1Token}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
    });
  });

  // ==========================================================================
  // 5. Query APIs (OrderBook, Recent Trades, User Trades, Portfolio)
  // ==========================================================================
  describe('Public & Private Phase 4B Query Endpoints', () => {
    it('should return aggregated order book depth via GET /api/v1/market/orderbook/:symbol', async () => {
      // Place resting bid: 10 @ $99
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '99.0000',
        });

      // Place resting ask: 15 @ $105
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '15.0000',
          limitPrice: '105.0000',
        });

      const res = await request(app).get('/api/v1/market/orderbook/TGRID');
      expect(res.status).toBe(200);
      expect(res.body.data.orderBook).toBeDefined();

      const { bids, asks } = res.body.data.orderBook;
      expect(bids.length).toBeGreaterThanOrEqual(1);
      expect(bids[0].price).toBe('99.0000');
      expect(bids[0].quantity).toBe('10.0000');

      expect(asks.length).toBeGreaterThanOrEqual(1);
      expect(asks[0].price).toBe('105.0000');
      expect(asks[0].quantity).toBe('15.0000');
    });

    it('should return trade history via GET /api/v1/trades', async () => {
      // Execute trade
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      const res = await request(app)
        .get('/api/v1/trades')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].price).toBe('100.0000');
      expect(res.body.data.items[0].quantity).toBe('10.0000');
    });

    it('should return portfolio holdings and net worth via GET /api/v1/portfolio/summary', async () => {
      // Execute trade for buyer
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${seller1Token}`)
        .send({
          instrumentId: tgridId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          instrumentId: tgridId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      const res = await request(app)
        .get('/api/v1/portfolio/summary')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.cashBalance).toBe('99000.0000');
      expect(res.body.data.positions.length).toBe(1);
      expect(res.body.data.positions[0].symbol).toBe('TGRID');
      expect(res.body.data.positions[0].quantity).toBe('10.0000');
      expect(res.body.data.positions[0].averageBuyPrice).toBe('100.0000');
    });
  });
});
