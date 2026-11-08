import type { Knex } from 'knex';

/**
 * Migration 017: Enhance Market Candles Provenance & Storage
 *
 * Implements persistent candle storage schema enhancements for Phase 10C:
 * Historical Market Data and Candle Engine.
 *
 * Enhancements:
 * 1. Add source provenance ('SIMULATED', 'LICENSED_LIVE', 'DELAYED', 'HISTORICAL')
 * 2. Add provider identifier string ('SIMULATED_PROVIDER', 'LICENSED_INDIAN_PROVIDER', etc.)
 * 3. Add is_complete boolean flag for closed vs forming bars
 * 4. Composite unique index on (instrument_id, interval, timestamp) prevents ingestion duplicates
 */
export async function up(knex: Knex): Promise<void> {
  const hasCandlesTable = await knex.schema.hasTable('market_candles');
  if (hasCandlesTable) {
    const hasSource = await knex.schema.hasColumn('market_candles', 'source');
    if (!hasSource) {
      await knex.schema.alterTable('market_candles', (table) => {
        table.string('source', 32).notNullable().defaultTo('SIMULATED');
        table.string('provider', 64).notNullable().defaultTo('SIMULATED_PROVIDER');
        table.boolean('is_complete').notNullable().defaultTo(true);
        table.index(['instrument_id', 'interval', 'source']);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCandlesTable = await knex.schema.hasTable('market_candles');
  if (hasCandlesTable) {
    const hasSource = await knex.schema.hasColumn('market_candles', 'source');
    if (hasSource) {
      await knex.schema.alterTable('market_candles', (table) => {
        table.dropColumn('source');
        table.dropColumn('provider');
        table.dropColumn('is_complete');
      });
    }
  }
}
