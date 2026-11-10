import { Knex } from 'knex';
import {
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
import {
  ICompetitionRepository,
  CompetitionRecord,
  CompetitionParticipantRecord,
  CompetitionAccountRecord,
  CompetitionPositionRecord,
  CompetitionOrderRecord,
  CompetitionTradeRecord,
} from './competition.types';
import { db as defaultDb } from '../../database/connection';
import { FinancialMath } from '../../utils/math';

export class KnexCompetitionRepository implements ICompetitionRepository {
  constructor(private customDb?: Knex) {}

  private get db(): Knex {
    return this.customDb || defaultDb;
  }

  async transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }

  // ==========================================================================
  // Competitions Master
  // ==========================================================================

  async createCompetition(
    data: Partial<CompetitionRecord>,
    trx?: Knex.Transaction
  ): Promise<Competition> {
    const q = trx ? trx('competitions') : this.db('competitions');
    const [id] = await q.insert(data);
    const created = await this.findById(id, trx);
    return created!;
  }

  async findById(id: number, trx?: Knex.Transaction): Promise<Competition | null> {
    const q = trx ? trx('competitions') : this.db('competitions');
    const row = await q
      .leftJoin('users', 'competitions.creator_id', 'users.id')
      .select('competitions.*', 'users.username as creator_username')
      .where('competitions.id', id)
      .first();

    if (!row) return null;
    return this.mapCompetition(row);
  }

  async findCompetitions(filters: {
    status?: CompetitionStatus;
    visibility?: CompetitionVisibility;
    search?: string;
    userId?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ competitions: Competition[]; total: number }> {
    const q = this.db('competitions')
      .leftJoin('users', 'competitions.creator_id', 'users.id')
      .select('competitions.*', 'users.username as creator_username');

    if (filters.status) {
      q.where('competitions.status', filters.status);
    }
    if (filters.visibility) {
      q.where('competitions.visibility', filters.visibility);
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      q.where(function () {
        this.where('competitions.name', 'like', term).orWhere(
          'competitions.description',
          'like',
          term
        );
      });
    }
    if (filters.userId) {
      q.whereExists(function () {
        this.select('*')
          .from('competition_participants')
          .whereRaw('competition_participants.competition_id = competitions.id')
          .andWhere('competition_participants.user_id', filters.userId)
          .andWhere('competition_participants.status', 'JOINED');
      });
    }

    const countQuery = q.clone().clearSelect().count<{ count: number }[]>('* as count').first();
    const countRes = await countQuery;
    const total = Number(countRes?.count || 0);

    q.orderBy('competitions.start_time', 'desc');
    if (filters.limit) q.limit(filters.limit);
    if (filters.offset) q.offset(filters.offset);

    const rows = await q;

    // Fetch participant counts
    const compIds = rows.map((r: any) => r.id);
    const participantCounts: Record<number, number> = {};
    if (compIds.length > 0) {
      const pCounts = await this.db('competition_participants')
        .whereIn('competition_id', compIds)
        .andWhere('status', 'JOINED')
        .groupBy('competition_id')
        .select('competition_id', this.db.raw('count(*) as p_count'));
      for (const pc of pCounts) {
        participantCounts[pc.competition_id] = Number(pc.p_count);
      }
    }

    const competitions = rows.map((r: any) =>
      this.mapCompetition(r, participantCounts[r.id] || 0)
    );
    return { competitions, total };
  }

  async updateCompetition(
    id: number,
    data: Partial<CompetitionRecord>,
    trx?: Knex.Transaction
  ): Promise<Competition> {
    const q = trx ? trx('competitions') : this.db('competitions');
    await q.where('id', id).update({ ...data, updated_at: new Date() });
    const updated = await this.findById(id, trx);
    return updated!;
  }

  // ==========================================================================
  // Participants
  // ==========================================================================

  async addParticipant(
    data: { competitionId: number; userId: number; startingCapital: string },
    trx?: Knex.Transaction
  ): Promise<CompetitionParticipant> {
    const q = trx ? trx('competition_participants') : this.db('competition_participants');
    const [id] = await q.insert({
      competition_id: data.competitionId,
      user_id: data.userId,
      status: 'JOINED',
      starting_capital: data.startingCapital,
      current_portfolio_value: data.startingCapital,
      total_return_percent: '0.0000',
      trade_count: 0,
      joined_at: new Date(),
    });

    const user = await (trx ? trx('users') : this.db('users'))
      .where('id', data.userId)
      .select('username')
      .first();

    return {
      id,
      competitionId: data.competitionId,
      userId: data.userId,
      username: user?.username || `User #${data.userId}`,
      status: 'JOINED',
      startingCapital: data.startingCapital,
      currentPortfolioValue: data.startingCapital,
      totalReturnPercent: '0.0000',
      rank: null,
      tradeCount: 0,
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async findParticipant(
    competitionId: number,
    userId: number,
    trx?: Knex.Transaction
  ): Promise<CompetitionParticipant | null> {
    const q = trx ? trx('competition_participants') : this.db('competition_participants');
    const row = await q
      .leftJoin('users', 'competition_participants.user_id', 'users.id')
      .select('competition_participants.*', 'users.username')
      .where('competition_participants.competition_id', competitionId)
      .andWhere('competition_participants.user_id', userId)
      .first();

    if (!row) return null;
    return this.mapParticipant(row);
  }

  async listParticipants(competitionId: number): Promise<CompetitionParticipant[]> {
    const rows = await this.db('competition_participants')
      .leftJoin('users', 'competition_participants.user_id', 'users.id')
      .select('competition_participants.*', 'users.username')
      .where('competition_participants.competition_id', competitionId)
      .andWhere('competition_participants.status', 'JOINED')
      .orderBy('competition_participants.total_return_percent', 'desc')
      .orderBy('competition_participants.joined_at', 'asc');

    return rows.map((r: any, idx: number) => {
      const p = this.mapParticipant(r);
      p.rank = idx + 1;
      return p;
    });
  }

  async updateParticipant(
    competitionId: number,
    userId: number,
    data: Partial<CompetitionParticipantRecord>,
    trx?: Knex.Transaction
  ): Promise<void> {
    const q = trx ? trx('competition_participants') : this.db('competition_participants');
    await q
      .where('competition_id', competitionId)
      .andWhere('user_id', userId)
      .update({ ...data, updated_at: new Date() });
  }

  async countParticipants(competitionId: number, trx?: Knex.Transaction): Promise<number> {
    const q = trx ? trx('competition_participants') : this.db('competition_participants');
    const res = await q
      .where('competition_id', competitionId)
      .andWhere('status', 'JOINED')
      .count<{ count: number }[]>('* as count')
      .first();
    return Number(res?.count || 0);
  }

  // ==========================================================================
  // Accounts (Isolated Virtual Cash)
  // ==========================================================================

  async createAccount(
    data: { competitionId: number; userId: number; startingCapital: string },
    trx?: Knex.Transaction
  ): Promise<CompetitionAccount> {
    const q = trx ? trx('competition_accounts') : this.db('competition_accounts');
    const [id] = await q.insert({
      competition_id: data.competitionId,
      user_id: data.userId,
      available_cash: data.startingCapital,
      reserved_cash: '0.0000',
    });

    return {
      id,
      competitionId: data.competitionId,
      userId: data.userId,
      availableCash: data.startingCapital,
      reservedCash: '0.0000',
      totalCash: data.startingCapital,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async getAccount(
    competitionId: number,
    userId: number,
    trx?: Knex.Transaction
  ): Promise<CompetitionAccount | null> {
    const q = trx ? trx('competition_accounts') : this.db('competition_accounts');
    const row = await q
      .where('competition_id', competitionId)
      .andWhere('user_id', userId)
      .first();

    if (!row) return null;
    const totalCash = FinancialMath.add(row.available_cash, row.reserved_cash);
    return {
      id: row.id,
      competitionId: row.competition_id,
      userId: row.user_id,
      availableCash: String(row.available_cash),
      reservedCash: String(row.reserved_cash),
      totalCash,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async updateAccount(
    competitionId: number,
    userId: number,
    data: Partial<CompetitionAccountRecord>,
    trx?: Knex.Transaction
  ): Promise<void> {
    const q = trx ? trx('competition_accounts') : this.db('competition_accounts');
    await q
      .where('competition_id', competitionId)
      .andWhere('user_id', userId)
      .update({ ...data, updated_at: new Date() });
  }

  // ==========================================================================
  // Positions (Isolated Holdings)
  // ==========================================================================

  async getPosition(
    competitionId: number,
    userId: number,
    instrumentId: number,
    trx?: Knex.Transaction
  ): Promise<CompetitionPosition | null> {
    const q = trx ? trx('competition_positions') : this.db('competition_positions');
    const row = await q
      .leftJoin('instruments', 'competition_positions.instrument_id', 'instruments.id')
      .select('competition_positions.*', 'instruments.symbol')
      .where('competition_positions.competition_id', competitionId)
      .andWhere('competition_positions.user_id', userId)
      .andWhere('competition_positions.instrument_id', instrumentId)
      .first();

    if (!row) return null;
    return this.mapPosition(row);
  }

  async listPositions(
    competitionId: number,
    userId: number,
    trx?: Knex.Transaction
  ): Promise<CompetitionPosition[]> {
    const q = trx ? trx('competition_positions') : this.db('competition_positions');
    const rows = await q
      .leftJoin('instruments', 'competition_positions.instrument_id', 'instruments.id')
      .select('competition_positions.*', 'instruments.symbol')
      .where('competition_positions.competition_id', competitionId)
      .andWhere('competition_positions.user_id', userId)
      .andWhere(function () {
        this.where('competition_positions.quantity', '>', 0).orWhere(
          'competition_positions.reserved_quantity',
          '>',
          0
        );
      });

    return rows.map((r: any) => this.mapPosition(r));
  }

  async upsertPosition(
    data: {
      competitionId: number;
      userId: number;
      instrumentId: number;
      quantity: string;
      reservedQuantity?: string;
      averageEntryPrice: string;
      realizedPnl: string;
    },
    trx?: Knex.Transaction
  ): Promise<CompetitionPosition> {
    const q = trx ? trx('competition_positions') : this.db('competition_positions');
    const existing = await q
      .where('competition_id', data.competitionId)
      .andWhere('user_id', data.userId)
      .andWhere('instrument_id', data.instrumentId)
      .first();

    if (existing) {
      await (trx ? trx('competition_positions') : this.db('competition_positions'))
        .where('id', existing.id)
        .update({
          quantity: data.quantity,
          reserved_quantity: data.reservedQuantity ?? existing.reserved_quantity,
          average_entry_price: data.averageEntryPrice,
          realized_pnl: data.realizedPnl,
          updated_at: new Date(),
        });
      return (await this.getPosition(data.competitionId, data.userId, data.instrumentId, trx))!;
    } else {
      await (trx ? trx('competition_positions') : this.db('competition_positions')).insert({
        competition_id: data.competitionId,
        user_id: data.userId,
        instrument_id: data.instrumentId,
        quantity: data.quantity,
        reserved_quantity: data.reservedQuantity || '0.0000',
        average_entry_price: data.averageEntryPrice,
        realized_pnl: data.realizedPnl,
      });
      return (await this.getPosition(data.competitionId, data.userId, data.instrumentId, trx))!;
    }
  }

  // ==========================================================================
  // Orders
  // ==========================================================================

  async createOrder(
    data: {
      competitionId: number;
      userId: number;
      instrumentId: number;
      side: 'BUY' | 'SELL';
      orderType: 'LIMIT' | 'MARKET';
      quantity: string;
      limitPrice: string | null;
      idempotencyKey?: string | null;
    },
    trx?: Knex.Transaction
  ): Promise<CompetitionOrder> {
    const q = trx ? trx('competition_orders') : this.db('competition_orders');
    const [id] = await q.insert({
      competition_id: data.competitionId,
      user_id: data.userId,
      instrument_id: data.instrumentId,
      side: data.side,
      order_type: data.orderType,
      quantity: data.quantity,
      filled_quantity: '0.0000',
      remaining_quantity: data.quantity,
      limit_price: data.limitPrice,
      status: 'OPEN',
      idempotency_key: data.idempotencyKey || null,
    });

    const created = await this.getOrderById(id, trx);
    return created!;
  }

  async getOrderById(id: number, trx?: Knex.Transaction): Promise<CompetitionOrder | null> {
    const q = trx ? trx('competition_orders') : this.db('competition_orders');
    const row = await q
      .leftJoin('instruments', 'competition_orders.instrument_id', 'instruments.id')
      .select('competition_orders.*', 'instruments.symbol')
      .where('competition_orders.id', id)
      .first();

    if (!row) return null;
    return this.mapOrder(row);
  }

  async findOrderByIdempotencyKey(
    competitionId: number,
    key: string,
    trx?: Knex.Transaction
  ): Promise<CompetitionOrder | null> {
    const q = trx ? trx('competition_orders') : this.db('competition_orders');
    const row = await q
      .leftJoin('instruments', 'competition_orders.instrument_id', 'instruments.id')
      .select('competition_orders.*', 'instruments.symbol')
      .where('competition_orders.competition_id', competitionId)
      .andWhere('competition_orders.idempotency_key', key)
      .first();

    if (!row) return null;
    return this.mapOrder(row);
  }

  async listOrders(
    filters: {
      competitionId: number;
      userId?: number;
      status?: string;
      instrumentId?: number;
      limit?: number;
    },
    trx?: Knex.Transaction
  ): Promise<CompetitionOrder[]> {
    const q = trx ? trx('competition_orders') : this.db('competition_orders');
    q.leftJoin('instruments', 'competition_orders.instrument_id', 'instruments.id')
      .select('competition_orders.*', 'instruments.symbol')
      .where('competition_orders.competition_id', filters.competitionId);

    if (filters.userId) q.andWhere('competition_orders.user_id', filters.userId);
    if (filters.status) q.andWhere('competition_orders.status', filters.status);
    if (filters.instrumentId) q.andWhere('competition_orders.instrument_id', filters.instrumentId);

    q.orderBy('competition_orders.created_at', 'desc');
    if (filters.limit) q.limit(filters.limit);

    const rows = await q;
    return rows.map((r: any) => this.mapOrder(r));
  }

  async updateOrder(
    id: number,
    data: Partial<CompetitionOrderRecord>,
    trx?: Knex.Transaction
  ): Promise<void> {
    const q = trx ? trx('competition_orders') : this.db('competition_orders');
    await q.where('id', id).update({ ...data, updated_at: new Date() });
  }

  // ==========================================================================
  // Trades
  // ==========================================================================

  async createTrade(
    data: {
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
    },
    trx?: Knex.Transaction
  ): Promise<CompetitionTrade> {
    const q = trx ? trx('competition_trades') : this.db('competition_trades');
    const [id] = await q.insert({
      trade_reference: data.tradeReference,
      competition_id: data.competitionId,
      buy_order_id: data.buyOrderId,
      sell_order_id: data.sellOrderId,
      buyer_id: data.buyerId,
      seller_id: data.sellerId,
      instrument_id: data.instrumentId,
      price: data.price,
      quantity: data.quantity,
      amount: data.amount,
      executed_at: new Date(),
    });

    const inst = await this.db('instruments').where('id', data.instrumentId).select('symbol').first();
    const buyer = await this.db('users').where('id', data.buyerId).select('username').first();
    const seller = await this.db('users').where('id', data.sellerId).select('username').first();

    return {
      id,
      tradeReference: data.tradeReference,
      competitionId: data.competitionId,
      buyOrderId: data.buyOrderId,
      sellOrderId: data.sellOrderId,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
      buyerUsername: buyer?.username,
      sellerUsername: seller?.username,
      instrumentId: data.instrumentId,
      symbol: inst?.symbol,
      price: data.price,
      quantity: data.quantity,
      amount: data.amount,
      executedAt: new Date().toISOString(),
    };
  }

  async listTrades(
    competitionId: number,
    options?: { limit?: number; userId?: number }
  ): Promise<CompetitionTrade[]> {
    const q = this.db('competition_trades')
      .leftJoin('instruments', 'competition_trades.instrument_id', 'instruments.id')
      .leftJoin('users as buyer', 'competition_trades.buyer_id', 'buyer.id')
      .leftJoin('users as seller', 'competition_trades.seller_id', 'seller.id')
      .select(
        'competition_trades.*',
        'instruments.symbol',
        'buyer.username as buyer_username',
        'seller.username as seller_username'
      )
      .where('competition_trades.competition_id', competitionId);

    if (options?.userId) {
      q.andWhere(function () {
        this.where('competition_trades.buyer_id', options.userId).orWhere(
          'competition_trades.seller_id',
          options.userId
        );
      });
    }

    q.orderBy('competition_trades.executed_at', 'desc');
    if (options?.limit) q.limit(options.limit);

    const rows = await q;
    return rows.map((r: any) => ({
      id: r.id,
      tradeReference: r.trade_reference,
      competitionId: r.competition_id,
      buyOrderId: r.buy_order_id,
      sellOrderId: r.sell_order_id,
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      buyerUsername: r.buyer_username,
      sellerUsername: r.seller_username,
      instrumentId: r.instrument_id,
      symbol: r.symbol,
      price: String(r.price),
      quantity: String(r.quantity),
      amount: String(r.amount),
      executedAt: new Date(r.executed_at).toISOString(),
    }));
  }

  // ==========================================================================
  // Snapshots & Logs
  // ==========================================================================

  async saveLeaderboardSnapshot(
    competitionId: number,
    snapshotData: CompetitionLeaderboardEntry[],
    isFinal = false,
    trx?: Knex.Transaction
  ): Promise<void> {
    const q = trx
      ? trx('competition_leaderboard_snapshots')
      : this.db('competition_leaderboard_snapshots');
    await q.insert({
      competition_id: competitionId,
      is_final: isFinal,
      snapshot_data: JSON.stringify(snapshotData),
      created_at: new Date(),
    });
  }

  async getLatestLeaderboardSnapshot(
    competitionId: number
  ): Promise<CompetitionLeaderboardEntry[] | null> {
    const row = await this.db('competition_leaderboard_snapshots')
      .where('competition_id', competitionId)
      .orderBy('created_at', 'desc')
      .first();

    if (!row) return null;
    return typeof row.snapshot_data === 'string'
      ? JSON.parse(row.snapshot_data)
      : row.snapshot_data;
  }

  async createAuditLog(
    competitionId: number,
    action: string,
    details?: any,
    userId?: number | null,
    trx?: Knex.Transaction
  ): Promise<void> {
    const q = trx ? trx('competition_audit_logs') : this.db('competition_audit_logs');
    await q.insert({
      competition_id: competitionId,
      user_id: userId || null,
      action,
      details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
      created_at: new Date(),
    });
  }

  // ==========================================================================
  // Mappers
  // ==========================================================================

  private mapCompetition(row: any, participantCount = 0): Competition {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      creatorId: row.creator_id,
      creatorUsername: row.creator_username || undefined,
      visibility: row.visibility,
      joinCode: row.join_code || null,
      startingCapital: String(row.starting_capital),
      maxParticipants: row.max_participants,
      minParticipants: row.min_participants,
      participantCount,
      registrationStartTime: row.registration_start_time ? new Date(row.registration_start_time).toISOString() : null,
      registrationEndTime: row.registration_end_time ? new Date(row.registration_end_time).toISOString() : null,
      rules: row.rules || null,
      bannerUrl: row.banner_url || null,
      startTime: new Date(row.start_time).toISOString(),
      endTime: new Date(row.end_time).toISOString(),
      allowedInstruments: row.allowed_instruments
        ? typeof row.allowed_instruments === 'string'
          ? JSON.parse(row.allowed_instruments)
          : row.allowed_instruments
        : null,
      permittedOrderTypes: row.permitted_order_types
        ? typeof row.permitted_order_types === 'string'
          ? JSON.parse(row.permitted_order_types)
          : row.permitted_order_types
        : ['LIMIT', 'MARKET'],
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapParticipant(row: any): CompetitionParticipant {
    return {
      id: row.id,
      competitionId: row.competition_id,
      userId: row.user_id,
      username: row.username || `User #${row.user_id}`,
      status: row.status,
      startingCapital: String(row.starting_capital),
      currentPortfolioValue: String(row.current_portfolio_value),
      totalReturnPercent: String(row.total_return_percent),
      rank: row.rank || null,
      tradeCount: Number(row.trade_count || 0),
      joinedAt: new Date(row.joined_at || row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapPosition(row: any): CompetitionPosition {
    const qty = String(row.quantity || '0.0000');
    const entryPrice = String(row.average_entry_price || '0.0000');
    return {
      id: row.id,
      competitionId: row.competition_id,
      userId: row.user_id,
      instrumentId: row.instrument_id,
      symbol: row.symbol || `INST-${row.instrument_id}`,
      quantity: qty,
      reservedQuantity: String(row.reserved_quantity || '0.0000'),
      averageEntryPrice: entryPrice,
      currentPrice: entryPrice,
      marketValue: FinancialMath.calcTradeAmount(entryPrice, qty),
      unrealizedPnL: '0.0000',
      realizedPnL: String(row.realized_pnl || '0.0000'),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapOrder(row: any): CompetitionOrder {
    return {
      id: row.id,
      competitionId: row.competition_id,
      userId: row.user_id,
      instrumentId: row.instrument_id,
      symbol: row.symbol || `INST-${row.instrument_id}`,
      side: row.side,
      orderType: row.order_type,
      quantity: String(row.quantity),
      filledQuantity: String(row.filled_quantity || '0.0000'),
      remainingQuantity: String(row.remaining_quantity || row.quantity),
      limitPrice: row.limit_price ? String(row.limit_price) : null,
      status: row.status,
      idempotencyKey: row.idempotency_key || null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
