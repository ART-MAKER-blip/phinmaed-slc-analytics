import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkAdminLockout, parseAssignments, parseCode, parseEmail, parseName, parsePassword, parseTermCode, thresholdsFromForm,
} from './validate';

const known = { campuses: ['COC'], programs: ['BSIT', 'BSEd'] };

test('role assignments are validated, deduplicated and need a campus for a program scope', () => {
  assert.deepEqual(
    parseAssignments([
      { role: 'dean', campus: 'COC', program: 'BSIT' },
      { role: 'dean', campus: 'COC', program: 'BSIT' },
      { role: 'dean', campus: 'COC', program: 'BSEd' },
      { role: 'coo', campus: '', program: '' },
    ], known),
    [
      { role: 'dean', campus: 'COC', program: 'BSIT' },
      { role: 'dean', campus: 'COC', program: 'BSEd' },
      { role: 'coo', campus: null, program: null },
    ],
  );
  assert.throws(() => parseAssignments([], known), /at least one role/);
  assert.throws(() => parseAssignments([{ role: 'superuser', campus: 'COC' }], known), /valid role/);
  assert.throws(() => parseAssignments([{ role: 'dean', campus: 'XYZ' }], known), /Unknown campus/);
  assert.throws(() => parseAssignments([{ role: 'dean', campus: '', program: 'BSIT' }], known), /campus for a program/);
});

test('administrators cannot lock themselves or everyone out', () => {
  const base = { actorId: 'a', targetId: 'b', targetWasAdmin: true, targetWillBeAdmin: true, targetWillBeActive: true, otherActiveAdmins: 1 };
  assert.doesNotThrow(() => checkAdminLockout(base));
  assert.throws(() => checkAdminLockout({ ...base, targetId: 'a', targetWillBeAdmin: false }), /your own/);
  assert.throws(() => checkAdminLockout({ ...base, targetId: 'a', targetWillBeActive: false }), /your own/);
  assert.throws(() => checkAdminLockout({ ...base, targetWillBeAdmin: false, otherActiveAdmins: 0 }), /At least one/);
  assert.doesNotThrow(() => checkAdminLockout({ ...base, targetWillBeAdmin: false, otherActiveAdmins: 1 }));
  assert.doesNotThrow(() => checkAdminLockout({ ...base, targetWasAdmin: false, targetWillBeAdmin: false, otherActiveAdmins: 0 }));
});

test('rule set forms produce valid stored thresholds', () => {
  const t = thresholdsFromForm({ studentYellowFrom: '1', studentRedFrom: '2', subjectGreenMax: '10', subjectYellowMax: '40' });
  assert.deepEqual(t.map((x) => [x.level, x.zone, x.min, x.max]), [
    ['student', 'green', 0, 0], ['student', 'yellow', 1, 1], ['student', 'red', 2, null],
    ['subject', 'green', 0, 10], ['subject', 'yellow', 10.01, 40], ['subject', 'red', 40.01, 100],
  ]);
  const wider = thresholdsFromForm({ studentYellowFrom: 2, studentRedFrom: 4, subjectGreenMax: 12.5, subjectYellowMax: 35 });
  assert.deepEqual(wider.find((x) => x.level === 'student' && x.zone === 'yellow'), { level: 'student', zone: 'yellow', min: 2, max: 3 });
  assert.equal(wider.find((x) => x.level === 'subject' && x.zone === 'yellow')?.min, 12.51);
  assert.throws(() => thresholdsFromForm({ studentYellowFrom: 2, studentRedFrom: 2, subjectGreenMax: 10, subjectYellowMax: 40 }), /red after yellow/);
  assert.throws(() => thresholdsFromForm({ studentYellowFrom: 1, studentRedFrom: 2, subjectGreenMax: 10.001, subjectYellowMax: 40 }), /2 decimals/);
  assert.throws(() => thresholdsFromForm({ studentYellowFrom: 1, studentRedFrom: 2, subjectGreenMax: 50, subjectYellowMax: 40 }), /green below yellow/);
  assert.throws(() => thresholdsFromForm({ studentYellowFrom: 1, studentRedFrom: 2, subjectGreenMax: '', subjectYellowMax: 40 }), /must be a number/);
});

test('names, emails, passwords and codes are checked', () => {
  assert.equal(parseName('  Maria   Santos '), 'Maria Santos');
  assert.throws(() => parseName('M'), /2 to 120/);
  assert.equal(parseEmail(' Maria@PHINMAED.com '), 'maria@phinmaed.com');
  assert.throws(() => parseEmail('maria@'), /valid email/);
  assert.throws(() => parsePassword('short'), /12 characters/);
  assert.equal(parseTermCode('2027-2'), '2027-2');
  assert.throws(() => parseTermCode('2027-S2'), /2026-1/);
  assert.equal(parseCode('BSHM', 'Program code'), 'BSHM');
  assert.throws(() => parseCode('1BS', 'Program code'), /starting with a letter/);
});
