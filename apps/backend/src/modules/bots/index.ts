import { botRepository } from './bot.repository';
import { userRepository } from '../users/user.repository';
import { walletService } from '../wallet/wallet.service';
import { walletRepository } from '../wallet/wallet.repository';
import { positionRepository } from '../portfolio/position.repository';
import { instrumentRepository } from '../market/instrument.repository';
import { marketDataRepository } from '../market/market-data.repository';
import { orderRepository } from '../orders/order.repository';
import { orderService } from '../orders/order.service';
import { realtimeService } from '../../websocket/realtime.service';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { createBotRouter } from './bot.router';

export * from './bot.types';
export * from './bot.repository';
export * from './bot.service';
export * from './bot.engine';
export * from './bot.scheduler';
export * from './bot.controller';
export * from './bot.router';
export * from './risk/bot-risk.service';
export * from './strategies/base-bot.strategy';
export * from './strategies/market-maker.strategy';
export * from './strategies/liquidity-generator.strategy';

export const botService = new BotService(
  botRepository,
  userRepository,
  walletService,
  walletRepository,
  positionRepository,
  instrumentRepository,
  marketDataRepository,
  orderRepository,
  orderService,
  realtimeService
);

export const botController = new BotController(botService);
export const botRouter = createBotRouter(botController);
