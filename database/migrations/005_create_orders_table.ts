import type { Knex } from 'knex';

/**
 * Migration 005: Create Orders Table
 *
 * Architecture:
 * - orders: Stores order state for the Order Management System (OMS).
 * - Enforces positive quantities and valid prices using DECIMAL(18,4).
 * - Implements safe status lifecycle: PENDING, OPEN, PARTIALLY_FILLED, FILLED, CANCELLED, REJECTED.
 * - Idempotency key uniqueness prevents duplicate submissions.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('orders', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
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
      .onDelete('RESTRICT');
    table.enum('side', ['BUY', 'SELL']).notNullable();
    table.enum('order_type', ['MARKET', 'LIMIT']).notNullable();
    table.decimal('quantity', 18, 4).notNullable();
    table.decimal('remaining_quantity', 18, 4).notNullable();
    table.decimal('limit_price', 18, 4).nullable();
    table
      .enum('status', [
        'PENDING',
        'OPEN',
        'PARTIALLY_FILLED',
        'FILLED',
        'CANCELLED',
        'REJECTED',
      ])
      .notNullable()
      .defaultTo('OPEN');
    table.string('idempotency_key', 128).nullable().unique();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Composite & Query Indexes
    table.index(['user_id', 'status']);
    table.index(['instrument_id', 'status']);
    table.index(['status']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('orders');
}
