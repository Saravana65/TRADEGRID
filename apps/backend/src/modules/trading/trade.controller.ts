import { Request, Response } from 'express';
import { tradeService, TradeService } from './trade.service';
import { sendSuccess } from '../../utils/response';
import { tradeQuerySchema } from '@tradegrid/validation';

export class TradeController {
  constructor(private readonly service: TradeService = tradeService) {}

  getUserTrades = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user.id;
    const validatedQuery = tradeQuerySchema.parse(req.query);
    const result = await this.service.getUserTrades(userId, validatedQuery);
    sendSuccess(res, result, 'User trade executions retrieved successfully');
  };

  getRecentTrades = async (req: Request, res: Response): Promise<void> => {
    const symbol = req.params.symbol;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const trades = await this.service.getRecentTrades(symbol, limit);
    sendSuccess(res, { symbol: symbol.toUpperCase(), trades }, 'Recent trade executions retrieved');
  };

  getTradeById = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user.id;
    const tradeId = parseInt(req.params.id, 10);
    const trade = await this.service.getTradeById(tradeId, userId);
    sendSuccess(res, { trade }, 'Trade execution details retrieved');
  };
}

export const tradeController = new TradeController();
