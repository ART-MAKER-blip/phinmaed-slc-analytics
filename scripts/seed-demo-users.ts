import { randomBytes } from 'node:crypto';
import { loadEnvConfig } from '@next/env';
import { getPool } from '@/lib/database';
import { hashPassword } from '@/lib/password';
import { ROLES } from '@/lib/roles';
import { assignRoleAtCampus } from './user-roles';

async function main() {
  loadEnvConfig(process.cwd());

  if (process.env.NODE_ENV === 'production' || process.env.SLC_ALLOW_DEMO_SEED !== '1') {
    throw new Error(
      'Demo seeding is disabled by default. For a local development database, run with NODE_ENV=development and SLC_ALLOW_DEMO_SEED=1.',
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  const credentials: { name: string; email: string; role: string; password: string }[] = [];

  try {
    await client.query('BEGIN');
    for (const role of ROLES) {
      const email = `${role.id}.demo@example.test`;
      const name = `Demo ${role.label}`;
      const password = randomBytes(18).toString('base64url');
      const passwordHash = await hashPassword(password);

      const user = await client.query<{ id: string }>(
        `INSERT INTO app_users (email, name, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (lower(email)) DO UPDATE
           SET name = EXCLUDED.name,
               password_hash = EXCLUDED.password_hash,
               active = TRUE
         RETURNING id`,
        [email, name, passwordHash],
      );
      await client.query('DELETE FROM user_role WHERE user_id = $1', [user.rows[0].id]);
      await assignRoleAtCampus(client, user.rows[0].id, role.id, 'COC');
      credentials.push({ name, email, role: role.id, password });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('Demo accounts created. Save these randomly generated passwords; they are shown only once.');
  console.log('Re-running this command resets the demo accounts to new passwords.');
  console.table(credentials);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Demo account seeding failed.');
  process.exitCode = 1;
});
