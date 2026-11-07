import {
  BotStrategyType,
  BotStatus,
  BotConfiguration,
  BotInstrument,
  Bot,
  BotExecutionLog,
  BotLogAction,
  BotLogStatus,
  BotMetrics,
  BotMetricsSummary,
} from '@tradegrid/shared-types';

export {
  BotStrategyType,
  BotStatus,
  BotConfiguration,
  BotInstrument,
  Bot,
  BotExecutionLog,
  BotLogAction,
  BotLogStatus,
  BotMetrics,
  BotMetricsSummary,
};

export interface BotRecord {
  id: number;
  user_id: number;
  name: string;
  strategy_type: BotStrategyType;
  status: BotStatus;
  allocated_capital: string;
  created_at: Date;
  updated_at: Date;
}

export interface BotConfigurationRecord {
  id: number;
  bot_id: number;
  quote_refresh_interval_ms: number;
  spread_bps: string;
  order_quantity: string;
  max_order_quantity: string;
  max_order_notional: string;
  max_inventory_per_instrument: string;
  max_total_exposure: string;
  max_open_orders: number;
  max_daily_loss: string;
  skew_factor: string;
  created_at: Date;
  updated_at: Date;
}

export interface BotInstrumentRecord {
  id: number;
  bot_id: number;
  instrument_id: number;
  is_enabled: boolean | number;
  created_at: Date;
  updated_at: Date;
}

export interface BotExecutionLogRecord {
  id: number;
  bot_id: number;
  instrument_id: number | null;
  action: BotLogAction;
  details: string;
  status: BotLogStatus;
  created_at: Date;
}

export interface DesiredQuote {
  bidPrice: string | null;
  bidQuantity: string;
  askPrice: string | null;
  askQuantity: string;
  referencePrice: string;
  adjustedMidPrice: string;
  halfSpread: string;
  inventorySkewOffset: string;
  reason?: string;
}

export interface BotQuoteDecision {
  shouldQuote: boolean;
  desiredQuote?: DesiredQuote;
  skipReason?: string;
}
