/**
 * Access rules shared by the server (page and API guards) and the client (sidebar).
 * The client copy only hides links; the server checks are what enforce access.
 */
import type { Permission } from '@/lib/permissions';
import type { RoleId } from '@/lib/roles';

/** A campus/program scope. null means "all campuses" or "all programs". */
export type Scope = { campus: string | null; program: string | null };

export type AccessUser = {
  role: RoleId;
  roles: RoleId[];
  permissions: Permission[];
  scopes: Scope[];
};

export function hasPermission(user: Pick<AccessUser, 'permissions'>, permission: Permission) {
  return user.permissions.includes(permission);
}

/** Pages and the permissions that open them (any one is enough). Unlisted pages need only a sign-in. */
export const ROUTE_PERMISSIONS: Record<string, readonly Permission[]> = {
  '/imports': ['import.view'],
  '/deliberation': ['deliberation.record', 'concern.manage', 'referral.view', 'intervention.own'],
  '/period-cycle': ['concern.manage'],
  '/reports': ['report.view'],
  '/zones': ['zones.calculate', 'rules.approve', 'rules.configure'],
  '/audit': ['audit.view'],
  '/admin': ['admin.users', 'admin.reference_data'],
  '/admin/users': ['admin.users'],
  '/admin/reference': ['admin.reference_data'],
};

export function canOpenRoute(user: Pick<AccessUser, 'permissions'>, path: string) {
  // The most specific listed route wins, so /admin/users/1 uses /admin/users, not /admin.
  const route = Object.keys(ROUTE_PERMISSIONS)
    .filter((r) => path === r || path.startsWith(`${r}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!route) return true;
  return ROUTE_PERMISSIONS[route].some((permission) => hasPermission(user, permission));
}

/** True when a record at this campus and program falls inside one of the user's scopes. */
export function inScope(user: Pick<AccessUser, 'scopes'>, campus: string, program: string | null) {
  return user.scopes.some(
    (scope) =>
      (scope.campus === null || scope.campus === campus) &&
      (scope.program === null || scope.program === program),
  );
}

/**
 * Programs whose results the user may see at a campus: 'all', a list, or an empty list
 * (no access to that campus).
 */
export function programsAtCampus(user: Pick<AccessUser, 'scopes'>, campus: string): 'all' | string[] {
  const scopes = user.scopes.filter((s) => s.campus === null || s.campus === campus);
  if (scopes.some((s) => s.program === null)) return 'all';
  return [...new Set(scopes.map((s) => s.program as string))].sort();
}

/**
 * Builds a SQL condition that limits rows to the user's scopes, for use in server-side
 * queries. Columns are trusted identifiers from code (never user input); values become
 * parameters starting at $firstParam. A user with no scopes matches nothing.
 *
 *   const s = scopeCondition(user, { campus: 'c.code', program: 'p.code' }, 2);
 *   pool.query(`SELECT ... WHERE t.term_id = $1 AND ${s.sql}`, [termId, ...s.params]);
 */
export function scopeCondition(
  user: Pick<AccessUser, 'scopes'>,
  columns: { campus: string; program: string },
  firstParam = 1,
): { sql: string; params: string[] } {
  if (user.scopes.length === 0) return { sql: 'FALSE', params: [] };

  const params: string[] = [];
  const clauses: string[] = [];
  for (const scope of user.scopes) {
    const parts: string[] = [];
    if (scope.campus !== null) {
      params.push(scope.campus);
      parts.push(`${columns.campus} = $${firstParam + params.length - 1}`);
    }
    if (scope.program !== null) {
      params.push(scope.program);
      parts.push(`${columns.program} = $${firstParam + params.length - 1}`);
    }
    if (parts.length === 0) return { sql: 'TRUE', params: [] };
    clauses.push(`(${parts.join(' AND ')})`);
  }
  return { sql: `(${clauses.join(' OR ')})`, params };
}
