import Decimal from 'decimal.js';

// Configure Decimal for financial precision
// 28 decimal places matches MySQL DECIMAL(28, 8) and exceeds DECIMAL(18, 4)
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -20,
  toExpPos: 30,
});

export const DECIMAL_PLACES = 4;

/**
 * Standardized arbitrary-precision financial math utility.
 * Eliminates IEEE 754 floating-point inaccuracies across the matching and settlement pipeline.
 */
export class FinancialMath {
  /**
   * Parses an input into a validated Decimal instance.
   */
  static from(value: string | number | Decimal): Decimal {
    try {
      if (value instanceof Decimal) return value;
      const str = typeof value === 'number' ? value.toString() : (value || '0');
      return new Decimal(str);
    } catch {
      return new Decimal(0);
    }
  }

  /**
   * Formats a Decimal, string or number to fixed-precision decimal string (default: 4 decimals).
   */
  static toFixed(value: string | number | Decimal, places: number = DECIMAL_PLACES): string {
    return this.from(value).toFixed(places, Decimal.ROUND_HALF_UP);
  }

  /**
   * Addition: a + b
   */
  static add(a: string | number | Decimal, b: string | number | Decimal, places: number = DECIMAL_PLACES): string {
    return this.from(a).plus(this.from(b)).toFixed(places, Decimal.ROUND_HALF_UP);
  }

  /**
   * Subtraction: a - b
   */
  static sub(a: string | number | Decimal, b: string | number | Decimal, places: number = DECIMAL_PLACES): string {
    return this.from(a).minus(this.from(b)).toFixed(places, Decimal.ROUND_HALF_UP);
  }

  /**
   * Multiplication: a * b
   */
  static mul(a: string | number | Decimal, b: string | number | Decimal, places: number = DECIMAL_PLACES): string {
    return this.from(a).times(this.from(b)).toFixed(places, Decimal.ROUND_HALF_UP);
  }

  /**
   * Division: a / b
   */
  static div(a: string | number | Decimal, b: string | number | Decimal, places: number = DECIMAL_PLACES): string {
    const divisor = this.from(b);
    if (divisor.isZero()) {
      return this.toFixed(0, places);
    }
    return this.from(a).dividedBy(divisor).toFixed(places, Decimal.ROUND_HALF_UP);
  }

  /**
   * a > b
   */
  static gt(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return this.from(a).greaterThan(this.from(b));
  }

  /**
   * a >= b
   */
  static gte(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return this.from(a).greaterThanOrEqualTo(this.from(b));
  }

  /**
   * a < b
   */
  static lt(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return this.from(a).lessThan(this.from(b));
  }

  /**
   * a <= b
   */
  static lte(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return this.from(a).lessThanOrEqualTo(this.from(b));
  }

  /**
   * a === b
   */
  static eq(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return this.from(a).equals(this.from(b));
  }

  /**
   * a > 0
   */
  static isPositive(a: string | number | Decimal): boolean {
    return this.from(a).isPositive() && !this.from(a).isZero();
  }

  /**
   * a === 0
   */
  static isZero(a: string | number | Decimal): boolean {
    return this.from(a).isZero();
  }

  /**
   * min(a, b)
   */
  static min(a: string | number | Decimal, b: string | number | Decimal, places: number = DECIMAL_PLACES): string {
    return Decimal.min(this.from(a), this.from(b)).toFixed(places, Decimal.ROUND_HALF_UP);
  }

  /**
   * max(a, b)
   */
  static max(a: string | number | Decimal, b: string | number | Decimal, places: number = DECIMAL_PLACES): string {
    return Decimal.max(this.from(a), this.from(b)).toFixed(places, Decimal.ROUND_HALF_UP);
  }

  /**
   * Calculates trade notional amount: price * quantity
   */
  static calcTradeAmount(price: string | number | Decimal, quantity: string | number | Decimal): string {
    return this.mul(price, quantity, DECIMAL_PLACES);
  }

  /**
   * Calculates new weighted-average cost basis for share additions:
   * ((currentQty * currentAvg) + (addedQty * addedPrice)) / (currentQty + addedQty)
   */
  static calcWeightedAverageCost(
    currentQty: string | number | Decimal,
    currentAvg: string | number | Decimal,
    addedQty: string | number | Decimal,
    addedPrice: string | number | Decimal
  ): string {
    const cQty = this.from(currentQty);
    const cAvg = this.from(currentAvg);
    const aQty = this.from(addedQty);
    const aPrice = this.from(addedPrice);

    const totalQty = cQty.plus(aQty);
    if (totalQty.isZero() || totalQty.isNegative()) {
      return this.toFixed(0, DECIMAL_PLACES);
    }

    const currentCost = cQty.times(cAvg);
    const addedCost = aQty.times(aPrice);
    const totalCost = currentCost.plus(addedCost);

    return totalCost.dividedBy(totalQty).toFixed(DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
  }

  /**
   * Calculates realized profit & loss for share reductions:
   * (sellPrice - averageCostBasis) * executedQuantity
   */
  static calcRealizedPnL(
    sellPrice: string | number | Decimal,
    averageCostBasis: string | number | Decimal,
    executedQuantity: string | number | Decimal
  ): string {
    const priceDiff = this.from(sellPrice).minus(this.from(averageCostBasis));
    return priceDiff.times(this.from(executedQuantity)).toFixed(DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
  }

  /**
   * Remaining order quantity calculation: max(0, original - executed)
   */
  static calcRemainingQuantity(
    originalQuantity: string | number | Decimal,
    executedQuantity: string | number | Decimal
  ): string {
    const rem = this.from(originalQuantity).minus(this.from(executedQuantity));
    return rem.isNegative() ? '0.0000' : rem.toFixed(DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
  }
}

export { Decimal };
