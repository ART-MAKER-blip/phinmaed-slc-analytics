import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { getPool } from '@/lib/db';
import { isRoleId, type RoleId } from '@/lib/roles';
import { getDemoUserFromSession } from '@/lib/demo-auth';

export const SESSION_COOKIE = 'slc_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AuthUser = { id: string; email: string; name: string; role: RoleId };

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
  await getPool().query(
    'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
    [tokenHash, userId],
  );
  return token;
}

export async function revokeSession(token: string) {
  await getPool().query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  if (token.startsWith('demo.')) return getDemoUserFromSession(token);

  const result = await getPool().query<{
    id: string;
    email: string;
    name: string;
    role: string;
  }>(
    `SELECT u.id, u.email, u.name, u.role
       FROM auth_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`,
    [hashSessionToken(token)],
  );
  const user = result.rows[0];
  if (!user || !isRoleId(user.role)) return null;
  return { ...user, role: user.role };
}
