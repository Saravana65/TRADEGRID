import { Knex } from 'knex';
import { db } from '../../database/connection';
import { LedgerAccountType, TransactionType, LedgerEntryType } from '@tradegrid/shared-types';

export interface LedgerAccountRecord {
  id: number;
  account_type: LedgerAccountType;
  owner_user_id: number | null;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

export interface LedgerTransactionRecord {
  id: number;
  transaction_reference: string;
  transaction_type: TransactionType;
  description: string;
  idempotency_key: string | null;
  created_by: number | null;
  created_at: Date;
}

export interface LedgerEntryRecord {
  id: number;
  ledger_transaction_id: number;
  account_id: number;
  entry_type: LedgerEntryType;
  amount: string;
  created_at: Date;
}

export interface CreateTransactionData {
  transaction_reference: string;
  transaction_type: TransactionType;
  description: string;
  idempotency_key?: string | null;
  created_by?: number | null;
}

export interface CreateEntryData {
  account_id: number;
  entry_type: LedgerEntryType;
  amount: string;
}

export interface ILedgerRepository {
  findOrCreateAccount(
    accountType: LedgerAccountType,
    ownerUserId?: number | null,
    currency?: string,
    trx?: Knex.Transaction
  ): Promise<LedgerAccountRecord>;
  getSystemAccount(
    accountType: LedgerAccountType,
    currency?: string,
    trx?: Knex.Transaction
  ): Promise<LedgerAccountRecord>;
  createTransactionWithEntries(
    txData: CreateTransactionData,
    entries: CreateEntryData[],
    trx: Knex.Transaction
  ): Promise<{ transaction: LedgerTransactionRecord; entries: LedgerEntryRecord[] }>;
  findTransactionByIdempotencyKey(
    key: string,
    trx?: Knex.Transaction
  ): Promise<LedgerTransactionRecord | null>;
  findTransactionByReference(
    ref: string,
    trx?: Knex.Transaction
  ): Promise<LedgerTransactionRecord | null>;
  findTransactionById(
    id: number,
    trx?: Knex.Transaction
  ): Promise<(LedgerTransactionRecord & { entries: LedgerEntryRecord[] }) | null>;
  findEntriesForAccount(
    accountId: number,
    options: {
      limit: number;
      offset: number;
      transactionType?: TransactionType;
      startDate?: string;
      endDate?: string;
    },
    trx?: Knex.Transaction
  ): Promise<{
    entries: Array<
      LedgerEntryRecord & {
        transaction_reference: string;
        transaction_type: TransactionType;
        description: string;
        tx_created_at: Date;
      }
    >;
    total: number;
  }>;
  calculateAccountBalanceFromLedger(accountId: number, trx?: Knex.Transaction): Promise<string>;
  calculateLedgerTotals(
    accountId: number,
    trx?: Knex.Transaction
  ): Promise<{ totalDebited: string; totalCredited: string }>;
}

export class KnexLedgerRepository implements ILedgerRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  private getKnex(trx?: Knex.Transaction): Knex {
    return trx || this.knexInstance;
  }

  async findOrCreateAccount(
    accountType: LedgerAccountType,
    ownerUserId: number | null = null,
    currency: string = 'USD',
    trx?: Knex.Transaction
  ): Promise<LedgerAccountRecord> {
    const k = this.getKnex(trx);
    let query = k<LedgerAccountRecord>('ledger_accounts').where({
      account_type: accountType,
      currency,
    });

    if (ownerUserId === null) {
      query = query.whereNull('owner_user_id');
    } else {
      query = query.where({ owner_user_id: ownerUserId });
    }

    const existing = await query.first();
    if (existing) {
      return existing;
    }

    const [insertedId] = await k('ledger_accounts').insert({
      account_type: accountType,
      owner_user_id: ownerUserId,
      currency,
      created_at: k.fn.now(),
      updated_at: k.fn.now(),
    });

    const created = await k<LedgerAccountRecord>('ledger_accounts').where({ id: insertedId }).first();
    if (!created) {
      throw new Error(`Failed to create ledger account for ${accountType}`);
    }
    return created;
  }

  async getSystemAccount(
    accountType: LedgerAccountType,
    currency: string = 'USD',
    trx?: Knex.Transaction
  ): Promise<LedgerAccountRecord> {
    return this.findOrCreateAccount(accountType, null, currency, trx);
  }

  async createTransactionWithEntries(
    txData: CreateTransactionData,
    entries: CreateEntryData[],
    trx: Knex.Transaction
  ): Promise<{ transaction: LedgerTransactionRecord; entries: LedgerEntryRecord[] }> {
    // 1. Double-Entry Verification: Total Debits must equal Total Credits!
    let totalDebits = 0;
    let totalCredits = 0;

    for (const e of entries) {
      const amt = parseFloat(e.amount);
      if (isNaN(amt) || amt <= 0) {
        throw new Error(`Invalid entry amount: ${e.amount}. Must be a positive decimal.`);
      }
      if (e.entry_type === 'DEBIT') {
        totalDebits += amt;
      } else if (e.entry_type === 'CREDIT') {
        totalCredits += amt;
      }
    }

    // Floating-point delta check for rounding sanity (within 0.0001)
    if (Math.abs(totalDebits - totalCredits) > 0.0001) {
      throw new Error(
        `Ledger Transaction Unbalanced! Total Debits ($${totalDebits.toFixed(
          4
        )}) != Total Credits ($${totalCredits.toFixed(4)})`
      );
    }

    // 2. Insert Transaction Header
    const [txId] = await trx('ledger_transactions').insert({
      transaction_reference: txData.transaction_reference,
      transaction_type: txData.transaction_type,
      description: txData.description,
      idempotency_key: txData.idempotency_key || null,
      created_by: txData.created_by || null,
      created_at: trx.fn.now(),
    });

    // 3. Insert Balanced Entries
    const entryInserts = entries.map((entry) => ({
      ledger_transaction_id: txId,
      account_id: entry.account_id,
      entry_type: entry.entry_type,
      amount: entry.amount as any,
      created_at: trx.fn.now(),
    }));

    await trx('ledger_entries').insert(entryInserts);

    // 4. Return Created Records
    const createdTx = await trx<LedgerTransactionRecord>('ledger_transactions')
      .where({ id: txId })
      .first();
    const createdEntries = await trx<LedgerEntryRecord>('ledger_entries')
      .where({ ledger_transaction_id: txId })
      .orderBy('id', 'asc');

    if (!createdTx) {
      throw new Error('Failed to retrieve created ledger transaction');
    }

    return {
      transaction: createdTx,
      entries: createdEntries.map((e) => ({ ...e, amount: String(e.amount) })),
    };
  }

  async findTransactionByIdempotencyKey(
    key: string,
    trx?: Knex.Transaction
  ): Promise<LedgerTransactionRecord | null> {
    const k = this.getKnex(trx);
    const tx = await k<LedgerTransactionRecord>('ledger_transactions')
      .where({ idempotency_key: key })
      .first();
    return tx || null;
  }

  async findTransactionByReference(
    ref: string,
    trx?: Knex.Transaction
  ): Promise<LedgerTransactionRecord | null> {
    const k = this.getKnex(trx);
    const tx = await k<LedgerTransactionRecord>('ledger_transactions')
      .where({ transaction_reference: ref })
      .first();
    return tx || null;
  }

  async findTransactionById(
    id: number,
    trx?: Knex.Transaction
  ): Promise<(LedgerTransactionRecord & { entries: LedgerEntryRecord[] }) | null> {
    const k = this.getKnex(trx);
    const tx = await k<LedgerTransactionRecord>('ledger_transactions').where({ id }).first();
    if (!tx) return null;

    const entries = await k<LedgerEntryRecord>('ledger_entries')
      .where({ ledger_transaction_id: id })
      .orderBy('id', 'asc');

    return {
      ...tx,
      entries: entries.map((e) => ({ ...e, amount: String(e.amount) })),
    };
  }

  async findEntriesForAccount(
    accountId: number,
    options: {
      limit: number;
      offset: number;
      transactionType?: TransactionType;
      startDate?: string;
      endDate?: string;
    },
    trx?: Knex.Transaction
  ) {
    const k = this.getKnex(trx);

    let baseQuery = k('ledger_entries')
      .join('ledger_transactions', 'ledger_entries.ledger_transaction_id', 'ledger_transactions.id')
      .where('ledger_entries.account_id', accountId);

    if (options.transactionType) {
      baseQuery = baseQuery.where('ledger_transactions.transaction_type', options.transactionType);
    }
    if (options.startDate) {
      baseQuery = baseQuery.where('ledger_transactions.created_at', '>=', options.startDate);
    }
    if (options.endDate) {
      baseQuery = baseQuery.where('ledger_transactions.created_at', '<=', options.endDate);
    }

    const countRes = await baseQuery.clone().count<{ count: number | string }>('* as count').first();
    const total = countRes ? parseInt(String(countRes.count), 10) : 0;

    const rows = await baseQuery
      .clone()
      .select(
        'ledger_entries.id',
        'ledger_entries.ledger_transaction_id',
        'ledger_entries.account_id',
        'ledger_entries.entry_type',
        'ledger_entries.amount',
        'ledger_entries.created_at',
        'ledger_transactions.transaction_reference',
        'ledger_transactions.transaction_type',
        'ledger_transactions.description',
        'ledger_transactions.created_at as tx_created_at'
      )
      .orderBy('ledger_transactions.created_at', 'desc')
      .orderBy('ledger_entries.id', 'desc')
      .limit(options.limit)
      .offset(options.offset);

    return {
      entries: rows.map((r: any) => ({
        id: r.id,
        ledger_transaction_id: r.ledger_transaction_id,
        account_id: r.account_id,
        entry_type: r.entry_type,
        amount: String(r.amount),
        created_at: r.created_at,
        transaction_reference: r.transaction_reference,
        transaction_type: r.transaction_type,
        description: r.description,
        tx_created_at: r.tx_created_at,
      })),
      total,
    };
  }

  /**
   * Recalculates the authoritative balance of an account by summing the immutable ledger:
   * For User Wallet Asset Accounts: DEBIT increases balance, CREDIT decreases balance.
   */
  async calculateAccountBalanceFromLedger(accountId: number, trx?: Knex.Transaction): Promise<string> {
    const k = this.getKnex(trx);
    const result = await k('ledger_entries')
      .where({ account_id: accountId })
      .select(
        k.raw(
          `COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END), 0) as balance`
        )
      )
      .first();

    const balanceNum = result ? parseFloat(result.balance) : 0;
    return balanceNum.toFixed(4);
  }

  async calculateLedgerTotals(
    accountId: number,
    trx?: Knex.Transaction
  ): Promise<{ totalDebited: string; totalCredited: string }> {
    const k = this.getKnex(trx);
    const debits = await k('ledger_entries')
      .where({ account_id: accountId, entry_type: 'DEBIT' })
      .sum('amount as total')
      .first();

    const credits = await k('ledger_entries')
      .where({ account_id: accountId, entry_type: 'CREDIT' })
      .sum('amount as total')
      .first();

    const totalDebited = debits?.total ? parseFloat(String(debits.total)).toFixed(4) : '0.0000';
    const totalCredited = credits?.total ? parseFloat(String(credits.total)).toFixed(4) : '0.0000';

    return { totalDebited, totalCredited };
  }
}

export const ledgerRepository: ILedgerRepository = new KnexLedgerRepository();
