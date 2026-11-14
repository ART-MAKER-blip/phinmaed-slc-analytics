import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, toCsv } from './csv';
import {
  cleanStudentId, collectStudentIds, parseSemester, parseSession, SIS_COLUMNS, validateSisTable, type SisLookups,
} from './grades';

// Made-up rows in the real SIS column order. No real student data.
const HEADER = [...SIS_COLUMNS];
const base: Record<string, string> = {
  SESSION: 'SY 25-26 SEM II', COLLEGE: 'College of Information Technology Education',
  COURSE: 'Bachelor of Science in Information Technology', 'STUDENT ID': "'2024-00001", NAME: 'DELA CRUZ, JUAN P ',
  SEMESTER: 'Y2S2', 'YEAR LEVEL': 'YEAR 1', CODE: 'ITE 186', 'SUBJECT NAME': 'COMPUTER PROGRAMMING 2',
  'SUBJECT TYPE': 'Lecture and Laboratory', UNITS: '3', SECTION: 'COC-FAB-IT2-07', TEACHER: 'SANTOS, MARIA L  ',
  'SSP SECTION': '-', 'SSP ADVISER': '-', MODALITY: 'FLEX', 'ENLISTMENT MODE': 'Regular', 'ADMISSION TYPE': 'Regular',
  GENDER: 'Male', P3: '78', P1: '55.5', P2: 'NA', GRADE: '2.5', REMARKS: 'Passed',
};
const row = (over: Record<string, string> = {}) => HEADER.map((h) => over[h] ?? base[h]);
const table = (...rows: Record<string, string>[]) => [HEADER, ...rows.map((r) => row(r))];

function lookups(over: Partial<SisLookups> = {}): SisLookups {
  return {
    termCode: '2025-2',
    campusCode: 'COC',
    programs: new Map([
      ['bachelor of science in information technology', { code: 'BSIT', college: 'College of Information Technology Education' }],
      ['bsit', { code: 'BSIT', college: 'College of Information Technology Education' }],
    ]),
    remarks: new Map([['PASSED', 'Passed'], ['FAILED', 'FAILED'], ['NO CREDIT', 'NO CREDIT'], ['INCOMPLETE', 'INCOMPLETE']]),
    periodTexts: new Set(['NA', 'INC', 'ABS']),
    students: new Map(),
    studentPrograms: new Map(),
    ...over,
  };
}

test('SIS helpers parse sessions, semesters and quoted IDs', () => {
  assert.equal(parseSession('SY 25-26 SEM II'), '2025-2');
  assert.equal(parseSession('SY 2026-2027 SEM I'), '2026-1');
  assert.equal(parseSession('SY 25-26 SUMMER'), '2025-3');
  assert.equal(parseSession('SY 25-27 SEM I'), null);
  assert.equal(parseSession('2nd sem'), null);
  assert.deepEqual(parseSemester('Y2S2'), { year: 2, semester: 2 });
  assert.equal(parseSemester('YEAR 1'), null);
  assert.equal(cleanStudentId("'2024-00001 "), '2024-00001');
});

test('a clean row is normalized: apostrophe, spaces, dashes, year level from SEMESTER', () => {
  const result = validateSisTable(table({}), lookups());
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.rows[0], {
    rowNumber: 2, studentId: '2024-00001', fullName: 'DELA CRUZ, JUAN P', gender: 'Male', admissionType: 'Regular',
    program: 'BSIT', yearLevel: 2, courseCode: 'ITE 186', courseTitle: 'COMPUTER PROGRAMMING 2',
    subjectType: 'Lecture and Laboratory', units: 3, section: 'COC-FAB-IT2-07',
    teacherKey: 'SANTOS, MARIA L', teacherName: 'SANTOS, MARIA L', sspSection: null, sspAdviser: null,
    modality: 'FLEX', enlistmentMode: 'Regular', p1: '55.5', p2: 'NA', p3: '78', finalGrade: '2.5', remarks: 'Passed',
  });
});

test('Excel-style numbers and text period values are accepted', () => {
  const result = validateSisTable(table({ P1: '93.88', P2: 'INC', P3: 'abs', GRADE: 'COMPLETE', REMARKS: 'passed' }), lookups());
  assert.deepEqual(result.issues, []);
  assert.deepEqual([result.rows[0].p1, result.rows[0].p2, result.rows[0].p3, result.rows[0].remarks], ['93.88', 'INC', 'ABS', 'Passed']);
});

test('missing required columns reject the whole file', () => {
  const result = validateSisTable([['SESSION', 'NAME'], ['SY 25-26 SEM II', 'X']], lookups());
  assert.equal(result.fileRejected, true);
  assert.ok(result.issues.some((i) => i.message.includes('"STUDENT ID"')));
});

test('each row problem is reported with its line number; errors skip the row', () => {
  const result = validateSisTable(table(
    {},                                                        // row 2: valid
    { CODE: 'ITE 186' },                                       // row 3: duplicate of row 2
    { 'STUDENT ID': "'2024-00002", NAME: 'REYES, ANA', SESSION: 'SY 24-25 SEM II' }, // row 4: wrong term
    { 'STUDENT ID': "'2024-00003", NAME: 'GARCIA, BEN', COURSE: 'Bachelor of Arts' }, // row 5: unknown program
    { 'STUDENT ID': "'2024-00004", NAME: 'TAN, CY', P1: '120', P2: 'X' },            // row 6: bad scores
    { 'STUDENT ID': "'2024-00005", NAME: 'LIM, DAN', REMARKS: 'MAYBE' },             // row 7: unknown remark
    { 'STUDENT ID': "'2024-00006", NAME: 'UY, EVE', SECTION: 'AU-FA1-IT1-01' },      // row 8: other campus
    { 'STUDENT ID': "'2024-00007", NAME: 'GO, FAY', SEMESTER: 'Y1S1' },              // row 9: wrong semester
  ), lookups());
  const byRow = (n: number) => result.issues.filter((i) => i.rowNumber === n).map((i) => i.type);
  assert.deepEqual(byRow(3), ['duplicate_record']);
  assert.deepEqual(byRow(4), ['term_mapping']);
  assert.deepEqual(byRow(5), ['program_mapping']);
  assert.deepEqual(byRow(6), ['invalid_value', 'invalid_value']);
  assert.deepEqual(byRow(7), ['invalid_value']);
  assert.deepEqual(byRow(8), ['program_mapping']);
  assert.deepEqual(byRow(9), ['term_mapping']);
  assert.deepEqual(result.rows.map((r) => r.rowNumber), [2]);
  assert.ok(result.issues.every((i) => i.severity === 'error'));
});

test('other-college rows and a missing SEMESTER are warnings, and the row is still imported', () => {
  const result = validateSisTable(table(
    { COLLEGE: 'College of Engineering and Architecture' },
    { 'STUDENT ID': "'2024-00009", NAME: 'ONG, GIL', SEMESTER: '', 'YEAR LEVEL': 'YEAR 3' },
    { 'STUDENT ID': "'2024-00010", NAME: 'SY, HAL', SEMESTER: '', 'YEAR LEVEL': '' },
  ), lookups());
  assert.deepEqual(result.issues.map((i) => [i.rowNumber, i.severity]), [[2, 'warning'], [3, 'warning'], [4, 'error']]);
  assert.deepEqual(result.rows.map((r) => [r.rowNumber, r.yearLevel]), [[2, 2], [3, 3]]);
});

test('IDs that disagree with existing records are unmatched identifiers', () => {
  const result = validateSisTable(table({}, { 'STUDENT ID': "'2024-00002", NAME: 'REYES, ANA', CODE: 'GEN 008' }), lookups({
    students: new Map([['2024-00001', 'DELA CRUZ, JUANITO']]),
    studentPrograms: new Map([['2024-00002', 'BSCS']]),
  }));
  assert.deepEqual(result.issues.map((i) => [i.rowNumber, i.type]), [[2, 'unmatched_identifier'], [3, 'unmatched_identifier']]);
});

test('a student must have the same name, program and year level on every row', () => {
  const result = validateSisTable(table({}, { CODE: 'GEN 008', SEMESTER: 'Y3S2' }), lookups());
  assert.deepEqual(result.issues.map((i) => [i.rowNumber, i.type]), [[3, 'invalid_value']]);
});

test('student IDs are collected without apostrophes', () => {
  assert.deepEqual(collectStudentIds(table({}, { CODE: 'GEN 008' }, { 'STUDENT ID': "'2024-00002" })), ['2024-00001', '2024-00002']);
});

test('CSV parser handles quotes, embedded commas and line breaks, CRLF and a BOM', () => {
  const text = '﻿a,b,c\r\n"x, y","say ""hi""","line\nbreak"\r\n\r\n1,,3\n';
  assert.deepEqual(parseCsv(text), [['a', 'b', 'c'], ['x, y', 'say "hi"', 'line\nbreak'], ['1', '', '3']]);
  assert.throws(() => parseCsv('a,"b'), /quoted value/);
});

test('CSV writer round-trips values and neutralizes spreadsheet formulas', () => {
  const csv = toCsv([['a,b', 'q"x', null], ['=SUM(A1)', '-5', 'ok']]);
  assert.deepEqual(parseCsv(csv), [['a,b', 'q"x', ''], ["'=SUM(A1)", "'-5", 'ok']]);
});
