import { Router } from 'express';
import { candleQuerySchema } from '@tradegrid/validation';
import {
  marketDataController as defaultMarketDataController,
  MarketDataController,
} from './market-data.controller';
import { validateQuery } from '../../middleware/validate.middleware';

export function createMarketRouter(
  controller: MarketDataController = defaultMarketDataController
): Router {
  const router = Router();

  // Quotes
  router.get('/quotes', controller.getQuotes);
  router.get('/quotes/:symbol', controller.getQuoteBySymbol);

  // Historical Candles (OHLCV)
  router.get('/candles/:symbol', validateQuery(candleQuerySchema), controller.getCandles);

  // Market Breadth & Ranking
  router.get('/gainers', controller.getGainers);
  router.get('/losers', controller.getLosers);
  router.get('/most-active', controller.getMostActive);
  router.get('/summary', controller.getSummary);

  // Phase 4B: Live Order Book & Public Trades
  router.get('/orderbook/:symbol', controller.getOrderBook);
  router.get('/trades/:symbol', controller.getRecentTrades);

  return router;
}

export const marketRouter = createMarketRouter();
