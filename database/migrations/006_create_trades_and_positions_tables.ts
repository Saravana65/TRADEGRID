import type { Knex } from 'knex';

/**
 * Migration 006: Create Trades and Portfolio Positions Tables
 *
 * Architecture:
 * - trades: Authoritative audit ledger of executed order matches between buyers and sellers.
 * - portfolio_positions: Tracks each trader's net share holdings, weighted-average cost basis,
 *   and cumulative realized profit & loss per tradable instrument.
 * - Enforces fixed-point precision with DECIMAL(18,4) across quantities, prices, and amounts.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Trades / Executions Table
  await knex.schema.createTable('trades', (table) => {
    table.bigIncrements('id').primary();
    table.string('trade_reference', 64).notNullable().unique();
    table
      .integer('buy_order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('orders')
      .onDelete('RESTRICT');
    table
      .integer('sell_order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('orders')
      .onDelete('RESTRICT');
    table
      .integer('instrument_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('instruments')
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
    table.decimal('price', 18, 4).notNullable();
    table.decimal('quantity', 18, 4).notNullable();
    table.decimal('trade_amount', 18, 4).notNullable();
    table.decimal('buyer_fee', 18, 4).notNullable().defaultTo('0.0000');
    table.decimal('seller_fee', 18, 4).notNullable().defaultTo('0.0000');
    table
      .enum('status', ['SETTLED', 'FAILED', 'PENDING'])
      .notNullable()
      .defaultTo('SETTLED');
    table
      .bigInteger('settlement_transaction_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('ledger_transactions')
      .onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Audit and Query Indexes
    table.index(['buyer_id', 'created_at'], 'idx_trades_buyer_created');
    table.index(['seller_id', 'created_at'], 'idx_trades_seller_created');
    table.index(['instrument_id', 'created_at'], 'idx_trades_instrument_created');
    table.index(['buy_order_id'], 'idx_trades_buy_order');
    table.index(['sell_order_id'], 'idx_trades_sell_order');
    table.index(['trade_reference'], 'idx_trades_reference');
    table.index(['created_at'], 'idx_trades_created_at');
  });

  // 2. Portfolio Positions Table
  await knex.schema.createTable('portfolio_positions', (table) => {
    table.bigIncrements('id').primary();
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
      .onDelete('RESTRICT');
    table.decimal('quantity', 18, 4).notNullable().defaultTo('0.0000');
    table.decimal('average_buy_price', 18, 4).notNullable().defaultTo('0.0000');
    table.decimal('realized_pnl', 18, 4).notNullable().defaultTo('0.0000');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Exactly one position record per user and instrument
    table.unique(['user_id', 'instrument_id'], {
      indexName: 'uniq_user_instrument_position',
    });
    table.index(['user_id'], 'idx_positions_user_id');
    table.index(['instrument_id'], 'idx_positions_instrument_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('portfolio_positions');
  await knex.schema.dropTableIfExists('trades');
}
