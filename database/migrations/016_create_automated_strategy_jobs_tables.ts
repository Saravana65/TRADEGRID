import type { Knex } from 'knex';

/**
 * Migration 016: Create Automated Strategy Jobs & Runner Orders Tables
 *
 * Implements persistent database infrastructure for Phase 9D: Background Strategy
 * Runner & Automated Virtual Trading.
 *
 * Tables:
 * 1. automated_strategy_jobs: Persistent background strategy execution jobs,
 *    scheduling configuration, lifecycle states, risk limits, and checkpoints.
 * 2. automated_strategy_orders: Audit tracking linking automated runner signals
 *    to virtual orders processed by the TradeGrid Order Management System (OMS).
 *
 * Strict isolation:
 * - Foreign key constraints to users and user_strategies with CASCADE deletion
 * - Strict virtual account boundaries (zero real-money/broker routing)
 * - Complete audit trail of strategy signals to executed orders
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Automated Strategy Jobs Master Table
  await knex.schema.createTable('automated_strategy_jobs', (table) => {
    table.increments('id').primary();
    table.string('job_id', 64).notNullable().unique();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('strategy_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('user_strategies')
      .onDelete('CASCADE');
    table.integer('strategy_version').notNullable().defaultTo(1);
    table.string('instrument_symbol', 32).notNullable();
    table.string('timeframe', 8).notNullable().defaultTo('15m');
    table
      .enum('status', [
        'CREATED',
        'QUEUED',
        'RUNNING',
        'PAUSED',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
      ])
      .notNullable()
      .defaultTo('CREATED');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.json('risk_limits').nullable();
    table.dateTime('last_processed_candle_time').nullable();
    table.string('last_signal', 16).nullable();
    table.dateTime('last_signal_time').nullable();
    table.integer('total_signals_count').notNullable().defaultTo(0);
    table.integer('total_orders_count').notNullable().defaultTo(0);
    table.integer('consecutive_failures_count').notNullable().defaultTo(0);
    table.text('error_details').nullable();
    table.dateTime('started_at').nullable();
    table.dateTime('stopped_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['user_id']);
    table.index(['strategy_id']);
    table.index(['status']);
    table.index(['user_id', 'status']);
    table.index(['user_id', 'strategy_id']);
  });

  // 2. Automated Strategy Generated Orders Audit Table
  await knex.schema.createTable('automated_strategy_orders', (table) => {
    table.increments('id').primary();
    table.string('job_id', 64).notNullable();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('orders')
      .onDelete('CASCADE');
    table.string('signal_type', 8).notNullable();
    table.decimal('order_price', 18, 4).notNullable();
    table.decimal('order_quantity', 18, 4).notNullable();
    table.string('idempotency_key', 128).notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['job_id']);
    table.index(['user_id']);
    table.index(['order_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('automated_strategy_orders');
  await knex.schema.dropTableIfExists('automated_strategy_jobs');
}
