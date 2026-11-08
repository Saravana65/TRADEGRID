import { logger } from '../../utils/logger';
import { INewsRepository, newsRepository as defaultNewsRepo } from './news.repository';
import { NewsService, newsService as defaultNewsService } from './news.service';
import { CatalystEngine, catalystEngine as defaultCatalystEngine } from './catalyst.engine';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../websocket/realtime.service';

export class NewsScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isTicking: boolean = false;
  private tickIntervalMs: number = 1000;

  constructor(
    private readonly newsRepo: INewsRepository = defaultNewsRepo,
    private readonly newsService: NewsService = defaultNewsService,
    private readonly catalystEngine: CatalystEngine = defaultCatalystEngine,
    private readonly realtimeService: IRealtimeService = defaultRealtimeService
  ) {}

  /**
   * Starts the centralized news catalyst background loop.
   */
  start(intervalMs: number = 1000): void {
    if (this.timer) {
      logger.warn('[NEWS SCHEDULER] Scheduler is already running.');
      return;
    }
    this.tickIntervalMs = intervalMs;
    logger.info(`[NEWS SCHEDULER] Starting Simulated News Catalyst Scheduler (tick: ${this.tickIntervalMs}ms)...`);
    this.timer = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  /**
   * Stops the news scheduler gracefully.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[NEWS SCHEDULER] News Catalyst Scheduler stopped.');
    }
  }

  /**
   * Executes a single non-overlapping scheduler tick.
   */
  async tick(now: Date = new Date()): Promise<void> {
    if (this.isTicking) {
      return; // Skip overlapping tick
    }
    this.isTicking = true;

    try {
      // 1. Check for scheduled articles that have arrived at their scheduled time
      const dueArticles = await this.newsRepo.findDueScheduledArticles(now);
      for (const article of dueArticles) {
        try {
          logger.info(`[NEWS SCHEDULER] Auto-publishing scheduled news #${article.id}: "${article.headline}"`);
          await this.newsService.publishNews(article.id);
        } catch (err: any) {
          logger.error(`[NEWS SCHEDULER] Failed to auto-publish scheduled news #${article.id}: ${err.message}`);
        }
      }

      // 2. Check active catalysts for decay and expiration
      const activeList = await this.newsRepo.findActiveCatalysts(now);
      for (const { article, catalyst } of activeList) {
        const expiryTime = catalyst.expired_at ? new Date(catalyst.expired_at).getTime() : 0;
        const decayStartTime = catalyst.decay_starts_at ? new Date(catalyst.decay_starts_at).getTime() : 0;
        const currentTime = now.getTime();

        // Check if catalyst has expired
        if (currentTime >= expiryTime) {
          logger.info(`[NEWS SCHEDULER] Catalyst #${catalyst.id} for news #${article.id} has EXPIRED.`);
          await this.newsRepo.updateCatalyst(catalyst.id, {
            status: 'EXPIRED',
            expired_at: now,
          });
          await this.newsRepo.updateArticle(article.id, {
            status: 'EXPIRED',
            expires_at: now,
          });
          await this.newsRepo.createExecution({
            catalyst_id: catalyst.id,
            news_id: article.id,
            action: 'EXPIRED',
            effective_impact: '0.0000',
            affected_instruments: article.target_symbol
              ? JSON.stringify([article.target_symbol])
              : null,
            details: JSON.stringify({ reason: 'Duration elapsed' }),
          });

          // WebSocket events
          this.realtimeService.emitNewsExpired(article.id, catalyst.id);
          this.realtimeService.emitCatalystCompleted(catalyst.id, article.id);
        } else if (currentTime >= decayStartTime && catalyst.status === 'ACTIVE') {
          // Transition into decaying phase
          logger.debug(`[NEWS SCHEDULER] Catalyst #${catalyst.id} for news #${article.id} entered DECAYING phase.`);
          await this.newsRepo.updateCatalyst(catalyst.id, {
            status: 'DECAYING',
          });

          const decayPct = this.catalystEngine.calculateDecayRemainingPercent(catalyst, now);
          const impact = this.catalystEngine.calculateEffectiveImpact(
            article,
            catalyst,
            article.target_symbol || undefined,
            article.target_sector || undefined,
            now
          );

          await this.newsRepo.createExecution({
            catalyst_id: catalyst.id,
            news_id: article.id,
            action: 'DECAY_APPLIED',
            effective_impact: impact.toFixed(4),
            affected_instruments: article.target_symbol
              ? JSON.stringify([article.target_symbol])
              : null,
            details: JSON.stringify({ decayRemainingPercent: decayPct }),
          });

          this.realtimeService.emitCatalystUpdated(catalyst.id, article.id, impact.toFixed(4), decayPct);
        }
      }
    } catch (err: any) {
      logger.error(`[NEWS SCHEDULER] Error during news scheduler tick: ${err.message}`);
    } finally {
      this.isTicking = false;
    }
  }
}

export const newsScheduler = new NewsScheduler();
