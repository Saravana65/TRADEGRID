import { FinancialMath } from '../../../utils/math';
import { logger } from '../../../utils/logger';
import { BotConfigurationRecord, DesiredQuote } from '../bot.types';

export interface RiskValidationResult {
  isValid: boolean;
  sanitizedQuote?: DesiredQuote;
  violations: string[];
}

export interface BotRiskContext {
  botId: number;
  instrumentId: number;
  symbol: string;
  config: BotConfigurationRecord;
  currentCash: string;
  currentInventory: string; // from portfolio_positions
  openOrdersCount: number;
  openOrdersNotional: string;
  dailyRealizedLoss: string;
}

export class BotRiskService {
  /**
   * Evaluates a candidate quote against the bot's risk configuration limits.
   * If limits are exceeded, either sanitizes the quote (e.g. adjusts quantities down,
   * cancels one side) or rejects it with specific rule violation reasons.
   */
  validateQuote(quote: DesiredQuote, ctx: BotRiskContext): RiskValidationResult {
    const violations: string[] = [];
    const config = ctx.config;

    // 1. Daily Realized Loss Circuit Breaker
    if (FinancialMath.isPositive(ctx.dailyRealizedLoss)) {
      if (FinancialMath.gte(ctx.dailyRealizedLoss, config.max_daily_loss)) {
        violations.push(
          `DAILY_LOSS_LIMIT_EXCEEDED: Realized loss $${ctx.dailyRealizedLoss} >= max allowed $${config.max_daily_loss}`
        );
        return { isValid: false, violations };
      }
    }

    // 2. Open Orders Capacity
    // If placing 2 new quotes (bid + ask), will it exceed max_open_orders?
    const prospectiveNewOrders = (quote.bidPrice ? 1 : 0) + (quote.askPrice ? 1 : 0);
    // Note: Engine cancels existing quotes before placing new ones, but we check max_open_orders limit
    if (prospectiveNewOrders > config.max_open_orders) {
      violations.push(
        `MAX_OPEN_ORDERS_BREACH: Prospective orders ${prospectiveNewOrders} > limit ${config.max_open_orders}`
      );
      return { isValid: false, violations };
    }

    let validBidPrice: string | null = quote.bidPrice;
    let validBidQty: string = quote.bidQuantity;
    let validAskPrice: string | null = quote.askPrice;
    let validAskQty: string = quote.askQuantity;

    // 3. Bid Risk Checks (BUY Side)
    if (validBidPrice) {
      // 3a. Order Quantity Limit
      if (FinancialMath.gt(validBidQty, config.max_order_quantity)) {
        validBidQty = config.max_order_quantity;
      }

      // 3b. Order Notional Limit
      const bidNotional = FinancialMath.calcTradeAmount(validBidPrice, validBidQty);
      if (FinancialMath.gt(bidNotional, config.max_order_notional)) {
        // Scale quantity down to fit max notional
        const maxQtyForNotional = FinancialMath.div(config.max_order_notional, validBidPrice);
        validBidQty = FinancialMath.toFixed(maxQtyForNotional);
      }

      // 3c. Maximum Inventory Capacity Limit
      const prospectiveInventory = FinancialMath.add(ctx.currentInventory, validBidQty);
      if (FinancialMath.gt(prospectiveInventory, config.max_inventory_per_instrument)) {
        const allowedRemainingInventory = FinancialMath.sub(
          config.max_inventory_per_instrument,
          ctx.currentInventory
        );
        if (FinancialMath.isPositive(allowedRemainingInventory)) {
          validBidQty = allowedRemainingInventory;
        } else {
          // Already at or above max inventory -> suppress BUY quote entirely
          validBidPrice = null;
          violations.push(
            `MAX_INVENTORY_REACHED: Current inventory ${ctx.currentInventory} >= limit ${config.max_inventory_per_instrument}. Bid suppressed.`
          );
        }
      }

      // 3d. Available Cash Check
      if (validBidPrice) {
        const requiredCash = FinancialMath.calcTradeAmount(validBidPrice, validBidQty);
        if (FinancialMath.gt(requiredCash, ctx.currentCash)) {
          // Check if partial cash can buy at least fractional quantity
          const affordableQty = FinancialMath.div(ctx.currentCash, validBidPrice);
          if (FinancialMath.gte(affordableQty, '0.0001')) {
            validBidQty = FinancialMath.toFixed(affordableQty);
          } else {
            validBidPrice = null;
            violations.push(
              `INSUFFICIENT_CASH: Required $${requiredCash} > available $${ctx.currentCash}. Bid suppressed.`
            );
          }
        }
      }

      // 3e. Total Exposure Limit
      if (validBidPrice) {
        const currentExposure = FinancialMath.add(
          FinancialMath.calcTradeAmount(quote.referencePrice, ctx.currentInventory),
          ctx.openOrdersNotional
        );
        const addedExposure = FinancialMath.calcTradeAmount(validBidPrice, validBidQty);
        const prospectiveTotalExposure = FinancialMath.add(currentExposure, addedExposure);
        if (FinancialMath.gt(prospectiveTotalExposure, config.max_total_exposure)) {
          validBidPrice = null;
          violations.push(
            `MAX_TOTAL_EXPOSURE_BREACH: Prospective exposure $${prospectiveTotalExposure} > limit $${config.max_total_exposure}. Bid suppressed.`
          );
        }
      }
    }

    // 4. Ask Risk Checks (SELL Side)
    if (validAskPrice) {
      // 4a. Order Quantity Limit
      if (FinancialMath.gt(validAskQty, config.max_order_quantity)) {
        validAskQty = config.max_order_quantity;
      }

      // 4b. Order Notional Limit
      const askNotional = FinancialMath.calcTradeAmount(validAskPrice, validAskQty);
      if (FinancialMath.gt(askNotional, config.max_order_notional)) {
        const maxQtyForNotional = FinancialMath.div(config.max_order_notional, validAskPrice);
        validAskQty = FinancialMath.toFixed(maxQtyForNotional);
      }

      // 4c. Available Shares in Inventory (No naked short selling)
      if (FinancialMath.lte(ctx.currentInventory, '0.0000')) {
        validAskPrice = null;
        violations.push(
          `NO_INVENTORY_TO_SELL: Current inventory ${ctx.currentInventory} <= 0. Ask suppressed.`
        );
      } else if (FinancialMath.gt(validAskQty, ctx.currentInventory)) {
        validAskQty = ctx.currentInventory;
      }
    }

    // 5. Final Validity Check
    const hasAtLeastOneQuote = (validBidPrice !== null && FinancialMath.isPositive(validBidQty)) ||
                               (validAskPrice !== null && FinancialMath.isPositive(validAskQty));

    if (!hasAtLeastOneQuote) {
      return {
        isValid: false,
        violations: violations.length > 0 ? violations : ['NO_FEASIBLE_QUOTE_WITHIN_RISK_LIMITS'],
      };
    }

    // Ensure bid does not cross ask (sanity guard)
    if (validBidPrice && validAskPrice && FinancialMath.gte(validBidPrice, validAskPrice)) {
      logger.warn(`[BOT RISK] Bid price $${validBidPrice} >= Ask price $${validAskPrice}. Adjusting ask.`);
      validAskPrice = FinancialMath.add(validBidPrice, '0.0100');
    }

    return {
      isValid: true,
      sanitizedQuote: {
        ...quote,
        bidPrice: validBidPrice,
        bidQuantity: validBidQty,
        askPrice: validAskPrice,
        askQuantity: validAskQty,
      },
      violations,
    };
  }
}

export const botRiskService = new BotRiskService();
