import type { Knex } from 'knex';

/**
 * Migration 010: Add Competition Registration Deadlines, Rules, and Extended Statuses
 */
export async function up(knex: Knex): Promise<void> {
  const hasRegStart = await knex.schema.hasColumn('competitions', 'registration_start_time');
  if (!hasRegStart) {
    await knex.schema.alterTable('competitions', (table) => {
      table.timestamp('registration_start_time').nullable().after('min_participants');
      table.timestamp('registration_end_time').nullable().after('registration_start_time');
      table.text('rules').nullable().after('description');
      table.string('banner_url', 255).nullable().after('name');
    });
  }

  // Update enum status to include REGISTRATION_OPEN and REGISTRATION_CLOSED
  await knex.raw(`
    ALTER TABLE competitions 
    MODIFY COLUMN status ENUM(
      'DRAFT', 
      'UPCOMING', 
      'REGISTRATION_OPEN', 
      'REGISTRATION_CLOSED', 
      'ACTIVE', 
      'COMPLETED', 
      'CANCELLED', 
      'ARCHIVED'
    ) NOT NULL DEFAULT 'UPCOMING';
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasRegStart = await knex.schema.hasColumn('competitions', 'registration_start_time');
  if (hasRegStart) {
    await knex.schema.alterTable('competitions', (table) => {
      table.dropColumn('registration_start_time');
      table.dropColumn('registration_end_time');
      table.dropColumn('rules');
      table.dropColumn('banner_url');
    });
  }

  await knex.raw(`
    ALTER TABLE competitions 
    MODIFY COLUMN status ENUM(
      'DRAFT', 
      'UPCOMING', 
      'ACTIVE', 
      'COMPLETED', 
      'CANCELLED', 
      'ARCHIVED'
    ) NOT NULL DEFAULT 'UPCOMING';
  `);
}
