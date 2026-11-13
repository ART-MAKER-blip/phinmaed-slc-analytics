import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, toCsv } from './csv';
import { collectIdentifiers, normalizeResultStatus, validateGradeFile, type GradeLookups } from './grades';

const HEADER = 'student_id,last_name,first_name,program,year_level,course_code,course_title,section,result_status,grade,teacher_id,teacher_name';

function lookups(overrides: Partial<GradeLookups> = {}): GradeLookups {
  return {
    termCode: '2026-1',
    periodCode: 'P1',
    programs: new Map([['bsit', 'BSIT'], ['bsed', 'BSEd']]),
    resultStatuses: new Set(['PASSED', 'FAILED', 'INC', 'DROPPED', 'WITHDRAWN', 'NO_GRADE']),
    students: new Map(),
    teachers: new Map(),
    enrollments: new Map(),
    ...overrides,
  };
}

const file = (...rows: string[]) => [HEADER, ...rows].join('\r\n');

test('CSV parser handles quotes, embedded commas and line breaks, CRLF and a BOM', () => {
  const text = '﻿a,b,c\r\n"x, y","say ""hi""","line\nbreak"\r\n\r\n1,,3\n';
  assert.deepEqual(parseCsv(text), [['a', 'b', 'c'], ['x, y', 'say "hi"', 'line\nbreak'], ['1', '', '3']]);
  assert.throws(() => parseCsv('a,"b'), /quoted value/);
});

test('CSV writer round-trips values and neutralizes spreadsheet formulas', () => {
  const csv = toCsv([['a,b', 'q"x', null], ['=SUM(A1)', '-5', 'ok']]);
  assert.deepEqual(parseCsv(csv), [['a,b', 'q"x', ''], ["'=SUM(A1)", "'-5", 'ok']]);
});

test('a clean file produces normalized rows and no issues', () => {
  const result = validateGradeFile(
    file('2026-001,Dela Cruz,Juan,bsit,1,it 101,Intro to Computing,a,Failed,68,T-3,"Santos, Maria"'),
    lookups(),
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.fileRejected, false);
  assert.equal(result.totalRows, 1);
  assert.deepEqual(result.rows[0], {
    rowNumber: 2, studentId: '2026-001', lastName: 'Dela Cruz', firstName: 'Juan', program: 'BSIT', yearLevel: 1,
    courseCode: 'IT 101', courseTitle: 'Intro to Computing', section: 'A', grade: '68', resultStatus: 'FAILED',
    teacherId: 'T-3', teacherName: 'Santos, Maria', attempt: 1,
  });
});

test('missing required columns reject the whole file', () => {
  const result = validateGradeFile('student_id,last_name\n1,X', lookups());
  assert.equal(result.fileRejected, true);
  assert.equal(result.rows.length, 0);
  assert.ok(result.issues.every((i) => i.type === 'missing_column' && i.rowNumber === null));
  assert.ok(result.issues.some((i) => i.message.includes('"course_code"')));
});

test('header names are matched regardless of case and spacing', () => {
  const header = 'Student ID,Last Name,First Name,Program,Year Level,Course Code,Course Title,Section,Result Status';
  const result = validateGradeFile(`${header}\n1,A,B,BSIT,2,C1,Course,A,PASSED`, lookups());
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows.length, 1);
});

test('each kind of row problem is reported with its line number and the row is skipped', () => {
  const result = validateGradeFile(
    file(
      '1,A,B,BSIT,1,C1,Course,A,PASSED,,,',          // row 2: valid
      ',A,B,BSIT,1,C1,Course,A,PASSED,,,',           // row 3: missing student id
      '1,A,B,BSIT,1,C1,Course,A,FAILED,,,',          // row 4: duplicate of row 2
      '3,C,D,BSXX,1,C1,Course,A,PASSED,,,',          // row 5: unmapped program
      '4,E,F,BSIT,7,C1,Course,A,MAYBE,,,',           // row 6: bad year level and status
      '5,G,H,BSIT,1,C1,Course,A,PASSED,,T-1,',       // row 7: teacher id without name
    ),
    lookups(),
  );
  const byRow = (n: number) => result.issues.filter((i) => i.rowNumber === n).map((i) => i.type);
  assert.deepEqual(byRow(2), []);
  assert.deepEqual(byRow(3), ['missing_value']);
  assert.deepEqual(byRow(4), ['duplicate_record']);
  assert.deepEqual(byRow(5), ['program_mapping']);
  assert.deepEqual(byRow(6), ['invalid_value', 'invalid_value']);
  assert.deepEqual(byRow(7), ['missing_value']);
  assert.deepEqual(result.rows.map((r) => r.rowNumber), [2]);
  assert.equal(result.totalRows, 6);
});

test('ids that disagree with existing records are flagged as unmatched identifiers', () => {
  const result = validateGradeFile(
    file(
      '1,Reyes,Ana,BSIT,1,C1,Course,A,PASSED,,T-1,Lim',
      '2,Cruz,Ben,BSIT,1,C1,Course,A,PASSED,,,',
    ),
    lookups({
      students: new Map([['1', { lastName: 'Garcia', firstName: 'Ana' }], ['2', { lastName: 'cruz', firstName: 'Ben' }]]),
      teachers: new Map([['T-1', 'Tan']]),
      enrollments: new Map([['2', 'BSEd']]),
    }),
  );
  const messages = result.issues.map((i) => `${i.rowNumber} ${i.type}`);
  assert.deepEqual(messages, ['2 unmatched_identifier', '2 unmatched_identifier', '3 unmatched_identifier']);
  assert.equal(result.rows.length, 0);
});

test('term and period columns, when present, must match the selected term and period', () => {
  const header = `${HEADER},term,period`;
  const result = validateGradeFile(
    [header, '1,A,B,BSIT,1,C1,Course,A,PASSED,,,,2026-1,p1', '2,A,B,BSIT,1,C1,Course,A,PASSED,,,,2025-2,P2'].join('\n'),
    lookups(),
  );
  assert.deepEqual(result.issues.map((i) => [i.rowNumber, i.type]), [[3, 'term_mapping'], [3, 'term_mapping']]);
  assert.equal(result.rows.length, 1);
});

test('a student must have the same program, year level and name on every row', () => {
  const result = validateGradeFile(
    file('1,A,B,BSIT,1,C1,Course,A,PASSED,,,', '1,A,B,BSEd,1,C2,Course 2,A,PASSED,,,'),
    lookups(),
  );
  assert.deepEqual(result.issues.map((i) => [i.rowNumber, i.type]), [[3, 'invalid_value']]);
});

test('result statuses accept common spellings', () => {
  const known = lookups().resultStatuses;
  assert.equal(normalizeResultStatus('Passed', known), 'PASSED');
  assert.equal(normalizeResultStatus('fail', known), 'FAILED');
  assert.equal(normalizeResultStatus('Incomplete', known), 'INC');
  assert.equal(normalizeResultStatus('W', known), 'WITHDRAWN');
  assert.equal(normalizeResultStatus('excellent', known), null);
});

test('identifiers are collected for database lookups', () => {
  assert.deepEqual(
    collectIdentifiers(file('1,A,B,BSIT,1,C1,X,A,PASSED,,T-1,Lim', '1,A,B,BSIT,1,C2,X,A,PASSED,,,')),
    { students: ['1'], teachers: ['T-1'] },
  );
});
