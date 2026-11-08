import { logger } from '../../utils/logger';
import { INewsRepository, newsRepository as defaultNewsRepo } from './news.repository';
import { CatalystEngine, catalystEngine as defaultCatalystEngine } from './catalyst.engine';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../websocket/realtime.service';
import {
  NewsArticleRecord,
  NewsCatalystRecord,
  CatalystImpactResult,
} from './news.types';
import {
  CreateNewsInput,
  UpdateNewsInput,
} from '@tradegrid/validation';
import {
  NewsArticle,
  NewsCatalyst,
  NewsFilterQuery,
  ActiveCatalystSummary,
  NewsMetricsSummary,
  NewsSeverity,
  NewsImpactDirection,
  NewsStatus,
} from '@tradegrid/shared-types';

export class NewsService {
  constructor(
    private readonly newsRepo: INewsRepository = defaultNewsRepo,
    private readonly catalystEngine: CatalystEngine = defaultCatalystEngine,
    private readonly realtimeService: IRealtimeService = defaultRealtimeService
  ) {}

  /**
   * Helper to determine default sentiment and volatility based on direction and severity.
   */
  private deriveDefaultCatalystParams(
    direction: NewsImpactDirection,
    severity: NewsSeverity
  ): { sentiment: string; volatility: string } {
    let sentiment = '0.0000';
    if (direction === 'POSITIVE') {
      sentiment = severity === 'EXTREME' ? '1.0000' : severity === 'HIGH' ? '0.7500' : severity === 'MEDIUM' ? '0.5000' : '0.2500';
    } else if (direction === 'NEGATIVE') {
      sentiment = severity === 'EXTREME' ? '-1.0000' : severity === 'HIGH' ? '-0.7500' : severity === 'MEDIUM' ? '-0.5000' : '-0.2500';
    }

    const volatility =
      severity === 'EXTREME'
        ? '2.5000'
        : severity === 'HIGH'
        ? '1.8000'
        : severity === 'MEDIUM'
        ? '1.4000'
        : '1.1500';

    return { sentiment, volatility };
  }

  /**
   * Creates a new simulated news article with optional attached catalyst parameters.
   */
  async createNews(
    userId: number,
    input: CreateNewsInput
  ): Promise<{ article: NewsArticle; catalyst?: NewsCatalyst }> {
    const { sentiment, volatility } = this.deriveDefaultCatalystParams(
      input.impactDirection,
      input.severity
    );

    const sentimentScore = input.catalyst?.sentimentScore ?? sentiment;
    const volatilityFactor = input.catalyst?.volatilityFactor ?? volatility;
    const expectedParticipation = input.catalyst?.expectedParticipation ?? '1.2000';
    const durationSeconds = input.catalyst?.durationSeconds ?? 300;
    const decayRate = input.catalyst?.decayRate ?? '0.0200';

    const now = new Date();
    const isImmediate = Boolean(input.publishImmediately);
    const isScheduled = Boolean(input.scheduledAt && !isImmediate);

    let status: NewsStatus = 'DRAFT';
    let publishedAt: Date | null = null;
    let scheduledAt: Date | null = null;
    let expiresAt: Date | null = null;
    let activatedAt: Date | null = null;
    let decayStartsAt: Date | null = null;

    if (isImmediate) {
      status = 'ACTIVE';
      publishedAt = now;
      activatedAt = now;
      decayStartsAt = new Date(now.getTime() + (durationSeconds * 1000) / 2);
      expiresAt = new Date(now.getTime() + durationSeconds * 1000);
    } else if (isScheduled) {
      status = 'SCHEDULED';
      scheduledAt = new Date(input.scheduledAt!);
    }

    const articleData: Omit<NewsArticleRecord, 'id' | 'created_at' | 'updated_at'> = {
      headline: input.headline,
      summary: input.summary,
      content: input.content || null,
      category: input.category,
      impact_direction: input.impactDirection,
      severity: input.severity,
      target_scope: input.targetScope,
      target_id: input.targetId || null,
      target_symbol: input.targetSymbol ? input.targetSymbol.toUpperCase() : null,
      target_sector: input.targetSector || null,
      status,
      is_simulated: true, // MANDATORY: 100% simulated flag
      created_by: userId,
      scheduled_at: scheduledAt,
      published_at: publishedAt,
      expires_at: expiresAt,
    };

    const catalystData = {
      sentiment_score: sentimentScore,
      volatility_factor: volatilityFactor,
      expected_participation: expectedParticipation,
      duration_seconds: durationSeconds,
      decay_rate: decayRate,
      status: isImmediate ? ('ACTIVE' as const) : ('PENDING' as const),
      activated_at: activatedAt,
      decay_starts_at: decayStartsAt,
      expired_at: expiresAt,
    };

    const { article, catalyst } = await this.newsRepo.createArticle(articleData, catalystData);

    logger.info(
      `[NEWS SERVICE] News #${article.id} "${article.headline}" created by User #${userId} (Status: ${article.status})`
    );

    // If published immediately, log audit execution & emit real-time event
    if (isImmediate && catalyst) {
      const initialImpact = this.catalystEngine.calculateEffectiveImpact(
        article,
        catalyst,
        article.target_symbol || undefined,
        article.target_sector || undefined,
        now
      );

      await this.newsRepo.createExecution({
        catalyst_id: catalyst.id,
        news_id: article.id,
        action: 'CATALYST_ACTIVATED',
        effective_impact: initialImpact.toFixed(4),
        affected_instruments: article.target_symbol ? JSON.stringify([article.target_symbol]) : null,
        details: JSON.stringify({
          reason: 'Immediate Publication',
          headline: article.headline,
          sentiment: catalyst.sentiment_score,
          volatility: catalyst.volatility_factor,
        }),
      });

      // WebSocket broadcast
      this.realtimeService.emitNewsPublished(this.formatArticle(article, catalyst));
      this.realtimeService.emitCatalystStarted(article, catalyst);
    } else if (isScheduled && catalyst) {
      await this.newsRepo.createExecution({
        catalyst_id: catalyst.id,
        news_id: article.id,
        action: 'SCHEDULED',
        effective_impact: '0.0000',
        affected_instruments: article.target_symbol ? JSON.stringify([article.target_symbol]) : null,
        details: JSON.stringify({ scheduledAt: article.scheduled_at }),
      });
    }

    return {
      article: this.formatArticle(article, catalyst),
      catalyst: catalyst ? this.formatCatalyst(catalyst) : undefined,
    };
  }

  /**
   * Immediately publishes a draft or scheduled news article and activates its catalyst.
   */
  async publishNews(id: number): Promise<NewsArticle> {
    const record = await this.newsRepo.findById(id);
    if (!record) {
      throw new Error(`News article #${id} not found`);
    }

    if (record.article.status === 'EXPIRED' || record.article.status === 'CANCELLED') {
      throw new Error(`Cannot publish article #${id} with status ${record.article.status}`);
    }

    const now = new Date();
    const durationSeconds = record.catalyst?.duration_seconds || 300;
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000);
    const decayStartsAt = new Date(now.getTime() + (durationSeconds * 1000) / 2);

    const updatedArticle = await this.newsRepo.updateArticle(id, {
      status: 'ACTIVE',
      published_at: now,
      expires_at: expiresAt,
    });

    let updatedCatalyst: NewsCatalystRecord | undefined = record.catalyst;
    if (record.catalyst) {
      updatedCatalyst = await this.newsRepo.updateCatalyst(record.catalyst.id, {
        status: 'ACTIVE',
        activated_at: now,
        decay_starts_at: decayStartsAt,
        expired_at: expiresAt,
      });

      const initialImpact = this.catalystEngine.calculateEffectiveImpact(
        updatedArticle,
        updatedCatalyst,
        updatedArticle.target_symbol || undefined,
        updatedArticle.target_sector || undefined,
        now
      );

      await this.newsRepo.createExecution({
        catalyst_id: updatedCatalyst.id,
        news_id: updatedArticle.id,
        action: 'CATALYST_ACTIVATED',
        effective_impact: initialImpact.toFixed(4),
        affected_instruments: updatedArticle.target_symbol
          ? JSON.stringify([updatedArticle.target_symbol])
          : null,
        details: JSON.stringify({
          reason: 'Manual Admin Publication',
          headline: updatedArticle.headline,
        }),
      });

      // WebSocket broadcast
      this.realtimeService.emitNewsPublished(this.formatArticle(updatedArticle, updatedCatalyst));
      this.realtimeService.emitCatalystStarted(updatedArticle, updatedCatalyst);
    }

    logger.info(`[NEWS SERVICE] News #${id} published and catalyst activated successfully.`);
    return this.formatArticle(updatedArticle, updatedCatalyst);
  }

  /**
   * Schedules a news article for publication at a future timestamp.
   */
  async scheduleNews(id: number, scheduledAt: string): Promise<NewsArticle> {
    const record = await this.newsRepo.findById(id);
    if (!record) {
      throw new Error(`News article #${id} not found`);
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      throw new Error('Invalid scheduledAt timestamp');
    }

    const updatedArticle = await this.newsRepo.updateArticle(id, {
      status: 'SCHEDULED',
      scheduled_at: scheduledDate,
    });

    if (record.catalyst) {
      await this.newsRepo.updateCatalyst(record.catalyst.id, {
        status: 'PENDING',
      });

      await this.newsRepo.createExecution({
        catalyst_id: record.catalyst.id,
        news_id: updatedArticle.id,
        action: 'SCHEDULED',
        effective_impact: '0.0000',
        affected_instruments: updatedArticle.target_symbol
          ? JSON.stringify([updatedArticle.target_symbol])
          : null,
        details: JSON.stringify({ scheduledAt }),
      });
    }

    return this.formatArticle(updatedArticle, record.catalyst);
  }

  /**
   * Cancels an active or scheduled news article, deactivating its catalyst immediately.
   */
  async cancelNews(id: number): Promise<NewsArticle> {
    const record = await this.newsRepo.findById(id);
    if (!record) {
      throw new Error(`News article #${id} not found`);
    }

    const updatedArticle = await this.newsRepo.updateArticle(id, {
      status: 'CANCELLED',
    });

    let updatedCatalyst = record.catalyst;
    if (record.catalyst) {
      updatedCatalyst = await this.newsRepo.updateCatalyst(record.catalyst.id, {
        status: 'CANCELLED',
      });

      await this.newsRepo.createExecution({
        catalyst_id: record.catalyst.id,
        news_id: updatedArticle.id,
        action: 'CANCELLED',
        effective_impact: '0.0000',
        affected_instruments: updatedArticle.target_symbol
          ? JSON.stringify([updatedArticle.target_symbol])
          : null,
        details: JSON.stringify({ reason: 'Admin Cancelled' }),
      });

      this.realtimeService.emitNewsExpired(updatedArticle.id, record.catalyst.id);
    }

    this.realtimeService.emitNewsUpdated(this.formatArticle(updatedArticle, updatedCatalyst));
    logger.info(`[NEWS SERVICE] News #${id} cancelled and catalyst deactivated.`);
    return this.formatArticle(updatedArticle, updatedCatalyst);
  }

  /**
   * Updates an existing news article and its catalyst configuration.
   */
  async updateNews(id: number, input: UpdateNewsInput): Promise<NewsArticle> {
    const record = await this.newsRepo.findById(id);
    if (!record) {
      throw new Error(`News article #${id} not found`);
    }

    if (record.article.status === 'ACTIVE' || record.article.status === 'EXPIRED') {
      throw new Error(`Cannot modify article #${id} when status is ${record.article.status}`);
    }

    const articleUpdates: Partial<NewsArticleRecord> = {};
    if (input.headline) articleUpdates.headline = input.headline;
    if (input.summary) articleUpdates.summary = input.summary;
    if (input.content !== undefined) articleUpdates.content = input.content;
    if (input.category) articleUpdates.category = input.category;
    if (input.impactDirection) articleUpdates.impact_direction = input.impactDirection;
    if (input.severity) articleUpdates.severity = input.severity;
    if (input.targetScope) articleUpdates.target_scope = input.targetScope;
    if (input.targetSymbol) articleUpdates.target_symbol = input.targetSymbol.toUpperCase();
    if (input.targetSector) articleUpdates.target_sector = input.targetSector;
    if (input.scheduledAt !== undefined) {
      articleUpdates.scheduled_at = input.scheduledAt ? new Date(input.scheduledAt) : null;
    }

    const updatedArticle = await this.newsRepo.updateArticle(id, articleUpdates);

    let updatedCatalyst = record.catalyst;
    if (record.catalyst && input.catalyst) {
      const catalystUpdates: Partial<NewsCatalystRecord> = {};
      if (input.catalyst.sentimentScore) catalystUpdates.sentiment_score = input.catalyst.sentimentScore;
      if (input.catalyst.volatilityFactor) catalystUpdates.volatility_factor = input.catalyst.volatilityFactor;
      if (input.catalyst.expectedParticipation) catalystUpdates.expected_participation = input.catalyst.expectedParticipation;
      if (input.catalyst.durationSeconds) catalystUpdates.duration_seconds = input.catalyst.durationSeconds;
      if (input.catalyst.decayRate) catalystUpdates.decay_rate = input.catalyst.decayRate;

      updatedCatalyst = await this.newsRepo.updateCatalyst(record.catalyst.id, catalystUpdates);
    }

    return this.formatArticle(updatedArticle, updatedCatalyst);
  }

  /**
   * Deletes a draft or cancelled article.
   */
  async deleteNews(id: number): Promise<boolean> {
    const record = await this.newsRepo.findById(id);
    if (!record) {
      throw new Error(`News article #${id} not found`);
    }
    if (record.article.status === 'ACTIVE') {
      throw new Error(`Cannot delete active news #${id}. Please cancel it first.`);
    }
    return this.newsRepo.deleteArticle(id);
  }

  /**
   * Retrieves single news article with catalyst and execution history.
   */
  async getNewsById(id: number): Promise<NewsArticle | null> {
    const record = await this.newsRepo.findById(id);
    if (!record) return null;
    return this.formatArticle(record.article, record.catalyst);
  }

  /**
   * Queries news articles with pagination and filtering.
   */
  async listNews(
    filter?: NewsFilterQuery
  ): Promise<{ articles: NewsArticle[]; total: number }> {
    const { articles, total } = await this.newsRepo.findArticles(filter);
    return {
      articles: articles.map((a) => this.formatArticle(a, a.catalyst)),
      total,
    };
  }

  /**
   * Retrieves summary of all currently active catalysts influencing the market.
   */
  async getActiveCatalysts(): Promise<ActiveCatalystSummary[]> {
    const now = new Date();
    const active = await this.newsRepo.findActiveCatalysts(now);

    return active.map(({ article, catalyst }) => {
      const effectiveImpact = this.catalystEngine.calculateEffectiveImpact(
        article,
        catalyst,
        article.target_symbol || undefined,
        article.target_sector || undefined,
        now
      );

      const decayRemainingPercent = this.catalystEngine.calculateDecayRemainingPercent(
        catalyst,
        now
      );

      return {
        catalystId: catalyst.id,
        newsId: article.id,
        headline: article.headline,
        category: article.category,
        impactDirection: article.impact_direction,
        severity: article.severity,
        targetScope: article.target_scope,
        targetSymbol: article.target_symbol,
        targetSector: article.target_sector,
        sentimentScore: catalyst.sentiment_score,
        volatilityFactor: catalyst.volatility_factor,
        effectiveImpact: effectiveImpact.toFixed(4),
        decayRemainingPercent,
        activatedAt: catalyst.activated_at ? new Date(catalyst.activated_at).toISOString() : '',
        expiresAt: catalyst.expired_at ? new Date(catalyst.expired_at).toISOString() : '',
      };
    });
  }

  /**
   * Computes composite catalyst impact for an instrument to be consumed safely by trading bots.
   */
  async getCompositeImpactForInstrument(
    symbol: string,
    sector?: string
  ): Promise<CatalystImpactResult> {
    const now = new Date();
    const active = await this.newsRepo.findActiveCatalysts(now);
    return this.catalystEngine.computeCompositeImpact(active, symbol, sector, now);
  }

  /**
   * Retrieves audit execution history for a news catalyst.
   */
  async getExecutions(
    newsId: number,
    options?: { page?: number; limit?: number }
  ) {
    const res = await this.newsRepo.findExecutionsByNewsId(newsId, options);
    return {
      executions: res.executions.map((e) => ({
        id: e.id,
        catalystId: e.catalyst_id,
        newsId: e.news_id,
        action: e.action,
        effectiveImpact: String(e.effective_impact),
        affectedInstruments: e.affected_instruments ? JSON.parse(e.affected_instruments) : undefined,
        details: e.details ? JSON.parse(e.details) : undefined,
        createdAt: new Date(e.created_at).toISOString(),
      })),
      total: res.total,
    };
  }

  /**
   * Retrieves aggregate system metrics.
   */
  async getMetricsSummary(): Promise<NewsMetricsSummary> {
    return this.newsRepo.getMetricsSummary();
  }

  // Formatting helpers
  private formatArticle(article: NewsArticleRecord, catalyst?: NewsCatalystRecord): NewsArticle {
    return {
      id: article.id,
      headline: article.headline,
      summary: article.summary,
      content: article.content,
      category: article.category,
      impactDirection: article.impact_direction,
      severity: article.severity,
      targetScope: article.target_scope,
      targetId: article.target_id,
      targetSymbol: article.target_symbol,
      targetSector: article.target_sector,
      status: article.status,
      isSimulated: Boolean(article.is_simulated),
      createdBy: article.created_by,
      scheduledAt: article.scheduled_at ? new Date(article.scheduled_at).toISOString() : null,
      publishedAt: article.published_at ? new Date(article.published_at).toISOString() : null,
      expiresAt: article.expires_at ? new Date(article.expires_at).toISOString() : null,
      createdAt: new Date(article.created_at).toISOString(),
      updatedAt: new Date(article.updated_at).toISOString(),
      catalyst: catalyst ? this.formatCatalyst(catalyst) : null,
    };
  }

  private formatCatalyst(catalyst: NewsCatalystRecord): NewsCatalyst {
    return {
      id: catalyst.id,
      newsId: catalyst.news_id,
      sentimentScore: String(catalyst.sentiment_score),
      volatilityFactor: String(catalyst.volatility_factor),
      expectedParticipation: String(catalyst.expected_participation),
      durationSeconds: Number(catalyst.duration_seconds),
      decayRate: String(catalyst.decay_rate),
      status: catalyst.status,
      activatedAt: catalyst.activated_at ? new Date(catalyst.activated_at).toISOString() : null,
      decayStartsAt: catalyst.decay_starts_at ? new Date(catalyst.decay_starts_at).toISOString() : null,
      expiredAt: catalyst.expired_at ? new Date(catalyst.expired_at).toISOString() : null,
      createdAt: new Date(catalyst.created_at).toISOString(),
      updatedAt: new Date(catalyst.updated_at).toISOString(),
    };
  }
}

export const newsService = new NewsService();
