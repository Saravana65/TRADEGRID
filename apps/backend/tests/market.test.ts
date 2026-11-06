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
import { FixtureMarketDataProvider } from '../src/modules/market/fixture-market-data.provider';

describe('Market Data & Quotes Module (Phase 3)', () => {
  let app: any;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let marketDataService: MarketDataService;
  let fixtureProvider: FixtureMarketDataProvider;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);

    fixtureProvider = new FixtureMarketDataProvider(marketDataRepo, instrumentRepo);

    const walletService = new WalletService(walletRepo, ledgerRepo);
    const authService = new AuthService(userRepo, sessionRepo, walletService);
    const authController = new AuthController(authService);
    const walletController = new WalletController(walletService);

    const instrumentService = new InstrumentService(instrumentRepo, marketDataRepo);
    const instrumentController = new InstrumentController(instrumentService);

    marketDataService = new MarketDataService(marketDataRepo, instrumentRepo, fixtureProvider);
    const marketDataController = new MarketDataController(marketDataService);

    app = createApp({
      authController,
      walletController,
      instrumentController,
      marketDataController,
      customCheckDb: async () => true,
    });
  });

  describe('GET /api/v1/market/quotes (Quote Retrieval)', () => {
    it('should retrieve quotes for all instruments in the universe', async () => {
      const res = await request(app).get('/api/v1/market/quotes');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.quotes)).toBe(true);
      expect(res.body.data.quotes.length).toBeGreaterThanOrEqual(10);
    });

    it('should filter quotes by data classification', async () => {
      const realRes = await request(app).get('/api/v1/market/quotes?classification=REAL');
      expect(realRes.status).toBe(200);
      expect(realRes.body.data.quotes.every((q: any) => q.dataClassification === 'REAL')).toBe(true);

      const simRes = await request(app).get('/api/v1/market/quotes?classification=SIMULATED');
      expect(simRes.status).toBe(200);
      expect(simRes.body.data.quotes.every((q: any) => q.dataClassification === 'SIMULATED')).toBe(true);
    });
  });

  describe('GET /api/v1/market/quotes/:symbol (Single Quote & Math)', () => {
    it('should return quote and verify price change math consistency', async () => {
      const res = await request(app).get('/api/v1/market/quotes/TGRID');

      expect(res.status).toBe(200);
      const quote = res.body.data.quote;
      expect(quote.symbol).toBe('TGRID');
      expect(quote.dataClassification).toBe('SIMULATED');

      const last = parseFloat(quote.lastPrice);
      const prev = parseFloat(quote.previousClose);
      const expectedChange = (last - prev).toFixed(4);
      const expectedPct = ((last - prev) / prev * 100).toFixed(4);

      expect(parseFloat(quote.changeAmount).toFixed(4)).toBe(expectedChange);
      expect(parseFloat(quote.changePercent).toFixed(4)).toBe(expectedPct);
    });

    it('should return 404 for non-existent symbol', async () => {
      const res = await request(app).get('/api/v1/market/quotes/DOESNOTEXIST');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INSTRUMENT_NOT_FOUND');
    });
  });

  describe('GET /api/v1/market/candles/:symbol (OHLCV Historical Series)', () => {
    it('should return historical candles with correct metadata', async () => {
      const res = await request(app).get('/api/v1/market/candles/TGRID?interval=1h');

      expect(res.status).toBe(200);
      expect(res.body.data.symbol).toBe('TGRID');
      expect(res.body.data.interval).toBe('1h');
      expect(res.body.data.dataClassification).toBe('SIMULATED');
      expect(Array.isArray(res.body.data.candles)).toBe(true);
      expect(res.body.data.candles.length).toBeGreaterThan(0);
    });

    it('should verify OHLCV consistency: high >= max(open, close) and low <= min(open, close)', async () => {
      const res = await request(app).get('/api/v1/market/candles/TGRID?interval=1h');

      expect(res.status).toBe(200);
      const candles = res.body.data.candles;

      for (const candle of candles) {
        const open = parseFloat(candle.open);
        const high = parseFloat(candle.high);
        const low = parseFloat(candle.low);
        const close = parseFloat(candle.close);

        expect(high).toBeGreaterThanOrEqual(Math.max(open, close));
        expect(low).toBeLessThanOrEqual(Math.min(open, close));
        expect(high).toBeGreaterThanOrEqual(low);
        expect(parseFloat(candle.volume)).toBeGreaterThanOrEqual(0);
      }
    });

    it('should reject invalid interval values with 400 VALIDATION_ERROR', async () => {
      const res = await request(app).get('/api/v1/market/candles/TGRID?interval=2h');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/market/gainers, /losers & /most-active', () => {
    it('should return top gainers ordered by percentage change descending', async () => {
      const res = await request(app).get('/api/v1/market/gainers?limit=3');

      expect(res.status).toBe(200);
      const gainers = res.body.data.gainers;
      expect(gainers.length).toBeLessThanOrEqual(3);

      for (let i = 0; i < gainers.length - 1; i++) {
        expect(parseFloat(gainers[i].changePercent)).toBeGreaterThanOrEqual(
          parseFloat(gainers[i + 1].changePercent)
        );
      }
    });

    it('should return top losers ordered by percentage change ascending', async () => {
      const res = await request(app).get('/api/v1/market/losers?limit=3');

      expect(res.status).toBe(200);
      const losers = res.body.data.losers;
      expect(losers.length).toBeLessThanOrEqual(3);

      for (let i = 0; i < losers.length - 1; i++) {
        expect(parseFloat(losers[i].changePercent)).toBeLessThanOrEqual(
          parseFloat(losers[i + 1].changePercent)
        );
      }
    });

    it('should return most active instruments ordered by volume descending', async () => {
      const res = await request(app).get('/api/v1/market/most-active?limit=3');

      expect(res.status).toBe(200);
      const mostActive = res.body.data.mostActive;

      for (let i = 0; i < mostActive.length - 1; i++) {
        expect(parseInt(mostActive[i].volume, 10)).toBeGreaterThanOrEqual(
          parseInt(mostActive[i + 1].volume, 10)
        );
      }
    });
  });

  describe('GET /api/v1/market/summary (Market Breadth)', () => {
    it('should return comprehensive market breadth summary', async () => {
      const res = await request(app).get('/api/v1/market/summary');

      expect(res.status).toBe(200);
      const summary = res.body.data.summary;
      expect(summary.totalInstruments).toBeGreaterThanOrEqual(10);
      expect(summary.realInstrumentsCount).toBe(5);
      expect(summary.simulatedInstrumentsCount).toBeGreaterThanOrEqual(5);
      expect(summary.advancingCount).toBeGreaterThanOrEqual(0);
      expect(summary.decliningCount).toBeGreaterThanOrEqual(0);
      expect(summary.unchangedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Provider Adapter Behavior', () => {
    it('should allow FixtureMarketDataProvider to resolve quotes directly', async () => {
      const quote = await fixtureProvider.getQuote('TGRID');
      expect(quote).toBeDefined();
      expect(quote?.symbol).toBe('TGRID');

      const quotes = await fixtureProvider.getQuotes(['TGRID', 'NEXUS']);
      expect(quotes.length).toBe(2);

      const candles = await fixtureProvider.getCandles('TGRID', '1h', 5);
      expect(candles.length).toBeLessThanOrEqual(5);
    });
  });
});
