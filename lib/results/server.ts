import 'server-only';
import { getPool } from '@/lib/db';
import { hasPermission, programsAtCampus } from '@/lib/access';
import type { AuthUser } from '@/lib/auth';
import type { Zone, ZoneThreshold } from '@/lib/zones';
import { failureRate } from '@/lib/zones';
import type { ResultSelection, RunInfo, ZoneCounts, ZoneOverview } from './types';

type Params = { campus?: string; term?: string; period?: string };

const emptyCounts = (): ZoneCounts => ({ green: 0, yellow: 0, red: 0 });

/** Program filter as SQL parameters: [all programs?, program codes]. */
function programParams(programs: 'all' | string[]): [boolean, string[]] {
  return programs === 'all' ? [true, []] : [false, programs];
}

/** Resolves campus, term and period from the URL, defaulting to the latest calculated run. */
export async function resolveSelection(user: AuthUser, params: Params): Promise<ResultSelection & { programs: 'all' | string[] }> {
  const pool = getPool();
  const [campusRows, termRows, periodRows] = await Promise.all([
    pool.query<{ code: string; name: string }>(`SELECT code, name FROM campus WHERE status = 'active' ORDER BY name`),
    pool.query<{ code: string; name: string }>('SELECT code, name FROM term ORDER BY code DESC'),
    pool.query<{ code: string; name: string }>('SELECT code, name FROM grading_period ORDER BY grading_period_id'),
  ]);
  const campuses = campusRows.rows.filter((c) => {
    const programs = programsAtCampus(user, c.code);
    return programs === 'all' || programs.length > 0;
  });
  const campus = campuses.find((c) => c.code === params.campus)?.code ?? campuses[0]?.code ?? null;

  let term = termRows.rows.find((t) => t.code === params.term)?.code ?? null;
  let period = periodRows.rows.find((p) => p.code === params.period)?.code ?? null;
  if (campus && (!term || !period)) {
    const latest = await pool.query<{ term: string; period: string }>(
      `SELECT t.code AS term, gp.code AS period
         FROM snapshot_run r
         JOIN campus c ON c.campus_id = r.campus_id
         JOIN term t ON t.term_id = r.term_id
         JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
        WHERE c.code = $1 AND ($2::text IS NULL OR t.code = $2)
        ORDER BY r.calculated_at DESC LIMIT 1`,
      [campus, term],
    );
    term ??= latest.rows[0]?.term ?? termRows.rows[0]?.code ?? null;
    period ??= latest.rows[0]?.period ?? periodRows.rows[0]?.code ?? 'P1';
  }

  return {
    campus,
    term,
    period: period ?? 'P1',
    programs: campus ? programsAtCampus(user, campus) : [],
    campuses: campuses.map((c) => ({ value: c.code, label: c.name })),
    terms: termRows.rows.map((t) => ({ value: t.code, label: t.code })),
    periods: periodRows.rows.map((p) => ({ value: p.code, label: p.code })),
  };
}

type RunRow = { run_id: number; campus: string; campus_name: string; term: string; period: string; rule_set_id: number; rule_set: string; calculated_at: Date; grading_period_id: number; term_id: number; campus_id: number };

const RUN_SELECT = `
  SELECT r.run_id, c.code AS campus, c.name AS campus_name, t.code AS term, gp.code AS period,
         r.rule_set_id, rs.code AS rule_set, r.calculated_at, r.grading_period_id, r.term_id, r.campus_id
    FROM snapshot_run r
    JOIN campus c ON c.campus_id = r.campus_id
    JOIN term t ON t.term_id = r.term_id
    JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
    JOIN zone_rule_set rs ON rs.rule_set_id = r.rule_set_id`;

/** The most recent run for a campus, term and period; for a semester, the latest period with a run. */
export async function findRun(campus: string, term: string, period: string | 'semester'): Promise<RunRow | null> {
  const result = await getPool().query<RunRow>(
    `${RUN_SELECT}
      WHERE c.code = $1 AND t.code = $2 AND ($3 = 'semester' OR gp.code = $3)
      ORDER BY r.grading_period_id DESC, r.calculated_at DESC LIMIT 1`,
    [campus, term, period],
  );
  return result.rows[0] ?? null;
}

function runInfo(run: RunRow): RunInfo {
  return {
    runId: run.run_id, campus: run.campus, campusName: run.campus_name, term: run.term, period: run.period,
    ruleSet: run.rule_set, calculatedAt: run.calculated_at.toISOString(),
  };
}

async function thresholdsFor(ruleSetId: number): Promise<ZoneThreshold[]> {
  const result = await getPool().query<{ level: 'student' | 'subject'; zone: Zone; min: string; max: string | null }>(
    `SELECT t.level, z.code AS zone, t.min_value AS min, t.max_value AS max
       FROM zone_threshold t JOIN zone z ON z.zone_id = t.zone_id WHERE t.rule_set_id = $1`,
    [ruleSetId],
  );
  return result.rows.map((r) => ({ level: r.level, zone: r.zone, min: Number(r.min), max: r.max === null ? null : Number(r.max) }));
}

/** Students in a run, limited to programs. Joins: s = student_zone_snapshot, p = program, z = zone. */
const STUDENTS_IN_SCOPE = `
  FROM student_zone_snapshot s
  JOIN zone z ON z.zone_id = s.zone_id
  JOIN campus_program cp ON cp.campus_program_id = s.campus_program_id
  JOIN program p ON p.program_id = cp.program_id
 WHERE s.run_id = $1 AND ($2 OR p.code = ANY($3::text[]))`;

/** Subject offerings in a run whose course belongs to one of the programs. Joins: r, o, c, z. */
const SUBJECTS_IN_SCOPE = `
  FROM subject_result_snapshot r
  JOIN zone z ON z.zone_id = r.zone_id
  JOIN course_offering o ON o.offering_id = r.offering_id
  JOIN course c ON c.course_id = o.course_id
 WHERE r.run_id = $1
   AND ($2 OR EXISTS (SELECT 1 FROM program_course pc JOIN program p ON p.program_id = pc.program_id
                       WHERE pc.course_id = o.course_id AND p.code = ANY($3::text[])))`;

async function zoneCounts(sqlFrom: string, params: unknown[]) {
  const result = await getPool().query<{ zone: Zone; count: number }>(
    `SELECT z.code AS zone, count(*)::int AS count ${sqlFrom} GROUP BY z.code`,
    params,
  );
  const counts = emptyCounts();
  for (const row of result.rows) counts[row.zone] = row.count;
  return { counts, total: counts.green + counts.yellow + counts.red };
}

/** Zone overview for the dashboard, limited to the user's scope and permissions. */
export async function loadOverview(user: AuthUser, selection: { campus: string | null; term: string | null; period: string; programs: 'all' | string[] }): Promise<ZoneOverview> {
  const empty: ZoneOverview = { source: 'live', run: null, programs: selection.programs, thresholds: [] };
  if (!selection.campus || !selection.term) return empty;
  const run = await findRun(selection.campus, selection.term, selection.period);
  if (!run) return empty;

  const params = [run.run_id, ...programParams(selection.programs)];
  const overview: ZoneOverview = { ...empty, run: runInfo(run), thresholds: await thresholdsFor(run.rule_set_id) };
  const pool = getPool();

  if (hasPermission(user, 'results.student')) {
    const [summary, atRisk] = await Promise.all([
      zoneCounts(STUDENTS_IN_SCOPE, params),
      pool.query<{ id: string; name: string; program: string; year_level: number; failed: number; zone: Zone }>(
        `SELECT st.sis_id AS id, st.last_name || ', ' || st.first_name AS name, p.code AS program,
                s.year_level_id AS year_level, s.failed_count AS failed, z.code AS zone
           FROM student_zone_snapshot s
           JOIN student st ON st.student_id = s.student_id
           JOIN zone z ON z.zone_id = s.zone_id
           JOIN campus_program cp ON cp.campus_program_id = s.campus_program_id
           JOIN program p ON p.program_id = cp.program_id
          WHERE s.run_id = $1 AND ($2 OR p.code = ANY($3::text[])) AND z.code <> 'green'
          ORDER BY s.failed_count DESC, z.sort_order DESC, st.last_name, st.first_name
          LIMIT 10`,
        params,
      ),
    ]);
    overview.students = {
      ...summary,
      atRisk: atRisk.rows.map((r) => ({ ...r, yearLevel: r.year_level })),
      atRiskTotal: summary.counts.yellow + summary.counts.red,
    };
  }

  const seeSubjects = hasPermission(user, 'results.subject');
  const seeTeachers = hasPermission(user, 'results.teacher');
  if (seeSubjects) {
    const [summary, rows] = await Promise.all([
      zoneCounts(SUBJECTS_IN_SCOPE, params),
      pool.query<{ offering_id: number; code: string; section: string; title: string; failed: number; graded: number; rate: string; zone: Zone }>(
        `SELECT r.offering_id, c.code, o.section, c.title, r.failed_count AS failed, r.graded_count AS graded,
                r.failure_rate AS rate, z.code AS zone
         ${SUBJECTS_IN_SCOPE}
         ORDER BY r.failure_rate DESC, r.failed_count DESC, c.code, o.section
         LIMIT 10`,
        params,
      ),
    ]);
    overview.subjects = {
      ...summary,
      rows: rows.rows.map((r) => ({
        key: String(r.offering_id), code: r.code, section: r.section, title: r.title,
        failed: r.failed, graded: r.graded, rate: Number(r.rate), zone: r.zone,
      })),
    };
  }

  if (seeTeachers) {
    // Each teacher's indicator covers only their classes within the user's scope.
    const teachers = await pool.query<{ teacher_id: number; name: string; students: number; failed: number; offerings: number[] }>(
      `SELECT t.teacher_id, t.name, sum(trs.student_count)::int AS students, sum(trs.failed_count)::int AS failed,
              array_agg(DISTINCT ta.offering_id) AS offerings
         FROM teacher_result_snapshot trs
         JOIN teaching_assignment ta ON ta.assignment_id = trs.assignment_id
         JOIN teacher t ON t.teacher_id = ta.teacher_id
         JOIN course_offering o ON o.offering_id = ta.offering_id
        WHERE trs.run_id = $1
          AND ($2 OR EXISTS (SELECT 1 FROM program_course pc JOIN program p ON p.program_id = pc.program_id
                              WHERE pc.course_id = o.course_id AND p.code = ANY($3::text[])))
        GROUP BY t.teacher_id, t.name`,
      params,
    );
    overview.teachers = { total: teachers.rows.length };
    if (overview.subjects) {
      for (const row of overview.subjects.rows) {
        row.teachers = teachers.rows
          .filter((t) => t.offerings.includes(Number(row.key)))
          .map((t) => ({ name: t.name, failed: t.failed, students: t.students, rate: failureRate(t.failed, t.students) }));
      }
    }
  }
  return overview;
}

/* ---- Reports ---- */

export type ProgramReport = {
  run: RunInfo | null;
  type: 'periodic' | 'semester';
  programFilter: string;
  programs: { program: string; total: number; counts: ZoneCounts }[];
  subjects: { total: number; counts: ZoneCounts };
  outcome: null | {
    previousPeriod: string;
    flaggedBefore: number;
    nowGreen: number;
    improved: number;
    unchanged: number;
    worse: number;
    noCurrentResult: number;
  };
  campuses?: { campus: string; name: string; period: string | null; total: number; counts: ZoneCounts }[];
};

export async function loadProgramReport(
  user: AuthUser,
  selection: { campus: string | null; term: string | null; period: string; programs: 'all' | string[] },
  options: { type: 'periodic' | 'semester'; program: string },
): Promise<ProgramReport> {
  // A program filter can only narrow the user's scope.
  const allowed = selection.programs;
  const programs: 'all' | string[] = options.program === 'all'
    ? allowed
    : allowed === 'all' || allowed.includes(options.program) ? [options.program] : [];
  const report: ProgramReport = {
    run: null, type: options.type, programFilter: options.program,
    programs: [], subjects: { total: 0, counts: emptyCounts() }, outcome: null,
  };
  if (!selection.campus || !selection.term) return report;

  const pool = getPool();
  if (hasPermission(user, 'results.compare_campus')) {
    report.campuses = await campusComparison(user, selection.term, options.type === 'semester' ? 'semester' : selection.period);
  }

  const run = await findRun(selection.campus, selection.term, options.type === 'semester' ? 'semester' : selection.period);
  if (!run) return report;
  report.run = runInfo(run);
  const params = [run.run_id, ...programParams(programs)];

  const byProgram = await pool.query<{ program: string; zone: Zone; count: number }>(
    `SELECT p.code AS program, z.code AS zone, count(*)::int AS count ${STUDENTS_IN_SCOPE} GROUP BY p.code, z.code ORDER BY p.code`,
    params,
  );
  const rows = new Map<string, { program: string; total: number; counts: ZoneCounts }>();
  for (const r of byProgram.rows) {
    const row = rows.get(r.program) ?? { program: r.program, total: 0, counts: emptyCounts() };
    row.counts[r.zone] += r.count;
    row.total += r.count;
    rows.set(r.program, row);
  }
  report.programs = [...rows.values()];
  report.subjects = await zoneCounts(SUBJECTS_IN_SCOPE, params);

  // Outcome review: students flagged in the latest earlier period of the same term.
  const previous = await pool.query<{ run_id: number; period: string }>(
    `SELECT r.run_id, gp.code AS period FROM snapshot_run r JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
      WHERE r.campus_id = $1 AND r.term_id = $2 AND r.grading_period_id < $3
      ORDER BY r.grading_period_id DESC, r.calculated_at DESC LIMIT 1`,
    [run.campus_id, run.term_id, run.grading_period_id],
  );
  if (previous.rows[0]) {
    const movement = await pool.query<{ before: number; after: number | null; count: number }>(
      `SELECT zb.sort_order AS before, za.sort_order AS after, count(*)::int AS count
         FROM student_zone_snapshot b
         JOIN zone zb ON zb.zone_id = b.zone_id
         JOIN campus_program cp ON cp.campus_program_id = b.campus_program_id
         JOIN program p ON p.program_id = cp.program_id
         LEFT JOIN student_zone_snapshot a ON a.run_id = $4 AND a.student_id = b.student_id
         LEFT JOIN zone za ON za.zone_id = a.zone_id
        WHERE b.run_id = $1 AND ($2 OR p.code = ANY($3::text[])) AND zb.code <> 'green'
        GROUP BY zb.sort_order, za.sort_order`,
      [previous.rows[0].run_id, ...programParams(programs), run.run_id],
    );
    const outcome = { previousPeriod: previous.rows[0].period, flaggedBefore: 0, nowGreen: 0, improved: 0, unchanged: 0, worse: 0, noCurrentResult: 0 };
    for (const m of movement.rows) {
      outcome.flaggedBefore += m.count;
      if (m.after === null) outcome.noCurrentResult += m.count;
      else if (m.after === 1) outcome.nowGreen += m.count;
      else if (m.after < m.before) outcome.improved += m.count;
      else if (m.after === m.before) outcome.unchanged += m.count;
      else outcome.worse += m.count;
    }
    report.outcome = outcome;
  }
  return report;
}

/** Latest run per campus for the term (and period), using the same zone definitions. */
async function campusComparison(user: AuthUser, term: string, period: string | 'semester') {
  const result = await getPool().query<{ campus: string; name: string; period: string | null; run_id: number | null }>(
    `SELECT c.code AS campus, c.name, latest.period, latest.run_id
       FROM campus c
       LEFT JOIN LATERAL (
         SELECT r.run_id, gp.code AS period FROM snapshot_run r
           JOIN term t ON t.term_id = r.term_id
           JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
          WHERE r.campus_id = c.campus_id AND t.code = $1 AND ($2 = 'semester' OR gp.code = $2)
          ORDER BY r.grading_period_id DESC, r.calculated_at DESC LIMIT 1
       ) latest ON TRUE
      WHERE c.status = 'active'
      ORDER BY c.name`,
    [term, period],
  );
  const rows = [];
  for (const row of result.rows) {
    const programs = programsAtCampus(user, row.campus);
    if (programs !== 'all' && programs.length === 0) continue;
    const counts = row.run_id === null
      ? { counts: emptyCounts(), total: 0 }
      : await zoneCounts(STUDENTS_IN_SCOPE, [row.run_id, ...programParams(programs)]);
    rows.push({ campus: row.campus, name: row.name, period: row.period, ...counts });
  }
  return rows;
}
