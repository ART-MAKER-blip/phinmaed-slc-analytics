import { getCurrentUser } from '@/lib/auth';
import { getRoleLabel } from '@/lib/roles';
import { PasswordForm } from '@/features/admin/PasswordForm';

export default async function Page() {
  const user = (await getCurrentUser())!;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Account</h1>
        <p className="mt-1.5 text-sm text-ink-muted">{user.name} · {user.email}</p>
      </header>
      <section className="card p-4">
        <h2 className="text-base font-semibold">Your access</h2>
        <p className="mb-2 mt-0.5 text-xs text-ink-muted">Assigned by a system administrator.</p>
        <ul className="text-sm">
          {user.roles.map((r) => <li key={r}>{getRoleLabel(r)}</li>)}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">
          Scope: {user.scopes.map((s) => `${s.campus ?? 'all campuses'}${s.campus ? ` · ${s.program ?? 'all programs'}` : ''}`).join('; ') || 'none'}
        </p>
      </section>
      <section className="card p-4">
        <h2 className="mb-3 text-base font-semibold">Change password</h2>
        {user.isDemo ? <p className="text-sm text-ink-muted">Demo accounts use a fixed password.</p> : <PasswordForm />}
      </section>
    </div>
  );
}
