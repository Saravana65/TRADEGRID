import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Check if competitions already exist
  const existingCount = await knex('competitions').count('id as count').first();
  if (existingCount && Number(existingCount.count) > 0) {
    return;
  }

  // Get admin user as creator
  const adminUser = await knex('users').where({ role: 'ADMIN' }).first();
  const creatorId = adminUser ? adminUser.id : 1;

  // Get test trader user if available
  const traderUser = await knex('users').where({ role: 'TRADER' }).first();
  const traderId = traderUser ? traderUser.id : 2;

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
  const fourHoursAgo = new Date(now.getTime() - 4 * 3600 * 1000);
  const sixHoursLater = new Date(now.getTime() + 6 * 3600 * 1000);
  const twentyHoursLater = new Date(now.getTime() + 20 * 3600 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 3600 * 1000);

  // 1. Insert Competitions
  const [comp1Id] = await knex('competitions').insert({
    name: 'NIFTY 50 Intraday Momentum Sprint',
    description: 'High-frequency momentum tournament across top Indian large-cap equities. Live L2 order book simulation with isolated virtual capital.',
    creator_id: creatorId,
    visibility: 'PUBLIC',
    starting_capital: 500000.0000,
    max_participants: 100,
    min_participants: 2,
    start_time: twoHoursAgo,
    end_time: sixHoursLater,
    allowed_instruments: JSON.stringify(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    permitted_order_types: JSON.stringify(['LIMIT', 'MARKET']),
    status: 'ACTIVE',
  });

  const [comp2Id] = await knex('competitions').insert({
    name: 'Quant Alpha Breakout Championship',
    description: 'Multi-stock swing breakout tournament. Compete on risk-adjusted ROI and disciplined position sizing.',
    creator_id: creatorId,
    visibility: 'PUBLIC',
    starting_capital: 1000000.0000,
    max_participants: 50,
    min_participants: 2,
    start_time: fourHoursAgo,
    end_time: twentyHoursLater,
    allowed_instruments: JSON.stringify(['AERO', 'CYBER', 'NEXUS', 'TITAN', 'QUANTUM']),
    permitted_order_types: JSON.stringify(['LIMIT', 'MARKET']),
    status: 'ACTIVE',
  });

  await knex('competitions').insert({
    name: 'Weekend Algorithmic Sprint',
    description: '48-hour automated trading sprint testing quant signal models against historical volatility catalysts.',
    creator_id: creatorId,
    visibility: 'PUBLIC',
    starting_capital: 250000.0000,
    max_participants: 200,
    min_participants: 2,
    start_time: tomorrow,
    end_time: dayAfterTomorrow,
    allowed_instruments: JSON.stringify(['TGRID', 'SOLARIS', 'NOVA', 'TERRA', 'VORTEX']),
    permitted_order_types: JSON.stringify(['LIMIT', 'MARKET']),
    status: 'UPCOMING',
  });

  await knex('competitions').insert({
    name: 'Private Institutional Invitational',
    description: 'Exclusive private arena for verified quantitative desks. Requires invite code.',
    creator_id: creatorId,
    visibility: 'PRIVATE',
    join_code: 'ALPHA2026',
    starting_capital: 2000000.0000,
    max_participants: 25,
    min_participants: 2,
    start_time: tomorrow,
    end_time: dayAfterTomorrow,
    allowed_instruments: JSON.stringify(['RELIANCE', 'TCS', 'INFY', 'AERO', 'TGRID']),
    permitted_order_types: JSON.stringify(['LIMIT', 'MARKET']),
    status: 'UPCOMING',
  });

  // 2. Enroll traderUser in Competition 1 and 2
  if (traderId) {
    // Comp 1 participant & account
    await knex('competition_participants').insert({
      competition_id: comp1Id,
      user_id: traderId,
      status: 'JOINED',
      starting_capital: 500000.0000,
      current_portfolio_value: 512400.0000,
      total_return_percent: 2.4800,
      rank: 1,
      trade_count: 3,
    });
    await knex('competition_accounts').insert({
      competition_id: comp1Id,
      user_id: traderId,
      available_cash: 485000.0000,
      reserved_cash: 0.0000,
    });

    // Comp 2 participant & account
    await knex('competition_participants').insert({
      competition_id: comp2Id,
      user_id: traderId,
      status: 'JOINED',
      starting_capital: 1000000.0000,
      current_portfolio_value: 1018500.0000,
      total_return_percent: 1.8500,
      rank: 1,
      trade_count: 2,
    });
    await knex('competition_accounts').insert({
      competition_id: comp2Id,
      user_id: traderId,
      available_cash: 950000.0000,
      reserved_cash: 0.0000,
    });
  }

  // Also enroll Admin in Comp 1 for leaderboard competition
  if (adminUser && adminUser.id !== traderId) {
    await knex('competition_participants').insert({
      competition_id: comp1Id,
      user_id: adminUser.id,
      status: 'JOINED',
      starting_capital: 500000.0000,
      current_portfolio_value: 506200.0000,
      total_return_percent: 1.2400,
      rank: 2,
      trade_count: 2,
    });
    await knex('competition_accounts').insert({
      competition_id: comp1Id,
      user_id: adminUser.id,
      available_cash: 470000.0000,
      reserved_cash: 0.0000,
    });
  }
}
