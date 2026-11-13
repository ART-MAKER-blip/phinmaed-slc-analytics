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

/* ---- Deliberation ---- */
export const REFERRAL_TEAMS = [
  'Active Learning Coordinator (ALC)',
  'Student Success Program (SSP) adviser',
  'Kasama Support Hub (KSH)',
] as const;
