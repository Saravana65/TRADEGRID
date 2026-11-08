import type { Knex } from 'knex';

/**
 * Migration 009: Create Multiplayer Trading Competitions & Leaderboards Tables
 *
 * Architecture:
 * - competitions: Master competition configuration, visibility, lifecycle state, constraints.
 * - competition_participants: Enrolled users, join status, and cached rankings.
 * - competition_accounts: Strictly isolated virtual cash balances per participant per competition.
 * - competition_positions: Strictly isolated stock holdings per participant per competition.
 * - competition_orders: Orders submitted in the context of a competition.
 * - competition_trades: Settled executions matching competition orders.
 * - competition_leaderboard_snapshots: Periodic and final immutable rankings snapshots.
 * - competition_audit_logs: Chronological lifecycle and administrative audit records.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Competitions Master Table
  await knex.schema.createTable('competitions', (table) => {
    table.increments('id').primary();
    table.string('name', 128).notNullable();
    table.text('description').nullable();
    table
      .integer('creator_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.enum('visibility', ['PUBLIC', 'PRIVATE']).notNullable().defaultTo('PUBLIC');
    table.string('join_code', 32).nullable();
    table.decimal('starting_capital', 19, 4).notNullable().defaultTo(100000.0000);
    table.integer('max_participants').notNullable().defaultTo(100);
    table.integer('min_participants').notNullable().defaultTo(2);
    table.timestamp('start_time').notNullable();
    table.timestamp('end_time').notNullable();
    table.json('allowed_instruments').nullable();
    table.json('permitted_order_types').notNullable();
    table
      .enum('status', ['DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'])
      .notNullable()
      .defaultTo('UPCOMING');
    table.timestamps(true, true);

    table.index(['status']);
    table.index(['start_time']);
    table.index(['end_time']);
    table.index(['creator_id']);
  });

  // 2. Competition Participants Table
  await knex.schema.createTable('competition_participants', (table) => {
    table.increments('id').primary();
    table
      .integer('competition_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('competitions')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.enum('status', ['JOINED', 'LEFT', 'DISQUALIFIED']).notNullable().defaultTo('JOINED');
    table.decimal('starting_capital', 19, 4).notNullable();
    table.decimal('current_portfolio_value', 19, 4).notNullable();
    table.decimal('total_return_percent', 10, 4).notNullable().defaultTo(0.0000);
    table.integer('rank').nullable();
    table.integer('trade_count').notNullable().defaultTo(0);
    table.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.unique(['competition_id', 'user_id']);
    table.index(['competition_id', 'rank']);
    table.index(['user_id']);
  });

  // 3. Competition Accounts (Isolated Cash Balances)
  await knex.schema.createTable('competition_accounts', (table) => {
    table.increments('id').primary();
    table
      .integer('competition_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('competitions')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.decimal('available_cash', 19, 4).notNullable();
    table.decimal('reserved_cash', 19, 4).notNullable().defaultTo(0.0000);
    table.timestamps(true, true);

    table.unique(['competition_id', 'user_id']);
  });

  // 4. Competition Positions (Isolated Holdings)
  await knex.schema.createTable('competition_positions', (table) => {
    table.increments('id').primary();
    table
      .integer('competition_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('competitions')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('instrument_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('instruments')
      .onDelete('CASCADE');
    table.decimal('quantity', 18, 4).notNullable().defaultTo(0.0000);
    table.decimal('reserved_quantity', 18, 4).notNullable().defaultTo(0.0000);
    table.decimal('average_entry_price', 18, 4).notNullable().defaultTo(0.0000);
    table.decimal('realized_pnl', 19, 4).notNullable().defaultTo(0.0000);
    table.timestamps(true, true);

    table.unique(['competition_id', 'user_id', 'instrument_id']);
  });

  // 5. Competition Orders
  await knex.schema.createTable('competition_orders', (table) => {
    table.increments('id').primary();
    table
      .integer('competition_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('competitions')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('instrument_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('instruments')
      .onDelete('CASCADE');
    table.enum('side', ['BUY', 'SELL']).notNullable();
    table.enum('order_type', ['LIMIT', 'MARKET']).notNullable();
    table.decimal('quantity', 18, 4).notNullable();
    table.decimal('filled_quantity', 18, 4).notNullable().defaultTo(0.0000);
    table.decimal('remaining_quantity', 18, 4).notNullable();
    table.decimal('limit_price', 18, 4).nullable();
    table
      .enum('status', ['PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED'])
      .notNullable()
      .defaultTo('OPEN');
    table.string('idempotency_key', 64).nullable();
    table.timestamps(true, true);

    table.index(['competition_id', 'user_id']);
    table.index(['competition_id', 'instrument_id', 'status']);
  });

  // 6. Competition Trades
  await knex.schema.createTable('competition_trades', (table) => {
    table.increments('id').primary();
    table.string('trade_reference', 64).notNullable().unique();
    table
      .integer('competition_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('competitions')
      .onDelete('CASCADE');
    table
      .integer('buy_order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('competition_orders')
      .onDelete('RESTRICT');
    table
      .integer('sell_order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('competition_orders')
      .onDelete('RESTRICT');
    table
      .integer('buyer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .integer('seller_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .integer('instrument_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('instruments')
      .onDelete('CASCADE');
    table.decimal('price', 18, 4).notNullable();
    table.decimal('quantity', 18, 4).notNullable();
    table.decimal('amount', 19, 4).notNullable();
    table.timestamp('executed_at').notNullable().defaultTo(knex.fn.now());

    table.index(['competition_id', 'executed_at']);
    table.index(['buyer_id']);
    table.index(['seller_id']);
  });

  // 7. Competition Leaderboard Snapshots
  await knex.schema.createTable('competition_leaderboard_snapshots', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('competition_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('competitions')
      .onDelete('CASCADE');
    table.boolean('is_final').notNullable().defaultTo(false);
    table.json('snapshot_data').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['competition_id', 'is_final', 'created_at']);
  });

  // 8. Competition Audit Logs
  await knex.schema.createTable('competition_audit_logs', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('competition_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('competitions')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('action', 64).notNullable();
    table.json('details').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['competition_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('competition_audit_logs');
  await knex.schema.dropTableIfExists('competition_leaderboard_snapshots');
  await knex.schema.dropTableIfExists('competition_trades');
  await knex.schema.dropTableIfExists('competition_orders');
  await knex.schema.dropTableIfExists('competition_positions');
  await knex.schema.dropTableIfExists('competition_accounts');
  await knex.schema.dropTableIfExists('competition_participants');
  await knex.schema.dropTableIfExists('competitions');
}
