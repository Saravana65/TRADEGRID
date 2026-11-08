import type { Knex } from 'knex';

/**
 * Migration 014: Create User Custom Strategies & Versioning Tables
 *
 * Persists user-authored custom algorithmic trading strategies written in the
 * safe, non-arbitrary TRADEGRID Strategy DSL.
 *
 * Tables:
 * 1. user_strategies: Primary strategy definitions owned by a user
 * 2. strategy_versions: Immutable historical snapshots of strategy iterations
 *
 * Strict isolation: user_id foreign key with CASCADE deletion and composite indexes.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. User Strategies Master Table
  await knex.schema.createTable('user_strategies', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('name', 128).notNullable();
    table.text('description').nullable();
    table.string('instrument_symbol', 32).notNullable().defaultTo('NSE:RELIANCE');
    table.string('timeframe', 8).notNullable().defaultTo('15m');
    table.text('dsl_code').notNullable();
    table.boolean('is_valid').notNullable().defaultTo(false);
    table.integer('version').notNullable().defaultTo(1);
    table.timestamps(true, true);

    table.index(['user_id']);
    table.index(['user_id', 'name']);
  });

  // 2. Strategy Versions History Table
  await knex.schema.createTable('strategy_versions', (table) => {
    table.increments('id').primary();
    table
      .integer('strategy_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('user_strategies')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.integer('version').notNullable();
    table.text('dsl_code').notNullable();
    table.json('ast_snapshot').nullable();
    table.text('changelog').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['strategy_id', 'version']);
    table.index(['strategy_id']);
    table.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('strategy_versions');
  await knex.schema.dropTableIfExists('user_strategies');
}
