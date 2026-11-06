import { Router } from 'express';
import { portfolioController, PortfolioController } from './portfolio.controller';
import { authenticate } from '../../middleware/auth.middleware';

export function createPortfolioRouter(controller: PortfolioController = portfolioController): Router {
  const router = Router();

  router.get('/summary', authenticate, controller.getSummary);
  router.get('/', authenticate, controller.getSummary);

  return router;
}

export const portfolioRouter = createPortfolioRouter();
