import 'server-only';
import { getPool } from '@/lib/db';
import type { AuthUser } from '@/lib/auth';
import { listBatches } from '@/lib/imports/server';
import { listRuns } from '@/lib/snapshots/server';
import { failureRate } from '@/lib/zones';
import type { RoleDashboardContent } from './types';
import type { ReferralTeam } from '@/lib/concerns/rules';

const date = (value: Date) =>
  new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export async function dataManagerDashboard(user: AuthUser): Promise<RoleDashboardContent> {
  const [batches, runs] = await Promise.all([listBatches(user, 200), listRuns(user, 1)]);
  const open = batches.filter((b) => b.validation_status === 'pending' || b.validation_status === 'needs_review');
  const accepted = batches.filter((b) => b.validation_status === 'accepted');
  const rejected = batches.filter((b) => b.validation_status === 'rejected');
  const lastRun = runs[0];
  return {
    eyebrow: 'Data operations', title: 'Imports and zone calculation',
    description: 'Upload SIS grade files, resolve validation issues, and run zone calculation for each period.',
    metrics: [
      { label: 'Waiting for a decision', value: String(open.length), detail: 'Uploaded, not yet accepted or rejected', tone: open.length ? 'metric-gold' : undefined },
      { label: 'Accepted imports', value: String(accepted.length), detail: `${accepted.reduce((n, b) => n + (b.accepted_rows ?? 0), 0).toLocaleString('en-PH')} grade rows` },
      { label: 'Rejected imports', value: String(rejected.length), detail: 'Not imported', tone: rejected.length ? 'metric-red' : undefined },
      {
        label: 'Last zone calculation',
        value: lastRun ? `${lastRun.term_code} ${lastRun.period_code}` : 'None yet',
        detail: lastRun ? `${date(lastRun.calculated_at)} · ${lastRun.rule_set_code}` : 'Run it on the Zones page',
      },
    ],
    queueTitle: 'Imports waiting for review',
    queueEmpty: 'No uploads are waiting. New files appear here after validation.',
    queue: open.slice(0, 6).map((b) => ({
      title: b.filename,
      detail: `${b.term_code ?? ''} ${b.period_code ?? ''} · ${b.total_rows ?? 0} rows · ${b.issue_count} issues`,
      status: b.validation_status === 'pending' ? 'Ready' : 'Needs review',
      href: `/imports/${b.batch_id}`,
    })),
    sample: false,
  };
}

export async function adminDashboard(): Promise<RoleDashboardContent> {
  const pool = getPool();
  const [accounts, ruleSets, audit, events] = await Promise.all([
    pool.query<{ active: number; inactive: number; no_role: number }>(
      `SELECT count(*) FILTER (WHERE active)::int AS active, count(*) FILTER (WHERE NOT active)::int AS inactive,
              count(*) FILTER (WHERE active AND NOT EXISTS (SELECT 1 FROM user_role ur WHERE ur.user_id = u.id))::int AS no_role
         FROM app_users u`,
    ),
    pool.query<{ code: string; status: string; term: string }>(
      `SELECT rs.code, rs.status, t.code AS term FROM zone_rule_set rs JOIN term t ON t.term_id = rs.effective_term_id
        ORDER BY (rs.status = 'approved') DESC, t.code DESC LIMIT 1`,
    ),
    pool.query<{ total: number; denied: number; failed: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE action = 'access_denied')::int AS denied,
              count(*) FILTER (WHERE action = 'login_failed')::int AS failed
         FROM audit_log WHERE logged_at > NOW() - INTERVAL '7 days'`,
    ),
    pool.query<{ action: string; email: string | null; logged_at: Date; detail: string | null }>(
      `SELECT a.action, u.email, a.logged_at,
              COALESCE(a.change_metadata->>'path', a.change_metadata->>'permission', a.change_metadata->>'reason') AS detail
         FROM audit_log a LEFT JOIN app_users u ON u.id = a.user_id
        WHERE a.action IN ('access_denied', 'login_failed')
        ORDER BY a.logged_at DESC LIMIT 6`,
    ),
  ]);
  const a = accounts.rows[0];
  const rs = ruleSets.rows[0];
  const w = audit.rows[0];
  return {
    eyebrow: 'System operations', title: 'Administration',
    description: 'Accounts, rule sets, and recent access events.',
    metrics: [
      { label: 'Active accounts', value: String(a.active), detail: `${a.inactive} deactivated` },
      { label: 'Accounts without a role', value: String(a.no_role), detail: 'Cannot sign in until assigned', tone: a.no_role ? 'metric-gold' : undefined },
      { label: 'Zone rule set', value: rs?.code ?? 'None', detail: rs ? `${rs.status} · effective ${rs.term}` : 'Add one by migration' },
      { label: 'Audit events (7 days)', value: String(w.total), detail: `${w.failed} failed sign-ins · ${w.denied} denied`, tone: w.failed + w.denied ? 'metric-gold' : undefined },
    ],
    queueTitle: 'Recent security events',
    queueEmpty: 'No failed sign-ins or denied access recorded.',
    queue: events.rows.map((e) => ({
      title: e.action === 'login_failed' ? 'Failed sign-in' : 'Access denied',
      detail: `${e.email ?? 'Unknown account'}${e.detail ? ` · ${e.detail}` : ''}`,
      status: date(e.logged_at),
    })),
    sample: false,
  };
}

/** Results for the signed-in teacher's own classes, as indicators only. */
export async function facultyDashboard(user: AuthUser): Promise<RoleDashboardContent> {
  const pool = getPool();
  const base = {
    eyebrow: 'My classes', title: 'Class results and follow-up',
    description: 'Results for the classes you teach, shown as indicators for review, not as a rating.',
    queueTitle: 'Your classes in the latest calculation', sample: false,
  };
  const link = await pool.query<{ teacher_id: number | null }>('SELECT teacher_id FROM app_users WHERE id = $1', [user.id]);
  const teacherId = link.rows[0]?.teacher_id ?? null;
  const actions = await pool.query<{ open: number; due_soon: number }>(
    `SELECT count(*)::int AS open, count(*) FILTER (WHERE due_date <= CURRENT_DATE + 7)::int AS due_soon
       FROM intervention WHERE owner_user_id = $1 AND status IN ('planned', 'in_progress')`,
    [user.id],
  );
  const actionMetric = {
    label: 'Actions assigned to you', value: String(actions.rows[0].open),
    detail: `${actions.rows[0].due_soon} due within 7 days`, tone: actions.rows[0].due_soon ? 'metric-gold' : undefined,
  };
  if (teacherId === null) {
    return {
      ...base, metrics: [actionMetric], queue: [],
      queueEmpty: 'Your account is not linked to a teacher record yet. Ask the system administrator to link it.',
    };
  }

  const classes = await pool.query<{ code: string; section: string; title: string; students: number; failed: number; term: string; period: string }>(
    `WITH latest AS (
       SELECT r.run_id FROM snapshot_run r
        WHERE EXISTS (SELECT 1 FROM teacher_result_snapshot trs JOIN teaching_assignment ta ON ta.assignment_id = trs.assignment_id
                       WHERE trs.run_id = r.run_id AND ta.teacher_id = $1)
        ORDER BY r.calculated_at DESC LIMIT 1)
     SELECT c.code, o.section, c.title, trs.student_count AS students, trs.failed_count AS failed, t.code AS term, gp.code AS period
       FROM latest
       JOIN snapshot_run r ON r.run_id = latest.run_id
       JOIN term t ON t.term_id = r.term_id
       JOIN grading_period gp ON gp.grading_period_id = r.grading_period_id
       JOIN teacher_result_snapshot trs ON trs.run_id = r.run_id
       JOIN teaching_assignment ta ON ta.assignment_id = trs.assignment_id AND ta.teacher_id = $1
       JOIN course_offering o ON o.offering_id = ta.offering_id
       JOIN course c ON c.course_id = o.course_id
      ORDER BY c.code, o.section`,
    [teacherId],
  );
  const rows = classes.rows;
  const students = rows.reduce((n, r) => n + r.students, 0);
  const failed = rows.reduce((n, r) => n + r.failed, 0);
  return {
    ...base,
    metrics: [
      { label: 'Classes', value: String(rows.length), detail: rows[0] ? `${rows[0].term} ${rows[0].period}` : 'No calculated results yet' },
      { label: 'Students counted', value: String(students), detail: 'Graded students in your classes' },
      { label: 'Failed', value: `${failed} (${failureRate(failed, students)}%)`, detail: 'Indicator for review only' },
      actionMetric,
    ],
    queueEmpty: 'No calculated results include your classes yet.',
    queue: rows.map((r) => ({
      title: `${r.code} · section ${r.section}`,
      detail: `${r.title} · ${r.failed} of ${r.students} failed (${failureRate(r.failed, r.students)}%)`,
      status: `${r.term} ${r.period}`,
    })),
  };
}

/** ALC, SSP and KSH: referrals sent to the team, within the user's campus scope. */
export async function teamDashboard(user: AuthUser, team: ReferralTeam): Promise<RoleDashboardContent> {
  const pool = getPool();
  const campuses = user.scopes.map((s) => s.campus);
  const params = [team, campuses.includes(null), campuses.filter((c): c is string => c !== null)];
  const scope = `rt.code = $1 AND ($2 OR cam.code = ANY($3::text[]))`;
  const [counts, open, mine] = await Promise.all([
    pool.query<{ status: string; count: number }>(
      `SELECT r.status, count(*)::int AS count
         FROM referral r JOIN referral_team rt ON rt.referral_team_id = r.referral_team_id
         JOIN concern c ON c.concern_id = r.concern_id JOIN campus cam ON cam.campus_id = c.campus_id
        WHERE ${scope} GROUP BY r.status`,
      params,
    ),
    pool.query<{ concern_id: number; referral_date: string; status: string; type: string; context: string }>(
      `SELECT c.concern_id, to_char(r.referral_date, 'YYYY-MM-DD') AS referral_date, r.status, ct.name AS type,
              COALESCE(st.last_name || ', ' || st.first_name, crs.code || ' · ' || o.section, 'Concern') AS context
         FROM referral r JOIN referral_team rt ON rt.referral_team_id = r.referral_team_id
         JOIN concern c ON c.concern_id = r.concern_id JOIN campus cam ON cam.campus_id = c.campus_id
         JOIN concern_type ct ON ct.concern_type_id = c.concern_type_id
         LEFT JOIN student st ON st.student_id = c.student_id
         LEFT JOIN course_offering o ON o.offering_id = c.offering_id
         LEFT JOIN course crs ON crs.course_id = o.course_id
        WHERE ${scope} AND r.status <> 'closed'
        ORDER BY (r.status = 'sent') DESC, r.referral_date, r.referral_id LIMIT 8`,
      params,
    ),
    pool.query<{ open: number; overdue: number }>(
      `SELECT count(*)::int AS open, count(*) FILTER (WHERE due_date < CURRENT_DATE)::int AS overdue
         FROM intervention WHERE owner_user_id = $1 AND status IN ('planned', 'in_progress')`,
      [user.id],
    ),
  ]);
  const by = Object.fromEntries(counts.rows.map((r) => [r.status, r.count]));
  const names: Record<ReferralTeam, { eyebrow: string; title: string; description: string }> = {
    ALC: { eyebrow: 'Teaching support', title: 'Active learning referrals', description: 'Teaching-related concerns referred to the ALC, with the supporting evidence.' },
    SSP: { eyebrow: 'Student support', title: 'Student success referrals', description: 'Attendance and other student-success referrals sent to SSP advisers.' },
    KSH: { eyebrow: 'Restricted support', title: 'Kasama Support Hub', description: 'Permit and non-academic referrals. Restricted notes are visible only to authorized roles.' },
  };
  return {
    ...names[team],
    metrics: [
      { label: 'New referrals', value: String(by.sent ?? 0), detail: 'Not yet acknowledged', tone: by.sent ? 'metric-gold' : undefined },
      { label: 'In progress', value: String((by.acknowledged ?? 0) + (by.in_progress ?? 0)), detail: 'Acknowledged or being worked on' },
      { label: 'Closed', value: String(by.closed ?? 0), detail: 'Referrals completed', tone: 'metric-green' },
      { label: 'Actions assigned to you', value: String(mine.rows[0].open), detail: `${mine.rows[0].overdue} overdue`, tone: mine.rows[0].overdue ? 'metric-red' : undefined },
    ],
    queueTitle: 'Open referrals',
    queueEmpty: 'No open referrals for your team.',
    queue: open.rows.map((r) => ({
      title: `${r.context} · ${r.type}`,
      detail: `Referred ${r.referral_date}`,
      status: r.status === 'sent' ? 'New' : r.status === 'acknowledged' ? 'Acknowledged' : 'In progress',
      href: `/deliberation/${r.concern_id}`,
    })),
    sample: false,
  };
}
