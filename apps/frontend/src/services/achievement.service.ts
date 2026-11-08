import { apiClient } from './api';
import {
  ApiResponse,
  AchievementCategory,
  UserAchievementItem,
  UserAchievementStats,
  AchievementLeaderboardEntry,
} from '@tradegrid/shared-types';

export const achievementApiService = {
  /**
   * Retrieves full achievement catalog with authenticated user's unlock & progress state.
   */
  async getUserAchievements(category?: AchievementCategory): Promise<UserAchievementItem[]> {
    const res = await apiClient.get<ApiResponse<UserAchievementItem[]>>('/achievements', {
      params: category ? { category } : {},
    });
    return res.data.data;
  },

  /**
   * Retrieves authenticated user's points, level, titles, and completion percentages.
   */
  async getUserStats(): Promise<UserAchievementStats> {
    const res = await apiClient.get<ApiResponse<UserAchievementStats>>('/achievements/stats');
    return res.data.data;
  },

  /**
   * Retrieves global top traders ranked by achievement points.
   */
  async getLeaderboard(limit: number = 20): Promise<AchievementLeaderboardEntry[]> {
    const res = await apiClient.get<ApiResponse<AchievementLeaderboardEntry[]>>(
      '/achievements/leaderboard',
      {
        params: { limit },
      }
    );
    return res.data.data;
  },

  /**
   * Retrieves public badge showcase of another trader.
   */
  async getPublicUserAchievements(userId: number): Promise<{
    userId: number;
    stats: UserAchievementStats;
    unlockedBadges: UserAchievementItem[];
  }> {
    const res = await apiClient.get<
      ApiResponse<{
        userId: number;
        stats: UserAchievementStats;
        unlockedBadges: UserAchievementItem[];
      }>
    >(`/achievements/user/${userId}`);
    return res.data.data;
  },
};
