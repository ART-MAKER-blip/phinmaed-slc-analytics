/**
 * Validation for SIS grade files. Pure functions: everything the checks need from the
 * database is passed in as lookups, so the same code runs at upload and again at accept.
 *
 * The column list is the working assumption until the SIS export format is confirmed
 * with PHINMA (proposal, Requirements Gathering).
 */
import { parseCsv } from './csv';

export const REQUIRED_COLUMNS = [
  'student_id', 'last_name', 'first_name', 'program', 'year_level',
  'course_code', 'course_title', 'section', 'result_status',
] as const;
export const OPTIONAL_COLUMNS = ['grade', 'teacher_id', 'teacher_name', 'attempt', 'term', 'period'] as const;
export const TEMPLATE_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;

export const MAX_ROWS = 50_000;

export type IssueType =
  | 'missing_column' | 'missing_value' | 'duplicate_record'
  | 'unmatched_identifier' | 'term_mapping' | 'program_mapping' | 'invalid_value';

/** rowNumber is the line in the file (header = 1); null for file-level issues. */
export type ImportIssue = { rowNumber: number | null; type: IssueType; message: string };

export type GradeRow = {
  rowNumber: number;
  studentId: string;
  lastName: string;
  firstName: string;
  program: string;
  yearLevel: number;
  courseCode: string;
  courseTitle: string;
  section: string;
  grade: string | null;
  resultStatus: string;
  teacherId: string | null;
  teacherName: string | null;
  attempt: number;
};

export type GradeLookups = {
  termCode: string;
  periodCode: string;
  /** Lower-cased program code -> program code, for programs offered at the batch's campus. */
  programs: Map<string, string>;
  /** Result status codes in the database (upper case). */
  resultStatuses: Set<string>;
  /** Existing students by SIS id. */
  students: Map<string, { lastName: string; firstName: string }>;
  /** Existing teachers by staff number. */
  teachers: Map<string, string>;
  /** Existing enrollments for the term's academic year: SIS id -> program code. */
  enrollments: Map<string, string>;
};

export type GradeValidation = {
  rows: GradeRow[];
  issues: ImportIssue[];
  /** Total data rows in the file (excluding the header). */
  totalRows: number;
  /** True when the file cannot be imported at all (for example, missing columns). */
  fileRejected: boolean;
};

const RESULT_ALIASES: Record<string, string> = {
  PASS: 'PASSED', P: 'PASSED',
  FAIL: 'FAILED', F: 'FAILED',
  INCOMPLETE: 'INC',
  DROP: 'DROPPED', DRP: 'DROPPED',
  W: 'WITHDRAWN', WD: 'WITHDRAWN',
  NG: 'NO_GRADE', 'NO GRADE': 'NO_GRADE',
};

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');
const clean = (v: string | undefined) => (v ?? '').trim();
const code = (v: string) => v.trim().replace(/\s+/g, ' ').toUpperCase();
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function normalizeResultStatus(value: string, known: Set<string>): string | null {
  const upper = value.trim().toUpperCase();
  if (known.has(upper)) return upper;
  const alias = RESULT_ALIASES[upper];
  return alias && known.has(alias) ? alias : null;
}

/** Checks that need only the file itself: columns, values, and duplicates within the file. */
export function validateGradeFile(text: string, lookups: GradeLookups): GradeValidation {
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The file could not be read as CSV.';
    return { rows: [], issues: [{ rowNumber: null, type: 'invalid_value', message }], totalRows: 0, fileRejected: true };
  }

  if (table.length === 0) {
    return { rows: [], issues: [{ rowNumber: null, type: 'missing_value', message: 'The file is empty.' }], totalRows: 0, fileRejected: true };
  }

  const headers = table[0].map(normalizeHeader);
  const dataRows = table.slice(1);
  const issues: ImportIssue[] = [];

  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  for (const column of missing) {
    issues.push({ rowNumber: null, type: 'missing_column', message: `Required column "${column}" is missing.` });
  }
  const duplicateHeaders = headers.filter((h, i) => h !== '' && headers.indexOf(h) !== i);
  for (const column of new Set(duplicateHeaders)) {
    issues.push({ rowNumber: null, type: 'invalid_value', message: `Column "${column}" appears more than once.` });
  }
  if (dataRows.length === 0) {
    issues.push({ rowNumber: null, type: 'missing_value', message: 'The file has a header but no data rows.' });
  }
  if (dataRows.length > MAX_ROWS) {
    issues.push({ rowNumber: null, type: 'invalid_value', message: `The file has ${dataRows.length} rows; the limit is ${MAX_ROWS}. Split it by program.` });
  }
  if (issues.length > 0) return { rows: [], issues, totalRows: dataRows.length, fileRejected: true };

  const col = (name: string) => headers.indexOf(name);
  const get = (cells: string[], name: string) => (col(name) === -1 ? '' : clean(cells[col(name)]));

  const rows: GradeRow[] = [];
  const firstSeen = new Map<string, number>();
  const studentInFile = new Map<string, { rowNumber: number; program: string; yearLevel: number; lastName: string }>();

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const rowIssues: ImportIssue[] = [];
    const add = (type: IssueType, message: string) => rowIssues.push({ rowNumber, type, message });

    for (const column of REQUIRED_COLUMNS) {
      if (get(cells, column) === '') add('missing_value', `"${column}" is empty.`);
    }

    const studentId = get(cells, 'student_id');
    const lastName = get(cells, 'last_name');
    const firstName = get(cells, 'first_name');
    const programRaw = get(cells, 'program');
    const courseCode = code(get(cells, 'course_code'));
    const section = code(get(cells, 'section'));
    const teacherId = get(cells, 'teacher_id') || null;
    const teacherName = get(cells, 'teacher_name') || null;

    const program = lookups.programs.get(programRaw.toLowerCase());
    if (programRaw && !program) add('program_mapping', `Program "${programRaw}" is not mapped to a program at this campus.`);

    const yearLevelRaw = get(cells, 'year_level');
    const yearLevel = Number(yearLevelRaw);
    if (yearLevelRaw && !(Number.isInteger(yearLevel) && yearLevel >= 1 && yearLevel <= 4)) {
      add('invalid_value', `Year level "${yearLevelRaw}" must be 1 to 4.`);
    }

    const attemptRaw = get(cells, 'attempt');
    const attempt = attemptRaw === '' ? 1 : Number(attemptRaw);
    if (!(Number.isInteger(attempt) && attempt >= 1 && attempt <= 9)) add('invalid_value', `Attempt "${attemptRaw}" must be a whole number from 1 to 9.`);

    const statusRaw = get(cells, 'result_status');
    const resultStatus = statusRaw ? normalizeResultStatus(statusRaw, lookups.resultStatuses) : null;
    if (statusRaw && !resultStatus) add('invalid_value', `Result status "${statusRaw}" is not recognized.`);

    const term = get(cells, 'term');
    if (term && term !== lookups.termCode) add('term_mapping', `Term "${term}" does not match the selected term ${lookups.termCode}.`);
    const period = get(cells, 'period');
    if (period && period.toUpperCase() !== lookups.periodCode) add('term_mapping', `Period "${period}" does not match the selected period ${lookups.periodCode}.`);

    if (teacherId && !teacherName) add('missing_value', '"teacher_name" is required when "teacher_id" is given.');

    // Identifier checks against existing records: a mismatch usually means a mistyped id.
    const knownStudent = studentId ? lookups.students.get(studentId) : undefined;
    if (knownStudent && lastName && !sameName(knownStudent.lastName, lastName)) {
      add('unmatched_identifier', `Student ${studentId} is on record as ${knownStudent.lastName}, but the file says ${lastName}.`);
    }
    const enrolledProgram = studentId ? lookups.enrollments.get(studentId) : undefined;
    if (enrolledProgram && program && enrolledProgram !== program) {
      add('unmatched_identifier', `Student ${studentId} is enrolled in ${enrolledProgram} this academic year, but the file says ${program}.`);
    }
    const knownTeacher = teacherId ? lookups.teachers.get(teacherId) : undefined;
    if (knownTeacher && teacherName && !sameName(knownTeacher, teacherName)) {
      add('unmatched_identifier', `Teacher ${teacherId} is on record as ${knownTeacher}, but the file says ${teacherName}.`);
    }

    // Consistency within the file: one student, one program, year level and name.
    if (studentId && program) {
      const seen = studentInFile.get(studentId);
      if (!seen) studentInFile.set(studentId, { rowNumber, program, yearLevel, lastName });
      else if (seen.program !== program || seen.yearLevel !== yearLevel || !sameName(seen.lastName, lastName)) {
        add('invalid_value', `Student ${studentId} has a different program, year level or name than on row ${seen.rowNumber}.`);
      }
    }

    if (studentId && courseCode && section) {
      const key = `${studentId}|${courseCode}|${section}|${attempt}`;
      const first = firstSeen.get(key);
      if (first) add('duplicate_record', `Repeats row ${first}: same student, course, section and attempt.`);
      else firstSeen.set(key, rowNumber);
    }

    issues.push(...rowIssues);
    if (rowIssues.length === 0 && program && resultStatus) {
      rows.push({
        rowNumber, studentId, lastName, firstName, program, yearLevel, courseCode,
        courseTitle: get(cells, 'course_title'), section,
        grade: get(cells, 'grade') || null, resultStatus, teacherId, teacherName, attempt,
      });
    }
  });

  return { rows, issues, totalRows: dataRows.length, fileRejected: false };
}

/** The ids in a file, so the server can load only the lookups it needs. */
export function collectIdentifiers(text: string) {
  const students = new Set<string>();
  const teachers = new Set<string>();
  try {
    const table = parseCsv(text);
    const headers = (table[0] ?? []).map(normalizeHeader);
    const s = headers.indexOf('student_id');
    const t = headers.indexOf('teacher_id');
    for (const cells of table.slice(1, MAX_ROWS + 1)) {
      if (s !== -1 && clean(cells[s])) students.add(clean(cells[s]));
      if (t !== -1 && clean(cells[t])) teachers.add(clean(cells[t]));
    }
  } catch {
    // validateGradeFile reports unreadable files.
  }
  return { students: [...students], teachers: [...teachers] };
}
