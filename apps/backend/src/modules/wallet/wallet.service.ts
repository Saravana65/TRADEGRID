import { Knex } from 'knex';
import crypto from 'crypto';
import { db } from '../../database/connection';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/error.middleware';
import {
  IWalletRepository,
  walletRepository as defaultWalletRepo,
  WalletRecord,
} from './wallet.repository';
import {
  ILedgerRepository,
  ledgerRepository as defaultLedgerRepo,
} from './ledger.repository';
import {
  WalletSummaryResponse,
  WalletTransactionItem,
  PaginatedResult,
  AdminAdjustmentResult,
} from '@tradegrid/shared-types';
import {
  AdminWalletAdjustmentInput,
  WalletTransactionsQueryInput,
} from '@tradegrid/validation';

export class WalletService {
  constructor(
    private readonly walletRepo: IWalletRepository = defaultWalletRepo,
    private readonly ledgerRepo: ILedgerRepository = defaultLedgerRepo,
    private readonly knexInstance: Knex = db
  ) {}

  /**
   * Helper to execute in an existing transaction or create a new managed transaction.
   */
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
   * Automatically initializes a virtual wallet for a new user with configurable demo balance.
   * Guarantees balanced double-entry funding via the system issuance account.
   */
  async createWalletForUser(
    userId: number,
    initialBalance: string = config.INITIAL_WALLET_BALANCE,
    createdBy: number | null = null,
    trx?: Knex.Transaction
  ): Promise<WalletRecord> {
    return this.withTransaction(trx, async (activeTrx) => {
      // 1. Check if wallet already exists
      const existing = await this.walletRepo.findByUserId(userId, activeTrx);
      if (existing) {
        return existing;
      }

      const currency = config.DEFAULT_CURRENCY || 'USD';
      const balanceNum = parseFloat(initialBalance);
      const formattedInitialBalance = !isNaN(balanceNum) && balanceNum >= 0 ? balanceNum.toFixed(4) : '0.0000';

      // 2. Create user's ledger account
      const userAccount = await this.ledgerRepo.findOrCreateAccount(
        'USER_WALLET',
        userId,
        currency,
        activeTrx
      );

      // 3. Create wallet row (materialized balance)
      const wallet = await this.walletRepo.createWallet(
        {
          user_id: userId,
          currency,
          available_balance: formattedInitialBalance,
        },
        activeTrx
      );

      // 4. If initial balance > 0, post balanced initial grant ledger transaction
      if (parseFloat(formattedInitialBalance) > 0) {
        const systemAccount = await this.ledgerRepo.getSystemAccount(
          'SYSTEM_EQUITY_ISSUANCE',
          currency,
          activeTrx
        );

        const txReference = `GRANT-SIGNUP-${userId}-${Date.now()}`;
        const idempotencyKey = `initial-grant-user-${userId}`;

        await this.ledgerRepo.createTransactionWithEntries(
          {
            transaction_reference: txReference,
            transaction_type: 'INITIAL_SIGNUP_GRANT',
            description: `Initial virtual capital grant for student onboarding ($${formattedInitialBalance})`,
            idempotency_key: idempotencyKey,
            created_by: createdBy,
          },
          [
            // DEBIT User Wallet (Asset increases by initial grant)
            {
              account_id: userAccount.id,
              entry_type: 'DEBIT',
              amount: formattedInitialBalance,
            },
            // CREDIT System Issuance (Equity counterparty increases by initial grant)
            {
              account_id: systemAccount.id,
              entry_type: 'CREDIT',
              amount: formattedInitialBalance,
            },
          ],
          activeTrx
        );
      }

      logger.info(`Virtual wallet created for user #${userId} with balance $${formattedInitialBalance}`);
      return wallet;
    });
  }

  /**
   * Retrieves user wallet summary, available balance, and ledger consistency verification.
   */
  async getWalletSummary(userId: number): Promise<WalletSummaryResponse> {
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      throw new AppError(404, 'WALLET_NOT_FOUND', 'Virtual wallet not found for user');
    }

    const account = await this.ledgerRepo.findOrCreateAccount(
      'USER_WALLET',
      userId,
      wallet.currency
    );

    const ledgerBalance = await this.ledgerRepo.calculateAccountBalanceFromLedger(account.id);
    const { totalDebited, totalCredited } = await this.ledgerRepo.calculateLedgerTotals(account.id);

    // Consistency check: Materialized balance must match sum of ledger entries
    const isConsistent = Math.abs(parseFloat(wallet.available_balance) - parseFloat(ledgerBalance)) < 0.0001;

    if (!isConsistent) {
      logger.error(
        `🚨 BALANCE INCONSISTENCY DETECTED for user #${userId}! Wallet cache: $${wallet.available_balance}, Ledger: $${ledgerBalance}`
      );
    }

    return {
      walletId: wallet.id,
      userId: wallet.user_id,
      currency: wallet.currency,
      availableBalance: wallet.available_balance,
      totalCredited, // Total amount credited into user wallet (inflows)
      totalDebited,  // Total amount debited from user wallet (outflows)
      isConsistentWithLedger: isConsistent,
      updatedAt: wallet.updated_at ? new Date(wallet.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Credits virtual capital to a user's wallet (Admin authorized).
   * Fully atomic, pessimistic locked, balanced double-entry transaction with idempotency protection.
   */
  async creditUserWallet(
    adminUserId: number,
    targetUserId: number,
    input: AdminWalletAdjustmentInput
  ): Promise<AdminAdjustmentResult> {
    const amountNum = parseFloat(input.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new AppError(400, 'INVALID_AMOUNT', 'Credit amount must be greater than 0');
    }
    const formattedAmount = amountNum.toFixed(4);

    return this.withTransaction(undefined, async (trx) => {
      try {
        // 1. Idempotency Check
        if (input.idempotencyKey) {
          const existingTx = await this.ledgerRepo.findTransactionByIdempotencyKey(
            input.idempotencyKey,
            trx
          );
          if (existingTx) {
            logger.info(`Idempotent request detected for key: ${input.idempotencyKey}`);
            const wallet = await this.walletRepo.findByUserId(targetUserId, trx);
            return {
              transactionReference: existingTx.transaction_reference,
              userId: targetUserId,
              amount: formattedAmount,
              operation: 'CREDIT',
              newBalance: wallet?.available_balance || '0.0000',
              description: existingTx.description,
              createdAt: existingTx.created_at ? new Date(existingTx.created_at).toISOString() : new Date().toISOString(),
            };
          }
        }

        // 2. Pessimistic Row Lock on target user's wallet (SELECT ... FOR UPDATE)
        const lockedWallet = await this.walletRepo.lockWalletByUserId(targetUserId, trx);
        if (!lockedWallet) {
          throw new AppError(404, 'WALLET_NOT_FOUND', `Wallet for user #${targetUserId} not found`);
        }

        // 3. Calculate new materialized balance
        const currentBalance = parseFloat(lockedWallet.available_balance);
        const newBalance = (currentBalance + amountNum).toFixed(4);

        // 4. Retrieve ledger accounts
        const userAccount = await this.ledgerRepo.findOrCreateAccount(
          'USER_WALLET',
          targetUserId,
          lockedWallet.currency,
          trx
        );
        const systemAccount = await this.ledgerRepo.getSystemAccount(
          'SYSTEM_EQUITY_ISSUANCE',
          lockedWallet.currency,
          trx
        );

        // 5. Post Balanced Ledger Transaction
        const randomSuffix = crypto.randomBytes(4).toString('hex');
        const txRef = `CRED-${targetUserId}-${Date.now()}-${randomSuffix}`;

        const { transaction } = await this.ledgerRepo.createTransactionWithEntries(
          {
            transaction_reference: txRef,
            transaction_type: 'ADMIN_CREDIT',
            description: input.reason,
            idempotency_key: input.idempotencyKey || null,
            created_by: adminUserId,
          },
          [
            // DEBIT User Wallet (User Asset increases)
            {
              account_id: userAccount.id,
              entry_type: 'DEBIT',
              amount: formattedAmount,
            },
            // CREDIT System Equity Issuance (System Equity increases)
            {
              account_id: systemAccount.id,
              entry_type: 'CREDIT',
              amount: formattedAmount,
            },
          ],
          trx
        );

        // 6. Update Materialized Wallet Balance inside the same transaction
        await this.walletRepo.updateBalance(lockedWallet.id, newBalance, trx);

        logger.info(
          `[ADMIN CREDIT] Admin #${adminUserId} credited $${formattedAmount} to user #${targetUserId}. Old: $${lockedWallet.available_balance}, New: $${newBalance}`
        );

        return {
          transactionReference: transaction.transaction_reference,
          userId: targetUserId,
          amount: formattedAmount,
          operation: 'CREDIT',
          newBalance,
          description: input.reason,
          createdAt: transaction.created_at ? new Date(transaction.created_at).toISOString() : new Date().toISOString(),
        };
      } finally {
        if (typeof (this.walletRepo as any).releaseLock === 'function') {
          (this.walletRepo as any).releaseLock(targetUserId);
        }
      }
    });
  }

  /**
   * Debits virtual capital from a user's wallet (Admin authorized).
   * Verifies sufficient balance under row lock, creates balanced entries, and updates wallet.
   */
  async debitUserWallet(
    adminUserId: number,
    targetUserId: number,
    input: AdminWalletAdjustmentInput
  ): Promise<AdminAdjustmentResult> {
    const amountNum = parseFloat(input.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new AppError(400, 'INVALID_AMOUNT', 'Debit amount must be greater than 0');
    }
    const formattedAmount = amountNum.toFixed(4);

    return this.withTransaction(undefined, async (trx) => {
      try {
        // 1. Idempotency Check
        if (input.idempotencyKey) {
          const existingTx = await this.ledgerRepo.findTransactionByIdempotencyKey(
            input.idempotencyKey,
            trx
          );
          if (existingTx) {
            logger.info(`Idempotent request detected for key: ${input.idempotencyKey}`);
            const wallet = await this.walletRepo.findByUserId(targetUserId, trx);
            return {
              transactionReference: existingTx.transaction_reference,
              userId: targetUserId,
              amount: formattedAmount,
              operation: 'DEBIT',
              newBalance: wallet?.available_balance || '0.0000',
              description: existingTx.description,
              createdAt: existingTx.created_at ? new Date(existingTx.created_at).toISOString() : new Date().toISOString(),
            };
          }
        }

        // 2. Pessimistic Row Lock (SELECT ... FOR UPDATE)
        const lockedWallet = await this.walletRepo.lockWalletByUserId(targetUserId, trx);
        if (!lockedWallet) {
          throw new AppError(404, 'WALLET_NOT_FOUND', `Wallet for user #${targetUserId} not found`);
        }

        // 3. Verify Sufficient Balance INSIDE the lock
        const currentBalance = parseFloat(lockedWallet.available_balance);
        if (currentBalance < amountNum) {
          throw new AppError(
            422,
            'INSUFFICIENT_FUNDS',
            `Insufficient virtual funds. Available: $${lockedWallet.available_balance}, Requested: $${formattedAmount}`
          );
        }

        const newBalance = (currentBalance - amountNum).toFixed(4);

        // 4. Retrieve ledger accounts
        const userAccount = await this.ledgerRepo.findOrCreateAccount(
          'USER_WALLET',
          targetUserId,
          lockedWallet.currency,
          trx
        );
        const systemAdjustmentAccount = await this.ledgerRepo.getSystemAccount(
          'SYSTEM_ADJUSTMENT',
          lockedWallet.currency,
          trx
        );

        // 5. Post Balanced Ledger Transaction
        const randomSuffix = crypto.randomBytes(4).toString('hex');
        const txRef = `DEB-${targetUserId}-${Date.now()}-${randomSuffix}`;

        const { transaction } = await this.ledgerRepo.createTransactionWithEntries(
          {
            transaction_reference: txRef,
            transaction_type: 'ADMIN_DEBIT',
            description: input.reason,
            idempotency_key: input.idempotencyKey || null,
            created_by: adminUserId,
          },
          [
            // DEBIT System Adjustment (Counterparty debit)
            {
              account_id: systemAdjustmentAccount.id,
              entry_type: 'DEBIT',
              amount: formattedAmount,
            },
            // CREDIT User Wallet (User Asset decreases)
            {
              account_id: userAccount.id,
              entry_type: 'CREDIT',
              amount: formattedAmount,
            },
          ],
          trx
        );

        // 6. Update Materialized Wallet Balance
        await this.walletRepo.updateBalance(lockedWallet.id, newBalance, trx);

        logger.info(
          `[ADMIN DEBIT] Admin #${adminUserId} debited $${formattedAmount} from user #${targetUserId}. Old: $${lockedWallet.available_balance}, New: $${newBalance}`
        );

        return {
          transactionReference: transaction.transaction_reference,
          userId: targetUserId,
          amount: formattedAmount,
          operation: 'DEBIT',
          newBalance,
          description: input.reason,
          createdAt: transaction.created_at ? new Date(transaction.created_at).toISOString() : new Date().toISOString(),
        };
      } finally {
        if (typeof (this.walletRepo as any).releaseLock === 'function') {
          (this.walletRepo as any).releaseLock(targetUserId);
        }
      }
    });
  }

  /**
   * Retrieves paginated transaction history for a user's wallet.
   */
  async getTransactionHistory(
    userId: number,
    query: WalletTransactionsQueryInput
  ): Promise<PaginatedResult<WalletTransactionItem>> {
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      throw new AppError(404, 'WALLET_NOT_FOUND', 'Virtual wallet not found for user');
    }

    const account = await this.ledgerRepo.findOrCreateAccount(
      'USER_WALLET',
      userId,
      wallet.currency
    );

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const { entries, total } = await this.ledgerRepo.findEntriesForAccount(account.id, {
      limit,
      offset,
      transactionType: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const items: WalletTransactionItem[] = entries.map((e) => ({
      id: e.id,
      transactionReference: e.transaction_reference,
      transactionType: e.transaction_type,
      description: e.description,
      amount: e.amount,
      direction: e.entry_type === 'DEBIT' ? 'INFLOW' : 'OUTFLOW',
      createdAt: e.tx_created_at ? new Date(e.tx_created_at).toISOString() : new Date().toISOString(),
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single transaction details with its balanced double-entry line items.
   */
  async getTransactionDetails(userId: number, transactionId: number) {
    const tx = await this.ledgerRepo.findTransactionById(transactionId);
    if (!tx) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Ledger transaction not found');
    }

    const userAccount = await this.ledgerRepo.findOrCreateAccount(
      'USER_WALLET',
      userId
    );

    // Verify user participated in this transaction
    const userParticipated = tx.entries.some((e) => e.account_id === userAccount.id);
    if (!userParticipated) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view this transaction');
    }

    return tx;
  }
}

export const walletService = new WalletService();
