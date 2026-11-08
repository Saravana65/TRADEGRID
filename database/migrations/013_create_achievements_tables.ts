import type { Knex } from 'knex';

/**
 * Migration 013: Create Trader Achievements and Gamification Tables
 *
 * Tables:
 * 1. achievement_definitions: Master catalog of badges, points, and criteria
 * 2. user_achievements: Immutable unlock records with UNIQUE(user_id, achievement_code)
 * 3. achievement_progress: Progress tracking for incremental milestones (e.g. 7/10 trades)
 * 4. user_achievement_stats: Aggregated trader stats (XP points, Level, Rank title)
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Master Definitions Table
  await knex.schema.createTable('achievement_definitions', (table) => {
    table.increments('id').primary();
    table.string('code', 64).notNullable().unique();
    table
      .enum('category', ['BACKTESTING', 'COMPETITION', 'TRADING', 'LEARNING'])
      .notNullable();
    table.string('name', 128).notNullable();
    table.text('description').notNullable();
    table.string('badge_icon', 64).notNullable();
    table.integer('points').notNullable().defaultTo(10);
    table.integer('required_progress').notNullable().defaultTo(1);
    table.timestamps(true, true);

    table.index(['category']);
  });

  // 2. User Unlocked Achievements Table (Idempotent per user & code)
  await knex.schema.createTable('user_achievements', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('achievement_code', 64).notNullable();
    table.timestamp('unlocked_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id', 'achievement_code']);
    table.index(['user_id']);
  });

  // 3. User Achievement Progress Tracking Table
  await knex.schema.createTable('achievement_progress', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('achievement_code', 64).notNullable();
    table.integer('current_progress').notNullable().defaultTo(0);
    table.integer('target_progress').notNullable().defaultTo(1);
    table.boolean('is_completed').notNullable().defaultTo(false);
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id', 'achievement_code']);
    table.index(['user_id']);
  });

  // 4. Aggregated User Stats (Points, Level, Badges Count)
  await knex.schema.createTable('user_achievement_stats', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.integer('total_points').notNullable().defaultTo(0);
    table.integer('current_level').notNullable().defaultTo(1);
    table.string('title', 64).notNullable().defaultTo('Novice Trader');
    table.integer('achievements_unlocked_count').notNullable().defaultTo(0);
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['total_points']);
  });

  // Seed standard achievements
  const standardDefinitions = [
    // Backtesting
    {
      code: 'FIRST_BACKTEST',
      category: 'BACKTESTING',
      name: 'Pioneering Quant',
      description: 'Execute your first algorithmic strategy backtest.',
      badge_icon: 'Cpu',
      points: 10,
      required_progress: 1,
    },
    {
      code: 'STRATEGY_EXPLORER',
      category: 'BACKTESTING',
      name: 'Strategy Explorer',
      description: 'Run backtests across at least 3 distinct algorithmic strategies.',
      badge_icon: 'Layers',
      points: 25,
      required_progress: 3,
    },
    {
      code: 'BACKTEST_10',
      category: 'BACKTESTING',
      name: 'Systematic Tester',
      description: 'Complete 10 quantitative backtests.',
      badge_icon: 'Activity',
      points: 50,
      required_progress: 10,
    },
    {
      code: 'BACKTEST_50',
      category: 'BACKTESTING',
      name: 'Quant Laboratory',
      description: 'Execute 50 rigorous quantitative backtests.',
      badge_icon: 'FlaskConical',
      points: 100,
      required_progress: 50,
    },
    {
      code: 'RISK_CONSCIOUS',
      category: 'BACKTESTING',
      name: 'Risk Conscious',
      description: 'Run a backtest with custom Stop-Loss and Take-Profit risk controls.',
      badge_icon: 'Shield',
      points: 30,
      required_progress: 1,
    },

    // Competition
    {
      code: 'FIRST_COMPETITION_JOINED',
      category: 'COMPETITION',
      name: 'Contender',
      description: 'Register and enter your first trading tournament.',
      badge_icon: 'Trophy',
      points: 10,
      required_progress: 1,
    },
    {
      code: 'COMPETITION_TRADER',
      category: 'COMPETITION',
      name: 'Arena Combatant',
      description: 'Execute your first trade inside an active tournament.',
      badge_icon: 'Swords',
      points: 25,
      required_progress: 1,
    },
    {
      code: 'TOP_10_FINISH',
      category: 'COMPETITION',
      name: 'Leaderboard Elite',
      description: 'Finish in the Top 10 of an official trading competition.',
      badge_icon: 'Medal',
      points: 50,
      required_progress: 1,
    },
    {
      code: 'COMPETITIONS_5',
      category: 'COMPETITION',
      name: 'Tournament Veteran',
      description: 'Participate in 5 multiplayer trading tournaments.',
      badge_icon: 'Award',
      points: 75,
      required_progress: 5,
    },
    {
      code: 'COMPETITION_WINNER',
      category: 'COMPETITION',
      name: 'Grand Champion',
      description: 'Win 1st place in a multiplayer trading competition.',
      badge_icon: 'Crown',
      points: 150,
      required_progress: 1,
    },

    // Trading
    {
      code: 'FIRST_TRADE',
      category: 'TRADING',
      name: 'First Execution',
      description: 'Execute your first stock trade through the matching engine.',
      badge_icon: 'Zap',
      points: 10,
      required_progress: 1,
    },
    {
      code: 'TRADES_10',
      category: 'TRADING',
      name: 'Active Flow',
      description: 'Complete 10 settled market or limit order trades.',
      badge_icon: 'TrendingUp',
      points: 25,
      required_progress: 10,
    },
    {
      code: 'TRADES_50',
      category: 'TRADING',
      name: 'Seasoned Trader',
      description: 'Complete 50 settled market or limit order trades.',
      badge_icon: 'BarChart2',
      points: 75,
      required_progress: 50,
    },
    {
      code: 'TRADES_100',
      category: 'TRADING',
      name: 'Centurion Flow',
      description: 'Complete 100 settled market or limit order trades.',
      badge_icon: 'Flame',
      points: 150,
      required_progress: 100,
    },
    {
      code: 'DIVERSIFIED_TRADER',
      category: 'TRADING',
      name: 'Sector Diversified',
      description: 'Simultaneously hold portfolio positions across 3 or more sectors.',
      badge_icon: 'PieChart',
      points: 40,
      required_progress: 3,
    },

    // Learning & Social
    {
      code: 'CHART_CUSTOMIZER',
      category: 'LEARNING',
      name: 'Chart Artisan',
      description: 'Customize and save your technical chart studio workspace.',
      badge_icon: 'Sliders',
      points: 15,
      required_progress: 1,
    },
    {
      code: 'INDICATOR_ANALYST',
      category: 'LEARNING',
      name: 'Technical Analyst',
      description: 'Analyze an instrument using Estimated Volume Profile or multi-indicators.',
      badge_icon: 'LineChart',
      points: 20,
      required_progress: 1,
    },
    {
      code: 'PORTFOLIO_REVIEWED',
      category: 'LEARNING',
      name: 'Prudent Investor',
      description: 'Generate an AI Portfolio Health & Concentration Risk review.',
      badge_icon: 'Sparkles',
      points: 20,
      required_progress: 1,
    },
    {
      code: 'CHAT_PARTICIPANT',
      category: 'LEARNING',
      name: 'Community Voice',
      description: 'Participate in trader discussions in Global Chat or a Symbol Room.',
      badge_icon: 'MessageSquare',
      points: 15,
      required_progress: 1,
    },
  ];

  await knex('achievement_definitions').insert(standardDefinitions);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_achievement_stats');
  await knex.schema.dropTableIfExists('achievement_progress');
  await knex.schema.dropTableIfExists('user_achievements');
  await knex.schema.dropTableIfExists('achievement_definitions');
}
