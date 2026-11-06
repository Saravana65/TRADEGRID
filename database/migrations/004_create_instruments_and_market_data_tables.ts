import type { Knex } from 'knex';

/**
 * Migration 004: Create Stock Instruments, Market Quotes, and Historical Candles
 *
 * Architecture:
 * - instruments: Stock instrument master with strict (symbol, exchange) uniqueness.
 * - market_quotes: Authoritative latest quote snapshot per instrument using DECIMAL(18,4).
 * - market_candles: Historical OHLCV bars across selectable intervals (1m, 5m, 15m, 1h, 1d).
 * - data_classification: Explicitly tags all data as REAL or SIMULATED.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Stock Instruments Master
  await knex.schema.createTable('instruments', (table) => {
    table.increments('id').primary();
    table.string('symbol', 16).notNullable();
    table.string('name', 128).notNullable();
    table.string('exchange', 16).notNullable(); // e.g. 'NSE', 'BSE', 'TRADEGRID'
    table.string('sector', 64).notNullable(); // e.g. 'Technology', 'Energy'
    table.string('instrument_type', 16).notNullable().defaultTo('EQUITY');
    table.string('currency', 3).notNullable().defaultTo('USD');
    table
      .enum('market_status', ['ACTIVE', 'HALTED', 'SUSPENDED', 'DELISTED'])
      .notNullable()
      .defaultTo('ACTIVE');
    table
      .enum('data_classification', ['REAL', 'SIMULATED'])
      .notNullable()
      .defaultTo('SIMULATED');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Constraints & Indexes
    table.unique(['symbol', 'exchange']);
    table.index(['symbol']);
    table.index(['exchange']);
    table.index(['sector']);
    table.index(['market_status']);
    table.index(['data_classification']);
  });

  // 2. Market Quotes (Latest Snapshot)
  await knex.schema.createTable('market_quotes', (table) => {
    table.increments('id').primary();
    table
      .integer('instrument_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('instruments')
      .onDelete('CASCADE');
    table.decimal('last_price', 18, 4).notNullable();
    table.decimal('previous_close', 18, 4).notNullable();
    table.decimal('open_price', 18, 4).notNullable();
    table.decimal('high_price', 18, 4).notNullable();
    table.decimal('low_price', 18, 4).notNullable();
    table.bigInteger('volume').unsigned().notNullable().defaultTo(0);
    table.decimal('change_amount', 18, 4).notNullable().defaultTo('0.0000');
    table.decimal('change_percent', 8, 4).notNullable().defaultTo('0.0000');
    table.string('data_source', 64).notNullable().defaultTo('TRADEGRID_FIXTURE');
    table
      .enum('data_classification', ['REAL', 'SIMULATED'])
      .notNullable()
      .defaultTo('SIMULATED');
    table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['data_classification']);
    table.index(['change_percent']);
    table.index(['volume']);
  });

  // 3. Market Candles (OHLCV Time Series)
  await knex.schema.createTable('market_candles', (table) => {
    table.increments('id').primary();
    table
      .integer('instrument_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('instruments')
      .onDelete('CASCADE');
    table.string('interval', 8).notNullable(); // '1m', '5m', '15m', '1h', '1d'
    table.timestamp('timestamp').notNullable();
    table.decimal('open', 18, 4).notNullable();
    table.decimal('high', 18, 4).notNullable();
    table.decimal('low', 18, 4).notNullable();
    table.decimal('close', 18, 4).notNullable();
    table.bigInteger('volume').unsigned().notNullable().defaultTo(0);
    table
      .enum('data_classification', ['REAL', 'SIMULATED'])
      .notNullable()
      .defaultTo('SIMULATED');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Constraints & Indexes
    table.unique(['instrument_id', 'interval', 'timestamp']);
    table.index(['instrument_id', 'interval', 'timestamp']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('market_candles');
  await knex.schema.dropTableIfExists('market_quotes');
  await knex.schema.dropTableIfExists('instruments');
}
