import 'server-only';
import { ApiError } from '@/lib/api';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import type { AuthUser } from '@/lib/auth';
import { inScope } from '@/lib/access';
import { classify, failureRate, validateThresholds, type Zone, type ZoneThreshold } from '@/lib/zones';
import { InputError, parseCode, parseName, thresholdsFromForm } from '@/lib/admin/validate';

export class SnapshotError extends ApiError {}

type RuleSetRow = { rule_set_id: number; code: string; name: string };

/** The approved rule set in force for a term: the one with the latest effective term up to it. */
async function ruleSetForTerm(db: PoolClient, termId: number): Promise<RuleSetRow | null> {
  const result = await db.query<RuleSetRow>(
    `SELECT rs.rule_set_id, rs.code, rs.name
       FROM zone_rule_set rs
       JOIN term eff ON eff.term_id = rs.effective_term_id
       JOIN term target ON target.term_id = $1
      WHERE rs.status = 'approved' AND eff.code <= target.code
      ORDER BY eff.code DESC
      LIMIT 1`,
    [termId],
  );
  return result.rows[0] ?? null;
}

async function loadThresholds(db: PoolClient, ruleSetId: number): Promise<ZoneThreshold[]> {
  const result = await db.query<{ level: 'student' | 'subject'; zone: Zone; min: string; max: string | null }>(
    `SELECT t.level, z.code AS zone, t.min_value AS min, t.max_value AS max
       FROM zone_threshold t JOIN zone z ON z.zone_id = t.zone_id
      WHERE t.rule_set_id = $1`,
    [ruleSetId],
  );
  return result.rows.map((r) => ({ level: r.level, zone: r.zone, min: Number(r.min), max: r.max === null ? null : Number(r.max) }));
}

type Scope = { termId: number; campusId: number; periodId: number; academicYearId: number };

type Computed = {
  students: { student_id: number; campus_program_id: number; year_level_id: number; failed_count: number; zone: Zone }[];
  subjects: { offering_id: number; enrolled_count: number; graded_count: number; failed_count: number; failure_rate: number; zone: Zone }[];
  teachers: { assignment_id: number; student_count: number; failed_count: number }[];
  skippedStudents: number;
};

/**
 * Computes results from the grades in force at `asOf`. Uses the latest attempt per student
 * and offering. A result counts toward a subject's rate only if its status is in the
 * denominator (result_status.counts_in_denominator).
 */
async function compute(db: PoolClient, scope: Scope, thresholds: ZoneThreshold[], asOf: Date): Promise<Computed> {
  await db.query('DROP TABLE IF EXISTS pg_temp.snapshot_latest');
  await db.query(
    `CREATE TEMP TABLE snapshot_latest ON COMMIT DROP AS
     WITH grades AS (
       SELECT student_id, offering_id, grading_period_id, attempt_no, result_status_id
         FROM grade_record WHERE updated_at <= $4
       UNION ALL
       SELECT student_id, offering_id, grading_period_id, attempt_no, result_status_id
         FROM grade_record_history WHERE valid_from <= $4 AND valid_to > $4
     )
     SELECT DISTINCT ON (g.student_id, g.offering_id)
            g.student_id, g.offering_id, rs.counts_as_failed AS failed, rs.counts_in_denominator AS counted
       FROM grades g
       JOIN course_offering o ON o.offering_id = g.offering_id
       JOIN result_status rs ON rs.result_status_id = g.result_status_id
      WHERE o.term_id = $1 AND o.campus_id = $2 AND g.grading_period_id = $3
      ORDER BY g.student_id, g.offering_id, g.attempt_no DESC`,
    [scope.termId, scope.campusId, scope.periodId, asOf],
  );

  const [students, skipped, subjects, teachers] = await Promise.all([
    db.query<{ student_id: number; campus_program_id: number; year_level_id: number; failed_count: number }>(
      `SELECT l.student_id, e.campus_program_id, e.year_level_id,
              count(*) FILTER (WHERE l.failed)::int AS failed_count
         FROM snapshot_latest l
         JOIN enrollment e ON e.student_id = l.student_id AND e.academic_year_id = $1
        GROUP BY l.student_id, e.campus_program_id, e.year_level_id
        ORDER BY l.student_id`,
      [scope.academicYearId],
    ),
    db.query<{ count: number }>(
      `SELECT count(DISTINCT l.student_id)::int AS count FROM snapshot_latest l
        WHERE NOT EXISTS (SELECT 1 FROM enrollment e WHERE e.student_id = l.student_id AND e.academic_year_id = $1)`,
      [scope.academicYearId],
    ),
    db.query<{ offering_id: number; enrolled_count: number; graded_count: number; failed_count: number }>(
      `SELECT offering_id, count(*)::int AS enrolled_count,
              count(*) FILTER (WHERE counted)::int AS graded_count,
              count(*) FILTER (WHERE counted AND failed)::int AS failed_count
         FROM snapshot_latest GROUP BY offering_id ORDER BY offering_id`,
    ),
    db.query<{ assignment_id: number; student_count: number; failed_count: number }>(
      `SELECT ta.assignment_id,
              count(*) FILTER (WHERE l.counted)::int AS student_count,
              count(*) FILTER (WHERE l.counted AND l.failed)::int AS failed_count
         FROM snapshot_latest l JOIN teaching_assignment ta ON ta.offering_id = l.offering_id
        GROUP BY ta.assignment_id ORDER BY ta.assignment_id`,
    ),
  ]);
  await db.query('DROP TABLE pg_temp.snapshot_latest');

  return {
    students: students.rows.map((s) => ({ ...s, zone: classify(thresholds, 'student', s.failed_count) })),
    subjects: subjects.rows.map((s) => {
      const rate = failureRate(s.failed_count, s.graded_count);
      return { ...s, failure_rate: rate, zone: classify(thresholds, 'subject', rate) };
    }),
    teachers: teachers.rows,
    skippedStudents: skipped.rows[0]?.count ?? 0,
  };
}

async function zoneIds(db: PoolClient) {
  const result = await db.query<{ zone_id: number; code: Zone }>('SELECT zone_id, code FROM zone');
  return new Map(result.rows.map((r) => [r.code, r.zone_id]));
}

async function resolveScope(db: PoolClient, user: AuthUser, campusId: number, termId: number, periodId: number) {
  const result = await db.query<{ campus_code: string; term_code: string; academic_year_id: number; period_code: string }>(
    `SELECT c.code AS campus_code, t.code AS term_code, t.academic_year_id, gp.code AS period_code
       FROM campus c, term t, grading_period gp
      WHERE c.campus_id = $1 AND t.term_id = $2 AND gp.grading_period_id = $3`,
    [campusId, termId, periodId],
  );
  const row = result.rows[0];
  if (!row) throw new SnapshotError('Choose a valid campus, term and period.');
  if (!inScope(user, row.campus_code, null)) throw new SnapshotError('You cannot calculate zones for this campus.', 403);
  return { ...row, scope: { campusId, termId, periodId, academicYearId: row.academic_year_id } };
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Calculates and saves a snapshot run for one campus, term and grading period. */
export async function runSnapshot(user: AuthUser, campusId: number, termId: number, periodId: number) {
  return inTransaction(async (db) => {
    const { term_code, period_code, campus_code, scope } = await resolveScope(db, user, campusId, termId, periodId);
    const ruleSet = await ruleSetForTerm(db, termId);
    if (!ruleSet) {
      throw new SnapshotError(`No approved zone rule set applies to term ${term_code}. Approve a rule set first.`, 409);
    }
    const thresholds = await loadThresholds(db, ruleSet.rule_set_id);

    // Block grade writes while reading, so the snapshot time marks exactly which grades it used.
    await db.query('LOCK TABLE grade_record IN SHARE MODE');
    const asOf = (await db.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now;
    const computed = await compute(db, scope, thresholds, asOf);
    if (computed.students.length === 0 && computed.subjects.length === 0) {
      throw new SnapshotError(`There are no imported grades for ${campus_code} ${term_code} ${period_code}.`, 409);
    }

    const run = await db.query<{ run_id: number }>(
      `INSERT INTO snapshot_run (term_id, grading_period_id, campus_id, rule_set_id, calculated_by, calculated_at,
                                 student_count, offering_count, skipped_students)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING run_id`,
      [termId, periodId, campusId, ruleSet.rule_set_id, user.id, asOf,
        computed.students.length, computed.subjects.length, computed.skippedStudents],
    );
    const runId = run.rows[0].run_id;
    const zones = await zoneIds(db);
    const s = computed.students;
    await db.query(
      `INSERT INTO student_zone_snapshot (run_id, student_id, campus_program_id, year_level_id, failed_count, zone_id)
       SELECT $1, * FROM unnest($2::int[], $3::int[], $4::smallint[], $5::smallint[], $6::smallint[])`,
      [runId, s.map((r) => r.student_id), s.map((r) => r.campus_program_id), s.map((r) => r.year_level_id),
        s.map((r) => r.failed_count), s.map((r) => zones.get(r.zone))],
    );
    const o = computed.subjects;
    await db.query(
      `INSERT INTO subject_result_snapshot (run_id, offering_id, enrolled_count, graded_count, failed_count, failure_rate, zone_id)
       SELECT $1, * FROM unnest($2::int[], $3::int[], $4::int[], $5::int[], $6::numeric[], $7::smallint[])`,
      [runId, o.map((r) => r.offering_id), o.map((r) => r.enrolled_count), o.map((r) => r.graded_count),
        o.map((r) => r.failed_count), o.map((r) => r.failure_rate), o.map((r) => zones.get(r.zone))],
    );
    const t = computed.teachers;
    await db.query(
      `INSERT INTO teacher_result_snapshot (run_id, assignment_id, student_count, failed_count)
       SELECT $1, * FROM unnest($2::int[], $3::int[], $4::int[])`,
      [runId, t.map((r) => r.assignment_id), t.map((r) => r.student_count), t.map((r) => r.failed_count)],
    );

    const summary = {
      students: countZones(s), subjects: countZones(o),
      teacherAssignments: t.length, skippedStudents: computed.skippedStudents,
    };
    await writeAudit({
      userId: user.id, action: 'zones_calculate', tableName: 'snapshot_run', recordId: runId,
      metadata: { campus: campus_code, term: term_code, period: period_code, ruleSet: ruleSet.code, ...summary },
    }, db);
    return { runId, ruleSet: ruleSet.code, ...summary };
  });
}

function countZones(rows: { zone: Zone }[]) {
  const counts: Record<Zone, number> = { green: 0, yellow: 0, red: 0 };
  for (const row of rows) counts[row.zone] += 1;
  return counts;
}

/**
 * Recomputes a saved run from the grades in force when it was calculated and the rule set
 * it used, then compares the results row by row (functional test case 20).
 */
export async function verifySnapshot(user: AuthUser, runId: number) {
  return inTransaction(async (db) => {
    const run = await db.query<{
      run_id: number; campus_id: number; campus_code: string; term_id: number; grading_period_id: number;
      academic_year_id: number; rule_set_id: number; calculated_at: Date;
    }>(
      `SELECT r.run_id, r.campus_id, c.code AS campus_code, r.term_id, r.grading_period_id, t.academic_year_id,
              r.rule_set_id, r.calculated_at
         FROM snapshot_run r JOIN campus c ON c.campus_id = r.campus_id JOIN term t ON t.term_id = r.term_id
        WHERE r.run_id = $1`,
      [runId],
    );
    const saved = run.rows[0];
    if (!saved || !inScope(user, saved.campus_code, null)) throw new SnapshotError('Snapshot run not found.', 404);

    const thresholds = await loadThresholds(db, saved.rule_set_id);
    const computed = await compute(db, {
      termId: saved.term_id, campusId: saved.campus_id, periodId: saved.grading_period_id, academicYearId: saved.academic_year_id,
    }, thresholds, saved.calculated_at);

    const [students, subjects, teachers] = await Promise.all([
      db.query<{ student_id: number; failed_count: number; zone: Zone }>(
        `SELECT s.student_id, s.failed_count, z.code AS zone FROM student_zone_snapshot s JOIN zone z ON z.zone_id = s.zone_id WHERE s.run_id = $1`,
        [runId],
      ),
      db.query<{ offering_id: number; enrolled_count: number; graded_count: number; failed_count: number; failure_rate: string; zone: Zone }>(
        `SELECT s.offering_id, s.enrolled_count, s.graded_count, s.failed_count, s.failure_rate, z.code AS zone
           FROM subject_result_snapshot s JOIN zone z ON z.zone_id = s.zone_id WHERE s.run_id = $1`,
        [runId],
      ),
      db.query<{ assignment_id: number; student_count: number; failed_count: number }>(
        'SELECT assignment_id, student_count, failed_count FROM teacher_result_snapshot WHERE run_id = $1',
        [runId],
      ),
    ]);

    const differences = [
      ...compareRows('Student', students.rows.map((r) => [r.student_id, `${r.failed_count} failed, ${r.zone}`]),
        computed.students.map((r) => [r.student_id, `${r.failed_count} failed, ${r.zone}`])),
      ...compareRows('Offering', subjects.rows.map((r) => [r.offering_id, `${r.failed_count}/${r.graded_count} of ${r.enrolled_count}, ${Number(r.failure_rate)}%, ${r.zone}`]),
        computed.subjects.map((r) => [r.offering_id, `${r.failed_count}/${r.graded_count} of ${r.enrolled_count}, ${r.failure_rate}%, ${r.zone}`])),
      ...compareRows('Assignment', teachers.rows.map((r) => [r.assignment_id, `${r.failed_count}/${r.student_count}`]),
        computed.teachers.map((r) => [r.assignment_id, `${r.failed_count}/${r.student_count}`])),
    ];

    await writeAudit({
      userId: user.id, action: 'zones_verify', tableName: 'snapshot_run', recordId: runId,
      metadata: { matches: differences.length === 0, differences: differences.length },
    }, db);
    return {
      matches: differences.length === 0,
      compared: students.rows.length + subjects.rows.length + teachers.rows.length,
      differences: differences.slice(0, 20),
      differenceCount: differences.length,
    };
  });
}

function compareRows(label: string, saved: [number, string][], recomputed: [number, string][]) {
  const before = new Map(saved);
  const after = new Map(recomputed);
  const out: string[] = [];
  for (const [id, value] of before) {
    const now = after.get(id);
    if (now === undefined) out.push(`${label} ${id}: saved "${value}", missing on recomputation`);
    else if (now !== value) out.push(`${label} ${id}: saved "${value}", recomputed "${now}"`);
  }
  for (const [id, value] of after) if (!before.has(id)) out.push(`${label} ${id}: not saved, recomputed "${value}"`);
  return out;
}

/* ---- Rule sets ---- */

export type RuleSetSummary = {
  rule_set_id: number; code: string; name: string; status: 'draft' | 'approved' | 'retired';
  effective_term: string; approved_by_name: string | null; approved_at: Date | null;
  thresholds: ZoneThreshold[];
};

export async function listRuleSets(): Promise<RuleSetSummary[]> {
  const result = await getPool().query<Omit<RuleSetSummary, 'thresholds'> & { thresholds: { level: 'student' | 'subject'; zone: Zone; min: string; max: string | null }[] }>(
    `SELECT rs.rule_set_id, rs.code, rs.name, rs.status, t.code AS effective_term, u.name AS approved_by_name, rs.approved_at,
            COALESCE(json_agg(json_build_object('level', th.level, 'zone', z.code, 'min', th.min_value, 'max', th.max_value)
                     ORDER BY th.level, z.sort_order) FILTER (WHERE th.threshold_id IS NOT NULL), '[]') AS thresholds
       FROM zone_rule_set rs
       JOIN term t ON t.term_id = rs.effective_term_id
       LEFT JOIN app_users u ON u.id = rs.approved_by
       LEFT JOIN zone_threshold th ON th.rule_set_id = rs.rule_set_id
       LEFT JOIN zone z ON z.zone_id = th.zone_id
      GROUP BY rs.rule_set_id, t.code, u.name
      ORDER BY t.code DESC, rs.created_at DESC`,
  );
  return result.rows.map((r) => ({
    ...r,
    thresholds: r.thresholds.map((th) => ({ ...th, min: Number(th.min), max: th.max === null ? null : Number(th.max) })),
  }));
}

/** Approves a draft rule set. Its thresholds are then locked by the database. */
export async function approveRuleSet(user: AuthUser, ruleSetId: number) {
  return inTransaction(async (db) => {
    const result = await db.query<{ status: string; code: string; effective_term_id: number }>(
      'SELECT status, code, effective_term_id FROM zone_rule_set WHERE rule_set_id = $1 FOR UPDATE',
      [ruleSetId],
    );
    const ruleSet = result.rows[0];
    if (!ruleSet) throw new SnapshotError('Rule set not found.', 404);
    if (ruleSet.status !== 'draft') throw new SnapshotError(`This rule set is already ${ruleSet.status}.`, 409);

    const errors = validateThresholds(await loadThresholds(db, ruleSetId));
    if (errors.length > 0) throw new SnapshotError(`This rule set cannot be approved: ${errors.join(' ')}`, 409);

    const existing = await db.query<{ code: string }>(
      `SELECT code FROM zone_rule_set WHERE effective_term_id = $1 AND status = 'approved'`,
      [ruleSet.effective_term_id],
    );
    if (existing.rows[0]) {
      throw new SnapshotError(`Rule set ${existing.rows[0].code} is already approved for this term. Retire it first.`, 409);
    }

    await db.query(
      `UPDATE zone_rule_set SET status = 'approved', approved_by = $2, approved_at = NOW() WHERE rule_set_id = $1`,
      [ruleSetId, user.id],
    );
    await writeAudit({ userId: user.id, action: 'rules_approve', tableName: 'zone_rule_set', recordId: ruleSetId, metadata: { code: ruleSet.code } }, db);
  });
}

/* ---- Run history ---- */

export type RunSummary = {
  run_id: number; campus_code: string; term_code: string; period_code: string; rule_set_code: string;
  calculated_by_name: string | null; calculated_at: Date; student_count: number | null; offering_count: number | null;
  skipped_students: number;
  student_zones: Record<Zone, number>; subject_zones: Record<Zone, number>;
};

export async function listRuns(user: AuthUser, limit = 30): Promise<RunSummary[]> {
  const campuses = user.scopes.filter((s) => s.program === null).map((s) => s.campus);
  if (campuses.length === 0) return [];
  const result = await getPool().query<RunSummary>(
    `SELECT r.run_id, c.code AS campus_code, t.code AS term_code, gp.code AS period_code, rs.code AS rule_set_code,
            u.name AS calculated_by_name, r.calculated_at, r.student_count, r.offering_count, r.skipped_students,
            (SELECT json_build_object(
                      'green', count(*) FILTER (WHERE z.code = 'green'),
                      'yellow', count(*) FILTER (WHERE z.code = 'yellow'),
                      'red', count(*) FILTER (WHERE z.code = 'red'))
               FROM student_zone_snapshot s JOIN zone z ON z.zone_id = s.zone_id WHERE s.run_id = r.run_id) AS student_zones,
            (SELECT json_build_object(
                      'green', count(*) FILTER (WHERE z.code = 'green'),
                      'yellow', count(*) FILTER (WHERE z.code = 'yellow'),
                      'red', count(*) FILTER (WHERE z.code = 'red'))
               FROM subject_result_snapshot s JOIN zone z ON z.zone_id = s.zone_id WHERE s.run_id = r.run_id) AS subject_zones
       FROM snapshot_run r
       JOIN campus c ON c.campus_id = r.campus_id
       JOIN term t ON t.term_id = r.term_id
       JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
       JOIN zone_rule_set rs ON rs.rule_set_id = r.rule_set_id
       LEFT JOIN app_users u ON u.id = r.calculated_by
      WHERE ($1 OR c.code = ANY($2::text[]))
      ORDER BY r.calculated_at DESC
      LIMIT $3`,
    [campuses.includes(null), campuses.filter((c): c is string => c !== null), limit],
  );
  return result.rows;
}

/* ---- Draft rule sets (rules.configure) and retirement (rules.approve) ---- */

async function writeThresholds(db: PoolClient, ruleSetId: number, thresholds: ZoneThreshold[]) {
  await db.query('DELETE FROM zone_threshold WHERE rule_set_id = $1', [ruleSetId]);
  await db.query(
    `INSERT INTO zone_threshold (rule_set_id, level, zone_id, min_value, max_value)
     SELECT $1, u.level, z.zone_id, u.min, u.max
       FROM unnest($2::text[], $3::text[], $4::numeric[], $5::numeric[]) AS u(level, zone, min, max)
       JOIN zone z ON z.code = u.zone`,
    [ruleSetId, thresholds.map((t) => t.level), thresholds.map((t) => t.zone), thresholds.map((t) => t.min), thresholds.map((t) => t.max)],
  );
}

function asApiError(error: unknown): never {
  if (error instanceof InputError) throw new SnapshotError(error.message, 400);
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
    throw new SnapshotError('A rule set with that code already exists.', 409);
  }
  throw error;
}

export async function createDraftRuleSet(user: AuthUser, input: Record<string, unknown>) {
  return inTransaction(async (db) => {
    const code = parseCode(input.code, 'Rule set code');
    const name = parseName(input.name);
    const thresholds = thresholdsFromForm(input);
    const term = await db.query<{ term_id: number }>('SELECT term_id FROM term WHERE code = $1', [input.effectiveTerm]);
    if (!term.rows[0]) throw new SnapshotError('Choose an effective term.');
    const created = await db.query<{ rule_set_id: number }>(
      'INSERT INTO zone_rule_set (code, name, effective_term_id) VALUES ($1, $2, $3) RETURNING rule_set_id',
      [code, name, term.rows[0].term_id],
    );
    const id = created.rows[0].rule_set_id;
    await writeThresholds(db, id, thresholds);
    await writeAudit({ userId: user.id, action: 'rules_create', tableName: 'zone_rule_set', recordId: id, metadata: { code, effectiveTerm: input.effectiveTerm, thresholds } }, db);
    return { id };
  }).catch(asApiError);
}

async function lockRuleSet(db: PoolClient, id: number) {
  const r = await db.query<{ code: string; status: string }>('SELECT code, status FROM zone_rule_set WHERE rule_set_id = $1 FOR UPDATE', [id]);
  if (!r.rows[0]) throw new SnapshotError('Rule set not found.', 404);
  return r.rows[0];
}

export async function updateDraftRuleSet(user: AuthUser, id: number, input: Record<string, unknown>) {
  return inTransaction(async (db) => {
    const rs = await lockRuleSet(db, id);
    if (rs.status !== 'draft') throw new SnapshotError('Only draft rule sets can be edited. Create a new draft instead.', 409);
    const name = parseName(input.name);
    const thresholds = thresholdsFromForm(input);
    const term = await db.query<{ term_id: number }>('SELECT term_id FROM term WHERE code = $1', [input.effectiveTerm]);
    if (!term.rows[0]) throw new SnapshotError('Choose an effective term.');
    await db.query('UPDATE zone_rule_set SET name = $2, effective_term_id = $3 WHERE rule_set_id = $1', [id, name, term.rows[0].term_id]);
    await writeThresholds(db, id, thresholds);
    await writeAudit({ userId: user.id, action: 'rules_update', tableName: 'zone_rule_set', recordId: id, metadata: { code: rs.code, effectiveTerm: input.effectiveTerm, thresholds } }, db);
    return { id };
  }).catch(asApiError);
}

export async function deleteDraftRuleSet(user: AuthUser, id: number) {
  return inTransaction(async (db) => {
    const rs = await lockRuleSet(db, id);
    if (rs.status !== 'draft') throw new SnapshotError('Only draft rule sets can be deleted.', 409);
    // Thresholds first: the lock trigger checks the parent rule set's status.
    await db.query('DELETE FROM zone_threshold WHERE rule_set_id = $1', [id]);
    await db.query('DELETE FROM zone_rule_set WHERE rule_set_id = $1', [id]);
    await writeAudit({ userId: user.id, action: 'rules_delete', tableName: 'zone_rule_set', recordId: id, metadata: { code: rs.code } }, db);
    return { id };
  });
}

/** Retires an approved rule set; earlier snapshot runs keep it, new calculations stop using it. */
export async function retireRuleSet(user: AuthUser, id: number) {
  return inTransaction(async (db) => {
    const rs = await lockRuleSet(db, id);
    if (rs.status !== 'approved') throw new SnapshotError('Only approved rule sets can be retired.', 409);
    await db.query(`UPDATE zone_rule_set SET status = 'retired' WHERE rule_set_id = $1`, [id]);
    await writeAudit({ userId: user.id, action: 'rules_retire', tableName: 'zone_rule_set', recordId: id, metadata: { code: rs.code } }, db);
    return { id };
  });
}
