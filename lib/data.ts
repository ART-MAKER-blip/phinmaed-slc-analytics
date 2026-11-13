/**
 * Sample data for the UI prototype. All names and counts are placeholders.
 * Replace these lists with queries to PostgreSQL once the schema in the proposal's
 * ERD (Appendix C) is implemented.
 */
import type { ZoneOverview } from '@/lib/results/types';
import type { Permission } from './permissions';
import { DEFAULT_RULES, failureRate, studentZone, subjectZone, type Zone, type ZoneThreshold } from './zones';

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

/* ---- Sample zone overview (demo accounts and no-database mode) ---- */

export function sampleOverview(permissions: readonly Permission[]): ZoneOverview {
  const thresholds: ZoneThreshold[] = [
    { level: 'student', zone: 'green', min: 0, max: DEFAULT_RULES.student.yellowMin - 1 },
    { level: 'student', zone: 'yellow', min: DEFAULT_RULES.student.yellowMin, max: DEFAULT_RULES.student.redMin - 1 },
    { level: 'student', zone: 'red', min: DEFAULT_RULES.student.redMin, max: null },
    { level: 'subject', zone: 'green', min: 0, max: DEFAULT_RULES.subject.greenMax },
    { level: 'subject', zone: 'yellow', min: DEFAULT_RULES.subject.greenMax + 0.01, max: DEFAULT_RULES.subject.yellowMax },
    { level: 'subject', zone: 'red', min: DEFAULT_RULES.subject.yellowMax + 0.01, max: 100 },
  ];
  const count = <T,>(items: T[], zone: (item: T) => Zone) => {
    const counts = { green: 0, yellow: 0, red: 0 };
    for (const item of items) counts[zone(item)] += 1;
    return counts;
  };
  const overview: ZoneOverview = {
    source: 'sample',
    run: { runId: 0, campus: 'COC', campusName: 'PHINMA Cagayan de Oro College', term: '2026-1', period: 'P1', ruleSet: DEFAULT_RULES.id, calculatedAt: new Date(0).toISOString() },
    programs: 'all',
    thresholds,
  };
  if (permissions.includes('results.student')) {
    overview.students = {
      counts: count(STUDENTS, (s) => studentZone(s.failedSubjects)),
      total: STUDENTS.length,
      atRisk: FLAGGED_STUDENTS.slice(0, 10).map((s) => ({
        id: s.id, name: s.id, program: s.program, yearLevel: s.yearLevel, failed: s.failedSubjects, zone: studentZone(s.failedSubjects),
      })),
      atRiskTotal: FLAGGED_STUDENTS.length,
    };
  }
  if (permissions.includes('results.subject')) {
    const rows = [...subjectRows].sort((a, b) => b.rate - a.rate).slice(0, 10);
    overview.subjects = {
      counts: count(subjectRows, (s) => s.zone),
      total: subjectRows.length,
      rows: rows.map((s) => ({
        key: s.code, code: s.code, section: 'A', title: s.code, failed: s.failed, graded: s.enrolled, rate: s.rate, zone: s.zone,
        teachers: permissions.includes('results.teacher')
          ? [{ name: s.teacher, failed: s.failed, students: s.enrolled, rate: s.rate }]
          : undefined,
      })),
    };
  }
  if (permissions.includes('results.teacher')) overview.teachers = { total: teacherIndicators.length };
  return overview;
}
