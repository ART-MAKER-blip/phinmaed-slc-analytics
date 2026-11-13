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

test('coordinators get full access only within their scope', () => {
  assert.equal(concernAccess(user('slc'), facts()), 'full');
  assert.equal(concernAccess(user('dean'), facts()), 'full');
  assert.equal(concernAccess(user('alc'), facts()), 'full');
  assert.equal(concernAccess(user('dean'), facts({ inScope: false })), null);
});

test('support teams see only concerns referred to their own team', () => {
  assert.equal(concernAccess(user('ksh'), facts()), null);
  assert.equal(concernAccess(user('ksh'), facts({ referralTeams: ['SSP'] })), null);
  assert.equal(concernAccess(user('ksh'), facts({ referralTeams: ['KSH'] })), 'team');
  assert.equal(concernAccess(user('ssp'), facts({ referralTeams: ['SSP'], campusInScope: false })), null);
});

test('intervention owners see the concern even without other access', () => {
  assert.equal(concernAccess(user('faculty', 'f1'), facts({ interventionOwners: ['f1'] })), 'owner');
  assert.equal(concernAccess(user('faculty', 'f1'), facts({ interventionOwners: ['f2'] })), null);
  assert.equal(concernAccess(user('coo'), facts()), null);
});

test('restricted notes are visible only with permission and to the right team (test case 15)', () => {
  assert.equal(canSeeNotes(user('slc'), 'KSH'), true);
  assert.equal(canSeeNotes(user('ksh'), 'KSH'), true);
  assert.equal(canSeeNotes(user('ksh'), 'SSP'), false);
  assert.equal(canSeeNotes(user('ssp'), 'SSP'), true);
  assert.equal(canSeeNotes(user('dean'), 'KSH'), false);
  assert.equal(canSeeNotes(user('alc'), 'ALC'), false);
  assert.equal(canAddNote(user('ksh'), 'KSH'), true);
  assert.equal(canAddNote(user('dean'), 'KSH'), false);
});

test('referral visibility and updates follow access level and team', () => {
  assert.equal(canSeeReferral(user('dean'), 'full', 'KSH'), true);
  assert.equal(canSeeReferral(user('ssp'), 'team', 'KSH'), false);
  assert.equal(canSeeReferral(user('ssp'), 'team', 'SSP'), true);
  assert.equal(canSeeReferral(user('faculty'), 'owner', 'SSP'), false);
  assert.equal(canUpdateReferral(user('slc'), 'full', 'SSP'), true);
  assert.equal(canUpdateReferral(user('alc'), 'full', 'SSP'), false);
  assert.equal(canUpdateReferral(user('alc'), 'full', 'ALC'), true);
  assert.equal(canUpdateReferral(user('ssp'), 'team', 'SSP'), true);
});

test('interventions can be updated by managers or their owner', () => {
  assert.equal(canUpdateIntervention(user('slc'), 'full', 'someone'), true);
  assert.equal(canUpdateIntervention(user('faculty', 'f1'), 'owner', 'f1'), true);
  assert.equal(canUpdateIntervention(user('faculty', 'f1'), 'owner', 'f2'), false);
  assert.equal(canUpdateIntervention(user('ssp', 's1'), 'team', 'x'), false);
});

test('program scope uses the student program, else the subject programs', () => {
  assert.equal(concernInProgramScope('all', { studentProgram: null, coursePrograms: [] }), true);
  assert.equal(concernInProgramScope(['BSIT'], { studentProgram: 'BSIT', coursePrograms: [] }), true);
  assert.equal(concernInProgramScope(['BSIT'], { studentProgram: 'BSEd', coursePrograms: ['BSIT'] }), false);
  assert.equal(concernInProgramScope(['BSIT'], { studentProgram: null, coursePrograms: ['BSBA', 'BSIT'] }), true);
  assert.deepEqual(userTeams({ roles: ['slc', 'ksh'] }), ['KSH']);
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
