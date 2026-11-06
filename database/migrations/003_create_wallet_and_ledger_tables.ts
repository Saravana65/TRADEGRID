import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Ledger Accounts (General Ledger Chart of Accounts)
  await knex.schema.createTable('ledger_accounts', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table
      .enum('account_type', [
        'USER_WALLET',
        'SYSTEM_EQUITY_ISSUANCE',
        'SYSTEM_ADJUSTMENT',
        'SYSTEM_FEE',
      ])
      .notNullable();
    table
      .bigInteger('owner_user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('currency', 10).notNullable().defaultTo('USD');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes & Uniqueness: User has at most one account per type & currency; System accounts are unique
    table.unique(['account_type', 'owner_user_id', 'currency'], {
      indexName: 'uniq_ledger_acc_type_user_curr',
    });
    table.index(['owner_user_id'], 'idx_ledger_acc_owner');
    table.index(['account_type'], 'idx_ledger_acc_type');
  });

  // 2. Wallets (Materialized balance cache for fast reads, synchronized with ledger)
  await knex.schema.createTable('wallets', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('currency', 10).notNullable().defaultTo('USD');
    table.decimal('available_balance', 19, 4).notNullable().defaultTo('0.0000');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['user_id'], 'idx_wallets_user_id');
  });

  // 3. Ledger Transactions (Journal Transaction Headers)
  await knex.schema.createTable('ledger_transactions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.string('transaction_reference', 64).notNullable().unique();
    table
      .enum('transaction_type', [
        'INITIAL_SIGNUP_GRANT',
        'ADMIN_CREDIT',
        'ADMIN_DEBIT',
        'SYSTEM_ADJUSTMENT',
        'TRADE_BUY',
        'TRADE_SELL',
        'FEE',
      ])
      .notNullable();
    table.string('description', 255).notNullable();
    table.string('idempotency_key', 128).nullable().unique();
    table
      .bigInteger('created_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['transaction_reference'], 'idx_lt_ref');
    table.index(['transaction_type'], 'idx_lt_type');
    table.index(['idempotency_key'], 'idx_lt_idempotency');
    table.index(['created_at'], 'idx_lt_created_at');
  });

  // 4. Ledger Entries (Journal Line Items: Debits and Credits)
  await knex.schema.createTable('ledger_entries', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table
      .bigInteger('ledger_transaction_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('ledger_transactions')
      .onDelete('CASCADE');
    table
      .bigInteger('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('ledger_accounts')
      .onDelete('RESTRICT');
    table.enum('entry_type', ['DEBIT', 'CREDIT']).notNullable();
    table.decimal('amount', 19, 4).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['ledger_transaction_id'], 'idx_le_tx_id');
    table.index(['account_id'], 'idx_le_account_id');
    table.index(['account_id', 'created_at'], 'idx_le_account_created');
  });

  // 5. Initialize System Accounts for Double-Entry Balancing
  await knex('ledger_accounts').insert([
    {
      account_type: 'SYSTEM_EQUITY_ISSUANCE',
      owner_user_id: null,
      currency: 'USD',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      account_type: 'SYSTEM_ADJUSTMENT',
      owner_user_id: null,
      currency: 'USD',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      account_type: 'SYSTEM_FEE',
      owner_user_id: null,
      currency: 'USD',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ledger_entries');
  await knex.schema.dropTableIfExists('ledger_transactions');
  await knex.schema.dropTableIfExists('wallets');
  await knex.schema.dropTableIfExists('ledger_accounts');
}
