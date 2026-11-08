import {
  AchievementCategory,
  AchievementDefinition,
  UserAchievement,
  AchievementProgress,
  UserAchievementStats,
  AchievementLeaderboardEntry,
  UserAchievementItem,
  AchievementUnlockedEvent,
} from '@tradegrid/shared-types';
import { IAchievementRepository } from './achievement.types';
import { STANDARD_ACHIEVEMENTS, getAchievementDefinition } from './achievement.definitions';
import { RealtimeService, realtimeService as defaultRealtimeService } from '../../websocket/realtime.service';

export class AchievementService {
  constructor(
    private readonly repo: IAchievementRepository,
    private readonly realtimeService: RealtimeService = defaultRealtimeService
  ) {}

  /**
   * Calculates player rank title based on level.
   */
  getTitleForLevel(level: number): string {
    if (level >= 10) return 'Grandmaster of the Grid';
    if (level === 9) return 'Master Trader';
    if (level === 8) return 'Market Maker';
    if (level === 7) return 'Senior Trader';
    if (level === 6) return 'Quantitative Strategist';
    if (level === 5) return 'Portfolio Analyst';
    if (level === 4) return 'Active Trader';
    if (level === 3) return 'Market Observer';
    if (level === 2) return 'Apprentice';
    return 'Novice Trader';
  }

  /**
   * Idempotently unlocks an achievement for a user.
   * If already unlocked, returns null without mutating state or points.
   */
  async unlock(userId: number, code: string): Promise<AchievementUnlockedEvent | null> {
    const isUnlocked = await this.repo.hasUnlocked(userId, code);
    if (isUnlocked) return null;

    const definition = (await this.repo.getDefinitionByCode(code)) || getAchievementDefinition(code);
    if (!definition) return null;

    const recorded = await this.repo.recordUnlock(userId, code);
    if (!recorded) return null;

    const now = new Date().toISOString();

    // Mark progress as completed
    await this.repo.upsertProgress(
      userId,
      code,
      definition.requiredProgress,
      definition.requiredProgress,
      true
    );

    // Update user stats and level
    const existingStats = await this.repo.getUserStats(userId);
    const oldPoints = existingStats ? existingStats.total_points : 0;
    const oldLevel = existingStats ? existingStats.current_level : 1;
    const oldUnlocksCount = existingStats ? existingStats.achievements_unlocked_count : 0;

    const newTotalPoints = oldPoints + definition.points;
    const newLevel = Math.floor(newTotalPoints / 100) + 1;
    const newTitle = this.getTitleForLevel(newLevel);
    const leveledUp = newLevel > oldLevel;

    await this.repo.upsertUserStats({
      user_id: userId,
      total_points: newTotalPoints,
      current_level: newLevel,
      title: newTitle,
      achievements_unlocked_count: oldUnlocksCount + 1,
    });

    const eventPayload: AchievementUnlockedEvent = {
      userId,
      achievement: definition,
      pointsAwarded: definition.points,
      newTotalPoints,
      newLevel,
      leveledUp,
      newLevelTitle: newTitle,
      unlockedAt: now,
    };

    // Broadcast real-time achievement notification to user's private channel
    try {
      this.realtimeService.emitAchievementUnlocked(eventPayload);
    } catch {
      // Non-blocking in test environment
    }

    return eventPayload;
  }

  /**
   * Records incremental progress toward an achievement milestone.
   */
  async recordProgress(
    userId: number,
    code: string,
    increment: number = 1
  ): Promise<AchievementUnlockedEvent | null> {
    const isUnlocked = await this.repo.hasUnlocked(userId, code);
    if (isUnlocked) return null;

    const definition = (await this.repo.getDefinitionByCode(code)) || getAchievementDefinition(code);
    if (!definition) return null;

    const currentProg = await this.repo.getProgress(userId, code);
    const prev = currentProg ? currentProg.currentProgress : 0;
    const nextProgress = prev + increment;

    if (nextProgress >= definition.requiredProgress) {
      return this.unlock(userId, code);
    } else {
      await this.repo.upsertProgress(
        userId,
        code,
        nextProgress,
        definition.requiredProgress,
        false
      );
      return null;
    }
  }

  /**
   * Retrieves full catalog with user's unlock and progress status.
   */
  async getUserAchievements(
    userId: number,
    category?: AchievementCategory
  ): Promise<UserAchievementItem[]> {
    const definitions = await this.repo.getDefinitions(category);
    const userUnlocks = await this.repo.getUserUnlocks(userId);
    const userProgress = await this.repo.getAllProgressForUser(userId);

    const unlockMap = new Map<string, UserAchievement>(
      userUnlocks.map((u) => [u.achievementCode, u])
    );
    const progressMap = new Map<string, AchievementProgress>(
      userProgress.map((p) => [p.achievementCode, p])
    );

    return definitions.map((def) => {
      const unlock = unlockMap.get(def.code);
      const isUnlocked = !!unlock;
      const prog = progressMap.get(def.code);

      const currentProgress = isUnlocked
        ? def.requiredProgress
        : prog
        ? prog.currentProgress
        : 0;

      const progressPercent = Math.min(
        100,
        Math.max(0, Math.round((currentProgress / def.requiredProgress) * 100))
      );

      return {
        ...def,
        isUnlocked,
        unlockedAt: unlock?.unlockedAt,
        currentProgress,
        targetProgress: def.requiredProgress,
        progressPercent,
      };
    });
  }

  /**
   * Retrieves player stats (level, points, titles, progress % toward next level).
   */
  async getUserStats(userId: number): Promise<UserAchievementStats> {
    const stats = await this.repo.getUserStats(userId);
    const totalPoints = stats ? stats.total_points : 0;
    const currentLevel = stats ? stats.current_level : 1;
    const levelTitle = stats ? stats.title : this.getTitleForLevel(1);
    const unlockedCount = stats ? stats.achievements_unlocked_count : 0;

    const totalAchievementsCount = STANDARD_ACHIEVEMENTS.length;
    const completionPercent = Math.min(
      100,
      Math.round((unlockedCount / Math.max(1, totalAchievementsCount)) * 100)
    );

    const pointsInCurrentLevel = totalPoints % 100;
    const pointsToNextLevel = 100 - pointsInCurrentLevel;
    const currentLevelProgressPercent = pointsInCurrentLevel;

    return {
      userId,
      totalPoints,
      currentLevel,
      levelTitle,
      pointsToNextLevel,
      currentLevelProgressPercent,
      achievementsUnlockedCount: unlockedCount,
      totalAchievementsCount,
      completionPercent,
    };
  }

  /**
   * Retrieves global achievement leaderboard.
   */
  async getLeaderboard(limit: number = 20): Promise<AchievementLeaderboardEntry[]> {
    return this.repo.getLeaderboard(limit);
  }

  // ==========================================================================
  // Automated Event Triggers
  // ==========================================================================

  async onTradeExecuted(
    userId: number,
    totalTradesCount: number,
    heldSectorsCount: number = 1
  ): Promise<void> {
    await this.recordProgress(userId, 'FIRST_TRADE', 1);

    if (totalTradesCount >= 10) await this.unlock(userId, 'TRADES_10');
    else await this.repo.upsertProgress(userId, 'TRADES_10', totalTradesCount, 10, false);

    if (totalTradesCount >= 50) await this.unlock(userId, 'TRADES_50');
    else await this.repo.upsertProgress(userId, 'TRADES_50', totalTradesCount, 50, false);

    if (totalTradesCount >= 100) await this.unlock(userId, 'TRADES_100');
    else await this.repo.upsertProgress(userId, 'TRADES_100', totalTradesCount, 100, false);

    if (heldSectorsCount >= 3) await this.unlock(userId, 'DIVERSIFIED_TRADER');
    else await this.repo.upsertProgress(userId, 'DIVERSIFIED_TRADER', heldSectorsCount, 3, false);
  }

  async onBacktestExecuted(
    userId: number,
    totalBacktestsCount: number,
    testedStrategiesCount: number = 1,
    hasStopLoss: boolean = false
  ): Promise<void> {
    await this.recordProgress(userId, 'FIRST_BACKTEST', 1);

    if (testedStrategiesCount >= 3) await this.unlock(userId, 'STRATEGY_EXPLORER');
    else await this.repo.upsertProgress(userId, 'STRATEGY_EXPLORER', testedStrategiesCount, 3, false);

    if (totalBacktestsCount >= 10) await this.unlock(userId, 'BACKTEST_10');
    else await this.repo.upsertProgress(userId, 'BACKTEST_10', totalBacktestsCount, 10, false);

    if (totalBacktestsCount >= 50) await this.unlock(userId, 'BACKTEST_50');
    else await this.repo.upsertProgress(userId, 'BACKTEST_50', totalBacktestsCount, 50, false);

    if (hasStopLoss) await this.unlock(userId, 'RISK_CONSCIOUS');
  }

  async onCompetitionJoined(userId: number, competitionsCount: number = 1): Promise<void> {
    await this.recordProgress(userId, 'FIRST_COMPETITION_JOINED', 1);
    if (competitionsCount >= 5) await this.unlock(userId, 'COMPETITIONS_5');
    else await this.repo.upsertProgress(userId, 'COMPETITIONS_5', competitionsCount, 5, false);
  }

  async onCompetitionTrade(userId: number): Promise<void> {
    await this.unlock(userId, 'COMPETITION_TRADER');
  }

  async onCompetitionCompleted(userId: number, rank: number): Promise<void> {
    if (rank === 1) await this.unlock(userId, 'COMPETITION_WINNER');
    if (rank <= 10) await this.unlock(userId, 'TOP_10_FINISH');
  }

  async onLearningAction(
    userId: number,
    action: 'CHART_SAVED' | 'INDICATOR_ANALYZED' | 'PORTFOLIO_REVIEW' | 'CHAT_SENT'
  ): Promise<void> {
    switch (action) {
      case 'CHART_SAVED':
        await this.unlock(userId, 'CHART_CUSTOMIZER');
        break;
      case 'INDICATOR_ANALYZED':
        await this.unlock(userId, 'INDICATOR_ANALYST');
        break;
      case 'PORTFOLIO_REVIEW':
        await this.unlock(userId, 'PORTFOLIO_REVIEWED');
        break;
      case 'CHAT_SENT':
        await this.unlock(userId, 'CHAT_PARTICIPANT');
        break;
    }
  }
}
