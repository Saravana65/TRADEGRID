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

// ============================================================================
// Phase 3: In-Memory Instrument & Market Data Repositories
// ============================================================================

import {
  Instrument,
  InstrumentFilterQuery,
  InstrumentStatus,
  DataClassification,
  MarketQuote,
  Candle,
  CandleInterval,
  MarketOverviewSummary,
} from '@tradegrid/shared-types';
import { CreateInstrumentInput, UpdateInstrumentInput } from '@tradegrid/validation';
import { IInstrumentRepository } from '../../src/modules/market/instrument.repository';
import {
  IMarketDataRepository,
  MarketQuoteRow,
  MarketCandleRow,
} from '../../src/modules/market/market-data.repository';

export class InMemoryInstrumentRepository implements IInstrumentRepository {
  public instruments: Instrument[] = [];
  private nextId = 1;

  constructor() {
    this.seedDefaults();
  }

  seedDefaults(): void {
    const defaultData = [
      { symbol: 'RELIANCE', name: 'Reliance Industries Limited', exchange: 'NSE', sector: 'Energy', currency: 'INR', classification: 'REAL' as DataClassification },
      { symbol: 'TCS', name: 'Tata Consultancy Services Limited', exchange: 'NSE', sector: 'Technology', currency: 'INR', classification: 'REAL' as DataClassification },
      { symbol: 'INFY', name: 'Infosys Limited', exchange: 'NSE', sector: 'Technology', currency: 'INR', classification: 'REAL' as DataClassification },
      { symbol: 'HDFCBANK', name: 'HDFC Bank Limited', exchange: 'NSE', sector: 'Financial Services', currency: 'INR', classification: 'REAL' as DataClassification },
      { symbol: 'ICICIBANK', name: 'ICICI Bank Limited', exchange: 'NSE', sector: 'Financial Services', currency: 'INR', classification: 'REAL' as DataClassification },
      { symbol: 'TGRID', name: 'TradeGrid Technologies Corp', exchange: 'TRADEGRID', sector: 'Financial Technology', currency: 'USD', classification: 'SIMULATED' as DataClassification },
      { symbol: 'NEXUS', name: 'Nexus Quantum Systems', exchange: 'TRADEGRID', sector: 'Semiconductors', currency: 'USD', classification: 'SIMULATED' as DataClassification },
      { symbol: 'SOLARIS', name: 'Solaris Energy Dynamics', exchange: 'TRADEGRID', sector: 'Clean Energy', currency: 'USD', classification: 'SIMULATED' as DataClassification },
      { symbol: 'AERO', name: 'AeroDynamics Hypersonic', exchange: 'TRADEGRID', sector: 'Aerospace', currency: 'USD', classification: 'SIMULATED' as DataClassification },
      { symbol: 'BIOGEN', name: 'BioGen Therapeutics', exchange: 'TRADEGRID', sector: 'Biotechnology', currency: 'USD', classification: 'SIMULATED' as DataClassification },
    ];

    const now = new Date().toISOString();
    for (const d of defaultData) {
      this.instruments.push({
        id: this.nextId++,
        symbol: d.symbol,
        name: d.name,
        exchange: d.exchange,
        sector: d.sector,
        instrumentType: 'EQUITY',
        currency: d.currency,
        marketStatus: 'ACTIVE',
        dataClassification: d.classification,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async findAll(filter: InstrumentFilterQuery = {}): Promise<{ instruments: Instrument[]; total: number }> {
    let result = [...this.instruments];

    if (filter.q) {
      const q = filter.q.toLowerCase();
      result = result.filter(
        (i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
      );
    }
    if (filter.exchange) {
      result = result.filter((i) => i.exchange.toUpperCase() === filter.exchange?.toUpperCase());
    }
    if (filter.sector) {
      result = result.filter((i) => i.sector.toLowerCase() === filter.sector?.toLowerCase());
    }
    if (filter.classification) {
      result = result.filter((i) => i.dataClassification === filter.classification);
    }
    if (filter.status) {
      result = result.filter((i) => i.marketStatus === filter.status);
    }

    result.sort((a, b) => a.symbol.localeCompare(b.symbol));
    const total = result.length;
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const offset = (page - 1) * limit;
    const sliced = result.slice(offset, offset + limit);

    return { instruments: sliced.map((i) => ({ ...i })), total };
  }

  async findById(id: number): Promise<Instrument | null> {
    const inst = this.instruments.find((i) => i.id === id);
    return inst ? { ...inst } : null;
  }

  async findBySymbol(symbol: string, exchange?: string): Promise<Instrument | null> {
    const sym = symbol.toUpperCase();
    const inst = this.instruments.find(
      (i) => i.symbol === sym && (!exchange || i.exchange.toUpperCase() === exchange.toUpperCase())
    );
    return inst ? { ...inst } : null;
  }

  async create(data: CreateInstrumentInput): Promise<Instrument> {
    const now = new Date().toISOString();
    const record: Instrument = {
      id: this.nextId++,
      symbol: data.symbol.toUpperCase(),
      name: data.name,
      exchange: data.exchange.toUpperCase(),
      sector: data.sector,
      instrumentType: data.instrumentType || 'EQUITY',
      currency: data.currency || 'USD',
      marketStatus: data.marketStatus || 'ACTIVE',
      dataClassification: data.dataClassification || 'SIMULATED',
      createdAt: now,
      updatedAt: now,
    };
    this.instruments.push(record);
    return { ...record };
  }

  async update(id: number, data: UpdateInstrumentInput): Promise<Instrument | null> {
    const inst = this.instruments.find((i) => i.id === id);
    if (!inst) return null;

    if (data.name) inst.name = data.name;
    if (data.sector) inst.sector = data.sector;
    if (data.currency) inst.currency = data.currency;
    if (data.marketStatus) inst.marketStatus = data.marketStatus;
    inst.updatedAt = new Date().toISOString();

    return { ...inst };
  }

  async updateStatus(id: number, status: InstrumentStatus): Promise<Instrument | null> {
    const inst = this.instruments.find((i) => i.id === id);
    if (!inst) return null;
    inst.marketStatus = status;
    inst.updatedAt = new Date().toISOString();
    return { ...inst };
  }

  async getDistinctSectors(): Promise<string[]> {
    return Array.from(new Set(this.instruments.map((i) => i.sector))).sort();
  }

  async getDistinctExchanges(): Promise<string[]> {
    return Array.from(new Set(this.instruments.map((i) => i.exchange))).sort();
  }

  clear(): void {
    this.instruments = [];
    this.nextId = 1;
    this.seedDefaults();
  }
}

export class InMemoryMarketDataRepository implements IMarketDataRepository {
  public quotes: MarketQuote[] = [];
  public candles: (Candle & { instrumentId: number; interval: CandleInterval })[] = [];
  private nextQuoteId = 1;

  constructor(instrumentRepo?: InMemoryInstrumentRepository) {
    this.seedDefaults(instrumentRepo);
  }

  seedDefaults(instrumentRepo?: InMemoryInstrumentRepository): void {
    const now = new Date();
    const instruments = instrumentRepo ? instrumentRepo.instruments : [];

    const defaultQuotes: Array<{
      symbol: string;
      lastPrice: string;
      prevClose: string;
      vol: string;
      classification: DataClassification;
    }> = [
      { symbol: 'RELIANCE', lastPrice: '2950.0000', prevClose: '2950.0000', vol: '0', classification: 'REAL' },
      { symbol: 'TCS', lastPrice: '3850.0000', prevClose: '3850.0000', vol: '0', classification: 'REAL' },
      { symbol: 'INFY', lastPrice: '1480.0000', prevClose: '1480.0000', vol: '0', classification: 'REAL' },
      { symbol: 'HDFCBANK', lastPrice: '1620.0000', prevClose: '1620.0000', vol: '0', classification: 'REAL' },
      { symbol: 'ICICIBANK', lastPrice: '1100.0000', prevClose: '1100.0000', vol: '0', classification: 'REAL' },
      { symbol: 'TGRID', lastPrice: '142.5000', prevClose: '138.2000', vol: '1254300', classification: 'SIMULATED' },
      { symbol: 'NEXUS', lastPrice: '310.8000', prevClose: '298.5000', vol: '890200', classification: 'SIMULATED' },
      { symbol: 'SOLARIS', lastPrice: '88.4000', prevClose: '92.1000', vol: '450100', classification: 'SIMULATED' },
      { symbol: 'AERO', lastPrice: '215.0000', prevClose: '210.0000', vol: '672000', classification: 'SIMULATED' },
      { symbol: 'BIOGEN', lastPrice: '64.2000', prevClose: '67.8000', vol: '910400', classification: 'SIMULATED' },
    ];

    defaultQuotes.forEach((dq, idx) => {
      const inst = instruments.find((i) => i.symbol === dq.symbol) || {
        id: idx + 1,
        name: `${dq.symbol} Corp`,
        exchange: dq.classification === 'REAL' ? 'NSE' : 'TRADEGRID',
        sector: 'General',
      };

      const last = parseFloat(dq.lastPrice);
      const prev = parseFloat(dq.prevClose);
      const change = last - prev;
      const changePct = prev > 0 ? (change / prev) * 100 : 0;
      const open = prev + change * 0.3;
      const high = Math.max(open, last) + Math.abs(change * 0.4);
      const low = Math.min(open, last) - Math.abs(change * 0.4);

      this.quotes.push({
        id: this.nextQuoteId++,
        instrumentId: inst.id,
        symbol: dq.symbol,
        name: inst.name,
        exchange: inst.exchange,
        sector: inst.sector,
        lastPrice: last.toFixed(4),
        previousClose: prev.toFixed(4),
        openPrice: open.toFixed(4),
        highPrice: high.toFixed(4),
        lowPrice: low.toFixed(4),
        volume: dq.vol,
        changeAmount: change.toFixed(4),
        changePercent: changePct.toFixed(4),
        dataSource: dq.classification === 'REAL' ? 'NSE_STATIC_REFERENCE_CATALOG' : 'TRADEGRID_SIMULATOR',
        dataClassification: dq.classification,
        timestamp: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      // Seed sample consistent candles for TGRID
      if (dq.symbol === 'TGRID') {
        const intervals: CandleInterval[] = ['1d', '1h', '15m', '5m', '1m'];
        for (const interval of intervals) {
          for (let step = 10; step >= 1; step--) {
            const candleTime = new Date(now.getTime() - step * 3600 * 1000).toISOString();
            const cOpen = 138.0 + step * 0.4;
            const cClose = cOpen + 0.5;
            const cHigh = cClose + 0.5;
            const cLow = cOpen - 0.3;

            this.candles.push({
              instrumentId: inst.id,
              interval,
              timestamp: candleTime,
              open: cOpen.toFixed(4),
              high: cHigh.toFixed(4),
              low: cLow.toFixed(4),
              close: cClose.toFixed(4),
              volume: '15000',
            });
          }
        }
      }
    });
  }

  async getQuoteByInstrumentId(instrumentId: number): Promise<MarketQuote | null> {
    const q = this.quotes.find((item) => item.instrumentId === instrumentId);
    return q ? { ...q } : null;
  }

  async getQuoteBySymbol(symbol: string): Promise<MarketQuote | null> {
    const q = this.quotes.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase());
    return q ? { ...q } : null;
  }

  async getAllQuotes(classification?: DataClassification): Promise<MarketQuote[]> {
    let result = [...this.quotes];
    if (classification) {
      result = result.filter((q) => q.dataClassification === classification);
    }
    result.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return result.map((q) => ({ ...q }));
  }

  async getCandles(
    instrumentId: number,
    interval: CandleInterval,
    limit: number = 100,
    from?: Date,
    to?: Date
  ): Promise<Candle[]> {
    let result = this.candles.filter(
      (c) => c.instrumentId === instrumentId && c.interval === interval
    );

    if (from) {
      const fromTime = from.getTime();
      result = result.filter((c) => new Date(c.timestamp).getTime() >= fromTime);
    }
    if (to) {
      const toTime = to.getTime();
      result = result.filter((c) => new Date(c.timestamp).getTime() <= toTime);
    }

    result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return result.slice(0, limit).map(({ instrumentId: _id, interval: _int, ...candle }) => ({ ...candle }));
  }

  async getTopGainers(limit: number = 5, classification?: DataClassification): Promise<MarketQuote[]> {
    let result = this.quotes.filter((q) => parseFloat(q.changePercent) > 0);
    if (classification) {
      result = result.filter((q) => q.dataClassification === classification);
    }
    result.sort((a, b) => parseFloat(b.changePercent) - parseFloat(a.changePercent));
    return result.slice(0, limit).map((q) => ({ ...q }));
  }

  async getTopLosers(limit: number = 5, classification?: DataClassification): Promise<MarketQuote[]> {
    let result = this.quotes.filter((q) => parseFloat(q.changePercent) < 0);
    if (classification) {
      result = result.filter((q) => q.dataClassification === classification);
    }
    result.sort((a, b) => parseFloat(a.changePercent) - parseFloat(b.changePercent));
    return result.slice(0, limit).map((q) => ({ ...q }));
  }

  async getMostActive(limit: number = 5, classification?: DataClassification): Promise<MarketQuote[]> {
    let result = [...this.quotes];
    if (classification) {
      result = result.filter((q) => q.dataClassification === classification);
    }
    result.sort((a, b) => parseInt(b.volume, 10) - parseInt(a.volume, 10));
    return result.slice(0, limit).map((q) => ({ ...q }));
  }

  async getMarketSummary(): Promise<MarketOverviewSummary> {
    const advancing = this.quotes.filter((q) => parseFloat(q.changePercent) > 0).length;
    const declining = this.quotes.filter((q) => parseFloat(q.changePercent) < 0).length;
    const unchanged = this.quotes.filter((q) => parseFloat(q.changePercent) === 0).length;
    const totalVol = this.quotes.reduce((sum, q) => sum + BigInt(q.volume || '0'), 0n).toString();
    const realCount = this.quotes.filter((q) => q.dataClassification === 'REAL').length;
    const simCount = this.quotes.filter((q) => q.dataClassification === 'SIMULATED').length;

    return {
      totalInstruments: this.quotes.length,
      activeInstruments: this.quotes.length,
      haltedInstruments: 0,
      advancingCount: advancing,
      decliningCount: declining,
      unchangedCount: unchanged,
      totalVolume: totalVol,
      realInstrumentsCount: realCount,
      simulatedInstrumentsCount: simCount,
      timestamp: new Date().toISOString(),
    };
  }

  async upsertQuote(data: Partial<MarketQuoteRow> & { instrument_id: number }): Promise<void> {
    const idx = this.quotes.findIndex((q) => q.instrumentId === data.instrument_id);
    const now = new Date().toISOString();
    if (idx >= 0) {
      this.quotes[idx] = {
        ...this.quotes[idx],
        lastPrice: data.last_price || this.quotes[idx].lastPrice,
        previousClose: data.previous_close || this.quotes[idx].previousClose,
        volume: data.volume || this.quotes[idx].volume,
        changeAmount: data.change_amount || this.quotes[idx].changeAmount,
        changePercent: data.change_percent || this.quotes[idx].changePercent,
        updatedAt: now,
      };
    } else {
      this.quotes.push({
        id: this.nextQuoteId++,
        instrumentId: data.instrument_id,
        symbol: data.symbol || 'UNKNOWN',
        name: data.name || 'Unknown Corp',
        exchange: data.exchange || 'TRADEGRID',
        sector: data.sector || 'General',
        lastPrice: data.last_price || '100.0000',
        previousClose: data.previous_close || '100.0000',
        openPrice: data.open_price || '100.0000',
        highPrice: data.high_price || '100.0000',
        lowPrice: data.low_price || '100.0000',
        volume: data.volume || '0',
        changeAmount: data.change_amount || '0.0000',
        changePercent: data.change_percent || '0.0000',
        dataSource: data.data_source || 'SIMULATOR',
        dataClassification: data.data_classification || 'SIMULATED',
        timestamp: now,
        updatedAt: now,
      });
    }
  }

  async insertCandles(candles: Partial<MarketCandleRow>[]): Promise<void> {
    for (const c of candles) {
      if (!c.instrument_id || !c.interval || !c.timestamp) continue;
      this.candles.push({
        instrumentId: c.instrument_id,
        interval: c.interval as CandleInterval,
        timestamp: c.timestamp instanceof Date ? c.timestamp.toISOString() : String(c.timestamp),
        open: c.open || '100.0000',
        high: c.high || '100.0000',
        low: c.low || '100.0000',
        close: c.close || '100.0000',
        volume: c.volume || '1000',
      });
    }
  }

  clear(instrumentRepo?: InMemoryInstrumentRepository): void {
    this.quotes = [];
    this.candles = [];
    this.nextQuoteId = 1;
    this.seedDefaults(instrumentRepo);
  }
}
