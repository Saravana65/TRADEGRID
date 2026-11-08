/**
 * TRADEGRID — Shared Domain Types
 * Shared across Backend, Frontend, and Micro-packages.
 */

export type UserRole = 'TRADER' | 'ADMIN' | 'BOT';
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
  isBot?: boolean;
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
  isBot?: boolean;
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

// ============================================================================
// Phase 5A: Real-Time WebSocket Streaming Contracts
// ============================================================================

export interface MarketPriceUpdateEvent {
  eventId: string;
  symbol: string;
  instrumentId: number;
  lastPrice: string;
  changeAmount: string;
  changePercent: string;
  volume: number;
  highPrice: string;
  lowPrice: string;
  sequence: number;
  timestamp: string;
}

export interface MarketStatusEvent {
  eventId: string;
  symbol?: string;
  marketStatus: InstrumentStatus;
  reason?: string;
  timestamp: string;
}

export interface OrderBookSnapshotEvent {
  eventId: string;
  symbol: string;
  instrumentId: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: string;
  midPrice: string | null;
  sequence: number;
  timestamp: string;
}

export interface OrderBookDepthUpdateEvent {
  eventId: string;
  symbol: string;
  instrumentId: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: string;
  midPrice: string | null;
  sequence: number;
  prevSequence: number;
  timestamp: string;
}

export interface TradeTapeUpdateEvent {
  eventId: string;
  tradeId: number;
  tradeReference: string;
  symbol: string;
  instrumentId: number;
  price: string;
  quantity: string;
  tradeAmount: string;
  aggressorSide?: OrderSide;
  dataClassification: DataClassification;
  isBot?: boolean;
  executedAt: string;
}

export interface PrivateTradeExecutedEvent extends TradeTapeUpdateEvent {
  buyOrderId: number;
  sellOrderId: number;
  buyerId: number;
  sellerId: number;
  role: 'BUYER' | 'SELLER';
}

export interface OrderLifecycleEvent {
  eventId: string;
  order: Order;
  trade?: Trade;
  timestamp: string;
}

export interface PortfolioUpdatedEvent {
  eventId: string;
  userId: number;
  cashBalance: string;
  totalPortfolioValue: string;
  totalInvested: string;
  totalUnrealizedPnL: string;
  totalRealizedPnL: string;
  timestamp: string;
}

export type WebSocketChannel =
  | `market:${string}`
  | `orderbook:${string}`
  | `trades:${string}`
  | `user:${number}`
  | 'admin:bots'
  | 'news'
  | 'admin:news'
  | `competition:${number}`
  | 'chat:global'
  | `chat:symbol:${string}`
  | `chat:conversation:${number}`;

export interface SubscriptionRequest {
  channel: string;
}

export interface SubscriptionResponse {
  channel: string;
  status: 'subscribed' | 'unsubscribed' | 'error';
  message?: string;
}

// ============================================================================
// Phase 5B: Autonomous Market-Making Bots & Simulated Liquidity Generator Types
// ============================================================================

export type BotStrategyType =
  | 'CONSERVATIVE_MM'
  | 'BALANCED_MM'
  | 'AGGRESSIVE_LP'
  | 'RANDOM_LIQUIDITY';

export type BotStatus = 'ACTIVE' | 'PAUSED' | 'KILLED';

export interface BotConfiguration {
  id?: number;
  botId: number;
  quoteRefreshIntervalMs: number;
  spreadBps: number;
  orderQuantity: string;
  maxOrderQuantity: string;
  maxOrderNotional: string;
  maxInventoryPerInstrument: string;
  maxTotalExposure: string;
  maxOpenOrders: number;
  maxDailyLoss: string;
  skewFactor: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BotInstrument {
  id?: number;
  botId: number;
  instrumentId: number;
  symbol?: string;
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Bot {
  id: number;
  userId: number;
  name: string;
  strategyType: BotStrategyType;
  status: BotStatus;
  allocatedCapital: string;
  currentCashBalance?: string;
  totalInventory?: string;
  openOrdersCount?: number;
  realizedPnL?: string;
  unrealizedPnL?: string;
  configuration?: BotConfiguration;
  instruments?: BotInstrument[];
  createdAt: string;
  updatedAt: string;
}

export type BotLogAction =
  | 'QUOTE_CYCLE'
  | 'ORDER_SUBMITTED'
  | 'ORDER_CANCELLED'
  | 'RISK_REJECTED'
  | 'KILL_SWITCH'
  | 'STATUS_CHANGE'
  | 'ERROR';

export type BotLogStatus = 'SUCCESS' | 'WARNING' | 'FAILURE';

export interface BotExecutionLog {
  id: number;
  botId: number;
  instrumentId: number | null;
  symbol?: string;
  action: BotLogAction;
  details: Record<string, unknown> | string;
  status: BotLogStatus;
  createdAt: string;
}

export interface BotMetricsSummary {
  totalBots: number;
  activeBots: number;
  pausedBots: number;
  killedBots: number;
  totalAllocatedCapital: string;
  totalActiveCapital: string;
  totalOpenBotOrders: number;
  totalBotTradesToday: number;
  totalBotVolumeToday: string;
  totalRealizedPnL: string;
}

export interface BotMetrics {
  botId: number;
  name: string;
  strategyType: BotStrategyType;
  status: BotStatus;
  allocatedCapital: string;
  availableCash: string;
  inventoryByInstrument: Record<string, { quantity: string; averagePrice: string }>;
  openOrdersCount: number;
  totalTrades: number;
  realizedPnL: string;
  dailyRealizedLoss: string;
  lastExecutionAt?: string;
}

// Bot Real-Time WebSocket Events
export interface BotStatusEvent {
  eventId: string;
  botId: number;
  name: string;
  strategyType: BotStrategyType;
  status: BotStatus;
  reason?: string;
  timestamp: string;
}

export interface BotOrderGeneratedEvent {
  eventId: string;
  botId: number;
  name: string;
  orderId: number;
  instrumentId: number;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: string;
  limitPrice: string | null;
  timestamp: string;
}

export interface BotExecutionEvent {
  eventId: string;
  botId: number;
  tradeId: number;
  tradeReference: string;
  instrumentId: number;
  symbol: string;
  price: string;
  quantity: string;
  tradeAmount: string;
  side: 'BUY' | 'SELL';
  timestamp: string;
}

export interface BotRiskWarningEvent {
  eventId: string;
  botId: number;
  instrumentId?: number;
  symbol?: string;
  ruleBreached: string;
  details: string;
  actionTaken: 'QUOTE_SKIPPED' | 'BOT_PAUSED' | 'KILLED';
  timestamp: string;
}

// ============================================================================
// Phase 5C: Simulated News Catalyst Engine Types
// ============================================================================

export type NewsCategory =
  | 'Earnings'
  | 'Revenue'
  | 'Management'
  | 'Product Launch'
  | 'Partnership'
  | 'Regulatory'
  | 'Legal'
  | 'Economic'
  | 'Industry'
  | 'Competition'
  | 'Crisis'
  | 'Market Sentiment'
  | 'Other';

export type NewsImpactDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export type NewsSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export type NewsTargetScope = 'INSTRUMENT' | 'SECTOR' | 'MARKET';

export type NewsStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CANCELLED';

export type CatalystStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'DECAYING'
  | 'EXPIRED'
  | 'CANCELLED';

export type CatalystActionType =
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'CATALYST_ACTIVATED'
  | 'TICK_APPLIED'
  | 'DECAY_APPLIED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface NewsCatalyst {
  id?: number;
  newsId: number;
  sentimentScore: string; // -1.0000 to +1.0000
  volatilityFactor: string; // 1.0000 to 5.0000
  expectedParticipation: string; // 1.0000 to 3.0000
  durationSeconds: number; // e.g. 300
  decayRate: string; // e.g. 0.0200
  status: CatalystStatus;
  activatedAt?: string | null;
  decayStartsAt?: string | null;
  expiredAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface NewsArticle {
  id: number;
  headline: string;
  summary: string;
  content?: string | null;
  category: NewsCategory;
  impactDirection: NewsImpactDirection;
  severity: NewsSeverity;
  targetScope: NewsTargetScope;
  targetId?: string | null;
  targetSymbol?: string | null;
  targetSector?: string | null;
  status: NewsStatus;
  isSimulated: boolean;
  createdBy: number;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  catalyst?: NewsCatalyst | null;
}

export interface NewsCatalystExecution {
  id: number;
  catalystId: number;
  newsId: number;
  action: CatalystActionType;
  effectiveImpact: string; // calculated newsImpact
  affectedInstruments?: string[];
  details?: Record<string, unknown> | string;
  createdAt: string;
}

export interface ActiveCatalystSummary {
  catalystId: number;
  newsId: number;
  headline: string;
  category: NewsCategory;
  impactDirection: NewsImpactDirection;
  severity: NewsSeverity;
  targetScope: NewsTargetScope;
  targetSymbol?: string | null;
  targetSector?: string | null;
  sentimentScore: string;
  volatilityFactor: string;
  effectiveImpact: string;
  decayRemainingPercent: number;
  activatedAt: string;
  expiresAt: string;
}

export interface NewsMetricsSummary {
  totalArticles: number;
  activeCatalysts: number;
  scheduledArticles: number;
  publishedArticles: number;
  expiredArticles: number;
  cancelledArticles: number;
}

export interface NewsFilterQuery {
  category?: NewsCategory;
  impactDirection?: NewsImpactDirection;
  severity?: NewsSeverity;
  targetScope?: NewsTargetScope;
  targetSymbol?: string;
  targetSector?: string;
  status?: NewsStatus;
  isSimulated?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateNewsRequest {
  headline: string;
  summary: string;
  content?: string;
  category: NewsCategory;
  impactDirection: NewsImpactDirection;
  severity: NewsSeverity;
  targetScope: NewsTargetScope;
  targetId?: string;
  targetSymbol?: string;
  targetSector?: string;
  scheduledAt?: string;
  publishImmediately?: boolean;
  catalyst?: {
    sentimentScore?: string;
    volatilityFactor?: string;
    expectedParticipation?: string;
    durationSeconds?: number;
    decayRate?: string;
  };
}

export interface UpdateNewsRequest {
  headline?: string;
  summary?: string;
  content?: string;
  category?: NewsCategory;
  impactDirection?: NewsImpactDirection;
  severity?: NewsSeverity;
  targetScope?: NewsTargetScope;
  targetId?: string;
  targetSymbol?: string;
  targetSector?: string;
  scheduledAt?: string;
  catalyst?: {
    sentimentScore?: string;
    volatilityFactor?: string;
    expectedParticipation?: string;
    durationSeconds?: number;
    decayRate?: string;
  };
}

// Phase 5C Real-Time WebSocket Events
export interface NewsPublishedEvent {
  eventId: string;
  newsId: number;
  headline: string;
  summary: string;
  category: NewsCategory;
  impactDirection: NewsImpactDirection;
  severity: NewsSeverity;
  targetScope: NewsTargetScope;
  targetSymbol?: string | null;
  targetSector?: string | null;
  isSimulated: boolean;
  publishedAt: string;
  expiresAt?: string | null;
  timestamp: string;
}

export interface NewsUpdatedEvent {
  eventId: string;
  newsId: number;
  status: NewsStatus;
  headline: string;
  updatedAt: string;
  timestamp: string;
}

export interface NewsExpiredEvent {
  eventId: string;
  newsId: number;
  catalystId?: number;
  expiredAt: string;
  timestamp: string;
}

export interface CatalystStartedEvent {
  eventId: string;
  catalystId: number;
  newsId: number;
  headline: string;
  targetScope: NewsTargetScope;
  targetSymbol?: string | null;
  targetSector?: string | null;
  sentimentScore: string;
  volatilityFactor: string;
  durationSeconds: number;
  timestamp: string;
}

export interface CatalystUpdatedEvent {
  eventId: string;
  catalystId: number;
  newsId: number;
  effectiveImpact: string;
  decayRemainingPercent: number;
  timestamp: string;
}

export interface CatalystCompletedEvent {
  eventId: string;
  catalystId: number;
  newsId: number;
  completedAt: string;
  timestamp: string;
}

// ============================================================================
// PHASE 5D: MULTIPLAYER TRADING COMPETITIONS & LEADERBOARDS
// ============================================================================

export type CompetitionStatus =
  | 'DRAFT'
  | 'UPCOMING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type CompetitionVisibility = 'PUBLIC' | 'PRIVATE';

export type CompetitionParticipantStatus = 'JOINED' | 'LEFT' | 'DISQUALIFIED';

export interface Competition {
  id: number;
  name: string;
  description: string;
  creatorId: number;
  creatorUsername?: string;
  visibility: CompetitionVisibility;
  joinCode?: string | null;
  startingCapital: string;
  maxParticipants: number;
  minParticipants: number;
  participantCount?: number;
  startTime: string;
  endTime: string;
  allowedInstruments?: string[] | null;
  permittedOrderTypes: ('LIMIT' | 'MARKET')[];
  status: CompetitionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionParticipant {
  id: number;
  competitionId: number;
  userId: number;
  username?: string;
  status: CompetitionParticipantStatus;
  startingCapital: string;
  currentPortfolioValue: string;
  totalReturnPercent: string;
  rank?: number | null;
  tradeCount: number;
  joinedAt: string;
  updatedAt: string;
}

export interface CompetitionAccount {
  id: number;
  competitionId: number;
  userId: number;
  availableCash: string;
  reservedCash: string;
  totalCash: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionPosition {
  id: number;
  competitionId: number;
  userId: number;
  instrumentId: number;
  symbol: string;
  quantity: string;
  reservedQuantity: string;
  averageEntryPrice: string;
  currentPrice: string;
  marketValue: string;
  unrealizedPnL: string;
  realizedPnL: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionOrder {
  id: number;
  competitionId: number;
  userId: number;
  instrumentId: number;
  symbol?: string;
  side: 'BUY' | 'SELL';
  orderType: 'LIMIT' | 'MARKET';
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  limitPrice: string | null;
  status: 'PENDING' | 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionTrade {
  id: number;
  tradeReference: string;
  competitionId: number;
  buyOrderId: number;
  sellOrderId: number;
  buyerId: number;
  sellerId: number;
  buyerUsername?: string;
  sellerUsername?: string;
  instrumentId: number;
  symbol?: string;
  price: string;
  quantity: string;
  amount: string;
  executedAt: string;
}

export interface CompetitionPortfolioSummary {
  competitionId: number;
  userId: number;
  startingCapital: string;
  availableCash: string;
  reservedCash: string;
  holdingsMarketValue: string;
  totalPortfolioValue: string;
  totalReturnPercent: string;
  realizedPnL: string;
  unrealizedPnL: string;
  tradeCount: number;
  rank?: number | null;
  positions: CompetitionPosition[];
  openOrders: CompetitionOrder[];
}

export interface CompetitionLeaderboardEntry {
  rank: number;
  participantId: number;
  userId: number;
  username: string;
  portfolioValue: string;
  totalReturnPercent: string;
  realizedPnL: string;
  unrealizedPnL: string;
  tradeCount: number;
}

export interface CompetitionStartedEvent {
  eventId: string;
  competitionId: number;
  name: string;
  startTime: string;
  endTime: string;
  participantCount: number;
  timestamp: string;
}

export interface CompetitionEndedEvent {
  eventId: string;
  competitionId: number;
  name: string;
  winnerUserId?: number | null;
  winnerUsername?: string | null;
  winnerReturnPercent?: string | null;
  endedAt: string;
  timestamp: string;
}

export interface CompetitionParticipantJoinedEvent {
  eventId: string;
  competitionId: number;
  userId: number;
  username: string;
  participantCount: number;
  timestamp: string;
}

export interface CompetitionParticipantLeftEvent {
  eventId: string;
  competitionId: number;
  userId: number;
  username: string;
  participantCount: number;
  timestamp: string;
}

export interface CompetitionOrderPlacedEvent {
  eventId: string;
  competitionId: number;
  orderId: number;
  userId: number;
  instrumentId: number;
  side: 'BUY' | 'SELL';
  orderType: 'LIMIT' | 'MARKET';
  price: string | null;
  quantity: string;
  timestamp: string;
}

export interface CompetitionTradeExecutedEvent {
  eventId: string;
  competitionId: number;
  tradeReference: string;
  instrumentId: number;
  symbol: string;
  price: string;
  quantity: string;
  buyerId: number;
  sellerId: number;
  timestamp: string;
}

export interface CompetitionLeaderboardUpdatedEvent {
  eventId: string;
  competitionId: number;
  leaderboard: CompetitionLeaderboardEntry[];
  timestamp: string;
}

export interface CompetitionPortfolioUpdatedEvent {
  eventId: string;
  competitionId: number;
  userId: number;
  portfolioValue: string;
  totalReturnPercent: string;
  availableCash: string;
  timestamp: string;
}

export interface CompetitionCancelledEvent {
  eventId: string;
  competitionId: number;
  name: string;
  reason?: string;
  timestamp: string;
}

// ============================================================================
// PHASE 5E: GLOBAL TRADER CHAT, SYMBOL DISCUSSION ROOMS, SOCIAL MENTIONS & DIRECT MESSAGING
// ============================================================================

export type ChatRoomType = 'GLOBAL' | 'SYMBOL';

export interface ChatRoom {
  id: number;
  slug: string;
  name: string;
  type: ChatRoomType;
  symbol?: string | null;
  description?: string | null;
  isActive: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: number;
  roomId?: number | null;
  conversationId?: number | null;
  senderId: number;
  senderUsername?: string;
  senderRole?: UserRole;
  content: string;
  idempotencyKey?: string | null;
  isDeleted: boolean;
  mentions?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversation {
  id: number;
  user1Id: number;
  user2Id: number;
  otherUser?: {
    id: number;
    username: string;
    role: UserRole;
  };
  lastMessage?: ChatMessage | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageMention {
  id: number;
  messageId: number;
  mentionedUserId: number;
  mentionedUsername?: string;
  roomId?: number | null;
  conversationId?: number | null;
  createdAt: string;
}

export type ChatNotificationType = 'MENTION' | 'DIRECT_MESSAGE' | 'SYSTEM';

export interface ChatNotification {
  id: number;
  userId: number;
  type: ChatNotificationType;
  title: string;
  content: string;
  referenceId?: number | null;
  referenceType?: string | null;
  referenceSlug?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface ChatUserBlock {
  id: number;
  blockerId: number;
  blockedId: number;
  blockedUsername?: string;
  reason?: string | null;
  createdAt: string;
}

export type ChatReportReason = 'SPAM' | 'HARASSMENT' | 'MANIPULATION' | 'OFFENSIVE' | 'OTHER';
export type ChatReportStatus = 'PENDING' | 'REVIEWED' | 'DISMISSED' | 'ACTIONED';

export interface ChatReport {
  id: number;
  reporterId: number;
  reporterUsername?: string;
  reportedUserId?: number | null;
  reportedUsername?: string;
  messageId?: number | null;
  messageContent?: string | null;
  reason: ChatReportReason;
  description?: string | null;
  status: ChatReportStatus;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Phase 5E Real-Time WebSocket Events
export interface ChatMessageNewEvent {
  eventId: string;
  roomId: number;
  roomSlug: string;
  message: ChatMessage;
  timestamp: string;
}

export interface ChatDirectMessageEvent {
  eventId: string;
  conversationId: number;
  message: ChatMessage;
  timestamp: string;
}

export interface ChatMentionNewEvent {
  eventId: string;
  notification: ChatNotification;
  message: ChatMessage;
  timestamp: string;
}

export interface ChatNotificationNewEvent {
  eventId: string;
  notification: ChatNotification;
  timestamp: string;
}

export interface ChatTypingEvent {
  roomId?: number;
  conversationId?: number;
  userId: number;
  username: string;
  isTyping: boolean;
  timestamp: string;
}

export interface ChatMessageReadEvent {
  conversationId: number;
  userId: number;
  lastReadMessageId: number;
  timestamp: string;
}

// ============================================================================
// PHASE 6: AI TRADING INSIGHTS & STRATEGY BACKTESTING ENGINE
// ============================================================================

export type QuantitativeStrategyType =
  | 'SMA_CROSSOVER'
  | 'EMA_CROSSOVER'
  | 'RSI_MOMENTUM'
  | 'MACD_TREND'
  | 'BOLLINGER_REVERSION'
  | 'BREAKOUT';

export type PositionSizingType = 'FIXED_PERCENT' | 'FIXED_QUANTITY' | 'FIXED_AMOUNT';

export interface BacktestParameters {
  instrumentId: number;
  symbol: string;
  interval: CandleInterval;
  startDate: string;
  endDate: string;
  strategyType: QuantitativeStrategyType;
  strategyParams: Record<string, number | string | boolean>;
  initialCapital: number;
  positionSizing: {
    type: PositionSizingType;
    value: number; // e.g. 25% or 100 shares or $10,000
  };
  stopLossPercent?: number; // e.g. 2.5
  takeProfitPercent?: number; // e.g. 5.0
  slippagePercent: number; // e.g. 0.05%
  commissionPercent: number; // e.g. 0.1%
}

export type BacktestExitReason = 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_DATA';

export interface BacktestTrade {
  id: number;
  tradeNumber: number;
  entryTimestamp: string;
  exitTimestamp: string;
  side: 'LONG';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  notional: number;
  grossProfitLoss: number;
  netProfitLoss: number;
  returnPercent: number;
  commission: number;
  slippage: number;
  exitReason: BacktestExitReason;
  barsHeld: number;
}

export interface BacktestEquityPoint {
  timestamp: string;
  equity: number;
  cash: number;
  drawdownPercent: number;
  benchmarkEquity: number;
}

export interface BacktestPerformanceMetrics {
  initialCapital: number;
  finalEquity: number;
  netProfit: number;
  totalReturnPercent: number;
  benchmarkReturnPercent: number;
  cagrPercent: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  winRatePercent: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWinAmount: number;
  avgLossAmount: number;
  avgReturnPercent: number;
  exposurePercent: number;
  profitFactorDisplay: string;
}

export interface AIBacktestAnalysis {
  summary: string;
  strategyStrengths: string[];
  riskFactors: string[];
  optimizationSuggestions: string[];
  marketRegimeFit: string;
  verdict: 'STRONG_CANDIDATE' | 'MODERATE_POTENTIAL' | 'HIGH_RISK_WARNING';
  isAIGenerated: true;
  disclaimer: string;
}

export interface BacktestResult {
  runId: number;
  userId: number;
  parameters: BacktestParameters;
  metrics: BacktestPerformanceMetrics;
  trades: BacktestTrade[];
  equityCurve: BacktestEquityPoint[];
  aiAnalysis?: AIBacktestAnalysis | null;
  candlesAnalyzed: number;
  executionTimeMs: number;
  createdAt: string;
}

export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type SignalStrength = 'WEAK' | 'MODERATE' | 'STRONG';

export interface QuantitativeSignal {
  id: number;
  instrumentId: number;
  symbol: string;
  name: string;
  strategyType: QuantitativeStrategyType;
  signalType: SignalType;
  strength: SignalStrength;
  score: number; // -100 to +100
  currentPrice: number;
  indicatorValues: Record<string, number | string | null>;
  explanation: string;
  timestamp: string;
  disclaimer: string;
}

export interface PortfolioAssetAllocationItem {
  instrumentId: number;
  symbol: string;
  name: string;
  sector: string;
  marketValue: number;
  weightPercent: number;
}

export interface PortfolioSectorAllocationItem {
  sector: string;
  marketValue: number;
  weightPercent: number;
}

export interface PortfolioRiskWarning {
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  type: 'CONCENTRATION' | 'SECTOR_EXPOSURE' | 'CASH_DRAG' | 'VOLATILITY';
  message: string;
}

export interface AIPortfolioReview {
  summary: string;
  healthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  concentrationAssessment: string;
  actionableRecommendations: string[];
  isAIGenerated: true;
  disclaimer: string;
}

export interface PortfolioInsight {
  userId: number;
  portfolioValue: number;
  cashBalance: number;
  investedValue: number;
  cashRatioPercent: number;
  investedRatioPercent: number;
  totalPositions: number;
  assetAllocation: PortfolioAssetAllocationItem[];
  sectorAllocation: PortfolioSectorAllocationItem[];
  concentrationHhi: number;
  maxAssetWeightPercent: number;
  maxAssetSymbol: string;
  volatilityAnnualizedPercent: number;
  maxDrawdownPercent: number;
  diversificationScore: number; // 0 - 100
  riskWarnings: PortfolioRiskWarning[];
  aiReview?: AIPortfolioReview | null;
  generatedAt: string;
}

export interface AIStrategyComparison {
  instrumentSymbol: string;
  bestPerformingStrategy: QuantitativeStrategyType;
  comparisonSummary: string;
  tradeOffs: string[];
  recommendation: string;
  isAIGenerated: true;
  disclaimer: string;
}







