import { QuantitativeStrategyType } from '@tradegrid/shared-types';
import { IQuantitativeStrategy } from './strategy.interface';
import { SmaCrossoverStrategy } from './sma-crossover.strategy';
import { EmaCrossoverStrategy } from './ema-crossover.strategy';
import { RsiStrategy } from './rsi.strategy';
import { MacdStrategy } from './macd.strategy';
import { BollingerBandsStrategy } from './bollinger.strategy';
import { BreakoutStrategy } from './breakout.strategy';

export * from './strategy.interface';
export * from './sma-crossover.strategy';
export * from './ema-crossover.strategy';
export * from './rsi.strategy';
export * from './macd.strategy';
export * from './bollinger.strategy';
export * from './breakout.strategy';

export class StrategyRegistry {
  private static strategies: Map<QuantitativeStrategyType, IQuantitativeStrategy> = new Map<
    QuantitativeStrategyType,
    IQuantitativeStrategy
  >([
    ['SMA_CROSSOVER', new SmaCrossoverStrategy()],
    ['EMA_CROSSOVER', new EmaCrossoverStrategy()],
    ['RSI_MOMENTUM', new RsiStrategy()],
    ['MACD_TREND', new MacdStrategy()],
    ['BOLLINGER_REVERSION', new BollingerBandsStrategy()],
    ['BREAKOUT', new BreakoutStrategy()],
  ]);

  static getStrategy(type: QuantitativeStrategyType): IQuantitativeStrategy {
    const strat = this.strategies.get(type);
    if (!strat) {
      throw new Error(`Strategy type '${type}' not recognized`);
    }
    return strat;
  }

  static getAllStrategies(): IQuantitativeStrategy[] {
    return Array.from(this.strategies.values());
  }

  static getStrategyTypes(): QuantitativeStrategyType[] {
    return Array.from(this.strategies.keys());
  }
}
