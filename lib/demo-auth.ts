import { createHmac, timingSafeEqual } from 'node:crypto';
import { ROLES, type RoleId } from '@/lib/roles';
import type { AuthUser } from '@/lib/auth';

export const DEMO_PASSWORD = 'SLCdemo-2026!';
const DEMO_SESSION_PREFIX = 'demo.';
const DEMO_SESSION_SECRET = 'local-development-demo-sessions-only';

export const DEMO_USERS = ROLES.map((role) => ({
  id: `demo-${role.id}`,
  email: `${role.id}.demo@example.test`,
  name: `Demo ${role.label}`,
  role: role.id,
})) satisfies AuthUser[];

function signature(role: RoleId) {
  return createHmac('sha256', DEMO_SESSION_SECRET).update(`${DEMO_SESSION_PREFIX}${role}`).digest('hex');
}

export function verifyDemoCredentials(email: string, password: string): AuthUser | null {
  if (process.env.NODE_ENV !== 'development' || password !== DEMO_PASSWORD) return null;
  return DEMO_USERS.find((user) => user.email === email.trim().toLowerCase()) ?? null;
}

export function createDemoSession(role: RoleId) {
  return `${DEMO_SESSION_PREFIX}${role}.${signature(role)}`;
}

export function getDemoUserFromSession(token: string): AuthUser | null {
  if (process.env.NODE_ENV !== 'development') return null;
  const match = /^demo\.([a-z]+)\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const role = match[1];
  if (!ROLES.some((item) => item.id === role)) return null;

  const expected = Buffer.from(signature(role as RoleId), 'hex');
  const actual = Buffer.from(match[2], 'hex');
  if (!timingSafeEqual(expected, actual)) return null;
  return DEMO_USERS.find((user) => user.role === role) ?? null;
}
