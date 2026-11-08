import { apiClient } from './api';
import {
  ApiResponse,
  NewsArticle,
  NewsCatalyst,
  NewsCatalystExecution,
  ActiveCatalystSummary,
  NewsMetricsSummary,
  NewsFilterQuery,
} from '@tradegrid/shared-types';
import { CreateNewsInput, UpdateNewsInput } from '@tradegrid/validation';

export const newsApiService = {
  /**
   * Fetches public list of news articles with optional category/severity/scope filtering.
   */
  async getNews(filter?: NewsFilterQuery): Promise<{ articles: NewsArticle[]; total: number }> {
    const res = await apiClient.get<ApiResponse<{ articles: NewsArticle[]; total: number }>>('/news', {
      params: filter,
    });
    return res.data.data;
  },

  /**
   * Fetches single news article by ID.
   */
  async getNewsById(id: number): Promise<NewsArticle> {
    const res = await apiClient.get<ApiResponse<NewsArticle>>(`/news/${id}`);
    return res.data.data;
  },

  /**
   * Fetches active market catalysts currently influencing price dynamics.
   */
  async getActiveCatalysts(): Promise<ActiveCatalystSummary[]> {
    const res = await apiClient.get<
      ApiResponse<{ catalysts?: ActiveCatalystSummary[]; activeCatalysts?: ActiveCatalystSummary[] }>
    >('/news/active-catalysts');
    return res.data.data.catalysts || res.data.data.activeCatalysts || [];
  },

  /**
   * Admin: Fetches aggregate simulated news and catalyst engine metrics.
   */
  async getAdminMetrics(): Promise<NewsMetricsSummary> {
    const res = await apiClient.get<ApiResponse<{ metrics: NewsMetricsSummary }>>('/admin/news/metrics');
    return res.data.data.metrics;
  },

  /**
   * Admin: Fetches paginated audit logs/executions for an article's catalyst.
   */
  async getExecutions(
    id: number,
    page: number = 1,
    limit: number = 20
  ): Promise<{ executions: NewsCatalystExecution[]; total: number }> {
    const res = await apiClient.get<ApiResponse<{ executions: NewsCatalystExecution[]; total: number }>>(
      `/admin/news/${id}/executions`,
      { params: { page, limit } }
    );
    return res.data.data;
  },

  /**
   * Admin: Creates a new breaking news article with simulated flag and catalyst config.
   */
  async createNews(
    input: CreateNewsInput
  ): Promise<{ article: NewsArticle; catalyst?: NewsCatalyst }> {
    const res = await apiClient.post<ApiResponse<{ article: NewsArticle; catalyst?: NewsCatalyst }>>(
      '/admin/news',
      input
    );
    return res.data.data;
  },

  /**
   * Admin: Immediately activates and publishes a draft or scheduled news article.
   */
  async publishNews(id: number): Promise<NewsArticle> {
    const res = await apiClient.post<ApiResponse<{ article: NewsArticle }>>(`/admin/news/${id}/publish`);
    return res.data.data.article;
  },

  /**
   * Admin: Schedules a news article for future publication.
   */
  async scheduleNews(id: number, scheduledAt: string): Promise<NewsArticle> {
    const res = await apiClient.post<ApiResponse<{ article: NewsArticle }>>(`/admin/news/${id}/schedule`, {
      scheduledAt,
    });
    return res.data.data.article;
  },

  /**
   * Admin: Cancels an active or scheduled article and neutralizes its catalyst.
   */
  async cancelNews(id: number): Promise<NewsArticle> {
    const res = await apiClient.post<ApiResponse<{ article: NewsArticle }>>(`/admin/news/${id}/cancel`);
    return res.data.data.article;
  },

  /**
   * Admin: Updates an existing article's metadata or catalyst parameters.
   */
  async updateNews(id: number, input: UpdateNewsInput): Promise<NewsArticle> {
    const res = await apiClient.patch<ApiResponse<{ article: NewsArticle }>>(`/admin/news/${id}`, input);
    return res.data.data.article;
  },

  /**
   * Admin: Deletes a draft or cancelled news article.
   */
  async deleteNews(id: number): Promise<boolean> {
    const res = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/admin/news/${id}`);
    return res.data.data.deleted;
  },
};
