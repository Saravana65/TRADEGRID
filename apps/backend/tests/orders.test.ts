import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
  InMemoryInstrumentRepository,
  InMemoryMarketDataRepository,
  InMemoryOrderRepository,
} from './mocks/in-memory-repositories';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { InstrumentService } from '../src/modules/market/instrument.service';
import { InstrumentController } from '../src/modules/market/instrument.controller';
import { MarketDataService } from '../src/modules/market/market-data.service';
import { MarketDataController } from '../src/modules/market/market-data.controller';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { WalletController } from '../src/modules/wallet/wallet.controller';
import { OrderService } from '../src/modules/orders/order.service';
import { OrderController } from '../src/modules/orders/order.controller';
import { OrderReservationService } from '../src/modules/orders/order-reservation.service';
import { generateTokens } from '../src/utils/jwt';

describe('Order Management System (Phase 4A)', () => {
  let app: any;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let orderRepo: InMemoryOrderRepository;

  let traderToken: string;
  let otherTraderToken: string;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);
    orderRepo = new InMemoryOrderRepository();

    const mockKnex = {
      transaction: async (cb: any) => cb({}),
    } as any;

    const walletService = new WalletService(walletRepo, ledgerRepo, mockKnex);
    const authService = new AuthService(userRepo, sessionRepo, walletService);
    const authController = new AuthController(authService);
    const walletController = new WalletController(walletService);

    const instrumentService = new InstrumentService(instrumentRepo, marketDataRepo);
    const instrumentController = new InstrumentController(instrumentService);

    const marketDataService = new MarketDataService(marketDataRepo, instrumentRepo);
    const marketDataController = new MarketDataController(marketDataService);

    const reservationService = new OrderReservationService(walletRepo, ledgerRepo);
    const orderService = new OrderService(
      orderRepo,
      instrumentRepo,
      marketDataRepo,
      reservationService,
      mockKnex
    );
    const orderController = new OrderController(orderService);

    app = createApp({
      authController,
      walletController,
      instrumentController,
      marketDataController,
      orderController,
      customCheckDb: async () => true,
    });

    // Seed test users: User #1 (Trader), User #2 (Other Trader)
    const traderUser = await userRepo.create({
      email: 'trader1@tradegrid.internal',
      username: 'trader1',
      password_hash: 'argon2id$mockedhash',
      role: 'TRADER',
      status: 'ACTIVE',
    });

    const otherTraderUser = await userRepo.create({
      email: 'trader2@tradegrid.internal',
      username: 'trader2',
      password_hash: 'argon2id$mockedhash',
      role: 'TRADER',
      status: 'ACTIVE',
    });

    // Seed wallets with purchasing power
    await walletRepo.createWallet({
      user_id: traderUser.id,
      available_balance: '100000.0000',
      currency: 'USD',
    });

    await walletRepo.createWallet({
      user_id: otherTraderUser.id,
      available_balance: '50000.0000',
      currency: 'USD',
    });

    traderToken = generateTokens(traderUser).accessToken;
    otherTraderToken = generateTokens(otherTraderUser).accessToken;
  });

  describe('POST /api/v1/orders (Submit Order)', () => {
    it('should successfully place a valid LIMIT BUY order', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6, // TGRID
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.side).toBe('BUY');
      expect(res.body.data.orderType).toBe('LIMIT');
      expect(res.body.data.quantity).toBe('10.0000');
      expect(res.body.data.remainingQuantity).toBe('10.0000');
      expect(res.body.data.limitPrice).toBe('250.0000');
      expect(res.body.data.status).toBe('OPEN');
    });

    it('should successfully place a valid MARKET BUY order without limit price', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6, // TGRID
          side: 'BUY',
          orderType: 'MARKET',
          quantity: '5.0000',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderType).toBe('MARKET');
      expect(res.body.data.limitPrice).toBeNull();
      expect(res.body.data.status).toBe('OPEN');
    });

    it('should successfully place a valid LIMIT SELL order', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '15.0000',
          limitPrice: '260.5000',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.side).toBe('SELL');
      expect(res.body.data.status).toBe('OPEN');
    });

    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject order with non-positive or zero quantity (400 Bad Request)', async () => {
      const resZero = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '0',
          limitPrice: '250.0000',
        });

      expect(resZero.status).toBe(400);
      expect(resZero.body.success).toBe(false);

      const resNegative = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '-5.0000',
          limitPrice: '250.0000',
        });

      expect(resNegative.status).toBe(400);
      expect(resNegative.body.success).toBe(false);
    });

    it('should reject LIMIT order without limit price (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject LIMIT order with zero or negative limit price (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '0',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject order for non-existent instrument (404 Not Found)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 999999,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INSTRUMENT_NOT_FOUND');
    });

    it('should reject order for HALTED or inactive instrument (422 Unprocessable Entity)', async () => {
      // Create a halted instrument
      const halted = await instrumentRepo.create({
        symbol: 'HALTEDCO',
        name: 'Halted Company',
        exchange: 'TRADEGRID',
        sector: 'Technology',
        instrumentType: 'EQUITY',
        currency: 'USD',
        marketStatus: 'HALTED',
        dataClassification: 'SIMULATED',
      });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: halted.id,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '50.0000',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INSTRUMENT_NOT_TRADABLE');
    });

    it('should enforce idempotency key: duplicate request returns original order', async () => {
      const idempotencyKey = 'order-idemp-unique-12345';

      const res1 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
          idempotencyKey,
        });

      expect(res1.status).toBe(201);
      const originalOrderId = res1.body.data.id;

      const res2 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
          idempotencyKey,
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.id).toBe(originalOrderId);
    });

    it('should reject BUY order when purchasing power is insufficient (422 Unprocessable Entity)', async () => {
      // User #1 has $100,000 balance. Requesting 1000 shares at $200 = $200,000 required
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '1000.0000',
          limitPrice: '200.0000',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
      expect(res.body.error.message).toContain('Insufficient virtual funds');
    });
  });

  describe('GET /api/v1/orders (List Orders)', () => {
    beforeEach(async () => {
      // Create orders for User 1
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
        });

      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: '5.0000',
          limitPrice: '260.0000',
        });

      // Create order for User 2
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${otherTraderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '20.0000',
          limitPrice: '240.0000',
        });
    });

    it('should return only orders belonging to the authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);

      // Verify other user sees only their 1 order
      const resOther = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${otherTraderToken}`);

      expect(resOther.status).toBe(200);
      expect(resOther.body.data.items).toHaveLength(1);
      expect(resOther.body.data.pagination.total).toBe(1);
    });

    it('should filter orders by side and status', async () => {
      const resBuy = await request(app)
        .get('/api/v1/orders?side=BUY')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(resBuy.status).toBe(200);
      expect(resBuy.body.data.items).toHaveLength(1);
      expect(resBuy.body.data.items[0].side).toBe('BUY');

      const resSell = await request(app)
        .get('/api/v1/orders?side=SELL')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(resSell.status).toBe(200);
      expect(resSell.body.data.items).toHaveLength(1);
      expect(resSell.body.data.items[0].side).toBe('SELL');
    });

    it('should support pagination (page, limit)', async () => {
      const res = await request(app)
        .get('/api/v1/orders?limit=1&page=1')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination.totalPages).toBe(2);
    });
  });

  describe('GET /api/v1/orders/:id (Order Detail)', () => {
    it('should retrieve order details for the owner', async () => {
      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
        });

      const orderId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(orderId);
    });

    it('should deny access if order belongs to a different user (403 Forbidden)', async () => {
      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
        });

      const orderId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${otherTraderToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent order', async () => {
      const res = await request(app)
        .get('/api/v1/orders/999999')
        .set('Authorization', `Bearer ${traderToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/orders/:id (Cancel Order)', () => {
    it('should successfully cancel an OPEN order owned by the user', async () => {
      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
        });

      const orderId = createRes.body.data.id;

      const cancelRes = await request(app)
        .delete(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${traderToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      // Verify subsequent fetch returns CANCELLED status
      const getRes = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${traderToken}`);

      expect(getRes.body.data.status).toBe('CANCELLED');
    });

    it('should prevent user from cancelling another user order (403 Forbidden)', async () => {
      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
        });

      const orderId = createRes.body.data.id;

      const cancelRes = await request(app)
        .delete(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${otherTraderToken}`);

      expect(cancelRes.status).toBe(403);
      expect(cancelRes.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject cancelling an already CANCELLED order (422 Unprocessable Entity)', async () => {
      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
        });

      const orderId = createRes.body.data.id;

      // Cancel first time
      await request(app)
        .delete(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${traderToken}`);

      // Attempt second cancellation
      const secondCancel = await request(app)
        .delete(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${traderToken}`);

      expect(secondCancel.status).toBe(422);
      expect(secondCancel.body.error.code).toBe('ORDER_ALREADY_CANCELLED');
    });

    it('should reject cancelling a FILLED order (422 Unprocessable Entity)', async () => {
      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          instrumentId: 6,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '250.0000',
        });

      const orderId = createRes.body.data.id;

      // Manually set status to FILLED in repository
      await orderRepo.updateStatus(orderId, 'FILLED');

      const cancelRes = await request(app)
        .delete(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${traderToken}`);

      expect(cancelRes.status).toBe(422);
      expect(cancelRes.body.error.code).toBe('ORDER_ALREADY_FILLED');
    });
  });
});
