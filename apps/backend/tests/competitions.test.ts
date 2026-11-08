import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app';
import { generateTokens } from '../src/utils/jwt';
import { RealtimeService } from '../src/websocket/realtime.service';
import { initWebSocket, setCompetitionRepository } from '../src/websocket/socket';
import {
  InMemoryCompetitionRepository,
  InMemoryUserRepository,
  InMemoryInstrumentRepository,
  InMemoryMarketDataRepository,
  InMemoryWalletRepository,
} from './mocks/in-memory-repositories';
import {
  CompetitionService,
  CompetitionMatchingService,
  CompetitionLeaderboardService,
  CompetitionScheduler,
  CompetitionController,
} from '../src/modules/competitions';

describe('Phase 5D: Multiplayer Trading Competitions & Real-Time Leaderboards', () => {
  let userRepo: InMemoryUserRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let walletRepo: InMemoryWalletRepository;
  let compRepo: InMemoryCompetitionRepository;

  let realtimeService: RealtimeService;
  let matchingService: CompetitionMatchingService;
  let leaderboardService: CompetitionLeaderboardService;
  let compService: CompetitionService;
  let compScheduler: CompetitionScheduler;
  let compController: CompetitionController;

  let app: any;
  let server: http.Server;
  let port: number;

  let creatorToken: string;
  let trader1Token: string;
  let trader2Token: string;
  let trader3Token: string;

  const CREATOR_ID = 100;
  const TRADER1_ID = 101;
  const TRADER2_ID = 102;
  const TRADER3_ID = 103;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository();
    walletRepo = new InMemoryWalletRepository();
    compRepo = new InMemoryCompetitionRepository();
    setCompetitionRepository(compRepo);

    realtimeService = new RealtimeService();
    matchingService = new CompetitionMatchingService(compRepo, realtimeService);
    leaderboardService = new CompetitionLeaderboardService(compRepo, marketDataRepo, realtimeService);
    compService = new CompetitionService(
      compRepo,
      marketDataRepo,
      instrumentRepo,
      matchingService,
      leaderboardService,
      realtimeService
    );
    compScheduler = new CompetitionScheduler(
      compRepo,
      matchingService,
      leaderboardService,
      realtimeService
    );
    compController = new CompetitionController(compService);

    // Seed test users
    await userRepo.create({
      id: CREATOR_ID,
      username: 'comp_creator',
      email: 'creator@tradegrid.internal',
      role: 'TRADER',
    } as any);
    await userRepo.create({
      id: TRADER1_ID,
      username: 'trader_alice',
      email: 'alice@tradegrid.internal',
      role: 'TRADER',
    } as any);
    await userRepo.create({
      id: TRADER2_ID,
      username: 'trader_bob',
      email: 'bob@tradegrid.internal',
      role: 'TRADER',
    } as any);
    await userRepo.create({
      id: TRADER3_ID,
      username: 'trader_charlie',
      email: 'charlie@tradegrid.internal',
      role: 'TRADER',
    } as any);

    // Seed normal user virtual wallets with standard $100k
    await walletRepo.createWallet({ user_id: CREATOR_ID, available_balance: '100000.0000' });
    await walletRepo.createWallet({ user_id: TRADER1_ID, available_balance: '100000.0000' });
    await walletRepo.createWallet({ user_id: TRADER2_ID, available_balance: '100000.0000' });
    await walletRepo.createWallet({ user_id: TRADER3_ID, available_balance: '100000.0000' });

    // Seed tradable instruments & quotes
    const inst1 = instrumentRepo.instruments.find((i) => i.id === 1)!;
    inst1.symbol = 'ALPHA';
    inst1.name = 'Alpha Dynamics';
    await marketDataRepo.upsertQuote({
      instrument_id: 1,
      symbol: 'ALPHA',
      last_price: '100.0000',
    } as any);

    const inst2 = instrumentRepo.instruments.find((i) => i.id === 2)!;
    inst2.symbol = 'BETA';
    inst2.name = 'Beta Power';
    await marketDataRepo.upsertQuote({
      instrument_id: 2,
      symbol: 'BETA',
      last_price: '50.0000',
    } as any);

    // Generate JWT access tokens
    creatorToken = generateTokens({ id: CREATOR_ID, email: 'creator@tradegrid.internal', username: 'creator', role: 'TRADER' }).accessToken;
    trader1Token = generateTokens({ id: TRADER1_ID, email: 'alice@tradegrid.internal', username: 'alice', role: 'TRADER' }).accessToken;
    trader2Token = generateTokens({ id: TRADER2_ID, email: 'bob@tradegrid.internal', username: 'bob', role: 'TRADER' }).accessToken;
    trader3Token = generateTokens({ id: TRADER3_ID, email: 'charlie@tradegrid.internal', username: 'charlie', role: 'TRADER' }).accessToken;

    // Build Express App and HTTP Server
    app = createApp({
      competitionController: compController,
      customCheckDb: async () => true,
    });

    server = http.createServer(app);
    realtimeService.setIO(initWebSocket(server));

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    compScheduler.stop();
    try {
      realtimeService.getIO()?.close();
    } catch {}
    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  // ==========================================================================
  // 1. Competition Creation & Validation
  // ==========================================================================
  describe('Competition Creation & Configuration', () => {
    it('1. should create a valid public competition and enroll creator as first participant', async () => {
      const now = Date.now();
      const startTime = new Date(now + 3600000).toISOString();
      const endTime = new Date(now + 7200000).toISOString();

      const res = await request(app)
        .post('/api/v1/competitions')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          name: 'Apex Fall Invitational',
          description: 'Official 1-hour student trading championship',
          visibility: 'PUBLIC',
          startingCapital: '50000.0000',
          maxParticipants: 50,
          minParticipants: 2,
          startTime,
          endTime,
          allowedInstruments: ['ALPHA', 'BETA'],
          permittedOrderTypes: ['LIMIT', 'MARKET'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Apex Fall Invitational');
      expect(res.body.data.creatorId).toBe(CREATOR_ID);
      expect(res.body.data.startingCapital).toBe('50000.0000');
      expect(res.body.data.status).toBe('UPCOMING');

      // Verify creator was automatically provisioned with competition account
      const account = await compRepo.getAccount(res.body.data.id, CREATOR_ID);
      expect(account).not.toBeNull();
      expect(account?.availableCash).toBe('50000.0000');
      expect(account?.reservedCash).toBe('0.0000');

      // Verify normal user wallet balance remains strictly $100k untouched
      const normalWallet = await walletRepo.findByUserId(CREATOR_ID);
      expect(normalWallet?.available_balance).toBe('100000.0000');
    });

    it('2. should reject competition creation if end time is before start time', async () => {
      const now = Date.now();
      const startTime = new Date(now + 7200000).toISOString();
      const endTime = new Date(now + 3600000).toISOString();

      const res = await request(app)
        .post('/api/v1/competitions')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          name: 'Invalid Date Championship',
          startTime,
          endTime,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('3. should enforce join code on private competition creation', async () => {
      const now = Date.now();
      const startTime = new Date(now + 3600000).toISOString();
      const endTime = new Date(now + 7200000).toISOString();

      const res = await request(app)
        .post('/api/v1/competitions')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          name: 'Secret Society Tournament',
          visibility: 'PRIVATE',
          startTime,
          endTime,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.error)).toContain('Join code is required for private competitions');
    });
  });

  // ==========================================================================
  // 2. Participation Lifecycle & Rules
  // ==========================================================================
  describe('Competition Participation Lifecycle', () => {
    let publicCompId: number;
    let privateCompId: number;

    beforeEach(async () => {
      const now = Date.now();
      const startTime = new Date(now + 3600000).toISOString();
      const endTime = new Date(now + 7200000).toISOString();

      const comp1 = await compService.createCompetition(CREATOR_ID, {
        name: 'Public Open 2026',
        description: 'Open to everyone',
        visibility: 'PUBLIC',
        startingCapital: '100000.0000',
        maxParticipants: 3,
        minParticipants: 2,
        startTime,
        endTime,
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });
      publicCompId = comp1.id;

      const comp2 = await compService.createCompetition(CREATOR_ID, {
        name: 'VIP Private Masters',
        description: 'Invite only',
        visibility: 'PRIVATE',
        joinCode: 'SECRET123',
        startingCapital: '100000.0000',
        maxParticipants: 10,
        minParticipants: 2,
        startTime,
        endTime,
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });
      privateCompId = comp2.id;
    });

    it('4. should allow users to join a public competition and provision an isolated account', async () => {
      const res = await request(app)
        .post(`/api/v1/competitions/${publicCompId}/join`)
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(TRADER1_ID);

      const account = await compRepo.getAccount(publicCompId, TRADER1_ID);
      expect(account?.availableCash).toBe('100000.0000');

      // Verify normal user wallet remains unpolluted
      const normalWallet = await walletRepo.findByUserId(TRADER1_ID);
      expect(normalWallet?.available_balance).toBe('100000.0000');
    });

    it('5. should reject duplicate joining attempts with 409 Conflict', async () => {
      await compService.joinCompetition(publicCompId, TRADER1_ID);

      const res = await request(app)
        .post(`/api/v1/competitions/${publicCompId}/join`)
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_JOINED');
    });

    it('6. should reject private competition join with missing or incorrect join code', async () => {
      const res = await request(app)
        .post(`/api/v1/competitions/${privateCompId}/join`)
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ joinCode: 'WRONG_CODE' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVALID_JOIN_CODE');

      // Success with correct join code
      const successRes = await request(app)
        .post(`/api/v1/competitions/${privateCompId}/join`)
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ joinCode: 'SECRET123' });

      expect(successRes.status).toBe(200);
    });

    it('7. should enforce maximum participant capacity constraint', async () => {
      // Comp capacity is 3. Creator is participant 1.
      await compService.joinCompetition(publicCompId, TRADER1_ID); // 2
      await compService.joinCompetition(publicCompId, TRADER2_ID); // 3 (capacity reached)

      const res = await request(app)
        .post(`/api/v1/competitions/${publicCompId}/join`)
        .set('Authorization', `Bearer ${trader3Token}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('COMPETITION_FULL');
    });

    it('8. should allow participants to leave before start, but reject creator leaving', async () => {
      await compService.joinCompetition(publicCompId, TRADER1_ID);

      // Participant leaves
      const leaveRes = await request(app)
        .post(`/api/v1/competitions/${publicCompId}/leave`)
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({});

      expect(leaveRes.status).toBe(200);
      const participant = await compRepo.findParticipant(publicCompId, TRADER1_ID);
      expect(participant?.status).toBe('LEFT');

      // Creator tries to leave
      const creatorLeave = await request(app)
        .post(`/api/v1/competitions/${publicCompId}/leave`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({});

      expect(creatorLeave.status).toBe(422);
      expect(creatorLeave.body.error.code).toBe('CREATOR_CANNOT_LEAVE');
    });
  });

  // ==========================================================================
  // 3. Lifecycle Transitions & Automated Scheduling
  // ==========================================================================
  describe('Competition Lifecycle State Transitions', () => {
    it('9. should transition UPCOMING competition to ACTIVE when start time is reached and min participants met', async () => {
      const pastStart = new Date(Date.now() - 5000).toISOString();
      const futureEnd = new Date(Date.now() + 60000).toISOString();

      const comp = await compService.createCompetition(CREATOR_ID, {
        name: 'Auto-Start Championship',
        visibility: 'PUBLIC',
        minParticipants: 2,
        startTime: pastStart,
        endTime: futureEnd,
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });

      // Join participant 2
      await compService.joinCompetition(comp.id, TRADER1_ID);

      // Execute scheduler tick
      await compScheduler.tick();

      const activeComp = await compService.getCompetitionById(comp.id);
      expect(activeComp.status).toBe('ACTIVE');
    });

    it('10. should auto-cancel competition if min participants not met by start time', async () => {
      const pastStart = new Date(Date.now() - 5000).toISOString();
      const futureEnd = new Date(Date.now() + 60000).toISOString();

      const comp = await compService.createCompetition(CREATOR_ID, {
        name: 'Under-enrolled Cup',
        visibility: 'PUBLIC',
        minParticipants: 3, // Requires 3, only creator joined (1)
        startTime: pastStart,
        endTime: futureEnd,
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });

      await compScheduler.tick();

      const cancelledComp = await compService.getCompetitionById(comp.id);
      expect(cancelledComp.status).toBe('CANCELLED');
    });

    it('11. should transition ACTIVE competition to COMPLETED, freeze leaderboard, and cancel open orders at end time', async () => {
      const pastStart = new Date(Date.now() - 10000).toISOString();
      const pastEnd = new Date(Date.now() - 1000).toISOString();

      const comp = await compService.createCompetition(CREATOR_ID, {
        name: 'Expiring Sprint',
        visibility: 'PUBLIC',
        startTime: pastStart,
        endTime: pastEnd,
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });

      await compService.joinCompetition(comp.id, TRADER1_ID);
      await compRepo.updateCompetition(comp.id, { status: 'ACTIVE' });

      // Place open limit order
      const { order } = await compService.submitOrder(comp.id, TRADER1_ID, {
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '95.0000',
      });
      expect(order.status).toBe('OPEN');

      // Execute scheduler tick for completion
      await compScheduler.tick();

      const completedComp = await compService.getCompetitionById(comp.id);
      expect(completedComp.status).toBe('COMPLETED');

      // Order should be cancelled
      const finalOrder = await compRepo.getOrderById(order.id);
      expect(finalOrder?.status).toBe('CANCELLED');

      // Leaderboard snapshot should be frozen
      const snapshot = await compRepo.getLatestLeaderboardSnapshot(comp.id);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 4. Isolated Competition Trading & Atomic Settlement
  // ==========================================================================
  describe('Competition Order Matching & Portfolio Settlement', () => {
    let activeCompId: number;

    beforeEach(async () => {
      const pastStart = new Date(Date.now() - 10000).toISOString();
      const futureEnd = new Date(Date.now() + 3600000).toISOString();

      const comp = await compService.createCompetition(CREATOR_ID, {
        name: 'Active League 1',
        visibility: 'PUBLIC',
        startingCapital: '100000.0000',
        startTime: pastStart,
        endTime: futureEnd,
        permittedOrderTypes: ['LIMIT', 'MARKET'],
        allowedInstruments: ['ALPHA', 'BETA'],
      });
      activeCompId = comp.id;

      await compService.joinCompetition(activeCompId, TRADER1_ID);
      await compService.joinCompetition(activeCompId, TRADER2_ID);
      await compRepo.updateCompetition(activeCompId, { status: 'ACTIVE' });
    });

    it('12. should reserve competition cash on BUY order and reject if insufficient funds', async () => {
      // Alice tries to buy $150,000 worth of stock with $100,000 capital
      const failRes = await request(app)
        .post(`/api/v1/competitions/${activeCompId}/orders`)
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({
          instrumentId: 1,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '1500.0000',
          limitPrice: '100.0000',
        });

      expect(failRes.status).toBe(422);
      expect(failRes.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // Alice places feasible order: 100 ALPHA @ 100 = $10,000 reserved
      const successRes = await request(app)
        .post(`/api/v1/competitions/${activeCompId}/orders`)
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({
          instrumentId: 1,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '100.0000',
          limitPrice: '100.0000',
        });

      expect(successRes.status).toBe(201);
      expect(successRes.body.data.order.status).toBe('OPEN');

      const account = await compRepo.getAccount(activeCompId, TRADER1_ID);
      expect(account?.availableCash).toBe('90000.0000');
      expect(account?.reservedCash).toBe('10000.0000');

      // Normal wallet balance still strictly 100k
      const normalWallet = await walletRepo.findByUserId(TRADER1_ID);
      expect(normalWallet?.available_balance).toBe('100000.0000');
    });

    it('13. should match BUY and SELL orders within the competition and settle atomically', async () => {
      // Bob first acquires 50 ALPHA via initial position seed
      await compRepo.upsertPosition({
        competitionId: activeCompId,
        userId: TRADER2_ID,
        instrumentId: 1,
        quantity: '50.0000',
        averageEntryPrice: '90.0000',
        realizedPnl: '0.0000',
      });

      // Alice places resting BUY order: 50 ALPHA @ $100.00
      await compService.submitOrder(activeCompId, TRADER1_ID, {
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '50.0000',
        limitPrice: '100.0000',
      });

      // Bob submits aggressive SELL order: 50 ALPHA @ $100.00
      const matchRes = await compService.submitOrder(activeCompId, TRADER2_ID, {
        instrumentId: 1,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '50.0000',
        limitPrice: '100.0000',
      });

      expect(matchRes.trades.length).toBe(1);
      const trade = matchRes.trades[0];
      expect(trade.price).toBe('100.0000');
      expect(trade.quantity).toBe('50.0000');
      expect(trade.amount).toBe('5000.0000');

      // Alice (Buyer) paid $5,000, now owns 50 ALPHA
      const aliceAccount = await compRepo.getAccount(activeCompId, TRADER1_ID);
      expect(aliceAccount?.availableCash).toBe('95000.0000');
      expect(aliceAccount?.reservedCash).toBe('0.0000');

      const alicePos = await compRepo.getPosition(activeCompId, TRADER1_ID, 1);
      expect(alicePos?.quantity).toBe('50.0000');
      expect(alicePos?.averageEntryPrice).toBe('100.0000');

      // Bob (Seller) received $5,000, realized profit ($100 - $90) * 50 = $500
      const bobAccount = await compRepo.getAccount(activeCompId, TRADER2_ID);
      expect(bobAccount?.availableCash).toBe('105000.0000');

      const bobPos = await compRepo.getPosition(activeCompId, TRADER2_ID, 1);
      expect(bobPos?.quantity).toBe('0.0000');
      expect(bobPos?.realizedPnL).toBe('500.0000');

      // Normal wallets of Alice and Bob remain 100% untouched
      const aliceNormal = await walletRepo.findByUserId(TRADER1_ID);
      const bobNormal = await walletRepo.findByUserId(TRADER2_ID);
      expect(aliceNormal?.available_balance).toBe('100000.0000');
      expect(bobNormal?.available_balance).toBe('100000.0000');
    });

    it('14. should prevent self-trading / wash sales within competition', async () => {
      // Alice places resting BUY
      await compService.submitOrder(activeCompId, TRADER1_ID, {
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.0000',
      });

      // Give Alice 10 shares
      await compRepo.upsertPosition({
        competitionId: activeCompId,
        userId: TRADER1_ID,
        instrumentId: 1,
        quantity: '10.0000',
        averageEntryPrice: '100.0000',
        realizedPnl: '0.0000',
      });

      // Alice places matching SELL against herself
      const res = await compService.submitOrder(activeCompId, TRADER1_ID, {
        instrumentId: 1,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '10.0000',
        limitPrice: '100.0000',
      });

      // Zero trades executed due to wash sale prevention
      expect(res.trades.length).toBe(0);
    });

    it('15. should reject orders for disallowed instruments or order types', async () => {
      // Instrument 3 not in allowed instruments
      await instrumentRepo.create({
        id: 3,
        symbol: 'GAMMA',
        name: 'Gamma Metals',
        exchange: 'NSE',
        marketStatus: 'ACTIVE',
      } as any);

      const res = await request(app)
        .post(`/api/v1/competitions/${activeCompId}/orders`)
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({
          instrumentId: 3,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INSTRUMENT_NOT_ALLOWED');
    });
  });

  // ==========================================================================
  // 5. Leaderboard Calculation & Deterministic Tie-Breakers
  // ==========================================================================
  describe('Server-Authoritative Leaderboard Engine', () => {
    it('16. should rank participants by Total Return Percentage with deterministic tie-breakers', async () => {
      const now = Date.now();
      const comp = await compService.createCompetition(CREATOR_ID, {
        name: 'Leaderboard Test Tournament',
        visibility: 'PUBLIC',
        startingCapital: '100000.0000',
        startTime: new Date(now - 10000).toISOString(),
        endTime: new Date(now + 3600000).toISOString(),
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });

      await compService.joinCompetition(comp.id, TRADER1_ID);
      await compService.joinCompetition(comp.id, TRADER2_ID);

      // Trader 1 (Alice): gains ₹5,000 profit -> Portfolio: ₹105,000 (+5.00%)
      await compRepo.updateAccount(comp.id, TRADER1_ID, {
        available_cash: '105000.0000',
      });

      // Trader 2 (Bob): gains ₹10,000 profit -> Portfolio: ₹110,000 (+10.00%)
      await compRepo.updateAccount(comp.id, TRADER2_ID, {
        available_cash: '110000.0000',
      });

      const leaderboard = await leaderboardService.computeLeaderboard(comp.id);
      expect(leaderboard.length).toBe(3); // Creator, Alice, Bob

      // Bob should be Rank 1 (+10%)
      expect(leaderboard[0].userId).toBe(TRADER2_ID);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].totalReturnPercent).toBe('10.0000');

      // Alice should be Rank 2 (+5%)
      expect(leaderboard[1].userId).toBe(TRADER1_ID);
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[1].totalReturnPercent).toBe('5.0000');

      // Creator should be Rank 3 (0%)
      expect(leaderboard[2].userId).toBe(CREATOR_ID);
      expect(leaderboard[2].rank).toBe(3);
      expect(leaderboard[2].totalReturnPercent).toBe('0.0000');
    });

    it('17. should reject post-completion trading and serve immutable final leaderboard snapshot', async () => {
      const comp = await compService.createCompetition(CREATOR_ID, {
        name: 'Completed Tourney',
        visibility: 'PUBLIC',
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date(Date.now() - 1000).toISOString(),
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });

      await compRepo.updateCompetition(comp.id, { status: 'COMPLETED' });

      // Save frozen snapshot
      await compRepo.saveLeaderboardSnapshot(
        comp.id,
        [
          {
            rank: 1,
            participantId: 1,
            userId: CREATOR_ID,
            username: 'comp_creator',
            portfolioValue: '120000.0000',
            totalReturnPercent: '20.0000',
            realizedPnL: '20000.0000',
            unrealizedPnL: '0.0000',
            tradeCount: 5,
          },
        ],
        true
      );

      // Attempt order placement in COMPLETED competition
      const orderRes = await request(app)
        .post(`/api/v1/competitions/${comp.id}/orders`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          instrumentId: 1,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '10.0000',
          limitPrice: '100.0000',
        });

      expect(orderRes.status).toBe(422);
      expect(orderRes.body.error.code).toBe('COMPETITION_NOT_ACTIVE');

      // Leaderboard returns frozen snapshot
      const lbRes = await request(app).get(`/api/v1/competitions/${comp.id}/leaderboard`);
      expect(lbRes.status).toBe(200);
      expect(lbRes.body.data.leaderboard[0].totalReturnPercent).toBe('20.0000');
    });
  });

  // ==========================================================================
  // 6. Cross-Competition & System Isolation
  // ==========================================================================
  describe('Strict Account & Portfolio Isolation', () => {
    it('18. should strictly isolate orders, accounts, and trades between separate competitions', async () => {
      const now = Date.now();
      const compA = await compService.createCompetition(CREATOR_ID, {
        name: 'Competition A',
        visibility: 'PUBLIC',
        startingCapital: '50000.0000',
        startTime: new Date(now - 10000).toISOString(),
        endTime: new Date(now + 3600000).toISOString(),
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });
      await compService.joinCompetition(compA.id, TRADER1_ID);
      await compRepo.updateCompetition(compA.id, { status: 'ACTIVE' });

      const compB = await compService.createCompetition(CREATOR_ID, {
        name: 'Competition B',
        visibility: 'PUBLIC',
        startingCapital: '200000.0000',
        startTime: new Date(now - 10000).toISOString(),
        endTime: new Date(now + 3600000).toISOString(),
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });
      await compService.joinCompetition(compB.id, TRADER1_ID);
      await compRepo.updateCompetition(compB.id, { status: 'ACTIVE' });

      // Alice places BUY order in Comp A
      await compService.submitOrder(compA.id, TRADER1_ID, {
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '50.0000',
        limitPrice: '100.0000',
      });

      // Comp A account has $5,000 reserved
      const accountA = await compRepo.getAccount(compA.id, TRADER1_ID);
      expect(accountA?.availableCash).toBe('45000.0000');
      expect(accountA?.reservedCash).toBe('5000.0000');

      // Comp B account is completely untouched ($200,000 available, $0 reserved)
      const accountB = await compRepo.getAccount(compB.id, TRADER1_ID);
      expect(accountB?.availableCash).toBe('200000.0000');
      expect(accountB?.reservedCash).toBe('0.0000');

      // Real user wallet is completely untouched ($100,000)
      const realWallet = await walletRepo.findByUserId(TRADER1_ID);
      expect(realWallet?.available_balance).toBe('100000.0000');
    });
  });

  // ==========================================================================
  // 7. WebSocket Real-Time Channels & Room Authorization
  // ==========================================================================
  describe('WebSocket Real-Time Channels & Security', () => {
    it('19. should allow authorized participants into private competition rooms and reject unauthorized users', async () => {
      const now = Date.now();
      const privateComp = await compService.createCompetition(CREATOR_ID, {
        name: 'Secure Vault Match',
        visibility: 'PRIVATE',
        joinCode: 'VAULT99',
        startTime: new Date(now + 3600000).toISOString(),
        endTime: new Date(now + 7200000).toISOString(),
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });

      // Trader 1 joins private competition
      await compService.joinCompetition(privateComp.id, TRADER1_ID, { joinCode: 'VAULT99' });

      // Connect Trader 1 socket (enrolled participant)
      const clientEnrolled: ClientSocket = Client(`http://localhost:${port}`, {
        auth: { token: trader1Token },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => clientEnrolled.on('connect', () => resolve()));

      const subAckEnrolled = await new Promise<any>((resolve) => {
        clientEnrolled.emit('subscribe', { channel: `competition:${privateComp.id}` }, (res: any) =>
          resolve(res)
        );
      });
      expect(subAckEnrolled.status).toBe('subscribed');

      // Connect Trader 2 socket (NOT enrolled)
      const clientUnenrolled: ClientSocket = Client(`http://localhost:${port}`, {
        auth: { token: trader2Token },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => clientUnenrolled.on('connect', () => resolve()));

      const subAckUnenrolled = await new Promise<any>((resolve) => {
        clientUnenrolled.emit('subscribe', { channel: `competition:${privateComp.id}` }, (res: any) =>
          resolve(res)
        );
      });
      expect(subAckUnenrolled.status).toBe('error');
      expect(subAckUnenrolled.message).toContain('Unauthorized');

      clientEnrolled.disconnect();
      clientUnenrolled.disconnect();
    });
  });

  // ==========================================================================
  // 8. 100 Simultaneous Connected Users Load Benchmark
  // ==========================================================================
  describe('100 Simultaneous Connected Users Load Benchmark', () => {
    it('20. should support 100 concurrent clients connected and streaming competition leaderboard updates without packet loss', async () => {
      const NUM_CLIENTS = 100;
      const clients: ClientSocket[] = [];
      const connectPromises: Promise<void>[] = [];

      const now = Date.now();
      const comp = await compService.createCompetition(CREATOR_ID, {
        name: 'Scale Test Tournament',
        visibility: 'PUBLIC',
        startTime: new Date(now - 10000).toISOString(),
        endTime: new Date(now + 3600000).toISOString(),
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });

      for (let i = 0; i < NUM_CLIENTS; i++) {
        const client = Client(`http://localhost:${port}`, {
          transports: ['websocket'],
        });
        clients.push(client);

        connectPromises.push(
          new Promise<void>((resolve) => {
            client.on('connect', () => {
              client.emit('subscribe', { channel: `competition:${comp.id}` }, () => {
                resolve();
              });
            });
          })
        );
      }

      await Promise.all(connectPromises);

      // Track received leaderboard events across all 100 sockets
      let receivedCount = 0;
      const receivePromises: Promise<void>[] = clients.map(
        (client) =>
          new Promise<void>((resolve) => {
            client.on('competition:leaderboard_updated', (event: any) => {
              expect(event.competitionId).toBe(comp.id);
              receivedCount++;
              resolve();
            });
          })
      );

      // Trigger Leaderboard Broadcast
      await leaderboardService.computeLeaderboard(comp.id);

      await Promise.all(receivePromises);
      expect(receivedCount).toBe(NUM_CLIENTS);

      clients.forEach((c) => c.disconnect());
      // Give sockets a tiny grace period to flush disconnects
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }, 30000);
  });
});
