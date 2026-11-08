import { Request, Response, NextFunction } from 'express';
import { CompetitionService } from './competition.service';
import {
  createCompetitionSchema,
  joinCompetitionSchema,
  createCompetitionOrderSchema,
  competitionQuerySchema,
} from '@tradegrid/validation';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';

export class CompetitionController {
  constructor(private competitionService: CompetitionService) {}

  createCompetition = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const input = createCompetitionSchema.parse(req.body);
      const competition = await this.competitionService.createCompetition(userId, input);
      sendSuccess(res, competition, 'Trading competition created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  listCompetitions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = competitionQuerySchema.parse(req.query);
      const currentUserId = (req as any).user?.id || (req as any).user?.userId;
      const result = await this.competitionService.listCompetitions(query, currentUserId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  listMyCompetitions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const competitions = await this.competitionService.listUserCompetitions(userId);
      sendSuccess(res, { competitions });
    } catch (err) {
      next(err);
    }
  };

  getCompetition = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }
      const competition = await this.competitionService.getCompetitionById(id);
      sendSuccess(res, competition);
    } catch (err) {
      next(err);
    }
  };

  joinCompetition = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const competitionId = parseInt(req.params.id, 10);
      if (isNaN(competitionId) || competitionId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }

      const input = joinCompetitionSchema.parse(req.body);
      const participant = await this.competitionService.joinCompetition(
        competitionId,
        userId,
        input
      );
      sendSuccess(res, participant, 'Successfully joined competition');
    } catch (err) {
      next(err);
    }
  };

  leaveCompetition = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const competitionId = parseInt(req.params.id, 10);
      if (isNaN(competitionId) || competitionId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }

      await this.competitionService.leaveCompetition(competitionId, userId);
      sendSuccess(res, { message: 'Successfully left competition' });
    } catch (err) {
      next(err);
    }
  };

  listParticipants = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const competitionId = parseInt(req.params.id, 10);
      if (isNaN(competitionId) || competitionId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }
      const participants = await this.competitionService.listParticipants(competitionId);
      sendSuccess(res, { participants });
    } catch (err) {
      next(err);
    }
  };

  getLeaderboard = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const competitionId = parseInt(req.params.id, 10);
      if (isNaN(competitionId) || competitionId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }
      const leaderboard = await this.competitionService.getLeaderboard(competitionId);
      sendSuccess(res, { leaderboard });
    } catch (err) {
      next(err);
    }
  };

  getPortfolio = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const competitionId = parseInt(req.params.id, 10);
      if (isNaN(competitionId) || competitionId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }
      const portfolio = await this.competitionService.getPortfolio(competitionId, userId);
      sendSuccess(res, portfolio);
    } catch (err) {
      next(err);
    }
  };

  submitOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const competitionId = parseInt(req.params.id, 10);
      if (isNaN(competitionId) || competitionId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }

      const input = createCompetitionOrderSchema.parse(req.body);
      const result = await this.competitionService.submitOrder(competitionId, userId, input);
      sendSuccess(res, result, 'Competition order accepted and processed', 201);
    } catch (err) {
      next(err);
    }
  };

  cancelOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const competitionId = parseInt(req.params.id, 10);
      const orderId = parseInt(req.params.orderId, 10);
      if (isNaN(competitionId) || isNaN(orderId)) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition or order ID');
      }

      const cancelled = await this.competitionService.cancelOrder(
        competitionId,
        userId,
        orderId
      );
      sendSuccess(res, cancelled, 'Order cancelled successfully');
    } catch (err) {
      next(err);
    }
  };

  getOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const competitionId = parseInt(req.params.id, 10);
      if (isNaN(competitionId)) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }
      const orders = await this.competitionService.getOrders(competitionId, userId);
      sendSuccess(res, { orders });
    } catch (err) {
      next(err);
    }
  };

  getTrades = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const competitionId = parseInt(req.params.id, 10);
      if (isNaN(competitionId)) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }
      const trades = await this.competitionService.getTrades(competitionId);
      sendSuccess(res, { trades });
    } catch (err) {
      next(err);
    }
  };

  cancelCompetition = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const competitionId = parseInt(req.params.id, 10);
      if (isNaN(competitionId)) {
        throw new AppError(400, 'INVALID_ID', 'Invalid competition ID');
      }
      const reason = req.body?.reason;
      const cancelled = await this.competitionService.cancelCompetition(
        competitionId,
        userId,
        reason
      );
      sendSuccess(res, cancelled, 'Competition cancelled successfully');
    } catch (err) {
      next(err);
    }
  };
}
