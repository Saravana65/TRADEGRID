import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';

export const watchlistRouter = Router();

/**
 * Phase 2 Watchlist Module Placeholder
 * Will allow traders to curate personal lists of tracked tickers.
 */
watchlistRouter.get('/', (_req: Request, res: Response) => {
  sendSuccess(res, {
    module: 'watchlist',
    status: 'planned_phase_2',
    features: ['Custom watchlists', 'Favorite tickers', 'Alert triggers'],
  });
});
