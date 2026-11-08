import {
  AchievementCategory,
  AchievementDefinition,
  UserAchievement,
  AchievementProgress,
  UserAchievementStats,
  AchievementLeaderboardEntry,
  UserAchievementItem,
} from '@tradegrid/shared-types';

export interface AchievementDefinitionRow {
  id: number;
  code: string;
  category: AchievementCategory;
  name: string;
  description: string;
  badge_icon: string;
  points: number;
  required_progress: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface UserAchievementRow {
  id: number;
  user_id: number;
  achievement_code: string;
  unlocked_at: Date | string;
}

export interface AchievementProgressRow {
  id: number;
  user_id: number;
  achievement_code: string;
  current_progress: number;
  target_progress: number;
  is_completed: boolean | number;
  updated_at: Date | string;
}

export interface UserAchievementStatsRow {
  id: number;
  user_id: number;
  total_points: number;
  current_level: number;
  title: string;
  achievements_unlocked_count: number;
  updated_at: Date | string;
}

export interface IAchievementRepository {
  getDefinitions(category?: AchievementCategory): Promise<AchievementDefinition[]>;
  getDefinitionByCode(code: string): Promise<AchievementDefinition | null>;
  getUserUnlocks(userId: number): Promise<UserAchievement[]>;
  hasUnlocked(userId: number, code: string): Promise<boolean>;
  recordUnlock(userId: number, code: string): Promise<boolean>;
  getProgress(userId: number, code: string): Promise<AchievementProgress | null>;
  getAllProgressForUser(userId: number): Promise<AchievementProgress[]>;
  upsertProgress(
    userId: number,
    code: string,
    currentProgress: number,
    targetProgress: number,
    isCompleted: boolean
  ): Promise<AchievementProgress>;
  getUserStats(userId: number): Promise<UserAchievementStatsRow | null>;
  upsertUserStats(stats: Partial<UserAchievementStatsRow> & { user_id: number }): Promise<UserAchievementStatsRow>;
  getLeaderboard(limit: number): Promise<AchievementLeaderboardEntry[]>;
}
