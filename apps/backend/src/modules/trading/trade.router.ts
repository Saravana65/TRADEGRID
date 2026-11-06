import { Router } from 'express';
import { tradeController, TradeController } from './trade.controller';
import { authenticate } from '../../middleware/auth.middleware';

export function createTradeRouter(controller: TradeController = tradeController): Router {
  const router = Router();

  // Authenticated trader trade history
  router.get('/', authenticate, controller.getUserTrades);
  router.get('/:id(\\d+)', authenticate, controller.getTradeById);

  return router;
}

export const tradeRouter = createTradeRouter();
