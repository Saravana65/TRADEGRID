import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';

export const walletRouter = Router();

/**
 * Phase 2 Wallet & Cash Ledger Module Placeholder
 * Will manage virtual cash balances, ledger transactions, and deposits.
 */
walletRouter.get('/', (_req: Request, res: Response) => {
  sendSuccess(res, {
    module: 'wallet',
    status: 'planned_phase_2',
    features: ['Virtual cash ledger', 'Deposit/Withdrawal simulation', 'Double-entry bookkeeping'],
  });
});
