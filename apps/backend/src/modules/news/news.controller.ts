import { Request, Response, NextFunction } from 'express';
import { NewsService, newsService as defaultNewsService } from './news.service';
import {
  createNewsSchema,
  updateNewsSchema,
  scheduleNewsSchema,
  newsQuerySchema,
  newsIdParamSchema,
} from '@tradegrid/validation';

export class NewsController {
  constructor(private readonly newsService: NewsService = defaultNewsService) {}

  /**
   * POST /api/v1/admin/news
   * Creates a new simulated news article with optional catalyst parameters.
   */
  createNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createNewsSchema.parse(req.body);
      const userId = (req as any).user?.id || 1;
      const result = await this.newsService.createNews(userId, input);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Simulated news article created successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/admin/news or GET /api/v1/news
   * Lists news articles with filtering and pagination.
   */
  listNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = newsQuerySchema.parse(req.query);
      const result = await this.newsService.listNews(query);

      res.status(200).json({
        success: true,
        data: result,
        message: 'News articles retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/admin/news/:id or GET /api/v1/news/:id
   * Retrieves single news article by ID.
   */
  getNewsById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = newsIdParamSchema.parse(req.params);
      const article = await this.newsService.getNewsById(id);

      if (!article) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NEWS_NOT_FOUND',
            message: `News article #${id} not found`,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: { article },
        message: 'News article retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/admin/news/:id/publish
   * Immediately publishes an article and activates its catalyst.
   */
  publishNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = newsIdParamSchema.parse(req.params);
      const article = await this.newsService.publishNews(id);

      res.status(200).json({
        success: true,
        data: { article },
        message: `News article #${id} published and catalyst activated`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/admin/news/:id/schedule
   * Schedules an article for future publication.
   */
  scheduleNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = newsIdParamSchema.parse(req.params);
      const { scheduledAt } = scheduleNewsSchema.parse(req.body);
      const article = await this.newsService.scheduleNews(id, scheduledAt);

      res.status(200).json({
        success: true,
        data: { article },
        message: `News article #${id} scheduled for ${scheduledAt}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/admin/news/:id/cancel
   * Cancels a scheduled or active news article and halts its catalyst.
   */
  cancelNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = newsIdParamSchema.parse(req.params);
      const article = await this.newsService.cancelNews(id);

      res.status(200).json({
        success: true,
        data: { article },
        message: `News article #${id} cancelled successfully`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/admin/news/:id
   * Updates article content or catalyst configuration.
   */
  updateNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = newsIdParamSchema.parse(req.params);
      const input = updateNewsSchema.parse(req.body);
      const article = await this.newsService.updateNews(id, input);

      res.status(200).json({
        success: true,
        data: { article },
        message: `News article #${id} updated successfully`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/admin/news/:id
   * Deletes a draft or cancelled article.
   */
  deleteNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = newsIdParamSchema.parse(req.params);
      const deleted = await this.newsService.deleteNews(id);

      res.status(200).json({
        success: true,
        data: { deleted },
        message: `News article #${id} deleted successfully`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/admin/news/:id/executions
   * Retrieves audit execution logs for a news article catalyst.
   */
  getExecutions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = newsIdParamSchema.parse(req.params);
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

      const result = await this.newsService.getExecutions(id, { page, limit });

      res.status(200).json({
        success: true,
        data: result,
        message: 'Catalyst execution audit trail retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/admin/news/metrics
   * Retrieves aggregate news and catalyst metrics.
   */
  getMetricsSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metrics = await this.newsService.getMetricsSummary();

      res.status(200).json({
        success: true,
        data: { metrics },
        message: 'News metrics retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/news/active-catalysts
   * Retrieves currently active catalysts influencing market pricing.
   */
  getActiveCatalysts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const catalysts = await this.newsService.getActiveCatalysts();

      res.status(200).json({
        success: true,
        data: { catalysts, activeCatalysts: catalysts },
        message: 'Active simulated catalysts retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

export const newsController = new NewsController();
