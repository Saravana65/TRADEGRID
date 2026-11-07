import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import { BotService } from './bot.service';
import {
  createBotSchema,
  updateBotSchema,
  botIdParamSchema,
  botLogQuerySchema,
} from '@tradegrid/validation';

export class BotController {
  constructor(private readonly botService: BotService) {}

  listBots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as any;
      const bots = await this.botService.listBots(status);
      sendSuccess(res, { bots }, 'Bots retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  createBot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedInput = createBotSchema.parse(req.body);
      const bot = await this.botService.createBot(parsedInput);
      sendSuccess(res, { bot }, 'Bot registered successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  getBot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = botIdParamSchema.parse(req.params);
      const bot = await this.botService.getBotById(id);
      sendSuccess(res, { bot }, 'Bot retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  updateBot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = botIdParamSchema.parse(req.params);
      const parsedInput = updateBotSchema.parse(req.body);
      const bot = await this.botService.updateBot(id, parsedInput);
      sendSuccess(res, { bot }, 'Bot updated successfully');
    } catch (err) {
      next(err);
    }
  };

  enableBot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = botIdParamSchema.parse(req.params);
      const bot = await this.botService.enableBot(id);
      sendSuccess(res, { bot }, 'Bot enabled successfully');
    } catch (err) {
      next(err);
    }
  };

  disableBot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = botIdParamSchema.parse(req.params);
      const bot = await this.botService.disableBot(id);
      sendSuccess(res, { bot }, 'Bot disabled successfully');
    } catch (err) {
      next(err);
    }
  };

  killBot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = botIdParamSchema.parse(req.params);
      const bot = await this.botService.killBot(id);
      sendSuccess(res, { bot }, 'Bot emergency kill switch activated successfully');
    } catch (err) {
      next(err);
    }
  };

  killAll = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.botService.killAllBots();
      sendSuccess(res, result, `Emergency global kill switch executed: ${result.killedCount} bots killed`);
    } catch (err) {
      next(err);
    }
  };

  getBotLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = botIdParamSchema.parse(req.params);
      const query = botLogQuerySchema.parse(req.query);
      const offset = (query.page - 1) * query.limit;

      const { logs, total } = await this.botService.getBotLogs(id, {
        limit: query.limit,
        offset,
        status: query.status,
        action: query.action,
      });

      sendSuccess(
        res,
        {
          logs,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit) || 1,
          },
        },
        'Bot execution logs retrieved successfully'
      );
    } catch (err) {
      next(err);
    }
  };

  getBotMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = botIdParamSchema.parse(req.params);
      const metrics = await this.botService.getBotMetrics(id);
      sendSuccess(res, { metrics }, 'Bot metrics retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  getSystemMetrics = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metrics = await this.botService.getSystemMetrics();
      sendSuccess(res, { metrics }, 'System bot metrics retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}
