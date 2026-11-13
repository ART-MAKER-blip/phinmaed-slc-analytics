import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getPool } from '@/lib/db';
import { isRoleId } from '@/lib/roles';
import { isPermission } from '@/lib/permissions';
import type { AccessUser } from '@/lib/access';
import { getDemoUserFromSession } from '@/lib/demo-auth';

export const SESSION_COOKIE = 'slc_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AuthUser = AccessUser & { id: string; email: string; name: string; isDemo: boolean };

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const pool = getPool();
  // Housekeeping: expired sessions are useless, so clear them as new ones are made.
  await pool.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
  await pool.query(
    'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
    [tokenHash, userId],
  );
  return token;
}

/** Deletes the session and returns the id of the user it belonged to, if any. */
export async function revokeSession(token: string): Promise<string | null> {
  const result = await getPool().query<{ user_id: string }>(
    'DELETE FROM auth_sessions WHERE token_hash = $1 RETURNING user_id',
    [hashSessionToken(token)],
  );
  return result.rows[0]?.user_id ?? null;
}

async function loadUser(token: string): Promise<AuthUser | null> {
  const pool = getPool();
  const result = await pool.query<{ id: string; email: string; name: string; roles: string[] }>(
    `SELECT u.id, u.email, u.name,
            COALESCE(array_agg(r.code ORDER BY r.role_id) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
       FROM auth_sessions s
       JOIN app_users u ON u.id = s.user_id
       LEFT JOIN user_role ur ON ur.user_id = u.id
       LEFT JOIN role r ON r.role_id = ur.role_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE
      GROUP BY u.id`,
    [hashSessionToken(token)],
  );
  const row = result.rows[0];
  const roles = row?.roles.filter(isRoleId) ?? [];
  if (!row || roles.length === 0) return null;

  // Permissions and scopes are the union over all of the user's roles.
  const [permissions, scopes] = await Promise.all([
    pool.query<{ code: string }>(
      `SELECT DISTINCT p.code
         FROM user_role ur
         JOIN role_permission rp ON rp.role_id = ur.role_id
         JOIN permission p ON p.permission_id = rp.permission_id
        WHERE ur.user_id = $1`,
      [row.id],
    ),
    pool.query<{ campus: string | null; program: string | null }>(
      `SELECT DISTINCT c.code AS campus, pr.code AS program
         FROM user_role ur
         JOIN user_role_scope s ON s.user_role_id = ur.user_role_id
         LEFT JOIN campus c ON c.campus_id = s.campus_id
         LEFT JOIN program pr ON pr.program_id = s.program_id
        WHERE ur.user_id = $1`,
      [row.id],
    ),
  ]);

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: roles[0],
    roles,
    permissions: permissions.rows.map((p) => p.code).filter(isPermission),
    scopes: scopes.rows,
    isDemo: false,
  };
}

/** The signed-in user for this request. Cached so the layout and page share one lookup. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  if (token.startsWith('demo.')) return getDemoUserFromSession(token);
  return loadUser(token);
});
