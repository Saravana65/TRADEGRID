import crypto from 'crypto';
import { Knex } from 'knex';
import { db } from '../../database/connection';
import { logger } from '../../utils/logger';
import { FinancialMath } from '../../utils/math';
import { AppError } from '../../middleware/error.middleware';
import { CreateBotInput, UpdateBotInput } from '@tradegrid/validation';
import {
  Bot,
  BotStatus,
  BotMetrics,
  BotMetricsSummary,
  BotExecutionLog,
} from '@tradegrid/shared-types';
import { IBotRepository, botRepository as defaultBotRepo } from './bot.repository';
import { IUserRepository, userRepository as defaultUserRepo } from '../users/user.repository';
import { WalletService } from '../wallet/wallet.service';
import { IWalletRepository, walletRepository as defaultWalletRepo } from '../wallet/wallet.repository';
import { IPositionRepository, positionRepository as defaultPositionRepo } from '../portfolio/position.repository';
import { IInstrumentRepository, instrumentRepository as defaultInstrumentRepo } from '../market/instrument.repository';
import { IMarketDataRepository, marketDataRepository as defaultMarketDataRepo } from '../market/market-data.repository';
import { IOrderRepository, orderRepository as defaultOrderRepo } from '../orders/order.repository';
import { OrderService, orderService as defaultOrderService } from '../orders/order.service';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../websocket/realtime.service';

export class BotService {
  constructor(
    private readonly botRepo: IBotRepository = defaultBotRepo,
    private readonly userRepo: IUserRepository = defaultUserRepo,
    private readonly walletService: WalletService,
    private readonly walletRepo: IWalletRepository = defaultWalletRepo,
    private readonly positionRepo: IPositionRepository = defaultPositionRepo,
    private readonly instrumentRepo: IInstrumentRepository = defaultInstrumentRepo,
    private readonly marketDataRepo: IMarketDataRepository = defaultMarketDataRepo,
    private readonly orderRepo: IOrderRepository = defaultOrderRepo,
    private readonly orderService: OrderService = defaultOrderService,
    private readonly realtimeService: IRealtimeService = defaultRealtimeService,
    private readonly knexInstance: Knex = db
  ) {}

  private async withTransaction<T>(
    trx: Knex.Transaction | undefined,
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    if (trx) {
      return callback(trx);
    }
    return this.knexInstance.transaction(async (newTrx) => {
      return callback(newTrx);
    });
  }

  /**
   * Registers a new autonomous bot with a dedicated system virtual account,
   * balanced virtual capital grant from SYSTEM_EQUITY_ISSUANCE, and initial share inventory.
   */
  async createBot(input: CreateBotInput): Promise<Bot> {
    // 1. Unique Name Check
    const existing = await this.botRepo.findByName(input.name);
    if (existing) {
      throw new AppError(409, 'BOT_NAME_EXISTS', `A bot with name '${input.name}' already exists`);
    }

    // 2. Validate Assigned Instruments
    for (const instId of input.instrumentIds) {
      const inst = await this.instrumentRepo.findById(instId);
      if (!inst) {
        throw new AppError(404, 'INSTRUMENT_NOT_FOUND', `Instrument #${instId} not found`);
      }
    }

    // 3. Create Dedicated System User Account for Bot
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const botUsername = `bot_${slug}_${randomSuffix}`;
    const botEmail = `${botUsername}@tradegrid.internal`;

    const botUser = await this.userRepo.create({
      username: botUsername,
      email: botEmail,
      password_hash: `LOCKED_SYSTEM_ACCOUNT_${crypto.randomBytes(16).toString('hex')}`,
      role: 'BOT' as any,
      status: 'ACTIVE',
    });

    // 4. Initialize Virtual Wallet via WalletService (balanced double-entry grant)
    await this.walletService.createWalletForUser(botUser.id, input.allocatedCapital);

    // 5. Seed Initial Share Inventory in Portfolio Positions (if requested)
    const initialShares = input.initialInventoryShares || '100.0000';
    if (FinancialMath.isPositive(initialShares)) {
      for (const instId of input.instrumentIds) {
        const quote = await this.marketDataRepo.getQuoteByInstrumentId(instId);
        const refPrice = quote?.lastPrice ? String(quote.lastPrice) : '100.0000';

        await this.positionRepo.upsertPosition({
          user_id: botUser.id,
          instrument_id: instId,
          quantity: FinancialMath.toFixed(initialShares),
          average_buy_price: FinancialMath.toFixed(refPrice),
          realized_pnl: '0.0000',
        });
      }
    }

    // 6. Create Bot Record
    const botRecord = await this.botRepo.createBot({
      user_id: botUser.id,
      name: input.name,
      strategy_type: input.strategyType,
      status: 'PAUSED',
      allocated_capital: FinancialMath.toFixed(input.allocatedCapital),
    });

    // 7. Create Bot Configuration
    const cfg = input.configuration || {};
    const configRecord = await this.botRepo.createConfiguration({
      bot_id: botRecord.id,
      quote_refresh_interval_ms: cfg.quoteRefreshIntervalMs || 5000,
      spread_bps: cfg.spreadBps ? String(cfg.spreadBps) : '50.00',
      order_quantity: cfg.orderQuantity || '10.0000',
      max_order_quantity: cfg.maxOrderQuantity || '50.0000',
      max_order_notional: cfg.maxOrderNotional || '10000.0000',
      max_inventory_per_instrument: cfg.maxInventoryPerInstrument || '200.0000',
      max_total_exposure: cfg.maxTotalExposure || '50000.0000',
      max_open_orders: cfg.maxOpenOrders || 10,
      max_daily_loss: cfg.maxDailyLoss || '5000.0000',
      skew_factor: cfg.skewFactor || '0.1000',
    });

    // 8. Associate Assigned Instruments
    await this.botRepo.createInstruments(botRecord.id, input.instrumentIds);

    // 9. Audit Log
    await this.botRepo.createLog({
      bot_id: botRecord.id,
      action: 'STATUS_CHANGE',
      details: `Bot '${input.name}' created with ${input.strategyType} strategy and $${input.allocatedCapital} capital`,
      status: 'SUCCESS',
    });

    logger.info(`[BOT SERVICE] Bot #${botRecord.id} (${input.name}) created successfully`);
    return this.getBotById(botRecord.id);
  }

  /**
   * Retrieves a single bot by ID with enriched live metrics.
   */
  async getBotById(id: number): Promise<Bot> {
    const botRecord = await this.botRepo.findById(id);
    if (!botRecord) {
      throw new AppError(404, 'BOT_NOT_FOUND', `Bot with ID #${id} not found`);
    }

    const config = await this.botRepo.findConfigurationByBotId(id);
    const instruments = await this.botRepo.findInstrumentsByBotId(id);

    // Enriched Wallet & Inventory Stats
    const wallet = await this.walletRepo.findByUserId(botRecord.user_id);
    const positions = await this.positionRepo.findByUserId(botRecord.user_id);
    const openOrders = await this.orderRepo.findOpenOrders({ userId: botRecord.user_id });

    let totalInventory = '0.0000';
    let realizedPnL = '0.0000';
    for (const p of positions) {
      totalInventory = FinancialMath.add(totalInventory, p.quantity);
      realizedPnL = FinancialMath.add(realizedPnL, p.realized_pnl || '0.0000');
    }

    return {
      id: botRecord.id,
      userId: botRecord.user_id,
      name: botRecord.name,
      strategyType: botRecord.strategy_type,
      status: botRecord.status,
      allocatedCapital: botRecord.allocated_capital,
      currentCashBalance: wallet?.available_balance || '0.0000',
      totalInventory,
      openOrdersCount: openOrders.length,
      realizedPnL,
      configuration: config ? {
        id: config.id,
        botId: config.bot_id,
        quoteRefreshIntervalMs: config.quote_refresh_interval_ms,
        spreadBps: parseFloat(config.spread_bps),
        orderQuantity: config.order_quantity,
        maxOrderQuantity: config.max_order_quantity,
        maxOrderNotional: config.max_order_notional,
        maxInventoryPerInstrument: config.max_inventory_per_instrument,
        maxTotalExposure: config.max_total_exposure,
        maxOpenOrders: config.max_open_orders,
        maxDailyLoss: config.max_daily_loss,
        skewFactor: config.skew_factor,
      } : undefined,
      instruments: instruments.map((bi) => ({
        id: bi.id,
        botId: bi.bot_id,
        instrumentId: bi.instrument_id,
        isEnabled: Boolean(bi.is_enabled),
      })),
      createdAt: botRecord.created_at.toISOString(),
      updatedAt: botRecord.updated_at.toISOString(),
    };
  }

  /**
   * Lists all bots with enriched live metrics.
   */
  async listBots(status?: BotStatus): Promise<Bot[]> {
    const records = await this.botRepo.findAll({ status });
    const result: Bot[] = [];
    for (const rec of records) {
      const enriched = await this.getBotById(rec.id);
      result.push(enriched);
    }
    return result;
  }

  /**
   * Updates an existing bot's name, strategy, instruments, or configuration limits.
   */
  async updateBot(id: number, input: UpdateBotInput): Promise<Bot> {
    const bot = await this.botRepo.findById(id);
    if (!bot) {
      throw new AppError(404, 'BOT_NOT_FOUND', `Bot with ID #${id} not found`);
    }

    if (input.name && input.name !== bot.name) {
      const existing = await this.botRepo.findByName(input.name);
      if (existing) {
        throw new AppError(409, 'BOT_NAME_EXISTS', `Bot with name '${input.name}' already exists`);
      }
    }

    if (input.configuration) {
      const cfg = input.configuration;
      await this.botRepo.updateConfiguration(id, {
        quote_refresh_interval_ms: cfg.quoteRefreshIntervalMs,
        spread_bps: cfg.spreadBps ? String(cfg.spreadBps) : undefined,
        order_quantity: cfg.orderQuantity,
        max_order_quantity: cfg.maxOrderQuantity,
        max_order_notional: cfg.maxOrderNotional,
        max_inventory_per_instrument: cfg.maxInventoryPerInstrument,
        max_total_exposure: cfg.maxTotalExposure,
        max_open_orders: cfg.maxOpenOrders,
        max_daily_loss: cfg.maxDailyLoss,
        skew_factor: cfg.skewFactor,
      });
    }

    if (input.instrumentIds) {
      await this.botRepo.updateInstruments(id, input.instrumentIds);
    }

    await this.botRepo.createLog({
      bot_id: id,
      action: 'STATUS_CHANGE',
      details: 'Bot configuration updated by administrator',
      status: 'SUCCESS',
    });

    return this.getBotById(id);
  }

  /**
   * Enables a bot (sets status to ACTIVE).
   */
  async enableBot(id: number): Promise<Bot> {
    const bot = await this.botRepo.findById(id);
    if (!bot) {
      throw new AppError(404, 'BOT_NOT_FOUND', `Bot with ID #${id} not found`);
    }

    if (bot.status === 'KILLED') {
      throw new AppError(422, 'BOT_KILLED', 'Killed bots cannot be re-enabled. Create a new bot instance.');
    }

    await this.botRepo.updateStatus(id, 'ACTIVE');

    await this.botRepo.createLog({
      bot_id: id,
      action: 'STATUS_CHANGE',
      details: 'Bot enabled by administrator',
      status: 'SUCCESS',
    });

    this.realtimeService.emitBotStatus?.({
      eventId: `bs-${Date.now()}`,
      botId: id,
      name: bot.name,
      strategyType: bot.strategy_type,
      status: 'ACTIVE',
      timestamp: new Date().toISOString(),
    });

    return this.getBotById(id);
  }

  /**
   * Disables a bot (sets status to PAUSED) and safely cancels all its active resting orders.
   */
  async disableBot(id: number): Promise<Bot> {
    const bot = await this.botRepo.findById(id);
    if (!bot) {
      throw new AppError(404, 'BOT_NOT_FOUND', `Bot with ID #${id} not found`);
    }

    await this.botRepo.updateStatus(id, 'PAUSED');

    // Cancel all open orders for this bot
    await this.cancelAllBotOrders(bot.user_id, id);

    await this.botRepo.createLog({
      bot_id: id,
      action: 'STATUS_CHANGE',
      details: 'Bot paused by administrator; open orders cancelled',
      status: 'SUCCESS',
    });

    this.realtimeService.emitBotStatus?.({
      eventId: `bs-${Date.now()}`,
      botId: id,
      name: bot.name,
      strategyType: bot.strategy_type,
      status: 'PAUSED',
      timestamp: new Date().toISOString(),
    });

    return this.getBotById(id);
  }

  /**
   * Emergency Kill Switch: Immediately kills the bot and revokes all active resting orders.
   */
  async killBot(id: number): Promise<Bot> {
    const bot = await this.botRepo.findById(id);
    if (!bot) {
      throw new AppError(404, 'BOT_NOT_FOUND', `Bot with ID #${id} not found`);
    }

    await this.botRepo.updateStatus(id, 'KILLED');

    // Cancel all open orders for this bot immediately
    await this.cancelAllBotOrders(bot.user_id, id);

    await this.botRepo.createLog({
      bot_id: id,
      action: 'KILL_SWITCH',
      details: 'EMERGENCY KILL SWITCH ACTIVATED by administrator. Bot permanently terminated.',
      status: 'WARNING',
    });

    this.realtimeService.emitBotStatus?.({
      eventId: `bs-${Date.now()}`,
      botId: id,
      name: bot.name,
      strategyType: bot.strategy_type,
      status: 'KILLED',
      reason: 'EMERGENCY_KILL_SWITCH',
      timestamp: new Date().toISOString(),
    });

    return this.getBotById(id);
  }

  /**
   * Emergency Global Kill Switch: Terminates all active bots.
   */
  async killAllBots(): Promise<{ killedCount: number }> {
    const bots = await this.botRepo.findAll();
    let count = 0;
    for (const b of bots) {
      if (b.status !== 'KILLED') {
        await this.killBot(b.id);
        count++;
      }
    }
    return { killedCount: count };
  }

  /**
   * Helper to cancel all resting open and partially filled orders for a bot.
   */
  private async cancelAllBotOrders(userId: number, botId: number): Promise<void> {
    try {
      const openOrders = await this.orderRepo.findOpenOrders({ userId });
      for (const ord of openOrders) {
        try {
          await this.orderService.cancelOrder(userId, ord.id);
        } catch (err: any) {
          logger.warn(`[BOT SERVICE] Could not cancel order #${ord.id} for Bot #${botId}: ${err.message}`);
        }
      }
    } catch (err: any) {
      logger.error(`[BOT SERVICE] Error cancelling orders for Bot #${botId}: ${err.message}`);
    }
  }

  /**
   * Retrieves execution audit logs for a bot with pagination.
   */
  async getBotLogs(
    id: number,
    options?: { limit?: number; offset?: number; status?: any; action?: string }
  ): Promise<{ logs: BotExecutionLog[]; total: number }> {
    const bot = await this.botRepo.findById(id);
    if (!bot) {
      throw new AppError(404, 'BOT_NOT_FOUND', `Bot with ID #${id} not found`);
    }

    const { logs, total } = await this.botRepo.findLogs(id, options);
    return {
      logs: logs.map((l) => ({
        id: l.id,
        botId: l.bot_id,
        instrumentId: l.instrument_id,
        action: l.action,
        details: l.details,
        status: l.status,
        createdAt: l.created_at.toISOString(),
      })),
      total,
    };
  }

  /**
   * Computes detailed metrics for a single bot.
   */
  async getBotMetrics(id: number): Promise<BotMetrics> {
    const bot = await this.botRepo.findById(id);
    if (!bot) {
      throw new AppError(404, 'BOT_NOT_FOUND', `Bot with ID #${id} not found`);
    }

    const wallet = await this.walletRepo.findByUserId(bot.user_id);
    const positions = await this.positionRepo.findByUserId(bot.user_id);
    const openOrders = await this.orderRepo.findOpenOrders({ userId: bot.user_id });

    const inventoryMap: Record<string, { quantity: string; averagePrice: string }> = {};
    let totalRealizedPnL = '0.0000';

    for (const p of positions) {
      const inst = await this.instrumentRepo.findById(p.instrument_id);
      const symbol = inst?.symbol || `ID_${p.instrument_id}`;
      inventoryMap[symbol] = {
        quantity: p.quantity,
        averagePrice: p.average_buy_price,
      };
      totalRealizedPnL = FinancialMath.add(totalRealizedPnL, p.realized_pnl || '0.0000');
    }

    const dailyLoss = FinancialMath.isNegative(totalRealizedPnL)
      ? FinancialMath.abs(totalRealizedPnL)
      : '0.0000';

    return {
      botId: bot.id,
      name: bot.name,
      strategyType: bot.strategy_type,
      status: bot.status,
      allocatedCapital: bot.allocated_capital,
      availableCash: wallet?.available_balance || '0.0000',
      inventoryByInstrument: inventoryMap,
      openOrdersCount: openOrders.length,
      totalTrades: 0,
      realizedPnL: totalRealizedPnL,
      dailyRealizedLoss: dailyLoss,
    };
  }

  /**
   * Computes system-wide aggregate metrics across all simulated bots.
   */
  async getSystemMetrics(): Promise<BotMetricsSummary> {
    const allBots = await this.botRepo.findAll();

    let activeCount = 0;
    let pausedCount = 0;
    let killedCount = 0;
    let totalAllocated = '0.0000';
    let totalActiveCapital = '0.0000';
    let totalOpenOrders = 0;
    let totalRealized = '0.0000';

    for (const b of allBots) {
      if (b.status === 'ACTIVE') {
        activeCount++;
        totalActiveCapital = FinancialMath.add(totalActiveCapital, b.allocated_capital);
      } else if (b.status === 'PAUSED') {
        pausedCount++;
      } else if (b.status === 'KILLED') {
        killedCount++;
      }

      totalAllocated = FinancialMath.add(totalAllocated, b.allocated_capital);

      const openOrds = await this.orderRepo.findOpenOrders({ userId: b.user_id });
      totalOpenOrders += openOrds.length;

      const positions = await this.positionRepo.findByUserId(b.user_id);
      for (const p of positions) {
        totalRealized = FinancialMath.add(totalRealized, p.realized_pnl || '0.0000');
      }
    }

    return {
      totalBots: allBots.length,
      activeBots: activeCount,
      pausedBots: pausedCount,
      killedBots: killedCount,
      totalAllocatedCapital: totalAllocated,
      totalActiveCapital: totalActiveCapital,
      totalOpenBotOrders: totalOpenOrders,
      totalBotTradesToday: 0,
      totalBotVolumeToday: '0.0000',
      totalRealizedPnL: totalRealized,
    };
  }
}
