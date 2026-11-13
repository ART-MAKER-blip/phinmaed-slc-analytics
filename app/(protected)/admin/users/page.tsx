import Link from 'next/link';
import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/access';
import { adminOptions, listUsers } from '@/lib/admin/server';
import { getRoleLabel } from '@/lib/roles';
import { AdminTabs, demoNotice } from '@/features/admin/AdminTabs';
import { UserForm } from '@/features/admin/UserForm';
import { formatDateTime } from '@/features/imports/shared';

export default async function Page() {
  const denied = await guardRoute('/admin/users');
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  const tabs = <AdminTabs current="users" canUsers canReference={hasPermission(user, 'admin.reference_data')} />;
  if (!process.env.DATABASE_URL || user.isDemo) return <div className="flex flex-col gap-4">{tabs}{demoNotice}</div>;

  const [users, options] = await Promise.all([listUsers(), adminOptions()]);
  return (
    <div className="flex flex-col gap-4">
      {tabs}
      <section className="card p-4" aria-labelledby="new-user">
        <h2 id="new-user" className="mb-3 text-base font-semibold">New account</h2>
        <UserForm options={options} />
      </section>
      <section className="card p-4" aria-labelledby="users-heading">
        <h2 id="users-heading" className="mb-3 text-base font-semibold">Accounts ({users.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr><th className="th">Name</th><th className="th">Roles and scope</th><th className="th">Teacher</th><th className="th">Last sign-in</th><th className="th">Status</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-surface-line align-top">
                  <td className="td"><Link href={`/admin/users/${u.id}`} className="font-semibold text-navy underline">{u.name}</Link><div className="text-xs text-ink-muted">{u.email}</div></td>
                  <td className="td">
                    {u.assignments.length === 0 ? <span className="text-zone-yellow-fg">No role (cannot sign in)</span> : u.assignments.map((a, i) => (
                      <div key={i}>{getRoleLabel(a.role)} <span className="text-xs text-ink-muted">· {a.campus ?? 'all campuses'}{a.campus ? ` · ${a.program ?? 'all programs'}` : ''}</span></div>
                    ))}
                  </td>
                  <td className="td">{u.teacher ?? '—'}</td>
                  <td className="td">{u.last_login ? formatDateTime(u.last_login) : 'Never'}</td>
                  <td className="td">{u.active ? 'Active' : <span className="text-ink-muted">Deactivated</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
