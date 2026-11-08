import type { Knex } from 'knex';

/**
 * Migration 015: Create Strategy Executions Table
 *
 * Persists isolated executions of custom user strategies against historical market data.
 * Records execution lifecycle states, signals generated, diagnostics, and error reporting.
 *
 * Strict isolation:
 * - user_id foreign key with CASCADE deletion
 * - strategy_id foreign key with CASCADE deletion
 * - Complete financial isolation: purely analytical; zero ledger or wallet mutations.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('strategy_executions', (table) => {
    table.increments('id').primary();
    table.string('execution_id', 64).notNullable().unique();
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
        'QUEUED',
        'VALIDATING',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
        'TIMED_OUT',
      ])
      .notNullable()
      .defaultTo('QUEUED');
    table.dateTime('start_date').notNullable();
    table.dateTime('end_date').notNullable();
    table.decimal('initial_capital', 19, 4).notNullable().defaultTo(100000.0);
    table.integer('total_signals_count').notNullable().defaultTo(0);
    table.integer('buy_signals_count').notNullable().defaultTo(0);
    table.integer('sell_signals_count').notNullable().defaultTo(0);
    table.json('signals_data').nullable();
    table.json('diagnostics').nullable();
    table.text('error_message').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();

    table.index(['user_id']);
    table.index(['strategy_id']);
    table.index(['status']);
    table.index(['user_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('strategy_executions');
}
