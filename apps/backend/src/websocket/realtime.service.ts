import crypto from 'crypto';
import { Server } from 'socket.io';
import { logger } from '../utils/logger';
import {
  DataClassification,
  InstrumentStatus,
  MarketPriceUpdateEvent,
  MarketStatusEvent,
  Order,
  OrderBookDepthUpdateEvent,
  OrderBookLevel,
  OrderBookSnapshotEvent,
  OrderSide,
  Trade,
  TradeTapeUpdateEvent,
  PrivateTradeExecutedEvent,
  OrderLifecycleEvent,
  PortfolioUpdatedEvent,
  BotStatusEvent,
  BotOrderGeneratedEvent,
  BotExecutionEvent,
  BotRiskWarningEvent,
  NewsArticle,
  NewsPublishedEvent,
  NewsUpdatedEvent,
  NewsExpiredEvent,
  CatalystStartedEvent,
  CatalystUpdatedEvent,
  CatalystCompletedEvent,
  CompetitionStartedEvent,
  CompetitionEndedEvent,
  CompetitionParticipantJoinedEvent,
  CompetitionParticipantLeftEvent,
  CompetitionOrderPlacedEvent,
  CompetitionTradeExecutedEvent,
  CompetitionLeaderboardUpdatedEvent,
  CompetitionPortfolioUpdatedEvent,
  CompetitionCancelledEvent,
  ChatMessageNewEvent,
  ChatDirectMessageEvent,
  ChatMentionNewEvent,
  ChatNotificationNewEvent,
  ChatTypingEvent,
  ChatMessageReadEvent,
  AchievementUnlockedEvent,
} from '@tradegrid/shared-types';

export interface IRealtimeService {
  getNextSequence(symbol: string): number;
  getCurrentSequence(symbol: string): number;
  broadcastMarketPriceUpdate(params: {
    symbol: string;
    instrumentId: number;
    lastPrice: string;
    changeAmount: string;
    changePercent: string;
    volume: number;
    highPrice?: string;
    lowPrice?: string;
  }): void;
  broadcastMarketStatus(symbol: string | undefined, marketStatus: InstrumentStatus, reason?: string): void;
  broadcastOrderBookUpdate(
    symbol: string,
    instrumentId: number,
    depth: {
      bids: OrderBookLevel[];
      asks: OrderBookLevel[];
      spread: string;
      midPrice: string | null;
    }
  ): OrderBookDepthUpdateEvent;
  broadcastTradeExecution(params: {
    trade: Trade;
    symbol: string;
    dataClassification?: DataClassification;
    aggressorSide?: OrderSide;
  }): void;
  emitOrderAccepted(order: Order): void;
  emitOrderPartiallyFilled(order: Order, trade?: Trade): void;
  emitOrderFilled(order: Order, trade?: Trade): void;
  emitOrderCancelled(order: Order): void;
  emitOrderRejected(userId: number, reason: string, orderId?: number, idempotencyKey?: string): void;
  emitPortfolioUpdated(userId: number, summary?: any): void;
  emitBotStatus?(event: BotStatusEvent): void;
  emitBotOrderGenerated?(event: BotOrderGeneratedEvent): void;
  emitBotExecution?(event: BotExecutionEvent): void;
  emitBotRiskWarning?(event: BotRiskWarningEvent): void;
  emitNewsPublished(article: NewsArticle | NewsPublishedEvent): void;
  emitNewsUpdated(article: NewsArticle | NewsUpdatedEvent): void;
  emitNewsExpired(newsIdOrEvent: number | NewsExpiredEvent, catalystId?: number): void;
  emitCatalystStarted(articleOrEvent: any, catalyst?: any): void;
  emitCatalystUpdated(catalystIdOrEvent: number | CatalystUpdatedEvent, newsId?: number, effectiveImpact?: string, decayRemainingPercent?: number): void;
  emitCatalystCompleted(catalystIdOrEvent: number | CatalystCompletedEvent, newsId?: number): void;
  emitChatMessageNew?(event: ChatMessageNewEvent): void;
  emitChatDirectMessage?(event: ChatDirectMessageEvent): void;
  emitChatMentionNew?(event: ChatMentionNewEvent): void;
  emitChatNotificationNew?(event: ChatNotificationNewEvent): void;
  emitChatTypingUpdate?(event: ChatTypingEvent): void;
  emitChatMessageRead?(event: ChatMessageReadEvent): void;
  emitAchievementUnlocked?(event: AchievementUnlockedEvent): void;
  emitToUser(userId: number, event: string, data: any): void;
  getIO(): Server | null;
  setIO(io: Server): void;
}

export class RealtimeService implements IRealtimeService {
  private io: Server | null = null;
  private sequenceMap: Map<string, number> = new Map();
  private lastSnapshots: Map<string, OrderBookSnapshotEvent> = new Map();

  constructor(ioServer?: Server) {
    if (ioServer) {
      this.io = ioServer;
    }
  }

  setIO(ioServer: Server): void {
    this.io = ioServer;
  }

  getIO(): Server | null {
    return this.io;
  }

  /**
   * Generates next monotonically increasing sequence number per symbol.
   */
  getNextSequence(symbol: string): number {
    const key = symbol.toUpperCase();
    const curr = this.sequenceMap.get(key) || 0;
    const next = curr + 1;
    this.sequenceMap.set(key, next);
    return next;
  }

  /**
   * Retrieves current sequence number for a symbol.
   */
  getCurrentSequence(symbol: string): number {
    return this.sequenceMap.get(symbol.toUpperCase()) || 0;
  }

  /**
   * Retrieves the latest cached snapshot for an instrument symbol.
   */
  getLastSnapshot(symbol: string): OrderBookSnapshotEvent | undefined {
    return this.lastSnapshots.get(symbol.toUpperCase());
  }

  /**
   * Broadcasts public market price and 24h ticker metrics to room market:{symbol}.
   */
  broadcastMarketPriceUpdate(params: {
    symbol: string;
    instrumentId: number;
    lastPrice: string;
    changeAmount: string;
    changePercent: string;
    volume: number;
    highPrice?: string;
    lowPrice?: string;
  }): void {
    try {
      if (!this.io) return;
      const normSymbol = params.symbol.toUpperCase();
      const sequence = this.getNextSequence(`PRICE_${normSymbol}`);
      const event: MarketPriceUpdateEvent = {
        eventId: crypto.randomUUID(),
        symbol: normSymbol,
        instrumentId: params.instrumentId,
        lastPrice: params.lastPrice,
        changeAmount: params.changeAmount,
        changePercent: params.changePercent,
        volume: params.volume,
        highPrice: params.highPrice || params.lastPrice,
        lowPrice: params.lowPrice || params.lastPrice,
        sequence,
        timestamp: new Date().toISOString(),
      };

      this.io.to(`market:${normSymbol}`).emit('market:price_update', event);
      this.io.to(`market:${normSymbol}`).emit('market:quote', event);
      logger.debug(`[WS] Broadcast market:price_update on market:${normSymbol} seq #${sequence}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to broadcast market price update: ${err.message}`);
    }
  }

  /**
   * Broadcasts market status (ACTIVE, HALTED, SUSPENDED) to market room.
   */
  broadcastMarketStatus(symbol: string | undefined, marketStatus: InstrumentStatus, reason?: string): void {
    try {
      if (!this.io) return;
      const event: MarketStatusEvent = {
        eventId: crypto.randomUUID(),
        symbol: symbol?.toUpperCase(),
        marketStatus,
        reason,
        timestamp: new Date().toISOString(),
      };

      if (symbol) {
        const normSymbol = symbol.toUpperCase();
        this.io.to(`market:${normSymbol}`).emit('market:status', event);
      } else {
        this.io.emit('market:status', event);
      }
      logger.info(`[WS] Broadcast market:status ${marketStatus} for ${symbol || 'ALL'}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to broadcast market status: ${err.message}`);
    }
  }

  /**
   * Broadcasts Level-2 order book depth incremental updates to orderbook:{symbol}.
   */
  broadcastOrderBookUpdate(
    symbol: string,
    instrumentId: number,
    depth: {
      bids: OrderBookLevel[];
      asks: OrderBookLevel[];
      spread: string;
      midPrice: string | null;
    }
  ): OrderBookDepthUpdateEvent {
    const normSymbol = symbol.toUpperCase();
    const prevSequence = this.getCurrentSequence(normSymbol);
    const sequence = this.getNextSequence(normSymbol);
    const timestamp = new Date().toISOString();

    const depthEvent: OrderBookDepthUpdateEvent = {
      eventId: crypto.randomUUID(),
      symbol: normSymbol,
      instrumentId,
      bids: depth.bids,
      asks: depth.asks,
      spread: depth.spread,
      midPrice: depth.midPrice,
      sequence,
      prevSequence,
      timestamp,
    };

    // Cache as snapshot for fast client recovery
    this.lastSnapshots.set(normSymbol, {
      eventId: crypto.randomUUID(),
      symbol: normSymbol,
      instrumentId,
      bids: depth.bids,
      asks: depth.asks,
      spread: depth.spread,
      midPrice: depth.midPrice,
      sequence,
      timestamp,
    });

    try {
      if (this.io) {
        this.io.to(`orderbook:${normSymbol}`).emit('orderbook:depth_update', depthEvent);
        logger.debug(
          `[WS] Broadcast orderbook:depth_update on orderbook:${normSymbol} seq #${sequence} (prev #${prevSequence})`
        );
      }
    } catch (err: any) {
      logger.error(`[WS] Failed to broadcast orderbook depth update: ${err.message}`);
    }

    return depthEvent;
  }

  /**
   * Broadcasts a committed trade execution:
   * 1. Public trade tape update to trades:{symbol}
   * 2. Private trade confirmation to user:{buyerId} and user:{sellerId}
   */
  broadcastTradeExecution(params: {
    trade: Trade;
    symbol: string;
    dataClassification?: DataClassification;
    aggressorSide?: OrderSide;
  }): void {
    const { trade, symbol, dataClassification = 'SIMULATED', aggressorSide } = params;
    const normSymbol = symbol.toUpperCase();
    const eventId = crypto.randomUUID();
    const executedAt = trade.createdAt || new Date().toISOString();

    try {
      if (!this.io) return;

      // 1. Public Trade Tape Update
      const tapeEvent: TradeTapeUpdateEvent = {
        eventId,
        tradeId: trade.id,
        tradeReference: trade.tradeReference,
        symbol: normSymbol,
        instrumentId: trade.instrumentId,
        price: trade.price,
        quantity: trade.quantity,
        tradeAmount: trade.tradeAmount,
        aggressorSide,
        dataClassification,
        executedAt,
      };

      this.io.to(`trades:${normSymbol}`).emit('trade:tape_update', tapeEvent);
      logger.debug(`[WS] Broadcast trade:tape_update on trades:${normSymbol} for Trade #${trade.id}`);

      // 2. Private Trade Executed Event to Buyer
      const buyerEvent: PrivateTradeExecutedEvent = {
        ...tapeEvent,
        buyOrderId: trade.buyOrderId,
        sellOrderId: trade.sellOrderId,
        buyerId: trade.buyerId,
        sellerId: trade.sellerId,
        role: 'BUYER',
      };
      this.io.to(`user:${trade.buyerId}`).emit('trade:executed', buyerEvent);

      // 3. Private Trade Executed Event to Seller
      const sellerEvent: PrivateTradeExecutedEvent = {
        ...tapeEvent,
        buyOrderId: trade.buyOrderId,
        sellOrderId: trade.sellOrderId,
        buyerId: trade.buyerId,
        sellerId: trade.sellerId,
        role: 'SELLER',
      };
      this.io.to(`user:${trade.sellerId}`).emit('trade:executed', sellerEvent);
    } catch (err: any) {
      logger.error(`[WS] Failed to broadcast trade execution: ${err.message}`);
    }
  }

  /**
   * Emits private order accepted event to user:{userId}.
   */
  emitOrderAccepted(order: Order): void {
    try {
      if (!this.io) return;
      const event: OrderLifecycleEvent = {
        eventId: crypto.randomUUID(),
        order,
        timestamp: new Date().toISOString(),
      };
      this.io.to(`user:${order.userId}`).emit('order:accepted', event);
      logger.debug(`[WS] Emitted order:accepted to user:${order.userId} for Order #${order.id}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit order accepted: ${err.message}`);
    }
  }

  /**
   * Emits private order partially filled event to user:{userId}.
   */
  emitOrderPartiallyFilled(order: Order, trade?: Trade): void {
    try {
      if (!this.io) return;
      const event: OrderLifecycleEvent = {
        eventId: crypto.randomUUID(),
        order,
        trade,
        timestamp: new Date().toISOString(),
      };
      this.io.to(`user:${order.userId}`).emit('order:partially_filled', event);
      logger.debug(`[WS] Emitted order:partially_filled to user:${order.userId} for Order #${order.id}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit order partially filled: ${err.message}`);
    }
  }

  /**
   * Emits private order filled event to user:{userId}.
   */
  emitOrderFilled(order: Order, trade?: Trade): void {
    try {
      if (!this.io) return;
      const event: OrderLifecycleEvent = {
        eventId: crypto.randomUUID(),
        order,
        trade,
        timestamp: new Date().toISOString(),
      };
      this.io.to(`user:${order.userId}`).emit('order:filled', event);
      logger.debug(`[WS] Emitted order:filled to user:${order.userId} for Order #${order.id}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit order filled: ${err.message}`);
    }
  }

  /**
   * Emits private order cancelled event to user:{userId}.
   */
  emitOrderCancelled(order: Order): void {
    try {
      if (!this.io) return;
      const event: OrderLifecycleEvent = {
        eventId: crypto.randomUUID(),
        order,
        timestamp: new Date().toISOString(),
      };
      this.io.to(`user:${order.userId}`).emit('order:cancelled', event);
      logger.debug(`[WS] Emitted order:cancelled to user:${order.userId} for Order #${order.id}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit order cancelled: ${err.message}`);
    }
  }

  /**
   * Emits private order rejected event to user:{userId}.
   */
  emitOrderRejected(userId: number, reason: string, orderId?: number, idempotencyKey?: string): void {
    try {
      if (!this.io) return;
      const event = {
        eventId: crypto.randomUUID(),
        userId,
        orderId,
        reason,
        idempotencyKey,
        timestamp: new Date().toISOString(),
      };
      this.io.to(`user:${userId}`).emit('order:rejected', event);
      logger.debug(`[WS] Emitted order:rejected to user:${userId}: ${reason}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit order rejected: ${err.message}`);
    }
  }

  /**
   * Emits portfolio updated signal to user:{userId}.
   */
  emitPortfolioUpdated(userId: number, summary?: any): void {
    try {
      if (!this.io) return;
      const event: PortfolioUpdatedEvent = {
        eventId: crypto.randomUUID(),
        userId,
        cashBalance: summary?.cashBalance || '0.0000',
        totalPortfolioValue: summary?.totalPortfolioValue || '0.0000',
        totalInvested: summary?.totalInvested || '0.0000',
        totalUnrealizedPnL: summary?.totalUnrealizedPnL || '0.0000',
        totalRealizedPnL: summary?.totalRealizedPnL || '0.0000',
        timestamp: new Date().toISOString(),
      };
      this.io.to(`user:${userId}`).emit('portfolio:updated', event);
      logger.debug(`[WS] Emitted portfolio:updated to user:${userId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit portfolio updated: ${err.message}`);
    }
  }

  /**
   * Emits bot status changes to the administrative bot room admin:bots.
   */
  emitBotStatus(event: BotStatusEvent): void {
    try {
      if (!this.io) return;
      this.io.to('admin:bots').emit('bot:status', event);
      logger.debug(`[WS] Emitted bot:status to admin:bots for Bot #${event.botId} (${event.status})`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit bot status: ${err.message}`);
    }
  }

  /**
   * Emits bot order generation events to admin:bots.
   */
  emitBotOrderGenerated(event: BotOrderGeneratedEvent): void {
    try {
      if (!this.io) return;
      this.io.to('admin:bots').emit('bot:order_generated', event);
      logger.debug(`[WS] Emitted bot:order_generated to admin:bots for Bot #${event.botId}: Order #${event.orderId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit bot order generated: ${err.message}`);
    }
  }

  /**
   * Emits bot execution events to admin:bots.
   */
  emitBotExecution(event: BotExecutionEvent): void {
    try {
      if (!this.io) return;
      this.io.to('admin:bots').emit('bot:execution', event);
      logger.debug(`[WS] Emitted bot:execution to admin:bots for Bot #${event.botId}: Trade #${event.tradeId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit bot execution: ${err.message}`);
    }
  }

  /**
   * Emits bot risk warnings and circuit breakers to admin:bots.
   */
  /**
   * Emits news published event to news and admin:news channels.
   */
  emitNewsPublished(article: NewsArticle | NewsPublishedEvent): void {
    try {
      if (!this.io) return;
      const event: NewsPublishedEvent = 'eventId' in article ? article : {
        eventId: crypto.randomUUID(),
        newsId: article.id,
        headline: article.headline,
        summary: article.summary,
        category: article.category,
        impactDirection: article.impactDirection,
        severity: article.severity,
        targetScope: article.targetScope,
        targetSymbol: article.targetSymbol || null,
        targetSector: article.targetSector || null,
        isSimulated: article.isSimulated,
        publishedAt: article.publishedAt || new Date().toISOString(),
        expiresAt: article.expiresAt || null,
        timestamp: new Date().toISOString(),
      };
      this.io.to('news').to('admin:news').emit('news:published', event);
      logger.debug(`[WS] Emitted news:published to news/admin:news for News #${event.newsId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit news published: ${err.message}`);
    }
  }

  /**
   * Emits news updated/cancelled event to news and admin:news channels.
   */
  emitNewsUpdated(article: NewsArticle | NewsUpdatedEvent): void {
    try {
      if (!this.io) return;
      const event: NewsUpdatedEvent = 'eventId' in article ? article : {
        eventId: crypto.randomUUID(),
        newsId: article.id,
        status: article.status,
        headline: article.headline,
        updatedAt: article.updatedAt || new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };
      this.io.to('news').to('admin:news').emit('news:updated', event);
      logger.debug(`[WS] Emitted news:updated to news/admin:news for News #${event.newsId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit news updated: ${err.message}`);
    }
  }

  /**
   * Emits news expired event to news and admin:news channels.
   */
  emitNewsExpired(newsIdOrEvent: number | NewsExpiredEvent, catalystId?: number): void {
    try {
      if (!this.io) return;
      const event: NewsExpiredEvent = typeof newsIdOrEvent === 'object' ? newsIdOrEvent : {
        eventId: crypto.randomUUID(),
        newsId: newsIdOrEvent,
        catalystId,
        expiredAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };
      this.io.to('news').to('admin:news').emit('news:expired', event);
      logger.debug(`[WS] Emitted news:expired to news/admin:news for News #${event.newsId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit news expired: ${err.message}`);
    }
  }

  /**
   * Emits catalyst started event to news and admin:news channels.
   */
  emitCatalystStarted(articleOrEvent: any, catalyst?: any): void {
    try {
      if (!this.io) return;
      const event: CatalystStartedEvent = 'eventId' in articleOrEvent ? articleOrEvent : {
        eventId: crypto.randomUUID(),
        catalystId: catalyst?.id || 0,
        newsId: articleOrEvent.id,
        headline: articleOrEvent.headline,
        targetScope: articleOrEvent.target_scope || articleOrEvent.targetScope,
        targetSymbol: articleOrEvent.target_symbol || articleOrEvent.targetSymbol || null,
        targetSector: articleOrEvent.target_sector || articleOrEvent.targetSector || null,
        sentimentScore: catalyst?.sentiment_score || catalyst?.sentimentScore || '0.00',
        volatilityFactor: catalyst?.volatility_factor || catalyst?.volatilityFactor || '1.00',
        durationSeconds: catalyst?.duration_seconds || catalyst?.durationSeconds || 300,
        timestamp: new Date().toISOString(),
      };
      this.io.to('news').to('admin:news').emit('news:catalyst:started', event);
      logger.debug(`[WS] Emitted news:catalyst:started for Catalyst #${event.catalystId} (News #${event.newsId})`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit catalyst started: ${err.message}`);
    }
  }

  /**
   * Emits catalyst updated (decay progress) to news and admin:news channels.
   */
  emitCatalystUpdated(
    catalystIdOrEvent: number | CatalystUpdatedEvent,
    newsId?: number,
    effectiveImpact?: string,
    decayRemainingPercent?: number
  ): void {
    try {
      if (!this.io) return;
      const event: CatalystUpdatedEvent = typeof catalystIdOrEvent === 'object' ? catalystIdOrEvent : {
        eventId: crypto.randomUUID(),
        catalystId: catalystIdOrEvent,
        newsId: newsId || 0,
        effectiveImpact: effectiveImpact || '0.0000',
        decayRemainingPercent: decayRemainingPercent ?? 100,
        timestamp: new Date().toISOString(),
      };
      this.io.to('news').to('admin:news').emit('news:catalyst:updated', event);
      logger.debug(`[WS] Emitted news:catalyst:updated for Catalyst #${event.catalystId}: impact=${event.effectiveImpact}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit catalyst updated: ${err.message}`);
    }
  }

  /**
   * Emits catalyst completed event to news and admin:news channels.
   */
  emitCatalystCompleted(catalystIdOrEvent: number | CatalystCompletedEvent, newsId?: number): void {
    try {
      if (!this.io) return;
      const event: CatalystCompletedEvent = typeof catalystIdOrEvent === 'object' ? catalystIdOrEvent : {
        eventId: crypto.randomUUID(),
        catalystId: catalystIdOrEvent,
        newsId: newsId || 0,
        completedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };
      this.io.to('news').to('admin:news').emit('news:catalyst:completed', event);
      logger.debug(`[WS] Emitted news:catalyst:completed for Catalyst #${event.catalystId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit catalyst completed: ${err.message}`);
    }
  }

  // ==========================================================================
  // Phase 5D: Competition Real-Time Events
  // ==========================================================================

  emitCompetitionStarted(event: CompetitionStartedEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`competition:${event.competitionId}`).to('competitions').emit('competition:started', event);
      logger.debug(`[WS] Emitted competition:started for Competition #${event.competitionId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit competition:started: ${err.message}`);
    }
  }

  emitCompetitionEnded(event: CompetitionEndedEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`competition:${event.competitionId}`).to('competitions').emit('competition:ended', event);
      logger.debug(`[WS] Emitted competition:ended for Competition #${event.competitionId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit competition:ended: ${err.message}`);
    }
  }

  emitCompetitionParticipantJoined(event: CompetitionParticipantJoinedEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`competition:${event.competitionId}`).emit('competition:participant_joined', event);
      logger.debug(`[WS] Emitted competition:participant_joined for User #${event.userId} in Comp #${event.competitionId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit competition:participant_joined: ${err.message}`);
    }
  }

  emitCompetitionParticipantLeft(event: CompetitionParticipantLeftEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`competition:${event.competitionId}`).emit('competition:participant_left', event);
      logger.debug(`[WS] Emitted competition:participant_left for User #${event.userId} in Comp #${event.competitionId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit competition:participant_left: ${err.message}`);
    }
  }

  emitCompetitionOrderPlaced(event: CompetitionOrderPlacedEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`competition:${event.competitionId}`).emit('competition:order_placed', event);
      this.io.to(`user:${event.userId}`).emit('competition:order_placed', event);
      logger.debug(`[WS] Emitted competition:order_placed for Order #${event.orderId} in Comp #${event.competitionId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit competition:order_placed: ${err.message}`);
    }
  }

  emitCompetitionTradeExecuted(event: CompetitionTradeExecutedEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`competition:${event.competitionId}`).emit('competition:trade_executed', event);
      this.io.to(`user:${event.buyerId}`).emit('competition:trade_executed', event);
      this.io.to(`user:${event.sellerId}`).emit('competition:trade_executed', event);
      logger.debug(`[WS] Emitted competition:trade_executed (${event.tradeReference}) in Comp #${event.competitionId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit competition:trade_executed: ${err.message}`);
    }
  }

  emitCompetitionLeaderboardUpdated(event: CompetitionLeaderboardUpdatedEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`competition:${event.competitionId}`).emit('competition:leaderboard_updated', event);
      logger.debug(`[WS] Emitted competition:leaderboard_updated for Comp #${event.competitionId} (${event.leaderboard.length} entries)`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit competition:leaderboard_updated: ${err.message}`);
    }
  }

  emitCompetitionPortfolioUpdated(event: CompetitionPortfolioUpdatedEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`user:${event.userId}`).emit('competition:portfolio_updated', event);
      logger.debug(`[WS] Emitted competition:portfolio_updated to user:${event.userId} for Comp #${event.competitionId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit competition:portfolio_updated: ${err.message}`);
    }
  }

  emitCompetitionCancelled(event: CompetitionCancelledEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`competition:${event.competitionId}`).emit('competition:cancelled', event);
      logger.debug(`[WS] Emitted competition:cancelled for Comp #${event.competitionId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit competition:cancelled: ${err.message}`);
    }
  }

  // ==========================================================================
  // Phase 5E: Real-Time Chat & Direct Messaging
  // ==========================================================================

  emitChatMessageNew(event: ChatMessageNewEvent): void {
    try {
      if (!this.io) return;
      const channel = event.roomSlug === 'global' ? 'chat:global' : `chat:symbol:${event.roomSlug.replace(/^symbol-/, '').toUpperCase()}`;
      this.io.to(channel).emit('chat:message:new', event);
      // Also broadcast to room slug channel if clients subscribed via chat:room:slug
      this.io.to(`chat:room:${event.roomSlug}`).emit('chat:message:new', event);
      logger.debug(`[WS] Emitted chat:message:new on ${channel} for Msg #${event.message.id}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit chat:message:new: ${err.message}`);
    }
  }

  emitChatDirectMessage(event: ChatDirectMessageEvent): void {
    try {
      if (!this.io) return;
      const channel = `chat:conversation:${event.conversationId}`;
      this.io.to(channel).emit('chat:direct:new', event);
      logger.debug(`[WS] Emitted chat:direct:new on ${channel} for Msg #${event.message.id}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit chat:direct:new: ${err.message}`);
    }
  }

  emitChatMentionNew(event: ChatMentionNewEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`user:${event.notification.userId}`).emit('chat:mention:new', event);
      logger.debug(`[WS] Emitted chat:mention:new to user:${event.notification.userId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit chat:mention:new: ${err.message}`);
    }
  }

  emitChatNotificationNew(event: ChatNotificationNewEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`user:${event.notification.userId}`).emit('chat:notification:new', event);
      logger.debug(`[WS] Emitted chat:notification:new to user:${event.notification.userId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit chat:notification:new: ${err.message}`);
    }
  }

  emitChatTypingUpdate(event: ChatTypingEvent): void {
    try {
      if (!this.io) return;
      if (event.conversationId) {
        this.io.to(`chat:conversation:${event.conversationId}`).emit('chat:typing:update', event);
      } else if (event.roomId) {
        this.io.to(`chat:room:${event.roomId}`).emit('chat:typing:update', event);
      }
    } catch (err: any) {
      logger.error(`[WS] Failed to emit chat:typing:update: ${err.message}`);
    }
  }

  emitChatMessageRead(event: ChatMessageReadEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`chat:conversation:${event.conversationId}`).emit('chat:message:read', event);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit chat:message:read: ${err.message}`);
    }
  }

  emitAchievementUnlocked(event: AchievementUnlockedEvent): void {
    try {
      if (!this.io) return;
      this.io.to(`user:${event.userId}`).emit('achievement:unlocked', event);
      logger.info(`[WS] Emitted achievement:unlocked (${event.achievement.code}) to user:${event.userId}`);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit achievement:unlocked: ${err.message}`);
    }
  }

  emitToUser(userId: number, event: string, data: any): void {
    try {
      if (!this.io) return;
      this.io.to(`user:${userId}`).emit(event, data);
    } catch (err: any) {
      logger.error(`[WS] Failed to emit ${event} to user:${userId}: ${err.message}`);
    }
  }
}

export const realtimeService = new RealtimeService();
