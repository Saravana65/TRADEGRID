import { BotConfigurationRecord, DesiredQuote, BotQuoteDecision } from '../bot.types';
import { CatalystImpactResult } from '../../news/news.types';

export interface StrategyContext {
  botId: number;
  instrumentId: number;
  symbol: string;
  config: BotConfigurationRecord;
  referencePrice: string; // from market quote / book mid
  currentInventory: string; // bot's owned shares
  availableCash: string;
  catalystImpact?: CatalystImpactResult;
}

export interface IBotStrategy {
  calculateQuotes(ctx: StrategyContext): BotQuoteDecision;
}
