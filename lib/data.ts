/**
 * Sample data for the UI prototype. All names and counts are placeholders.
 * Replace these lists with queries to PostgreSQL once the schema in the proposal's
 * ERD (Appendix C) is implemented.
 */
import { failureRate, studentZone, subjectZone, type Zone } from './zones';

export type ConcernType = 'Academic' | 'Non-academic';

export interface Student {
  id: string;
  program: string;
  yearLevel: number;
  failedSubjects: number;
  concern: ConcernType;
}

const PROGRAMS = ['BSIT', 'BSEd', 'BSBA', 'BSCrim'];

// 148 placeholder students: 96 with no failed subjects, 38 with one, 14 with two or more.
export const STUDENTS: Student[] = Array.from({ length: 148 }, (_, i) => {
  const failedSubjects = i < 96 ? 0 : i < 134 ? 1 : i < 144 ? 2 : 3;
  return {
    id: `Student ${String(i + 1).padStart(3, '0')}`,
    program: PROGRAMS[i % PROGRAMS.length],
    yearLevel: (i % 4) + 1,
    failedSubjects,
    concern: i % 3 === 0 ? 'Non-academic' : 'Academic',
  };
});

export const FLAGGED_STUDENTS = STUDENTS.filter((s) => studentZone(s.failedSubjects) !== 'green')
  .sort((a, b) => b.failedSubjects - a.failedSubjects);

export interface SubjectResult {
  code: string;
  teacher: string; // placeholder teacher id
  enrolled: number;
  failed: number;
}

export const SUBJECTS: SubjectResult[] = [
  { code: 'Subject A', teacher: 'Teacher 03', enrolled: 41, failed: 19 },
  { code: 'Subject B', teacher: 'Teacher 07', enrolled: 40, failed: 15 },
  { code: 'Subject C', teacher: 'Teacher 11', enrolled: 44, failed: 12 },
  { code: 'Subject D', teacher: 'Teacher 02', enrolled: 36, failed: 8 },
  { code: 'Subject E', teacher: 'Teacher 09', enrolled: 43, failed: 6 },
  { code: 'Subject F', teacher: 'Teacher 01', enrolled: 42, failed: 5 },
  { code: 'Subject G', teacher: 'Teacher 04', enrolled: 45, failed: 4 },
  { code: 'Subject H', teacher: 'Teacher 05', enrolled: 38, failed: 3 },
  { code: 'Subject I', teacher: 'Teacher 06', enrolled: 40, failed: 2 },
  { code: 'Subject J', teacher: 'Teacher 08', enrolled: 36, failed: 1 },
  { code: 'Subject K', teacher: 'Teacher 10', enrolled: 40, failed: 1 },
  { code: 'Subject L', teacher: 'Teacher 12', enrolled: 39, failed: 0 },
].map((s) => s);

export const subjectRows = SUBJECTS.map((s) => {
  const rate = failureRate(s.failed, s.enrolled);
  return { ...s, rate, zone: subjectZone(rate) as Zone };
});

/** Teacher results are shown as review indicators only: no zone, no rank, no rating. */
export const teacherIndicators = [...SUBJECTS]
  .sort((a, b) => a.teacher.localeCompare(b.teacher))
  .map((s) => ({ teacher: s.teacher, classes: 1, enrolled: s.enrolled, failed: s.failed, rate: failureRate(s.failed, s.enrolled) }));

/* ---- Imports ---- */
export interface ImportBatch {
  id: string;
  file: string;
  source: 'SIS' | 'Team Data';
  uploadedBy: string;
  uploadedAt: string;
  rows: number;
  status: 'Accepted' | 'Needs review' | 'Rejected';
}

export const IMPORT_HISTORY: ImportBatch[] = [
  { id: 'IB-0003', file: 'P1_grades_2026-1.csv', source: 'SIS', uploadedBy: 'Data manager 1', uploadedAt: '2026-10-27 09:12', rows: 1036, status: 'Needs review' },
  { id: 'IB-0002', file: 'P1_attendance_2026-1.csv', source: 'SIS', uploadedBy: 'Data manager 1', uploadedAt: '2026-10-27 09:05', rows: 1036, status: 'Accepted' },
  { id: 'IB-0001', file: 'teamdata_2026-1.xlsx', source: 'Team Data', uploadedBy: 'Data manager 2', uploadedAt: '2026-10-26 15:40', rows: 148, status: 'Rejected' },
];

export const IMPORT_ISSUES = [
  { kind: 'Missing column', count: 0, detail: 'All required columns are present: student_id, course_code, term, program, grade, result_status.' },
  { kind: 'Duplicate records', count: 2, detail: 'Rows 214 and 507 repeat the same student and course in the same term.' },
  { kind: 'Unmatched identifiers', count: 3, detail: 'Three student IDs are not in the enrollment list for the selected term.' },
  { kind: 'Term or program mapping', count: 1, detail: 'Row 88 uses program code BSIT-X, which is not mapped to a program.' },
];

export const IMPORT_PREVIEW = [
  { row: 1, student: 'Student 014', course: 'Subject A', term: '2026-1', grade: '68', result: 'Failed', ok: true },
  { row: 2, student: 'Student 014', course: 'Subject B', term: '2026-1', grade: '74', result: 'Passed', ok: true },
  { row: 88, student: 'Student 072', course: 'Subject A', term: '2026-1', grade: '71', result: 'Passed', ok: false },
  { row: 214, student: 'Student 101', course: 'Subject C', term: '2026-1', grade: '70', result: 'Passed', ok: false },
  { row: 215, student: 'Student 033', course: 'Subject D', term: '2026-1', grade: '75', result: 'Passed', ok: true },
];

/* ---- Deliberation ---- */
export const REFERRAL_TEAMS = [
  'Active Learning Coordinator (ALC)',
  'Student Success Program (SSP) adviser',
  'Kasama Support Hub (KSH)',
] as const;
