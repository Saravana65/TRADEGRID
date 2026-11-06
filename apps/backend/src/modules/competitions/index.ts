import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';

export const competitionsRouter = Router();

/**
 * Phase 3 Trading Competitions & Leaderboards Placeholder
 * Will organize multiplayer simulated tournaments and live rankings.
 */
competitionsRouter.get('/', (_req: Request, res: Response) => {
  sendSuccess(res, {
    module: 'competitions',
    status: 'planned_phase_3',
    features: ['Tournament lobbies', 'Leaderboards', 'Timed trading challenges'],
  });
});
