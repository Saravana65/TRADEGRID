import { FinancialMath } from '../../../utils/math';
import { BotQuoteDecision, DesiredQuote } from '../bot.types';
import { IBotStrategy, StrategyContext } from './base-bot.strategy';

export class RandomizedLiquidityGeneratorStrategy implements IBotStrategy {
  /**
   * Bounded deterministic/randomized liquidity generator:
   * Jitters spread within +/- 20% and quantity within +/- 30% of base config,
   * while strictly respecting maximum order quantity and notional limits.
   */
  calculateQuotes(ctx: StrategyContext): BotQuoteDecision {
    const { referencePrice, config, currentInventory } = ctx;

    if (!FinancialMath.isPositive(referencePrice)) {
      return {
        shouldQuote: false,
        skipReason: `INVALID_REFERENCE_PRICE: Reference price $${referencePrice} is not positive`,
      };
    }

    // 1. Controlled Bounded Variation (0.80x to 1.25x for spread, 0.70x to 1.30x for quantity)
    // Use bounded pseudo-random factor
    const spreadJitter = 0.85 + Math.random() * 0.3; // 0.85 to 1.15
    const qtyJitter = 0.75 + Math.random() * 0.5; // 0.75 to 1.25

    const rawSpreadBps = FinancialMath.mul(config.spread_bps, spreadJitter.toFixed(4));
    const effectiveSpreadBps = FinancialMath.max(rawSpreadBps, '10.0'); // minimum 10 bps
    const spreadFraction = FinancialMath.div(effectiveSpreadBps, '10000');

    // Half spread in dollars
    const rawHalfSpread = FinancialMath.mul(referencePrice, FinancialMath.div(spreadFraction, '2'));
    const halfSpread = FinancialMath.max(rawHalfSpread, '0.0100');

    // 2. Inventory Skewing
    let inventorySkewOffset = '0.0000';
    if (FinancialMath.isPositive(config.max_inventory_per_instrument)) {
      const rawRatio = FinancialMath.div(currentInventory, config.max_inventory_per_instrument);
      const clampedRatio = FinancialMath.max('-1.0', FinancialMath.min('1.0', rawRatio));
      inventorySkewOffset = FinancialMath.mul(
        halfSpread,
        FinancialMath.mul(clampedRatio, config.skew_factor)
      );
    }

    const adjustedMidPrice = FinancialMath.sub(referencePrice, inventorySkewOffset);

    // 3. Bid & Ask Price calculation
    let bidPrice = FinancialMath.sub(adjustedMidPrice, halfSpread);
    let askPrice = FinancialMath.add(adjustedMidPrice, halfSpread);

    bidPrice = FinancialMath.max(bidPrice, '0.0100');
    if (FinancialMath.lte(askPrice, bidPrice)) {
      askPrice = FinancialMath.add(bidPrice, '0.0200');
    }

    // 4. Quantities with bounded jitter
    let targetQty = FinancialMath.mul(config.order_quantity, qtyJitter.toFixed(4));
    targetQty = FinancialMath.min(targetQty, config.max_order_quantity);

    // Enforce max inventory bounds
    const isAtMaxInventory = FinancialMath.gte(currentInventory, config.max_inventory_per_instrument);
    const finalBidPrice = isAtMaxInventory ? null : bidPrice;

    // Enforce available inventory bounds
    const hasZeroInventory = FinancialMath.lte(currentInventory, '0.0000');
    const finalAskPrice = hasZeroInventory ? null : askPrice;

    const desiredQuote: DesiredQuote = {
      bidPrice: finalBidPrice,
      bidQuantity: targetQty,
      askPrice: finalAskPrice,
      askQuantity: targetQty,
      referencePrice,
      adjustedMidPrice,
      halfSpread,
      inventorySkewOffset,
      reason: `RANDOM_LIQUIDITY Quote: SpreadJitter ${spreadJitter.toFixed(2)}x, QtyJitter ${qtyJitter.toFixed(2)}x`,
    };

    return {
      shouldQuote: true,
      desiredQuote,
    };
  }
}
