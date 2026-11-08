import {
  UserStrategy,
  StrategyVersion,
  CreateStrategyRequest,
  UpdateStrategyRequest,
} from '@tradegrid/shared-types';

export interface UserStrategyRow {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  instrument_symbol: string;
  timeframe: string;
  dsl_code: string;
  is_valid: number | boolean;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface StrategyVersionRow {
  id: number;
  strategy_id: number;
  user_id: number;
  version: number;
  dsl_code: string;
  ast_snapshot: any;
  changelog: string | null;
  created_at: string | Date;
}

export interface IStrategyRepository {
  createStrategy(strategy: {
    userId: number;
    name: string;
    description?: string;
    instrumentSymbol: string;
    timeframe: string;
    dslCode: string;
    isValid: boolean;
    version: number;
  }): Promise<UserStrategy>;

  findById(id: number): Promise<UserStrategy | null>;
  findByUserId(userId: number): Promise<UserStrategy[]>;
  updateStrategy(
    id: number,
    userId: number,
    updates: Partial<{
      name: string;
      description: string;
      instrumentSymbol: string;
      timeframe: string;
      dslCode: string;
      isValid: boolean;
      version: number;
    }>
  ): Promise<UserStrategy | null>;
  deleteStrategy(id: number, userId: number): Promise<boolean>;

  createVersion(version: {
    strategyId: number;
    userId: number;
    version: number;
    dslCode: string;
    astSnapshot?: any;
    changelog?: string;
  }): Promise<StrategyVersion>;

  getVersions(strategyId: number, userId: number): Promise<StrategyVersion[]>;
  getVersion(strategyId: number, version: number, userId: number): Promise<StrategyVersion | null>;
}
