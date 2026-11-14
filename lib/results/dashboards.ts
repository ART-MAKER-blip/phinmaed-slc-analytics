import 'server-only';
import { getPool } from '@/lib/db';
import type { RoleDashboardContent } from './types';

const date = (value: Date) =>
  new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

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
