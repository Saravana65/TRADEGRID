import { Request, Response, NextFunction } from 'express';
import { walletService, WalletService } from './wallet.service';
import { sendSuccess } from '../../utils/response';

export class WalletController {
  constructor(private readonly service: WalletService = walletService) {}

  getWallet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const summary = await this.service.getWalletSummary(userId);
      sendSuccess(res, summary, 'Wallet summary retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  getTransactions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as any;
      const result = await this.service.getTransactionHistory(userId, query);
      sendSuccess(res, result, 'Wallet transactions retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  getTransactionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const txId = parseInt(req.params.id, 10);
      const transaction = await this.service.getTransactionDetails(userId, txId);
      sendSuccess(res, { transaction }, 'Transaction details retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  adminCredit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const targetUserId = parseInt(req.params.userId, 10);
      const result = await this.service.creditUserWallet(adminUserId, targetUserId, req.body);
      sendSuccess(res, result, `Virtual funds ($${result.amount}) successfully credited to user #${targetUserId}`, 200);
    } catch (error) {
      next(error);
    }
  };

  adminDebit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const targetUserId = parseInt(req.params.userId, 10);
      const result = await this.service.debitUserWallet(adminUserId, targetUserId, req.body);
      sendSuccess(res, result, `Virtual funds ($${result.amount}) successfully debited from user #${targetUserId}`, 200);
    } catch (error) {
      next(error);
    }
  };
}

export const walletController = new WalletController();
