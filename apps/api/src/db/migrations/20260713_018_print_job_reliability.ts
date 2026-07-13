import { Knex } from "knex";

/**
 * R5 print reliability schema contract.
 * `dead` is the terminal state after the configured retry budget is exhausted.
 */
export async function up(db: Knex): Promise<void> {
  await db.raw(`
    alter table print_jobs
      drop constraint if exists print_jobs_status_check;

    alter table print_jobs
      add constraint print_jobs_status_check
      check (status in ('pending', 'printing', 'printed', 'failed', 'dead'));

    create index if not exists print_jobs_claim_idx
      on print_jobs (device_id, status, attempts, created_at);
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`
    drop index if exists print_jobs_claim_idx;
    alter table print_jobs
      drop constraint if exists print_jobs_status_check;
  `);
}
