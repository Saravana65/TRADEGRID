import { FinancialMath } from '../../../utils/math';
import { BotStrategyType, BotQuoteDecision, DesiredQuote } from '../bot.types';
import { IBotStrategy, StrategyContext } from './base-bot.strategy';

export class MarketMakerStrategy implements IBotStrategy {
  constructor(private readonly strategyType: BotStrategyType) {}

  calculateQuotes(ctx: StrategyContext): BotQuoteDecision {
    const { referencePrice, config, currentInventory } = ctx;

    if (!FinancialMath.isPositive(referencePrice)) {
      return {
        shouldQuote: false,
        skipReason: `INVALID_REFERENCE_PRICE: Reference price $${referencePrice} is not positive`,
      };
    }

    // 1. Determine Spread and Quantity Multipliers by Profile
    let spreadMultiplier = '1.0';
    let qtyMultiplier = '1.0';
    let skewMultiplier = '1.0';

    switch (this.strategyType) {
      case 'CONSERVATIVE_MM':
        // Wider spread (+50%), base quantity, higher inventory sensitivity (+50% skew)
        spreadMultiplier = '1.5';
        qtyMultiplier = '1.0';
        skewMultiplier = '1.5';
        break;

      case 'BALANCED_MM':
        // Standard normal parameters
        spreadMultiplier = '1.0';
        qtyMultiplier = '1.0';
        skewMultiplier = '1.0';
        break;

      case 'AGGRESSIVE_LP':
        // Tighter spread (-40%), higher order size (+50%), aggressive quoting
        spreadMultiplier = '0.6';
        qtyMultiplier = '1.5';
        skewMultiplier = '0.8';
        break;

      default:
        spreadMultiplier = '1.0';
        qtyMultiplier = '1.0';
        skewMultiplier = '1.0';
    }

    // 2. Compute Effective Spread (widened during high news catalyst volatility)
    if (ctx.catalystImpact && FinancialMath.gt(ctx.catalystImpact.volatilityMultiplier, '1.0')) {
      spreadMultiplier = FinancialMath.mul(
        spreadMultiplier,
        ctx.catalystImpact.volatilityMultiplier
      );
    }

    const rawSpreadBps = FinancialMath.mul(config.spread_bps, spreadMultiplier);
    // Min 5 bps to prevent zero/negative spreads
    const effectiveSpreadBps = FinancialMath.max(rawSpreadBps, '5.0');
    const spreadFraction = FinancialMath.div(effectiveSpreadBps, '10000'); // bps to decimal fraction

    // 3. Compute Half-Spread in dollars: halfSpread = refPrice * (spreadFraction / 2)
    const rawHalfSpread = FinancialMath.mul(referencePrice, FinancialMath.div(spreadFraction, '2'));
    // Enforce at least 1 cent ($0.0100) half-spread
    const halfSpread = FinancialMath.max(rawHalfSpread, '0.0100');

    // 4. Compute Inventory Skew Offset (Avellaneda-Stoikov adaptation)
    // ratio = currentInventory / maxInventory (clamped -1 to 1)
    let inventorySkewOffset = '0.0000';
    if (FinancialMath.isPositive(config.max_inventory_per_instrument)) {
      const rawRatio = FinancialMath.div(currentInventory, config.max_inventory_per_instrument);
      const clampedRatio = FinancialMath.max('-1.0', FinancialMath.min('1.0', rawRatio));
      const effectiveSkewFactor = FinancialMath.mul(config.skew_factor, skewMultiplier);
      
      // offset = halfSpread * ratio * skewFactor
      inventorySkewOffset = FinancialMath.mul(
        halfSpread,
        FinancialMath.mul(clampedRatio, effectiveSkewFactor)
      );
    }

    // 5. Compute Adjusted Mid Price
    // News Catalyst Sentiment shift: positive news shifts reservation price higher, negative shifts lower
    let catalystPriceShift = '0.0000';
    if (ctx.catalystImpact && !FinancialMath.isZero(ctx.catalystImpact.sentimentScore)) {
      const sentimentShiftRatio = FinancialMath.mul(
        ctx.catalystImpact.sentimentScore,
        '0.0500' // up to 5% reservation price skew per sentiment score unit
      );
      catalystPriceShift = FinancialMath.mul(referencePrice, sentimentShiftRatio);
    }

    // When inventory > 0, adjustedMid < refPrice (bids and asks shift lower to encourage selling)
    // When inventory < 0, adjustedMid > refPrice (bids and asks shift higher to encourage buying)
    const reservationMid = FinancialMath.add(referencePrice, catalystPriceShift);
    const adjustedMidPrice = FinancialMath.sub(reservationMid, inventorySkewOffset);

    // 6. Compute Desired Bid & Ask Prices
    let bidPrice = FinancialMath.sub(adjustedMidPrice, halfSpread);
    let askPrice = FinancialMath.add(adjustedMidPrice, halfSpread);

    // Floor bid at $0.0100
    bidPrice = FinancialMath.max(bidPrice, '0.0100');
    // Ensure ask is strictly greater than bid
    if (FinancialMath.lte(askPrice, bidPrice)) {
      askPrice = FinancialMath.add(bidPrice, '0.0200');
    }

    // 7. Compute Desired Order Quantities
    if (ctx.catalystImpact && FinancialMath.gt(ctx.catalystImpact.expectedParticipation, '1.0')) {
      qtyMultiplier = FinancialMath.mul(
        qtyMultiplier,
        ctx.catalystImpact.expectedParticipation
      );
    }
    let targetQty = FinancialMath.mul(config.order_quantity, qtyMultiplier);
    targetQty = FinancialMath.min(targetQty, config.max_order_quantity);

    // If bot inventory is at or above max inventory, suppress the bid completely
    const isAtMaxInventory = FinancialMath.gte(currentInventory, config.max_inventory_per_instrument);
    const finalBidPrice = isAtMaxInventory ? null : bidPrice;

    // If bot has no inventory to sell, suppress the ask completely
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
      reason: `${this.strategyType} Quote: Ref $${referencePrice}, AdjMid $${adjustedMidPrice}, Inv ${currentInventory}`,
    };

    return {
      shouldQuote: true,
      desiredQuote,
    };
  }
}
