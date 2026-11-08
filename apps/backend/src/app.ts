import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { logger } from './utils/logger';
import { sendSuccess, sendError } from './utils/response';
import { errorHandler } from './middleware/error.middleware';
import { checkDatabaseConnection } from './database/connection';

// Module Routers and Factories
import { authRouter as defaultAuthRouter, createAuthRouter } from './modules/auth/auth.router';
import { usersRouter as defaultUsersRouter, createUsersRouter } from './modules/users/users.router';
import {
  walletRouter as defaultWalletRouter,
  createWalletRouter,
  adminWalletRouter as defaultAdminWalletRouter,
  createAdminWalletRouter,
  WalletController,
} from './modules/wallet';
import { AuthController } from './modules/auth/auth.controller';
import { UsersController } from './modules/users/users.controller';
import {
  instrumentRouter as defaultInstrumentRouter,
  createInstrumentRouter,
  marketRouter as defaultMarketRouter,
  createMarketRouter,
  adminInstrumentRouter as defaultAdminInstrumentRouter,
  createAdminInstrumentRouter,
  InstrumentController,
  MarketDataController,
} from './modules/market';
import {
  orderRouter as defaultOrderRouter,
  createOrderRouter,
  OrderController,
} from './modules/orders';
import {
  tradeRouter as defaultTradeRouter,
  createTradeRouter,
  TradeController,
} from './modules/trading';
import {
  portfolioRouter as defaultPortfolioRouter,
  createPortfolioRouter,
  PortfolioController,
} from './modules/portfolio';
import {
  botRouter as defaultBotRouter,
  createBotRouter,
  BotController,
} from './modules/bots';
import { watchlistRouter } from './modules/watchlist';
import {
  newsRouter as defaultNewsRouter,
  adminNewsRouter as defaultAdminNewsRouter,
  createNewsRouter,
  createAdminNewsRouter,
  NewsController,
} from './modules/news';
import {
  competitionsRouter as defaultCompetitionsRouter,
  createCompetitionsRouter,
  CompetitionController,
} from './modules/competitions';
import {
  chatRouter as defaultChatRouter,
  adminChatRouter as defaultAdminChatRouter,
  createChatRouter,
  createAdminChatRouter,
  ChatController,
} from './modules/chat';
import {
  researchRouter as defaultResearchRouter,
  createResearchRouter,
  ResearchController,
} from './modules/research';
import {
  chartingRouter as defaultChartingRouter,
  createChartingRouter,
  ChartingController,
} from './modules/charting';
import {
  achievementRouter as defaultAchievementRouter,
  createAchievementRouter,
  AchievementController,
} from './modules/achievements';
import { adminRouter } from './modules/admin';

export interface AppDependencies {
  authController?: AuthController;
  usersController?: UsersController;
  walletController?: WalletController;
  instrumentController?: InstrumentController;
  marketDataController?: MarketDataController;
  orderController?: OrderController;
  tradeController?: TradeController;
  portfolioController?: PortfolioController;
  botController?: BotController;
  newsController?: NewsController;
  competitionController?: CompetitionController;
  chatController?: ChatController;
  researchController?: ResearchController;
  chartingController?: ChartingController;
  achievementController?: AchievementController;
  customCheckDb?: () => Promise<boolean>;
}

export function createApp(dependencies: AppDependencies = {}): Application {
  const app: Application = express();

  // 1. Security Headers
  app.use(helmet());

  // 2. CORS configuration
  app.use(
    cors({
      origin: [config.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // 3. Body Parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. Request Logging Middleware (disabled in test to keep test logs quiet)
  if (config.NODE_ENV !== 'test') {
    app.use((req: Request, _res: Response, next) => {
      logger.debug(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  // 5. Health Check Endpoint
  app.get('/api/v1/health', async (_req: Request, res: Response) => {
    const isDbConnected = dependencies.customCheckDb
      ? await dependencies.customCheckDb()
      : await checkDatabaseConnection();
    const statusCode = isDbConnected ? 200 : 503;

    sendSuccess(
      res,
      {
        status: isDbConnected ? 'ok' : 'degraded',
        service: 'tradegrid-backend',
        version: '1.0.0',
        uptime: process.uptime(),
        database: isDbConnected ? 'connected' : 'disconnected',
      },
      isDbConnected ? 'TRADEGRID exchange engine is operational' : 'Database connection unavailable',
      statusCode
    );
  });

  // 6. API Route Registration (using injected controllers or defaults)
  const activeAuthRouter = dependencies.authController
    ? createAuthRouter(dependencies.authController)
    : defaultAuthRouter;

  const activeUsersRouter = dependencies.usersController
    ? createUsersRouter(dependencies.usersController)
    : defaultUsersRouter;

  const activeWalletRouter = dependencies.walletController
    ? createWalletRouter(dependencies.walletController)
    : defaultWalletRouter;

  const activeAdminWalletRouter = dependencies.walletController
    ? createAdminWalletRouter(dependencies.walletController)
    : defaultAdminWalletRouter;

  const activeInstrumentRouter = dependencies.instrumentController
    ? createInstrumentRouter(dependencies.instrumentController)
    : defaultInstrumentRouter;

  const activeMarketRouter = dependencies.marketDataController
    ? createMarketRouter(dependencies.marketDataController)
    : defaultMarketRouter;

  const activeAdminInstrumentRouter = dependencies.instrumentController
    ? createAdminInstrumentRouter(dependencies.instrumentController)
    : defaultAdminInstrumentRouter;

  const activeOrderRouter = dependencies.orderController
    ? createOrderRouter(dependencies.orderController)
    : defaultOrderRouter;

  const activeTradeRouter = dependencies.tradeController
    ? createTradeRouter(dependencies.tradeController)
    : defaultTradeRouter;

  const activePortfolioRouter = dependencies.portfolioController
    ? createPortfolioRouter(dependencies.portfolioController)
    : defaultPortfolioRouter;

  const activeBotRouter = dependencies.botController
    ? createBotRouter(dependencies.botController)
    : defaultBotRouter;

  const activeNewsRouter = dependencies.newsController
    ? createNewsRouter(dependencies.newsController)
    : defaultNewsRouter;

  const activeAdminNewsRouter = dependencies.newsController
    ? createAdminNewsRouter(dependencies.newsController)
    : defaultAdminNewsRouter;

  const activeCompetitionsRouter = dependencies.competitionController
    ? createCompetitionsRouter(dependencies.competitionController)
    : defaultCompetitionsRouter;

  const activeChatRouter = dependencies.chatController
    ? createChatRouter(dependencies.chatController)
    : defaultChatRouter;

  const activeAdminChatRouter = dependencies.chatController
    ? createAdminChatRouter(dependencies.chatController)
    : defaultAdminChatRouter;

  const activeResearchRouter = dependencies.researchController
    ? createResearchRouter(dependencies.researchController)
    : defaultResearchRouter;

  const activeChartingRouter = dependencies.chartingController
    ? createChartingRouter(dependencies.chartingController)
    : defaultChartingRouter;

  const activeAchievementRouter = dependencies.achievementController
    ? createAchievementRouter(dependencies.achievementController)
    : defaultAchievementRouter;

  app.use('/api/v1/auth', activeAuthRouter);
  app.use('/api/v1/users', activeUsersRouter);
  app.use('/api/v1/wallet', activeWalletRouter);
  app.use('/api/v1/admin/wallets', activeAdminWalletRouter);
  app.use('/api/v1/instruments', activeInstrumentRouter);
  app.use('/api/v1/market', activeMarketRouter);
  app.use('/api/v1/admin/instruments', activeAdminInstrumentRouter);
  app.use('/api/v1/admin/bots', activeBotRouter);
  app.use('/api/v1/admin/news', activeAdminNewsRouter);
  app.use('/api/v1/orders', activeOrderRouter);
  app.use('/api/v1/trades', activeTradeRouter);
  app.use('/api/v1/trading', activeTradeRouter);
  app.use('/api/v1/portfolio', activePortfolioRouter);
  app.use('/api/v1/watchlist', watchlistRouter);
  app.use('/api/v1/news', activeNewsRouter);
  app.use('/api/v1/competitions', activeCompetitionsRouter);
  app.use('/api/v1/chat', activeChatRouter);
  app.use('/api/v1/admin/chat', activeAdminChatRouter);
  app.use('/api/v1/research', activeResearchRouter);
  app.use('/api/v1/charting', activeChartingRouter);
  app.use('/api/v1/achievements', activeAchievementRouter);
  app.use('/api/v1/admin', adminRouter);

  // 7. Catch-all 404 Route
  app.use((req: Request, res: Response) => {
    sendError(res, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`, 404);
  });

  // 8. Central Error Handling Middleware
  app.use(errorHandler);

  return app;
}
