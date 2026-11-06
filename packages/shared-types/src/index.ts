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

// Future domain types (Phase 2+ previews for architectural alignment)
export type MarketStatus = 'PRE_OPEN' | 'OPEN' | 'HALTED' | 'CLOSED';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderTimeInForce = 'GTC' | 'IOC' | 'FOK';
export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';

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

export interface PortfolioSummary {
  userId: number;
  cashBalance: string;
  reservedCash: string;
  totalPortfolioValue: string;
  dailyPnL: string;
  dailyPnLPercent: string;
  unrealizedPnL: string;
  currency: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  isSimulated: boolean;
  impactScore?: number; // -1.0 to 1.0
  affectedSymbols?: string[];
}
