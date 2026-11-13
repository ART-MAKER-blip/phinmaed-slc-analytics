import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { formatDateTime } from '@/features/imports/shared';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Review audit log (use case diagram, System admin). Read-only; the table is append-only. */
export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const denied = await guardRoute('/audit');
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  if (!process.env.DATABASE_URL || user.isDemo) {
    return <p className="rounded-md bg-zone-yellow-bg px-4 py-3 text-sm font-semibold text-zone-yellow-fg">The audit log is stored in the database. Sign in with a database account.</p>;
  }

  const pool = getPool();
  const actions = (await pool.query<{ action: string }>('SELECT DISTINCT action FROM audit_log ORDER BY action')).rows.map((r) => r.action);
  const action = actions.includes(first(searchParams.action) ?? '') ? first(searchParams.action)! : '';
  const entries = await pool.query<{ log_id: string; logged_at: Date; email: string | null; name: string | null; action: string; table_name: string | null; record_id: string | null; change_metadata: unknown }>(
    `SELECT a.log_id, a.logged_at, u.email, u.name, a.action, a.table_name, a.record_id, a.change_metadata
       FROM audit_log a LEFT JOIN app_users u ON u.id = a.user_id
      WHERE ($1 = '' OR a.action = $1)
      ORDER BY a.log_id DESC LIMIT 200`,
    [action],
  );

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Audit log</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Sign-ins, denied access, imports, zone calculations, deliberation records and exports. Entries cannot be edited or deleted.</p>
      </header>
      <form method="get" action="/audit" className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm font-semibold">
          Action
          <select name="action" defaultValue={action} className="field mt-1">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button type="submit" className="btn">Filter</button>
      </form>
      <section className="card p-4">
        <p className="mb-2 text-xs text-ink-muted">Most recent {entries.rows.length} entries.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Record</th><th className="th">Details</th></tr></thead>
            <tbody>
              {entries.rows.map((e) => (
                <tr key={e.log_id} className="border-t border-surface-line align-top">
                  <td className="td whitespace-nowrap">{formatDateTime(e.logged_at)}</td>
                  <td className="td">{e.name ?? '—'}<div className="text-xs text-ink-muted">{e.email}</div></td>
                  <td className="td font-semibold">{e.action}</td>
                  <td className="td">{e.table_name ? `${e.table_name} ${e.record_id ?? ''}` : '—'}</td>
                  <td className="td"><code className="break-all text-xs">{e.change_metadata ? JSON.stringify(e.change_metadata) : ''}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
