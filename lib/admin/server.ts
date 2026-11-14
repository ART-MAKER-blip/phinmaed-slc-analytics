import 'server-only';
import { serial } from '@/lib/serial';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { hashSessionToken, type AuthUser } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { isoDate } from '@/lib/concerns/rules';
import {
  checkAdminLockout, InputError, parseAssignments, parseCode, parseEmail, parseName, parsePassword, parseTermCode,
  type Assignment,
} from './validate';

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
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new ApiError('That value is already in use.', 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** A readable one-time password: 20 characters from an unambiguous alphabet. */
function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('').replace(/(.{5})(?!$)/g, '$1-');
}

/* ---- Users ---- */

export type UserRow = {
  id: string; name: string; email: string; active: boolean; created_at: Date;
  last_login: Date | null;
  assignments: Assignment[];
};

const USER_SELECT = `
  SELECT u.id::text, u.name, u.email, u.active, u.created_at,
         (SELECT max(a.logged_at) FROM audit_log a WHERE a.user_id = u.id AND a.action = 'login') AS last_login,
         COALESCE((SELECT json_agg(json_build_object('role', r.code, 'campus', c.code, 'program', p.code)
                                   ORDER BY r.role_id, c.code NULLS FIRST, p.code NULLS FIRST)
                     FROM user_role ur
                     JOIN role r ON r.role_id = ur.role_id
                     LEFT JOIN user_role_scope s ON s.user_role_id = ur.user_role_id
                     LEFT JOIN campus c ON c.campus_id = s.campus_id
                     LEFT JOIN program p ON p.program_id = s.program_id
                    WHERE ur.user_id = u.id), '[]') AS assignments
    FROM app_users u`;

export async function listUsers(): Promise<UserRow[]> {
  return (await getPool().query<UserRow>(`${USER_SELECT} ORDER BY u.active DESC, u.name`)).rows;
}

export async function getUser(id: string): Promise<UserRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await getPool().query<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [id])).rows[0] ?? null;
}

export async function adminOptions() {
  const pool = getPool();
  const [campuses, programs] = await Promise.all([
    pool.query<{ code: string; name: string }>('SELECT code, name FROM campus ORDER BY name'),
    pool.query<{ code: string; name: string }>('SELECT code, name FROM program ORDER BY code'),
  ]);
  return { campuses: campuses.rows, programs: programs.rows };
}

async function knownCodes(db: PoolClient) {
  const [c, p] = await serial([
    () => db.query<{ code: string }>('SELECT code FROM campus'),
    () => db.query<{ code: string }>('SELECT code FROM program'),
  ] as const);
  return { campuses: c.rows.map((r) => r.code), programs: p.rows.map((r) => r.code) };
}

/** Replaces a user's roles and scopes with the given assignments. */
async function writeAssignments(db: PoolClient, userId: string, assignments: Assignment[]) {
  await db.query('DELETE FROM user_role WHERE user_id = $1', [userId]);
  for (const role of [...new Set(assignments.map((a) => a.role))]) {
    const ur = await db.query<{ user_role_id: number }>(
      'INSERT INTO user_role (user_id, role_id) SELECT $1, role_id FROM role WHERE code = $2 RETURNING user_role_id',
      [userId, role],
    );
    for (const a of assignments.filter((x) => x.role === role)) {
      await db.query(
        `INSERT INTO user_role_scope (user_role_id, campus_id, program_id)
         VALUES ($1, (SELECT campus_id FROM campus WHERE code = $2), (SELECT program_id FROM program WHERE code = $3))`,
        [ur.rows[0].user_role_id, a.campus, a.program],
      );
    }
  }
}

async function otherActiveAdmins(db: PoolClient, excludeUserId: string) {
  const result = await db.query<{ count: number }>(
    `SELECT count(DISTINCT u.id)::int AS count FROM app_users u
       JOIN user_role ur ON ur.user_id = u.id JOIN role r ON r.role_id = ur.role_id
      WHERE r.code = 'admin' AND u.active AND u.id <> $1`,
    [excludeUserId],
  );
  return result.rows[0].count;
}

export async function createUser(actor: AuthUser, input: Record<string, unknown>) {
  return inTransaction(async (db) => {
    const name = parseName(input.name);
    const email = parseEmail(input.email);
    const assignments = parseAssignments(input.assignments, await knownCodes(db));
    const password = temporaryPassword();
    const created = await db.query<{ id: string }>(
      'INSERT INTO app_users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id::text',
      [email, name, await hashPassword(password)],
    );
    const id = created.rows[0].id;
    await writeAssignments(db, id, assignments);
    await writeAudit({ userId: actor.id, action: 'user_create', tableName: 'app_users', recordId: id, metadata: { email, assignments } }, db);
    return { id, temporaryPassword: password };
  });
}

export async function updateUser(actor: AuthUser, id: string, input: Record<string, unknown>) {
  return inTransaction(async (db) => {
    const before = await db.query<UserRow>(`${USER_SELECT} WHERE u.id = $1 FOR UPDATE OF u`, [id]);
    const current = before.rows[0];
    if (!current) throw new ApiError('User not found.', 404);

    const name = parseName(input.name);
    const email = parseEmail(input.email);
    const active = input.active === true;
    const assignments = parseAssignments(input.assignments, await knownCodes(db));

    checkAdminLockout({
      actorId: actor.id,
      targetId: id,
      targetWasAdmin: current.active && current.assignments.some((a) => a.role === 'admin'),
      targetWillBeAdmin: assignments.some((a) => a.role === 'admin'),
      targetWillBeActive: active,
      otherActiveAdmins: await otherActiveAdmins(db, id),
    });

    await db.query('UPDATE app_users SET name = $2, email = $3, active = $4 WHERE id = $1', [id, name, email, active]);
    await writeAssignments(db, id, assignments);
    // A deactivated account is signed out everywhere at once.
    if (!active) await db.query('DELETE FROM auth_sessions WHERE user_id = $1', [id]);
    await writeAudit({
      userId: actor.id, action: 'user_update', tableName: 'app_users', recordId: id,
      metadata: {
        before: { name: current.name, email: current.email, active: current.active, assignments: current.assignments },
        after: { name, email, active, assignments },
      },
    }, db);
    return { id };
  });
}

export async function resetPassword(actor: AuthUser, id: string) {
  return inTransaction(async (db) => {
    const password = temporaryPassword();
    const updated = await db.query('UPDATE app_users SET password_hash = $2 WHERE id = $1', [id, await hashPassword(password)]);
    if (updated.rowCount === 0) throw new ApiError('User not found.', 404);
    await db.query('DELETE FROM auth_sessions WHERE user_id = $1', [id]);
    await writeAudit({ userId: actor.id, action: 'password_reset', tableName: 'app_users', recordId: id }, db);
    return { temporaryPassword: password };
  });
}

/** Signed-in users change their own password; their other sessions are signed out. */
export async function changeOwnPassword(user: AuthUser, currentToken: string, input: Record<string, unknown>) {
  return inTransaction(async (db) => {
    const current = typeof input.currentPassword === 'string' ? input.currentPassword : '';
    const next = parsePassword(input.newPassword);
    if (input.confirmPassword !== next) throw new InputError('The new passwords do not match.');
    if (next === current) throw new InputError('Choose a password different from the current one.');
    const row = await db.query<{ password_hash: string }>('SELECT password_hash FROM app_users WHERE id = $1 FOR UPDATE', [user.id]);
    if (!row.rows[0] || !(await verifyPassword(current, row.rows[0].password_hash))) {
      throw new ApiError('Your current password is incorrect.', 403);
    }
    await db.query('UPDATE app_users SET password_hash = $2 WHERE id = $1', [user.id, await hashPassword(next)]);
    await db.query('DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash <> $2', [user.id, hashSessionToken(currentToken)]);
    await writeAudit({ userId: user.id, action: 'password_change', tableName: 'app_users', recordId: user.id }, db);
  });
}

/* ---- Reference data: campuses, programs, terms ---- */

export async function referenceData() {
  const pool = getPool();
  const [campuses, colleges, programs, offered, terms] = await Promise.all([
    pool.query<{ code: string; name: string; status: string }>('SELECT code, name, status FROM campus ORDER BY name'),
    pool.query<{ code: string; name: string }>('SELECT code, name FROM college ORDER BY code'),
    pool.query<{ code: string; name: string; college: string }>(
      'SELECT p.code, p.name, c.code AS college FROM program p JOIN college c USING (college_id) ORDER BY p.code',
    ),
    pool.query<{ campus: string; program: string }>(
      'SELECT c.code AS campus, p.code AS program FROM campus_program cp JOIN campus c USING (campus_id) JOIN program p USING (program_id)',
    ),
    pool.query<{ code: string; name: string; school_year: string; start_date: string | null; end_date: string | null; grade_release_date: string | null }>(
      `SELECT code, name, school_year, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date,
              to_char(grade_release_date, 'YYYY-MM-DD') AS grade_release_date
         FROM term ORDER BY code DESC`,
    ),
  ]);
  return { campuses: campuses.rows, colleges: colleges.rows, programs: programs.rows, offered: offered.rows, terms: terms.rows };
}

export async function referenceAction(actor: AuthUser, input: Record<string, unknown>) {
  const action = typeof input.action === 'string' ? input.action : '';
  return inTransaction(async (db) => {
    const audit = (name: string, table: string, record: string | number, metadata: Record<string, unknown>) =>
      writeAudit({ userId: actor.id, action: name, tableName: table, recordId: record, metadata }, db);

    switch (action) {
      case 'add_campus': {
        const code = parseCode(input.code, 'Campus code').toUpperCase();
        const name = parseName(input.name);
        const r = await db.query<{ campus_id: number }>('INSERT INTO campus (code, name) VALUES ($1, $2) RETURNING campus_id', [code, name]);
        await audit('campus_create', 'campus', r.rows[0].campus_id, { code, name });
        return { ok: true };
      }
      case 'rename_campus': {
        const name = parseName(input.name);
        const status = input.status === 'inactive' ? 'inactive' : 'active';
        const r = await db.query('UPDATE campus SET name = $2, status = $3 WHERE code = $1', [input.code, name, status]);
        if (r.rowCount === 0) throw new ApiError('Campus not found.', 404);
        await audit('campus_update', 'campus', String(input.code), { name, status });
        return { ok: true };
      }
      case 'add_college': {
        const code = parseCode(input.code, 'College code').toUpperCase();
        const name = parseName(input.name);
        const r = await db.query<{ college_id: number }>('INSERT INTO college (code, name) VALUES ($1, $2) RETURNING college_id', [code, name]);
        await audit('college_create', 'college', r.rows[0].college_id, { code, name });
        return { ok: true };
      }
      case 'rename_college': {
        const name = parseName(input.name);
        const r = await db.query('UPDATE college SET name = $2 WHERE code = $1', [input.code, name]);
        if (r.rowCount === 0) throw new ApiError('College not found.', 404);
        await audit('college_update', 'college', String(input.code), { name });
        return { ok: true };
      }
      case 'add_program': {
        const code = parseCode(input.code, 'Program code');
        const name = parseName(input.name);
        const r = await db.query<{ program_id: number }>(
          'INSERT INTO program (college_id, code, name) SELECT college_id, $2, $3 FROM college WHERE code = $1 RETURNING program_id',
          [input.college, code, name],
        );
        if (!r.rows[0]) throw new InputError('Choose the college the program belongs to.');
        await audit('program_create', 'program', r.rows[0].program_id, { code, name, college: input.college });
        return { ok: true };
      }
      case 'rename_program': {
        const name = parseName(input.name);
        const r = await db.query('UPDATE program SET name = $2 WHERE code = $1', [input.code, name]);
        if (r.rowCount === 0) throw new ApiError('Program not found.', 404);
        await audit('program_update', 'program', String(input.code), { name });
        return { ok: true };
      }
      case 'set_offered': {
        const offered = input.offered === true;
        const ids = await db.query<{ campus_id: number; program_id: number }>(
          'SELECT c.campus_id, p.program_id FROM campus c, program p WHERE c.code = $1 AND p.code = $2',
          [input.campus, input.program],
        );
        if (!ids.rows[0]) throw new ApiError('Campus or program not found.', 404);
        const { campus_id, program_id } = ids.rows[0];
        if (offered) {
          await db.query('INSERT INTO campus_program (campus_id, program_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [campus_id, program_id]);
        } else {
          const used = await db.query('SELECT 1 FROM student_term st JOIN campus_program cp USING (campus_program_id) WHERE cp.campus_id = $1 AND cp.program_id = $2 LIMIT 1', [campus_id, program_id]);
          if (used.rowCount) throw new ApiError('Students are enrolled in this program at this campus, so it cannot be removed.', 409);
          await db.query('DELETE FROM campus_program WHERE campus_id = $1 AND program_id = $2', [campus_id, program_id]);
        }
        await audit('campus_program_update', 'campus_program', `${input.campus}/${input.program}`, { offered });
        return { ok: true };
      }
      case 'add_term': {
        const code = parseTermCode(input.code);
        const name = parseName(input.name);
        const year = Number(code.slice(0, 4));
        const dates = termDates(input);
        const r = await db.query<{ term_id: number }>(
          `INSERT INTO term (code, school_year, semester, name, start_date, end_date, grade_release_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING term_id`,
          [code, `${year}-${year + 1}`, Number(code.slice(5)), name, dates.start, dates.end, dates.release],
        );
        await audit('term_create', 'term', r.rows[0].term_id, { code, name, ...dates });
        return { ok: true };
      }
      case 'update_term': {
        const name = parseName(input.name);
        const dates = termDates(input);
        const r = await db.query<{ term_id: number }>(
          'UPDATE term SET name = $2, start_date = $3, end_date = $4, grade_release_date = $5 WHERE code = $1 RETURNING term_id',
          [input.code, name, dates.start, dates.end, dates.release],
        );
        if (!r.rows[0]) throw new ApiError('Term not found.', 404);
        await audit('term_update', 'term', r.rows[0].term_id, { name, ...dates });
        return { ok: true };
      }
      default:
        throw new ApiError('Unknown action.');
    }
  });
}

function termDates(input: Record<string, unknown>) {
  const start = isoDate(input.startDate, 'Start date', { optional: true });
  const end = isoDate(input.endDate, 'End date', { optional: true });
  const release = isoDate(input.gradeReleaseDate, 'Grade release date', { optional: true });
  if (start && end && end <= start) throw new InputError('The end date must be after the start date.');
  return { start, end, release };
}
