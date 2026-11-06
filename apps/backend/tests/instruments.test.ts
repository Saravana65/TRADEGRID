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
} from './mocks/in-memory-repositories';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { InstrumentService } from '../src/modules/market/instrument.service';
import { InstrumentController } from '../src/modules/market/instrument.controller';
import { MarketDataService } from '../src/modules/market/market-data.service';
import { MarketDataController } from '../src/modules/market/market-data.controller';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { WalletController } from '../src/modules/wallet/wallet.controller';
import { generateTokens } from '../src/utils/jwt';

describe('Stock Instruments Module (Phase 3)', () => {
  let app: any;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;

  let adminToken: string;
  let traderToken: string;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);

    const walletService = new WalletService(walletRepo, ledgerRepo);
    const authService = new AuthService(userRepo, sessionRepo, walletService);
    const authController = new AuthController(authService);
    const walletController = new WalletController(walletService);

    const instrumentService = new InstrumentService(instrumentRepo, marketDataRepo);
    const instrumentController = new InstrumentController(instrumentService);

    const marketDataService = new MarketDataService(marketDataRepo, instrumentRepo);
    const marketDataController = new MarketDataController(marketDataService);

    app = createApp({
      authController,
      walletController,
      instrumentController,
      marketDataController,
      customCheckDb: async () => true,
    });

    // Seed test admin and trader
    const adminUser = await userRepo.create({
      email: 'admin@tradegrid.internal',
      username: 'admin',
      password_hash: 'mock_hash',
      role: 'ADMIN',
    });

    const traderUser = await userRepo.create({
      email: 'trader@tradegrid.internal',
      username: 'trader_demo',
      password_hash: 'mock_hash',
      role: 'TRADER',
    });

    adminToken = generateTokens({
      id: adminUser.id,
      email: adminUser.email,
      username: adminUser.username,
      role: 'ADMIN',
    }).accessToken;

    traderToken = generateTokens({
      id: traderUser.id,
      email: traderUser.email,
      username: traderUser.username,
      role: 'TRADER',
    }).accessToken;
  });

  describe('GET /api/v1/instruments (List & Search)', () => {
    it('should list all available instruments with pagination metadata', async () => {
      const res = await request(app).get('/api/v1/instruments');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.instruments).toBeDefined();
      expect(res.body.data.instruments.length).toBeGreaterThanOrEqual(10);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(10);
    });

    it('should search instruments by symbol', async () => {
      const res = await request(app).get('/api/v1/instruments?q=RELIANCE');

      expect(res.status).toBe(200);
      expect(res.body.data.instruments.length).toBe(1);
      expect(res.body.data.instruments[0].symbol).toBe('RELIANCE');
      expect(res.body.data.instruments[0].dataClassification).toBe('REAL');
    });

    it('should search instruments by company name case-insensitively', async () => {
      const res = await request(app).get('/api/v1/instruments?q=quantum');

      expect(res.status).toBe(200);
      expect(res.body.data.instruments.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.instruments[0].name.toLowerCase()).toContain('quantum');
    });

    it('should filter instruments by exchange', async () => {
      const res = await request(app).get('/api/v1/instruments?exchange=NSE');

      expect(res.status).toBe(200);
      expect(res.body.data.instruments.every((i: any) => i.exchange === 'NSE')).toBe(true);
    });

    it('should filter instruments by sector', async () => {
      const res = await request(app).get('/api/v1/instruments?sector=Technology');

      expect(res.status).toBe(200);
      expect(res.body.data.instruments.every((i: any) => i.sector === 'Technology')).toBe(true);
    });

    it('should filter instruments by data classification (REAL vs SIMULATED)', async () => {
      const realRes = await request(app).get('/api/v1/instruments?classification=REAL');
      expect(realRes.status).toBe(200);
      expect(realRes.body.data.instruments.every((i: any) => i.dataClassification === 'REAL')).toBe(true);

      const simRes = await request(app).get('/api/v1/instruments?classification=SIMULATED');
      expect(simRes.status).toBe(200);
      expect(simRes.body.data.instruments.every((i: any) => i.dataClassification === 'SIMULATED')).toBe(true);
    });
  });

  describe('GET /api/v1/instruments/:symbol (Instrument Detail)', () => {
    it('should return instrument details for valid symbol', async () => {
      const res = await request(app).get('/api/v1/instruments/TGRID');

      expect(res.status).toBe(200);
      expect(res.body.data.instrument.symbol).toBe('TGRID');
      expect(res.body.data.instrument.name).toBe('TradeGrid Technologies Corp');
      expect(res.body.data.instrument.dataClassification).toBe('SIMULATED');
    });

    it('should return 404 NOT_FOUND for unknown symbol', async () => {
      const res = await request(app).get('/api/v1/instruments/NONEXISTENT');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INSTRUMENT_NOT_FOUND');
    });
  });

  describe('GET /api/v1/instruments/meta/sectors & meta/exchanges', () => {
    it('should return distinct sectors and exchanges', async () => {
      const secRes = await request(app).get('/api/v1/instruments/meta/sectors');
      expect(secRes.status).toBe(200);
      expect(Array.isArray(secRes.body.data.sectors)).toBe(true);
      expect(secRes.body.data.sectors).toContain('Technology');

      const exRes = await request(app).get('/api/v1/instruments/meta/exchanges');
      expect(exRes.status).toBe(200);
      expect(Array.isArray(exRes.body.data.exchanges)).toBe(true);
      expect(exRes.body.data.exchanges).toContain('NSE');
      expect(exRes.body.data.exchanges).toContain('TRADEGRID');
    });
  });

  describe('POST /api/v1/admin/instruments (Admin Creation & Uniqueness)', () => {
    it('should allow admin to create a new stock instrument', async () => {
      const payload = {
        symbol: 'ASTRA',
        name: 'Astra Defense Systems',
        exchange: 'TRADEGRID',
        sector: 'Aerospace & Defense',
        instrumentType: 'EQUITY',
        currency: 'USD',
        marketStatus: 'ACTIVE',
        dataClassification: 'SIMULATED',
      };

      const res = await request(app)
        .post('/api/v1/admin/instruments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.instrument.symbol).toBe('ASTRA');
      expect(res.body.data.instrument.name).toBe('Astra Defense Systems');
    });

    it('should enforce uniqueness: reject duplicate symbol on the same exchange (409 Conflict)', async () => {
      const payload = {
        symbol: 'TGRID',
        name: 'Duplicate TGrid',
        exchange: 'TRADEGRID',
        sector: 'Fintech',
      };

      const res = await request(app)
        .post('/api/v1/admin/instruments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SYMBOL_ALREADY_EXISTS');
    });

    it('should reject creation request from non-admin TRADER (403 Forbidden)', async () => {
      const payload = {
        symbol: 'HACK',
        name: 'Hack Attempt',
        exchange: 'TRADEGRID',
        sector: 'Tech',
      };

      const res = await request(app)
        .post('/api/v1/admin/instruments')
        .set('Authorization', `Bearer ${traderToken}`)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated creation request (401 Unauthorized)', async () => {
      const res = await request(app).post('/api/v1/admin/instruments').send({
        symbol: 'NOAUTH',
        name: 'No Auth',
        exchange: 'TRADEGRID',
        sector: 'Tech',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PATCH /api/v1/admin/instruments/:id & /status', () => {
    it('should allow admin to update instrument details', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/instruments/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Reliance Industries Global Ltd',
          sector: 'Conglomerate Energy',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.instrument.name).toBe('Reliance Industries Global Ltd');
      expect(res.body.data.instrument.sector).toBe('Conglomerate Energy');
    });

    it('should allow admin to toggle instrument market status', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/instruments/1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ marketStatus: 'HALTED' });

      expect(res.status).toBe(200);
      expect(res.body.data.instrument.marketStatus).toBe('HALTED');
    });
  });
});
