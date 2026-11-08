import { Request, Response, NextFunction } from 'express';
import { betaEnvironmentService, BetaEnvironmentService, BetaFeatureFlag } from '../../config/beta';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';

export class BetaController {
  constructor(private readonly betaService: BetaEnvironmentService = betaEnvironmentService) {}

  /**
   * GET /api/v1/beta/status
   * Returns current beta environment status, version, feature flags, and virtual trading disclaimer.
   */
  getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = this.betaService.getBetaStatus();
      sendSuccess(res, status, 'TRADEGRID Beta Environment Status');
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/beta/feedback
   * Allows authenticated beta users to submit bug reports and feedback.
   */
  submitFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to submit beta feedback');
      }

      const { category, rating, message, diagnostics } = req.body;
      if (!category || !rating || !message) {
        throw new AppError(400, 'INVALID_FEEDBACK', 'Category, rating (1-5), and message are required');
      }

      const record = this.betaService.submitFeedback(userId, {
        category,
        rating: Number(rating),
        message: String(message),
        diagnostics,
      });

      sendSuccess(res, record, 'Beta feedback submitted successfully', 201);
    } catch (err: any) {
      if (err.message && err.message.includes('Rating must be')) {
        next(new AppError(400, 'INVALID_RATING', err.message));
      } else if (err.message && err.message.includes('Feedback message cannot')) {
        next(new AppError(400, 'INVALID_MESSAGE', err.message));
      } else {
        next(err);
      }
    }
  };

  /**
   * GET /api/v1/beta/feedback
   * Allows administrators to review submitted beta feedback.
   */
  listFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== 'ADMIN') {
        throw new AppError(403, 'FORBIDDEN', 'Administrative privilege required to view feedback reports');
      }

      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const feedback = this.betaService.listFeedback(limit);
      sendSuccess(res, { feedback, count: feedback.length }, 'Beta feedback reports retrieved');
    } catch (err) {
      next(err);
    }
  };
}

export const defaultBetaController = new BetaController();
