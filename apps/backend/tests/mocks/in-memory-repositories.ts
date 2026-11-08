import { Knex } from 'knex';
import {
  UserRole,
  UserStatus,
  LedgerAccountType,
  TransactionType,
  LedgerEntryType,
  Order,
  OrderSide,
  OrderType,
  OrderStatus,
  OrderFilterQuery,
  Competition,
  CompetitionParticipant,
  CompetitionAccount,
  CompetitionPosition,
  CompetitionOrder,
  CompetitionTrade,
  CompetitionLeaderboardEntry,
  CompetitionStatus,
  CompetitionVisibility,
} from '@tradegrid/shared-types';
import { ICompetitionRepository, CompetitionRecord, CompetitionParticipantRecord, CompetitionAccountRecord, CompetitionPositionRecord, CompetitionOrderRecord, CompetitionTradeRecord } from '../../src/modules/competitions/competition.types';
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
import {
  IOrderRepository,
  CreateOrderDbData,
} from '../../src/modules/orders/order.repository';
import {
  ITradeRepository,
  TradeRecord,
  CreateTradeData,
} from '../../src/modules/trading/trade.repository';
import {
  IPositionRepository,
  PositionRecord,
  UpsertPositionData,
} from '../../src/modules/portfolio/position.repository';
import { TradeFilterQuery, NewsFilterQuery, NewsMetricsSummary } from '@tradegrid/shared-types';
import { INewsRepository } from '../../src/modules/news/news.repository';
import {
  NewsArticleRecord,
  NewsCatalystRecord,
  NewsCatalystExecutionRecord,
} from '../../src/modules/news/news.types';

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

export class InMemoryOrderRepository implements IOrderRepository {
  private orders: Order[] = [];
  private nextId = 1;

  async create(data: CreateOrderDbData): Promise<Order> {
    const now = new Date().toISOString();
    const order: Order = {
      id: this.nextId++,
      userId: data.userId,
      instrumentId: data.instrumentId,
      symbol: 'TGRID',
      instrumentName: 'TradeGrid Core Technologies',
      exchange: 'TRADEGRID',
      currency: 'USD',
      side: data.side,
      orderType: data.orderType,
      quantity: data.quantity,
      remainingQuantity: data.remainingQuantity,
      limitPrice: data.limitPrice,
      status: data.status,
      idempotencyKey: data.idempotencyKey || null,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.push(order);
    return { ...order };
  }

  async findById(id: number): Promise<Order | null> {
    const order = this.orders.find((o) => o.id === id);
    return order ? { ...order } : null;
  }

  async findByUserId(
    userId: number,
    filter: OrderFilterQuery = {}
  ): Promise<{ orders: Order[]; total: number }> {
    let result = this.orders.filter((o) => o.userId === userId);

    if (filter.status) {
      result = result.filter((o) => o.status === filter.status);
    }
    if (filter.side) {
      result = result.filter((o) => o.side === filter.side);
    }
    if (filter.orderType) {
      result = result.filter((o) => o.orderType === filter.orderType);
    }
    if (filter.instrumentId) {
      result = result.filter((o) => o.instrumentId === filter.instrumentId);
    }
    if (filter.symbol) {
      result = result.filter((o) => o.symbol?.toUpperCase() === filter.symbol?.toUpperCase());
    }

    const total = result.length;
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    const paginated = result.slice(offset, offset + limit);
    return {
      orders: paginated.map((o) => ({ ...o })),
      total,
    };
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const order = this.orders.find((o) => o.idempotencyKey === key);
    return order ? { ...order } : null;
  }

  async updateStatus(
    id: number,
    status: OrderStatus,
    remainingQuantity?: string
  ): Promise<Order | null> {
    const order = this.orders.find((o) => o.id === id);
    if (!order) return null;

    order.status = status;
    if (remainingQuantity !== undefined) {
      order.remainingQuantity = remainingQuantity;
    }
    order.updatedAt = new Date().toISOString();
    return { ...order };
  }

  async update(
    id: number,
    data: { status?: OrderStatus; remainingQuantity?: string }
  ): Promise<Order | null> {
    const order = this.orders.find((o) => o.id === id);
    if (!order) return null;

    if (data.status) {
      order.status = data.status;
    }
    if (data.remainingQuantity !== undefined) {
      order.remainingQuantity = data.remainingQuantity;
    }
    order.updatedAt = new Date().toISOString();
    return { ...order };
  }

  async findOpenOrders(
    filter?: { userId?: number; instrumentId?: number; side?: any }
  ): Promise<Order[]> {
    return this.orders
      .filter((o) => {
        if (o.status !== 'OPEN' && o.status !== 'PARTIALLY_FILLED') return false;
        if (parseFloat(o.remainingQuantity) <= 0) return false;
        if (filter?.userId && o.userId !== filter.userId) return false;
        if (filter?.instrumentId && o.instrumentId !== filter.instrumentId) return false;
        if (filter?.side && o.side !== filter.side) return false;
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id)
      .map((o) => ({ ...o }));
  }

  clear(): void {
    this.orders = [];
    this.nextId = 1;
  }
}

export class InMemoryTradeRepository implements ITradeRepository {
  private trades: TradeRecord[] = [];
  private nextId = 1;

  async create(data: CreateTradeData): Promise<TradeRecord> {
    const record: TradeRecord = {
      id: this.nextId++,
      trade_reference: data.trade_reference,
      buy_order_id: data.buy_order_id,
      sell_order_id: data.sell_order_id,
      instrument_id: data.instrument_id,
      buyer_id: data.buyer_id,
      seller_id: data.seller_id,
      price: data.price,
      quantity: data.quantity,
      trade_amount: data.trade_amount,
      buyer_fee: data.buyer_fee || '0.0000',
      seller_fee: data.seller_fee || '0.0000',
      status: data.status || 'SETTLED',
      settlement_transaction_id: data.settlement_transaction_id || null,
      created_at: new Date(),
    };
    this.trades.push(record);
    return { ...record };
  }

  async findById(id: number): Promise<TradeRecord | null> {
    const trade = this.trades.find((t) => t.id === id);
    return trade ? { ...trade } : null;
  }

  async findByReference(reference: string): Promise<TradeRecord | null> {
    const trade = this.trades.find((t) => t.trade_reference === reference);
    return trade ? { ...trade } : null;
  }

  async findByUserId(
    userId: number,
    filter: TradeFilterQuery = {}
  ): Promise<{ trades: TradeRecord[]; total: number }> {
    let result = this.trades.filter((t) => t.buyer_id === userId || t.seller_id === userId);

    if (filter.instrumentId) {
      result = result.filter((t) => t.instrument_id === filter.instrumentId);
    }
    if (filter.startDate) {
      result = result.filter((t) => new Date(t.created_at) >= new Date(filter.startDate!));
    }
    if (filter.endDate) {
      result = result.filter((t) => new Date(t.created_at) <= new Date(filter.endDate!));
    }

    const total = result.length;
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    const paginated = result.slice(offset, offset + limit);
    return {
      trades: paginated.map((t) => ({ ...t })),
      total,
    };
  }

  async findByInstrumentId(instrumentId: number, limit: number = 50): Promise<TradeRecord[]> {
    const filtered = this.trades
      .filter((t) => t.instrument_id === instrumentId)
      .slice(0, limit);
    return filtered.map((t) => ({ ...t }));
  }

  async findByOrderId(orderId: number): Promise<TradeRecord[]> {
    const filtered = this.trades.filter(
      (t) => t.buy_order_id === orderId || t.sell_order_id === orderId
    );
    return filtered.map((t) => ({ ...t }));
  }

  clear(): void {
    this.trades = [];
    this.nextId = 1;
  }
}

export class InMemoryPositionRepository implements IPositionRepository {
  private positions: PositionRecord[] = [];
  private nextId = 1;

  async findByUserAndInstrument(
    userId: number,
    instrumentId: number
  ): Promise<PositionRecord | null> {
    const pos = this.positions.find(
      (p) => p.user_id === userId && p.instrument_id === instrumentId
    );
    return pos ? { ...pos } : null;
  }

  async findByUserId(userId: number): Promise<PositionRecord[]> {
    return this.positions.filter((p) => p.user_id === userId).map((p) => ({ ...p }));
  }

  async upsertPosition(data: UpsertPositionData): Promise<PositionRecord> {
    const existing = this.positions.find(
      (p) => p.user_id === data.user_id && p.instrument_id === data.instrument_id
    );

    if (existing) {
      existing.quantity = data.quantity;
      existing.average_buy_price = data.average_buy_price;
      existing.realized_pnl = data.realized_pnl;
      existing.updated_at = new Date();
      return { ...existing };
    }

    const record: PositionRecord = {
      id: this.nextId++,
      user_id: data.user_id,
      instrument_id: data.instrument_id,
      quantity: data.quantity,
      average_buy_price: data.average_buy_price,
      realized_pnl: data.realized_pnl,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.positions.push(record);
    return { ...record };
  }

  async lockPosition(
    userId: number,
    instrumentId: number
  ): Promise<PositionRecord | null> {
    return this.findByUserAndInstrument(userId, instrumentId);
  }

  clear(): void {
    this.positions = [];
    this.nextId = 1;
  }
}

// ============================================================================
// Phase 5B: In-Memory Bot Repository
// ============================================================================

import {
  IBotRepository,
  CreateBotData,
  CreateConfigData,
  CreateLogData,
} from '../../src/modules/bots/bot.repository';
import {
  BotRecord,
  BotConfigurationRecord,
  BotInstrumentRecord,
  BotExecutionLogRecord,
  BotStatus,
  BotLogStatus,
} from '../../src/modules/bots/bot.types';

export class InMemoryBotRepository implements IBotRepository {
  public bots: BotRecord[] = [];
  public configurations: BotConfigurationRecord[] = [];
  public instruments: BotInstrumentRecord[] = [];
  public logs: BotExecutionLogRecord[] = [];

  private nextBotId = 1;
  private nextConfigId = 1;
  private nextInstId = 1;
  private nextLogId = 1;

  async createBot(data: CreateBotData): Promise<BotRecord> {
    const record: BotRecord = {
      id: this.nextBotId++,
      user_id: data.user_id,
      name: data.name,
      strategy_type: data.strategy_type,
      status: data.status || 'PAUSED',
      allocated_capital: data.allocated_capital,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.bots.push(record);
    return { ...record };
  }

  async createConfiguration(data: CreateConfigData): Promise<BotConfigurationRecord> {
    const record: BotConfigurationRecord = {
      id: this.nextConfigId++,
      bot_id: data.bot_id,
      quote_refresh_interval_ms: data.quote_refresh_interval_ms || 5000,
      spread_bps: data.spread_bps || '50.00',
      order_quantity: data.order_quantity || '10.0000',
      max_order_quantity: data.max_order_quantity || '50.0000',
      max_order_notional: data.max_order_notional || '10000.0000',
      max_inventory_per_instrument: data.max_inventory_per_instrument || '200.0000',
      max_total_exposure: data.max_total_exposure || '50000.0000',
      max_open_orders: data.max_open_orders || 10,
      max_daily_loss: data.max_daily_loss || '5000.0000',
      skew_factor: data.skew_factor || '0.1000',
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.configurations.push(record);
    return { ...record };
  }

  async createInstruments(botId: number, instrumentIds: number[]): Promise<BotInstrumentRecord[]> {
    const created: BotInstrumentRecord[] = [];
    for (const instId of instrumentIds) {
      const record: BotInstrumentRecord = {
        id: this.nextInstId++,
        bot_id: botId,
        instrument_id: instId,
        is_enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.instruments.push(record);
      created.push(record);
    }
    return created.map((r) => ({ ...r }));
  }

  async findById(id: number): Promise<BotRecord | null> {
    const found = this.bots.find((b) => b.id === id);
    return found ? { ...found } : null;
  }

  async findByUserId(userId: number): Promise<BotRecord | null> {
    const found = this.bots.find((b) => b.user_id === userId);
    return found ? { ...found } : null;
  }

  async findByName(name: string): Promise<BotRecord | null> {
    const found = this.bots.find((b) => b.name === name);
    return found ? { ...found } : null;
  }

  async findAll(options?: { status?: BotStatus }): Promise<BotRecord[]> {
    let result = this.bots;
    if (options?.status) {
      result = result.filter((b) => b.status === options.status);
    }
    return result.map((b) => ({ ...b }));
  }

  async findActiveBots(): Promise<BotRecord[]> {
    return this.findAll({ status: 'ACTIVE' });
  }

  async findConfigurationByBotId(botId: number): Promise<BotConfigurationRecord | null> {
    const found = this.configurations.find((c) => c.bot_id === botId);
    return found ? { ...found } : null;
  }

  async findInstrumentsByBotId(botId: number): Promise<BotInstrumentRecord[]> {
    return this.instruments.filter((i) => i.bot_id === botId).map((i) => ({ ...i }));
  }

  async updateStatus(id: number, status: BotStatus): Promise<void> {
    const bot = this.bots.find((b) => b.id === id);
    if (bot) {
      bot.status = status;
      bot.updated_at = new Date();
    }
  }

  async updateConfiguration(botId: number, data: Partial<CreateConfigData>): Promise<void> {
    let config = this.configurations.find((c) => c.bot_id === botId);
    if (config) {
      if (data.quote_refresh_interval_ms !== undefined) config.quote_refresh_interval_ms = data.quote_refresh_interval_ms;
      if (data.spread_bps !== undefined) config.spread_bps = data.spread_bps;
      if (data.order_quantity !== undefined) config.order_quantity = data.order_quantity;
      if (data.max_order_quantity !== undefined) config.max_order_quantity = data.max_order_quantity;
      if (data.max_order_notional !== undefined) config.max_order_notional = data.max_order_notional;
      if (data.max_inventory_per_instrument !== undefined) config.max_inventory_per_instrument = data.max_inventory_per_instrument;
      if (data.max_total_exposure !== undefined) config.max_total_exposure = data.max_total_exposure;
      if (data.max_open_orders !== undefined) config.max_open_orders = data.max_open_orders;
      if (data.max_daily_loss !== undefined) config.max_daily_loss = data.max_daily_loss;
      if (data.skew_factor !== undefined) config.skew_factor = data.skew_factor;
      config.updated_at = new Date();
    }
  }

  async updateInstruments(botId: number, instrumentIds: number[]): Promise<void> {
    this.instruments = this.instruments.filter((i) => i.bot_id !== botId);
    if (instrumentIds.length > 0) {
      await this.createInstruments(botId, instrumentIds);
    }
  }

  async createLog(data: CreateLogData): Promise<BotExecutionLogRecord> {
    const record: BotExecutionLogRecord = {
      id: this.nextLogId++,
      bot_id: data.bot_id,
      instrument_id: data.instrument_id || null,
      action: data.action,
      details: data.details,
      status: data.status || 'SUCCESS',
      created_at: new Date(),
    };
    this.logs.unshift(record); // newest first
    return { ...record };
  }

  async findLogs(
    botId: number,
    options?: { limit?: number; offset?: number; status?: BotLogStatus; action?: string }
  ): Promise<{ logs: BotExecutionLogRecord[]; total: number }> {
    let filtered = this.logs.filter((l) => l.bot_id === botId);
    if (options?.status) {
      filtered = filtered.filter((l) => l.status === options.status);
    }
    if (options?.action) {
      filtered = filtered.filter((l) => l.action === options.action);
    }

    const total = filtered.length;
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    const paged = filtered.slice(offset, offset + limit);

    return { logs: paged.map((l) => ({ ...l })), total };
  }

  async isBotUser(userId: number): Promise<boolean> {
    return this.bots.some((b) => b.user_id === userId);
  }

  clear(): void {
    this.bots = [];
    this.configurations = [];
    this.instruments = [];
    this.logs = [];
    this.nextBotId = 1;
    this.nextConfigId = 1;
    this.nextInstId = 1;
    this.nextLogId = 1;
  }
}

export class InMemoryNewsRepository implements INewsRepository {
  private articles: NewsArticleRecord[] = [];
  private catalysts: NewsCatalystRecord[] = [];
  private executions: NewsCatalystExecutionRecord[] = [];
  private nextArticleId = 1;
  private nextCatalystId = 1;
  private nextExecutionId = 1;

  async createArticle(
    articleData: Omit<NewsArticleRecord, 'id' | 'created_at' | 'updated_at'>,
    catalystData?: Omit<NewsCatalystRecord, 'id' | 'news_id' | 'created_at' | 'updated_at'>
  ): Promise<{ article: NewsArticleRecord; catalyst?: NewsCatalystRecord }> {
    const article: NewsArticleRecord = {
      id: this.nextArticleId++,
      ...articleData,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.articles.unshift(article);

    let catalyst: NewsCatalystRecord | undefined;
    if (catalystData) {
      catalyst = {
        id: this.nextCatalystId++,
        news_id: article.id,
        ...catalystData,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.catalysts.push(catalyst);
    }

    return { article: { ...article }, catalyst: catalyst ? { ...catalyst } : undefined };
  }

  async findById(
    id: number
  ): Promise<{ article: NewsArticleRecord; catalyst?: NewsCatalystRecord } | null> {
    const article = this.articles.find((a) => a.id === id);
    if (!article) return null;
    const catalyst = this.catalysts.find((c) => c.news_id === id);
    return {
      article: { ...article },
      catalyst: catalyst ? { ...catalyst } : undefined,
    };
  }

  async findArticles(
    filter?: NewsFilterQuery
  ): Promise<{ articles: (NewsArticleRecord & { catalyst?: NewsCatalystRecord })[]; total: number }> {
    let results = [...this.articles];

    if (filter) {
      if (filter.category) {
        results = results.filter((a) => a.category === filter.category);
      }
      if (filter.impactDirection) {
        results = results.filter((a) => a.impact_direction === filter.impactDirection);
      }
      if (filter.severity) {
        results = results.filter((a) => a.severity === filter.severity);
      }
      if (filter.targetScope) {
        results = results.filter((a) => a.target_scope === filter.targetScope);
      }
      if (filter.status) {
        results = results.filter((a) => a.status === filter.status);
      }
      if (filter.targetSymbol) {
        results = results.filter(
          (a) => a.target_symbol?.toUpperCase() === filter.targetSymbol?.toUpperCase()
        );
      }
      if (filter.search) {
        const query = filter.search.toLowerCase();
        results = results.filter(
          (a) =>
            a.headline.toLowerCase().includes(query) ||
            a.summary.toLowerCase().includes(query)
        );
      }
    }

    const total = results.length;
    const page = filter?.page || 1;
    const limit = filter?.limit || 20;
    const offset = (page - 1) * limit;

    const paged = results.slice(offset, offset + limit).map((a) => {
      const catalyst = this.catalysts.find((c) => c.news_id === a.id);
      return {
        ...a,
        catalyst: catalyst ? { ...catalyst } : undefined,
      };
    });

    return { articles: paged, total };
  }

  async updateArticle(
    id: number,
    data: Partial<NewsArticleRecord>
  ): Promise<NewsArticleRecord> {
    const index = this.articles.findIndex((a) => a.id === id);
    if (index === -1) {
      throw new Error(`News article #${id} not found`);
    }

    this.articles[index] = {
      ...this.articles[index],
      ...data,
      updated_at: new Date(),
    };

    return { ...this.articles[index] };
  }

  async deleteArticle(id: number): Promise<boolean> {
    const initialLen = this.articles.length;
    this.articles = this.articles.filter((a) => a.id !== id);
    this.catalysts = this.catalysts.filter((c) => c.news_id !== id);
    return this.articles.length < initialLen;
  }

  async findDueScheduledArticles(now: Date): Promise<NewsArticleRecord[]> {
    return this.articles
      .filter((a) => a.status === 'SCHEDULED' && a.scheduled_at && new Date(a.scheduled_at) <= now)
      .map((a) => ({ ...a }));
  }

  async findActiveCatalysts(
    _now: Date
  ): Promise<{ article: NewsArticleRecord; catalyst: NewsCatalystRecord }[]> {
    const activeResults: { article: NewsArticleRecord; catalyst: NewsCatalystRecord }[] = [];
    for (const cat of this.catalysts) {
      if (cat.status === 'ACTIVE' || cat.status === 'DECAYING') {
        const article = this.articles.find((a) => a.id === cat.news_id);
        if (article && (article.status === 'ACTIVE' || article.status === 'DECAYING')) {
          activeResults.push({
            article: { ...article },
            catalyst: { ...cat },
          });
        }
      }
    }
    return activeResults;
  }

  async findCatalystByNewsId(newsId: number): Promise<NewsCatalystRecord | null> {
    const cat = this.catalysts.find((c) => c.news_id === newsId);
    return cat ? { ...cat } : null;
  }

  async createCatalyst(
    catalystData: Omit<NewsCatalystRecord, 'id' | 'created_at' | 'updated_at'>
  ): Promise<NewsCatalystRecord> {
    const record: NewsCatalystRecord = {
      id: this.nextCatalystId++,
      ...catalystData,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.catalysts.push(record);
    return { ...record };
  }

  async updateCatalyst(
    id: number,
    data: Partial<NewsCatalystRecord>
  ): Promise<NewsCatalystRecord> {
    const index = this.catalysts.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`Catalyst #${id} not found`);
    }

    this.catalysts[index] = {
      ...this.catalysts[index],
      ...data,
      updated_at: new Date(),
    };

    return { ...this.catalysts[index] };
  }

  async createExecution(
    executionData: Omit<NewsCatalystExecutionRecord, 'id' | 'created_at'>
  ): Promise<NewsCatalystExecutionRecord> {
    const record: NewsCatalystExecutionRecord = {
      id: this.nextExecutionId++,
      ...executionData,
      created_at: new Date(),
    };
    this.executions.unshift(record);
    return { ...record };
  }

  async findExecutionsByNewsId(
    newsId: number,
    options?: { page?: number; limit?: number }
  ): Promise<{ executions: NewsCatalystExecutionRecord[]; total: number }> {
    const filtered = this.executions.filter((e) => e.news_id === newsId);
    const total = filtered.length;
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;
    const paged = filtered.slice(offset, offset + limit);
    return { executions: paged.map((e) => ({ ...e })), total };
  }

  async getMetricsSummary(): Promise<NewsMetricsSummary> {
    const totalArticles = this.articles.length;
    const activeCatalysts = this.catalysts.filter(
      (c) => c.status === 'ACTIVE' || c.status === 'DECAYING'
    ).length;
    const scheduledArticles = this.articles.filter((a) => a.status === 'SCHEDULED').length;
    const expiredArticles = this.articles.filter((a) => a.status === 'EXPIRED').length;

    let sentimentSum = 0;
    let maxVol = 1.0;
    let activeWithCat = 0;

    for (const c of this.catalysts) {
      if (c.status === 'ACTIVE' || c.status === 'DECAYING') {
        sentimentSum += parseFloat(c.sentiment_score || '0');
        const v = parseFloat(c.volatility_factor || '1');
        if (v > maxVol) maxVol = v;
        activeWithCat++;
      }
    }

    const avgSentiment = activeWithCat > 0 ? (sentimentSum / activeWithCat).toFixed(2) : '0.00';

    return {
      totalArticles,
      activeCatalysts,
      scheduledArticles,
      expiredArticles,
      averageSentimentScore: avgSentiment,
      maxActiveVolatilityFactor: maxVol.toFixed(2),
    };
  }

  clear(): void {
    this.articles = [];
    this.catalysts = [];
    this.executions = [];
    this.nextArticleId = 1;
    this.nextCatalystId = 1;
    this.nextExecutionId = 1;
  }
}

export class InMemoryCompetitionRepository implements ICompetitionRepository {
  private competitions: Competition[] = [];
  private participants: CompetitionParticipant[] = [];
  private accounts: CompetitionAccount[] = [];
  private positions: CompetitionPosition[] = [];
  private orders: CompetitionOrder[] = [];
  private trades: CompetitionTrade[] = [];
  private snapshots: { competitionId: number; isFinal: boolean; data: CompetitionLeaderboardEntry[]; createdAt: string }[] = [];
  private auditLogs: any[] = [];

  private nextCompId = 1;
  private nextParticipantId = 1;
  private nextAccountId = 1;
  private nextPositionId = 1;
  private nextOrderId = 1;
  private nextTradeId = 1;

  async transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return callback({} as any);
  }

  async createCompetition(data: Partial<CompetitionRecord>): Promise<Competition> {
    const id = this.nextCompId++;
    const now = new Date().toISOString();
    const comp: Competition = {
      id,
      name: data.name || `Competition ${id}`,
      description: data.description || '',
      creatorId: data.creator_id || 1,
      visibility: data.visibility || 'PUBLIC',
      joinCode: data.join_code || null,
      startingCapital: data.starting_capital || '100000.0000',
      maxParticipants: data.max_participants || 100,
      minParticipants: data.min_participants || 2,
      participantCount: 0,
      startTime: data.start_time instanceof Date ? data.start_time.toISOString() : String(data.start_time || now),
      endTime: data.end_time instanceof Date ? data.end_time.toISOString() : String(data.end_time || now),
      allowedInstruments: data.allowed_instruments ? JSON.parse(data.allowed_instruments) : null,
      permittedOrderTypes: data.permitted_order_types ? JSON.parse(data.permitted_order_types) : ['LIMIT', 'MARKET'],
      status: (data.status as CompetitionStatus) || 'UPCOMING',
      createdAt: now,
      updatedAt: now,
    };
    this.competitions.push(comp);
    return { ...comp };
  }

  async findById(id: number): Promise<Competition | null> {
    const c = this.competitions.find((x) => x.id === id);
    if (!c) return null;
    const participantCount = this.participants.filter(
      (p) => p.competitionId === id && p.status === 'JOINED'
    ).length;
    return { ...c, participantCount };
  }

  async findCompetitions(filters: {
    status?: CompetitionStatus;
    visibility?: CompetitionVisibility;
    search?: string;
    userId?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ competitions: Competition[]; total: number }> {
    let result = [...this.competitions];
    if (filters.status) {
      result = result.filter((c) => c.status === filters.status);
    }
    if (filters.visibility) {
      result = result.filter((c) => c.visibility === filters.visibility);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      );
    }
    if (filters.userId) {
      const joinedCompIds = new Set(
        this.participants
          .filter((p) => p.userId === filters.userId && p.status === 'JOINED')
          .map((p) => p.competitionId)
      );
      result = result.filter((c) => joinedCompIds.has(c.id));
    }

    const total = result.length;
    result.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const paged = result.slice(offset, offset + limit).map((c) => {
      const participantCount = this.participants.filter(
        (p) => p.competitionId === c.id && p.status === 'JOINED'
      ).length;
      return { ...c, participantCount };
    });

    return { competitions: paged, total };
  }

  async updateCompetition(id: number, data: Partial<CompetitionRecord>): Promise<Competition> {
    const c = this.competitions.find((x) => x.id === id);
    if (!c) throw new Error(`Competition #${id} not found`);
    if (data.status) c.status = data.status;
    if (data.name) c.name = data.name;
    c.updatedAt = new Date().toISOString();
    return { ...c };
  }

  async addParticipant(data: {
    competitionId: number;
    userId: number;
    startingCapital: string;
  }): Promise<CompetitionParticipant> {
    const id = this.nextParticipantId++;
    const now = new Date().toISOString();
    const p: CompetitionParticipant = {
      id,
      competitionId: data.competitionId,
      userId: data.userId,
      username: `Trader #${data.userId}`,
      status: 'JOINED',
      startingCapital: data.startingCapital,
      currentPortfolioValue: data.startingCapital,
      totalReturnPercent: '0.0000',
      rank: null,
      tradeCount: 0,
      joinedAt: now,
      updatedAt: now,
    };
    this.participants.push(p);
    return { ...p };
  }

  async findParticipant(competitionId: number, userId: number): Promise<CompetitionParticipant | null> {
    const p = this.participants.find(
      (x) => x.competitionId === competitionId && x.userId === userId
    );
    return p ? { ...p } : null;
  }

  async listParticipants(competitionId: number): Promise<CompetitionParticipant[]> {
    return this.participants
      .filter((p) => p.competitionId === competitionId && p.status === 'JOINED')
      .sort((a, b) => parseFloat(b.totalReturnPercent) - parseFloat(a.totalReturnPercent))
      .map((p, idx) => ({ ...p, rank: idx + 1 }));
  }

  async updateParticipant(
    competitionId: number,
    userId: number,
    data: Partial<CompetitionParticipantRecord>
  ): Promise<void> {
    const p = this.participants.find(
      (x) => x.competitionId === competitionId && x.userId === userId
    );
    if (!p) return;
    if (data.status) p.status = data.status;
    if (data.current_portfolio_value) p.currentPortfolioValue = data.current_portfolio_value;
    if (data.total_return_percent) p.totalReturnPercent = data.total_return_percent;
    if (data.rank !== undefined) p.rank = data.rank;
    if (data.trade_count !== undefined) p.tradeCount = data.trade_count;
    p.updatedAt = new Date().toISOString();
  }

  async countParticipants(competitionId: number): Promise<number> {
    return this.participants.filter(
      (p) => p.competitionId === competitionId && p.status === 'JOINED'
    ).length;
  }

  async createAccount(data: {
    competitionId: number;
    userId: number;
    startingCapital: string;
  }): Promise<CompetitionAccount> {
    const id = this.nextAccountId++;
    const now = new Date().toISOString();
    const acc: CompetitionAccount = {
      id,
      competitionId: data.competitionId,
      userId: data.userId,
      availableCash: data.startingCapital,
      reservedCash: '0.0000',
      totalCash: data.startingCapital,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.push(acc);
    return { ...acc };
  }

  async getAccount(competitionId: number, userId: number): Promise<CompetitionAccount | null> {
    const a = this.accounts.find(
      (x) => x.competitionId === competitionId && x.userId === userId
    );
    if (!a) return null;
    return {
      ...a,
      totalCash: (parseFloat(a.availableCash) + parseFloat(a.reservedCash)).toFixed(4),
    };
  }

  async updateAccount(
    competitionId: number,
    userId: number,
    data: Partial<CompetitionAccountRecord>
  ): Promise<void> {
    const a = this.accounts.find(
      (x) => x.competitionId === competitionId && x.userId === userId
    );
    if (!a) return;
    if (data.available_cash) a.availableCash = data.available_cash;
    if (data.reserved_cash) a.reservedCash = data.reserved_cash;
    a.totalCash = (parseFloat(a.availableCash) + parseFloat(a.reservedCash)).toFixed(4);
    a.updatedAt = new Date().toISOString();
  }

  async getPosition(
    competitionId: number,
    userId: number,
    instrumentId: number
  ): Promise<CompetitionPosition | null> {
    const p = this.positions.find(
      (x) =>
        x.competitionId === competitionId &&
        x.userId === userId &&
        x.instrumentId === instrumentId
    );
    return p ? { ...p } : null;
  }

  async listPositions(competitionId: number, userId: number): Promise<CompetitionPosition[]> {
    return this.positions
      .filter((p) => p.competitionId === competitionId && p.userId === userId)
      .map((p) => ({ ...p }));
  }

  async upsertPosition(data: {
    competitionId: number;
    userId: number;
    instrumentId: number;
    quantity: string;
    reservedQuantity?: string;
    averageEntryPrice: string;
    realizedPnl: string;
  }): Promise<CompetitionPosition> {
    let p = this.positions.find(
      (x) =>
        x.competitionId === data.competitionId &&
        x.userId === data.userId &&
        x.instrumentId === data.instrumentId
    );

    const now = new Date().toISOString();
    if (p) {
      p.quantity = data.quantity;
      if (data.reservedQuantity !== undefined) p.reservedQuantity = data.reservedQuantity;
      p.averageEntryPrice = data.averageEntryPrice;
      p.realizedPnL = data.realizedPnl;
      p.marketValue = (parseFloat(data.averageEntryPrice) * parseFloat(data.quantity)).toFixed(4);
      p.updatedAt = now;
      return { ...p };
    } else {
      const id = this.nextPositionId++;
      p = {
        id,
        competitionId: data.competitionId,
        userId: data.userId,
        instrumentId: data.instrumentId,
        symbol: `INST-${data.instrumentId}`,
        quantity: data.quantity,
        reservedQuantity: data.reservedQuantity || '0.0000',
        averageEntryPrice: data.averageEntryPrice,
        currentPrice: data.averageEntryPrice,
        marketValue: (parseFloat(data.averageEntryPrice) * parseFloat(data.quantity)).toFixed(4),
        unrealizedPnL: '0.0000',
        realizedPnL: data.realizedPnl,
        createdAt: now,
        updatedAt: now,
      };
      this.positions.push(p);
      return { ...p };
    }
  }

  async createOrder(data: {
    competitionId: number;
    userId: number;
    instrumentId: number;
    side: 'BUY' | 'SELL';
    orderType: 'LIMIT' | 'MARKET';
    quantity: string;
    limitPrice: string | null;
    idempotencyKey?: string | null;
  }): Promise<CompetitionOrder> {
    const id = this.nextOrderId++;
    const now = new Date().toISOString();
    const ord: CompetitionOrder = {
      id,
      competitionId: data.competitionId,
      userId: data.userId,
      instrumentId: data.instrumentId,
      symbol: `INST-${data.instrumentId}`,
      side: data.side,
      orderType: data.orderType,
      quantity: data.quantity,
      filledQuantity: '0.0000',
      remainingQuantity: data.quantity,
      limitPrice: data.limitPrice,
      status: 'OPEN',
      idempotencyKey: data.idempotencyKey || null,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.push(ord);
    return { ...ord };
  }

  async getOrderById(id: number): Promise<CompetitionOrder | null> {
    const o = this.orders.find((x) => x.id === id);
    return o ? { ...o } : null;
  }

  async findOrderByIdempotencyKey(competitionId: number, key: string): Promise<CompetitionOrder | null> {
    const o = this.orders.find(
      (x) => x.competitionId === competitionId && x.idempotencyKey === key
    );
    return o ? { ...o } : null;
  }

  async listOrders(filters: {
    competitionId: number;
    userId?: number;
    status?: string;
    instrumentId?: number;
    limit?: number;
  }): Promise<CompetitionOrder[]> {
    let result = this.orders.filter((o) => o.competitionId === filters.competitionId);
    if (filters.userId) result = result.filter((o) => o.userId === filters.userId);
    if (filters.status) result = result.filter((o) => o.status === filters.status);
    if (filters.instrumentId) result = result.filter((o) => o.instrumentId === filters.instrumentId);
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (filters.limit) result = result.slice(0, filters.limit);
    return result.map((o) => ({ ...o }));
  }

  async updateOrder(id: number, data: Partial<CompetitionOrderRecord>): Promise<void> {
    const o = this.orders.find((x) => x.id === id);
    if (!o) return;
    if (data.status) o.status = data.status;
    if (data.filled_quantity) o.filledQuantity = data.filled_quantity;
    if (data.remaining_quantity) o.remainingQuantity = data.remaining_quantity;
    o.updatedAt = new Date().toISOString();
  }

  async createTrade(data: {
    tradeReference: string;
    competitionId: number;
    buyOrderId: number;
    sellOrderId: number;
    buyerId: number;
    sellerId: number;
    instrumentId: number;
    price: string;
    quantity: string;
    amount: string;
  }): Promise<CompetitionTrade> {
    const id = this.nextTradeId++;
    const now = new Date().toISOString();
    const trd: CompetitionTrade = {
      id,
      tradeReference: data.tradeReference,
      competitionId: data.competitionId,
      buyOrderId: data.buyOrderId,
      sellOrderId: data.sellOrderId,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
      buyerUsername: `Trader #${data.buyerId}`,
      sellerUsername: `Trader #${data.sellerId}`,
      instrumentId: data.instrumentId,
      symbol: `INST-${data.instrumentId}`,
      price: data.price,
      quantity: data.quantity,
      amount: data.amount,
      executedAt: now,
    };
    this.trades.push(trd);
    return { ...trd };
  }

  async listTrades(
    competitionId: number,
    options?: { limit?: number; userId?: number }
  ): Promise<CompetitionTrade[]> {
    let result = this.trades.filter((t) => t.competitionId === competitionId);
    if (options?.userId) {
      result = result.filter(
        (t) => t.buyerId === options.userId || t.sellerId === options.userId
      );
    }
    result.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
    if (options?.limit) result = result.slice(0, options.limit);
    return result.map((t) => ({ ...t }));
  }

  async saveLeaderboardSnapshot(
    competitionId: number,
    snapshotData: CompetitionLeaderboardEntry[],
    isFinal = false
  ): Promise<void> {
    this.snapshots.push({
      competitionId,
      isFinal,
      data: snapshotData.map((d) => ({ ...d })),
      createdAt: new Date().toISOString(),
    });
  }

  async getLatestLeaderboardSnapshot(
    competitionId: number
  ): Promise<CompetitionLeaderboardEntry[] | null> {
    const snaps = this.snapshots.filter((s) => s.competitionId === competitionId);
    if (snaps.length === 0) return null;
    snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return snaps[0].data.map((d) => ({ ...d }));
  }

  async createAuditLog(competitionId: number, action: string, details?: any, userId?: number | null): Promise<void> {
    this.auditLogs.push({
      id: this.auditLogs.length + 1,
      competitionId,
      userId: userId || null,
      action,
      details,
      createdAt: new Date().toISOString(),
    });
  }

  clear(): void {
    this.competitions = [];
    this.participants = [];
    this.accounts = [];
    this.positions = [];
    this.orders = [];
    this.trades = [];
    this.snapshots = [];
    this.auditLogs = [];
    this.nextCompId = 1;
    this.nextParticipantId = 1;
    this.nextAccountId = 1;
    this.nextPositionId = 1;
    this.nextOrderId = 1;
    this.nextTradeId = 1;
  }
}



