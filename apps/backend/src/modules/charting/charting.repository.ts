import { Knex } from 'knex';
import { db } from '../../database/connection';
import {
  ChartType,
  IndicatorConfig,
  VolumeProfileConfig,
  UserChartPreference,
} from '@tradegrid/shared-types';
import { IChartPreferenceRepository, UserChartPreferenceRow } from './charting.types';

export class KnexChartPreferenceRepository implements IChartPreferenceRepository {
  constructor(private readonly knex: Knex = db) {}

  private mapRow(row: UserChartPreferenceRow): UserChartPreference {
    const indicatorsConfig =
      typeof row.indicators_config === 'string'
        ? JSON.parse(row.indicators_config)
        : row.indicators_config;

    const volumeProfileConfig =
      typeof row.volume_profile_config === 'string'
        ? JSON.parse(row.volume_profile_config)
        : row.volume_profile_config;

    return {
      id: row.id,
      userId: row.user_id,
      symbol: row.symbol,
      interval: row.interval,
      chartType: row.chart_type as ChartType,
      indicatorsConfig,
      volumeProfileConfig,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async findByUserAndSymbol(userId: number, symbol: string): Promise<UserChartPreference | null> {
    const row = await this.knex<UserChartPreferenceRow>('user_chart_preferences')
      .where({ user_id: userId, symbol })
      .first();

    return row ? this.mapRow(row) : null;
  }

  async findDefaultByUser(userId: number): Promise<UserChartPreference | null> {
    const row = await this.knex<UserChartPreferenceRow>('user_chart_preferences')
      .where({ user_id: userId, symbol: 'DEFAULT' })
      .first();

    return row ? this.mapRow(row) : null;
  }

  async findAllByUser(userId: number): Promise<UserChartPreference[]> {
    const rows = await this.knex<UserChartPreferenceRow>('user_chart_preferences')
      .where({ user_id: userId })
      .orderBy('updated_at', 'desc');

    return rows.map((r) => this.mapRow(r));
  }

  async savePreference(preference: UserChartPreference): Promise<UserChartPreference> {
    const existing = await this.knex<UserChartPreferenceRow>('user_chart_preferences')
      .where({ user_id: preference.userId, symbol: preference.symbol })
      .first();

    const indicatorsJson = JSON.stringify(preference.indicatorsConfig || []);
    const volumeProfileJson = JSON.stringify(preference.volumeProfileConfig || {});
    const now = new Date();

    if (existing) {
      await this.knex('user_chart_preferences')
        .where({ id: existing.id, user_id: preference.userId })
        .update({
          interval: preference.interval,
          chart_type: preference.chartType,
          indicators_config: indicatorsJson,
          volume_profile_config: volumeProfileJson,
          updated_at: now,
        });

      return {
        ...preference,
        id: existing.id,
        updatedAt: now.toISOString(),
      };
    } else {
      const [insertId] = await this.knex('user_chart_preferences').insert({
        user_id: preference.userId,
        symbol: preference.symbol,
        interval: preference.interval,
        chart_type: preference.chartType,
        indicators_config: indicatorsJson,
        volume_profile_config: volumeProfileJson,
        created_at: now,
        updated_at: now,
      });

      return {
        ...preference,
        id: insertId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    }
  }

  async deletePreference(userId: number, symbol: string): Promise<boolean> {
    const deletedCount = await this.knex('user_chart_preferences')
      .where({ user_id: userId, symbol })
      .delete();

    return deletedCount > 0;
  }
}
