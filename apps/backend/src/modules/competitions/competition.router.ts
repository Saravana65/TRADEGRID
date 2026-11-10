import { Router } from 'express';
import { CompetitionController } from './competition.controller';
import { authenticate } from '../../middleware/auth.middleware';

export function createCompetitionsRouter(controller: CompetitionController): Router {
  const router = Router();

  // Public / Authenticated Discovery
  router.get('/', controller.listCompetitions);
  router.get('/me', authenticate, controller.listMyCompetitions);
  router.get('/my', authenticate, controller.listMyCompetitions);
  router.get('/:id', controller.getCompetition);
  router.get('/:id/participants', controller.listParticipants);
  router.get('/:id/leaderboard', controller.getLeaderboard);
  router.get('/:id/trades', controller.getTrades);

  // Authenticated Actions
  router.post('/', authenticate, controller.createCompetition);
  router.post('/:id/join', authenticate, controller.joinCompetition);
  router.post('/:id/leave', authenticate, controller.leaveCompetition);
  router.get('/:id/portfolio', authenticate, controller.getPortfolio);
  router.get('/:id/orders', authenticate, controller.getOrders);
  router.post('/:id/orders', authenticate, controller.submitOrder);
  router.post('/:id/orders/:orderId/cancel', authenticate, controller.cancelOrder);
  router.post('/:id/cancel', authenticate, controller.cancelCompetition);

  return router;
}
