import { Knex } from 'knex';
import { UserRole, UserStatus, LedgerAccountType, TransactionType, LedgerEntryType } from '@tradegrid/shared-types';
import { IUserRepository, UserRecord, CreateUserData, SafeUserRecord } from '../../src/modules/users/user.repository';
import { ISessionRepository, SessionRecord, CreateSessionData } from '../../src/modules/auth/session.repository';
import { IWalletRepository, WalletRecord, CreateWalletData } from '../../src/modules/wallet/wallet.repository';
import {
  ILedgerRepository,
  LedgerAccountRecord,
  LedgerTransactionRecord,
  LedgerEntryRecord,
  CreateTransactionData,
  CreateEntryData,
} from '../../src/modules/wallet/ledger.repository';

export class InMemoryUserRepository implements IUserRepository {
  private users: UserRecord[] = [];
  private nextId = 1;

  async findById(id: number): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.id === id);
    return user ? { ...user } : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return user ? { ...user } : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    return user ? { ...user } : null;
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    const record: UserRecord = {
      id: this.nextId++,
      email: data.email,
      username: data.username,
      password_hash: data.password_hash,
      role: data.role || 'TRADER',
      status: data.status || 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.users.push(record);
    return { ...record };
  }

  async updateStatus(id: number, status: UserStatus): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.id === id);
    if (!user) return null;
    user.status = status;
    user.updated_at = new Date();
    return { ...user };
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<SafeUserRecord[]> {
    return this.users
      .slice(offset, offset + limit)
      .map(({ password_hash, ...safe }) => safe);
  }

  clear(): void {
    this.users = [];
    this.nextId = 1;
  }
}

export class InMemorySessionRepository implements ISessionRepository {
  private sessions: SessionRecord[] = [];
  private nextId = 1;

  async createSession(data: CreateSessionData): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: this.nextId++,
      user_id: data.user_id,
      refresh_token_hash: data.refresh_token_hash,
      expires_at: data.expires_at,
      is_revoked: false,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent || null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.sessions.push(record);
    return { ...record };
  }

  async findValidSession(tokenHash: string): Promise<SessionRecord | null> {
    const now = new Date();
    const session = this.sessions.find(
      (s) => s.refresh_token_hash === tokenHash && !s.is_revoked && s.expires_at > now
    );
    return session ? { ...session } : null;
  }

  async revokeSession(tokenHash: string): Promise<boolean> {
    const session = this.sessions.find((s) => s.refresh_token_hash === tokenHash);
    if (!session) return false;
    session.is_revoked = true;
    session.updated_at = new Date();
    return true;
  }

  async revokeAllUserSessions(userId: number): Promise<void> {
    for (const session of this.sessions) {
      if (session.user_id === userId) {
        session.is_revoked = true;
        session.updated_at = new Date();
      }
    }
  }

  clear(): void {
    this.sessions = [];
    this.nextId = 1;
  }
}

export class InMemoryWalletRepository implements IWalletRepository {
  public wallets: WalletRecord[] = [];
  private nextId = 1;
  private userLocks = new Map<number, Promise<void>>();
  private lockResolvers = new Map<number, () => void>();

  async findByUserId(userId: number): Promise<WalletRecord | null> {
    const w = this.wallets.find((x) => x.user_id === userId);
    return w ? { ...w } : null;
  }

  async findById(id: number): Promise<WalletRecord | null> {
    const w = this.wallets.find((x) => x.id === id);
    return w ? { ...w } : null;
  }

  async createWallet(data: CreateWalletData): Promise<WalletRecord> {
    const record: WalletRecord = {
      id: this.nextId++,
      user_id: data.user_id,
      currency: data.currency || 'USD',
      available_balance: data.available_balance || '0.0000',
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.wallets.push(record);
    return { ...record };
  }

  async updateBalance(walletId: number, newBalance: string): Promise<void> {
    const w = this.wallets.find((x) => x.id === walletId);
    if (w) {
      w.available_balance = newBalance;
      w.updated_at = new Date();
    }
  }

  /**
   * Simulates pessimistic row locking (SELECT ... FOR UPDATE) in memory
   */
  async lockWalletByUserId(userId: number): Promise<WalletRecord | null> {
    while (this.userLocks.has(userId)) {
      await this.userLocks.get(userId);
    }

    let resolver!: () => void;
    const p = new Promise<void>((res) => {
      resolver = res;
    });
    this.userLocks.set(userId, p);
    this.lockResolvers.set(userId, resolver);

    const w = this.wallets.find((x) => x.user_id === userId);
    return w ? { ...w } : null;
  }

  releaseLock(userId: number): void {
    const res = this.lockResolvers.get(userId);
    if (res) {
      this.userLocks.delete(userId);
      this.lockResolvers.delete(userId);
      res();
    }
  }

  clear(): void {
    this.wallets = [];
    this.nextId = 1;
    this.userLocks.clear();
    this.lockResolvers.clear();
  }
}

export class InMemoryLedgerRepository implements ILedgerRepository {
  public accounts: LedgerAccountRecord[] = [];
  public transactions: LedgerTransactionRecord[] = [];
  public entries: LedgerEntryRecord[] = [];
  private nextAccId = 1;
  private nextTxId = 1;
  private nextEntryId = 1;

  constructor() {
    this.initSystemAccounts();
  }

  private initSystemAccounts(): void {
    const systemTypes: LedgerAccountType[] = [
      'SYSTEM_EQUITY_ISSUANCE',
      'SYSTEM_ADJUSTMENT',
      'SYSTEM_FEE',
    ];
    for (const t of systemTypes) {
      this.accounts.push({
        id: this.nextAccId++,
        account_type: t,
        owner_user_id: null,
        currency: 'USD',
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  async findOrCreateAccount(
    accountType: LedgerAccountType,
    ownerUserId: number | null = null,
    currency: string = 'USD'
  ): Promise<LedgerAccountRecord> {
    const existing = this.accounts.find(
      (a) =>
        a.account_type === accountType &&
        a.owner_user_id === ownerUserId &&
        a.currency === currency
    );
    if (existing) return { ...existing };

    const record: LedgerAccountRecord = {
      id: this.nextAccId++,
      account_type: accountType,
      owner_user_id: ownerUserId,
      currency,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.accounts.push(record);
    return { ...record };
  }

  async getSystemAccount(
    accountType: LedgerAccountType,
    currency: string = 'USD'
  ): Promise<LedgerAccountRecord> {
    return this.findOrCreateAccount(accountType, null, currency);
  }

  async createTransactionWithEntries(
    txData: CreateTransactionData,
    entries: CreateEntryData[]
  ): Promise<{ transaction: LedgerTransactionRecord; entries: LedgerEntryRecord[] }> {
    let debits = 0;
    let credits = 0;
    for (const e of entries) {
      const amt = parseFloat(e.amount);
      if (isNaN(amt) || amt <= 0) {
        throw new Error(`Invalid entry amount: ${e.amount}`);
      }
      if (e.entry_type === 'DEBIT') debits += amt;
      else credits += amt;
    }

    if (Math.abs(debits - credits) > 0.0001) {
      throw new Error(`Unbalanced transaction! Debits: $${debits.toFixed(4)}, Credits: $${credits.toFixed(4)}`);
    }

    const tx: LedgerTransactionRecord = {
      id: this.nextTxId++,
      transaction_reference: txData.transaction_reference,
      transaction_type: txData.transaction_type,
      description: txData.description,
      idempotency_key: txData.idempotency_key || null,
      created_by: txData.created_by || null,
      created_at: new Date(),
    };
    this.transactions.push(tx);

    const createdEntries: LedgerEntryRecord[] = [];
    for (const e of entries) {
      const entry: LedgerEntryRecord = {
        id: this.nextEntryId++,
        ledger_transaction_id: tx.id,
        account_id: e.account_id,
        entry_type: e.entry_type,
        amount: e.amount,
        created_at: new Date(),
      };
      this.entries.push(entry);
      createdEntries.push(entry);
    }

    return { transaction: { ...tx }, entries: createdEntries.map((x) => ({ ...x })) };
  }

  async findTransactionByIdempotencyKey(key: string): Promise<LedgerTransactionRecord | null> {
    const tx = this.transactions.find((t) => t.idempotency_key === key);
    return tx ? { ...tx } : null;
  }

  async findTransactionByReference(ref: string): Promise<LedgerTransactionRecord | null> {
    const tx = this.transactions.find((t) => t.transaction_reference === ref);
    return tx ? { ...tx } : null;
  }

  async findTransactionById(
    id: number
  ): Promise<(LedgerTransactionRecord & { entries: LedgerEntryRecord[] }) | null> {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) return null;
    const entries = this.entries.filter((e) => e.ledger_transaction_id === id);
    return { ...tx, entries: entries.map((e) => ({ ...e })) };
  }

  async findEntriesForAccount(
    accountId: number,
    options: {
      limit: number;
      offset: number;
      transactionType?: TransactionType;
      startDate?: string;
      endDate?: string;
    }
  ) {
    let filtered = this.entries.filter((e) => e.account_id === accountId);

    const joined = filtered.map((e) => {
      const tx = this.transactions.find((t) => t.id === e.ledger_transaction_id)!;
      return {
        ...e,
        transaction_reference: tx?.transaction_reference || '',
        transaction_type: tx?.transaction_type || ('SYSTEM_ADJUSTMENT' as TransactionType),
        description: tx?.description || '',
        tx_created_at: tx?.created_at || e.created_at,
      };
    });

    let result = joined;
    if (options.transactionType) {
      result = result.filter((r) => r.transaction_type === options.transactionType);
    }

    // Newest first: by timestamp, then by entry ID
    result.sort((a, b) => b.tx_created_at.getTime() - a.tx_created_at.getTime() || b.id - a.id);

    const total = result.length;
    const sliced = result.slice(options.offset, options.offset + options.limit);

    return { entries: sliced, total };
  }

  async calculateAccountBalanceFromLedger(accountId: number): Promise<string> {
    const entries = this.entries.filter((e) => e.account_id === accountId);
    let balance = 0;
    for (const e of entries) {
      const amt = parseFloat(e.amount);
      if (e.entry_type === 'DEBIT') balance += amt;
      else balance -= amt;
    }
    return balance.toFixed(4);
  }

  async calculateLedgerTotals(accountId: number): Promise<{ totalDebited: string; totalCredited: string }> {
    const entries = this.entries.filter((e) => e.account_id === accountId);
    let debits = 0;
    let credits = 0;
    for (const e of entries) {
      const amt = parseFloat(e.amount);
      if (e.entry_type === 'DEBIT') debits += amt;
      else credits += amt;
    }
    return { totalDebited: debits.toFixed(4), totalCredited: credits.toFixed(4) };
  }

  clear(): void {
    this.accounts = [];
    this.transactions = [];
    this.entries = [];
    this.nextAccId = 1;
    this.nextTxId = 1;
    this.nextEntryId = 1;
    this.initSystemAccounts();
  }
}
