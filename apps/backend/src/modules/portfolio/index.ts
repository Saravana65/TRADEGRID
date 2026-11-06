import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';

export const portfolioRouter = Router();

/**
 * Phase 2 Portfolio Management Module Placeholder
 * Will track holdings, average purchase costs, and real-time realized/unrealized P&L.
 */
portfolioRouter.get('/summary', (_req: Request, res: Response) => {
  sendSuccess(res, {
    module: 'portfolio',
    status: 'planned_phase_2',
    features: ['Stock holdings', 'Average cost basis', 'Unrealized P&L', 'Realized gains'],
  });
});
