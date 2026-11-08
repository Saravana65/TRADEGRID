import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { AutomatedStrategyRunnerController } from './runner.controller';
import { AutomatedStrategyRunnerService } from './runner.service';
import { automatedStrategyJobRepository } from './runner.repository';
import { defaultStrategyService } from '../strategy.service';
import { orderService } from '../../orders';

export const defaultAutomatedStrategyRunnerService = new AutomatedStrategyRunnerService(
  automatedStrategyJobRepository,
  defaultStrategyService,
  orderService
);

export const defaultAutomatedStrategyRunnerController = new AutomatedStrategyRunnerController(
  defaultAutomatedStrategyRunnerService
);

export function createAutomatedStrategyRunnerRouter(
  controller: AutomatedStrategyRunnerController = defaultAutomatedStrategyRunnerController
): Router {
  const router = Router();

  // All automated runner endpoints require authentication
  router.use(authenticate);

  // Kill Switch (Emergency Stop)
  router.post('/kill-switch', controller.emergencyKillSwitch);

  // Job Operations
  router.post('/jobs', controller.activateJob);
  router.get('/jobs', controller.listJobs);
  router.get('/jobs/:jobId', controller.getJob);
  router.post('/jobs/:jobId/pause', controller.pauseJob);
  router.post('/jobs/:jobId/resume', controller.resumeJob);
  router.post('/jobs/:jobId/stop', controller.stopJob);
  router.get('/jobs/:jobId/orders', controller.listJobOrders);

  return router;
}

export const automatedStrategyRunnerRouter = createAutomatedStrategyRunnerRouter();
