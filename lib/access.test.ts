import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { canOpenRoute, inScope, scopeCondition } from './access';
import { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from './permissions';
import { ROLES } from './roles';

const MIGRATION = readFileSync(path.join(__dirname, '..', 'db', 'migrations', '002_erd_schema.sql'), 'utf8');

function sqlRoleGrants() {
  const grants = new Map<string, string[]>();
  for (const match of MIGRATION.matchAll(/\('([a-z_]+)',\s*ARRAY\[([^\]]*)\]\)/g)) {
    grants.set(match[1], [...match[2].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort());
  }
  return grants;
}

test('role permissions in code match the database migration', () => {
  const grants = sqlRoleGrants();
  assert.deepEqual([...grants.keys()].sort(), ROLES.map((r) => r.id).sort());
  for (const role of ROLES) {
    assert.deepEqual([...ROLE_PERMISSIONS[role.id]].sort(), grants.get(role.id), `permissions for ${role.id}`);
  }
});

test('permission and role codes in code match the database migration', () => {
  const sqlPermissions = [...MIGRATION.matchAll(/^\s*\('([a-z_]+\.[a-z_]+)',\s*'/gm)].map((m) => m[1]).sort();
  assert.deepEqual(sqlPermissions, [...PERMISSIONS].sort());
  const roleBlock = MIGRATION.split('INSERT INTO role (code, name) VALUES')[1].split(';')[0];
  const sqlRoles = [...roleBlock.matchAll(/\('([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(sqlRoles, ROLES.map((r) => r.id), 'same roles in the same order');
});

const as = (...permissions: Permission[]) => ({ permissions });

test('routes open only for roles with a matching permission', () => {
  const user = (role: keyof typeof ROLE_PERMISSIONS) => as(...ROLE_PERMISSIONS[role]);
  assert.equal(canOpenRoute(user('slc'), '/deliberation'), true);
  assert.equal(canOpenRoute(user('ksh'), '/deliberation'), false);
  assert.equal(canOpenRoute(user('faculty'), '/imports'), false);
  assert.equal(canOpenRoute(user('data_manager'), '/imports'), true);
  assert.equal(canOpenRoute(user('data_manager'), '/imports/123'), true);
  assert.equal(canOpenRoute(user('coo'), '/reports'), true);
  assert.equal(canOpenRoute(user('admin'), '/reports'), false);
  // The dashboard needs only a sign-in, and a similar prefix is not a match.
  assert.equal(canOpenRoute(as(), '/'), true);
  assert.equal(canOpenRoute(as(), '/reportsx'), true);
});

test('records are in scope only within an assigned campus and program', () => {
  const dean = { scopes: [{ campus: 'COC', program: 'BSIT' }] };
  assert.equal(inScope(dean, 'COC', 'BSIT'), true);
  assert.equal(inScope(dean, 'COC', 'BSBA'), false);
  assert.equal(inScope(dean, 'OTHER', 'BSIT'), false);
  assert.equal(inScope({ scopes: [{ campus: 'COC', program: null }] }, 'COC', 'BSBA'), true);
  assert.equal(inScope({ scopes: [{ campus: null, program: null }] }, 'OTHER', 'BSBA'), true);
  assert.equal(inScope({ scopes: [] }, 'COC', 'BSIT'), false);
});

test('scope conditions become parameterized SQL', () => {
  const cols = { campus: 'c.code', program: 'p.code' };
  assert.deepEqual(scopeCondition({ scopes: [] }, cols), { sql: 'FALSE', params: [] });
  assert.deepEqual(scopeCondition({ scopes: [{ campus: null, program: null }] }, cols), { sql: 'TRUE', params: [] });
  assert.deepEqual(
    scopeCondition({ scopes: [{ campus: 'COC', program: 'BSIT' }, { campus: 'COC', program: null }] }, cols, 3),
    { sql: '((c.code = $3 AND p.code = $4) OR (c.code = $5))', params: ['COC', 'BSIT', 'COC'] },
  );
});
