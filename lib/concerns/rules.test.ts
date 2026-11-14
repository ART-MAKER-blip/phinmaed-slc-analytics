import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROLE_PERMISSIONS } from '../permissions';
import type { RoleId } from '../roles';
import {
  canAddNote, canSeeNotes, canSeeReferral, canUpdateIntervention, canUpdateReferral,
  concernAccess, concernInProgramScope, isoDate, oneOf, text, userTeams,
} from './rules';

const user = (role: RoleId, id = `u-${role}`) => ({ id, roles: [role], permissions: [...ROLE_PERMISSIONS[role]] });
const facts = (over: Partial<Parameters<typeof concernAccess>[1]> = {}) => ({
  inScope: true, campusInScope: true, referralTeams: [] as string[], interventionOwners: [] as string[], ...over,
});

test('the SLC coordinates concerns, but only within their scope', () => {
  assert.equal(concernAccess(user('slc'), facts()), 'full');
  assert.equal(concernAccess(user('slc'), facts({ inScope: false })), null);
});

test('the Team Learning lead, COO and administrator do not open concerns', () => {
  assert.equal(concernAccess(user('tl'), facts()), null);
  assert.equal(concernAccess(user('coo'), facts({ referralTeams: ['SSP', 'KSH'] })), null);
  assert.equal(concernAccess(user('admin'), facts()), null);
});

test('anyone assigned an intervention sees the concern', () => {
  assert.equal(concernAccess(user('tl', 't1'), facts({ interventionOwners: ['t1'] })), 'owner');
  assert.equal(concernAccess(user('tl', 't1'), facts({ interventionOwners: ['t2'] })), null);
});

test('restricted notes are visible to the SLC only (test case 15)', () => {
  for (const team of ['ALC', 'SSP', 'KSH']) {
    assert.equal(canSeeNotes(user('slc'), team), true);
    assert.equal(canAddNote(user('slc'), team), true);
    for (const role of ['tl', 'coo', 'admin'] as const) {
      assert.equal(canSeeNotes(user(role), team), false);
      assert.equal(canAddNote(user(role), team), false);
    }
  }
});

test('no role maps to a support team, so team-level access is never granted', () => {
  assert.deepEqual(userTeams({ roles: ['slc', 'tl', 'coo', 'admin'] }), []);
  assert.equal(canSeeReferral(user('slc'), 'full', 'KSH'), true);
  assert.equal(canSeeReferral(user('tl'), 'owner', 'SSP'), false);
  assert.equal(canUpdateReferral(user('slc'), 'full', 'SSP'), true);
  assert.equal(canUpdateReferral(user('tl'), 'owner', 'SSP'), false);
});

test('interventions can be updated by the SLC or their owner', () => {
  assert.equal(canUpdateIntervention(user('slc'), 'full', 'someone'), true);
  assert.equal(canUpdateIntervention(user('tl', 't1'), 'owner', 't1'), true);
  assert.equal(canUpdateIntervention(user('tl', 't1'), 'owner', 't2'), false);
});

test('program scope uses the student program, else the subject programs', () => {
  assert.equal(concernInProgramScope('all', { studentProgram: null, coursePrograms: [] }), true);
  assert.equal(concernInProgramScope(['BSIT'], { studentProgram: 'BSIT', coursePrograms: [] }), true);
  assert.equal(concernInProgramScope(['BSIT'], { studentProgram: 'BSEd', coursePrograms: ['BSIT'] }), false);
  assert.equal(concernInProgramScope(['BSIT'], { studentProgram: null, coursePrograms: ['BSBA', 'BSIT'] }), true);
});

test('input checks trim text and reject invalid dates and choices', () => {
  assert.equal(text('  hello ', 'Note'), 'hello');
  assert.equal(text('', 'Note', { optional: true }), null);
  assert.throws(() => text('', 'Decision'), /Decision is required/);
  assert.throws(() => text('x'.repeat(5), 'Note', { max: 4 }), /1 to 4/);
  assert.equal(isoDate('2026-11-20', 'Due date'), '2026-11-20');
  assert.throws(() => isoDate('2026-02-30', 'Due date'), /valid date/);
  assert.throws(() => isoDate('next week', 'Due date'), /valid date/);
  assert.equal(oneOf('closed', ['open', 'closed'] as const, 'status'), 'closed');
  assert.throws(() => oneOf('deleted', ['open', 'closed'] as const, 'status'), /valid status/);
});
