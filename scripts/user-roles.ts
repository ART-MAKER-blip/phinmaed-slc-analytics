import type { PoolClient } from 'pg';

/** Gives a user a role scoped to one campus (all programs). Safe to call repeatedly. */
export async function assignRoleAtCampus(client: PoolClient, userId: string, roleCode: string, campusCode: string) {
  const campus = await client.query<{ campus_id: number }>('SELECT campus_id FROM campus WHERE code = $1', [campusCode]);
  if (campus.rowCount === 0) throw new Error(`Campus ${campusCode} is not in the database. Run npm run migrate.`);

  const userRole = await client.query<{ user_role_id: number }>(
    `INSERT INTO user_role (user_id, role_id)
     SELECT $1, role_id FROM role WHERE code = $2
     ON CONFLICT (user_id, role_id) DO UPDATE SET role_id = EXCLUDED.role_id
     RETURNING user_role_id`,
    [userId, roleCode],
  );
  if (userRole.rowCount === 0) throw new Error(`Role ${roleCode} is not in the database. Run npm run migrate.`);

  await client.query(
    'INSERT INTO user_role_scope (user_role_id, campus_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userRole.rows[0].user_role_id, campus.rows[0].campus_id],
  );
}
