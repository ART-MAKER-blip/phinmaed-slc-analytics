import 'server-only';
import type { Pool, PoolClient } from 'pg';
import { ApiError } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import type { AuthUser } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { hasPermission, programsAtCampus } from '@/lib/access';
import type { Permission } from '@/lib/permissions';
import type { Zone } from '@/lib/zones';
import {
  canAddNote, canSeeIntervention, canSeeNotes, canSeeReferral, canUpdateIntervention, canUpdateReferral,
  CONCERN_STATUSES, concernAccess, concernInProgramScope, INTERVENTION_STATUSES, InputError, isoDate, oneOf,
  REFERRAL_STATUSES, REFERRAL_TEAMS, text, type AccessLevel,
} from './rules';

type Db = Pool | PoolClient;

type ConcernRow = {
  concern_id: number; status: 'open' | 'in_progress' | 'closed'; description: string; opened_at: Date; closed_at: Date | null;
  type_code: string; type_name: string; campus: string; campus_id: number; term: string; term_id: number;
  student_id: number | null; sis_id: string | null; student_name: string | null; student_program: string | null;
  offering_id: number | null; course_code: string | null; section: string | null; course_title: string | null;
  teacher_name: string | null; opened_by_name: string;
  course_programs: string[]; referral_teams: string[]; intervention_owners: string[]; open_interventions: number;
};

const CONCERN_SELECT = `
  SELECT c.concern_id, c.status, c.description, c.opened_at, c.closed_at, ct.code AS type_code, ct.name AS type_name,
         cam.code AS campus, cam.campus_id, t.code AS term, t.term_id,
         c.student_id, st.sis_id, st.last_name || ', ' || st.first_name AS student_name,
         (SELECT p.code FROM enrollment e
            JOIN campus_program cp ON cp.campus_program_id = e.campus_program_id
            JOIN program p ON p.program_id = cp.program_id
           WHERE e.student_id = c.student_id AND e.academic_year_id = t.academic_year_id) AS student_program,
         o.offering_id, crs.code AS course_code, o.section, crs.title AS course_title, tch.name AS teacher_name,
         u.name AS opened_by_name,
         COALESCE((SELECT array_agg(DISTINCT p.code) FROM program_course pc JOIN program p ON p.program_id = pc.program_id
                    WHERE pc.course_id = o.course_id), '{}') AS course_programs,
         COALESCE((SELECT array_agg(DISTINCT rt.code) FROM referral r JOIN referral_team rt ON rt.referral_team_id = r.referral_team_id
                    WHERE r.concern_id = c.concern_id), '{}') AS referral_teams,
         COALESCE((SELECT array_agg(DISTINCT i.owner_user_id::text) FROM intervention i WHERE i.concern_id = c.concern_id), '{}') AS intervention_owners,
         (SELECT count(*)::int FROM intervention i WHERE i.concern_id = c.concern_id AND i.status IN ('planned', 'in_progress')) AS open_interventions
    FROM concern c
    JOIN concern_type ct ON ct.concern_type_id = c.concern_type_id
    JOIN campus cam ON cam.campus_id = c.campus_id
    JOIN term t ON t.term_id = c.term_id
    JOIN app_users u ON u.id = c.opened_by
    LEFT JOIN student st ON st.student_id = c.student_id
    LEFT JOIN teaching_assignment ta ON ta.assignment_id = c.assignment_id
    LEFT JOIN teacher tch ON tch.teacher_id = ta.teacher_id
    LEFT JOIN course_offering o ON o.offering_id = COALESCE(c.offering_id, ta.offering_id)
    LEFT JOIN course crs ON crs.course_id = o.course_id`;

function accessFor(user: AuthUser, row: ConcernRow): AccessLevel | null {
  const programs = programsAtCampus(user, row.campus);
  const campusInScope = programs === 'all' || programs.length > 0;
  return concernAccess(user, {
    campusInScope,
    inScope: campusInScope && concernInProgramScope(programs, { studentProgram: row.student_program, coursePrograms: row.course_programs }),
    referralTeams: row.referral_teams,
    interventionOwners: row.intervention_owners,
  });
}

export type ConcernSummary = ConcernRow & { access: AccessLevel; context: string };

function contextLabel(row: ConcernRow) {
  if (row.student_name) return `${row.student_name} (${row.sis_id})`;
  if (row.course_code) return `${row.course_code} · ${row.section}${row.teacher_name ? ` · ${row.teacher_name}` : ''}`;
  return 'Unknown context';
}

/** Concerns the user may open, newest first. */
export async function listConcerns(user: AuthUser, status: 'active' | 'closed' | 'all'): Promise<ConcernSummary[]> {
  const result = await getPool().query<ConcernRow>(
    `${CONCERN_SELECT}
      WHERE ($1 = 'all' OR ($1 = 'closed') = (c.status = 'closed'))
      ORDER BY c.opened_at DESC LIMIT 500`,
    [status],
  );
  return result.rows.flatMap((row) => {
    const access = accessFor(user, row);
    return access ? [{ ...row, access, context: contextLabel(row) }] : [];
  });
}

/** The concern and the user's access to it, or null when it does not exist or is not visible. */
async function findConcern(db: Db, user: AuthUser, concernId: number, lock = false) {
  const result = await db.query<ConcernRow>(
    `${CONCERN_SELECT} WHERE c.concern_id = $1${lock ? ' FOR UPDATE OF c' : ''}`,
    [concernId],
  );
  const row = result.rows[0];
  const access = row ? accessFor(user, row) : null;
  return row && access ? { row, access } : null;
}

async function loadConcern(db: Db, user: AuthUser, concernId: number, lock = false) {
  const found = await findConcern(db, user, concernId, lock);
  if (!found) throw new ApiError('Concern not found.', 404);
  return found;
}

/* ---- Detail ---- */

export async function getConcernDetail(user: AuthUser, concernId: number) {
  const pool = getPool();
  const found = await findConcern(pool, user, concernId);
  if (!found) return null;
  const { row, access } = found;

  const full = access === 'full';
  const [deliberations, interventions, referrals, results] = await Promise.all([
    full
      ? pool.query<{ deliberation_id: number; meeting_date: string; decision: string; recorded_by: string; created_at: Date; participants: string[]; evidence: string[] }>(
          `SELECT d.deliberation_id, to_char(d.meeting_date, 'YYYY-MM-DD') AS meeting_date, d.decision, u.name AS recorded_by, d.created_at,
                  COALESCE((SELECT array_agg(pu.name ORDER BY pu.name) FROM deliberation_participant dp JOIN app_users pu ON pu.id = dp.user_id
                             WHERE dp.deliberation_id = d.deliberation_id), '{}') AS participants,
                  COALESCE((SELECT array_agg(e.description ORDER BY e.evidence_id) FROM deliberation_evidence e
                             WHERE e.deliberation_id = d.deliberation_id), '{}') AS evidence
             FROM deliberation d JOIN app_users u ON u.id = d.recorded_by
            WHERE d.concern_id = $1 ORDER BY d.meeting_date DESC, d.deliberation_id DESC`,
          [concernId],
        )
      : null,
    pool.query<{ intervention_id: number; type_name: string; description: string; target: string | null; owner_id: string; owner_name: string;
      start_date: string | null; due_date: string; end_date: string | null; status: string;
      follow_ups: { date: string; progress: string; next_step: string | null; outcome: string | null; by: string }[] }>(
      `SELECT i.intervention_id, it.name AS type_name, i.description, i.target, i.owner_user_id::text AS owner_id, u.name AS owner_name,
              to_char(i.start_date, 'YYYY-MM-DD') AS start_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
              to_char(i.end_date, 'YYYY-MM-DD') AS end_date, i.status,
              COALESCE((SELECT json_agg(json_build_object('date', to_char(f.checkin_date, 'YYYY-MM-DD'), 'progress', f.progress,
                                                          'next_step', f.next_step, 'outcome', f.outcome, 'by', fu.name)
                                        ORDER BY f.checkin_date, f.follow_up_id)
                          FROM follow_up f JOIN app_users fu ON fu.id = f.recorded_by WHERE f.intervention_id = i.intervention_id), '[]') AS follow_ups
         FROM intervention i
         JOIN intervention_type it ON it.intervention_type_id = i.intervention_type_id
         JOIN app_users u ON u.id = i.owner_user_id
        WHERE i.concern_id = $1 ORDER BY i.due_date, i.intervention_id`,
      [concernId],
    ),
    pool.query<{ referral_id: number; team: string; team_name: string; referred_by: string; referral_date: string; status: string }>(
      `SELECT r.referral_id, rt.code AS team, rt.name AS team_name, u.name AS referred_by,
              to_char(r.referral_date, 'YYYY-MM-DD') AS referral_date, r.status
         FROM referral r JOIN referral_team rt ON rt.referral_team_id = r.referral_team_id JOIN app_users u ON u.id = r.referred_by
        WHERE r.concern_id = $1 ORDER BY r.referral_date DESC, r.referral_id DESC`,
      [concernId],
    ),
    access === 'team' ? null : zoneHistory(row),
  ]);

  const visibleReferrals = referrals.rows.filter((r) => canSeeReferral(user, access, r.team));
  const noteIds = visibleReferrals.filter((r) => canSeeNotes(user, r.team)).map((r) => r.referral_id);
  const notes = noteIds.length
    ? (await pool.query<{ referral_id: number; note_text: string; created_by: string; created_at: Date }>(
        `SELECT n.referral_id, n.note_text, u.name AS created_by, n.created_at
           FROM referral_note n JOIN app_users u ON u.id = n.created_by
          WHERE n.referral_id = ANY($1::int[]) ORDER BY n.created_at`,
        [noteIds],
      )).rows
    : [];

  return {
    concern: { ...row, context: contextLabel(row) },
    access,
    results,
    deliberations: deliberations?.rows ?? null,
    interventions: interventions.rows
      .filter((i) => canSeeIntervention(user, access, i.owner_id))
      .map((i) => ({ ...i, canUpdate: canUpdateIntervention(user, access, i.owner_id) })),
    referrals: visibleReferrals.map((r) => ({
      ...r,
      canUpdate: canUpdateReferral(user, access, r.team),
      canAddNote: canAddNote(user, r.team),
      notes: canSeeNotes(user, r.team) ? notes.filter((n) => n.referral_id === r.referral_id) : null,
    })),
    can: {
      deliberate: full && hasPermission(user, 'deliberation.record'),
      intervene: full && hasPermission(user, 'intervention.manage'),
      refer: full && hasPermission(user, 'referral.create'),
      changeStatus: full && hasPermission(user, 'concern.manage'),
      /** Teams for which the user may attach a restricted note when creating a referral. */
      noteTeams: REFERRAL_TEAMS.filter((team) => canAddNote(user, team)),
    },
  };
}

/** Zone results for the concern's student or subject section in each calculated period of its term. */
async function zoneHistory(row: ConcernRow) {
  if (row.student_id) {
    const result = await getPool().query<{ period: string; failed: number; zone: Zone }>(
      `SELECT DISTINCT ON (r.grading_period_id) gp.code AS period, s.failed_count AS failed, z.code AS zone
         FROM student_zone_snapshot s
         JOIN snapshot_run r ON r.run_id = s.run_id
         JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
         JOIN zone z ON z.zone_id = s.zone_id
        WHERE s.student_id = $1 AND r.term_id = $2 AND r.campus_id = $3
        ORDER BY r.grading_period_id, r.calculated_at DESC`,
      [row.student_id, row.term_id, row.campus_id],
    );
    return { kind: 'student' as const, rows: result.rows.map((r) => ({ period: r.period, detail: `${r.failed} failed subject${r.failed === 1 ? '' : 's'}`, zone: r.zone })) };
  }
  if (row.offering_id) {
    const result = await getPool().query<{ period: string; failed: number; graded: number; rate: string; zone: Zone }>(
      `SELECT DISTINCT ON (r.grading_period_id) gp.code AS period, s.failed_count AS failed, s.graded_count AS graded, s.failure_rate AS rate, z.code AS zone
         FROM subject_result_snapshot s
         JOIN snapshot_run r ON r.run_id = s.run_id
         JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
         JOIN zone z ON z.zone_id = s.zone_id
        WHERE s.offering_id = $1
        ORDER BY r.grading_period_id, r.calculated_at DESC`,
      [row.offering_id],
    );
    return { kind: 'subject' as const, rows: result.rows.map((r) => ({ period: r.period, detail: `${r.failed} of ${r.graded} failed (${Number(r.rate)}%)`, zone: r.zone })) };
  }
  return null;
}

/* ---- Options for forms ---- */

export async function concernFormOptions(user: AuthUser, campus: string, term: string, runId: number | null) {
  const pool = getPool();
  const programs = programsAtCampus(user, campus);
  const [all, list] = programs === 'all' ? [true, [] as string[]] : [false, programs];
  const [types, students, subjects] = await Promise.all([
    pool.query<{ code: string; name: string }>('SELECT code, name FROM concern_type ORDER BY concern_type_id'),
    runId === null ? null : pool.query<{ sis_id: string; name: string; program: string; failed: number; zone: Zone }>(
      `SELECT st.sis_id, st.last_name || ', ' || st.first_name AS name, p.code AS program, s.failed_count AS failed, z.code AS zone
         FROM student_zone_snapshot s
         JOIN student st ON st.student_id = s.student_id
         JOIN zone z ON z.zone_id = s.zone_id
         JOIN campus_program cp ON cp.campus_program_id = s.campus_program_id
         JOIN program p ON p.program_id = cp.program_id
        WHERE s.run_id = $1 AND z.code <> 'green' AND ($2 OR p.code = ANY($3::text[]))
          AND NOT EXISTS (SELECT 1 FROM concern c JOIN snapshot_run r ON r.run_id = $1
                           WHERE c.student_id = s.student_id AND c.term_id = r.term_id AND c.status <> 'closed')
        ORDER BY s.failed_count DESC, st.last_name LIMIT 200`,
      [runId, all, list],
    ),
    runId === null ? null : pool.query<{ offering_id: number; code: string; section: string; rate: string; zone: Zone }>(
      `SELECT o.offering_id, c.code, o.section, s.failure_rate AS rate, z.code AS zone
         FROM subject_result_snapshot s
         JOIN zone z ON z.zone_id = s.zone_id
         JOIN course_offering o ON o.offering_id = s.offering_id
         JOIN course c ON c.course_id = o.course_id
        WHERE s.run_id = $1 AND z.code <> 'green'
          AND ($2 OR EXISTS (SELECT 1 FROM program_course pc JOIN program p ON p.program_id = pc.program_id
                              WHERE pc.course_id = o.course_id AND p.code = ANY($3::text[])))
        ORDER BY s.failure_rate DESC LIMIT 200`,
      [runId, all, list],
    ),
  ]);
  return {
    campus, term,
    types: types.rows,
    students: students?.rows ?? [],
    subjects: (subjects?.rows ?? []).map((s) => ({ ...s, rate: Number(s.rate) })),
  };
}

/** Active staff at the concern's campus, for intervention owners and deliberation participants. */
export async function staffOptions(campusId: number) {
  const result = await getPool().query<{ id: string; name: string; roles: string }>(
    `SELECT u.id::text, u.name, string_agg(DISTINCT r.name, ', ') AS roles
       FROM app_users u
       JOIN user_role ur ON ur.user_id = u.id
       JOIN role r ON r.role_id = ur.role_id
       JOIN user_role_scope s ON s.user_role_id = ur.user_role_id
      WHERE u.active AND (s.campus_id IS NULL OR s.campus_id = $1)
      GROUP BY u.id, u.name ORDER BY u.name`,
    [campusId],
  );
  return result.rows;
}

/* ---- Changes ---- */

async function inTransaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof InputError) throw new ApiError(error.message, 400);
    throw error;
  } finally {
    client.release();
  }
}

function ensure(user: AuthUser, ok: boolean, message = 'You do not have permission to do this.') {
  if (!ok) throw new ApiError(message, 403);
}

const need = (user: AuthUser, permission: Permission) => hasPermission(user, permission);

/** Opens a concern about a flagged student or subject section at a campus and term in scope. */
export async function createConcern(user: AuthUser, input: Record<string, unknown>) {
  ensure(user, need(user, 'concern.manage'));
  return inTransaction(async (db) => {
    const campus = text(input.campus, 'Campus', { max: 20 })!;
    const term = text(input.term, 'Term', { max: 20 })!;
    const typeCode = text(input.type, 'Concern type', { max: 40 })!;
    const description = text(input.description, 'Description', { min: 5, max: 2000 })!;
    const context = text(input.context, 'Student or subject', { max: 120 })!;
    const programs = programsAtCampus(user, campus);
    ensure(user, programs === 'all' || programs.length > 0, 'You cannot open concerns at this campus.');

    const ids = await db.query<{ campus_id: number; term_id: number; academic_year_id: number; type_id: number }>(
      `SELECT c.campus_id, t.term_id, t.academic_year_id, ct.concern_type_id AS type_id
         FROM campus c, term t, concern_type ct WHERE c.code = $1 AND t.code = $2 AND ct.code = $3`,
      [campus, term, typeCode],
    );
    const ref = ids.rows[0];
    if (!ref) throw new ApiError('Choose a valid campus, term and concern type.');

    let studentId: number | null = null;
    let offeringId: number | null = null;
    const [kind, value] = [context.slice(0, context.indexOf(':')), context.slice(context.indexOf(':') + 1)];
    if (kind === 'student') {
      const student = await db.query<{ student_id: number; program: string }>(
        `SELECT s.student_id, p.code AS program FROM student s
           JOIN enrollment e ON e.student_id = s.student_id AND e.academic_year_id = $2
           JOIN campus_program cp ON cp.campus_program_id = e.campus_program_id AND cp.campus_id = $3
           JOIN program p ON p.program_id = cp.program_id
          WHERE s.sis_id = $1`,
        [value, ref.academic_year_id, ref.campus_id],
      );
      const found = student.rows[0];
      if (!found || !concernInProgramScope(programs, { studentProgram: found.program, coursePrograms: [] })) {
        throw new ApiError('That student is not enrolled in a program you can access this term.', 404);
      }
      studentId = found.student_id;
    } else if (kind === 'offering') {
      const offering = await db.query<{ offering_id: number; programs: string[] }>(
        `SELECT o.offering_id, COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS programs
           FROM course_offering o
           LEFT JOIN program_course pc ON pc.course_id = o.course_id
           LEFT JOIN program p ON p.program_id = pc.program_id
          WHERE o.offering_id = $1 AND o.campus_id = $2 AND o.term_id = $3
          GROUP BY o.offering_id`,
        [Number(value) || 0, ref.campus_id, ref.term_id],
      );
      const found = offering.rows[0];
      if (!found || !concernInProgramScope(programs, { studentProgram: null, coursePrograms: found.programs })) {
        throw new ApiError('That subject section is not in your scope this term.', 404);
      }
      offeringId = found.offering_id;
    } else {
      throw new ApiError('Choose a student or subject section.');
    }

    const inserted = await db.query<{ concern_id: number }>(
      `INSERT INTO concern (concern_type_id, term_id, campus_id, student_id, offering_id, description, opened_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING concern_id`,
      [ref.type_id, ref.term_id, ref.campus_id, studentId, offeringId, description, user.id],
    );
    const concernId = inserted.rows[0].concern_id;
    await writeAudit({ userId: user.id, action: 'concern_create', tableName: 'concern', recordId: concernId, metadata: { type: typeCode, context: kind } }, db);
    return { concernId };
  });
}

async function activeUser(db: Db, userId: unknown) {
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) throw new ApiError('Choose a valid person.');
  const result = await db.query('SELECT 1 FROM app_users WHERE id = $1 AND active', [userId]);
  if (result.rowCount === 0) throw new ApiError('Choose an active person.');
  return userId;
}

async function markInProgress(db: Db, concernId: number) {
  await db.query(`UPDATE concern SET status = 'in_progress' WHERE concern_id = $1 AND status = 'open'`, [concernId]);
}

/** Applies one change to a concern. Every change is re-authorized and audited. */
export async function concernAction(user: AuthUser, concernId: number, input: Record<string, unknown>) {
  const action = typeof input.action === 'string' ? input.action : '';
  return inTransaction(async (db) => {
    const { row, access } = await loadConcern(db, user, concernId, true);
    const full = access === 'full';
    const audit = (actionName: string, tableName: string, recordId: number, metadata?: Record<string, unknown>) =>
      writeAudit({ userId: user.id, action: actionName, tableName, recordId, metadata: { concernId, ...metadata } }, db);
    if (row.status === 'closed' && action !== 'status') throw new ApiError('This concern is closed. Reopen it to make changes.', 409);

    switch (action) {
      case 'deliberation': {
        ensure(user, full && need(user, 'deliberation.record'));
        const meetingDate = isoDate(input.meetingDate, 'Meeting date')!;
        const decision = text(input.decision, 'Decision and agreed actions', { min: 5, max: 4000 })!;
        const evidence = text(input.evidence, 'Evidence reviewed', { optional: true, max: 2000 });
        const participants = Array.isArray(input.participants) ? input.participants.slice(0, 30) : [];
        const d = await db.query<{ deliberation_id: number }>(
          'INSERT INTO deliberation (concern_id, meeting_date, decision, recorded_by) VALUES ($1, $2, $3, $4) RETURNING deliberation_id',
          [concernId, meetingDate, decision, user.id],
        );
        const id = d.rows[0].deliberation_id;
        const people = new Set<string>([user.id]);
        for (const p of participants) people.add(await activeUser(db, p));
        await db.query(
          'INSERT INTO deliberation_participant (deliberation_id, user_id) SELECT $1, unnest($2::uuid[])',
          [id, [...people]],
        );
        // The latest zone results for the concern's term are attached as evidence automatically.
        await db.query(
          `INSERT INTO deliberation_evidence (deliberation_id, run_id, description)
           SELECT $1, r.run_id, 'Zone results ' || t.code || ' ' || gp.code || ' (run #' || r.run_id || ')'
             FROM snapshot_run r JOIN term t ON t.term_id = r.term_id JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
            WHERE r.term_id = $2 AND r.campus_id = $3
            ORDER BY r.grading_period_id DESC, r.calculated_at DESC LIMIT 1`,
          [id, row.term_id, row.campus_id],
        );
        if (evidence) await db.query('INSERT INTO deliberation_evidence (deliberation_id, description) VALUES ($1, $2)', [id, evidence]);
        await markInProgress(db, concernId);
        await audit('deliberation_create', 'deliberation', id, { participants: people.size });
        return { id };
      }

      case 'intervention': {
        ensure(user, full && need(user, 'intervention.manage'));
        const typeCode = text(input.type, 'Intervention type', { max: 40 })!;
        const description = text(input.description, 'Agreed action', { min: 3, max: 2000 })!;
        const target = text(input.target, 'Target', { optional: true, max: 500 });
        const ownerId = await activeUser(db, input.ownerId);
        const startDate = isoDate(input.startDate, 'Start date', { optional: true });
        const dueDate = isoDate(input.dueDate, 'Due date')!;
        if (startDate && startDate > dueDate) throw new ApiError('The due date must be on or after the start date.');
        const i = await db.query<{ intervention_id: number }>(
          `INSERT INTO intervention (concern_id, intervention_type_id, owner_user_id, description, target, start_date, due_date)
           SELECT $1, intervention_type_id, $3, $4, $5, $6, $7 FROM intervention_type WHERE code = $2
           RETURNING intervention_id`,
          [concernId, typeCode, ownerId, description, target, startDate, dueDate],
        );
        if (!i.rows[0]) throw new ApiError('Choose a valid intervention type.');
        await markInProgress(db, concernId);
        await audit('intervention_create', 'intervention', i.rows[0].intervention_id, { type: typeCode, ownerId, dueDate });
        return { id: i.rows[0].intervention_id };
      }

      case 'follow_up': {
        const interventionId = Number(input.interventionId);
        const found = await db.query<{ owner: string; status: string }>(
          'SELECT owner_user_id::text AS owner, status FROM intervention WHERE intervention_id = $1 AND concern_id = $2 FOR UPDATE',
          [Number.isSafeInteger(interventionId) ? interventionId : 0, concernId],
        );
        const intervention = found.rows[0];
        if (!intervention) throw new ApiError('Intervention not found.', 404);
        ensure(user, canUpdateIntervention(user, access, intervention.owner));
        const checkinDate = isoDate(input.checkinDate, 'Check-in date')!;
        const progress = text(input.progress, 'Progress', { min: 3, max: 2000 })!;
        const nextStep = text(input.nextStep, 'Next step', { optional: true, max: 1000 });
        const outcome = text(input.outcome, 'Outcome', { optional: true, max: 1000 });
        const status = input.status ? oneOf(input.status, INTERVENTION_STATUSES, 'intervention status') : intervention.status;
        const f = await db.query<{ follow_up_id: number }>(
          `INSERT INTO follow_up (intervention_id, checkin_date, progress, next_step, outcome, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING follow_up_id`,
          [interventionId, checkinDate, progress, nextStep, outcome, user.id],
        );
        if (status !== intervention.status) {
          await db.query(
            `UPDATE intervention SET status = $2,
                    end_date = CASE WHEN $2 IN ('completed', 'cancelled') THEN $3::date ELSE NULL END
              WHERE intervention_id = $1`,
            [interventionId, status, checkinDate],
          );
          await audit('intervention_update', 'intervention', interventionId, { from: intervention.status, to: status });
        }
        await audit('follow_up_create', 'follow_up', f.rows[0].follow_up_id, { interventionId });
        return { id: f.rows[0].follow_up_id };
      }

      case 'referral': {
        ensure(user, full && need(user, 'referral.create'));
        const team = oneOf(input.team, REFERRAL_TEAMS, 'referral team');
        const note = text(input.note, 'Restricted note', { optional: true, max: 2000 });
        if (note) ensure(user, canAddNote(user, team), 'You cannot add restricted notes for this team.');
        const r = await db.query<{ referral_id: number }>(
          `INSERT INTO referral (concern_id, referral_team_id, referred_by)
           SELECT $1, referral_team_id, $3 FROM referral_team WHERE code = $2 RETURNING referral_id`,
          [concernId, team, user.id],
        );
        const id = r.rows[0].referral_id;
        if (note) await db.query('INSERT INTO referral_note (referral_id, note_text, created_by) VALUES ($1, $2, $3)', [id, note, user.id]);
        await markInProgress(db, concernId);
        // Note text is never copied into the audit log.
        await audit('referral_create', 'referral', id, { team, withNote: Boolean(note) });
        return { id };
      }

      case 'referral_status':
      case 'referral_note': {
        const referralId = Number(input.referralId);
        const found = await db.query<{ team: string; status: string }>(
          `SELECT rt.code AS team, r.status FROM referral r JOIN referral_team rt ON rt.referral_team_id = r.referral_team_id
            WHERE r.referral_id = $1 AND r.concern_id = $2 FOR UPDATE OF r`,
          [Number.isSafeInteger(referralId) ? referralId : 0, concernId],
        );
        const referral = found.rows[0];
        if (!referral || !canSeeReferral(user, access, referral.team)) throw new ApiError('Referral not found.', 404);
        if (action === 'referral_status') {
          ensure(user, canUpdateReferral(user, access, referral.team));
          const status = oneOf(input.status, REFERRAL_STATUSES, 'referral status');
          await db.query('UPDATE referral SET status = $2 WHERE referral_id = $1', [referralId, status]);
          await audit('referral_update', 'referral', referralId, { from: referral.status, to: status });
          return { id: referralId };
        }
        ensure(user, canAddNote(user, referral.team), 'You cannot add restricted notes for this team.');
        const note = text(input.note, 'Restricted note', { min: 2, max: 2000 })!;
        const n = await db.query<{ note_id: number }>(
          'INSERT INTO referral_note (referral_id, note_text, created_by) VALUES ($1, $2, $3) RETURNING note_id',
          [referralId, note, user.id],
        );
        await audit('referral_note_create', 'referral_note', n.rows[0].note_id, { referralId });
        return { id: n.rows[0].note_id };
      }

      case 'status': {
        ensure(user, full && need(user, 'concern.manage'));
        const status = oneOf(input.status, CONCERN_STATUSES, 'concern status');
        await db.query(
          `UPDATE concern SET status = $2, closed_at = CASE WHEN $2 = 'closed' THEN NOW() ELSE NULL END WHERE concern_id = $1`,
          [concernId, status],
        );
        await audit('concern_update', 'concern', concernId, { from: row.status, to: status });
        return { id: concernId };
      }

      default:
        throw new ApiError('Unknown action.');
    }
  });
}
