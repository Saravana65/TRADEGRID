import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable().unique();
    table.string('username', 50).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.enum('role', ['TRADER', 'ADMIN']).notNullable().defaultTo('TRADER');
    table.enum('status', ['ACTIVE', 'SUSPENDED']).notNullable().defaultTo('ACTIVE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes for high-speed lookup on credentials
    table.index(['email'], 'idx_users_email');
    table.index(['username'], 'idx_users_username');
    table.index(['role'], 'idx_users_role');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
