import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';

export const chatRouter = Router();

/**
 * Phase 3 Global & Stock-Specific Chat Rooms Placeholder
 * Will provide moderated community chat rooms for educational exchange discussions.
 */
chatRouter.get('/rooms', (_req: Request, res: Response) => {
  sendSuccess(res, {
    module: 'chat',
    status: 'planned_phase_3',
    features: ['Global exchange chat', 'Symbol discussion channels', 'Moderation controls'],
  });
});
