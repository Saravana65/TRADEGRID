import type { Knex } from 'knex';

/**
 * Migration 010: Create Trader Chat, Symbol Rooms & Direct Messaging Tables
 *
 * Architecture:
 * - chat_rooms: Global and symbol-specific trading community discussion rooms.
 * - chat_conversations: 1-on-1 private messaging channels between pairs of traders.
 * - chat_conversation_participants: Participant state (read cursors, unread counts).
 * - chat_messages: Persisted messages with idempotency and room/conversation association.
 * - chat_message_mentions: Normalized records of @username mentions.
 * - chat_notifications: In-app notifications for mentions and direct messages.
 * - chat_user_blocks: Blocking relationships preventing unwanted direct messages.
 * - chat_reports: Community moderation reports for spam, manipulation, or offensive content.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Chat Rooms Master Table (Global & Symbol Rooms)
  await knex.schema.createTable('chat_rooms', (table) => {
    table.increments('id').primary();
    table.string('slug', 64).notNullable().unique();
    table.string('name', 128).notNullable();
    table.enum('type', ['GLOBAL', 'SYMBOL']).notNullable().defaultTo('SYMBOL');
    table.string('symbol', 16).nullable();
    table.text('description').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('message_count').unsigned().notNullable().defaultTo(0);
    table.timestamps(true, true);

    table.index(['type']);
    table.index(['symbol']);
    table.index(['is_active']);
  });

  // 2. Direct Conversations Table
  await knex.schema.createTable('chat_conversations', (table) => {
    table.increments('id').primary();
    table
      .integer('user1_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('user2_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.timestamp('last_message_at').nullable();
    table.timestamps(true, true);

    table.unique(['user1_id', 'user2_id']);
    table.index(['user1_id']);
    table.index(['user2_id']);
    table.index(['last_message_at']);
  });

  // 3. Conversation Participants Table (tracks read receipts & unread counters)
  await knex.schema.createTable('chat_conversation_participants', (table) => {
    table.increments('id').primary();
    table
      .integer('conversation_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('chat_conversations')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.bigInteger('last_read_message_id').unsigned().nullable();
    table.timestamp('last_read_at').nullable();
    table.timestamps(true, true);

    table.unique(['conversation_id', 'user_id']);
    table.index(['user_id']);
  });

  // 4. Chat Messages Table (Both Room & Direct Messages)
  await knex.schema.createTable('chat_messages', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('room_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('chat_rooms')
      .onDelete('CASCADE');
    table
      .integer('conversation_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('chat_conversations')
      .onDelete('CASCADE');
    table
      .integer('sender_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('content').notNullable();
    table.string('idempotency_key', 64).nullable();
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.timestamps(true, true);

    table.index(['room_id', 'id']);
    table.index(['conversation_id', 'id']);
    table.index(['sender_id', 'created_at']);
    table.index(['idempotency_key']);
  });

  // 5. Message Mentions Table (@username references)
  await knex.schema.createTable('chat_message_mentions', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('message_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('chat_messages')
      .onDelete('CASCADE');
    table
      .integer('mentioned_user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('room_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('chat_rooms')
      .onDelete('CASCADE');
    table
      .integer('conversation_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('chat_conversations')
      .onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['message_id', 'mentioned_user_id']);
    table.index(['mentioned_user_id']);
  });

  // 6. Chat Notifications Table (Mentions and DMs)
  await knex.schema.createTable('chat_notifications', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.enum('type', ['MENTION', 'DIRECT_MESSAGE', 'SYSTEM']).notNullable();
    table.string('title', 128).notNullable();
    table.text('content').notNullable();
    table.bigInteger('reference_id').unsigned().nullable();
    table.string('reference_type', 32).nullable();
    table.string('reference_slug', 64).nullable();
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('read_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['user_id', 'is_read', 'created_at']);
  });

  // 7. User Blocking Table
  await knex.schema.createTable('chat_user_blocks', (table) => {
    table.increments('id').primary();
    table
      .integer('blocker_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('blocked_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('reason', 255).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['blocker_id', 'blocked_id']);
    table.index(['blocker_id']);
    table.index(['blocked_id']);
  });

  // 8. Chat Reports & Moderation Table
  await knex.schema.createTable('chat_reports', (table) => {
    table.increments('id').primary();
    table
      .integer('reporter_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('reported_user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .bigInteger('message_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('chat_messages')
      .onDelete('SET NULL');
    table
      .enum('reason', ['SPAM', 'HARASSMENT', 'MANIPULATION', 'OFFENSIVE', 'OTHER'])
      .notNullable();
    table.text('description').nullable();
    table
      .enum('status', ['PENDING', 'REVIEWED', 'DISMISSED', 'ACTIONED'])
      .notNullable()
      .defaultTo('PENDING');
    table
      .integer('reviewed_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at').nullable();
    table.timestamps(true, true);

    table.index(['status', 'created_at']);
    table.index(['reported_user_id']);
    table.index(['message_id']);
  });

  // Seed default rooms (Global chat + Core equity symbols)
  await knex('chat_rooms').insert([
    {
      slug: 'global',
      name: 'Global Trader Chat',
      type: 'GLOBAL',
      symbol: null,
      description: 'Exchange-wide community chatroom for real-time market ideas and trader discussions.',
      is_active: true,
      message_count: 0,
    },
    {
      slug: 'symbol-reliance',
      name: 'RELIANCE Discussion',
      type: 'SYMBOL',
      symbol: 'RELIANCE',
      description: 'Dedicated discussion channel for Reliance Industries Ltd.',
      is_active: true,
      message_count: 0,
    },
    {
      slug: 'symbol-tcs',
      name: 'TCS Discussion',
      type: 'SYMBOL',
      symbol: 'TCS',
      description: 'Dedicated discussion channel for Tata Consultancy Services Ltd.',
      is_active: true,
      message_count: 0,
    },
    {
      slug: 'symbol-infy',
      name: 'INFY Discussion',
      type: 'SYMBOL',
      symbol: 'INFY',
      description: 'Dedicated discussion channel for Infosys Ltd.',
      is_active: true,
      message_count: 0,
    },
    {
      slug: 'symbol-hdfcbank',
      name: 'HDFCBANK Discussion',
      type: 'SYMBOL',
      symbol: 'HDFCBANK',
      description: 'Dedicated discussion channel for HDFC Bank Ltd.',
      is_active: true,
      message_count: 0,
    },
    {
      slug: 'symbol-icicibank',
      name: 'ICICIBANK Discussion',
      type: 'SYMBOL',
      symbol: 'ICICIBANK',
      description: 'Dedicated discussion channel for ICICI Bank Ltd.',
      is_active: true,
      message_count: 0,
    },
    {
      slug: 'symbol-tgrid',
      name: 'TGRID Discussion',
      type: 'SYMBOL',
      symbol: 'TGRID',
      description: 'Official TradeGrid Platform Index & Benchmark Discussion.',
      is_active: true,
      message_count: 0,
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chat_reports');
  await knex.schema.dropTableIfExists('chat_user_blocks');
  await knex.schema.dropTableIfExists('chat_notifications');
  await knex.schema.dropTableIfExists('chat_message_mentions');
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('chat_conversation_participants');
  await knex.schema.dropTableIfExists('chat_conversations');
  await knex.schema.dropTableIfExists('chat_rooms');
}
