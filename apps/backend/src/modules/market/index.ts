import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';

export const marketRouter = Router();

/**
 * Phase 2 Market Data & Simulation Engine Placeholder
 * Will provide quotes, candlestick OHLCV bars, and tick generation.
 */
marketRouter.get('/overview', (_req: Request, res: Response) => {
  sendSuccess(res, {
    module: 'market',
    status: 'planned_phase_2',
    features: ['Real-time quotes', 'Candlestick OHLCV bars', 'Order book depth', 'Simulation ticker'],
  });
});
