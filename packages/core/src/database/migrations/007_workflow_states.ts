import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workflow_states', (table) => {
    table.string('id', 64).primary();
    table.string('session_id', 64).notNullable();
    table.string('agent_id', 64).notNullable();
    table.text('user_message').notNullable();
    table.string('status', 32).notNullable().defaultTo('pending');
    // pending | extracting_context | planning | executing | verifying | paused | completed | failed | cancelled
    table.integer('current_step_index').notNullable().defaultTo(0);
    table.json('steps_json').notNullable();
    table.json('context_json').nullable();
    table.json('metadata_json').nullable();
    table.integer('total_tokens').notNullable().defaultTo(0);
    table.integer('error_count').notNullable().defaultTo(0);
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('session_id');
    table.index('agent_id');
    table.index('status');
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('workflow_states');
}
