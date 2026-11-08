import type { Knex } from 'knex';

/**
 * Migration 011: Create Quantitative Research, Strategy Backtesting & Signals Tables
 *
 * Tables:
 * 1. backtest_runs: Saved backtest runs, parameters, and high-level performance metrics
 * 2. backtest_trades: Individual simulated execution trades for each backtest run
 * 3. backtest_equity_snapshots: Time series equity curve points for charting
 * 4. quantitative_signals: Server-side calculated technical signals across market instruments
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Backtest Runs Table
  await knex.schema.createTable('backtest_runs', (table) => {
    table.increments('id').primary();
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
      .onDelete('CASCADE');
    table.string('symbol', 16).notNullable();
    table
      .enum('strategy_type', [
        'SMA_CROSSOVER',
        'EMA_CROSSOVER',
        'RSI_MOMENTUM',
        'MACD_TREND',
        'BOLLINGER_REVERSION',
        'BREAKOUT',
      ])
      .notNullable();
    table.string('interval', 8).notNullable().defaultTo('1d');
    table.timestamp('start_date').notNullable();
    table.timestamp('end_date').notNullable();
    table.decimal('initial_capital', 19, 4).notNullable();
    table.decimal('final_equity', 19, 4).notNullable();
    table.decimal('net_profit', 19, 4).notNullable();
    table.decimal('total_return_percent', 10, 4).notNullable();
    table.decimal('benchmark_return_percent', 10, 4).notNullable();
    table.decimal('cagr_percent', 10, 4).notNullable().defaultTo('0.0000');
    table.decimal('max_drawdown_percent', 10, 4).notNullable();
    table.decimal('sharpe_ratio', 10, 4).notNullable();
    table.decimal('sortino_ratio', 10, 4).notNullable();
    table.decimal('win_rate_percent', 10, 4).notNullable();
    table.decimal('profit_factor', 10, 4).notNullable();
    table.integer('total_trades').unsigned().notNullable();
    table.integer('winning_trades').unsigned().notNullable();
    table.integer('losing_trades').unsigned().notNullable();
    table.json('parameters').notNullable();
    table.json('ai_analysis').nullable();
    table.integer('execution_time_ms').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index(['user_id', 'created_at']);
    table.index(['symbol']);
    table.index(['strategy_type']);
  });

  // 2. Backtest Trades Table
  await knex.schema.createTable('backtest_trades', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('backtest_run_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('backtest_runs')
      .onDelete('CASCADE');
    table.integer('trade_number').notNullable();
    table.timestamp('entry_timestamp').notNullable();
    table.timestamp('exit_timestamp').notNullable();
    table.string('side', 8).notNullable().defaultTo('LONG');
    table.decimal('entry_price', 18, 4).notNullable();
    table.decimal('exit_price', 18, 4).notNullable();
    table.decimal('quantity', 18, 4).notNullable();
    table.decimal('notional', 19, 4).notNullable();
    table.decimal('gross_profit_loss', 19, 4).notNullable();
    table.decimal('net_profit_loss', 19, 4).notNullable();
    table.decimal('return_percent', 10, 4).notNullable();
    table.decimal('commission', 18, 4).notNullable().defaultTo('0.0000');
    table.decimal('slippage', 18, 4).notNullable().defaultTo('0.0000');
    table
      .enum('exit_reason', ['SIGNAL', 'STOP_LOSS', 'TAKE_PROFIT', 'END_OF_DATA'])
      .notNullable();
    table.integer('bars_held').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index(['backtest_run_id', 'trade_number']);
  });

  // 3. Backtest Equity Snapshots Table
  await knex.schema.createTable('backtest_equity_snapshots', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('backtest_run_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('backtest_runs')
      .onDelete('CASCADE');
    table.timestamp('timestamp').notNullable();
    table.decimal('equity', 19, 4).notNullable();
    table.decimal('cash', 19, 4).notNullable();
    table.decimal('drawdown_percent', 10, 4).notNullable();
    table.decimal('benchmark_equity', 19, 4).notNullable();

    // Indexes
    table.index(['backtest_run_id', 'timestamp']);
  });

  // 4. Quantitative Signals Table
  await knex.schema.createTable('quantitative_signals', (table) => {
    table.increments('id').primary();
    table
      .integer('instrument_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('instruments')
      .onDelete('CASCADE');
    table.string('symbol', 16).notNullable();
    table
      .enum('strategy_type', [
        'SMA_CROSSOVER',
        'EMA_CROSSOVER',
        'RSI_MOMENTUM',
        'MACD_TREND',
        'BOLLINGER_REVERSION',
        'BREAKOUT',
      ])
      .notNullable();
    table.enum('signal_type', ['BUY', 'SELL', 'HOLD']).notNullable();
    table.enum('strength', ['WEAK', 'MODERATE', 'STRONG']).notNullable();
    table.decimal('score', 6, 2).notNullable();
    table.decimal('current_price', 18, 4).notNullable();
    table.json('indicator_values').notNullable();
    table.text('explanation').notNullable();
    table.timestamp('timestamp').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index(['symbol', 'strategy_type', 'timestamp']);
    table.index(['signal_type']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('quantitative_signals');
  await knex.schema.dropTableIfExists('backtest_equity_snapshots');
  await knex.schema.dropTableIfExists('backtest_trades');
  await knex.schema.dropTableIfExists('backtest_runs');
}
