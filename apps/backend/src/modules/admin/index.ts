import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('ADMIN'));

/**
 * Phase 2 Admin Market Controls & Circuit Breakers Placeholder
 */
adminRouter.get('/status', (_req: Request, res: Response) => {
  sendSuccess(res, {
    module: 'admin',
    exchangeStatus: 'OPEN',
    circuitBreakerActive: false,
    simulatedEngines: {
      marketSimulation: 'READY',
      newsInjector: 'READY',
      matchingEngine: 'READY',
    },
  });
});
