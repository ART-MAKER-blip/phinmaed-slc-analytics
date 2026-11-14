/**
 * Validation for the SIS "Grade Deliberation Report" export: one row per student per
 * subject, with P1, P2 and P3 period scores. Pure functions: everything the checks need
 * from the database is passed in as lookups, so the same code runs at upload and at accept.
 *
 * Known quirks of the real export, handled here:
 * - STUDENT ID starts with an apostrophe ('2024-12345) so Excel keeps it as text.
 * - NAME and TEACHER have trailing spaces; "-" means none in SSP SECTION and SSP ADVISER.
 * - YEAR LEVEL is unreliable (often "YEAR 1" for everyone, sometimes empty), so the year
 *   level comes from SEMESTER (Y2S2 = year 2, semester 2).
 * - A few rows list a different COLLEGE than the program's; they are imported with a warning.
 */
import { parseCsv } from './csv';

export const SIS_COLUMNS = [
  'SESSION', 'COLLEGE', 'COURSE', 'STUDENT ID', 'NAME', 'SEMESTER', 'YEAR LEVEL', 'CODE', 'SUBJECT NAME',
  'SUBJECT TYPE', 'UNITS', 'SECTION', 'TEACHER', 'SSP SECTION', 'SSP ADVISER', 'MODALITY', 'ENLISTMENT MODE',
  'ADMISSION TYPE', 'GENDER', 'P3', 'P1', 'P2', 'GRADE', 'REMARKS',
] as const;

export const REQUIRED_COLUMNS = [
  'SESSION', 'COURSE', 'STUDENT ID', 'NAME', 'SEMESTER', 'CODE', 'SUBJECT NAME', 'SECTION', 'P1', 'P2', 'P3', 'REMARKS',
] as const;

export const MAX_ROWS = 50_000;

/** Period values the export uses besides numbers. Rule sets decide how each one counts. */
export const PERIOD_TEXT_VALUES = ['NA', 'INC', 'ABS'];
const FINAL_GRADE_TEXT = ['NC', 'INC', 'FA', 'DP', 'COMPLETE', 'INCOMPLETE'];

export type IssueType =
  | 'missing_column' | 'missing_value' | 'duplicate_record'
  | 'unmatched_identifier' | 'term_mapping' | 'program_mapping' | 'invalid_value';

/** rowNumber is the line in the file (header = 1); null for file-level issues. Errors skip the row. */
export type ImportIssue = { rowNumber: number | null; type: IssueType; severity: 'error' | 'warning'; message: string };

export type SisRow = {
  rowNumber: number;
  studentId: string;
  fullName: string;
  gender: string | null;
  admissionType: string | null;
  program: string;
  yearLevel: number;
  courseCode: string;
  courseTitle: string;
  subjectType: string | null;
  units: number | null;
  section: string;
  teacherKey: string | null;
  teacherName: string | null;
  sspSection: string | null;
  sspAdviser: string | null;
  modality: string | null;
  enlistmentMode: string | null;
  p1: string | null;
  p2: string | null;
  p3: string | null;
  finalGrade: string | null;
  remarks: string | null;
};

export type SisLookups = {
  /** Selected term, e.g. 2025-2. */
  termCode: string;
  /** Selected campus code, e.g. COC. Section codes start with it. */
  campusCode: string;
  /** Programs offered at the campus, by lower-cased name and code -> { code, college name }. */
  programs: Map<string, { code: string; college: string }>;
  /** REMARKS values by upper case -> stored code (Passed, FAILED, NO CREDIT, INCOMPLETE). */
  remarks: Map<string, string>;
  /** Text period values accepted in P1-P3 (upper case). */
  periodTexts: Set<string>;
  /** Existing students by SIS ID -> full name. */
  students: Map<string, string>;
  /** Program code each student already has in this term. */
  studentPrograms: Map<string, string>;
};

export type SisValidation = { rows: SisRow[]; issues: ImportIssue[]; totalRows: number; fileRejected: boolean };

const normalizeHeader = (h: string) => h.replace(/\s+/g, ' ').trim().toUpperCase();
const clean = (v: string | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const noneIfDash = (v: string) => (v === '' || v === '-' ? null : v);
export const nameKey = (v: string) => clean(v).toUpperCase();

/** "SY 25-26 SEM II" -> "2025-2". Also accepts "SY 2025-2026 SEM 2" and "SUMMER". */
export function parseSession(value: string): string | null {
  const m = /^SY\s*(\d{2}|\d{4})\s*-\s*(\d{2}|\d{4})\s+(?:SEM(?:ESTER)?\s*)?(I{1,3}|[123]|SUMMER)$/i.exec(clean(value));
  if (!m) return null;
  const start = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  const end = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (end !== start + 1) return null;
  const sem = { I: 1, II: 2, III: 3, '1': 1, '2': 2, '3': 3, SUMMER: 3 }[m[3].toUpperCase() as 'I'];
  return sem ? `${start}-${sem}` : null;
}

/** "Y2S2" -> { year: 2, semester: 2 }. */
export function parseSemester(value: string) {
  const m = /^Y([1-5])\s*S([1-3])$/i.exec(clean(value));
  return m ? { year: Number(m[1]), semester: Number(m[2]) } : null;
}

/** Student IDs lose the apostrophe Excel needs to keep them as text. */
export function cleanStudentId(value: string) {
  return clean(value).replace(/^'+/, '').trim();
}

function periodValue(raw: string, label: string, periodTexts: Set<string>, add: (message: string) => void): string | null {
  const v = clean(raw).toUpperCase();
  if (v === '' || v === '-') return null;
  if (periodTexts.has(v)) return v;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    add(`${label} "${clean(raw)}" must be a score from 0 to 100 or one of ${[...periodTexts].join(', ')}.`);
    return null;
  }
  return String(Math.round(n * 100) / 100);
}

export function validateSisTable(table: string[][], lookups: SisLookups): SisValidation {
  if (table.length === 0) {
    return { rows: [], issues: [{ rowNumber: null, type: 'missing_value', severity: 'error', message: 'The file is empty.' }], totalRows: 0, fileRejected: true };
  }
  const headers = table[0].map((h) => normalizeHeader(String(h ?? '')));
  const dataRows = table.slice(1);
  const issues: ImportIssue[] = [];
  const fileError = (type: IssueType, message: string) => issues.push({ rowNumber: null, type, severity: 'error', message });

  for (const column of REQUIRED_COLUMNS) if (!headers.includes(column)) fileError('missing_column', `Required column "${column}" is missing.`);
  for (const column of new Set(headers.filter((h, i) => h !== '' && headers.indexOf(h) !== i))) {
    fileError('invalid_value', `Column "${column}" appears more than once.`);
  }
  if (dataRows.length === 0) fileError('missing_value', 'The file has a header but no data rows.');
  if (dataRows.length > MAX_ROWS) fileError('invalid_value', `The file has ${dataRows.length} rows; the limit is ${MAX_ROWS}. Split it by year level.`);
  if (issues.length > 0) return { rows: [], issues, totalRows: dataRows.length, fileRejected: true };

  const index = new Map(headers.map((h, i) => [h, i]));
  const get = (cells: string[], name: string) => {
    const i = index.get(name);
    return i === undefined ? '' : clean(String(cells[i] ?? ''));
  };
  const termSemester = Number(lookups.termCode.split('-')[1]);

  const rows: SisRow[] = [];
  const firstSeen = new Map<string, number>();
  const studentInFile = new Map<string, { rowNumber: number; program: string; yearLevel: number; name: string }>();

  dataRows.forEach((cells, i) => {
    const rowNumber = i + 2;
    const rowIssues: ImportIssue[] = [];
    const error = (type: IssueType, message: string) => rowIssues.push({ rowNumber, type, severity: 'error', message });
    const warn = (type: IssueType, message: string) => rowIssues.push({ rowNumber, type, severity: 'warning', message });

    // Period scores and remarks may be empty early in a term; SEMESTER can fall back to YEAR LEVEL.
    for (const column of REQUIRED_COLUMNS.filter((c) => !['P1', 'P2', 'P3', 'REMARKS', 'SEMESTER'].includes(c))) {
      if (get(cells, column) === '') error('missing_value', `${column} is empty.`);
    }

    const session = get(cells, 'SESSION');
    const sessionTerm = session ? parseSession(session) : null;
    if (session && !sessionTerm) error('term_mapping', `SESSION "${session}" is not in the form "SY 25-26 SEM II".`);
    else if (sessionTerm && sessionTerm !== lookups.termCode) error('term_mapping', `SESSION "${session}" is term ${sessionTerm}, not the selected term ${lookups.termCode}.`);

    const studentId = cleanStudentId(get(cells, 'STUDENT ID'));
    if (studentId && !/^[A-Za-z0-9-]{4,20}$/.test(studentId)) error('invalid_value', `STUDENT ID "${studentId}" is not a valid ID.`);
    const fullName = get(cells, 'NAME');

    const courseValue = get(cells, 'COURSE');
    const program = courseValue ? lookups.programs.get(courseValue.toLowerCase()) : undefined;
    if (courseValue && !program) error('program_mapping', `COURSE "${courseValue}" is not a program offered at ${lookups.campusCode}.`);
    const college = get(cells, 'COLLEGE');
    if (program && college && college.toLowerCase() !== program.college.toLowerCase()) {
      warn('program_mapping', `COLLEGE "${college}" differs from ${program.code}'s college (${program.college}); imported under ${program.code} from COURSE.`);
    }

    const semester = get(cells, 'SEMESTER');
    const parsed = semester ? parseSemester(semester) : null;
    let yearLevel = parsed?.year ?? 0;
    if (semester && !parsed) error('invalid_value', `SEMESTER "${semester}" is not in the form Y1S2.`);
    if (parsed && parsed.semester !== termSemester) {
      error('term_mapping', `SEMESTER "${semester}" is semester ${parsed.semester}, but term ${lookups.termCode} is semester ${termSemester}.`);
    }
    if (!parsed) {
      const fallback = /^YEAR\s*([1-5])$/i.exec(get(cells, 'YEAR LEVEL'));
      if (fallback) {
        yearLevel = Number(fallback[1]);
        warn('missing_value', `Year level taken from YEAR LEVEL (${yearLevel}) because SEMESTER is missing or invalid.`);
      } else if (!semester) {
        error('missing_value', 'SEMESTER and YEAR LEVEL are both empty, so the year level is unknown.');
      }
    }

    const section = get(cells, 'SECTION').toUpperCase();
    const prefix = /^([A-Z]+)-/.exec(section)?.[1];
    if (prefix && prefix !== lookups.campusCode.toUpperCase()) error('program_mapping', `SECTION "${section}" belongs to campus ${prefix}, not ${lookups.campusCode}.`);

    const unitsRaw = get(cells, 'UNITS');
    const units = unitsRaw === '' ? null : Number(unitsRaw);
    if (units !== null && !(Number.isFinite(units) && units >= 0 && units <= 30)) error('invalid_value', `UNITS "${unitsRaw}" is not a number of units.`);

    const p = (name: 'P1' | 'P2' | 'P3') => periodValue(get(cells, name), name, lookups.periodTexts, (m) => error('invalid_value', m));
    const p1 = p('P1');
    const p2 = p('P2');
    const p3 = p('P3');

    const grade = noneIfDash(get(cells, 'GRADE').toUpperCase());
    if (grade && !FINAL_GRADE_TEXT.includes(grade) && !(Number.isFinite(Number(grade)) && Number(grade) >= 1 && Number(grade) <= 5)) {
      error('invalid_value', `GRADE "${grade}" is not 1.0-5.0 or one of ${FINAL_GRADE_TEXT.join(', ')}.`);
    }
    const remarksRaw = noneIfDash(get(cells, 'REMARKS'));
    const remarks = remarksRaw ? lookups.remarks.get(remarksRaw.toUpperCase()) ?? null : null;
    if (remarksRaw && !remarks) error('invalid_value', `REMARKS "${remarksRaw}" is not one of ${[...lookups.remarks.values()].join(', ')}.`);

    if (studentId && fullName) {
      const known = lookups.students.get(studentId);
      if (known && nameKey(known) !== nameKey(fullName)) {
        error('unmatched_identifier', `Student ${studentId} is on record as ${known}, but the file says ${fullName}.`);
      }
      const knownProgram = lookups.studentPrograms.get(studentId);
      if (knownProgram && program && knownProgram !== program.code) {
        error('unmatched_identifier', `Student ${studentId} is already in ${knownProgram} this term, but the file says ${program.code}.`);
      }
      if (program && yearLevel) {
        const seen = studentInFile.get(studentId);
        if (!seen) studentInFile.set(studentId, { rowNumber, program: program.code, yearLevel, name: nameKey(fullName) });
        else if (seen.program !== program.code || seen.yearLevel !== yearLevel || seen.name !== nameKey(fullName)) {
          error('invalid_value', `Student ${studentId} has a different name, program or year level than on row ${seen.rowNumber}.`);
        }
      }
    }

    const courseCode = get(cells, 'CODE').toUpperCase();
    if (studentId && courseCode) {
      const key = `${studentId}|${courseCode}`;
      const first = firstSeen.get(key);
      if (first) error('duplicate_record', `Repeats row ${first}: same student and subject.`);
      else firstSeen.set(key, rowNumber);
    }

    issues.push(...rowIssues);
    if (!rowIssues.some((x) => x.severity === 'error') && program && yearLevel) {
      const teacher = noneIfDash(get(cells, 'TEACHER'));
      rows.push({
        rowNumber, studentId, fullName,
        gender: noneIfDash(get(cells, 'GENDER')),
        admissionType: noneIfDash(get(cells, 'ADMISSION TYPE')),
        program: program.code, yearLevel, courseCode,
        courseTitle: get(cells, 'SUBJECT NAME'),
        subjectType: noneIfDash(get(cells, 'SUBJECT TYPE')),
        units, section,
        teacherKey: teacher ? nameKey(teacher) : null,
        teacherName: teacher,
        sspSection: noneIfDash(get(cells, 'SSP SECTION')),
        sspAdviser: noneIfDash(get(cells, 'SSP ADVISER')),
        modality: noneIfDash(get(cells, 'MODALITY')),
        enlistmentMode: noneIfDash(get(cells, 'ENLISTMENT MODE')),
        p1, p2, p3, finalGrade: grade, remarks,
      });
    }
  });

  return { rows, issues, totalRows: dataRows.length, fileRejected: false };
}

/** Student IDs in a table, so the server loads only the lookups it needs. */
export function collectStudentIds(table: string[][]) {
  const headers = (table[0] ?? []).map((h) => normalizeHeader(String(h ?? '')));
  const col = headers.indexOf('STUDENT ID');
  if (col === -1) return [];
  return [...new Set(table.slice(1, MAX_ROWS + 1).map((r) => cleanStudentId(String(r[col] ?? ''))).filter(Boolean))];
}

/** CSV text to a table of strings. */
export function tableFromCsv(text: string): string[][] {
  return parseCsv(text);
}
