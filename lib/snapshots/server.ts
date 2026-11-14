import 'server-only';
import { serial } from '@/lib/serial';
import type { PoolClient } from 'pg';
import { ApiError } from '@/lib/errors';
import { getPool } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import type { AuthUser } from '@/lib/auth';
import { inScope } from '@/lib/access';
import { classify, failureRate, periodOutcome, validateThresholds, type PeriodRules, type Zone, type ZoneThreshold } from '@/lib/zones';
import { InputError, parseCode, parseName, periodRulesFromForm, thresholdsFromForm } from '@/lib/admin/validate';

export class SnapshotError extends ApiError {}

type RuleSet = { rule_set_id: number; code: string; name: string; rules: PeriodRules; thresholds: ZoneThreshold[] };

type RuleSetRow = { rule_set_id: number; code: string; name: string; passing_mark: string; failed_values: string[]; skipped_values: string[]; failing_remarks: string[] };

const RULE_SET_COLUMNS = 'rs.rule_set_id, rs.code, rs.name, rs.passing_mark, rs.failed_values, rs.skipped_values, rs.failing_remarks';

async function loadRuleSet(db: PoolClient, row: RuleSetRow): Promise<RuleSet> {
  return {
    rule_set_id: row.rule_set_id, code: row.code, name: row.name,
    rules: { passingMark: Number(row.passing_mark), failedValues: row.failed_values, skippedValues: row.skipped_values, failingRemarks: row.failing_remarks },
    thresholds: await loadThresholds(db, row.rule_set_id),
  };
}

/** The approved rule set in force for a term: the one with the latest effective term up to it. */
async function ruleSetForTerm(db: PoolClient, termId: number): Promise<RuleSet | null> {
  const result = await db.query<RuleSetRow>(
    `SELECT ${RULE_SET_COLUMNS}
       FROM zone_rule_set rs
       JOIN term eff ON eff.term_id = rs.effective_term_id
       JOIN term target ON target.term_id = $1
      WHERE rs.status = 'approved' AND eff.code <= target.code
      ORDER BY eff.code DESC LIMIT 1`,
    [termId],
  );
  return result.rows[0] ? loadRuleSet(db, result.rows[0]) : null;
}

async function ruleSetById(db: PoolClient, id: number): Promise<RuleSet> {
  const result = await db.query<RuleSetRow>(`SELECT ${RULE_SET_COLUMNS} FROM zone_rule_set rs WHERE rs.rule_set_id = $1`, [id]);
  return loadRuleSet(db, result.rows[0]);
}

async function loadThresholds(db: PoolClient, ruleSetId: number): Promise<ZoneThreshold[]> {
  const result = await db.query<{ level: ZoneThreshold['level']; zone: Zone; min: string; max: string | null }>(
    `SELECT t.level, z.code AS zone, t.min_value AS min, t.max_value AS max
       FROM zone_threshold t JOIN zone z ON z.zone_id = t.zone_id WHERE t.rule_set_id = $1`,
    [ruleSetId],
  );
  return result.rows.map((r) => ({ level: r.level, zone: r.zone, min: Number(r.min), max: r.max === null ? null : Number(r.max) }));
}

type Scope = { termId: number; campusId: number; periodCode: 'P1' | 'P2' | 'P3' };

type Computed = {
  students: { student_id: number; campus_program_id: number; year_level_id: number; counted: number; failed_count: number; zone: Zone }[];
  subjects: { offering_id: number; enrolled_count: number; graded_count: number; failed_count: number; failure_rate: number; zone: Zone }[];
  teachers: { teacher_id: number; graded_count: number; failed_count: number; failure_rate: number; zone: Zone }[];
  skippedStudents: number;
};

/**
 * Results for one period from the scores in force at `asOf`. Whether a subject counts as
 * failed comes from periodOutcome() (passing mark, failed and skipped values, P3 remarks).
 * Students with no counted subject in the period are left out.
 */
async function compute(db: PoolClient, scope: Scope, ruleSet: RuleSet, asOf: Date): Promise<Computed> {
  const column = { P1: 'p1_raw', P2: 'p2_raw', P3: 'p3_raw' }[scope.periodCode];
  const [enrollments, standings, assignments] = await serial([
    () => db.query<{ student_id: number; offering_id: number; raw: string | null; remarks: string | null }>(
      `WITH e AS (
         SELECT student_id, offering_id, ${column} AS raw, remarks FROM enrollment WHERE updated_at <= $3
         UNION ALL
         SELECT student_id, offering_id, ${column} AS raw, remarks FROM enrollment_history WHERE valid_from <= $3 AND valid_to > $3
       )
       SELECT e.student_id, e.offering_id, e.raw, e.remarks
         FROM e JOIN course_offering o ON o.offering_id = e.offering_id
        WHERE o.term_id = $1 AND o.campus_id = $2`,
      [scope.termId, scope.campusId, asOf],
    ),
    () => db.query<{ student_id: number; campus_program_id: number; year_level_id: number }>(
      `SELECT st.student_id, st.campus_program_id, st.year_level_id
         FROM student_term st JOIN campus_program cp ON cp.campus_program_id = st.campus_program_id
        WHERE st.term_id = $1 AND cp.campus_id = $2`,
      [scope.termId, scope.campusId],
    ),
    () => db.query<{ offering_id: number; teacher_id: number }>(
      `SELECT ta.offering_id, ta.teacher_id FROM teaching_assignment ta JOIN course_offering o ON o.offering_id = ta.offering_id
        WHERE o.term_id = $1 AND o.campus_id = $2`,
      [scope.termId, scope.campusId],
    ),
  ] as const);

  const students = new Map<number, { counted: number; failed: number }>();
  const subjects = new Map<number, { enrolled: number; graded: number; failed: number }>();
  const outcomes: { offering_id: number; outcome: ReturnType<typeof periodOutcome> }[] = [];
  for (const e of enrollments.rows) {
    const outcome = periodOutcome(e.raw, ruleSet.rules, { period: scope.periodCode, remarks: e.remarks });
    outcomes.push({ offering_id: e.offering_id, outcome });
    const subject = subjects.get(e.offering_id) ?? { enrolled: 0, graded: 0, failed: 0 };
    subject.enrolled += 1;
    if (outcome !== 'not_counted') {
      subject.graded += 1;
      const student = students.get(e.student_id) ?? { counted: 0, failed: 0 };
      student.counted += 1;
      if (outcome === 'failed') { subject.failed += 1; student.failed += 1; }
      students.set(e.student_id, student);
    }
    subjects.set(e.offering_id, subject);
  }

  const standing = new Map(standings.rows.map((s) => [s.student_id, s]));
  const studentRows: Computed['students'] = [];
  let skippedStudents = 0;
  for (const [studentId, s] of [...students.entries()].sort((a, b) => a[0] - b[0])) {
    const st = standing.get(studentId);
    if (!st) { skippedStudents += 1; continue; }
    studentRows.push({ student_id: studentId, campus_program_id: st.campus_program_id, year_level_id: st.year_level_id,
      counted: s.counted, failed_count: s.failed, zone: classify(ruleSet.thresholds, 'student', s.failed) });
  }

  const subjectRows = [...subjects.entries()]
    .filter(([, s]) => s.graded > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([offeringId, s]) => {
      const rate = failureRate(s.failed, s.graded);
      return { offering_id: offeringId, enrolled_count: s.enrolled, graded_count: s.graded, failed_count: s.failed, failure_rate: rate, zone: classify(ruleSet.thresholds, 'subject', rate) };
    });

  // Teacher zones: failure rate across all counted results in the teacher's classes.
  const teacherTotals = new Map<number, { graded: number; failed: number }>();
  const teachersByOffering = new Map<number, number[]>();
  for (const a of assignments.rows) teachersByOffering.set(a.offering_id, [...(teachersByOffering.get(a.offering_id) ?? []), a.teacher_id]);
  for (const o of outcomes) {
    if (o.outcome === 'not_counted') continue;
    for (const teacherId of teachersByOffering.get(o.offering_id) ?? []) {
      const t = teacherTotals.get(teacherId) ?? { graded: 0, failed: 0 };
      t.graded += 1;
      if (o.outcome === 'failed') t.failed += 1;
      teacherTotals.set(teacherId, t);
    }
  }
  const teacherRows = [...teacherTotals.entries()].sort((a, b) => a[0] - b[0]).map(([teacherId, t]) => {
    const rate = failureRate(t.failed, t.graded);
    return { teacher_id: teacherId, graded_count: t.graded, failed_count: t.failed, failure_rate: rate, zone: classify(ruleSet.thresholds, 'teacher', rate) };
  });

  return { students: studentRows, subjects: subjectRows, teachers: teacherRows, skippedStudents };
}

async function zoneIds(db: PoolClient) {
  const result = await db.query<{ zone_id: number; code: Zone }>('SELECT zone_id, code FROM zone');
  return new Map(result.rows.map((r) => [r.code, r.zone_id]));
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
    if (error instanceof InputError) throw new SnapshotError(error.message, 400);
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new SnapshotError('A rule set with that code already exists.', 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

function countZones(rows: { zone: Zone }[]) {
  const counts: Record<Zone, number> = { green: 0, yellow: 0, red: 0 };
  for (const row of rows) counts[row.zone] += 1;
  return counts;
}

/** Calculates and saves a snapshot run for one campus, term and grading period. */
export async function runSnapshot(user: AuthUser, campusId: number, termId: number, periodId: number) {
  return inTransaction(async (db) => {
    const found = await db.query<{ campus_code: string; term_code: string; period_code: 'P1' | 'P2' | 'P3' }>(
      `SELECT c.code AS campus_code, t.code AS term_code, gp.code AS period_code
         FROM campus c, term t, grading_period gp WHERE c.campus_id = $1 AND t.term_id = $2 AND gp.grading_period_id = $3`,
      [campusId, termId, periodId],
    );
    const ref = found.rows[0];
    if (!ref) throw new SnapshotError('Choose a valid campus, term and period.');
    if (!inScope(user, ref.campus_code, null)) throw new SnapshotError('You cannot calculate zones for this campus.', 403);
    const ruleSet = await ruleSetForTerm(db, termId);
    if (!ruleSet) throw new SnapshotError(`No approved zone rule set applies to term ${ref.term_code}. The Team Learning lead approves rule sets on this page.`, 409);

    // Block score writes while reading, so the snapshot time marks exactly which scores it used.
    await db.query('LOCK TABLE enrollment IN SHARE MODE');
    const asOf = (await db.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now;
    const computed = await compute(db, { termId, campusId, periodCode: ref.period_code }, ruleSet, asOf);
    if (computed.students.length === 0 && computed.subjects.length === 0) {
      throw new SnapshotError(`There are no ${ref.period_code} scores for ${ref.campus_code} ${ref.term_code} yet (all are empty or ${ruleSet.rules.skippedValues.join('/')}).`, 409);
    }

    const run = await db.query<{ run_id: number }>(
      `INSERT INTO snapshot_run (term_id, grading_period_id, campus_id, rule_set_id, calculated_by, calculated_at, student_count, offering_count, teacher_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING run_id`,
      [termId, periodId, campusId, ruleSet.rule_set_id, user.id, asOf, computed.students.length, computed.subjects.length, computed.teachers.length],
    );
    const runId = run.rows[0].run_id;
    const zones = await zoneIds(db);
    const s = computed.students;
    await db.query(
      `INSERT INTO student_zone_snapshot (run_id, student_id, campus_program_id, year_level_id, counted_subjects, failed_count, zone_id)
       SELECT $1, * FROM unnest($2::int[], $3::int[], $4::smallint[], $5::smallint[], $6::smallint[], $7::smallint[])`,
      [runId, s.map((r) => r.student_id), s.map((r) => r.campus_program_id), s.map((r) => r.year_level_id),
        s.map((r) => r.counted), s.map((r) => r.failed_count), s.map((r) => zones.get(r.zone))],
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
      `INSERT INTO teacher_result_snapshot (run_id, teacher_id, graded_count, failed_count, failure_rate, zone_id)
       SELECT $1, * FROM unnest($2::int[], $3::int[], $4::int[], $5::numeric[], $6::smallint[])`,
      [runId, t.map((r) => r.teacher_id), t.map((r) => r.graded_count), t.map((r) => r.failed_count),
        t.map((r) => r.failure_rate), t.map((r) => zones.get(r.zone))],
    );

    const summary = { students: countZones(s), subjects: countZones(o), teachers: countZones(t), skippedStudents: computed.skippedStudents };
    await writeAudit({
      userId: user.id, action: 'zones_calculate', tableName: 'snapshot_run', recordId: runId,
      metadata: { campus: ref.campus_code, term: ref.term_code, period: ref.period_code, ruleSet: ruleSet.code, ...summary },
    }, db);
    return { runId, ruleSet: ruleSet.code, ...summary };
  });
}

/** Recomputes a saved run from the scores in force when it ran and its rule set, row by row (test case 20). */
export async function verifySnapshot(user: AuthUser, runId: number) {
  return inTransaction(async (db) => {
    const run = await db.query<{ campus_id: number; campus_code: string; term_id: number; period_code: 'P1' | 'P2' | 'P3'; rule_set_id: number; calculated_at: Date }>(
      `SELECT r.campus_id, c.code AS campus_code, r.term_id, gp.code AS period_code, r.rule_set_id, r.calculated_at
         FROM snapshot_run r JOIN campus c ON c.campus_id = r.campus_id JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
        WHERE r.run_id = $1`,
      [runId],
    );
    const saved = run.rows[0];
    if (!saved || !inScope(user, saved.campus_code, null)) throw new SnapshotError('Snapshot run not found.', 404);

    const computed = await compute(db, { termId: saved.term_id, campusId: saved.campus_id, periodCode: saved.period_code },
      await ruleSetById(db, saved.rule_set_id), saved.calculated_at);
    const [students, subjects, teachers] = await serial([
      () => db.query<{ id: number; failed: number; counted: number; zone: Zone }>(
        `SELECT s.student_id AS id, s.failed_count AS failed, s.counted_subjects AS counted, z.code AS zone
           FROM student_zone_snapshot s JOIN zone z ON z.zone_id = s.zone_id WHERE s.run_id = $1`, [runId]),
      () => db.query<{ id: number; enrolled: number; graded: number; failed: number; rate: string; zone: Zone }>(
        `SELECT s.offering_id AS id, s.enrolled_count AS enrolled, s.graded_count AS graded, s.failed_count AS failed, s.failure_rate AS rate, z.code AS zone
           FROM subject_result_snapshot s JOIN zone z ON z.zone_id = s.zone_id WHERE s.run_id = $1`, [runId]),
      () => db.query<{ id: number; graded: number; failed: number; zone: Zone }>(
        `SELECT s.teacher_id AS id, s.graded_count AS graded, s.failed_count AS failed, z.code AS zone
           FROM teacher_result_snapshot s JOIN zone z ON z.zone_id = s.zone_id WHERE s.run_id = $1`, [runId]),
    ] as const);

    const differences = [
      ...compareRows('Student', students.rows.map((r) => [r.id, `${r.failed}/${r.counted} failed, ${r.zone}`]),
        computed.students.map((r) => [r.student_id, `${r.failed_count}/${r.counted} failed, ${r.zone}`])),
      ...compareRows('Offering', subjects.rows.map((r) => [r.id, `${r.failed}/${r.graded} of ${r.enrolled}, ${Number(r.rate)}%, ${r.zone}`]),
        computed.subjects.map((r) => [r.offering_id, `${r.failed_count}/${r.graded_count} of ${r.enrolled_count}, ${r.failure_rate}%, ${r.zone}`])),
      ...compareRows('Teacher', teachers.rows.map((r) => [r.id, `${r.failed}/${r.graded}, ${r.zone}`]),
        computed.teachers.map((r) => [r.teacher_id, `${r.failed_count}/${r.graded_count}, ${r.zone}`])),
    ];
    await writeAudit({ userId: user.id, action: 'zones_verify', tableName: 'snapshot_run', recordId: runId,
      metadata: { matches: differences.length === 0, differences: differences.length } }, db);
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
  passing_mark: number; failed_values: string[]; skipped_values: string[]; failing_remarks: string[];
  thresholds: ZoneThreshold[];
};

export async function listRuleSets(): Promise<RuleSetSummary[]> {
  const result = await getPool().query<Omit<RuleSetSummary, 'thresholds' | 'passing_mark'> & { passing_mark: string; thresholds: { level: ZoneThreshold['level']; zone: Zone; min: string; max: string | null }[] }>(
    `SELECT rs.rule_set_id, rs.code, rs.name, rs.status, t.code AS effective_term, u.name AS approved_by_name, rs.approved_at,
            rs.passing_mark, rs.failed_values, rs.skipped_values, rs.failing_remarks,
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
    passing_mark: Number(r.passing_mark),
    thresholds: r.thresholds.map((th) => ({ ...th, min: Number(th.min), max: th.max === null ? null : Number(th.max) })),
  }));
}

/** Approves a draft rule set. Its thresholds and settings are then locked by the database. */
export async function approveRuleSet(user: AuthUser, ruleSetId: number) {
  return inTransaction(async (db) => {
    const result = await db.query<{ status: string; code: string; effective_term_id: number }>(
      'SELECT status, code, effective_term_id FROM zone_rule_set WHERE rule_set_id = $1 FOR UPDATE', [ruleSetId]);
    const ruleSet = result.rows[0];
    if (!ruleSet) throw new SnapshotError('Rule set not found.', 404);
    if (ruleSet.status !== 'draft') throw new SnapshotError(`This rule set is already ${ruleSet.status}.`, 409);
    const errors = validateThresholds(await loadThresholds(db, ruleSetId));
    if (errors.length > 0) throw new SnapshotError(`This rule set cannot be approved: ${errors.join(' ')}`, 409);
    const existing = await db.query<{ code: string }>(
      `SELECT code FROM zone_rule_set WHERE effective_term_id = $1 AND status = 'approved'`, [ruleSet.effective_term_id]);
    if (existing.rows[0]) throw new SnapshotError(`Rule set ${existing.rows[0].code} is already approved for this term. Retire it first.`, 409);
    await db.query(`UPDATE zone_rule_set SET status = 'approved', approved_by = $2, approved_at = NOW() WHERE rule_set_id = $1`, [ruleSetId, user.id]);
    await writeAudit({ userId: user.id, action: 'rules_approve', tableName: 'zone_rule_set', recordId: ruleSetId, metadata: { code: ruleSet.code } }, db);
  });
}

/* ---- Run history ---- */

export type RunSummary = {
  run_id: number; campus_code: string; term_code: string; period_code: string; rule_set_code: string;
  calculated_by_name: string | null; calculated_at: Date; student_count: number | null; offering_count: number | null; teacher_count: number | null;
  student_zones: Record<Zone, number>; subject_zones: Record<Zone, number>; teacher_zones: Record<Zone, number>;
};

const zoneCountsSql = (table: string) => `
  (SELECT json_build_object('green', count(*) FILTER (WHERE z.code = 'green'), 'yellow', count(*) FILTER (WHERE z.code = 'yellow'),
                            'red', count(*) FILTER (WHERE z.code = 'red'))
     FROM ${table} s JOIN zone z ON z.zone_id = s.zone_id WHERE s.run_id = r.run_id)`;

export async function listRuns(user: AuthUser, limit = 30): Promise<RunSummary[]> {
  const campuses = user.scopes.filter((s) => s.program === null).map((s) => s.campus);
  if (campuses.length === 0) return [];
  const result = await getPool().query<RunSummary>(
    `SELECT r.run_id, c.code AS campus_code, t.code AS term_code, gp.code AS period_code, rs.code AS rule_set_code,
            u.name AS calculated_by_name, r.calculated_at, r.student_count, r.offering_count, r.teacher_count,
            ${zoneCountsSql('student_zone_snapshot')} AS student_zones,
            ${zoneCountsSql('subject_result_snapshot')} AS subject_zones,
            ${zoneCountsSql('teacher_result_snapshot')} AS teacher_zones
       FROM snapshot_run r
       JOIN campus c ON c.campus_id = r.campus_id
       JOIN term t ON t.term_id = r.term_id
       JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
       JOIN zone_rule_set rs ON rs.rule_set_id = r.rule_set_id
       LEFT JOIN app_users u ON u.id = r.calculated_by
      WHERE ($1 OR c.code = ANY($2::text[]))
      ORDER BY r.calculated_at DESC LIMIT $3`,
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
       FROM unnest($2::text[], $3::text[], $4::numeric[], $5::numeric[]) AS u(level, zone, min, max) JOIN zone z ON z.code = u.zone`,
    [ruleSetId, thresholds.map((t) => t.level), thresholds.map((t) => t.zone), thresholds.map((t) => t.min), thresholds.map((t) => t.max)],
  );
}

async function termIdFor(db: PoolClient, code: unknown) {
  const term = await db.query<{ term_id: number }>('SELECT term_id FROM term WHERE code = $1', [code]);
  if (!term.rows[0]) throw new SnapshotError('Choose an effective term.');
  return term.rows[0].term_id;
}

export async function createDraftRuleSet(user: AuthUser, input: Record<string, unknown>) {
  return inTransaction(async (db) => {
    const code = parseCode(input.code, 'Rule set code');
    const name = parseName(input.name);
    const thresholds = thresholdsFromForm(input);
    const period = periodRulesFromForm(input);
    const created = await db.query<{ rule_set_id: number }>(
      `INSERT INTO zone_rule_set (code, name, effective_term_id, passing_mark, failed_values, skipped_values, failing_remarks, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING rule_set_id`,
      [code, name, await termIdFor(db, input.effectiveTerm), period.passingMark, period.failedValues, period.skippedValues, period.failingRemarks, user.id],
    );
    const id = created.rows[0].rule_set_id;
    await writeThresholds(db, id, thresholds);
    await writeAudit({ userId: user.id, action: 'rules_create', tableName: 'zone_rule_set', recordId: id,
      metadata: { code, effectiveTerm: input.effectiveTerm, ...period, thresholds } }, db);
    return { id };
  });
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
    const period = periodRulesFromForm(input);
    await db.query(
      `UPDATE zone_rule_set SET name = $2, effective_term_id = $3, passing_mark = $4, failed_values = $5, skipped_values = $6, failing_remarks = $7
        WHERE rule_set_id = $1`,
      [id, name, await termIdFor(db, input.effectiveTerm), period.passingMark, period.failedValues, period.skippedValues, period.failingRemarks],
    );
    await writeThresholds(db, id, thresholds);
    await writeAudit({ userId: user.id, action: 'rules_update', tableName: 'zone_rule_set', recordId: id,
      metadata: { code: rs.code, effectiveTerm: input.effectiveTerm, ...period, thresholds } }, db);
    return { id };
  });
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
