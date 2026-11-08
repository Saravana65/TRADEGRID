import { Request, Response, NextFunction } from 'express';
import {
  achievementQuerySchema,
  achievementLeaderboardQuerySchema,
} from '@tradegrid/validation';
import { AchievementService } from './achievement.service';

export class AchievementController {
  constructor(private readonly service: AchievementService) {}

  /**
   * GET /api/v1/achievements
   * Retrieves full achievement catalog with authenticated user's unlock & progress state.
   */
  getUserAchievements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedQuery = achievementQuerySchema.parse(req.query);
      const items = await this.service.getUserAchievements(userId, validatedQuery.category);

      res.status(200).json({
        success: true,
        data: items,
        message: 'Achievements retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/achievements/stats
   * Retrieves authenticated user's points, level, titles, and completion percentages.
   */
  getUserStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const stats = await this.service.getUserStats(userId);

      res.status(200).json({
        success: true,
        data: stats,
        message: 'Trader gamification stats retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/achievements/leaderboard
   * Retrieves global top traders ranked by achievement points.
   */
  getLeaderboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedQuery = achievementLeaderboardQuerySchema.parse(req.query);
      const leaderboard = await this.service.getLeaderboard(validatedQuery.limit);

      res.status(200).json({
        success: true,
        data: leaderboard,
        message: 'Achievement leaderboard retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/achievements/user/:userId
   * Retrieves public badge showcase of another trader.
   */
  getPublicUserAchievements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetUserId = parseInt(req.params.userId, 10);
      if (isNaN(targetUserId) || targetUserId <= 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_USER_ID', message: 'Invalid trader user id' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const stats = await this.service.getUserStats(targetUserId);
      const allItems = await this.service.getUserAchievements(targetUserId);
      // Public showcase only displays unlocked badges to respect trader privacy
      const unlockedBadges = allItems.filter((item) => item.isUnlocked);

      res.status(200).json({
        success: true,
        data: {
          userId: targetUserId,
          stats,
          unlockedBadges,
        },
        message: 'Public trader achievement showcase retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}
