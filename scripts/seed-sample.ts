/**
 * Loads data/dummy_sis_grades_sample.csv through the real importer (validate, store the
 * original file, accept), exactly as an upload in the app would. With --calculate it also
 * approves the starting rule set and calculates zones for P1, P2 and P3.
 *
 *   NODE_ENV=development SLC_ALLOW_SAMPLE_SEED=1 npm run seed-sample -- [--calculate] [--file data/other.csv]
 *
 * Every step is written to the audit log under the first active administrator or SLC account.
 * Refuses to run in production.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { getPool } from '@/lib/database';
import { acceptGradeBatch, createGradeBatch } from '@/lib/imports/server';
import { approveRuleSet, runSnapshot } from '@/lib/snapshots/server';
import { PERMISSIONS } from '@/lib/permissions';
import type { AuthUser } from '@/lib/auth';

async function main() {
  loadEnvConfig(process.cwd());
  if (process.env.NODE_ENV === 'production' || process.env.SLC_ALLOW_SAMPLE_SEED !== '1') {
    throw new Error('Sample seeding is disabled by default. Run with NODE_ENV=development and SLC_ALLOW_SAMPLE_SEED=1.');
  }
  const args = process.argv.slice(2);
  const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : 'data/dummy_sis_grades_sample.csv';
  const filePath = path.resolve(process.cwd(), fileArg);
  const pool = getPool();

  try {
    const actor = await pool.query<{ id: string; email: string; name: string }>(
      `SELECT u.id::text, u.email, u.name FROM app_users u
         JOIN user_role ur ON ur.user_id = u.id JOIN role r ON r.role_id = ur.role_id
        WHERE u.active AND r.code IN ('admin', 'slc')
        ORDER BY (r.code = 'admin') DESC, u.created_at LIMIT 1`,
    );
    if (!actor.rows[0]) throw new Error('No active administrator or SLC account. Run npm run seed-demo or npm run create-user first.');
    const ids = await pool.query<{ campus_id: number; term_id: number }>(
      `SELECT c.campus_id, t.term_id FROM campus c, term t WHERE c.code = 'COC' AND t.code = '2025-2'`,
    );
    if (!ids.rows[0]) throw new Error('Campus COC or term 2025-2 is missing. Run npm run migrate first.');

    // A system user for this script: all permissions, all campuses. Actions are audited under the real account.
    const user: AuthUser = {
      ...actor.rows[0], role: 'admin', roles: ['admin'], permissions: [...PERMISSIONS],
      scopes: [{ campus: null, program: null }], isDemo: false,
    };

    const bytes = readFileSync(filePath);
    const batch = await createGradeBatch({
      user, file: { name: path.basename(filePath), type: 'text/csv', bytes }, campusId: ids.rows[0].campus_id, termId: ids.rows[0].term_id,
    });
    console.log(`Uploaded ${path.basename(filePath)} as batch ${batch.batchId} (${batch.status}).`);
    const accepted = await acceptGradeBatch(user, batch.batchId);
    console.log(`Accepted: ${accepted.accepted} rows (${accepted.inserted} new, ${accepted.updated} updated, ${accepted.unchanged} unchanged), ${accepted.skipped} skipped.`);

    if (args.includes('--calculate')) {
      const draft = await pool.query<{ rule_set_id: number; code: string }>(`SELECT rule_set_id, code FROM zone_rule_set WHERE code = 'rs-2025-2' AND status = 'draft'`);
      if (draft.rows[0]) {
        await approveRuleSet(user, draft.rows[0].rule_set_id);
        console.log(`Approved rule set ${draft.rows[0].code}.`);
      }
      for (const periodId of [1, 2, 3]) {
        const run = await runSnapshot(user, ids.rows[0].campus_id, ids.rows[0].term_id, periodId);
        const z = (c: Record<string, number>) => `${c.green}/${c.yellow}/${c.red}`;
        console.log(`P${periodId}: run ${run.runId} — students G/Y/R ${z(run.students)}, subject sections ${z(run.subjects)}, teachers ${z(run.teachers)}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Sample seeding failed.');
  process.exitCode = 1;
});
