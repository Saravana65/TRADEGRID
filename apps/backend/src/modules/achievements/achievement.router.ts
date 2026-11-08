import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { AchievementController } from './achievement.controller';
import { AchievementService } from './achievement.service';
import { KnexAchievementRepository } from './achievement.repository';
import { realtimeService } from '../../websocket/realtime.service';

const defaultRepo = new KnexAchievementRepository();
export const defaultAchievementService = new AchievementService(defaultRepo, realtimeService);
const defaultController = new AchievementController(defaultAchievementService);

export function createAchievementRouter(
  controller: AchievementController = defaultController
): Router {
  const router = Router();

  // Protected user achievement routes
  router.get('/', authenticate, controller.getUserAchievements);
  router.get('/stats', authenticate, controller.getUserStats);

  // Leaderboard & Public Showcase
  router.get('/leaderboard', controller.getLeaderboard);
  router.get('/user/:userId', controller.getPublicUserAchievements);

  return router;
}

export const achievementRouter = createAchievementRouter();
