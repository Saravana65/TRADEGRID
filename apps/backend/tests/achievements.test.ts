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
  InMemoryAchievementRepository,
} from './mocks/in-memory-repositories';
import { AchievementService } from '../src/modules/achievements/achievement.service';
import { AchievementController } from '../src/modules/achievements/achievement.controller';
import { RealtimeService } from '../src/websocket/realtime.service';

describe('Phase 8: Trader Achievements & Gamification Engine', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let achievementRepo: InMemoryAchievementRepository;

  let authService: AuthService;
  let authController: AuthController;
  let achievementService: AchievementService;
  let achievementController: AchievementController;
  let mockRealtimeService: RealtimeService;

  let app: any;
  let server: http.Server;
  let userAToken: string;
  let userBToken: string;
  let userAId: number;
  let userBId: number;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    achievementRepo = new InMemoryAchievementRepository();

    authService = new AuthService(userRepo, sessionRepo, walletRepo, ledgerRepo);
    authController = new AuthController(authService);

    // Mock RealtimeService for tests
    mockRealtimeService = {
      emitAchievementUnlocked: () => {},
    } as any;

    achievementService = new AchievementService(achievementRepo, mockRealtimeService);
    achievementController = new AchievementController(achievementService);

    app = createApp({
      authController,
      achievementController,
      customCheckDb: async () => true,
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    // Register User A and User B
    const userARes = await authService.register({
      username: 'gamer_trader_a',
      email: 'gamer_a@tradegrid.internal',
      password: 'Password123!',
    });
    userAToken = userARes.tokens.accessToken;
    userAId = userARes.user.id;
    achievementRepo.setTraderUsername(userAId, 'gamer_trader_a');

    const userBRes = await authService.register({
      username: 'gamer_trader_b',
      email: 'gamer_b@tradegrid.internal',
      password: 'Password123!',
    });
    userBToken = userBRes.tokens.accessToken;
    userBId = userBRes.user.id;
    achievementRepo.setTraderUsername(userBId, 'gamer_trader_b');
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ==========================================================================
  // 1. Master Definitions & Catalog
  // ==========================================================================
  describe('1. Master Definitions & Catalog Structure', () => {
    it('should provide full achievement catalog covering all 4 core categories', async () => {
      const defs = await achievementService.getUserAchievements(userAId);
      expect(defs.length).toBeGreaterThanOrEqual(15);

      const categories = new Set(defs.map((d) => d.category));
      expect(categories.has('BACKTESTING')).toBe(true);
      expect(categories.has('COMPETITION')).toBe(true);
      expect(categories.has('TRADING')).toBe(true);
      expect(categories.has('LEARNING')).toBe(true);
    });

    it('should filter achievements by category correctly via REST API', async () => {
      const res = await request(app)
        .get('/api/v1/achievements?category=TRADING')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const item of res.body.data) {
        expect(item.category).toBe('TRADING');
      }
    });
  });

  // ==========================================================================
  // 2. Server-Authoritative Idempotent Unlocking
  // ==========================================================================
  describe('2. Server-Authoritative Idempotent Unlocking & Anti-Double-Credit', () => {
    it('should unlock an achievement and credit gamification points exactly once', async () => {
      const event = await achievementService.unlock(userAId, 'FIRST_TRADE');
      expect(event).not.toBeNull();
      expect(event?.achievement.code).toBe('FIRST_TRADE');
      expect(event?.pointsAwarded).toBe(10);
      expect(event?.newTotalPoints).toBe(10);
      expect(event?.newLevel).toBe(1);

      const stats = await achievementService.getUserStats(userAId);
      expect(stats.totalPoints).toBe(10);
      expect(stats.achievementsUnlockedCount).toBe(1);
    });

    it('should guarantee idempotency: duplicate unlock attempts return null and do NOT award duplicate points', async () => {
      // First unlock
      const first = await achievementService.unlock(userAId, 'FIRST_TRADE');
      expect(first).not.toBeNull();

      // Second attempt (e.g. duplicate event replay)
      const second = await achievementService.unlock(userAId, 'FIRST_TRADE');
      expect(second).toBeNull();

      // Third attempt
      const third = await achievementService.unlock(userAId, 'FIRST_TRADE');
      expect(third).toBeNull();

      // Invariant: Points must remain exactly 10, NOT 30!
      const stats = await achievementService.getUserStats(userAId);
      expect(stats.totalPoints).toBe(10);
      expect(stats.achievementsUnlockedCount).toBe(1);
    });

    it('should increment progress and automatically unlock when target is reached', async () => {
      // TRADES_10 requires 10 progress points
      for (let i = 1; i <= 9; i++) {
        const res = await achievementService.recordProgress(userAId, 'TRADES_10', 1);
        expect(res).toBeNull(); // Not unlocked yet
      }

      // 10th progress reaches target and triggers unlock
      const unlockEvent = await achievementService.recordProgress(userAId, 'TRADES_10', 1);
      expect(unlockEvent).not.toBeNull();
      expect(unlockEvent?.achievement.code).toBe('TRADES_10');
      expect(unlockEvent?.pointsAwarded).toBe(25);

      // Verify progress is 100%
      const items = await achievementService.getUserAchievements(userAId, 'TRADING');
      const trades10 = items.find((i) => i.code === 'TRADES_10');
      expect(trades10?.isUnlocked).toBe(true);
      expect(trades10?.progressPercent).toBe(100);
    });
  });

  // ==========================================================================
  // 3. Level Progression Mathematics & Titles
  // ==========================================================================
  describe('3. Level Progression Mathematics & Titles', () => {
    it('should calculate Level and Titles accurately based on 100 points per level', async () => {
      // Initial state: 0 points, Level 1
      let stats = await achievementService.getUserStats(userAId);
      expect(stats.totalPoints).toBe(0);
      expect(stats.currentLevel).toBe(1);
      expect(stats.levelTitle).toBe('Novice Trader');
      expect(stats.pointsToNextLevel).toBe(100);
      expect(stats.currentLevelProgressPercent).toBe(0);

      // Unlock badges accumulating 100+ points:
      // FIRST_TRADE (10) + TRADES_10 (25) + TRADES_50 (75) = 110 points => Level 2!
      await achievementService.unlock(userAId, 'FIRST_TRADE');
      await achievementService.unlock(userAId, 'TRADES_10');
      const level2Event = await achievementService.unlock(userAId, 'TRADES_50');

      expect(level2Event?.leveledUp).toBe(true);
      expect(level2Event?.newLevel).toBe(2);
      expect(level2Event?.newLevelTitle).toBe('Apprentice');

      stats = await achievementService.getUserStats(userAId);
      expect(stats.totalPoints).toBe(110);
      expect(stats.currentLevel).toBe(2);
      expect(stats.levelTitle).toBe('Apprentice');
      expect(stats.pointsToNextLevel).toBe(90); // 10 points into Level 2, 90 to Level 3
      expect(stats.currentLevelProgressPercent).toBe(10);
    });

    it('should advance to higher titles up to Grandmaster for high-scoring traders', () => {
      expect(achievementService.getTitleForLevel(1)).toBe('Novice Trader');
      expect(achievementService.getTitleForLevel(2)).toBe('Apprentice');
      expect(achievementService.getTitleForLevel(3)).toBe('Market Observer');
      expect(achievementService.getTitleForLevel(4)).toBe('Active Trader');
      expect(achievementService.getTitleForLevel(5)).toBe('Portfolio Analyst');
      expect(achievementService.getTitleForLevel(6)).toBe('Quantitative Strategist');
      expect(achievementService.getTitleForLevel(7)).toBe('Senior Trader');
      expect(achievementService.getTitleForLevel(8)).toBe('Market Maker');
      expect(achievementService.getTitleForLevel(9)).toBe('Master Trader');
      expect(achievementService.getTitleForLevel(10)).toBe('Grandmaster of the Grid');
    });
  });

  // ==========================================================================
  // 4. User Isolation & Privacy Controls
  // ==========================================================================
  describe('4. Strict User Isolation & Privacy Invariants', () => {
    it('should strictly isolate achievements and points between User A and User B', async () => {
      // User A unlocks FIRST_BACKTEST and STRATEGY_EXPLORER
      await achievementService.unlock(userAId, 'FIRST_BACKTEST');
      await achievementService.unlock(userAId, 'STRATEGY_EXPLORER');

      // User B has not unlocked anything
      const userBStats = await achievementService.getUserStats(userBId);
      expect(userBStats.totalPoints).toBe(0);
      expect(userBStats.achievementsUnlockedCount).toBe(0);

      const userBItems = await achievementService.getUserAchievements(userBId);
      const unlockedForB = userBItems.filter((i) => i.isUnlocked);
      expect(unlockedForB).toHaveLength(0);

      // User A stats must reflect their own points
      const userAStats = await achievementService.getUserStats(userAId);
      expect(userAStats.totalPoints).toBe(35);
      expect(userAStats.achievementsUnlockedCount).toBe(2);
    });

    it('GET /api/v1/achievements/user/:userId should display public showcase with only unlocked badges', async () => {
      await achievementService.unlock(userAId, 'FIRST_TRADE');
      await achievementService.unlock(userAId, 'FIRST_BACKTEST');
      // Set partial progress on another badge
      await achievementService.recordProgress(userAId, 'TRADES_10', 4);

      const res = await request(app).get(`/api/v1/achievements/user/${userAId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(userAId);
      expect(res.body.data.stats.totalPoints).toBe(20);
      // Public showcase only shows the 2 unlocked badges, not private in-progress badges
      expect(res.body.data.unlockedBadges).toHaveLength(2);
      expect(res.body.data.unlockedBadges.map((b: any) => b.code)).toEqual(
        expect.arrayContaining(['FIRST_TRADE', 'FIRST_BACKTEST'])
      );
    });

    it('should reject unauthenticated requests to private achievement endpoints with 401', async () => {
      const getRes = await request(app).get('/api/v1/achievements');
      expect(getRes.status).toBe(401);

      const statsRes = await request(app).get('/api/v1/achievements/stats');
      expect(statsRes.status).toBe(401);
    });
  });

  // ==========================================================================
  // 5. Global Leaderboard
  // ==========================================================================
  describe('5. Global Gamification Leaderboard', () => {
    it('should rank traders in descending order of achievement points', async () => {
      // User A gets 35 points
      await achievementService.unlock(userAId, 'FIRST_BACKTEST'); // 10
      await achievementService.unlock(userAId, 'STRATEGY_EXPLORER'); // 25

      // User B gets 75 points
      await achievementService.unlock(userBId, 'TRADES_50'); // 75

      const res = await request(app).get('/api/v1/achievements/leaderboard?limit=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      // User B should be rank 1 with 75 points
      expect(res.body.data[0].userId).toBe(userBId);
      expect(res.body.data[0].totalPoints).toBe(75);
      expect(res.body.data[0].rank).toBe(1);

      // User A should be rank 2 with 35 points
      expect(res.body.data[1].userId).toBe(userAId);
      expect(res.body.data[1].totalPoints).toBe(35);
      expect(res.body.data[1].rank).toBe(2);
    });
  });

  // ==========================================================================
  // 6. Action Hooks Integration
  // ==========================================================================
  describe('6. Action Hooks Integration', () => {
    it('should trigger trade badges on onTradeExecuted', async () => {
      await achievementService.onTradeExecuted(userAId, 10, 3);

      const items = await achievementService.getUserAchievements(userAId, 'TRADING');
      const firstTrade = items.find((i) => i.code === 'FIRST_TRADE');
      const trades10 = items.find((i) => i.code === 'TRADES_10');
      const diversified = items.find((i) => i.code === 'DIVERSIFIED_TRADER');

      expect(firstTrade?.isUnlocked).toBe(true);
      expect(trades10?.isUnlocked).toBe(true);
      expect(diversified?.isUnlocked).toBe(true);
    });

    it('should trigger backtest badges on onBacktestExecuted', async () => {
      await achievementService.onBacktestExecuted(userAId, 10, 3, true);

      const items = await achievementService.getUserAchievements(userAId, 'BACKTESTING');
      const firstBacktest = items.find((i) => i.code === 'FIRST_BACKTEST');
      const explorer = items.find((i) => i.code === 'STRATEGY_EXPLORER');
      const backtest10 = items.find((i) => i.code === 'BACKTEST_10');
      const riskConscious = items.find((i) => i.code === 'RISK_CONSCIOUS');

      expect(firstBacktest?.isUnlocked).toBe(true);
      expect(explorer?.isUnlocked).toBe(true);
      expect(backtest10?.isUnlocked).toBe(true);
      expect(riskConscious?.isUnlocked).toBe(true);
    });

    it('should trigger competition badges on onCompetitionCompleted', async () => {
      await achievementService.onCompetitionCompleted(userAId, 1);

      const items = await achievementService.getUserAchievements(userAId, 'COMPETITION');
      const winner = items.find((i) => i.code === 'COMPETITION_WINNER');
      const top10 = items.find((i) => i.code === 'TOP_10_FINISH');

      expect(winner?.isUnlocked).toBe(true);
      expect(top10?.isUnlocked).toBe(true);
    });

    it('should trigger learning and social badges on onLearningAction', async () => {
      await achievementService.onLearningAction(userAId, 'CHART_SAVED');
      await achievementService.onLearningAction(userAId, 'INDICATOR_ANALYZED');
      await achievementService.onLearningAction(userAId, 'PORTFOLIO_REVIEW');
      await achievementService.onLearningAction(userAId, 'CHAT_SENT');

      const items = await achievementService.getUserAchievements(userAId, 'LEARNING');
      expect(items.every((i) => i.isUnlocked)).toBe(true);
    });
  });

  // ==========================================================================
  // 7. 100 Concurrent Users Stress Verification
  // ==========================================================================
  describe('7. 100 Concurrent Users Stress Verification', () => {
    it('should handle 100 concurrent achievement, stats, and leaderboard requests without race conditions', async () => {
      const concurrentRequests = 100;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const isUserA = i % 2 === 0;
        const token = isUserA ? userAToken : userBToken;

        if (i % 3 === 0) {
          promises.push(
            request(app).get('/api/v1/achievements').set('Authorization', `Bearer ${token}`)
          );
        } else if (i % 3 === 1) {
          promises.push(
            request(app).get('/api/v1/achievements/stats').set('Authorization', `Bearer ${token}`)
          );
        } else {
          promises.push(request(app).get('/api/v1/achievements/leaderboard?limit=10'));
        }
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);

      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });
  });
});
