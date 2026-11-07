import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { BotController } from './bot.controller';

export function createBotRouter(controller: BotController): Router {
  const router = Router();

  // All bot administration endpoints require authenticated ADMIN role
  router.use(authenticate, requireRole('ADMIN'));

  // Metrics & Global Actions (must be declared before :id route parameter)
  router.get('/metrics', controller.getSystemMetrics);
  router.post('/kill-all', controller.killAll);

  // Bot Lifecycle & CRUD
  router.get('/', controller.listBots);
  router.post('/', controller.createBot);
  router.get('/:id', controller.getBot);
  router.patch('/:id', controller.updateBot);

  // Operational State & Emergency Controls
  router.post('/:id/enable', controller.enableBot);
  router.post('/:id/disable', controller.disableBot);
  router.post('/:id/kill', controller.killBot);

  // Auditing & Logs
  router.get('/:id/logs', controller.getBotLogs);
  router.get('/:id/metrics', controller.getBotMetrics);

  return router;
}
