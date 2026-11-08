import { Router } from 'express';
import { BetaController, defaultBetaController } from './beta.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

export function createBetaRouter(betaController: BetaController = defaultBetaController): Router {
  const router = Router();

  // Public/all users status
  router.get('/status', betaController.getStatus);

  // Authenticated beta feedback
  router.post('/feedback', authenticate, betaController.submitFeedback);

  // Admin feedback inspection
  router.get('/feedback', authenticate, requireRole('ADMIN'), betaController.listFeedback);

  return router;
}

export const betaRouter = createBetaRouter();
