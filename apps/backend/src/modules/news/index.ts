import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';

export const newsRouter = Router();

/**
 * Phase 2 News Feed & Market Catalyst Injection Placeholder
 * Will deliver simulated financial news clearly labelled as simulated.
 */
newsRouter.get('/feed', (_req: Request, res: Response) => {
  sendSuccess(res, {
    module: 'news',
    status: 'planned_phase_2',
    disclaimer: 'All news items are simulated for educational market dynamics.',
    features: ['Breaking news ticker', 'Admin catalyst injection', 'Sector sentiment impact'],
  });
});
