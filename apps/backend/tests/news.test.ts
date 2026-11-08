import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
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
  InMemoryNewsRepository,
} from './mocks/in-memory-repositories';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { OrderReservationService } from '../src/modules/orders/order-reservation.service';
import { SettlementService } from '../src/modules/matching/settlement.service';
import { MatchingEngine } from '../src/modules/matching/matching-engine';
import { OrderService } from '../src/modules/orders/order.service';
import { BotService } from '../src/modules/bots/bot.service';
import { BotEngine } from '../src/modules/bots/bot.engine';
import { BotRiskService } from '../src/modules/bots/risk/bot-risk.service';
import { MarketMakerStrategy } from '../src/modules/bots/strategies/market-maker.strategy';
import { CatalystEngine } from '../src/modules/news/catalyst.engine';
import { NewsService } from '../src/modules/news/news.service';
import { NewsScheduler } from '../src/modules/news/news.scheduler';
import { NewsController } from '../src/modules/news/news.controller';

describe('Phase 5C: Simulated News Catalyst Engine', () => {
  let server: http.Server;
  let serverUrl: string;
  let app: any;
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
  let newsRepo: InMemoryNewsRepository;

  // Services
  let walletService: WalletService;
  let reservationService: OrderReservationService;
  let settlementService: SettlementService;
  let matchingEngine: MatchingEngine;
  let orderService: OrderService;
  let botRiskService: BotRiskService;
  let botEngine: BotEngine;
  let botService: BotService;
  let catalystEngine: CatalystEngine;
  let newsService: NewsService;
  let newsScheduler: NewsScheduler;
  let newsController: NewsController;

  // Identity Profiles
  const adminUser = { id: 100, email: 'admin@tradegrid.internal', username: 'admin_sys', role: 'ADMIN' as const };
  const humanTrader = { id: 101, email: 'trader@tradegrid.internal', username: 'trader_bob', role: 'TRADER' as const };

  let adminToken: string;
  let traderToken: string;

  let techInstrumentId: number;
  let energyInstrumentId: number;

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
    newsRepo = new InMemoryNewsRepository();

    const mockKnex = {
      transaction: async (cb: any) => cb({}),
    } as any;

    // Seed instruments
    const instTech = await instrumentRepo.create({
      symbol: 'ALPHA',
      name: 'Alpha Technologies',
      exchange: 'NASDAQ',
      sector: 'Technology',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
    });
    techInstrumentId = instTech.id;

    const instEnergy = await instrumentRepo.create({
      symbol: 'BETA',
      name: 'Beta Energy Corp',
      exchange: 'NYSE',
      sector: 'Energy',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
    });
    energyInstrumentId = instEnergy.id;

    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);
    orderRepo = new InMemoryOrderRepository();
    tradeRepo = new InMemoryTradeRepository();
    positionRepo = new InMemoryPositionRepository();

    // Seed market quote with initial reference price $100.0000
    marketDataRepo.quotes.push({
      id: 1,
      instrumentId: techInstrumentId,
      symbol: 'ALPHA',
      exchange: 'NASDAQ',
      lastPrice: '100.0000',
      changeAmount: '0.0000',
      changePercent: '0.00',
      volume: '5000',
      highPrice: '102.0000',
      lowPrice: '98.0000',
      openPrice: '100.0000',
      previousClose: '100.0000',
      updatedAt: new Date().toISOString(),
    });

    marketDataRepo.quotes.push({
      id: 2,
      instrumentId: energyInstrumentId,
      symbol: 'BETA',
      exchange: 'NYSE',
      lastPrice: '50.0000',
      changeAmount: '0.0000',
      changePercent: '0.00',
      volume: '3000',
      highPrice: '51.0000',
      lowPrice: '49.0000',
      openPrice: '50.0000',
      previousClose: '50.0000',
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

    // Phase 5C News Subsystem
    catalystEngine = new CatalystEngine();
    newsService = new NewsService(newsRepo, catalystEngine, realtimeService);
    newsScheduler = new NewsScheduler(newsRepo, newsService, catalystEngine, realtimeService);
    newsController = new NewsController(newsService);

    // Bot subsystem with news integration
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
      realtimeService,
      newsService
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

    // Seed trader account and virtual wallet
    await userRepo.create({
      username: humanTrader.username,
      email: humanTrader.email,
      password_hash: 'hash',
      role: 'TRADER',
      status: 'ACTIVE',
    });
    await walletService.createWalletForUser(humanTrader.id, '100000.0000');

    // Create App and HTTP server
    app = createApp({
      newsController,
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
    newsScheduler.stop();
    for (const client of activeClients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    activeClients = [];
    await closeWebSocket();
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
  // 1. News Creation, Zod Schema Validation & Disclaimers
  // =========================================================================
  describe('News Creation & Schema Validation', () => {
    it('1. should allow exchange admin to create a valid breaking news article with simulated flag', async () => {
      const res = await request(app)
        .post('/api/v1/admin/news')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          headline: 'ALPHA Corp Signs Landmark AI Infrastructure Deal',
          summary: 'Alpha Technologies announces breakthrough contract expected to expand computing capacity.',
          content: 'Detailed simulated release content.',
          category: 'Earnings',
          impactDirection: 'POSITIVE',
          severity: 'HIGH',
          targetScope: 'INSTRUMENT',
          targetSymbol: 'ALPHA',
          catalyst: {
            sentimentScore: '0.80',
            volatilityFactor: '1.50',
            expectedParticipation: '1.40',
            durationSeconds: 300,
          },
          publishImmediately: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const article = res.body.data.article || res.body.data;
      expect(article.headline).toBe('ALPHA Corp Signs Landmark AI Infrastructure Deal');
      expect(article.isSimulated).toBe(true);
      expect(article.status).toBe('DRAFT');
      expect(res.body.data.catalyst).toBeDefined();
      expect(parseFloat(res.body.data.catalyst.sentimentScore)).toBeCloseTo(0.8, 2);
    });

    it('2. should reject news creation with invalid category or missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/admin/news')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          headline: 'Invalid News',
          summary: 'Too short',
          category: 'INVALID_CATEGORY_NAME',
          impactDirection: 'POSITIVE',
          severity: 'HIGH',
          targetScope: 'INSTRUMENT',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it('3. should reject news creation if sentimentScore is outside [-1.0, 1.0]', async () => {
      const res = await request(app)
        .post('/api/v1/admin/news')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          headline: 'Out of bounds sentiment news',
          summary: 'Valid summary with enough length to pass schema validation',
          category: 'COMMODITY_SURGE',
          impactDirection: 'POSITIVE',
          severity: 'HIGH',
          targetScope: 'MARKET',
          catalyst: {
            sentimentScore: '2.50', // Invalid: max 1.0
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. Role-Based Access Control (RBAC) & Route Protection
  // =========================================================================
  describe('Role-Based Access Control (RBAC) & Route Protection', () => {
    it('4. should reject ordinary traders from accessing /api/v1/admin/news endpoints (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/news')
        .set('Authorization', `Bearer ${traderToken}`)
        .send({
          headline: 'Trader Unauthorized News Creation Attempt',
          summary: 'This must be rejected by RBAC role verification',
          category: 'REGULATORY_APPROVAL',
          impactDirection: 'POSITIVE',
          severity: 'LOW',
          targetScope: 'MARKET',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('5. should reject unauthenticated guests from administrative news management (401 Unauthorized)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/news/metrics');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('6. should allow public guests to read published news and active catalysts on /api/v1/news', async () => {
      // First publish a news item as admin
      await newsService.createNews(adminUser.id, {
        headline: 'Publicly Readable Breakthrough Discovery',
        summary: 'Public summary visible to all traders without authentication',
        category: 'PRODUCT_LAUNCH',
        impactDirection: 'POSITIVE',
        severity: 'MEDIUM',
        targetScope: 'MARKET',
        publishImmediately: true,
      });

      const res = await request(app)
        .get('/api/v1/news');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.articles.length).toBeGreaterThan(0);
      expect(res.body.data.articles[0].headline).toBe('Publicly Readable Breakthrough Discovery');

      // Test active catalysts endpoint
      const catRes = await request(app)
        .get('/api/v1/news/active-catalysts');

      expect(catRes.status).toBe(200);
      expect(catRes.body.success).toBe(true);
      expect(catRes.body.data.activeCatalysts.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 3. News Publication Lifecycle & State Transitions
  // =========================================================================
  describe('News Publication Lifecycle & State Transitions', () => {
    it('7. should immediately activate a catalyst when publishImmediately is true', async () => {
      const { article, catalyst } = await newsService.createNews(adminUser.id, {
        headline: 'Alpha Tech Breakthrough Released Immediately',
        summary: 'Immediate publication activates the catalyst and schedules decay',
        category: 'TECHNOLOGY_DISRUPTION',
        impactDirection: 'POSITIVE',
        severity: 'EXTREME',
        targetScope: 'INSTRUMENT',
        targetSymbol: 'ALPHA',
        catalyst: {
          sentimentScore: '0.90',
          volatilityFactor: '2.00',
          expectedParticipation: '1.50',
          durationSeconds: 120,
        },
        publishImmediately: true,
      });

      expect(article.status).toBe('ACTIVE');
      expect(catalyst).toBeDefined();
      expect(catalyst!.status).toBe('ACTIVE');
      expect(catalyst!.activatedAt).toBeDefined();
      expect(catalyst!.decayStartsAt).toBeDefined();
      expect(catalyst!.expiredAt).toBeDefined();

      // Verify audit execution was logged
      const executions = await newsRepo.findExecutionsByNewsId(article.id);
      expect(executions.total).toBe(1);
      expect(executions.executions[0].action).toBe('CATALYST_ACTIVATED');
    });

    it('8. should transition a DRAFT article to ACTIVE upon admin manual publication', async () => {
      const created = await newsService.createNews(adminUser.id, {
        headline: 'Draft Story Ready for Broadcast',
        summary: 'Created as draft and subsequently published via POST /publish',
        category: 'MANAGEMENT_CHANGE',
        impactDirection: 'NEGATIVE',
        severity: 'MEDIUM',
        targetScope: 'INSTRUMENT',
        targetSymbol: 'ALPHA',
        publishImmediately: false,
      });

      expect(created.article.status).toBe('DRAFT');

      const published = await newsService.publishNews(created.article.id);
      expect(published.status).toBe('ACTIVE');
      expect(published.publishedAt).toBeDefined();

      const activeRecord = await newsRepo.findById(created.article.id);
      expect(activeRecord!.catalyst!.status).toBe('ACTIVE');
    });

    it('9. should automatically publish a SCHEDULED article when due time arrives via scheduler tick', async () => {
      const pastTime = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
      const created = await newsService.createNews(adminUser.id, {
        headline: 'Scheduled Energy Announcement',
        summary: 'This announcement was scheduled for publication in the past',
        category: 'COMMODITY_SURGE',
        impactDirection: 'POSITIVE',
        severity: 'HIGH',
        targetScope: 'SECTOR',
        targetSector: 'Energy',
        scheduledAt: pastTime,
      });

      expect(created.article.status).toBe('SCHEDULED');

      // Trigger scheduler tick
      await newsScheduler.tick();

      const updated = await newsRepo.findById(created.article.id);
      expect(updated!.article.status).toBe('ACTIVE');
      expect(updated!.catalyst!.status).toBe('ACTIVE');
    });

    it('10. should allow admin to cancel an active news article and deactivate its catalyst', async () => {
      const created = await newsService.createNews(adminUser.id, {
        headline: 'False Rumor Retraction Notice',
        summary: 'Admin retracts published news, halting market catalyst effects',
        category: 'MARKET_CRASH',
        impactDirection: 'NEGATIVE',
        severity: 'HIGH',
        targetScope: 'MARKET',
        publishImmediately: true,
      });

      expect(created.article.status).toBe('ACTIVE');

      const cancelled = await newsService.cancelNews(created.article.id);
      expect(cancelled.status).toBe('CANCELLED');

      const record = await newsRepo.findById(created.article.id);
      expect(record!.article.status).toBe('CANCELLED');
      expect(record!.catalyst!.status).toBe('CANCELLED');

      // Verify no active catalysts remain
      const activeList = await newsRepo.findActiveCatalysts(new Date());
      expect(activeList.some((c) => c.article.id === created.article.id)).toBe(false);
    });

    it('11. should transition catalyst to EXPIRED when duration elapses', async () => {
      const { article } = await newsService.createNews(adminUser.id, {
        headline: 'Quick Expiring Market Flash',
        summary: 'A short-lived event that expires after 1 second',
        category: 'WAR_CONFLICT',
        impactDirection: 'NEGATIVE',
        severity: 'LOW',
        targetScope: 'MARKET',
        catalyst: {
          durationSeconds: 1, // 1 second duration
        },
        publishImmediately: true,
      });

      // Wait 1.1s for duration to elapse
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await newsScheduler.tick();

      const expiredRecord = await newsRepo.findById(article.id);
      expect(expiredRecord!.article.status).toBe('EXPIRED');
      expect(expiredRecord!.catalyst!.status).toBe('EXPIRED');
    });
  });

  // =========================================================================
  // 4. Deterministic Catalyst Mathematics & Decay Curve
  // =========================================================================
  describe('Catalyst Engine Mathematics & Decay Model', () => {
    it('12. should calculate full impact (decay factor 1.0) before half-life and linear decay after half-life', () => {
      const now = new Date('2026-11-08T12:00:00Z');
      const article: any = {
        target_scope: 'INSTRUMENT',
        target_symbol: 'ALPHA',
        severity: 'HIGH', // weight = 0.75
      };
      const catalyst: any = {
        sentiment_score: '0.8000',
        volatility_factor: '2.0000',
        duration_seconds: 100,
        activated_at: now,
        decay_starts_at: new Date(now.getTime() + 50000), // at +50s
        expired_at: new Date(now.getTime() + 100000), // at +100s
      };

      // T = 0s: decay factor must be 1.0
      const impactT0 = catalystEngine.calculateEffectiveImpact(article, catalyst, 'ALPHA', undefined, now);
      // impact = 0.80 * 0.75 * 1.0 * 1.0 = 0.6000
      expect(impactT0).toBeCloseTo(0.60, 4);

      // T = 25s (before half-life): decay factor remains 1.0
      const t25 = new Date(now.getTime() + 25000);
      const impactT25 = catalystEngine.calculateEffectiveImpact(article, catalyst, 'ALPHA', undefined, t25);
      expect(impactT25).toBeCloseTo(0.60, 4);

      // T = 75s (halfway through decay window: (100 - 75) / 50 = 0.50 factor)
      const t75 = new Date(now.getTime() + 75000);
      const impactT75 = catalystEngine.calculateEffectiveImpact(article, catalyst, 'ALPHA', undefined, t75);
      // impact = 0.60 * 0.5 = 0.3000
      expect(impactT75).toBeCloseTo(0.30, 4);

      // T = 100s (at expiration): decay factor is 0.0
      const t100 = new Date(now.getTime() + 100000);
      const impactT100 = catalystEngine.calculateEffectiveImpact(article, catalyst, 'ALPHA', undefined, t100);
      expect(impactT100).toBeCloseTo(0.00, 4);
    });

    it('13. should apply correct scope relevance weights: Symbol (1.0), Sector (0.7), Market (0.4), Unrelated (0.0)', () => {
      const now = new Date();
      const catalyst: any = {
        sentiment_score: '1.0000',
        volatility_factor: '1.0000',
        duration_seconds: 300,
        activated_at: now,
        decay_starts_at: new Date(now.getTime() + 150000),
        expired_at: new Date(now.getTime() + 300000),
      };

      // 1. Direct Symbol targeting: scope = INSTRUMENT
      const instrumentArticle: any = {
        target_scope: 'INSTRUMENT',
        target_symbol: 'ALPHA',
        severity: 'EXTREME', // weight 1.0
      };
      const directImpact = catalystEngine.calculateEffectiveImpact(instrumentArticle, catalyst, 'ALPHA', 'Technology', now);
      expect(directImpact).toBeCloseTo(1.00, 4); // 1.0 * 1.0 * 1.0 = 1.0

      const unrelatedImpact = catalystEngine.calculateEffectiveImpact(instrumentArticle, catalyst, 'BETA', 'Energy', now);
      expect(unrelatedImpact).toBeCloseTo(0.00, 4); // Symbol mismatch = 0.0

      // 2. Sector targeting: scope = SECTOR
      const sectorArticle: any = {
        target_scope: 'SECTOR',
        target_sector: 'Technology',
        severity: 'EXTREME', // weight 1.0
      };
      const sectorImpact = catalystEngine.calculateEffectiveImpact(sectorArticle, catalyst, 'ALPHA', 'Technology', now);
      expect(sectorImpact).toBeCloseTo(0.70, 4); // 1.0 * 1.0 * 0.7 = 0.7

      // 3. Market-wide targeting: scope = MARKET
      const marketArticle: any = {
        target_scope: 'MARKET',
        severity: 'EXTREME', // weight 1.0
      };
      const marketImpact = catalystEngine.calculateEffectiveImpact(marketArticle, catalyst, 'ANY_SYMBOL', 'Any_Sector', now);
      expect(marketImpact).toBeCloseTo(0.40, 4); // 1.0 * 1.0 * 0.4 = 0.4
    });

    it('14. should combine multiple active catalysts into composite sentiment and maximum volatility factor', async () => {
      // Catalyst 1: Direct ALPHA positive news (+0.50 sentiment, 1.50 volatility)
      await newsService.createNews(adminUser.id, {
        headline: 'Alpha Positive Catalyst',
        summary: 'Company-specific positive catalyst driving growth',
        category: 'EARNINGS_ANNOUNCEMENT',
        impactDirection: 'POSITIVE',
        severity: 'EXTREME',
        targetScope: 'INSTRUMENT',
        targetSymbol: 'ALPHA',
        catalyst: {
          sentimentScore: '0.50',
          volatilityFactor: '1.50',
          durationSeconds: 300,
        },
        publishImmediately: true,
      });

      // Catalyst 2: Technology Sector positive news (+0.40 sentiment, 2.00 volatility)
      await newsService.createNews(adminUser.id, {
        headline: 'Tech Sector Boom Announcement',
        summary: 'Sector-wide optimism across semiconductor and tech firms',
        category: 'SECTOR_BOOM',
        impactDirection: 'POSITIVE',
        severity: 'EXTREME',
        targetScope: 'SECTOR',
        targetSector: 'Technology',
        catalyst: {
          sentimentScore: '0.40',
          volatilityFactor: '2.00',
          durationSeconds: 300,
        },
        publishImmediately: true,
      });

      const composite = await newsService.getCompositeImpactForInstrument('ALPHA', 'Technology');
      expect(composite.activeCatalystsCount).toBe(2);
      // Volatility should reflect sector shock (1.0 + (2.0 - 1.0) * 0.7 = 1.70)
      expect(parseFloat(composite.volatilityMultiplier)).toBeGreaterThanOrEqual(1.70);
      // Sentiment should be positive combination of direct (0.50 * 1.0) + sector (0.40 * 0.7 = 0.28) = 0.78
      expect(parseFloat(composite.sentimentScore)).toBeCloseTo(0.78, 2);
    });
  });

  // =========================================================================
  // 5. Market-Making Bot Strategy Integration
  // =========================================================================
  describe('Market-Making Bot Strategy Integration', () => {
    it('15. should widen market-maker bot spread during elevated catalyst volatility', () => {
      const mmStrategy = new MarketMakerStrategy('BALANCED_MM');
      const baseConfig: any = {
        spread_bps: '50.0', // 50 bps = 0.50%
        order_quantity: '10.0000',
        max_order_quantity: '50.0000',
        max_inventory_per_instrument: '100.0000',
        skew_factor: '1.0',
      };

      // Scenario A: Normal market (no catalyst)
      const normalQuote = mmStrategy.calculateQuotes({
        botId: 1,
        instrumentId: techInstrumentId,
        symbol: 'ALPHA',
        config: baseConfig,
        referencePrice: '100.0000',
        currentInventory: '0.0000',
        availableCash: '50000.0000',
      });

      // Normal half spread = 100 * (50/10000 / 2) = $0.2500
      expect(parseFloat(normalQuote.desiredQuote!.halfSpread)).toBeCloseTo(0.25, 2);

      // Scenario B: Active news catalyst with 2.50x volatility factor
      const newsQuote = mmStrategy.calculateQuotes({
        botId: 1,
        instrumentId: techInstrumentId,
        symbol: 'ALPHA',
        config: baseConfig,
        referencePrice: '100.0000',
        currentInventory: '0.0000',
        availableCash: '50000.0000',
        catalystImpact: {
          sentimentScore: '0.0000',
          volatilityMultiplier: '2.5000',
          expectedParticipation: '1.0000',
          effectiveImpact: '0.0000',
          activeCatalystsCount: 1,
        },
      });

      // Spread widened 2.5x: 50 * 2.5 = 125 bps -> halfSpread = 100 * (125/10000 / 2) = $0.6250
      expect(Math.abs(parseFloat(newsQuote.desiredQuote!.halfSpread) - 0.625)).toBeLessThanOrEqual(0.01);
      expect(parseFloat(newsQuote.desiredQuote!.halfSpread)).toBeGreaterThan(
        parseFloat(normalQuote.desiredQuote!.halfSpread)
      );
    });

    it('16. should skew market-maker reservation mid price upwards when positive catalyst is active', () => {
      const mmStrategy = new MarketMakerStrategy('BALANCED_MM');
      const baseConfig: any = {
        spread_bps: '50.0',
        order_quantity: '10.0000',
        max_order_quantity: '50.0000',
        max_inventory_per_instrument: '100.0000',
        skew_factor: '1.0',
      };

      const positiveImpactQuote = mmStrategy.calculateQuotes({
        botId: 1,
        instrumentId: techInstrumentId,
        symbol: 'ALPHA',
        config: baseConfig,
        referencePrice: '100.0000',
        currentInventory: '0.0000',
        availableCash: '50000.0000',
        catalystImpact: {
          sentimentScore: '0.8000', // strong positive news
          volatilityMultiplier: '1.0000',
          expectedParticipation: '1.0000',
          effectiveImpact: '0.8000',
          activeCatalystsCount: 1,
        },
      });

      // Reservation mid price should be shifted higher than reference price $100.0000
      expect(parseFloat(positiveImpactQuote.desiredQuote!.adjustedMidPrice)).toBeGreaterThan(100.0);
      expect(parseFloat(positiveImpactQuote.desiredQuote!.bidPrice!)).toBeGreaterThan(99.75);
    });
  });

  // =========================================================================
  // 6. Financial Integrity Invariants (Zero Price / Order / Wallet Tampering)
  // =========================================================================
  describe('Financial Integrity Invariants', () => {
    it('17. should NOT directly overwrite instrument.last_price when news is published or expired', async () => {
      const beforeQuote = await marketDataRepo.getQuoteByInstrumentId(techInstrumentId);
      const initialPrice = beforeQuote!.lastPrice;

      // Publish extreme news
      const { article } = await newsService.createNews(adminUser.id, {
        headline: 'Massive Positive Shock News',
        summary: 'News engine must never overwrite last_price directly in the database',
        category: 'EARNINGS_ANNOUNCEMENT',
        impactDirection: 'POSITIVE',
        severity: 'EXTREME',
        targetScope: 'INSTRUMENT',
        targetSymbol: 'ALPHA',
        catalyst: {
          sentimentScore: '1.00',
          volatilityFactor: '3.00',
          durationSeconds: 1,
        },
        publishImmediately: true,
      });

      const afterPublishQuote = await marketDataRepo.getQuoteByInstrumentId(techInstrumentId);
      // Invariant: lastPrice is untouched
      expect(afterPublishQuote!.lastPrice).toBe(initialPrice);

      // Expire news
      await new Promise((r) => setTimeout(r, 1100));
      await newsScheduler.tick();

      const afterExpireQuote = await marketDataRepo.getQuoteByInstrumentId(techInstrumentId);
      expect(afterExpireQuote!.lastPrice).toBe(initialPrice);
    });

    it('18. should NOT insert fake trades or alter user balances during news lifecycle', async () => {
      const tradesBefore = await tradeRepo.findByInstrumentId(techInstrumentId);
      const walletBefore = await walletRepo.findByUserId(humanTrader.id);

      // Create and publish breaking market crash news
      await newsService.createNews(adminUser.id, {
        headline: 'Simulated Market Crash Breaking News',
        summary: 'Simulated shock must only affect participant quoting behaviour, zero fake trades',
        category: 'MARKET_CRASH',
        impactDirection: 'NEGATIVE',
        severity: 'EXTREME',
        targetScope: 'MARKET',
        publishImmediately: true,
      });

      const tradesAfter = await tradeRepo.findByInstrumentId(techInstrumentId);
      const walletAfter = await walletRepo.findByUserId(humanTrader.id);

      // Zero fabricated trades
      expect(tradesAfter.length).toBe(tradesBefore.length);
      // Zero unauthorized balance alteration
      expect(walletAfter!.available_balance).toBe(walletBefore!.available_balance);
      expect(walletAfter!.locked_balance).toBe(walletBefore!.locked_balance);
    });
  });

  // =========================================================================
  // 7. WebSocket Real-Time Channels & Security Authorization
  // =========================================================================
  describe('WebSocket Real-Time Channels & Security Authorization', () => {
    it('19. should reject unauthenticated socket or non-admin socket from admin:news channel', async () => {
      const guestSocket = createSocketClient();
      await new Promise<void>((resolve) => guestSocket.on('connect', resolve));

      const subAck = await new Promise<any>((resolve) => {
        guestSocket.emit('subscribe', { channel: 'admin:news' }, (res: any) => resolve(res));
      });

      expect(subAck.status).toBe('error');
      expect(subAck.message).toContain('Unauthorized');

      // Trader client
      const traderSocket = createSocketClient(traderToken);
      await new Promise<void>((resolve) => traderSocket.on('connect', resolve));

      const traderSubAck = await new Promise<any>((resolve) => {
        traderSocket.emit('subscribe', { channel: 'admin:news' }, (res: any) => resolve(res));
      });

      expect(traderSubAck.status).toBe('error');
      expect(traderSubAck.message).toContain('Unauthorized');
    });

    it('20. should stream news:published and news:expired events to authorized sockets on news channel', async () => {
      const client = createSocketClient();
      await new Promise<void>((resolve) => client.on('connect', resolve));

      // Subscribe to public news channel
      const subAck = await new Promise<any>((resolve) => {
        client.emit('subscribe', { channel: 'news' }, (res: any) => resolve(res));
      });
      expect(subAck.status).toBe('subscribed');

      // Prepare event listener
      const publishedPromise = new Promise<any>((resolve) => {
        client.on('news:published', (event: any) => resolve(event));
      });

      // Publish breaking news via newsService
      const { article } = await newsService.createNews(adminUser.id, {
        headline: 'Realtime Broadcast Test Event',
        summary: 'Verifying delivery of news:published over Socket.IO news room',
        category: 'PRODUCT_LAUNCH',
        impactDirection: 'POSITIVE',
        severity: 'MEDIUM',
        targetScope: 'INSTRUMENT',
        targetSymbol: 'ALPHA',
        catalyst: {
          durationSeconds: 1,
        },
        publishImmediately: true,
      });

      const publishedEvent = await publishedPromise;
      expect(publishedEvent.newsId).toBe(article.id);
      expect(publishedEvent.headline).toBe('Realtime Broadcast Test Event');
      expect(publishedEvent.isSimulated).toBe(true);

      // Prepare expiry listener
      const expiredPromise = new Promise<any>((resolve) => {
        client.on('news:expired', (event: any) => resolve(event));
      });

      await new Promise((r) => setTimeout(r, 1100));
      await newsScheduler.tick();

      const expiredEvent = await expiredPromise;
      expect(expiredEvent.newsId).toBe(article.id);
    }, 15000);
  });

  // =========================================================================
  // 8. 100 Simultaneous Connected Users Load Benchmark
  // =========================================================================
  describe('100 Simultaneous Connected Users Load Benchmark', () => {
    it('21. should support 100 concurrent clients connected and streaming news broadcasts without packet loss', async () => {
      const TOTAL_CLIENTS = 100;
      const clientSockets: ClientSocket[] = [];
      const receivedEvents: any[] = [];

      const startTime = Date.now();

      // Connect 100 clients concurrently
      const connectPromises = Array.from({ length: TOTAL_CLIENTS }, () => {
        return new Promise<void>((resolve, reject) => {
          const socket = createSocketClient();
          clientSockets.push(socket);

          socket.on('connect', () => {
            socket.emit('subscribe', { channel: 'news' }, (ack: any) => {
              if (ack?.status === 'subscribed') {
                socket.on('news:published', (ev) => {
                  receivedEvents.push(ev);
                });
                resolve();
              } else {
                reject(new Error(`Failed to subscribe: ${JSON.stringify(ack)}`));
              }
            });
          });

          socket.on('connect_error', reject);
        });
      });

      await Promise.all(connectPromises);
      const connectDuration = Date.now() - startTime;

      expect(clientSockets.length).toBe(TOTAL_CLIENTS);

      // Broadcast a breaking news item
      const broadcastStart = Date.now();
      await newsService.createNews(adminUser.id, {
        headline: 'Massive Load Test Broadcast Headline',
        summary: 'Broadcast delivered to 100 simultaneous connected users without packet loss',
        category: 'EARNINGS_ANNOUNCEMENT',
        impactDirection: 'POSITIVE',
        severity: 'HIGH',
        targetScope: 'MARKET',
        publishImmediately: true,
      });

      // Allow event loop to dispatch
      await new Promise((r) => setTimeout(r, 600));
      const broadcastDuration = Date.now() - broadcastStart;

      // Assert 100% receipt across all 100 clients
      expect(receivedEvents.length).toBe(TOTAL_CLIENTS);
      const deliverySuccessRate = (receivedEvents.length / TOTAL_CLIENTS) * 100;
      expect(deliverySuccessRate).toBe(100);

      console.log(`
--- Phase 5C News Load Benchmark Results ---
Connected Clients: ${TOTAL_CLIENTS}
Total Connect Time: ${connectDuration} ms (Avg: ${(connectDuration / TOTAL_CLIENTS).toFixed(2)} ms/client)
100-Client News Broadcast Latency: ${broadcastDuration} ms
Delivery Success Rate: ${deliverySuccessRate}%
--------------------------------------------
`);

      // Immediate socket cleanup
      for (const s of clientSockets) {
        if (s.connected) s.disconnect();
      }
    }, 25000);
  });
});
