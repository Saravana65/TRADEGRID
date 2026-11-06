import { Knex } from 'knex';
import { IWalletRepository, walletRepository as defaultWalletRepo } from '../wallet/wallet.repository';
import { ILedgerRepository, ledgerRepository as defaultLedgerRepo } from '../wallet/ledger.repository';
import { AppError } from '../../middleware/error.middleware';

export interface PurchasingPowerCheckResult {
  hasSufficientFunds: boolean;
  availableBalance: string;
  requiredAmount: string;
}

export interface IOrderReservationService {
  /**
   * Validates purchasing power for BUY orders against the user's available virtual cash.
   * Does NOT directly mutate wallet balances or bypass the double-entry ledger.
   */
  validateBuyingPower(
    userId: number,
    requiredAmount: string,
    trx?: Knex.Transaction
  ): Promise<PurchasingPowerCheckResult>;

  /**
   * Future Phase 4B reservation interface:
   * Will hold cash or shares upon order acceptance and release upon cancellation.
   */
  reserveCashForOrder?(
    orderId: number,
    userId: number,
    amount: string,
    trx?: Knex.Transaction
  ): Promise<void>;

  releaseCashReservation?(
    orderId: number,
    userId: number,
    reason: string,
    trx?: Knex.Transaction
  ): Promise<void>;
}

export class OrderReservationService implements IOrderReservationService {
  constructor(
    private readonly walletRepo: IWalletRepository = defaultWalletRepo,
    private readonly _ledgerRepo: ILedgerRepository = defaultLedgerRepo
  ) {}

  /**
   * Inspects the user's virtual wallet to verify that available_balance >= requiredAmount.
   * Throws 422 if funds are insufficient.
   */
  async validateBuyingPower(
    userId: number,
    requiredAmount: string,
    trx?: Knex.Transaction
  ): Promise<PurchasingPowerCheckResult> {
    const wallet = await this.walletRepo.findByUserId(userId, trx);
    if (!wallet) {
      throw new AppError(
        404,
        'WALLET_NOT_FOUND',
        `No virtual wallet found for user #${userId}. Please register or initialize wallet first.`
      );
    }

    const available = parseFloat(wallet.available_balance);
    const required = parseFloat(requiredAmount);

    if (available < required) {
      return {
        hasSufficientFunds: false,
        availableBalance: wallet.available_balance,
        requiredAmount,
      };
    }

    return {
      hasSufficientFunds: true,
      availableBalance: wallet.available_balance,
      requiredAmount,
    };
  }
}

export const orderReservationService = new OrderReservationService();
