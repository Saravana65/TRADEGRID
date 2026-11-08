import { Knex } from 'knex';
import { db } from '../../database/connection';
import { UserStrategy, StrategyVersion } from '@tradegrid/shared-types';
import { IStrategyRepository, UserStrategyRow, StrategyVersionRow } from './strategy.types';

export class KnexStrategyRepository implements IStrategyRepository {
  constructor(private readonly knex: Knex = db) {}

  private mapStrategyRow(row: UserStrategyRow): UserStrategy {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description || undefined,
      instrumentSymbol: row.instrument_symbol,
      timeframe: row.timeframe,
      dslCode: row.dsl_code,
      isValid: Boolean(row.is_valid),
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapVersionRow(row: StrategyVersionRow): StrategyVersion {
    let astSnapshot: any = undefined;
    if (row.ast_snapshot) {
      astSnapshot = typeof row.ast_snapshot === 'string' ? JSON.parse(row.ast_snapshot) : row.ast_snapshot;
    }

    return {
      id: row.id,
      strategyId: row.strategy_id,
      userId: row.user_id,
      version: row.version,
      dslCode: row.dsl_code,
      astSnapshot,
      changelog: row.changelog || undefined,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async createStrategy(strategy: {
    userId: number;
    name: string;
    description?: string;
    instrumentSymbol: string;
    timeframe: string;
    dslCode: string;
    isValid: boolean;
    version: number;
  }): Promise<UserStrategy> {
    const [id] = await this.knex('user_strategies').insert({
      user_id: strategy.userId,
      name: strategy.name,
      description: strategy.description || null,
      instrument_symbol: strategy.instrumentSymbol,
      timeframe: strategy.timeframe,
      dsl_code: strategy.dslCode,
      is_valid: strategy.isValid ? 1 : 0,
      version: strategy.version,
    });

    const row = await this.knex<UserStrategyRow>('user_strategies').where('id', id).first();
    if (!row) throw new Error(`Failed to retrieve created strategy #${id}`);
    return this.mapStrategyRow(row);
  }

  async findById(id: number): Promise<UserStrategy | null> {
    const row = await this.knex<UserStrategyRow>('user_strategies').where('id', id).first();
    return row ? this.mapStrategyRow(row) : null;
  }

  async findByUserId(userId: number): Promise<UserStrategy[]> {
    const rows = await this.knex<UserStrategyRow>('user_strategies')
      .where('user_id', userId)
      .orderBy('updated_at', 'desc');
    return rows.map((r) => this.mapStrategyRow(r));
  }

  async updateStrategy(
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
  ): Promise<UserStrategy | null> {
    const payload: any = { updated_at: this.knex.fn.now() };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.instrumentSymbol !== undefined) payload.instrument_symbol = updates.instrumentSymbol;
    if (updates.timeframe !== undefined) payload.timeframe = updates.timeframe;
    if (updates.dslCode !== undefined) payload.dsl_code = updates.dslCode;
    if (updates.isValid !== undefined) payload.is_valid = updates.isValid ? 1 : 0;
    if (updates.version !== undefined) payload.version = updates.version;

    const count = await this.knex('user_strategies')
      .where({ id, user_id: userId })
      .update(payload);

    if (count === 0) return null;
    return this.findById(id);
  }

  async deleteStrategy(id: number, userId: number): Promise<boolean> {
    const count = await this.knex('user_strategies')
      .where({ id, user_id: userId })
      .del();
    return count > 0;
  }

  async createVersion(version: {
    strategyId: number;
    userId: number;
    version: number;
    dslCode: string;
    astSnapshot?: any;
    changelog?: string;
  }): Promise<StrategyVersion> {
    const [id] = await this.knex('strategy_versions').insert({
      strategy_id: version.strategyId,
      user_id: version.userId,
      version: version.version,
      dsl_code: version.dslCode,
      ast_snapshot: version.astSnapshot ? JSON.stringify(version.astSnapshot) : null,
      changelog: version.changelog || null,
    });

    const row = await this.knex<StrategyVersionRow>('strategy_versions').where('id', id).first();
    if (!row) throw new Error(`Failed to retrieve created strategy version #${id}`);
    return this.mapVersionRow(row);
  }

  async getVersions(strategyId: number, userId: number): Promise<StrategyVersion[]> {
    const rows = await this.knex<StrategyVersionRow>('strategy_versions')
      .where({ strategy_id: strategyId, user_id: userId })
      .orderBy('version', 'desc');
    return rows.map((r) => this.mapVersionRow(r));
  }

  async getVersion(
    strategyId: number,
    version: number,
    userId: number
  ): Promise<StrategyVersion | null> {
    const row = await this.knex<StrategyVersionRow>('strategy_versions')
      .where({ strategy_id: strategyId, version, user_id: userId })
      .first();
    return row ? this.mapVersionRow(row) : null;
  }
}

export const strategyRepository = new KnexStrategyRepository();
