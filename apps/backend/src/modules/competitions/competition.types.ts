import {
  CompetitionStatus,
  CompetitionVisibility,
  CompetitionParticipantStatus,
  Competition,
  CompetitionParticipant,
  CompetitionAccount,
  CompetitionPosition,
  CompetitionOrder,
  CompetitionTrade,
  CompetitionLeaderboardEntry,
} from '@tradegrid/shared-types';
import { Knex } from 'knex';

export interface CompetitionRecord {
  id: number;
  name: string;
  description: string | null;
  creator_id: number;
  visibility: CompetitionVisibility;
  join_code: string | null;
  starting_capital: string;
  max_participants: number;
  min_participants: number;
  start_time: Date | string;
  end_time: Date | string;
  allowed_instruments: string | null; // JSON string
  permitted_order_types: string; // JSON string
  status: CompetitionStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CompetitionParticipantRecord {
  id: number;
  competition_id: number;
  user_id: number;
  status: CompetitionParticipantStatus;
  starting_capital: string;
  current_portfolio_value: string;
  total_return_percent: string;
  rank: number | null;
  trade_count: number;
  joined_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CompetitionAccountRecord {
  id: number;
  competition_id: number;
  user_id: number;
  available_cash: string;
  reserved_cash: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CompetitionPositionRecord {
  id: number;
  competition_id: number;
  user_id: number;
  instrument_id: number;
  quantity: string;
  reserved_quantity: string;
  average_entry_price: string;
  realized_pnl: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CompetitionOrderRecord {
  id: number;
  competition_id: number;
  user_id: number;
  instrument_id: number;
  side: 'BUY' | 'SELL';
  order_type: 'LIMIT' | 'MARKET';
  quantity: string;
  filled_quantity: string;
  remaining_quantity: string;
  limit_price: string | null;
  status: 'PENDING' | 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  idempotency_key: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CompetitionTradeRecord {
  id: number;
  trade_reference: string;
  competition_id: number;
  buy_order_id: number;
  sell_order_id: number;
  buyer_id: number;
  seller_id: number;
  instrument_id: number;
  price: string;
  quantity: string;
  amount: string;
  executed_at: Date | string;
}

export interface CompetitionAuditLogRecord {
  id: number;
  competition_id: number;
  user_id: number | null;
  action: string;
  details: string | null;
  created_at: Date | string;
}

export interface ICompetitionRepository {
  createCompetition(data: Partial<CompetitionRecord>, trx?: Knex.Transaction): Promise<Competition>;
  findById(id: number, trx?: Knex.Transaction): Promise<Competition | null>;
  findCompetitions(filters: {
    status?: CompetitionStatus;
    visibility?: CompetitionVisibility;
    search?: string;
    userId?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ competitions: Competition[]; total: number }>;
  updateCompetition(id: number, data: Partial<CompetitionRecord>, trx?: Knex.Transaction): Promise<Competition>;
  
  // Participants
  addParticipant(data: {
    competitionId: number;
    userId: number;
    startingCapital: string;
  }, trx?: Knex.Transaction): Promise<CompetitionParticipant>;
  findParticipant(competitionId: number, userId: number, trx?: Knex.Transaction): Promise<CompetitionParticipant | null>;
  listParticipants(competitionId: number): Promise<CompetitionParticipant[]>;
  updateParticipant(competitionId: number, userId: number, data: Partial<CompetitionParticipantRecord>, trx?: Knex.Transaction): Promise<void>;
  countParticipants(competitionId: number, trx?: Knex.Transaction): Promise<number>;

  // Accounts
  createAccount(data: {
    competitionId: number;
    userId: number;
    startingCapital: string;
  }, trx?: Knex.Transaction): Promise<CompetitionAccount>;
  getAccount(competitionId: number, userId: number, trx?: Knex.Transaction): Promise<CompetitionAccount | null>;
  updateAccount(competitionId: number, userId: number, data: Partial<CompetitionAccountRecord>, trx?: Knex.Transaction): Promise<void>;

  // Positions
  getPosition(competitionId: number, userId: number, instrumentId: number, trx?: Knex.Transaction): Promise<CompetitionPosition | null>;
  listPositions(competitionId: number, userId: number, trx?: Knex.Transaction): Promise<CompetitionPosition[]>;
  upsertPosition(data: {
    competitionId: number;
    userId: number;
    instrumentId: number;
    quantity: string;
    reservedQuantity?: string;
    averageEntryPrice: string;
    realizedPnl: string;
  }, trx?: Knex.Transaction): Promise<CompetitionPosition>;

  // Orders
  createOrder(data: {
    competitionId: number;
    userId: number;
    instrumentId: number;
    side: 'BUY' | 'SELL';
    orderType: 'LIMIT' | 'MARKET';
    quantity: string;
    limitPrice: string | null;
    idempotencyKey?: string | null;
  }, trx?: Knex.Transaction): Promise<CompetitionOrder>;
  getOrderById(id: number, trx?: Knex.Transaction): Promise<CompetitionOrder | null>;
  findOrderByIdempotencyKey(competitionId: number, key: string, trx?: Knex.Transaction): Promise<CompetitionOrder | null>;
  listOrders(filters: {
    competitionId: number;
    userId?: number;
    status?: string;
    instrumentId?: number;
    limit?: number;
  }, trx?: Knex.Transaction): Promise<CompetitionOrder[]>;
  updateOrder(id: number, data: Partial<CompetitionOrderRecord>, trx?: Knex.Transaction): Promise<void>;

  // Trades
  createTrade(data: {
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
  }, trx?: Knex.Transaction): Promise<CompetitionTrade>;
  listTrades(competitionId: number, options?: { limit?: number; userId?: number }): Promise<CompetitionTrade[]>;

  // Snapshots & Logs
  saveLeaderboardSnapshot(competitionId: number, snapshotData: CompetitionLeaderboardEntry[], isFinal?: boolean, trx?: Knex.Transaction): Promise<void>;
  getLatestLeaderboardSnapshot(competitionId: number): Promise<CompetitionLeaderboardEntry[] | null>;
  createAuditLog(competitionId: number, action: string, details?: any, userId?: number | null, trx?: Knex.Transaction): Promise<void>;

  // Transaction support
  transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T>;
}
