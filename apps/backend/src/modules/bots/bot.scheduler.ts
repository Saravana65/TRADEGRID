import { logger } from '../../utils/logger';
import { IBotRepository, botRepository as defaultBotRepo } from './bot.repository';
import { BotEngine, botEngine as defaultBotEngine } from './bot.engine';
import { BotRecord, BotConfigurationRecord, BotInstrumentRecord } from './bot.types';

export class BotScheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly runningLocks: Set<number> = new Set();
  private readonly lastExecutionMap: Map<number, number> = new Map();
  private isShuttingDown: boolean = false;

  constructor(
    private readonly botRepo: IBotRepository = defaultBotRepo,
    private readonly engine: BotEngine = defaultBotEngine,
    private readonly tickIntervalMs: number = 500
  ) {}

  /**
   * Starts the central scheduler tick loop.
   */
  async start(): Promise<void> {
    if (this.timer) {
      return;
    }
    this.isShuttingDown = false;
    logger.info('[BOT SCHEDULER] Starting Autonomous Bot Scheduler tick loop...');

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error(`[BOT SCHEDULER] Error in scheduler tick: ${err.message}`);
      });
    }, this.tickIntervalMs);
  }

  /**
   * Stops the central scheduler tick loop and awaits in-flight executions.
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Await any in-flight executions to finish
    let attempts = 0;
    while (this.runningLocks.size > 0 && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      attempts++;
    }

    this.runningLocks.clear();
    this.lastExecutionMap.clear();
    logger.info('[BOT SCHEDULER] Autonomous Bot Scheduler stopped gracefully.');
  }

  /**
   * Periodic scheduler tick inspecting active bots and triggering quote refreshes
   * when refresh interval has elapsed and no overlapping execution is in flight.
   */
  async tick(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      const activeBots = await this.botRepo.findActiveBots();
      if (!activeBots || activeBots.length === 0) {
        return;
      }

      const now = Date.now();
      const executions: Promise<void>[] = [];

      for (const bot of activeBots) {
        // Skip if already in flight (Strict non-overlapping execution lock)
        if (this.runningLocks.has(bot.id)) {
          continue;
        }

        const config = await this.botRepo.findConfigurationByBotId(bot.id);
        if (!config) {
          continue;
        }

        const lastRun = this.lastExecutionMap.get(bot.id) || 0;
        const interval = config.quote_refresh_interval_ms || 5000;

        if (now - lastRun >= interval) {
          // Trigger execution for this bot
          executions.push(
            this.executeBot(bot, config).catch((err) => {
              logger.error(`[BOT SCHEDULER] Bot #${bot.id} execution failed: ${err.message}`);
            })
          );
        }
      }

      await Promise.all(executions);
    } catch (err: any) {
      logger.error(`[BOT SCHEDULER] Tick failure: ${err.message}`);
    }
  }

  /**
   * Executes a single scheduled cycle for a bot across all its assigned instruments.
   */
  async executeBot(bot: BotRecord, config: BotConfigurationRecord): Promise<void> {
    if (this.runningLocks.has(bot.id) || this.isShuttingDown) {
      return;
    }

    this.runningLocks.add(bot.id);
    const startTs = Date.now();

    try {
      const botInstruments = await this.botRepo.findInstrumentsByBotId(bot.id);
      const enabledInstruments = botInstruments.filter((bi) => Boolean(bi.is_enabled));

      for (const bi of enabledInstruments) {
        if (this.isShuttingDown) break;
        await this.engine.executeCycle(bot, config, bi.instrument_id);
      }

      this.lastExecutionMap.set(bot.id, Date.now());
    } finally {
      this.runningLocks.delete(bot.id);
    }
  }

  /**
   * Manually triggers an immediate cycle for a specific bot (useful for testing and instant admin refresh).
   */
  async triggerBot(botId: number): Promise<boolean> {
    const bot = await this.botRepo.findById(botId);
    if (!bot) return false;

    const config = await this.botRepo.findConfigurationByBotId(botId);
    if (!config) return false;

    await this.executeBot(bot, config);
    return true;
  }

  isBotRunning(botId: number): boolean {
    return this.runningLocks.has(botId);
  }
}

export const botScheduler = new BotScheduler();
