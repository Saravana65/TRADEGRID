import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { StrategyController } from './strategy.controller';
import { StrategyService, defaultStrategyService } from './strategy.service';
import { strategyRepository } from './strategy.repository';
import { StrategyExecutionService, strategyExecutionRepository } from './execution';

export { defaultStrategyService };
export const defaultStrategyExecutionService = new StrategyExecutionService(
  strategyExecutionRepository,
  defaultStrategyService
);
const defaultController = new StrategyController(
  defaultStrategyService,
  defaultStrategyExecutionService
);

export function createStrategyRouter(
  controller: StrategyController = defaultController
): Router {
  const router = Router();

  // DSL Validation (Public or Authenticated)
  router.post('/validate', controller.validateDsl);

  // Dedicated Execution Inspection (Mounted before /:id parameter)
  router.get('/executions/:executionId', authenticate, controller.getExecution);
  router.post('/executions/:executionId/cancel', authenticate, controller.cancelExecution);

  // Strategy Management (Strictly Authenticated)
  router.post('/', authenticate, controller.createStrategy);
  router.get('/', authenticate, controller.listStrategies);
  router.get('/:id', authenticate, controller.getStrategy);
  router.put('/:id', authenticate, controller.updateStrategy);
  router.delete('/:id', authenticate, controller.deleteStrategy);

  // Strategy Operations & Versioning
  router.post('/:id/duplicate', authenticate, controller.duplicateStrategy);
  router.post('/:id/versions', authenticate, controller.createVersion);
  router.get('/:id/versions', authenticate, controller.listVersions);
  router.get('/:id/versions/:version', authenticate, controller.getVersion);

  // Strategy Execution & History
  router.post('/:id/execute', authenticate, controller.executeStrategy);
  router.get('/:id/executions', authenticate, controller.listExecutions);

  return router;
}

export const strategyRouter = createStrategyRouter();
