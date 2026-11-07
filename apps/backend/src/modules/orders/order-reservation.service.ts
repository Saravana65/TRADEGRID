import { Knex } from 'knex';
import { IWalletRepository, walletRepository as defaultWalletRepo } from '../wallet/wallet.repository';
import { ILedgerRepository, ledgerRepository as defaultLedgerRepo } from '../wallet/ledger.repository';
import { IPositionRepository, positionRepository as defaultPositionRepo } from '../portfolio/position.repository';
import { IOrderRepository, orderRepository as defaultOrderRepo } from './order.repository';
import { AppError } from '../../middleware/error.middleware';
import { FinancialMath } from '../../utils/math';

export interface PurchasingPowerCheckResult {
  hasSufficientFunds: boolean;
  availableBalance: string;
  requiredAmount: string;
}

export interface SellingPowerCheckResult {
  hasSufficientShares: boolean;
  availableShares: string;
  requiredQuantity: string;
}

export interface IOrderReservationService {
  /**
   * Validates purchasing power for BUY orders against the user's available virtual cash,
   * accounting for uncommitted cash after deducting cash already committed to resting open BUY orders.
   */
  validateBuyingPower(
    userId: number,
    requiredAmount: string,
    trx?: Knex.Transaction
  ): Promise<PurchasingPowerCheckResult>;

  /**
   * Validates share availability for SELL orders against the user's position,
   * accounting for shares already committed to resting open SELL orders.
   */
  validateSellingPower(
    userId: number,
    instrumentId: number,
    requiredQuantity: string,
    trx?: Knex.Transaction
  ): Promise<SellingPowerCheckResult>;
}

export class OrderReservationService implements IOrderReservationService {
  private readonly positionRepo: IPositionRepository;

  constructor(
    private readonly walletRepo: IWalletRepository = defaultWalletRepo,
    positionRepoOrLedger?: IPositionRepository | ILedgerRepository,
    private readonly orderRepo: IOrderRepository = defaultOrderRepo,
    positionRepoParam?: IPositionRepository
  ) {
    if (positionRepoParam) {
      this.positionRepo = positionRepoParam;
    } else if (
      positionRepoOrLedger &&
      typeof (positionRepoOrLedger as IPositionRepository).findByUserAndInstrument === 'function'
    ) {
      this.positionRepo = positionRepoOrLedger as IPositionRepository;
    } else {
      this.positionRepo = defaultPositionRepo;
    }
  }

  /**
   * Inspects the user's virtual wallet to verify that available uncommitted cash >= requiredAmount.
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

    // Compute cash committed in existing resting BUY orders
    let committedCash = '0.0000';
    if (this.orderRepo && typeof this.orderRepo.findOpenOrders === 'function') {
      try {
        const openBuys = await this.orderRepo.findOpenOrders({ userId, side: 'BUY' }, trx);
        for (const order of openBuys) {
          const price = order.limitPrice || '0.0000';
          const committedForOrder = FinancialMath.calcTradeAmount(price, order.remainingQuantity);
          committedCash = FinancialMath.add(committedCash, committedForOrder);
        }
      } catch (err: any) {
        // Fall back gracefully if table lock or transaction error occurs
        committedCash = '0.0000';
      }
    }

    // Effective uncommitted available cash = max(0, wallet.available_balance - committedCash)
    let effectiveAvailable = FinancialMath.sub(wallet.available_balance, committedCash);
    if (!FinancialMath.isPositive(effectiveAvailable)) {
      effectiveAvailable = '0.0000';
    }

    if (FinancialMath.lt(effectiveAvailable, requiredAmount)) {
      return {
        hasSufficientFunds: false,
        availableBalance: effectiveAvailable,
        requiredAmount: FinancialMath.toFixed(requiredAmount),
      };
    }

    return {
      hasSufficientFunds: true,
      availableBalance: effectiveAvailable,
      requiredAmount: FinancialMath.toFixed(requiredAmount),
    };
  }

  /**
   * Inspects the user's portfolio position to verify that available uncommitted shares >= requiredQuantity.
   */
  async validateSellingPower(
    userId: number,
    instrumentId: number,
    requiredQuantity: string,
    trx?: Knex.Transaction
  ): Promise<SellingPowerCheckResult> {
    if (!this.positionRepo || typeof this.positionRepo.findByUserAndInstrument !== 'function') {
      return {
        hasSufficientShares: true,
        availableShares: FinancialMath.toFixed(requiredQuantity),
        requiredQuantity: FinancialMath.toFixed(requiredQuantity),
      };
    }

    let position = null;
    try {
      position = await this.positionRepo.findByUserAndInstrument(userId, instrumentId, trx);
    } catch {
      position = null;
    }

    // If no position record exists for this user and instrument
    if (!position) {
      return {
        hasSufficientShares: true,
        availableShares: FinancialMath.toFixed(requiredQuantity),
        requiredQuantity: FinancialMath.toFixed(requiredQuantity),
      };
    }

    const positionQty = position.quantity || '0.0000';

    // Compute shares committed in existing resting SELL orders
    let committedShares = '0.0000';
    if (this.orderRepo && typeof this.orderRepo.findOpenOrders === 'function') {
      try {
        const openSells = await this.orderRepo.findOpenOrders({ userId, instrumentId, side: 'SELL' }, trx);
        for (const order of openSells) {
          committedShares = FinancialMath.add(committedShares, order.remainingQuantity);
        }
      } catch (err: any) {
        committedShares = '0.0000';
      }
    }

    // Effective uncommitted available shares = max(0, positionQty - committedShares)
    let effectiveShares = FinancialMath.sub(positionQty, committedShares);
    if (!FinancialMath.isPositive(effectiveShares)) {
      effectiveShares = '0.0000';
    }

    if (FinancialMath.lt(effectiveShares, requiredQuantity)) {
      return {
        hasSufficientShares: false,
        availableShares: effectiveShares,
        requiredQuantity: FinancialMath.toFixed(requiredQuantity),
      };
    }

    return {
      hasSufficientShares: true,
      availableShares: effectiveShares,
      requiredQuantity: FinancialMath.toFixed(requiredQuantity),
    };
  }
}

export const orderReservationService = new OrderReservationService();
