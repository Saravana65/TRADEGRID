import { logger } from '../../utils/logger';
import { FinancialMath } from '../../utils/math';
import { OrderService, orderService as defaultOrderService } from '../orders/order.service';
import { IOrderRepository, orderRepository as defaultOrderRepo } from '../orders/order.repository';
import { IWalletRepository, walletRepository as defaultWalletRepo } from '../wallet/wallet.repository';
import { IPositionRepository, positionRepository as defaultPositionRepo } from '../portfolio/position.repository';
import { IInstrumentRepository, instrumentRepository as defaultInstrumentRepo } from '../market/instrument.repository';
import { IMarketDataRepository, marketDataRepository as defaultMarketDataRepo } from '../market/market-data.repository';
import { IBotRepository, botRepository as defaultBotRepo } from './bot.repository';
import { BotRiskService, botRiskService as defaultRiskService } from './risk/bot-risk.service';
import { MarketMakerStrategy } from './strategies/market-maker.strategy';
import { RandomizedLiquidityGeneratorStrategy } from './strategies/liquidity-generator.strategy';
import { IRealtimeService, realtimeService as defaultRealtimeService } from '../../websocket/realtime.service';
import { BotRecord, BotConfigurationRecord, DesiredQuote } from './bot.types';

export class BotEngine {
  constructor(
    private readonly botRepo: IBotRepository = defaultBotRepo,
    private readonly orderRepo: IOrderRepository = defaultOrderRepo,
    private readonly orderService: OrderService = defaultOrderService,
    private readonly walletRepo: IWalletRepository = defaultWalletRepo,
    private readonly positionRepo: IPositionRepository = defaultPositionRepo,
    private readonly instrumentRepo: IInstrumentRepository = defaultInstrumentRepo,
    private readonly marketDataRepo: IMarketDataRepository = defaultMarketDataRepo,
    private readonly riskService: BotRiskService = defaultRiskService,
    private readonly realtimeService: IRealtimeService = defaultRealtimeService
  ) {}

  /**
   * Executes a single deterministic quote evaluation and refresh cycle for a bot on an instrument.
   */
  async executeCycle(
    bot: BotRecord,
    config: BotConfigurationRecord,
    instrumentId: number
  ): Promise<{ success: boolean; reason?: string }> {
    // 1. Bot Status Guard
    if (bot.status !== 'ACTIVE') {
      return { success: false, reason: `Bot #${bot.id} is not ACTIVE (status: ${bot.status})` };
    }

    // 2. Instrument Tradability Guard
    const instrument = await this.instrumentRepo.findById(instrumentId);
    if (!instrument || instrument.marketStatus !== 'ACTIVE') {
      const reason = `Instrument #${instrumentId} (${instrument?.symbol || 'UNKNOWN'}) is not tradable (Status: ${instrument?.marketStatus})`;
      await this.botRepo.createLog({
        bot_id: bot.id,
        instrument_id: instrumentId,
        action: 'RISK_REJECTED',
        details: reason,
        status: 'WARNING',
      });
      return { success: false, reason };
    }

    // 3. Reference Price Retrieval & Stale Check
    const quoteRecord = await this.marketDataRepo.getQuoteByInstrumentId(instrumentId);
    let referencePrice = quoteRecord?.lastPrice ? String(quoteRecord.lastPrice) : '0.0000';

    if (!FinancialMath.isPositive(referencePrice)) {
      const reason = `Stale / Missing market quote for ${instrument.symbol} (Price: $${referencePrice}). Pausing quote cycle.`;
      await this.botRepo.createLog({
        bot_id: bot.id,
        instrument_id: instrumentId,
        action: 'RISK_REJECTED',
        details: reason,
        status: 'WARNING',
      });
      return { success: false, reason };
    }

    // 4. Retrieve Bot Account State
    const wallet = await this.walletRepo.findByUserId(bot.user_id);
    const availableCash = wallet?.available_balance || '0.0000';

    const position = await this.positionRepo.findByUserAndInstrument(bot.user_id, instrumentId);
    const currentInventory = position?.quantity || '0.0000';
    const realizedPnL = position?.realized_pnl || '0.0000';

    // Compute daily realized loss (if realized PnL < 0, loss is absolute value)
    let dailyLoss = '0.0000';
    if (FinancialMath.isNegative(realizedPnL)) {
      dailyLoss = FinancialMath.abs(realizedPnL);
    }

    // Open orders for this bot and instrument
    const openOrders = await this.orderRepo.findOpenOrders({
      userId: bot.user_id,
      instrumentId,
    });

    let openOrdersNotional = '0.0000';
    for (const ord of openOrders) {
      if (ord.limitPrice) {
        const notional = FinancialMath.calcTradeAmount(ord.limitPrice, ord.remainingQuantity);
        openOrdersNotional = FinancialMath.add(openOrdersNotional, notional);
      }
    }

    // 5. Select & Execute Strategy
    let strategy;
    if (bot.strategy_type === 'RANDOM_LIQUIDITY') {
      strategy = new RandomizedLiquidityGeneratorStrategy();
    } else {
      strategy = new MarketMakerStrategy(bot.strategy_type);
    }

    const decision = strategy.calculateQuotes({
      botId: bot.id,
      instrumentId,
      symbol: instrument.symbol,
      config,
      referencePrice,
      currentInventory,
      availableCash,
    });

    if (!decision.shouldQuote || !decision.desiredQuote) {
      await this.botRepo.createLog({
        bot_id: bot.id,
        instrument_id: instrumentId,
        action: 'QUOTE_CYCLE',
        details: decision.skipReason || 'Strategy determined no feasible quote required',
        status: 'SUCCESS',
      });
      return { success: true, reason: decision.skipReason };
    }

    // 6. Risk Validation
    const riskResult = this.riskService.validateQuote(decision.desiredQuote, {
      botId: bot.id,
      instrumentId,
      symbol: instrument.symbol,
      config,
      currentCash: availableCash,
      currentInventory,
      openOrdersCount: openOrders.length,
      openOrdersNotional,
      dailyRealizedLoss: dailyLoss,
    });

    if (!riskResult.isValid || !riskResult.sanitizedQuote) {
      const violationMsg = riskResult.violations.join('; ');
      await this.botRepo.createLog({
        bot_id: bot.id,
        instrument_id: instrumentId,
        action: 'RISK_REJECTED',
        details: `Quote rejected by risk manager: ${violationMsg}`,
        status: 'WARNING',
      });

      // If daily loss was breached, auto-pause bot
      if (violationMsg.includes('DAILY_LOSS_LIMIT_EXCEEDED')) {
        await this.botRepo.updateStatus(bot.id, 'PAUSED');
        this.realtimeService.emitBotRiskWarning?.({
          eventId: `warn-${Date.now()}`,
          botId: bot.id,
          instrumentId,
          symbol: instrument.symbol,
          ruleBreached: 'DAILY_LOSS_LIMIT',
          details: violationMsg,
          actionTaken: 'BOT_PAUSED',
          timestamp: new Date().toISOString(),
        });
      }

      return { success: false, reason: violationMsg };
    }

    const finalQuote = riskResult.sanitizedQuote;

    // 7. Cancel Stale Open Quotes for this bot on this instrument
    for (const oldOrder of openOrders) {
      try {
        await this.orderService.cancelOrder(bot.user_id, oldOrder.id);
        await this.botRepo.createLog({
          bot_id: bot.id,
          instrument_id: instrumentId,
          action: 'ORDER_CANCELLED',
          details: `Cancelled stale Order #${oldOrder.id} (${oldOrder.side} ${oldOrder.remainingQuantity} @ $${oldOrder.limitPrice})`,
          status: 'SUCCESS',
        });
      } catch (err: any) {
        logger.warn(`[BOT ENGINE] Failed to cancel stale order #${oldOrder.id} for Bot #${bot.id}: ${err.message}`);
      }
    }

    // 8. Submit New Quotes via OrderService
    const nowTs = Date.now();
    const placedOrders: string[] = [];

    // 8a. Submit BUY Limit Order if valid
    if (finalQuote.bidPrice && FinancialMath.isPositive(finalQuote.bidQuantity)) {
      try {
        const bidIdempotencyKey = `bot-${bot.id}-${instrumentId}-${nowTs}-buy`;
        const buyOrder = await this.orderService.createOrder(bot.user_id, {
          instrumentId,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: finalQuote.bidQuantity,
          limitPrice: finalQuote.bidPrice,
          idempotencyKey: bidIdempotencyKey,
        });

        placedOrders.push(`BUY #${buyOrder.id} (${finalQuote.bidQuantity} @ $${finalQuote.bidPrice})`);

        this.realtimeService.emitBotOrderGenerated?.({
          eventId: `bog-${Date.now()}`,
          botId: bot.id,
          name: bot.name,
          orderId: buyOrder.id,
          instrumentId,
          symbol: instrument.symbol,
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: finalQuote.bidQuantity,
          limitPrice: finalQuote.bidPrice,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        logger.warn(`[BOT ENGINE] Bot #${bot.id} BUY order submission failed: ${err.message}`);
        await this.botRepo.createLog({
          bot_id: bot.id,
          instrument_id: instrumentId,
          action: 'ERROR',
          details: `BUY order placement error: ${err.message}`,
          status: 'FAILURE',
        });
      }
    }

    // 8b. Submit SELL Limit Order if valid
    if (finalQuote.askPrice && FinancialMath.isPositive(finalQuote.askQuantity)) {
      try {
        const askIdempotencyKey = `bot-${bot.id}-${instrumentId}-${nowTs}-sell`;
        const sellOrder = await this.orderService.createOrder(bot.user_id, {
          instrumentId,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: finalQuote.askQuantity,
          limitPrice: finalQuote.askPrice,
          idempotencyKey: askIdempotencyKey,
        });

        placedOrders.push(`SELL #${sellOrder.id} (${finalQuote.askQuantity} @ $${finalQuote.askPrice})`);

        this.realtimeService.emitBotOrderGenerated?.({
          eventId: `bog-${Date.now()}`,
          botId: bot.id,
          name: bot.name,
          orderId: sellOrder.id,
          instrumentId,
          symbol: instrument.symbol,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: finalQuote.askQuantity,
          limitPrice: finalQuote.askPrice,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        logger.warn(`[BOT ENGINE] Bot #${bot.id} SELL order submission failed: ${err.message}`);
        await this.botRepo.createLog({
          bot_id: bot.id,
          instrument_id: instrumentId,
          action: 'ERROR',
          details: `SELL order placement error: ${err.message}`,
          status: 'FAILURE',
        });
      }
    }

    // 9. Log Successful Cycle
    await this.botRepo.createLog({
      bot_id: bot.id,
      instrument_id: instrumentId,
      action: 'QUOTE_CYCLE',
      details: `Quote cycle completed: Placed [${placedOrders.join(', ')}]. Ref: $${referencePrice}, Inv: ${currentInventory}`,
      status: 'SUCCESS',
    });

    return { success: true };
  }
}

export const botEngine = new BotEngine();
