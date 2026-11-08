import type { Knex } from 'knex';

/**
 * Migration 012: Create User Chart Preferences Table
 *
 * Persists customized user workspace configurations:
 * - Symbol / Default preference
 * - Timeframe interval (1m, 5m, 15m, 1h, 1d)
 * - Chart Type (CANDLESTICK, LINE, AREA, BAR)
 * - Active Indicators with periods, colors, styles
 * - Derived Volume Profile settings (bins, value area %)
 *
 * Strict isolation: UNIQUE(user_id, symbol), indexed on user_id.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_chart_preferences', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('symbol', 16).notNullable().defaultTo('DEFAULT');
    table.string('interval', 8).notNullable().defaultTo('1d');
    table.string('chart_type', 16).notNullable().defaultTo('CANDLESTICK');
    table.json('indicators_config').notNullable();
    table.json('volume_profile_config').notNullable();
    table.timestamps(true, true);

    table.unique(['user_id', 'symbol']);
    table.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_chart_preferences');
}
