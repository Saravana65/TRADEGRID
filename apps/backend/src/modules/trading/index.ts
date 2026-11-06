import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';

export const tradingRouter = Router();

/**
 * Phase 2 Trading & Order Management Module Placeholder
 * Will accept limit/market orders, manage order lifecycle, and feed the matching engine.
 */
tradingRouter.get('/orders', (_req: Request, res: Response) => {
  sendSuccess(res, {
    module: 'trading',
    status: 'planned_phase_2',
    features: ['Order placement', 'Order cancellation', 'Order book matching', 'Execution fills'],
  });
});
