import 'server-only';
import { ApiError } from '@/lib/api';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import type { AuthUser } from '@/lib/auth';
import { inScope } from '@/lib/access';
import { parseCsv } from './csv';
import { collectIdentifiers, validateGradeFile, type GradeLookups, type GradeRow, type GradeValidation } from './grades';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export class ImportError extends ApiError {}

type BatchContext = { campusId: number; campusCode: string; termId: number; termCode: string; academicYearId: number; periodId: number; periodCode: string };

async function loadLookups(db: PoolClient, ctx: BatchContext, text: string): Promise<GradeLookups> {
  const ids = collectIdentifiers(text);
  const [programs, statuses, students, teachers, enrollments] = await Promise.all([
    db.query<{ code: string }>(
      `SELECT p.code FROM campus_program cp JOIN program p ON p.program_id = cp.program_id WHERE cp.campus_id = $1`,
      [ctx.campusId],
    ),
    db.query<{ code: string }>('SELECT code FROM result_status'),
    db.query<{ sis_id: string; last_name: string; first_name: string }>(
      'SELECT sis_id, last_name, first_name FROM student WHERE sis_id = ANY($1::text[])',
      [ids.students],
    ),
    db.query<{ staff_no: string; name: string }>('SELECT staff_no, name FROM teacher WHERE staff_no = ANY($1::text[])', [ids.teachers]),
    db.query<{ sis_id: string; program: string }>(
      `SELECT s.sis_id, p.code AS program
         FROM enrollment e
         JOIN student s ON s.student_id = e.student_id
         JOIN campus_program cp ON cp.campus_program_id = e.campus_program_id
         JOIN program p ON p.program_id = cp.program_id
        WHERE e.academic_year_id = $1 AND s.sis_id = ANY($2::text[])`,
      [ctx.academicYearId, ids.students],
    ),
  ]);

  return {
    termCode: ctx.termCode,
    periodCode: ctx.periodCode,
    programs: new Map(programs.rows.map((r) => [r.code.toLowerCase(), r.code])),
    resultStatuses: new Set(statuses.rows.map((r) => r.code)),
    students: new Map(students.rows.map((r) => [r.sis_id, { lastName: r.last_name, firstName: r.first_name }])),
    teachers: new Map(teachers.rows.map((r) => [r.staff_no, r.name])),
    enrollments: new Map(enrollments.rows.map((r) => [r.sis_id, r.program])),
  };
}

function decodeFile(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ImportError('The file is not UTF-8 text. Save it from the spreadsheet as "CSV UTF-8" and upload again.');
  }
}

/** Checks the user may work with this campus and resolves the ids the batch needs. */
async function resolveContext(db: PoolClient, user: AuthUser, campusId: number, termId: number, periodId: number): Promise<BatchContext> {
  const result = await db.query<{ campus_code: string; term_code: string; academic_year_id: number; period_code: string }>(
    `SELECT c.code AS campus_code, t.code AS term_code, t.academic_year_id, gp.code AS period_code
       FROM campus c, term t, grading_period gp
      WHERE c.campus_id = $1 AND t.term_id = $2 AND gp.grading_period_id = $3`,
    [campusId, termId, periodId],
  );
  const row = result.rows[0];
  if (!row) throw new ImportError('Choose a valid campus, term and period.');
  if (!inScope(user, row.campus_code, null)) throw new ImportError('You cannot import data for this campus.', 403);
  return {
    campusId, campusCode: row.campus_code, termId, termCode: row.term_code,
    academicYearId: row.academic_year_id, periodId, periodCode: row.period_code,
  };
}

export async function createGradeBatch(input: {
  user: AuthUser;
  file: { name: string; type: string; bytes: Buffer };
  campusId: number;
  termId: number;
  periodId: number;
}) {
  const { user, file } = input;
  if (file.bytes.length === 0) throw new ImportError('The file is empty.');
  if (file.bytes.length > MAX_FILE_BYTES) throw new ImportError('The file is larger than 10 MB. Split it by program and upload each part.');
  if (!/\.csv$/i.test(file.name)) throw new ImportError('Upload a .csv file. In Excel, use Save As > "CSV UTF-8".');
  const text = decodeFile(file.bytes);
  const sha256 = createHash('sha256').update(file.bytes).digest('hex');

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const ctx = await resolveContext(client, user, input.campusId, input.termId, input.periodId);

    const previous = await client.query<{ batch_id: number }>(
      `SELECT batch_id FROM import_batch WHERE file_sha256 = $1 AND validation_status = 'accepted' LIMIT 1`,
      [sha256],
    );
    if (previous.rows[0]) throw new ImportError(`This exact file was already imported as batch ${previous.rows[0].batch_id}.`, 409);

    const validation = validateGradeFile(text, await loadLookups(client, ctx, text));
    const status = validation.fileRejected ? 'rejected' : validation.issues.length > 0 ? 'needs_review' : 'pending';

    const batch = await client.query<{ batch_id: number }>(
      `INSERT INTO import_batch (source_id, campus_id, term_id, grading_period_id, uploaded_by, filename,
                                 content_type, file_sha256, original_file, validation_status, total_rows)
       SELECT source_id, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10 FROM import_source WHERE code = 'SIS'
       RETURNING batch_id`,
      [ctx.campusId, ctx.termId, ctx.periodId, user.id, file.name.slice(0, 255), file.type || 'text/csv',
        sha256, file.bytes, status, validation.totalRows],
    );
    const batchId = batch.rows[0].batch_id;
    await insertIssues(client, batchId, validation);
    await writeAudit({
      userId: user.id, action: 'import_upload', tableName: 'import_batch', recordId: batchId,
      metadata: { filename: file.name, status, totalRows: validation.totalRows, issues: validation.issues.length },
    }, client);
    await client.query('COMMIT');
    return { batchId, status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function insertIssues(client: PoolClient, batchId: number, validation: GradeValidation) {
  if (validation.issues.length === 0) return;
  await client.query(
    `INSERT INTO import_row_issue (batch_id, row_number, issue_type, message)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[])`,
    [batchId, validation.issues.map((i) => i.rowNumber), validation.issues.map((i) => i.type), validation.issues.map((i) => i.message)],
  );
}

type BatchRow = {
  batch_id: number; campus_id: number; campus_code: string; term_id: number; grading_period_id: number;
  validation_status: string; original_file: Buffer;
};

async function lockBatch(client: PoolClient, user: AuthUser, batchId: number): Promise<BatchRow> {
  const result = await client.query<BatchRow>(
    `SELECT b.batch_id, b.campus_id, c.code AS campus_code, b.term_id, b.grading_period_id,
            b.validation_status, b.original_file
       FROM import_batch b JOIN campus c ON c.campus_id = b.campus_id
      WHERE b.batch_id = $1
      FOR UPDATE OF b`,
    [batchId],
  );
  const batch = result.rows[0];
  if (!batch || !inScope(user, batch.campus_code, null)) throw new ImportError('Import batch not found.', 404);
  if (!['pending', 'needs_review'].includes(batch.validation_status)) {
    throw new ImportError(`This batch is already ${batch.validation_status}.`, 409);
  }
  return batch;
}

/**
 * Imports the batch's valid rows. The stored original file is validated again against the
 * current database, so records added since the upload are taken into account. Rows with
 * issues are skipped and stay listed in the batch's error report.
 */
export async function acceptGradeBatch(user: AuthUser, batchId: number) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const batch = await lockBatch(client, user, batchId);
    const ctx = await resolveContext(client, user, batch.campus_id, batch.term_id, batch.grading_period_id);
    const text = decodeFile(batch.original_file);
    const validation = validateGradeFile(text, await loadLookups(client, ctx, text));
    if (validation.fileRejected) throw new ImportError('This file has file-level issues and cannot be imported.', 409);
    if (validation.rows.length === 0) throw new ImportError('No rows are valid, so there is nothing to import. Reject this batch instead.', 409);

    // Replace the stored issue list with the result of this final validation.
    await client.query('DELETE FROM import_row_issue WHERE batch_id = $1', [batchId]);
    await insertIssues(client, batchId, validation);
    await client.query(`UPDATE import_row_issue SET resolution_status = 'ignored' WHERE batch_id = $1`, [batchId]);

    const imported = await writeGradeRows(client, ctx, batchId, validation.rows);
    if (imported !== validation.rows.length) {
      throw new Error(`Expected to save ${validation.rows.length} grade records but saved ${imported}.`);
    }

    const skipped = validation.totalRows - validation.rows.length;
    await client.query(
      `UPDATE import_batch
          SET validation_status = 'accepted', imported_at = NOW(), accepted_rows = $2, skipped_rows = $3, decided_by = $4
        WHERE batch_id = $1`,
      [batchId, imported, skipped, user.id],
    );
    await writeAudit({
      userId: user.id, action: 'import_accept', tableName: 'import_batch', recordId: batchId,
      metadata: { acceptedRows: imported, skippedRows: skipped },
    }, client);
    await client.query('COMMIT');
    return { accepted: imported, skipped };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectGradeBatch(user: AuthUser, batchId: number) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await lockBatch(client, user, batchId);
    await client.query(
      `UPDATE import_batch SET validation_status = 'rejected', decided_by = $2 WHERE batch_id = $1`,
      [batchId, user.id],
    );
    await writeAudit({ userId: user.id, action: 'import_reject', tableName: 'import_batch', recordId: batchId }, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function distinctBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(key(item))) seen.set(key(item), item);
  return [...seen.values()];
}

/** Set-based upserts of the reference records each grade needs, then the grades themselves. */
async function writeGradeRows(client: PoolClient, ctx: BatchContext, batchId: number, rows: GradeRow[]) {
  const students = distinctBy(rows, (r) => r.studentId);
  await client.query(
    `INSERT INTO student (sis_id, last_name, first_name)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
     ON CONFLICT (sis_id) DO NOTHING`,
    [students.map((r) => r.studentId), students.map((r) => r.lastName), students.map((r) => r.firstName)],
  );
  await client.query(
    `INSERT INTO enrollment (student_id, campus_program_id, year_level_id, academic_year_id)
     SELECT s.student_id, cp.campus_program_id, u.year_level, $4
       FROM unnest($1::text[], $2::text[], $3::smallint[]) AS u(sis_id, program, year_level)
       JOIN student s ON s.sis_id = u.sis_id
       JOIN program p ON p.code = u.program
       JOIN campus_program cp ON cp.program_id = p.program_id AND cp.campus_id = $5
     ON CONFLICT (student_id, academic_year_id) DO NOTHING`,
    [students.map((r) => r.studentId), students.map((r) => r.program), students.map((r) => r.yearLevel), ctx.academicYearId, ctx.campusId],
  );

  const courses = distinctBy(rows, (r) => r.courseCode);
  await client.query(
    `INSERT INTO course (code, title) SELECT * FROM unnest($1::text[], $2::text[]) ON CONFLICT (code) DO NOTHING`,
    [courses.map((r) => r.courseCode), courses.map((r) => r.courseTitle)],
  );
  const programCourses = distinctBy(rows, (r) => `${r.program}|${r.courseCode}`);
  await client.query(
    `INSERT INTO program_course (program_id, course_id, year_level_id)
     SELECT p.program_id, c.course_id, u.year_level
       FROM unnest($1::text[], $2::text[], $3::smallint[]) AS u(program, course, year_level)
       JOIN program p ON p.code = u.program
       JOIN course c ON c.code = u.course
     ON CONFLICT (program_id, course_id) DO NOTHING`,
    [programCourses.map((r) => r.program), programCourses.map((r) => r.courseCode), programCourses.map((r) => r.yearLevel)],
  );

  const offerings = distinctBy(rows, (r) => `${r.courseCode}|${r.section}`);
  await client.query(
    `INSERT INTO course_offering (course_id, term_id, campus_id, section)
     SELECT c.course_id, $3, $4, u.section
       FROM unnest($1::text[], $2::text[]) AS u(course, section)
       JOIN course c ON c.code = u.course
     ON CONFLICT (course_id, term_id, campus_id, section) DO NOTHING`,
    [offerings.map((r) => r.courseCode), offerings.map((r) => r.section), ctx.termId, ctx.campusId],
  );

  const withTeacher = rows.filter((r) => r.teacherId && r.teacherName);
  const teachers = distinctBy(withTeacher, (r) => r.teacherId!);
  await client.query(
    `INSERT INTO teacher (staff_no, name) SELECT * FROM unnest($1::text[], $2::text[]) ON CONFLICT (staff_no) DO NOTHING`,
    [teachers.map((r) => r.teacherId), teachers.map((r) => r.teacherName)],
  );
  const assignments = distinctBy(withTeacher, (r) => `${r.courseCode}|${r.section}|${r.teacherId}`);
  await client.query(
    `INSERT INTO teaching_assignment (offering_id, teacher_id)
     SELECT o.offering_id, t.teacher_id
       FROM unnest($1::text[], $2::text[], $3::text[]) AS u(course, section, staff_no)
       JOIN course c ON c.code = u.course
       JOIN course_offering o ON o.course_id = c.course_id AND o.section = u.section AND o.term_id = $4 AND o.campus_id = $5
       JOIN teacher t ON t.staff_no = u.staff_no
     ON CONFLICT (offering_id, teacher_id, role) DO NOTHING`,
    [assignments.map((r) => r.courseCode), assignments.map((r) => r.section), assignments.map((r) => r.teacherId), ctx.termId, ctx.campusId],
  );

  // A later file for the same period replaces a grade (late grade changes); a trigger keeps
  // the earlier value in grade_record_history. updated_at uses clock_timestamp(), the time
  // of the write, so zone snapshots can tell exactly which grades they included.
  const result = await client.query(
    `INSERT INTO grade_record (student_id, offering_id, grading_period_id, attempt_no, grade_value, result_status_id, batch_id, updated_at)
     SELECT s.student_id, o.offering_id, $7, u.attempt, u.grade, rs.result_status_id, $8, clock_timestamp()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::smallint[], $5::text[], $6::text[])
            AS u(sis_id, course, section, attempt, grade, status)
       JOIN student s ON s.sis_id = u.sis_id
       JOIN course c ON c.code = u.course
       JOIN course_offering o ON o.course_id = c.course_id AND o.section = u.section AND o.term_id = $9 AND o.campus_id = $10
       JOIN result_status rs ON rs.code = u.status
     ON CONFLICT (student_id, offering_id, grading_period_id, attempt_no) DO UPDATE
       SET grade_value = EXCLUDED.grade_value,
           result_status_id = EXCLUDED.result_status_id,
           batch_id = EXCLUDED.batch_id,
           updated_at = clock_timestamp()`,
    [rows.map((r) => r.studentId), rows.map((r) => r.courseCode), rows.map((r) => r.section), rows.map((r) => r.attempt),
      rows.map((r) => r.grade), rows.map((r) => r.resultStatus), ctx.periodId, batchId, ctx.termId, ctx.campusId],
  );
  return result.rowCount ?? 0;
}

/** The first rows of a stored file for the preview table, with their line numbers in the file. */
export function previewRows(original: Buffer, limit: number) {
  try {
    const table = parseCsv(decodeFile(original));
    return {
      headers: table[0] ?? [],
      rows: table.slice(1, limit + 1).map((cells, index) => ({ rowNumber: index + 2, cells })),
    };
  } catch {
    return { headers: [], rows: [] };
  }
}

/* ---- Reads for pages and downloads ---- */

export type BatchSummary = {
  batch_id: number;
  filename: string;
  source: string;
  campus_code: string;
  term_code: string | null;
  period_code: string | null;
  uploaded_by_name: string;
  uploaded_at: Date;
  imported_at: Date | null;
  validation_status: 'pending' | 'needs_review' | 'accepted' | 'rejected';
  total_rows: number | null;
  accepted_rows: number | null;
  skipped_rows: number | null;
  issue_count: number;
  /** Rows with at least one issue. */
  issue_row_count: number;
  file_issue_count: number;
  file_sha256: string;
  original_file?: Buffer;
};

const BATCH_SELECT = `
  SELECT b.batch_id, b.filename, s.name AS source, c.code AS campus_code, t.code AS term_code,
         gp.code AS period_code, u.name AS uploaded_by_name, b.uploaded_at, b.imported_at,
         b.validation_status, b.total_rows, b.accepted_rows, b.skipped_rows, b.file_sha256,
         (SELECT count(*)::int FROM import_row_issue i WHERE i.batch_id = b.batch_id) AS issue_count,
         (SELECT count(DISTINCT i.row_number)::int FROM import_row_issue i WHERE i.batch_id = b.batch_id) AS issue_row_count,
         (SELECT count(*)::int FROM import_row_issue i WHERE i.batch_id = b.batch_id AND i.row_number IS NULL) AS file_issue_count
    FROM import_batch b
    JOIN import_source s ON s.source_id = b.source_id
    JOIN campus c ON c.campus_id = b.campus_id
    LEFT JOIN term t ON t.term_id = b.term_id
    LEFT JOIN grading_period gp ON gp.grading_period_id = b.grading_period_id
    JOIN app_users u ON u.id = b.uploaded_by`;

/** Recent batches at campuses the user can see (program-scoped users see none). */
export async function listBatches(user: AuthUser, limit = 50): Promise<BatchSummary[]> {
  const campuses = user.scopes.filter((s) => s.program === null).map((s) => s.campus);
  if (campuses.length === 0) return [];
  const allCampuses = campuses.includes(null);
  const result = await getPool().query<BatchSummary>(
    `${BATCH_SELECT} WHERE ($1 OR c.code = ANY($2::text[])) ORDER BY b.uploaded_at DESC LIMIT $3`,
    [allCampuses, campuses.filter((c): c is string => c !== null), limit],
  );
  return result.rows;
}

export async function getBatchForUser(user: AuthUser, batchId: number, options: { withFile?: boolean } = {}) {
  const select = options.withFile ? BATCH_SELECT.replace('b.file_sha256,', 'b.file_sha256, b.original_file,') : BATCH_SELECT;
  const result = await getPool().query<BatchSummary>(`${select} WHERE b.batch_id = $1`, [batchId]);
  const batch = result.rows[0];
  return batch && inScope(user, batch.campus_code, null) ? batch : null;
}

export async function getIssueTypeCounts(batchId: number) {
  const result = await getPool().query<{ issue_type: string; count: number }>(
    `SELECT issue_type, count(*)::int AS count FROM import_row_issue WHERE batch_id = $1 GROUP BY issue_type ORDER BY count DESC`,
    [batchId],
  );
  return result.rows;
}

export async function getBatchIssues(batchId: number, limit = 10_000) {
  const result = await getPool().query<{
    row_number: number | null; issue_type: string; message: string; resolution_status: string;
  }>(
    `SELECT row_number, issue_type, message, resolution_status
       FROM import_row_issue WHERE batch_id = $1
      ORDER BY row_number NULLS FIRST, issue_id LIMIT $2`,
    [batchId, limit],
  );
  return result.rows;
}

/** Campuses (in scope), terms and periods for the upload form. */
export async function getUploadOptions(user: AuthUser) {
  const pool = getPool();
  const [campuses, terms, periods] = await Promise.all([
    pool.query<{ campus_id: number; code: string; name: string }>(
      `SELECT campus_id, code, name FROM campus WHERE status = 'active' ORDER BY name`,
    ),
    pool.query<{ term_id: number; code: string; name: string }>('SELECT term_id, code, name FROM term ORDER BY code DESC'),
    pool.query<{ grading_period_id: number; code: string; name: string }>(
      'SELECT grading_period_id, code, name FROM grading_period ORDER BY grading_period_id',
    ),
  ]);
  return {
    campuses: campuses.rows.filter((c) => inScope(user, c.code, null)),
    terms: terms.rows,
    periods: periods.rows,
  };
}
