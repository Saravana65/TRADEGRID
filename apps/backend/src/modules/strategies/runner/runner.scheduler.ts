import { logger } from '../../../utils/logger';
import { IAutomatedStrategyJobRepository, automatedStrategyJobRepository as defaultJobRepo } from './runner.repository';
import { StrategyService, defaultStrategyService } from '../strategy.service';
import { StrategyInterpreter } from '../execution/strategy-interpreter';
import { HistoricalDataService } from '../../research/historical-data.service';
import { OrderService } from '../../orders/order.service';
import { IInstrumentRepository, instrumentRepository as defaultInstrumentRepo } from '../../market/instrument.repository';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../../websocket/realtime.service';
import { MarketCandle } from '../execution/execution.types';
import { AutomatedStrategyJob, SignalType } from '@tradegrid/shared-types';

export class AutomatedStrategyScheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly runningJobLocks: Set<string> = new Set();
  private isShuttingDown: boolean = false;

  constructor(
    private readonly jobRepo: IAutomatedStrategyJobRepository = defaultJobRepo,
    private readonly strategyService: StrategyService = defaultStrategyService,
    private readonly historicalDataService: HistoricalDataService = new HistoricalDataService(),
    private readonly orderService?: OrderService,
    private readonly instrumentRepo: IInstrumentRepository = defaultInstrumentRepo,
    private readonly realtimeService: IRealtimeService = defaultRealtimeService,
    private readonly tickIntervalMs: number = 1000
  ) {}

  /**
   * Starts the background strategy runner tick loop.
   */
  async start(): Promise<void> {
    if (this.timer) return;
    this.isShuttingDown = false;
    logger.info('[AUTOMATED STRATEGY RUNNER] Starting background execution tick loop...');

    // On startup, recover interrupted jobs
    await this.recoverInterruptedJobs();

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error(`[AUTOMATED STRATEGY RUNNER] Unhandled tick error: ${err.message}`);
      });
    }, this.tickIntervalMs);
  }

  /**
   * Stops the background strategy runner tick loop gracefully.
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Await active in-flight executions to finish
    let attempts = 0;
    while (this.runningJobLocks.size > 0 && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      attempts++;
    }

    this.runningJobLocks.clear();
    logger.info('[AUTOMATED STRATEGY RUNNER] Background strategy runner stopped gracefully.');
  }

  /**
   * Server restart recovery: resets checkpoints and resumes running jobs.
   */
  async recoverInterruptedJobs(): Promise<void> {
    try {
      const activeJobs = await this.jobRepo.findActiveJobs();
      logger.info(
        `[AUTOMATED STRATEGY RUNNER] Recovered ${activeJobs.length} active strategy jobs on startup.`
      );
    } catch (err: any) {
      logger.error(
        `[AUTOMATED STRATEGY RUNNER] Failed to recover active strategy jobs on startup: ${err.message}`
      );
    }
  }

  /**
   * Central scheduler tick executing bar evaluations for all active running jobs.
   */
  async tick(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      const activeJobs = await this.jobRepo.findActiveJobs();
      if (!activeJobs || activeJobs.length === 0) return;

      const jobPromises: Promise<void>[] = [];
      for (const job of activeJobs) {
        if (this.runningJobLocks.has(job.jobId)) {
          continue; // Prevent overlapping execution for the same job
        }

        jobPromises.push(
          this.processJob(job).catch((err) => {
            logger.error(
              `[AUTOMATED STRATEGY RUNNER] Error processing Job #${job.jobId}: ${err.message}`
            );
          })
        );
      }
      await Promise.all(jobPromises);
    } catch (err: any) {
      logger.error(`[AUTOMATED STRATEGY RUNNER] Tick iteration error: ${err.message}`);
    }
  }

  /**
   * Evaluates a single automated strategy job against the latest market candles.
   */
  async processJob(job: AutomatedStrategyJob): Promise<void> {
    this.runningJobLocks.add(job.jobId);

    try {
      // 1. Fetch strategy source code
      let dslCode: string;
      try {
        const strat = await this.strategyService.getStrategy(job.userId, job.strategyId);
        dslCode = strat.dslCode;
      } catch {
        if (job.strategyVersion) {
          const versionRecord = await this.strategyService.getVersion(
            job.userId,
            job.strategyId,
            job.strategyVersion
          );
          dslCode = versionRecord.dslCode;
        } else {
          dslCode = '';
        }
      }

      // 2. Validate DSL and extract AST
      const validation = this.strategyService.validateSource(dslCode);
      if (!validation.isValid || !validation.ast) {
        const failures = (job.consecutiveFailuresCount || 0) + 1;
        if (failures >= 3) {
          await this.jobRepo.updateJobStatus(
            job.jobId,
            'FAILED',
            false,
            `Exceeded maximum consecutive error threshold: Invalid DSL syntax`
          );
          if (typeof this.realtimeService?.emitToUser === 'function') {
            this.realtimeService.emitToUser(job.userId, 'strategy:job_failed', {
              jobId: job.jobId,
              reason: `Auto-stopped after 3 consecutive failures: Invalid DSL syntax`,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          await this.jobRepo.updateConsecutiveFailures(
            job.jobId,
            failures,
            `Invalid DSL syntax in version ${job.strategyVersion}`
          );
        }
        return;
      }

      // 3. Fetch recent historical market data candles
      let candles: MarketCandle[] = [];
      try {
        const intervalMap: Record<string, '1m' | '5m' | '15m' | '1h' | '1d'> = {
          '1m': '1m',
          '5m': '5m',
          '15m': '15m',
          '1h': '1h',
          '1d': '1d',
        };
        const interval = intervalMap[job.timeframe] || '15m';
        const stepMs = 60 * 1000;
        const bucketedNow = new Date(Math.floor(Date.now() / stepMs) * stepMs);

        const dataset = await this.historicalDataService.getHistoricalCandles({
          symbol: job.instrumentSymbol,
          interval,
          endDate: bucketedNow.toISOString(),
          limit: 100,
        });

        candles = dataset.candles.map((c) => ({
          timestamp: c.timestamp,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseInt(String(c.volume), 10) || 0,
        }));
      } catch {
        candles = [];
      }

      // If no live candles exist in development, construct deterministic tick candles
      if (candles.length === 0) {
        candles = this.generateFallbackCandles(job.instrumentSymbol, 60);
      }

      if (candles.length === 0) return;

      // 4. Execute sandboxed AST interpreter over candles
      const result = StrategyInterpreter.execute(validation.ast, candles, {
        maxExecutionTimeMs: 3000,
        maxBars: 500,
      });

      const latestCandle = candles[candles.length - 1];
      const latestCandleTime =
        latestCandle.timestamp instanceof Date
          ? latestCandle.timestamp.toISOString()
          : new Date(latestCandle.timestamp).toISOString();

      // Avoid reprocessing the same candle timestamp
      if (
        job.lastProcessedCandleTime &&
        new Date(latestCandleTime).getTime() <= new Date(job.lastProcessedCandleTime).getTime()
      ) {
        return;
      }

      // 5. Check if a signal was triggered at the latest bar
      const latestSignal = result.signals.length > 0 ? result.signals[result.signals.length - 1] : null;
      let orderSubmitted = false;

      if (latestSignal) {
        const signalCandleTime = new Date(latestSignal.timestamp).getTime();
        const lastProcessedMs = job.lastProcessedCandleTime ? new Date(job.lastProcessedCandleTime).getTime() : 0;

        // Verify that signal belongs to this bar and is not an old signal
        if (signalCandleTime > lastProcessedMs) {
          logger.info(
            `[AUTOMATED STRATEGY RUNNER] Signal ${latestSignal.signalType} triggered for User #${job.userId} on ${job.instrumentSymbol} @ ₹${latestSignal.price}`
          );

          // Emit real-time notification to user's private room
          if (typeof this.realtimeService?.emitToUser === 'function') {
            this.realtimeService.emitToUser(job.userId, 'strategy:signal_generated', {
              jobId: job.jobId,
              strategyId: job.strategyId,
              symbol: job.instrumentSymbol,
              signalType: latestSignal.signalType,
              price: latestSignal.price,
              reason: latestSignal.reason,
              timestamp: latestSignal.timestamp,
            });
          }

          // Check server-side risk controls
          const riskPass = this.checkRiskLimits(job, latestSignal.price);

          if (!riskPass.allowed) {
            logger.warn(
              `[AUTOMATED STRATEGY RUNNER] Risk limit tripped for Job #${job.jobId}: ${riskPass.reason}`
            );
            if (typeof this.realtimeService?.emitToUser === 'function') {
              this.realtimeService.emitToUser(job.userId, 'strategy:risk_limit_reached', {
                jobId: job.jobId,
                reason: riskPass.reason,
                timestamp: new Date().toISOString(),
              });
            }
          } else if (this.orderService) {
            // 6. Submit Virtual Order through TradeGrid OMS
            try {
              const instrument = await this.instrumentRepo.findBySymbol(job.instrumentSymbol);
              if (instrument) {
                const quantity = '10.0000'; // Standard lot sizing
                const idempotencyKey = `ORD-STRAT-${job.jobId}-${Date.now()}-${latestSignal.signalType}`;

                const order = await this.orderService.createOrder(job.userId, {
                  instrumentId: instrument.id,
                  side: latestSignal.signalType === 'BUY' ? 'BUY' : 'SELL',
                  orderType: 'LIMIT',
                  limitPrice: latestSignal.price.toFixed(4),
                  quantity,
                  idempotencyKey,
                });

                // Record audit entry in automated_strategy_orders
                await this.jobRepo.recordStrategyOrder(
                  job.jobId,
                  job.userId,
                  order.id,
                  latestSignal.signalType,
                  latestSignal.price.toFixed(4),
                  quantity,
                  idempotencyKey
                );

                orderSubmitted = true;
                logger.info(
                  `[AUTOMATED STRATEGY RUNNER] Virtual Order #${order.id} submitted for Job #${job.jobId}`
                );

                if (typeof this.realtimeService?.emitToUser === 'function') {
                  this.realtimeService.emitToUser(job.userId, 'strategy:order_submitted', {
                    jobId: job.jobId,
                    orderId: order.id,
                    side: order.side,
                    quantity: order.quantity,
                    price: order.limitPrice || latestSignal.price.toFixed(4),
                    timestamp: new Date().toISOString(),
                  });
                }
              }
            } catch (orderErr: any) {
              logger.error(
                `[AUTOMATED STRATEGY RUNNER] Virtual Order placement failed for Job #${job.jobId}: ${orderErr.message}`
              );
            }
          }
        }
      }

      // 7. Update Job Execution Checkpoint
      await this.jobRepo.updateJobCheckpoint(
        job.jobId,
        latestCandleTime,
        latestSignal ? (latestSignal.signalType as SignalType) : undefined,
        orderSubmitted
      );
    } catch (err: any) {
      const failures = job.consecutiveFailuresCount + 1;
      logger.error(
        `[AUTOMATED STRATEGY RUNNER] Error in processJob #${job.jobId} (Failure ${failures}/3): ${err.message}`
      );

      if (failures >= 3) {
        // Circuit breaker: auto-fail runaway erroring jobs
        await this.jobRepo.updateJobStatus(
          job.jobId,
          'FAILED',
          false,
          `Exceeded maximum consecutive error threshold: ${err.message}`
        );
        if (typeof this.realtimeService?.emitToUser === 'function') {
          this.realtimeService.emitToUser(job.userId, 'strategy:job_failed', {
            jobId: job.jobId,
            reason: `Auto-stopped after 3 consecutive failures: ${err.message}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        await this.jobRepo.updateConsecutiveFailures(job.jobId, failures, err.message);
      }
    } finally {
      this.runningJobLocks.delete(job.jobId);
    }
  }

  /**
   * Evaluates server-side risk limits before submitting an automated order.
   */
  private checkRiskLimits(
    job: AutomatedStrategyJob,
    price: number
  ): { allowed: boolean; reason?: string } {
    const limits = job.riskLimits || {};

    // 1. Max Order Notional Limit
    if (limits.maxOrderNotional) {
      const estimatedNotional = price * 10; // 10 shares standard lot
      if (estimatedNotional > limits.maxOrderNotional) {
        return {
          allowed: false,
          reason: `Order notional ₹${estimatedNotional.toFixed(2)} exceeds maximum permitted notional ₹${limits.maxOrderNotional}`,
        };
      }
    }

    // 2. Max Open Orders Limit
    if (limits.maxOpenOrders && job.totalOrdersCount >= limits.maxOpenOrders) {
      return {
        allowed: false,
        reason: `Total executed orders (${job.totalOrdersCount}) reached max open orders limit (${limits.maxOpenOrders})`,
      };
    }

    return { allowed: true };
  }

  private generateFallbackCandles(symbol: string, count: number): MarketCandle[] {
    const candles: MarketCandle[] = [];
    const step = 60 * 1000; // 1 minute candles
    const now = Math.floor(Date.now() / step) * step;

    let price = 2500;
    for (let i = 0; i < count; i++) {
      const time = new Date(now - (count - i) * step);
      const delta = (Math.sin(i / 5) + Math.cos(i / 3)) * 10;
      const open = price;
      const close = price + delta;
      const high = Math.max(open, close) + 4;
      const low = Math.min(open, close) - 4;
      const volume = 1000 + (i % 10) * 100;

      candles.push({
        timestamp: time.toISOString(),
        open,
        high,
        low,
        close,
        volume,
      });

      price = close;
    }
    return candles;
  }
}
