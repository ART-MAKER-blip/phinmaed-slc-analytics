import 'server-only';
import { serial } from '@/lib/serial';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '@/lib/errors';
import { getPool } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import type { AuthUser } from '@/lib/auth';
import { inScope } from '@/lib/access';
import { collectStudentIds, PERIOD_TEXT_VALUES, validateSisTable, type SisLookups, type SisRow, type SisValidation } from './grades';
import { FileReadError, readUploadTable } from './read';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export class ImportError extends ApiError {}

type BatchContext = { campusId: number; campusCode: string; termId: number; termCode: string };

async function loadLookups(db: PoolClient, ctx: BatchContext, table: string[][]): Promise<SisLookups> {
  const ids = collectStudentIds(table);
  const [programs, remarks, ruleTexts, students, studentPrograms] = await serial([
    () => db.query<{ code: string; name: string; college: string }>(
      `SELECT p.code, p.name, col.name AS college
         FROM campus_program cp JOIN program p ON p.program_id = cp.program_id JOIN college col ON col.college_id = p.college_id
        WHERE cp.campus_id = $1`,
      [ctx.campusId],
    ),
    () => db.query<{ code: string }>('SELECT code FROM result_status'),
    () => db.query<{ value: string }>(`SELECT DISTINCT unnest(failed_values || skipped_values) AS value FROM zone_rule_set`),
    () => db.query<{ sis_id: string; full_name: string }>('SELECT sis_id, full_name FROM student WHERE sis_id = ANY($1::text[])', [ids]),
    () => db.query<{ sis_id: string; program: string }>(
      `SELECT s.sis_id, p.code AS program
         FROM student_term st
         JOIN student s ON s.student_id = st.student_id
         JOIN campus_program cp ON cp.campus_program_id = st.campus_program_id
         JOIN program p ON p.program_id = cp.program_id
        WHERE st.term_id = $1 AND s.sis_id = ANY($2::text[])`,
      [ctx.termId, ids],
    ),
  ] as const);
  const programMap = new Map<string, { code: string; college: string }>();
  for (const p of programs.rows) {
    programMap.set(p.name.toLowerCase(), { code: p.code, college: p.college });
    programMap.set(p.code.toLowerCase(), { code: p.code, college: p.college });
  }
  return {
    termCode: ctx.termCode,
    campusCode: ctx.campusCode,
    programs: programMap,
    remarks: new Map(remarks.rows.map((r) => [r.code.toUpperCase(), r.code])),
    periodTexts: new Set([...PERIOD_TEXT_VALUES, ...ruleTexts.rows.map((r) => r.value.toUpperCase())]),
    students: new Map(students.rows.map((r) => [r.sis_id, r.full_name])),
    studentPrograms: new Map(studentPrograms.rows.map((r) => [r.sis_id, r.program])),
  };
}

async function readTable(bytes: Buffer, filename: string) {
  try {
    return await readUploadTable(bytes, filename);
  } catch (error) {
    if (error instanceof FileReadError) throw new ImportError(error.message);
    throw error;
  }
}

/** Checks the user may work with this campus and resolves the ids the batch needs. */
async function resolveContext(db: PoolClient, user: AuthUser, campusId: number, termId: number): Promise<BatchContext> {
  const result = await db.query<{ campus_code: string; term_code: string }>(
    'SELECT c.code AS campus_code, t.code AS term_code FROM campus c, term t WHERE c.campus_id = $1 AND t.term_id = $2',
    [campusId, termId],
  );
  const row = result.rows[0];
  if (!row) throw new ImportError('Choose a valid campus and term.');
  if (!inScope(user, row.campus_code, null)) throw new ImportError('You cannot import data for this campus.', 403);
  return { campusId, campusCode: row.campus_code, termId, termCode: row.term_code };
}

function batchStatus(validation: SisValidation) {
  if (validation.fileRejected) return 'rejected';
  return validation.issues.length > 0 ? 'needs_review' : 'pending';
}

export async function createGradeBatch(input: {
  user: AuthUser;
  file: { name: string; type: string; bytes: Buffer };
  campusId: number;
  termId: number;
}) {
  const { user, file } = input;
  if (file.bytes.length === 0) throw new ImportError('The file is empty.');
  if (file.bytes.length > MAX_FILE_BYTES) throw new ImportError('The file is larger than 15 MB. Split it by year level and upload each part.');
  const table = await readTable(file.bytes, file.name);
  const sha256 = createHash('sha256').update(file.bytes).digest('hex');

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const ctx = await resolveContext(client, user, input.campusId, input.termId);
    const previous = await client.query<{ batch_id: number }>(
      `SELECT batch_id FROM import_batch WHERE file_sha256 = $1 AND validation_status = 'accepted' LIMIT 1`,
      [sha256],
    );
    if (previous.rows[0]) throw new ImportError(`This exact file was already imported as batch ${previous.rows[0].batch_id}.`, 409);

    const validation = validateSisTable(table, await loadLookups(client, ctx, table));
    const status = batchStatus(validation);
    const batch = await client.query<{ batch_id: number }>(
      `INSERT INTO import_batch (source_id, campus_id, term_id, uploaded_by, filename, content_type,
                                 file_sha256, original_file, validation_status, total_rows)
       SELECT source_id, $1, $2, $3, $4, $5, $6, $7, $8, $9 FROM import_source WHERE code = 'SIS'
       RETURNING batch_id`,
      [ctx.campusId, ctx.termId, user.id, file.name.slice(0, 255), file.type || 'application/octet-stream',
        sha256, file.bytes, status, validation.totalRows],
    );
    const batchId = batch.rows[0].batch_id;
    await insertIssues(client, batchId, validation);
    await writeAudit({
      userId: user.id, action: 'import_upload', tableName: 'import_batch', recordId: batchId,
      metadata: {
        filename: file.name, status, totalRows: validation.totalRows,
        errors: validation.issues.filter((i) => i.severity === 'error').length,
        warnings: validation.issues.filter((i) => i.severity === 'warning').length,
      },
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

async function insertIssues(client: PoolClient, batchId: number, validation: SisValidation) {
  if (validation.issues.length === 0) return;
  await client.query(
    `INSERT INTO import_row_issue (batch_id, row_number, severity, issue_type, message)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::text[])`,
    [batchId, validation.issues.map((i) => i.rowNumber), validation.issues.map((i) => i.severity),
      validation.issues.map((i) => i.type), validation.issues.map((i) => i.message)],
  );
}

type BatchRow = { batch_id: number; campus_id: number; campus_code: string; term_id: number; validation_status: string; filename: string; original_file: Buffer };

async function lockBatch(client: PoolClient, user: AuthUser, batchId: number): Promise<BatchRow> {
  const result = await client.query<BatchRow>(
    `SELECT b.batch_id, b.campus_id, c.code AS campus_code, b.term_id, b.validation_status, b.filename, b.original_file
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
 * Imports the batch's valid rows (rows with only warnings included). The stored original
 * file is validated again against the current database. Rows with errors are skipped and
 * stay listed in the batch's report.
 */
export async function acceptGradeBatch(user: AuthUser, batchId: number) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const batch = await lockBatch(client, user, batchId);
    const ctx = await resolveContext(client, user, batch.campus_id, batch.term_id);
    const table = await readTable(batch.original_file, batch.filename);
    const validation = validateSisTable(table, await loadLookups(client, ctx, table));
    if (validation.fileRejected) throw new ImportError('This file has file-level issues and cannot be imported.', 409);
    if (validation.rows.length === 0) throw new ImportError('No rows are valid, so there is nothing to import. Reject this batch instead.', 409);

    await client.query('DELETE FROM import_row_issue WHERE batch_id = $1', [batchId]);
    await insertIssues(client, batchId, validation);
    await client.query(`UPDATE import_row_issue SET resolution_status = 'ignored' WHERE batch_id = $1 AND severity = 'error'`, [batchId]);

    const changes = await writeRows(client, ctx, batchId, validation.rows);
    const skipped = validation.totalRows - validation.rows.length;
    await client.query(
      `UPDATE import_batch
          SET validation_status = 'accepted', imported_at = NOW(), accepted_rows = $2, skipped_rows = $3, decided_by = $4
        WHERE batch_id = $1`,
      [batchId, validation.rows.length, skipped, user.id],
    );
    await writeAudit({
      userId: user.id, action: 'import_accept', tableName: 'import_batch', recordId: batchId,
      metadata: { acceptedRows: validation.rows.length, skippedRows: skipped, ...changes },
    }, client);
    await client.query('COMMIT');
    return { accepted: validation.rows.length, skipped, ...changes };
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
    await client.query(`UPDATE import_batch SET validation_status = 'rejected', decided_by = $2 WHERE batch_id = $1`, [batchId, user.id]);
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

/**
 * Set-based upserts: students, their standing this term, subjects, offerings, teachers, then
 * enrollments with period scores. A later file for the same term updates scores (P2 and P3
 * fill in over the term); the trigger on enrollment keeps every replaced version.
 */
async function writeRows(client: PoolClient, ctx: BatchContext, batchId: number, rows: SisRow[]) {
  const students = distinctBy(rows, (r) => r.studentId);
  await client.query(
    `INSERT INTO student (sis_id, full_name, gender, admission_type)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
     ON CONFLICT (sis_id) DO UPDATE
       SET gender = COALESCE(EXCLUDED.gender, student.gender),
           admission_type = COALESCE(EXCLUDED.admission_type, student.admission_type)`,
    [students.map((r) => r.studentId), students.map((r) => r.fullName), students.map((r) => r.gender), students.map((r) => r.admissionType)],
  );
  await client.query(
    `INSERT INTO student_term (student_id, term_id, campus_program_id, year_level_id, ssp_section, ssp_adviser)
     SELECT s.student_id, $6, cp.campus_program_id, u.year_level, u.ssp_section, u.ssp_adviser
       FROM unnest($1::text[], $2::text[], $3::smallint[], $4::text[], $5::text[]) AS u(sis_id, program, year_level, ssp_section, ssp_adviser)
       JOIN student s ON s.sis_id = u.sis_id
       JOIN program p ON p.code = u.program
       JOIN campus_program cp ON cp.program_id = p.program_id AND cp.campus_id = $7
     ON CONFLICT (student_id, term_id) DO UPDATE
       SET year_level_id = EXCLUDED.year_level_id,
           ssp_section = COALESCE(EXCLUDED.ssp_section, student_term.ssp_section),
           ssp_adviser = COALESCE(EXCLUDED.ssp_adviser, student_term.ssp_adviser)`,
    [students.map((r) => r.studentId), students.map((r) => r.program), students.map((r) => r.yearLevel),
      // A student's SSP group appears only on their SSP subject row, so take the first non-empty one.
      students.map((s) => rows.find((r) => r.studentId === s.studentId && r.sspSection)?.sspSection ?? null),
      students.map((s) => rows.find((r) => r.studentId === s.studentId && r.sspAdviser)?.sspAdviser ?? null),
      ctx.termId, ctx.campusId],
  );

  const courses = distinctBy(rows, (r) => r.courseCode);
  await client.query(
    `INSERT INTO course (code, title, subject_type, units)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[])
     ON CONFLICT (code) DO UPDATE
       SET subject_type = COALESCE(EXCLUDED.subject_type, course.subject_type),
           units = COALESCE(EXCLUDED.units, course.units)`,
    [courses.map((r) => r.courseCode), courses.map((r) => r.courseTitle), courses.map((r) => r.subjectType), courses.map((r) => r.units)],
  );
  const programCourses = distinctBy(rows, (r) => `${r.program}|${r.courseCode}`);
  await client.query(
    `INSERT INTO program_course (program_id, course_id, year_level_id)
     SELECT p.program_id, c.course_id, u.year_level
       FROM unnest($1::text[], $2::text[], $3::smallint[]) AS u(program, course, year_level)
       JOIN program p ON p.code = u.program JOIN course c ON c.code = u.course
     ON CONFLICT (program_id, course_id) DO NOTHING`,
    [programCourses.map((r) => r.program), programCourses.map((r) => r.courseCode), programCourses.map((r) => r.yearLevel)],
  );

  const offerings = distinctBy(rows, (r) => `${r.courseCode}|${r.section}`);
  await client.query(
    `INSERT INTO course_offering (course_id, term_id, campus_id, section)
     SELECT c.course_id, $3, $4, u.section FROM unnest($1::text[], $2::text[]) AS u(course, section) JOIN course c ON c.code = u.course
     ON CONFLICT (course_id, term_id, campus_id, section) DO NOTHING`,
    [offerings.map((r) => r.courseCode), offerings.map((r) => r.section), ctx.termId, ctx.campusId],
  );

  const withTeacher = rows.filter((r) => r.teacherKey && r.teacherName);
  const teachers = distinctBy(withTeacher, (r) => r.teacherKey!);
  await client.query(
    `INSERT INTO teacher (campus_id, name_key, name) SELECT $3, * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (campus_id, name_key) DO NOTHING`,
    [teachers.map((r) => r.teacherKey), teachers.map((r) => r.teacherName), ctx.campusId],
  );
  const assignments = distinctBy(withTeacher, (r) => `${r.courseCode}|${r.section}|${r.teacherKey}`);
  await client.query(
    `INSERT INTO teaching_assignment (offering_id, teacher_id)
     SELECT o.offering_id, t.teacher_id
       FROM unnest($1::text[], $2::text[], $3::text[]) AS u(course, section, teacher_key)
       JOIN course c ON c.code = u.course
       JOIN course_offering o ON o.course_id = c.course_id AND o.section = u.section AND o.term_id = $4 AND o.campus_id = $5
       JOIN teacher t ON t.campus_id = $5 AND t.name_key = u.teacher_key
     ON CONFLICT (offering_id, teacher_id) DO NOTHING`,
    [assignments.map((r) => r.courseCode), assignments.map((r) => r.section), assignments.map((r) => r.teacherKey), ctx.termId, ctx.campusId],
  );

  // Only rows whose values changed are updated, so re-importing the same data adds no history.
  const result = await client.query<{ inserted: boolean }>(
    `INSERT INTO enrollment (student_id, offering_id, modality, enlistment_mode, p1_raw, p2_raw, p3_raw, final_grade, remarks, batch_id, updated_at)
     SELECT s.student_id, o.offering_id, u.modality, u.enlistment_mode, u.p1, u.p2, u.p3, u.final_grade, u.remarks, $11, clock_timestamp()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
            AS u(sis_id, course, section, modality, enlistment_mode, p1, p2, p3, final_grade, remarks)
       JOIN student s ON s.sis_id = u.sis_id
       JOIN course c ON c.code = u.course
       JOIN course_offering o ON o.course_id = c.course_id AND o.section = u.section AND o.term_id = $12 AND o.campus_id = $13
     ON CONFLICT (student_id, offering_id) DO UPDATE
       SET modality = EXCLUDED.modality, enlistment_mode = EXCLUDED.enlistment_mode,
           p1_raw = EXCLUDED.p1_raw, p2_raw = EXCLUDED.p2_raw, p3_raw = EXCLUDED.p3_raw,
           final_grade = EXCLUDED.final_grade, remarks = EXCLUDED.remarks,
           batch_id = EXCLUDED.batch_id, updated_at = clock_timestamp()
       WHERE (enrollment.p1_raw, enrollment.p2_raw, enrollment.p3_raw, enrollment.final_grade, enrollment.remarks,
              enrollment.modality, enrollment.enlistment_mode)
             IS DISTINCT FROM
             (EXCLUDED.p1_raw, EXCLUDED.p2_raw, EXCLUDED.p3_raw, EXCLUDED.final_grade, EXCLUDED.remarks,
              EXCLUDED.modality, EXCLUDED.enlistment_mode)
     RETURNING (xmax = 0) AS inserted`,
    [rows.map((r) => r.studentId), rows.map((r) => r.courseCode), rows.map((r) => r.section), rows.map((r) => r.modality),
      rows.map((r) => r.enlistmentMode), rows.map((r) => r.p1), rows.map((r) => r.p2), rows.map((r) => r.p3),
      rows.map((r) => r.finalGrade), rows.map((r) => r.remarks), batchId, ctx.termId, ctx.campusId],
  );

  // Every valid row must now have an enrollment; anything else means a lookup failed.
  const present = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM unnest($1::text[], $2::text[], $3::text[]) AS u(sis_id, course, section)
       JOIN student s ON s.sis_id = u.sis_id
       JOIN course c ON c.code = u.course
       JOIN course_offering o ON o.course_id = c.course_id AND o.section = u.section AND o.term_id = $4 AND o.campus_id = $5
       JOIN enrollment e ON e.student_id = s.student_id AND e.offering_id = o.offering_id`,
    [rows.map((r) => r.studentId), rows.map((r) => r.courseCode), rows.map((r) => r.section), ctx.termId, ctx.campusId],
  );
  if (present.rows[0].count !== rows.length) {
    throw new Error(`Expected ${rows.length} enrollments after import but found ${present.rows[0].count}.`);
  }
  const inserted = result.rows.filter((r) => r.inserted).length;
  return { inserted, updated: result.rows.length - inserted, unchanged: rows.length - result.rows.length };
}

/** The first rows of a stored file for the preview table, with their line numbers in the file. */
export async function previewRows(original: Buffer, filename: string, limit: number) {
  try {
    const table = await readUploadTable(original, filename);
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
  term_code: string;
  uploaded_by_name: string;
  uploaded_at: Date;
  imported_at: Date | null;
  validation_status: 'pending' | 'needs_review' | 'accepted' | 'rejected';
  total_rows: number | null;
  accepted_rows: number | null;
  skipped_rows: number | null;
  issue_count: number;
  warning_count: number;
  /** Rows with at least one error; they are skipped when the batch is accepted. */
  error_row_count: number;
  file_issue_count: number;
  file_sha256: string;
  original_file?: Buffer;
};

const BATCH_SELECT = `
  SELECT b.batch_id, b.filename, s.name AS source, c.code AS campus_code, t.code AS term_code,
         u.name AS uploaded_by_name, b.uploaded_at, b.imported_at,
         b.validation_status, b.total_rows, b.accepted_rows, b.skipped_rows, b.file_sha256,
         (SELECT count(*)::int FROM import_row_issue i WHERE i.batch_id = b.batch_id) AS issue_count,
         (SELECT count(*)::int FROM import_row_issue i WHERE i.batch_id = b.batch_id AND i.severity = 'warning') AS warning_count,
         (SELECT count(DISTINCT i.row_number)::int FROM import_row_issue i
           WHERE i.batch_id = b.batch_id AND i.severity = 'error' AND i.row_number IS NOT NULL) AS error_row_count,
         (SELECT count(*)::int FROM import_row_issue i WHERE i.batch_id = b.batch_id AND i.row_number IS NULL) AS file_issue_count
    FROM import_batch b
    JOIN import_source s ON s.source_id = b.source_id
    JOIN campus c ON c.campus_id = b.campus_id
    JOIN term t ON t.term_id = b.term_id
    JOIN app_users u ON u.id = b.uploaded_by`;

/** Recent batches at campuses the user can see (program-scoped users see none). */
export async function listBatches(user: AuthUser, limit = 50): Promise<BatchSummary[]> {
  const campuses = user.scopes.filter((s) => s.program === null).map((s) => s.campus);
  if (campuses.length === 0) return [];
  const result = await getPool().query<BatchSummary>(
    `${BATCH_SELECT} WHERE ($1 OR c.code = ANY($2::text[])) ORDER BY b.uploaded_at DESC LIMIT $3`,
    [campuses.includes(null), campuses.filter((c): c is string => c !== null), limit],
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
  const result = await getPool().query<{ issue_type: string; severity: string; count: number }>(
    `SELECT issue_type, severity, count(*)::int AS count FROM import_row_issue WHERE batch_id = $1
      GROUP BY issue_type, severity ORDER BY severity, count DESC`,
    [batchId],
  );
  return result.rows;
}

export async function getBatchIssues(batchId: number, limit = 10_000) {
  const result = await getPool().query<{
    row_number: number | null; severity: 'error' | 'warning'; issue_type: string; message: string; resolution_status: string;
  }>(
    `SELECT row_number, severity, issue_type, message, resolution_status
       FROM import_row_issue WHERE batch_id = $1
      ORDER BY severity, row_number NULLS FIRST, issue_id LIMIT $2`,
    [batchId, limit],
  );
  return result.rows;
}

/** Campuses (in scope), terms and periods for the upload and calculation forms. */
export async function getUploadOptions(user: AuthUser) {
  const pool = getPool();
  const [campuses, terms, periods] = await Promise.all([
    pool.query<{ campus_id: number; code: string; name: string }>(`SELECT campus_id, code, name FROM campus WHERE status = 'active' ORDER BY name`),
    pool.query<{ term_id: number; code: string; name: string }>('SELECT term_id, code, name FROM term ORDER BY code DESC'),
    pool.query<{ grading_period_id: number; code: string; name: string }>('SELECT grading_period_id, code, name FROM grading_period ORDER BY grading_period_id'),
  ]);
  return { campuses: campuses.rows.filter((c) => inScope(user, c.code, null)), terms: terms.rows, periods: periods.rows };
}
