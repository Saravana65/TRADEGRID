import type { Knex } from 'knex';

/**
 * Migration 007: Create Autonomous Market-Making Bots and Liquidity Tables
 *
 * Architecture:
 * - bots: Registry of autonomous simulated liquidity bots linked to dedicated system-owned virtual user accounts.
 * - bot_configurations: Operational parameters, refresh intervals, spread bps, and strict risk limits.
 * - bot_instruments: Mapping of instruments assigned to each bot for liquidity provisioning.
 * - bot_execution_logs: Immutable decision audit log tracking quote cycles, order placements, and risk rejections.
 * - Adds is_bot column to orders table for rapid execution tagging.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Add is_bot column to orders table if not exists
  const hasIsBotColumn = await knex.schema.hasColumn('orders', 'is_bot');
  if (!hasIsBotColumn) {
    await knex.schema.alterTable('orders', (table) => {
      table.boolean('is_bot').notNullable().defaultTo(false);
      table.index(['is_bot'], 'idx_orders_is_bot');
    });
  }

  // 2. Bots Registry Table
  await knex.schema.createTable('bots', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.string('name', 100).notNullable().unique();
    table
      .enum('strategy_type', [
        'CONSERVATIVE_MM',
        'BALANCED_MM',
        'AGGRESSIVE_LP',
        'RANDOM_LIQUIDITY',
      ])
      .notNullable();
    table
      .enum('status', ['ACTIVE', 'PAUSED', 'KILLED'])
      .notNullable()
      .defaultTo('PAUSED');
    table.decimal('allocated_capital', 19, 4).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['status'], 'idx_bots_status');
    table.index(['strategy_type'], 'idx_bots_strategy_type');
  });

  // 3. Bot Configurations Table
  await knex.schema.createTable('bot_configurations', (table) => {
    table.increments('id').primary();
    table
      .integer('bot_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('bots')
      .onDelete('CASCADE');
    table.integer('quote_refresh_interval_ms').notNullable().defaultTo(5000);
    table.decimal('spread_bps', 10, 2).notNullable().defaultTo(50.0);
    table.decimal('order_quantity', 18, 4).notNullable().defaultTo('10.0000');
    table.decimal('max_order_quantity', 18, 4).notNullable().defaultTo('50.0000');
    table.decimal('max_order_notional', 19, 4).notNullable().defaultTo('10000.0000');
    table.decimal('max_inventory_per_instrument', 18, 4).notNullable().defaultTo('200.0000');
    table.decimal('max_total_exposure', 19, 4).notNullable().defaultTo('50000.0000');
    table.integer('max_open_orders').notNullable().defaultTo(10);
    table.decimal('max_daily_loss', 19, 4).notNullable().defaultTo('5000.0000');
    table.decimal('skew_factor', 10, 4).notNullable().defaultTo('0.1000');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // 4. Bot Instruments Association Table
  await knex.schema.createTable('bot_instruments', (table) => {
    table.increments('id').primary();
    table
      .integer('bot_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('bots')
      .onDelete('CASCADE');
    table
      .integer('instrument_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('instruments')
      .onDelete('CASCADE');
    table.boolean('is_enabled').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['bot_id', 'instrument_id'], 'uq_bot_instrument');
    table.index(['instrument_id'], 'idx_bot_instruments_instrument_id');
  });

  // 5. Bot Execution Audit Logs Table
  await knex.schema.createTable('bot_execution_logs', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('bot_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('bots')
      .onDelete('CASCADE');
    table
      .integer('instrument_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('instruments')
      .onDelete('SET NULL');
    table.string('action', 64).notNullable();
    table.text('details').notNullable();
    table
      .enum('status', ['SUCCESS', 'WARNING', 'FAILURE'])
      .notNullable()
      .defaultTo('SUCCESS');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['bot_id', 'created_at'], 'idx_bot_logs_bot_created');
    table.index(['action'], 'idx_bot_logs_action');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bot_execution_logs');
  await knex.schema.dropTableIfExists('bot_instruments');
  await knex.schema.dropTableIfExists('bot_configurations');
  await knex.schema.dropTableIfExists('bots');

  const hasIsBotColumn = await knex.schema.hasColumn('orders', 'is_bot');
  if (hasIsBotColumn) {
    await knex.schema.alterTable('orders', (table) => {
      table.dropColumn('is_bot');
    });
  }
}
