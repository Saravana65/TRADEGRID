import { Knex } from 'knex';
import argon2 from 'argon2';

export async function seed(knex: Knex): Promise<void> {
  // Clear existing records to ensure idempotency during development resets
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
}
