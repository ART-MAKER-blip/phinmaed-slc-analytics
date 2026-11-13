'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLES, type RoleId } from '@/lib/roles';

type Assignment = { role: RoleId; campus: string; program: string };
type Options = {
  campuses: { code: string; name: string }[];
  programs: { code: string; name: string }[];
  teachers: { staff_no: string; name: string; linked: string | null }[];
};
type Existing = {
  id: string; name: string; email: string; active: boolean; teacher_staff_no: string | null;
  assignments: { role: RoleId; campus: string | null; program: string | null }[];
};

async function post(url: string, body: unknown) {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, data, error: typeof data.error === 'string' ? data.error : 'The request failed. Please try again.' };
  } catch {
    return { ok: false, data: {}, error: 'Unable to reach the server. Check your connection and try again.' };
  }
}

/** Shows a one-time password with a copy button; it is not stored anywhere readable. */
export function OneTimePassword({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-lg border border-zone-green bg-zone-green-bg p-4 text-sm text-zone-green-fg">
      <p className="font-semibold">Temporary password for {email}</p>
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded bg-white px-2 py-1 text-base font-bold text-ink">{password}</code>
        <button type="button" className="btn min-h-[34px] px-3 text-xs" onClick={() => { void navigator.clipboard?.writeText(password); setCopied(true); }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </p>
      <p className="mt-2 text-xs">It is shown only once. Give it to the user privately and ask them to change it on their Account page after signing in.</p>
    </div>
  );
}

export function UserForm({ options, existing }: { options: Options; existing?: Existing }) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [teacher, setTeacher] = useState(existing?.teacher_staff_no ?? '');
  const [rows, setRows] = useState<Assignment[]>(
    existing?.assignments.map((a) => ({ role: a.role, campus: a.campus ?? '', program: a.program ?? '' }))
      ?? [{ role: 'slc', campus: options.campuses[0]?.code ?? '', program: '' }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [password, setPassword] = useState<{ email: string; value: string } | null>(null);

  const update = (index: number, change: Partial<Assignment>) =>
    setRows((current) => current.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...change };
      if (next.campus === '') next.program = '';
      return next;
    }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved('');
    const body = { name, email, active, teacherStaffNo: teacher || null, assignments: rows };
    const result = existing
      ? await post(`/api/admin/users/${existing.id}`, { action: 'update', ...body })
      : await post('/api/admin/users', body);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (existing) {
      setSaved('Saved.');
      router.refresh();
    } else {
      setPassword({ email, value: String(result.data.temporaryPassword) });
      setName(''); setEmail(''); setTeacher('');
      router.refresh();
    }
  }

  async function reset() {
    if (!existing || !window.confirm(`Reset the password for ${existing.email}? They will be signed out everywhere.`)) return;
    setBusy(true);
    setError('');
    const result = await post(`/api/admin/users/${existing.id}`, { action: 'reset_password' });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setPassword({ email: existing.email, value: String(result.data.temporaryPassword) });
  }

  return (
    <div className="flex flex-col gap-3">
      {password && <OneTimePassword email={password.email} password={password.value} />}
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Name<input className="field mt-1" value={name} onChange={(e) => setName(e.currentTarget.value)} required minLength={2} maxLength={120} /></label>
        <label className="text-xs font-semibold">Work email<input type="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required /></label>
        <label className="text-xs font-semibold">
          Linked teacher record (for faculty results)
          <select className="field mt-1" value={teacher} onChange={(e) => setTeacher(e.currentTarget.value)}>
            <option value="">Not linked</option>
            {options.teachers.map((t) => (
              <option key={t.staff_no} value={t.staff_no} disabled={Boolean(t.linked) && t.linked !== existing?.id}>
                {t.name} ({t.staff_no}){t.linked && t.linked !== existing?.id ? ' · linked to another account' : ''}
              </option>
            ))}
          </select>
        </label>
        {existing && (
          <label className="flex items-center gap-2 self-end text-sm font-semibold">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} /> Account active
          </label>
        )}

        <fieldset className="sm:col-span-2">
          <legend className="text-xs font-semibold">Roles and scope</legend>
          <p className="mb-2 text-xs text-ink-muted">Each row grants a role at a campus, for all programs or one program. Add rows to cover several programs.</p>
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-surface-border p-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                <label className="text-xs">
                  <span className="sr-only">Role</span>
                  <select className="field" value={row.role} onChange={(e) => update(i, { role: e.currentTarget.value as RoleId })}>
                    {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="sr-only">Campus</span>
                  <select className="field" value={row.campus} onChange={(e) => update(i, { campus: e.currentTarget.value })}>
                    <option value="">All campuses</option>
                    {options.campuses.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="sr-only">Program</span>
                  <select className="field" value={row.program} disabled={row.campus === ''} onChange={(e) => update(i, { program: e.currentTarget.value })}>
                    <option value="">All programs</option>
                    {options.programs.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}
                  </select>
                </label>
                <button type="button" className="btn min-h-[40px] px-3 text-xs" disabled={rows.length === 1}
                  onClick={() => setRows((current) => current.filter((_, j) => j !== i))} aria-label={`Remove role row ${i + 1}`}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn mt-2 min-h-[36px] text-xs"
            onClick={() => setRows((current) => [...current, { role: current[current.length - 1]?.role ?? 'slc', campus: options.campuses[0]?.code ?? '', program: '' }])}>
            Add role or scope
          </button>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={busy} className="btn btn-primary min-h-[40px] text-sm disabled:opacity-60">
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Create account'}
          </button>
          {existing && <button type="button" disabled={busy} className="btn min-h-[40px] text-sm" onClick={reset}>Reset password</button>}
          {saved && <span role="status" className="text-sm font-semibold text-zone-green-fg">{saved}</span>}
          {error && <p role="alert" className="w-full text-sm font-semibold text-red-700">{error}</p>}
        </div>
      </form>
    </div>
  );
}
