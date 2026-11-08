import { Request, Response, NextFunction } from 'express';
import { marketDataService, MarketDataService } from './market-data.service';
import { sendSuccess } from '../../utils/response';
import { DataClassification } from '@tradegrid/shared-types';

export class MarketDataController {
  constructor(private readonly service: MarketDataService = marketDataService) {}

  getQuotes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const classification = req.query.classification as DataClassification | undefined;
      const quotes = await this.service.getAllQuotes(classification);
      sendSuccess(res, { quotes }, 'Market quotes retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  getQuoteBySymbol = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { symbol } = req.params;
      const quote = await this.service.getQuoteBySymbol(symbol);
      sendSuccess(res, { quote }, `Quote for ${symbol.toUpperCase()} retrieved successfully`, 200);
    } catch (error) {
      next(error);
    }
  };

  getCandles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { symbol } = req.params;
      const query = req.query as any;
      const result = await this.service.getCandles(symbol, query);
      sendSuccess(
        res,
        result,
        `Historical candles for ${symbol.toUpperCase()} (${result.interval}) retrieved successfully`,
        200
      );
    } catch (error) {
      next(error);
    }
  };

  getGainers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 5;
      const classification = req.query.classification as DataClassification | undefined;
      const gainers = await this.service.getTopGainers(limit, classification);
      sendSuccess(res, { gainers }, 'Top gainers retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  getLosers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 5;
      const classification = req.query.classification as DataClassification | undefined;
      const losers = await this.service.getTopLosers(limit, classification);
      sendSuccess(res, { losers }, 'Top losers retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  getMostActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 5;
      const classification = req.query.classification as DataClassification | undefined;
      const mostActive = await this.service.getMostActive(limit, classification);
      sendSuccess(res, { mostActive }, 'Most active instruments retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  getSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await this.service.getMarketSummary();
      sendSuccess(res, { summary }, 'Market summary overview retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  getOrderBook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { symbol } = req.params;
      const depth = req.query.depth ? parseInt(String(req.query.depth), 10) : 10;
      const orderBook = await this.service.getOrderBook(symbol, depth);
      sendSuccess(res, { orderBook }, `Order book for ${symbol.toUpperCase()} retrieved successfully`, 200);
    } catch (error) {
      next(error);
    }
  };

  getRecentTrades = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { symbol } = req.params;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const trades = await this.service.getRecentTrades(symbol, limit);
      sendSuccess(res, { symbol: symbol.toUpperCase(), trades }, `Recent trades for ${symbol.toUpperCase()} retrieved`, 200);
    } catch (error) {
      next(error);
    }
  };

  getProviderHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = this.service.getProviderRegistryStatus();
      sendSuccess(res, status, 'Market data provider health status retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };
}

export const marketDataController = new MarketDataController();
