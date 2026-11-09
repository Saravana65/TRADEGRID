import { Knex } from 'knex';
import argon2 from 'argon2';

export async function seed(knex: Knex): Promise<void> {
  // Clear existing records in reverse dependency order
  await knex('ledger_entries').del();
  await knex('ledger_transactions').del();
  await knex('wallets').del();
  await knex('ledger_accounts').del();
  await knex('user_sessions').del();
  await knex('users').del();

  const adminPasswordHash = await argon2.hash('Admin@12345', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const traderPasswordHash = await argon2.hash('Trader@12345', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  // 1. Seed Users
  await knex('users').insert([
    {
      id: 1,
      email: 'admin@tradegrid.internal',
      username: 'admin',
      password_hash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      email: 'trader@tradegrid.internal',
      username: 'trader_demo',
      password_hash: traderPasswordHash,
      role: 'TRADER',
      status: 'ACTIVE',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // 2. Seed System Ledger Accounts
  const [systemIssuanceId] = await knex('ledger_accounts').insert({
    account_type: 'SYSTEM_EQUITY_ISSUANCE',
    owner_user_id: null,
    currency: 'USD',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  await knex('ledger_accounts').insert([
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

  // 3. Seed User Ledger Accounts & Wallets
  const initialBalance = '100000.0000';

  for (const userId of [1, 2]) {
    const [accountId] = await knex('ledger_accounts').insert({
      account_type: 'USER_WALLET',
      owner_user_id: userId,
      currency: 'USD',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    await knex('wallets').insert({
      user_id: userId,
      currency: 'USD',
      available_balance: initialBalance,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    // Balanced Ledger Transaction for initial funding
    const [txId] = await knex('ledger_transactions').insert({
      transaction_reference: `INIT-SEED-USER-${userId}`,
      transaction_type: 'INITIAL_SIGNUP_GRANT',
      description: 'Initial virtual capital grant for seeded account',
      idempotency_key: `seed-user-${userId}`,
      created_by: 1, // system admin
      created_at: knex.fn.now(),
    });

    // Double-Entry Balanced Line Items
    // DEBIT User Wallet (Asset increases)
    // CREDIT System Issuance (Equity increases)
    await knex('ledger_entries').insert([
      {
        ledger_transaction_id: txId,
        account_id: accountId,
        entry_type: 'DEBIT',
        amount: initialBalance,
        created_at: knex.fn.now(),
      },
      {
        ledger_transaction_id: txId,
        account_id: systemIssuanceId,
        entry_type: 'CREDIT',
        amount: initialBalance,
        created_at: knex.fn.now(),
      },
    ]);
  }
}
