import type { Knex } from 'knex';

/**
 * Migration 008: Create Simulated News Catalyst Engine Tables
 *
 * Architecture:
 * - news_articles: Persistent store of simulated financial news stories with full audit metadata.
 * - news_catalysts: Simulation parameters translating news sentiment/volatility into market catalysts.
 * - news_catalyst_executions: Immutable audit log tracking catalyst lifecycle ticks, decay, and scope impacts.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. News Articles Table
  await knex.schema.createTable('news_articles', (table) => {
    table.increments('id').primary();
    table.string('headline', 255).notNullable();
    table.text('summary').notNullable();
    table.text('content').nullable();
    table
      .enum('category', [
        'Earnings',
        'Revenue',
        'Management',
        'Product Launch',
        'Partnership',
        'Regulatory',
        'Legal',
        'Economic',
        'Industry',
        'Competition',
        'Crisis',
        'Market Sentiment',
        'Other',
      ])
      .notNullable();
    table.enum('impact_direction', ['POSITIVE', 'NEGATIVE', 'NEUTRAL']).notNullable();
    table.enum('severity', ['LOW', 'MEDIUM', 'HIGH', 'EXTREME']).notNullable();
    table.enum('target_scope', ['INSTRUMENT', 'SECTOR', 'MARKET']).notNullable();
    table.string('target_id', 64).nullable();
    table.string('target_symbol', 16).nullable();
    table.string('target_sector', 64).nullable();
    table
      .enum('status', ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ACTIVE', 'EXPIRED', 'CANCELLED'])
      .notNullable()
      .defaultTo('DRAFT');
    table.boolean('is_simulated').notNullable().defaultTo(true);
    table
      .integer('created_by')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.timestamp('scheduled_at').nullable();
    table.timestamp('published_at').nullable();
    table.timestamp('expires_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['status'], 'idx_news_status');
    table.index(['category'], 'idx_news_category');
    table.index(['target_scope', 'target_symbol'], 'idx_news_target');
    table.index(['published_at'], 'idx_news_published_at');
  });

  // 2. News Catalysts Table
  await knex.schema.createTable('news_catalysts', (table) => {
    table.increments('id').primary();
    table
      .integer('news_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('news_articles')
      .onDelete('CASCADE');
    table.decimal('sentiment_score', 5, 4).notNullable().defaultTo(0.0);
    table.decimal('volatility_factor', 5, 4).notNullable().defaultTo(1.0);
    table.decimal('expected_participation', 5, 4).notNullable().defaultTo(1.0);
    table.integer('duration_seconds').notNullable().defaultTo(300);
    table.decimal('decay_rate', 5, 4).notNullable().defaultTo(0.02);
    table
      .enum('status', ['PENDING', 'ACTIVE', 'DECAYING', 'EXPIRED', 'CANCELLED'])
      .notNullable()
      .defaultTo('PENDING');
    table.timestamp('activated_at').nullable();
    table.timestamp('decay_starts_at').nullable();
    table.timestamp('expired_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['status'], 'idx_catalysts_status');
  });

  // 3. News Catalyst Executions Audit Table
  await knex.schema.createTable('news_catalyst_executions', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('catalyst_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('news_catalysts')
      .onDelete('CASCADE');
    table
      .integer('news_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('news_articles')
      .onDelete('CASCADE');
    table.string('action', 64).notNullable();
    table.decimal('effective_impact', 7, 4).notNullable().defaultTo(0.0);
    table.text('affected_instruments').nullable();
    table.text('details').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['news_id', 'created_at'], 'idx_catalyst_exec_news');
    table.index(['action'], 'idx_catalyst_exec_action');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('news_catalyst_executions');
  await knex.schema.dropTableIfExists('news_catalysts');
  await knex.schema.dropTableIfExists('news_articles');
}
