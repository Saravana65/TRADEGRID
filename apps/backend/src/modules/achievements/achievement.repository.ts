import { Knex } from 'knex';
import { db } from '../../database/connection';
import {
  AchievementCategory,
  AchievementDefinition,
  UserAchievement,
  AchievementProgress,
  AchievementLeaderboardEntry,
} from '@tradegrid/shared-types';
import {
  IAchievementRepository,
  AchievementDefinitionRow,
  UserAchievementRow,
  AchievementProgressRow,
  UserAchievementStatsRow,
} from './achievement.types';
import { STANDARD_ACHIEVEMENTS } from './achievement.definitions';

export class KnexAchievementRepository implements IAchievementRepository {
  constructor(private readonly knex: Knex = db) {}

  async getDefinitions(category?: AchievementCategory): Promise<AchievementDefinition[]> {
    try {
      let query = this.knex<AchievementDefinitionRow>('achievement_definitions');
      if (category) {
        query = query.where({ category });
      }
      const rows = await query.orderBy('points', 'asc');
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          code: r.code,
          category: r.category,
          name: r.name,
          description: r.description,
          badgeIcon: r.badge_icon,
          points: r.points,
          requiredProgress: r.required_progress,
        }));
      }
    } catch {
      // Fallback to in-memory standard definitions if table hasn't migrated in tests
    }

    if (category) {
      return STANDARD_ACHIEVEMENTS.filter((a) => a.category === category);
    }
    return STANDARD_ACHIEVEMENTS;
  }

  async getDefinitionByCode(code: string): Promise<AchievementDefinition | null> {
    try {
      const row = await this.knex<AchievementDefinitionRow>('achievement_definitions')
        .where({ code })
        .first();
      if (row) {
        return {
          code: row.code,
          category: row.category,
          name: row.name,
          description: row.description,
          badgeIcon: row.badge_icon,
          points: row.points,
          requiredProgress: row.required_progress,
        };
      }
    } catch {
      // Fallback
    }

    return STANDARD_ACHIEVEMENTS.find((a) => a.code === code) || null;
  }

  async getUserUnlocks(userId: number): Promise<UserAchievement[]> {
    const rows = await this.knex<UserAchievementRow>('user_achievements')
      .where({ user_id: userId })
      .orderBy('unlocked_at', 'desc');

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      achievementCode: r.achievement_code,
      unlockedAt: new Date(r.unlocked_at).toISOString(),
    }));
  }

  async hasUnlocked(userId: number, code: string): Promise<boolean> {
    const row = await this.knex<UserAchievementRow>('user_achievements')
      .where({ user_id: userId, achievement_code: code })
      .first();

    return !!row;
  }

  async recordUnlock(userId: number, code: string): Promise<boolean> {
    try {
      await this.knex('user_achievements').insert({
        user_id: userId,
        achievement_code: code,
        unlocked_at: new Date(),
      });
      return true;
    } catch {
      // Duplicate entry (already unlocked)
      return false;
    }
  }

  async getProgress(userId: number, code: string): Promise<AchievementProgress | null> {
    const row = await this.knex<AchievementProgressRow>('achievement_progress')
      .where({ user_id: userId, achievement_code: code })
      .first();

    if (!row) return null;

    return {
      userId: row.user_id,
      achievementCode: row.achievement_code,
      currentProgress: row.current_progress,
      targetProgress: row.target_progress,
      isCompleted: !!row.is_completed,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async getAllProgressForUser(userId: number): Promise<AchievementProgress[]> {
    const rows = await this.knex<AchievementProgressRow>('achievement_progress')
      .where({ user_id: userId });

    return rows.map((r) => ({
      userId: r.user_id,
      achievementCode: r.achievement_code,
      currentProgress: r.current_progress,
      targetProgress: r.target_progress,
      isCompleted: !!r.is_completed,
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async upsertProgress(
    userId: number,
    code: string,
    currentProgress: number,
    targetProgress: number,
    isCompleted: boolean
  ): Promise<AchievementProgress> {
    const existing = await this.knex<AchievementProgressRow>('achievement_progress')
      .where({ user_id: userId, achievement_code: code })
      .first();

    const now = new Date();
    if (existing) {
      await this.knex('achievement_progress')
        .where({ id: existing.id })
        .update({
          current_progress: currentProgress,
          target_progress: targetProgress,
          is_completed: isCompleted,
          updated_at: now,
        });

      return {
        userId,
        achievementCode: code,
        currentProgress,
        targetProgress,
        isCompleted,
        updatedAt: now.toISOString(),
      };
    } else {
      await this.knex('achievement_progress').insert({
        user_id: userId,
        achievement_code: code,
        current_progress: currentProgress,
        target_progress: targetProgress,
        is_completed: isCompleted,
        updated_at: now,
      });

      return {
        userId,
        achievementCode: code,
        currentProgress,
        targetProgress,
        isCompleted,
        updatedAt: now.toISOString(),
      };
    }
  }

  async getUserStats(userId: number): Promise<UserAchievementStatsRow | null> {
    const row = await this.knex<UserAchievementStatsRow>('user_achievement_stats')
      .where({ user_id: userId })
      .first();

    return row || null;
  }

  async upsertUserStats(
    stats: Partial<UserAchievementStatsRow> & { user_id: number }
  ): Promise<UserAchievementStatsRow> {
    const existing = await this.knex<UserAchievementStatsRow>('user_achievement_stats')
      .where({ user_id: stats.user_id })
      .first();

    const now = new Date();
    if (existing) {
      const updated = {
        total_points: stats.total_points ?? existing.total_points,
        current_level: stats.current_level ?? existing.current_level,
        title: stats.title ?? existing.title,
        achievements_unlocked_count:
          stats.achievements_unlocked_count ?? existing.achievements_unlocked_count,
        updated_at: now,
      };

      await this.knex('user_achievement_stats').where({ id: existing.id }).update(updated);

      return {
        ...existing,
        ...updated,
      };
    } else {
      const created = {
        user_id: stats.user_id,
        total_points: stats.total_points ?? 0,
        current_level: stats.current_level ?? 1,
        title: stats.title ?? 'Novice Trader',
        achievements_unlocked_count: stats.achievements_unlocked_count ?? 0,
        updated_at: now,
      };

      const [id] = await this.knex('user_achievement_stats').insert(created);

      return {
        id,
        ...created,
      };
    }
  }

  async getLeaderboard(limit: number = 20): Promise<AchievementLeaderboardEntry[]> {
    const rows = await this.knex('user_achievement_stats')
      .join('users', 'user_achievement_stats.user_id', 'users.id')
      .select(
        'user_achievement_stats.user_id',
        'users.username',
        'user_achievement_stats.total_points',
        'user_achievement_stats.current_level',
        'user_achievement_stats.title',
        'user_achievement_stats.achievements_unlocked_count'
      )
      .orderBy('user_achievement_stats.total_points', 'desc')
      .limit(limit);

    return rows.map((r, index) => ({
      userId: r.user_id,
      username: r.username,
      totalPoints: r.total_points,
      currentLevel: r.current_level,
      levelTitle: r.title,
      achievementsUnlockedCount: r.achievements_unlocked_count,
      rank: index + 1,
    }));
  }
}
