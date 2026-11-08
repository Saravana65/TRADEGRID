import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { strategyRepository } from './strategy.repository';

export const defaultStrategyService = new StrategyService(strategyRepository);
const defaultController = new StrategyController(defaultStrategyService);

export function createStrategyRouter(
  controller: StrategyController = defaultController
): Router {
  const router = Router();

  // DSL Validation (Public or Authenticated)
  router.post('/validate', controller.validateDsl);

  // Strategy Management (Strictly Authenticated)
  router.post('/', authenticate, controller.createStrategy);
  router.get('/', authenticate, controller.listStrategies);
  router.get('/:id', authenticate, controller.getStrategy);
  router.put('/:id', authenticate, controller.updateStrategy);
  router.delete('/:id', authenticate, controller.deleteStrategy);

  // Strategy Operations
  router.post('/:id/duplicate', authenticate, controller.duplicateStrategy);
  router.post('/:id/versions', authenticate, controller.createVersion);
  router.get('/:id/versions', authenticate, controller.listVersions);
  router.get('/:id/versions/:version', authenticate, controller.getVersion);

  return router;
}

export const strategyRouter = createStrategyRouter();
