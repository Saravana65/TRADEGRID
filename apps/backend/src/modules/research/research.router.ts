import { Router } from 'express';
import { ResearchController, researchController as defaultResearchController } from './research.controller';
import { authenticate } from '../../middleware/auth.middleware';

export function createResearchRouter(
  controller: ResearchController = defaultResearchController
): Router {
  const router = Router();

  // 1. Backtesting execution & history (Authenticated)
  router.post('/backtest', authenticate, controller.runBacktest);
  router.get('/backtests', authenticate, controller.getUserBacktests);
  router.get('/backtests/:id', authenticate, controller.getBacktestById);

  // 2. Strategy comparison matrix (Authenticated)
  router.post('/compare', authenticate, controller.compareStrategies);

  // 3. Quantitative signals scanner (Public or Authenticated)
  router.get('/signals', controller.getSignals);

  // 4. Portfolio insights & concentration risk (Authenticated)
  router.get('/portfolio-insights', authenticate, controller.getPortfolioInsights);

  return router;
}

export const researchRouter = createResearchRouter();
