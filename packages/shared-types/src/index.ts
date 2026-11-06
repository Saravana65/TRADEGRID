/**
 * TRADEGRID — Shared Domain Types
 * Shared across Backend, Frontend, and Micro-packages.
 */

export type UserRole = 'TRADER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface User {
  id: number;
  email: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  id: number;
  userId: number;
  refreshTokenHash: string;
  expiresAt: string;
  isRevoked: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // in seconds
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface RefreshResponse {
  tokens: AuthTokens;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  version: string;
  uptime: number;
  database: 'connected' | 'disconnected';
  timestamp: string;
}

// ============================================================================
// Phase 2: Wallet & Double-Entry Ledger Types
// ============================================================================

export type LedgerAccountType =
  | 'USER_WALLET'
  | 'SYSTEM_EQUITY_ISSUANCE'
  | 'SYSTEM_ADJUSTMENT'
  | 'SYSTEM_FEE';

export type TransactionType =
  | 'INITIAL_SIGNUP_GRANT'
  | 'ADMIN_CREDIT'
  | 'ADMIN_DEBIT'
  | 'SYSTEM_ADJUSTMENT'
  | 'TRADE_BUY'
  | 'TRADE_SELL'
  | 'FEE';

export type LedgerEntryType = 'DEBIT' | 'CREDIT';

export interface Wallet {
  id: number;
  userId: number;
  currency: string;
  availableBalance: string; // DECIMAL(19,4) represented as string
  createdAt: string;
  updatedAt: string;
}

export interface LedgerAccount {
  id: number;
  accountType: LedgerAccountType;
  ownerUserId: number | null;
  currency: string;
  createdAt: string;
}

export interface LedgerTransaction {
  id: number;
  transactionReference: string;
  transactionType: TransactionType;
  description: string;
  idempotencyKey: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface LedgerEntry {
  id: number;
  ledgerTransactionId: number;
  accountId: number;
  entryType: LedgerEntryType;
  amount: string; // DECIMAL(19,4) string
  createdAt: string;
}

export interface WalletSummaryResponse {
  walletId: number;
  userId: number;
  currency: string;
  availableBalance: string;
  totalCredited: string;
  totalDebited: string;
  isConsistentWithLedger: boolean;
  updatedAt: string;
}

export interface WalletTransactionItem {
  id: number;
  transactionReference: string;
  transactionType: TransactionType;
  description: string;
  amount: string;
  direction: 'INFLOW' | 'OUTFLOW';
  balanceAfter?: string;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type WalletTransactionsResponse = PaginatedResult<WalletTransactionItem>;

export interface TransactionDetailResponse {
  id: number;
  transaction_reference: string;
  transaction_type: TransactionType;
  description: string;
  idempotency_key: string | null;
  created_by: number | null;
  created_at: string;
  entries: Array<{
    id: number;
    ledger_transaction_id: number;
    account_id: number;
    entry_type: LedgerEntryType;
    amount: string;
    created_at: string;
  }>;
}

export interface AdminAdjustmentResult {
  transactionReference: string;
  userId: number;
  amount: string;
  operation: 'CREDIT' | 'DEBIT';
  newBalance: string;
  description: string;
  createdAt: string;
}

// ============================================================================
// Phase 3: Stock Instruments and Market Data Types
// ============================================================================

export type DataClassification = 'REAL' | 'SIMULATED';
export type InstrumentStatus = 'ACTIVE' | 'HALTED' | 'SUSPENDED' | 'DELISTED';
export type InstrumentType = 'EQUITY' | 'INDEX' | 'ETF';
export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '1d';

export interface Instrument {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  instrumentType: InstrumentType;
  currency: string;
  marketStatus: InstrumentStatus;
  dataClassification: DataClassification;
  createdAt: string;
  updatedAt: string;
}

export interface MarketQuote {
  id: number;
  instrumentId: number;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  lastPrice: string; // DECIMAL(18,4) formatted string
  previousClose: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string; // BIGINT formatted string
  changeAmount: string;
  changePercent: string;
  dataSource: string;
  dataClassification: DataClassification;
  timestamp: string;
  updatedAt: string;
}

export interface Candle {
  timestamp: string; // ISO string
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface CandlesResponse {
  symbol: string;
  instrumentId: number;
  exchange: string;
  interval: CandleInterval;
  dataClassification: DataClassification;
  dataSource: string;
  candles: Candle[];
}

export interface MarketOverviewSummary {
  totalInstruments: number;
  activeInstruments: number;
  haltedInstruments: number;
  advancingCount: number;
  decliningCount: number;
  unchangedCount: number;
  totalVolume: string;
  realInstrumentsCount: number;
  simulatedInstrumentsCount: number;
  timestamp: string;
}

export interface InstrumentFilterQuery {
  q?: string;
  exchange?: string;
  sector?: string;
  classification?: DataClassification;
  status?: InstrumentStatus;
  page?: number;
  limit?: number;
}

// ============================================================================
// Phase 4A: Order Management System Types
// ============================================================================

export type MarketStatus = 'PRE_OPEN' | 'OPEN' | 'HALTED' | 'CLOSED';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderTimeInForce = 'GTC' | 'IOC' | 'FOK';
export type OrderStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED';

export interface Order {
  id: number;
  userId: number;
  instrumentId: number;
  symbol?: string;
  instrumentName?: string;
  exchange?: string;
  currency?: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: string; // DECIMAL(18,4) represented as string
  remainingQuantity: string; // DECIMAL(18,4) represented as string
  limitPrice: string | null; // DECIMAL(18,4) represented as string, null for market orders
  status: OrderStatus;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderFilterQuery {
  status?: OrderStatus;
  side?: OrderSide;
  orderType?: OrderType;
  instrumentId?: number;
  symbol?: string;
  page?: number;
  limit?: number;
}

export interface CreateOrderRequest {
  instrumentId: number;
  side: OrderSide;
  orderType: OrderType;
  quantity: string | number;
  limitPrice?: string | number | null;
  idempotencyKey?: string | null;
}

export interface CancelOrderResponse {
  order: Order;
  message: string;
}

export interface StockListing {
  id: number;
  symbol: string;
  name: string;
  sector: string;
  currentPrice: string;
  previousClose: string;
  change: string;
  changePercent: string;
  volume: number;
  isSimulated: boolean;
  status: 'ACTIVE' | 'HALTED';
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  isSimulated: boolean;
  impactScore?: number;
  affectedSymbols?: string[];
}

// ============================================================================
// Phase 4B: Matching Engine, Trades, Order Book, and Portfolio Types
// ============================================================================

export type TradeStatus = 'SETTLED' | 'FAILED' | 'PENDING';

export interface Trade {
  id: number;
  tradeReference: string;
  buyOrderId: number;
  sellOrderId: number;
  instrumentId: number;
  symbol?: string;
  buyerId: number;
  sellerId: number;
  price: string; // DECIMAL(18,4)
  quantity: string; // DECIMAL(18,4)
  tradeAmount: string; // DECIMAL(18,4) = price * quantity
  buyerFee: string;
  sellerFee: string;
  status: TradeStatus;
  settlementTransactionId?: number | null;
  createdAt: string;
}

export interface TradeFilterQuery {
  symbol?: string;
  instrumentId?: number;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

export interface OrderBookLevel {
  price: string;
  quantity: string;
  orderCount: number;
  total: string;
}

export interface OrderBook {
  symbol: string;
  instrumentId: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: string;
  spread?: string;
  midPrice?: string | null;
}

export interface PortfolioPosition {
  id: number;
  userId: number;
  instrumentId: number;
  symbol: string;
  name: string;
  exchange: string;
  dataClassification: DataClassification;
  quantity: string; // DECIMAL(18,4)
  averageBuyPrice: string; // DECIMAL(18,4)
  currentPrice: string;
  marketValue: string;
  unrealizedPnL: string;
  returnPercent: string;
  realizedPnL: string;
  updatedAt: string;
}

export interface PortfolioSummaryResponse {
  userId: number;
  cashBalance: string;
  totalInvested: string;
  totalPortfolioValue: string;
  totalUnrealizedPnL: string;
  totalRealizedPnL: string;
  positions: PortfolioPosition[];
  updatedAt: string;
}

