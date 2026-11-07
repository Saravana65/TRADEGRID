import { Knex } from 'knex';
import crypto from 'crypto';
import { db } from '../../database/connection';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/error.middleware';
import { Order, Trade } from '@tradegrid/shared-types';
import { FinancialMath } from '../../utils/math';
import { IOrderRepository, orderRepository as defaultOrderRepo } from '../orders/order.repository';
import { IWalletRepository, walletRepository as defaultWalletRepo } from '../wallet/wallet.repository';
import { ILedgerRepository, ledgerRepository as defaultLedgerRepo } from '../wallet/ledger.repository';
import { ITradeRepository, tradeRepository as defaultTradeRepo } from '../trading/trade.repository';
import { IPositionRepository, positionRepository as defaultPositionRepo } from '../portfolio/position.repository';
import { IMarketDataRepository, marketDataRepository as defaultMarketDataRepo } from '../market/market-data.repository';

export interface SettleMatchInput {
  buyOrder: Order;
  sellOrder: Order;
  instrumentId: number;
  symbol: string;
  executionPrice: string;
  executedQuantity: string;
}

export interface ISettlementService {
  settleTrade(input: SettleMatchInput, trx?: Knex.Transaction): Promise<Trade>;
}

export class SettlementService implements ISettlementService {
  constructor(
    private readonly orderRepo: IOrderRepository = defaultOrderRepo,
    private readonly walletRepo: IWalletRepository = defaultWalletRepo,
    private readonly ledgerRepo: ILedgerRepository = defaultLedgerRepo,
    private readonly tradeRepo: ITradeRepository = defaultTradeRepo,
    private readonly positionRepo: IPositionRepository = defaultPositionRepo,
    private readonly marketDataRepo: IMarketDataRepository = defaultMarketDataRepo,
    private readonly knexInstance: Knex = db
  ) {}

  private async withTransaction<T>(
    trx: Knex.Transaction | undefined,
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    if (trx) {
      return callback(trx);
    }
    return this.knexInstance.transaction(async (newTrx) => {
      return callback(newTrx);
    });
  }

  /**
   * Atomically settles a matched execution between buyer and seller using exact Decimal math.
   *
   * Invariants:
   * 1. Buyer cash decreases by Cost = Price * Quantity
   * 2. Seller cash increases by Proceeds = Price * Quantity
   * 3. Balanced ledger entries posted: Sum(Debits) == Sum(Credits)
   * 4. Buyer receives shares: updates weighted average cost basis
   * 5. Seller delivers shares: computes realized gain/loss
   * 6. Both order statuses update to PARTIALLY_FILLED or FILLED
   * 7. If any step fails, entire transaction is automatically rolled back
   */
  async settleTrade(input: SettleMatchInput, trx?: Knex.Transaction): Promise<Trade> {
    const { buyOrder, sellOrder, instrumentId, executionPrice, executedQuantity } = input;

    if (!FinancialMath.isPositive(executionPrice)) {
      throw new AppError(400, 'INVALID_PRICE', 'Execution price must be greater than zero');
    }
    if (!FinancialMath.isPositive(executedQuantity)) {
      throw new AppError(400, 'INVALID_QUANTITY', 'Executed quantity must be greater than zero');
    }

    const tradeAmount = FinancialMath.calcTradeAmount(executionPrice, executedQuantity);

    return this.withTransaction(trx, async (activeTrx) => {
      // 1. Pessimistic Row Locks on Wallets in strictly sorted order to prevent deadlocks
      const firstUserId = Math.min(buyOrder.userId, sellOrder.userId);
      const secondUserId = Math.max(buyOrder.userId, sellOrder.userId);

      try {
        const firstLockedWallet = await this.walletRepo.lockWalletByUserId(firstUserId, activeTrx);
        const secondLockedWallet =
          firstUserId === secondUserId
            ? firstLockedWallet
            : await this.walletRepo.lockWalletByUserId(secondUserId, activeTrx);

        const buyerWallet = buyOrder.userId === firstUserId ? firstLockedWallet : secondLockedWallet;
        const sellerWallet = sellOrder.userId === firstUserId ? firstLockedWallet : secondLockedWallet;

        if (!buyerWallet) {
          throw new AppError(404, 'BUYER_WALLET_NOT_FOUND', `Wallet for buyer #${buyOrder.userId} not found`);
        }
        if (!sellerWallet) {
          throw new AppError(404, 'SELLER_WALLET_NOT_FOUND', `Wallet for seller #${sellOrder.userId} not found`);
        }

        // 2. Validate Buyer Has Sufficient Cash to settle
        if (FinancialMath.lt(buyerWallet.available_balance, tradeAmount)) {
          throw new AppError(
            422,
            'INSUFFICIENT_FUNDS_FOR_SETTLEMENT',
            `Buyer #${buyOrder.userId} has insufficient funds to settle trade. Required: $${tradeAmount}, Available: $${buyerWallet.available_balance}`
          );
        }

        // 3. Double-Entry Ledger Transfer
        // USER_WALLET is an asset account. DEBIT = Inflow (+cash), CREDIT = Outflow (-cash).
        const buyerAccount = await this.ledgerRepo.findOrCreateAccount(
          'USER_WALLET',
          buyOrder.userId,
          buyerWallet.currency,
          activeTrx
        );
        const sellerAccount = await this.ledgerRepo.findOrCreateAccount(
          'USER_WALLET',
          sellOrder.userId,
          sellerWallet.currency,
          activeTrx
        );

        const randomSuffix = crypto.randomBytes(4).toString('hex');
        const tradeRef = `TRD-${instrumentId}-${Date.now()}-${randomSuffix}`;
        const ledgerTxRef = `SETTLE-${tradeRef}`;

        const { transaction: ledgerTx } = await this.ledgerRepo.createTransactionWithEntries(
          {
            transaction_reference: ledgerTxRef,
            transaction_type: 'TRADE_BUY',
            description: `Settlement for Trade ${tradeRef}: ${executedQuantity} shares @ $${executionPrice}`,
            idempotency_key: `settle-key-${tradeRef}`,
            created_by: buyOrder.userId,
          },
          [
            // DEBIT Seller Wallet (Inflow: seller receives cash proceeds)
            {
              account_id: sellerAccount.id,
              entry_type: 'DEBIT',
              amount: tradeAmount,
            },
            // CREDIT Buyer Wallet (Outflow: buyer pays cash for shares)
            {
              account_id: buyerAccount.id,
              entry_type: 'CREDIT',
              amount: tradeAmount,
            },
          ],
          activeTrx
        );

        // 4. Update Materialized Wallet Balances using exact decimal subtraction/addition
        const newBuyerBalance = FinancialMath.sub(buyerWallet.available_balance, tradeAmount);
        const newSellerBalance = FinancialMath.add(sellerWallet.available_balance, tradeAmount);

        await this.walletRepo.updateBalance(buyerWallet.id, newBuyerBalance, activeTrx);
        await this.walletRepo.updateBalance(sellerWallet.id, newSellerBalance, activeTrx);

        // 5. Update Buyer Portfolio Position (Weighted Average Cost Basis)
        const buyerPos = await this.positionRepo.findByUserAndInstrument(buyOrder.userId, instrumentId, activeTrx);
        const buyerCurrentQty = buyerPos?.quantity || '0.0000';
        const buyerCurrentAvg = buyerPos?.average_buy_price || '0.0000';
        const buyerNewQty = FinancialMath.add(buyerCurrentQty, executedQuantity);
        const buyerNewAvg = FinancialMath.calcWeightedAverageCost(
          buyerCurrentQty,
          buyerCurrentAvg,
          executedQuantity,
          executionPrice
        );

        await this.positionRepo.upsertPosition(
          {
            user_id: buyOrder.userId,
            instrument_id: instrumentId,
            quantity: buyerNewQty,
            average_buy_price: buyerNewAvg,
            realized_pnl: buyerPos?.realized_pnl || '0.0000',
          },
          activeTrx
        );

        // 6. Update Seller Portfolio Position (Realized P&L Calculation)
        const sellerPos = await this.positionRepo.findByUserAndInstrument(sellOrder.userId, instrumentId, activeTrx);
        const sellerCurrentQty = sellerPos?.quantity || '0.0000';
        const sellerCurrentAvg = sellerPos?.average_buy_price || '0.0000';
        const sellerCurrentRealized = sellerPos?.realized_pnl || '0.0000';

        const sellerNewQty = FinancialMath.calcRemainingQuantity(sellerCurrentQty, executedQuantity);
        const realizedGainOnThisTrade = FinancialMath.calcRealizedPnL(
          executionPrice,
          sellerCurrentAvg,
          executedQuantity
        );
        const sellerNewRealized = FinancialMath.add(sellerCurrentRealized, realizedGainOnThisTrade);

        await this.positionRepo.upsertPosition(
          {
            user_id: sellOrder.userId,
            instrument_id: instrumentId,
            quantity: sellerNewQty,
            average_buy_price: sellerPos?.average_buy_price || '0.0000',
            realized_pnl: sellerNewRealized,
          },
          activeTrx
        );

        // 7. Update Orders State in Database
        const buyRemaining = FinancialMath.calcRemainingQuantity(buyOrder.remainingQuantity, executedQuantity);
        const newBuyStatus = FinancialMath.isZero(buyRemaining) ? 'FILLED' : 'PARTIALLY_FILLED';
        await this.orderRepo.update(
          buyOrder.id,
          {
            remainingQuantity: buyRemaining,
            status: newBuyStatus,
          },
          activeTrx
        );

        const sellRemaining = FinancialMath.calcRemainingQuantity(sellOrder.remainingQuantity, executedQuantity);
        const newSellStatus = FinancialMath.isZero(sellRemaining) ? 'FILLED' : 'PARTIALLY_FILLED';
        await this.orderRepo.update(
          sellOrder.id,
          {
            remainingQuantity: sellRemaining,
            status: newSellStatus,
          },
          activeTrx
        );

        // 8. Record Immutable Trade in Trades Table
        const tradeRecord = await this.tradeRepo.create(
          {
            trade_reference: tradeRef,
            buy_order_id: buyOrder.id,
            sell_order_id: sellOrder.id,
            instrument_id: instrumentId,
            buyer_id: buyOrder.userId,
            seller_id: sellOrder.userId,
            price: FinancialMath.toFixed(executionPrice),
            quantity: FinancialMath.toFixed(executedQuantity),
            trade_amount: tradeAmount,
            buyer_fee: '0.0000',
            seller_fee: '0.0000',
            status: 'SETTLED',
            settlement_transaction_id: ledgerTx.id,
          },
          activeTrx
        );

        logger.info(
          `[SETTLEMENT] Trade #${tradeRecord.id} (${tradeRef}) settled: ${executedQuantity} shares of Instrument #${instrumentId} @ $${executionPrice}. Buyer #${buyOrder.userId} paid $${tradeAmount}, Seller #${sellOrder.userId} received $${tradeAmount}.`
        );

        return {
          id: tradeRecord.id,
          tradeReference: tradeRecord.trade_reference,
          buyOrderId: tradeRecord.buy_order_id,
          sellOrderId: tradeRecord.sell_order_id,
          instrumentId: tradeRecord.instrument_id,
          symbol: input.symbol,
          buyerId: tradeRecord.buyer_id,
          sellerId: tradeRecord.seller_id,
          price: tradeRecord.price,
          quantity: tradeRecord.quantity,
          tradeAmount: tradeRecord.trade_amount,
          buyerFee: tradeRecord.buyer_fee,
          sellerFee: tradeRecord.seller_fee,
          status: tradeRecord.status,
          settlementTransactionId: tradeRecord.settlement_transaction_id,
          createdAt: tradeRecord.created_at ? new Date(tradeRecord.created_at).toISOString() : new Date().toISOString(),
        };
      } finally {
        if (typeof (this.walletRepo as any).releaseLock === 'function') {
          (this.walletRepo as any).releaseLock(firstUserId);
          if (secondUserId !== firstUserId) {
            (this.walletRepo as any).releaseLock(secondUserId);
          }
        }
      }
    });
  }
}

export const settlementService = new SettlementService();
