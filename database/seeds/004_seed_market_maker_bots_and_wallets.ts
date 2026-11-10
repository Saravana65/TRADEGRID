import { Knex } from 'knex';
import argon2 from 'argon2';

export async function seed(knex: Knex): Promise<void> {
  const users = await knex('users').select('*');
  const instruments = await knex('instruments').select('*');

  // 1. Ensure System Issuance Account exists
  let systemIssuance = await knex('ledger_accounts')
    .where({ account_type: 'SYSTEM_EQUITY_ISSUANCE', currency: 'USD' })
    .first();

  if (!systemIssuance) {
    const [sysId] = await knex('ledger_accounts').insert({
      account_type: 'SYSTEM_EQUITY_ISSUANCE',
      owner_user_id: null,
      currency: 'USD',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    systemIssuance = { id: sysId };
  }

  // 2. Ensure Funded Wallets for all registered users
  for (const user of users) {
    let wallet = await knex('wallets').where({ user_id: user.id }).first();
    let account = await knex('ledger_accounts')
      .where({ owner_user_id: user.id, account_type: 'USER_WALLET' })
      .first();

    if (!account) {
      const [accId] = await knex('ledger_accounts').insert({
        account_type: 'USER_WALLET',
        owner_user_id: user.id,
        currency: 'USD',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
      account = { id: accId };
    }

    const defaultBalance = user.role === 'ADMIN' ? '10000000.0000' : '100000.0000';

    if (!wallet) {
      await knex('wallets').insert({
        user_id: user.id,
        currency: 'USD',
        available_balance: defaultBalance,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Balanced ledger grant
      const [txId] = await knex('ledger_transactions').insert({
        transaction_reference: `INIT-SEED-WALLET-${user.id}-${Date.now()}`,
        transaction_type: 'INITIAL_SIGNUP_GRANT',
        description: `Initial virtual capital funding for ${user.username}`,
        idempotency_key: `seed-wallet-user-${user.id}`,
        created_by: 1,
        created_at: knex.fn.now(),
      });

      await knex('ledger_entries').insert([
        {
          ledger_transaction_id: txId,
          account_id: account.id,
          entry_type: 'DEBIT',
          amount: defaultBalance,
          created_at: knex.fn.now(),
        },
        {
          ledger_transaction_id: txId,
          account_id: systemIssuance.id,
          entry_type: 'CREDIT',
          amount: defaultBalance,
          created_at: knex.fn.now(),
        },
      ]);
    } else if (parseFloat(wallet.available_balance) < 50000) {
      // Top up wallet
      await knex('wallets').where({ id: wallet.id }).update({
        available_balance: defaultBalance,
        updated_at: knex.fn.now(),
      });
    }

    // Give admin user inventory across all instruments so admin can act as exchange liquidity counterparty
    if (user.role === 'ADMIN') {
      for (const inst of instruments) {
        const existingPos = await knex('portfolio_positions')
          .where({ user_id: user.id, instrument_id: inst.id })
          .first();

        if (!existingPos) {
          await knex('portfolio_positions').insert({
            user_id: user.id,
            instrument_id: inst.id,
            quantity: '10000.0000',
            average_buy_price: '100.0000',
            realized_pnl: '0.0000',
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
          });
        }
      }
    }
  }

  // 3. Create or Update Autonomous Market Maker Bot
  let botUser = await knex('users').where({ username: 'market_maker_alpha' }).first();
  if (!botUser) {
    const hash = await argon2.hash('BotPass@12345');
    const [botUserId] = await knex('users').insert({
      email: 'bot_alpha@tradegrid.internal',
      username: 'market_maker_alpha',
      password_hash: hash,
      role: 'TRADER',
      status: 'ACTIVE',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    botUser = { id: botUserId };
  }

  // Ensure Bot Wallet
  let botWallet = await knex('wallets').where({ user_id: botUser.id }).first();
  if (!botWallet) {
    const [botAccId] = await knex('ledger_accounts').insert({
      account_type: 'USER_WALLET',
      owner_user_id: botUser.id,
      currency: 'USD',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    await knex('wallets').insert({
      user_id: botUser.id,
      currency: 'USD',
      available_balance: '5000000.0000',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    const [txId] = await knex('ledger_transactions').insert({
      transaction_reference: `INIT-BOT-WALLET-${botUser.id}-${Date.now()}`,
      transaction_type: 'INITIAL_SIGNUP_GRANT',
      description: 'Bot liquidity capital grant',
      idempotency_key: `seed-bot-wallet-${botUser.id}`,
      created_by: 1,
      created_at: knex.fn.now(),
    });

    await knex('ledger_entries').insert([
      {
        ledger_transaction_id: txId,
        account_id: botAccId,
        entry_type: 'DEBIT',
        amount: '5000000.0000',
        created_at: knex.fn.now(),
      },
      {
        ledger_transaction_id: txId,
        account_id: systemIssuance.id,
        entry_type: 'CREDIT',
        amount: '5000000.0000',
        created_at: knex.fn.now(),
      },
    ]);
  }

  // Bot share inventory for all instruments
  for (const inst of instruments) {
    const botPos = await knex('portfolio_positions')
      .where({ user_id: botUser.id, instrument_id: inst.id })
      .first();

    if (!botPos) {
      await knex('portfolio_positions').insert({
        user_id: botUser.id,
        instrument_id: inst.id,
        quantity: '5000.0000',
        average_buy_price: '100.0000',
        realized_pnl: '0.0000',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }
  }

  // Bot registry row
  let botRecord = await knex('bots').where({ user_id: botUser.id }).first();
  if (!botRecord) {
    const [botId] = await knex('bots').insert({
      user_id: botUser.id,
      name: 'Alpha Market Maker Bot',
      strategy_type: 'BALANCED_MM',
      status: 'ACTIVE',
      allocated_capital: '5000000.0000',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    botRecord = { id: botId };

    await knex('bot_configurations').insert({
      bot_id: botRecord.id,
      quote_refresh_interval_ms: 3000,
      spread_bps: '25.00',
      order_quantity: '10.0000',
      max_order_quantity: '50.0000',
      max_order_notional: '25000.0000',
      max_inventory_per_instrument: '5000.0000',
      max_total_exposure: '500000.0000',
      max_open_orders: 20,
      max_daily_loss: '50000.0000',
      skew_factor: '0.1000',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    for (const inst of instruments) {
      await knex('bot_instruments').insert({
        bot_id: botRecord.id,
        instrument_id: inst.id,
        is_enabled: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }
  }

  // 4. Seed/Update Competitions with Registration Deadlines, IST Schedule, and Rules
  const nowMs = Date.now();
  const dayMs = 86400000;
  const hourMs = 3600000;

  // #1: LIVE ACTIVE Tournament (Registration Closed, Currently Trading)
  await knex('competitions').where({ id: 1 }).update({
    registration_start_time: new Date(nowMs - 2 * dayMs),
    registration_end_time: new Date(nowMs - 2 * hourMs),
    start_time: new Date(nowMs - hourMs),
    end_time: new Date(nowMs + 8 * hourMs),
    status: 'ACTIVE',
    rules: 'NIFTY 50 Intraday Momentum Rules:\n1. Dedicated ₹5,00,000 isolated starting capital.\n2. FIFO Price-Time matching on top large-caps.\n3. Intraday squaring at 15:30 IST.\n4. Maximum 5 open orders per symbol.',
  });

  // #2: REGISTRATION_OPEN Tournament (Registration Open, Starting Tomorrow)
  await knex('competitions').where({ id: 2 }).update({
    registration_start_time: new Date(nowMs - dayMs),
    registration_end_time: new Date(nowMs + 12 * hourMs),
    start_time: new Date(nowMs + 14 * hourMs),
    end_time: new Date(nowMs + 38 * hourMs),
    status: 'REGISTRATION_OPEN',
    rules: 'Quant Alpha Breakout Championship:\n1. Multi-asset swing momentum on growth equities.\n2. Registration closes 2 hours before market open.\n3. Position sizing capped at 25% portfolio per asset.\n4. Verified double-entry settlement.',
  });

  // #3: UPCOMING Tournament (Registration Opens Soon)
  await knex('competitions').where({ id: 3 }).update({
    registration_start_time: new Date(nowMs + 6 * hourMs),
    registration_end_time: new Date(nowMs + 30 * hourMs),
    start_time: new Date(nowMs + 32 * hourMs),
    end_time: new Date(nowMs + 72 * hourMs),
    status: 'UPCOMING',
    rules: 'Weekend Algorithmic Sprint:\n1. 48-hour automated trading contest.\n2. Registration opens tonight at 20:00 IST.\n3. Minimum 5 distinct trades required for leaderboard eligibility.\n4. Top 3 gainers win virtual Alpha badges.',
  });

  // #4: PRIVATE Tournament (Registration Open with code ALPHA2026)
  await knex('competitions').where({ id: 4 }).update({
    registration_start_time: new Date(nowMs - 12 * hourMs),
    registration_end_time: new Date(nowMs + 24 * hourMs),
    start_time: new Date(nowMs + 26 * hourMs),
    end_time: new Date(nowMs + 60 * hourMs),
    status: 'REGISTRATION_OPEN',
    rules: 'Private Institutional Invitational:\n1. Restricted to invited quantitative traders.\n2. Join code required: ALPHA2026.\n3. Starting capital: ₹20,00,000.\n4. Advanced algorithmic and manual execution allowed.',
  });

  // #5: Seed a COMPLETED Tournament for "Completed Competitions" & History tab
  const existingCompleted = await knex('competitions').where({ name: 'Apex Premier League Season 1' }).first();
  if (!existingCompleted) {
    const [cId] = await knex('competitions').insert({
      name: 'Apex Premier League Season 1',
      description: 'The inaugural TradeGrid virtual trading championship. Completed with record participant volume.',
      rules: 'Standard institutional FIFO rules. Results verified server-authoritative.',
      creator_id: 1,
      visibility: 'PUBLIC',
      starting_capital: '1000000.0000',
      max_participants: 500,
      min_participants: 2,
      registration_start_time: new Date(nowMs - 10 * dayMs),
      registration_end_time: new Date(nowMs - 7 * dayMs),
      start_time: new Date(nowMs - 7 * dayMs),
      end_time: new Date(nowMs - 3 * dayMs),
      allowed_instruments: JSON.stringify(['RELIANCE', 'TCS', 'INFY', 'TGRID']),
      permitted_order_types: JSON.stringify(['LIMIT', 'MARKET']),
      status: 'COMPLETED',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    // Seed winner participant
    await knex('competition_participants').insert({
      competition_id: cId,
      user_id: 2,
      status: 'JOINED',
      starting_capital: '1000000.0000',
      current_portfolio_value: '1184500.0000',
      total_return_percent: '18.4500',
      rank: 1,
      trade_count: 14,
      joined_at: new Date(nowMs - 8 * dayMs),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  }
}
