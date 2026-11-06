import { Router } from 'express';
import { adminWalletAdjustmentSchema } from '@tradegrid/validation';
import { walletController as defaultWalletController, WalletController } from './wallet.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateBody } from '../../middleware/validate.middleware';

export function createAdminWalletRouter(controller: WalletController = defaultWalletController): Router {
  const router = Router();

  // All administrative wallet adjustments require ADMIN role
  router.use(authenticate, requireRole('ADMIN'));

  router.post('/:userId/credit', validateBody(adminWalletAdjustmentSchema), controller.adminCredit);
  router.post('/:userId/debit', validateBody(adminWalletAdjustmentSchema), controller.adminDebit);

  return router;
}

export const adminWalletRouter = createAdminWalletRouter();
