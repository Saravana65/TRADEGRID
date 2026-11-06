import { Router } from 'express';
import { walletTransactionsQuerySchema } from '@tradegrid/validation';
import { walletController as defaultWalletController, WalletController } from './wallet.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validateQuery } from '../../middleware/validate.middleware';

export function createWalletRouter(controller: WalletController = defaultWalletController): Router {
  const router = Router();

  // All wallet routes require authentication
  router.use(authenticate);

  router.get('/', controller.getWallet);
  router.get('/transactions', validateQuery(walletTransactionsQuerySchema), controller.getTransactions);
  router.get('/transactions/:id', controller.getTransactionById);

  return router;
}

export const walletRouter = createWalletRouter();
