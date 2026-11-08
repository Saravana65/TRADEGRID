import type { Knex } from 'knex';
import { db } from '../../database/connection';
import {
  NewsArticleRecord,
  NewsCatalystRecord,
  NewsCatalystExecutionRecord,
} from './news.types';
import { NewsFilterQuery, NewsMetricsSummary } from '@tradegrid/shared-types';

export interface INewsRepository {
  createArticle(
    article: Omit<NewsArticleRecord, 'id' | 'created_at' | 'updated_at'>,
    catalyst?: Omit<NewsCatalystRecord, 'id' | 'news_id' | 'created_at' | 'updated_at'>,
    trx?: Knex.Transaction
  ): Promise<{ article: NewsArticleRecord; catalyst?: NewsCatalystRecord }>;

  findById(
    id: number,
    trx?: Knex.Transaction
  ): Promise<{ article: NewsArticleRecord; catalyst?: NewsCatalystRecord } | null>;

  findArticles(
    filter?: NewsFilterQuery,
    trx?: Knex.Transaction
  ): Promise<{ articles: (NewsArticleRecord & { catalyst?: NewsCatalystRecord })[]; total: number }>;

  updateArticle(
    id: number,
    data: Partial<NewsArticleRecord>,
    trx?: Knex.Transaction
  ): Promise<NewsArticleRecord>;

  deleteArticle(id: number, trx?: Knex.Transaction): Promise<boolean>;

  findDueScheduledArticles(now: Date, trx?: Knex.Transaction): Promise<NewsArticleRecord[]>;

  findActiveCatalysts(
    now: Date,
    trx?: Knex.Transaction
  ): Promise<{ article: NewsArticleRecord; catalyst: NewsCatalystRecord }[]>;

  findCatalystByNewsId(newsId: number, trx?: Knex.Transaction): Promise<NewsCatalystRecord | null>;

  createCatalyst(
    catalyst: Omit<NewsCatalystRecord, 'id' | 'created_at' | 'updated_at'>,
    trx?: Knex.Transaction
  ): Promise<NewsCatalystRecord>;

  updateCatalyst(
    id: number,
    data: Partial<NewsCatalystRecord>,
    trx?: Knex.Transaction
  ): Promise<NewsCatalystRecord>;

  createExecution(
    execution: Omit<NewsCatalystExecutionRecord, 'id' | 'created_at'>,
    trx?: Knex.Transaction
  ): Promise<NewsCatalystExecutionRecord>;

  findExecutionsByNewsId(
    newsId: number,
    options?: { page?: number; limit?: number },
    trx?: Knex.Transaction
  ): Promise<{ executions: NewsCatalystExecutionRecord[]; total: number }>;

  getMetricsSummary(trx?: Knex.Transaction): Promise<NewsMetricsSummary>;
}

export class NewsRepository implements INewsRepository {
  constructor(private readonly knex: Knex = db) {}

  async createArticle(
    article: Omit<NewsArticleRecord, 'id' | 'created_at' | 'updated_at'>,
    catalyst?: Omit<NewsCatalystRecord, 'id' | 'news_id' | 'created_at' | 'updated_at'>,
    trx?: Knex.Transaction
  ): Promise<{ article: NewsArticleRecord; catalyst?: NewsCatalystRecord }> {
    const runner = trx || this.knex;

    const [articleId] = await runner('news_articles').insert({
      ...article,
      created_at: runner.fn.now(),
      updated_at: runner.fn.now(),
    });

    const createdArticle = await runner('news_articles').where('id', articleId).first();

    let createdCatalyst: NewsCatalystRecord | undefined;
    if (catalyst) {
      const [catalystId] = await runner('news_catalysts').insert({
        ...catalyst,
        news_id: articleId,
        created_at: runner.fn.now(),
        updated_at: runner.fn.now(),
      });
      createdCatalyst = await runner('news_catalysts').where('id', catalystId).first();
    }

    return { article: createdArticle, catalyst: createdCatalyst };
  }

  async findById(
    id: number,
    trx?: Knex.Transaction
  ): Promise<{ article: NewsArticleRecord; catalyst?: NewsCatalystRecord } | null> {
    const runner = trx || this.knex;
    const article = await runner('news_articles').where('id', id).first();
    if (!article) return null;

    const catalyst = await runner('news_catalysts').where('news_id', id).first();
    return { article, catalyst };
  }

  async findArticles(
    filter?: NewsFilterQuery,
    trx?: Knex.Transaction
  ): Promise<{ articles: (NewsArticleRecord & { catalyst?: NewsCatalystRecord })[]; total: number }> {
    const runner = trx || this.knex;
    const page = filter?.page || 1;
    const limit = filter?.limit || 20;
    const offset = (page - 1) * limit;

    const baseQuery = runner('news_articles');

    if (filter?.category) {
      baseQuery.where('news_articles.category', filter.category);
    }
    if (filter?.impactDirection) {
      baseQuery.where('news_articles.impact_direction', filter.impactDirection);
    }
    if (filter?.severity) {
      baseQuery.where('news_articles.severity', filter.severity);
    }
    if (filter?.targetScope) {
      baseQuery.where('news_articles.target_scope', filter.targetScope);
    }
    if (filter?.targetSymbol) {
      baseQuery.where((builder) => {
        builder
          .where('news_articles.target_symbol', filter.targetSymbol)
          .orWhere('news_articles.target_scope', 'MARKET');
      });
    }
    if (filter?.targetSector) {
      baseQuery.where((builder) => {
        builder
          .where('news_articles.target_sector', filter.targetSector)
          .orWhere('news_articles.target_scope', 'MARKET');
      });
    }
    if (filter?.status) {
      baseQuery.where('news_articles.status', filter.status);
    }
    if (filter?.search) {
      const s = `%${filter.search}%`;
      baseQuery.where((builder) => {
        builder.where('news_articles.headline', 'like', s).orWhere('news_articles.summary', 'like', s);
      });
    }

    // Count query
    const countQuery = baseQuery.clone().count<{ count: number | string }>('id as count').first();
    const countResult = await countQuery;
    const total = Number(countResult?.count || 0);

    // Fetch records joined with catalysts
    const rows = await baseQuery
      .clone()
      .leftJoin('news_catalysts', 'news_articles.id', 'news_catalysts.news_id')
      .select(
        'news_articles.*',
        'news_catalysts.id as catalyst_id',
        'news_catalysts.sentiment_score',
        'news_catalysts.volatility_factor',
        'news_catalysts.expected_participation',
        'news_catalysts.duration_seconds',
        'news_catalysts.decay_rate',
        'news_catalysts.status as catalyst_status',
        'news_catalysts.activated_at as catalyst_activated_at',
        'news_catalysts.decay_starts_at',
        'news_catalysts.expired_at as catalyst_expired_at'
      )
      .orderBy('news_articles.published_at', 'desc')
      .orderBy('news_articles.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const articles = rows.map((r: any) => {
      let catalyst: NewsCatalystRecord | undefined;
      if (r.catalyst_id) {
        catalyst = {
          id: r.catalyst_id,
          news_id: r.id,
          sentiment_score: String(r.sentiment_score),
          volatility_factor: String(r.volatility_factor),
          expected_participation: String(r.expected_participation),
          duration_seconds: Number(r.duration_seconds),
          decay_rate: String(r.decay_rate),
          status: r.catalyst_status,
          activated_at: r.catalyst_activated_at,
          decay_starts_at: r.decay_starts_at,
          expired_at: r.catalyst_expired_at,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      }
      return {
        id: r.id,
        headline: r.headline,
        summary: r.summary,
        content: r.content,
        category: r.category,
        impact_direction: r.impact_direction,
        severity: r.severity,
        target_scope: r.target_scope,
        target_id: r.target_id,
        target_symbol: r.target_symbol,
        target_sector: r.target_sector,
        status: r.status,
        is_simulated: Boolean(r.is_simulated),
        created_by: r.created_by,
        scheduled_at: r.scheduled_at,
        published_at: r.published_at,
        expires_at: r.expires_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
        catalyst,
      };
    });

    return { articles, total };
  }

  async updateArticle(
    id: number,
    data: Partial<NewsArticleRecord>,
    trx?: Knex.Transaction
  ): Promise<NewsArticleRecord> {
    const runner = trx || this.knex;
    await runner('news_articles')
      .where('id', id)
      .update({
        ...data,
        updated_at: runner.fn.now(),
      });
    return runner('news_articles').where('id', id).first();
  }

  async deleteArticle(id: number, trx?: Knex.Transaction): Promise<boolean> {
    const runner = trx || this.knex;
    const deletedCount = await runner('news_articles').where('id', id).delete();
    return deletedCount > 0;
  }

  async findDueScheduledArticles(now: Date, trx?: Knex.Transaction): Promise<NewsArticleRecord[]> {
    const runner = trx || this.knex;
    return runner('news_articles')
      .where('status', 'SCHEDULED')
      .whereNotNull('scheduled_at')
      .where('scheduled_at', '<=', now);
  }

  async findActiveCatalysts(
    now: Date,
    trx?: Knex.Transaction
  ): Promise<{ article: NewsArticleRecord; catalyst: NewsCatalystRecord }[]> {
    const runner = trx || this.knex;
    const rows = await runner('news_catalysts')
      .join('news_articles', 'news_catalysts.news_id', 'news_articles.id')
      .whereIn('news_catalysts.status', ['ACTIVE', 'DECAYING'])
      .where('news_articles.status', 'ACTIVE')
      .select('news_articles.*', 'news_catalysts.id as catalyst_id', 'news_catalysts.*');

    return rows.map((r: any) => ({
      article: {
        id: r.news_id,
        headline: r.headline,
        summary: r.summary,
        content: r.content,
        category: r.category,
        impact_direction: r.impact_direction,
        severity: r.severity,
        target_scope: r.target_scope,
        target_id: r.target_id,
        target_symbol: r.target_symbol,
        target_sector: r.target_sector,
        status: r.status,
        is_simulated: Boolean(r.is_simulated),
        created_by: r.created_by,
        scheduled_at: r.scheduled_at,
        published_at: r.published_at,
        expires_at: r.expires_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
      catalyst: {
        id: r.catalyst_id,
        news_id: r.news_id,
        sentiment_score: String(r.sentiment_score),
        volatility_factor: String(r.volatility_factor),
        expected_participation: String(r.expected_participation),
        duration_seconds: Number(r.duration_seconds),
        decay_rate: String(r.decay_rate),
        status: r.status,
        activated_at: r.activated_at,
        decay_starts_at: r.decay_starts_at,
        expired_at: r.expired_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
    }));
  }

  async findCatalystByNewsId(newsId: number, trx?: Knex.Transaction): Promise<NewsCatalystRecord | null> {
    const runner = trx || this.knex;
    return runner('news_catalysts').where('news_id', newsId).first();
  }

  async createCatalyst(
    catalyst: Omit<NewsCatalystRecord, 'id' | 'created_at' | 'updated_at'>,
    trx?: Knex.Transaction
  ): Promise<NewsCatalystRecord> {
    const runner = trx || this.knex;
    const [id] = await runner('news_catalysts').insert({
      ...catalyst,
      created_at: runner.fn.now(),
      updated_at: runner.fn.now(),
    });
    return runner('news_catalysts').where('id', id).first();
  }

  async updateCatalyst(
    id: number,
    data: Partial<NewsCatalystRecord>,
    trx?: Knex.Transaction
  ): Promise<NewsCatalystRecord> {
    const runner = trx || this.knex;
    await runner('news_catalysts')
      .where('id', id)
      .update({
        ...data,
        updated_at: runner.fn.now(),
      });
    return runner('news_catalysts').where('id', id).first();
  }

  async createExecution(
    execution: Omit<NewsCatalystExecutionRecord, 'id' | 'created_at'>,
    trx?: Knex.Transaction
  ): Promise<NewsCatalystExecutionRecord> {
    const runner = trx || this.knex;
    const [id] = await runner('news_catalyst_executions').insert({
      ...execution,
      created_at: runner.fn.now(),
    });
    return runner('news_catalyst_executions').where('id', id).first();
  }

  async findExecutionsByNewsId(
    newsId: number,
    options?: { page?: number; limit?: number },
    trx?: Knex.Transaction
  ): Promise<{ executions: NewsCatalystExecutionRecord[]; total: number }> {
    const runner = trx || this.knex;
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;

    const baseQuery = runner('news_catalyst_executions').where('news_id', newsId);

    const countRes = await baseQuery.clone().count<{ count: number | string }>('id as count').first();
    const total = Number(countRes?.count || 0);

    const executions = await baseQuery
      .clone()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return { executions, total };
  }

  async getMetricsSummary(trx?: Knex.Transaction): Promise<NewsMetricsSummary> {
    const runner = trx || this.knex;

    const [articlesSummary, catalystsSummary] = await Promise.all([
      runner('news_articles')
        .select(
          runner.raw('COUNT(*) as total_articles'),
          runner.raw("SUM(CASE WHEN status = 'SCHEDULED' THEN 1 ELSE 0 END) as scheduled_articles"),
          runner.raw("SUM(CASE WHEN status IN ('PUBLISHED', 'ACTIVE') THEN 1 ELSE 0 END) as published_articles"),
          runner.raw("SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) as expired_articles"),
          runner.raw("SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_articles")
        )
        .first(),
      runner('news_catalysts')
        .whereIn('status', ['ACTIVE', 'DECAYING'])
        .count<{ count: number | string }>('id as count')
        .first(),
    ]);

    return {
      totalArticles: Number(articlesSummary?.total_articles || 0),
      activeCatalysts: Number(catalystsSummary?.count || 0),
      scheduledArticles: Number(articlesSummary?.scheduled_articles || 0),
      publishedArticles: Number(articlesSummary?.published_articles || 0),
      expiredArticles: Number(articlesSummary?.expired_articles || 0),
      cancelledArticles: Number(articlesSummary?.cancelled_articles || 0),
    };
  }
}

export const newsRepository = new NewsRepository();
