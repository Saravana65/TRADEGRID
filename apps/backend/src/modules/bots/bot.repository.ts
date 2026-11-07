import { Knex } from 'knex';
import { db } from '../../database/connection';
import {
  BotStrategyType,
  BotStatus,
  BotLogAction,
  BotLogStatus,
  BotRecord,
  BotConfigurationRecord,
  BotInstrumentRecord,
  BotExecutionLogRecord,
} from './bot.types';

export interface CreateBotData {
  user_id: number;
  name: string;
  strategy_type: BotStrategyType;
  status?: BotStatus;
  allocated_capital: string;
}

export interface CreateConfigData {
  bot_id: number;
  quote_refresh_interval_ms?: number;
  spread_bps?: string;
  order_quantity?: string;
  max_order_quantity?: string;
  max_order_notional?: string;
  max_inventory_per_instrument?: string;
  max_total_exposure?: string;
  max_open_orders?: number;
  max_daily_loss?: string;
  skew_factor?: string;
}

export interface CreateLogData {
  bot_id: number;
  instrument_id?: number | null;
  action: BotLogAction;
  details: string;
  status?: BotLogStatus;
}

export interface IBotRepository {
  createBot(data: CreateBotData, trx?: Knex.Transaction): Promise<BotRecord>;
  createConfiguration(data: CreateConfigData, trx?: Knex.Transaction): Promise<BotConfigurationRecord>;
  createInstruments(botId: number, instrumentIds: number[], trx?: Knex.Transaction): Promise<BotInstrumentRecord[]>;
  findById(id: number, trx?: Knex.Transaction): Promise<BotRecord | null>;
  findByUserId(userId: number, trx?: Knex.Transaction): Promise<BotRecord | null>;
  findByName(name: string, trx?: Knex.Transaction): Promise<BotRecord | null>;
  findAll(options?: { status?: BotStatus }, trx?: Knex.Transaction): Promise<BotRecord[]>;
  findActiveBots(trx?: Knex.Transaction): Promise<BotRecord[]>;
  findConfigurationByBotId(botId: number, trx?: Knex.Transaction): Promise<BotConfigurationRecord | null>;
  findInstrumentsByBotId(botId: number, trx?: Knex.Transaction): Promise<BotInstrumentRecord[]>;
  updateStatus(id: number, status: BotStatus, trx?: Knex.Transaction): Promise<void>;
  updateConfiguration(botId: number, data: Partial<CreateConfigData>, trx?: Knex.Transaction): Promise<void>;
  updateInstruments(botId: number, instrumentIds: number[], trx?: Knex.Transaction): Promise<void>;
  createLog(data: CreateLogData, trx?: Knex.Transaction): Promise<BotExecutionLogRecord>;
  findLogs(
    botId: number,
    options?: { limit?: number; offset?: number; status?: BotLogStatus; action?: string },
    trx?: Knex.Transaction
  ): Promise<{ logs: BotExecutionLogRecord[]; total: number }>;
  isBotUser(userId: number, trx?: Knex.Transaction): Promise<boolean>;
}

export class KnexBotRepository implements IBotRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  private getKnex(trx?: Knex.Transaction): Knex {
    return trx || this.knexInstance;
  }

  async createBot(data: CreateBotData, trx?: Knex.Transaction): Promise<BotRecord> {
    const k = this.getKnex(trx);
    const [insertedId] = await k('bots').insert({
      user_id: data.user_id,
      name: data.name,
      strategy_type: data.strategy_type,
      status: data.status || 'PAUSED',
      allocated_capital: data.allocated_capital as any,
    });

    const record = await this.findById(insertedId, trx);
    if (!record) {
      throw new Error(`Failed to retrieve newly created bot #${insertedId}`);
    }
    return record;
  }

  async createConfiguration(data: CreateConfigData, trx?: Knex.Transaction): Promise<BotConfigurationRecord> {
    const k = this.getKnex(trx);
    const [insertedId] = await k('bot_configurations').insert({
      bot_id: data.bot_id,
      quote_refresh_interval_ms: data.quote_refresh_interval_ms || 5000,
      spread_bps: (data.spread_bps || '50.00') as any,
      order_quantity: (data.order_quantity || '10.0000') as any,
      max_order_quantity: (data.max_order_quantity || '50.0000') as any,
      max_order_notional: (data.max_order_notional || '10000.0000') as any,
      max_inventory_per_instrument: (data.max_inventory_per_instrument || '200.0000') as any,
      max_total_exposure: (data.max_total_exposure || '50000.0000') as any,
      max_open_orders: data.max_open_orders || 10,
      max_daily_loss: (data.max_daily_loss || '5000.0000') as any,
      skew_factor: (data.skew_factor || '0.1000') as any,
    });

    const record = await k('bot_configurations').where({ id: insertedId }).first();
    return record;
  }

  async createInstruments(
    botId: number,
    instrumentIds: number[],
    trx?: Knex.Transaction
  ): Promise<BotInstrumentRecord[]> {
    const k = this.getKnex(trx);
    const rows = instrumentIds.map((instrument_id) => ({
      bot_id: botId,
      instrument_id,
      is_enabled: true,
    }));
    await k('bot_instruments').insert(rows);
    return this.findInstrumentsByBotId(botId, trx);
  }

  async findById(id: number, trx?: Knex.Transaction): Promise<BotRecord | null> {
    const k = this.getKnex(trx);
    const row = await k<BotRecord>('bots').where({ id }).first();
    return row || null;
  }

  async findByUserId(userId: number, trx?: Knex.Transaction): Promise<BotRecord | null> {
    const k = this.getKnex(trx);
    const row = await k<BotRecord>('bots').where({ user_id: userId }).first();
    return row || null;
  }

  async findByName(name: string, trx?: Knex.Transaction): Promise<BotRecord | null> {
    const k = this.getKnex(trx);
    const row = await k<BotRecord>('bots').where({ name }).first();
    return row || null;
  }

  async findAll(options?: { status?: BotStatus }, trx?: Knex.Transaction): Promise<BotRecord[]> {
    const k = this.getKnex(trx);
    let query = k<BotRecord>('bots').select('*');
    if (options?.status) {
      query = query.where({ status: options.status });
    }
    return query.orderBy('id', 'asc');
  }

  async findActiveBots(trx?: Knex.Transaction): Promise<BotRecord[]> {
    return this.findAll({ status: 'ACTIVE' }, trx);
  }

  async findConfigurationByBotId(
    botId: number,
    trx?: Knex.Transaction
  ): Promise<BotConfigurationRecord | null> {
    const k = this.getKnex(trx);
    const row = await k<BotConfigurationRecord>('bot_configurations').where({ bot_id: botId }).first();
    return row || null;
  }

  async findInstrumentsByBotId(botId: number, trx?: Knex.Transaction): Promise<BotInstrumentRecord[]> {
    const k = this.getKnex(trx);
    return k<BotInstrumentRecord>('bot_instruments').where({ bot_id: botId }).orderBy('instrument_id', 'asc');
  }

  async updateStatus(id: number, status: BotStatus, trx?: Knex.Transaction): Promise<void> {
    const k = this.getKnex(trx);
    await k('bots')
      .where({ id })
      .update({ status, updated_at: k.fn.now() });
  }

  async updateConfiguration(
    botId: number,
    data: Partial<CreateConfigData>,
    trx?: Knex.Transaction
  ): Promise<void> {
    const k = this.getKnex(trx);
    const updateObj: Record<string, any> = { updated_at: k.fn.now() };

    if (data.quote_refresh_interval_ms !== undefined) updateObj.quote_refresh_interval_ms = data.quote_refresh_interval_ms;
    if (data.spread_bps !== undefined) updateObj.spread_bps = data.spread_bps;
    if (data.order_quantity !== undefined) updateObj.order_quantity = data.order_quantity;
    if (data.max_order_quantity !== undefined) updateObj.max_order_quantity = data.max_order_quantity;
    if (data.max_order_notional !== undefined) updateObj.max_order_notional = data.max_order_notional;
    if (data.max_inventory_per_instrument !== undefined) updateObj.max_inventory_per_instrument = data.max_inventory_per_instrument;
    if (data.max_total_exposure !== undefined) updateObj.max_total_exposure = data.max_total_exposure;
    if (data.max_open_orders !== undefined) updateObj.max_open_orders = data.max_open_orders;
    if (data.max_daily_loss !== undefined) updateObj.max_daily_loss = data.max_daily_loss;
    if (data.skew_factor !== undefined) updateObj.skew_factor = data.skew_factor;

    await k('bot_configurations').where({ bot_id: botId }).update(updateObj);
  }

  async updateInstruments(botId: number, instrumentIds: number[], trx?: Knex.Transaction): Promise<void> {
    const k = this.getKnex(trx);
    await k('bot_instruments').where({ bot_id: botId }).del();
    if (instrumentIds.length > 0) {
      await this.createInstruments(botId, instrumentIds, trx);
    }
  }

  async createLog(data: CreateLogData, trx?: Knex.Transaction): Promise<BotExecutionLogRecord> {
    const k = this.getKnex(trx);
    const [insertedId] = await k('bot_execution_logs').insert({
      bot_id: data.bot_id,
      instrument_id: data.instrument_id || null,
      action: data.action,
      details: data.details,
      status: data.status || 'SUCCESS',
    });

    const record = await k<BotExecutionLogRecord>('bot_execution_logs').where({ id: insertedId }).first();
    return record!;
  }

  async findLogs(
    botId: number,
    options?: { limit?: number; offset?: number; status?: BotLogStatus; action?: string },
    trx?: Knex.Transaction
  ): Promise<{ logs: BotExecutionLogRecord[]; total: number }> {
    const k = this.getKnex(trx);
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    let baseQuery = k<BotExecutionLogRecord>('bot_execution_logs').where({ bot_id: botId });
    if (options?.status) {
      baseQuery = baseQuery.where({ status: options.status });
    }
    if (options?.action) {
      baseQuery = baseQuery.where('action', options.action);
    }

    const countRes = await baseQuery.clone().count<{ count: number | string }>('* as count').first();
    const total = countRes ? parseInt(String(countRes.count), 10) : 0;

    const logs = await baseQuery.clone().orderBy('created_at', 'desc').limit(limit).offset(offset);
    return { logs, total };
  }

  async isBotUser(userId: number, trx?: Knex.Transaction): Promise<boolean> {
    const k = this.getKnex(trx);
    const bot = await k('bots').where({ user_id: userId }).first();
    return !!bot;
  }
}

export const botRepository = new KnexBotRepository();
