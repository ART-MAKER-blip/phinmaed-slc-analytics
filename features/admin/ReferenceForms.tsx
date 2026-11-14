'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

type Data = {
  campuses: { code: string; name: string; status: string }[];
  colleges: { code: string; name: string }[];
  programs: { code: string; name: string; college: string }[];
  offered: { campus: string; program: string }[];
  terms: { code: string; name: string; school_year: string; start_date: string | null; end_date: string | null; grade_release_date: string | null }[];
};

function useReference() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function send(body: Record<string, unknown>, success = 'Saved.') {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/reference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) { setMessage({ ok: false, text: data.error ?? 'The request failed.' }); return false; }
      setMessage({ ok: true, text: success });
      router.refresh();
      return true;
    } catch {
      setMessage({ ok: false, text: 'Unable to reach the server.' });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const feedback = message && (
    <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-semibold ${message.ok ? 'text-zone-green-fg' : 'text-red-700'}`}>{message.text}</p>
  );
  return { busy, send, feedback };
}

const values = (form: HTMLFormElement) => Object.fromEntries(new FormData(form).entries());

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mb-3 mt-0.5 text-xs text-ink-muted">{description}</p>
      {children}
    </section>
  );
}

function InlineForm({ action, children, submit, onSubmit }: { action: string; children: ReactNode; submit: string; onSubmit: (body: Record<string, unknown>) => Promise<boolean> }) {
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      if (await onSubmit({ action, ...values(form) })) form.reset();
    }}>
      {children}
      <button type="submit" className="btn min-h-[40px] text-sm">{submit}</button>
    </form>
  );
}

export function ReferenceForms({ data }: { data: Data }) {
  const { busy, send, feedback } = useReference();
  const offered = new Set(data.offered.map((o) => `${o.campus}|${o.program}`));

  return (
    <div className="flex flex-col gap-4" aria-busy={busy}>
      {feedback}
      <Card title="Campuses" description="Codes are fixed once created because imports and reports refer to them.">
        <ul className="mb-3 divide-y divide-surface-line">
          {data.campuses.map((c) => (
            <li key={c.code} className="py-2">
              <InlineForm action="rename_campus" submit="Save" onSubmit={send}>
                <input type="hidden" name="code" value={c.code} />
                <span className="w-16 font-semibold">{c.code}</span>
                <label className="text-xs">Name<input name="name" defaultValue={c.name} className="field mt-1 min-w-[260px]" required /></label>
                <label className="text-xs">Status
                  <select name="status" defaultValue={c.status} className="field mt-1"><option value="active">Active</option><option value="inactive">Inactive</option></select>
                </label>
              </InlineForm>
            </li>
          ))}
        </ul>
        <InlineForm action="add_campus" submit="Add campus" onSubmit={(b) => send(b, 'Campus added.')}>
          <label className="text-xs">Code<input name="code" className="field mt-1 w-28" required placeholder="CEBU" /></label>
          <label className="text-xs">Name<input name="name" className="field mt-1 min-w-[260px]" required /></label>
        </InlineForm>
      </Card>

      <Card title="Colleges" description="Names must match the SIS COLLEGE column exactly (for example, College of Information Technology Education).">
        <ul className="mb-3 divide-y divide-surface-line">
          {data.colleges.map((c) => (
            <li key={c.code} className="py-2">
              <InlineForm action="rename_college" submit="Save" onSubmit={send}>
                <input type="hidden" name="code" value={c.code} />
                <span className="w-16 font-semibold">{c.code}</span>
                <input name="name" defaultValue={c.name} aria-label={`${c.code} name`} className="field min-w-[320px]" required />
              </InlineForm>
            </li>
          ))}
        </ul>
        <InlineForm action="add_college" submit="Add college" onSubmit={(b) => send(b, 'College added.')}>
          <label className="text-xs">Code<input name="code" className="field mt-1 w-28" required placeholder="CAHS" /></label>
          <label className="text-xs">Name as in the SIS<input name="name" className="field mt-1 min-w-[320px]" required /></label>
        </InlineForm>
      </Card>

      <Card title="Programs and where they are offered" description="Program names must match the SIS COURSE column exactly. Imports accept a program only at the campuses that offer it, and a program with students cannot be removed from a campus.">
        <div className="mb-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr><th className="th">Program</th>{data.campuses.map((c) => <th key={c.code} className="th">{c.code}</th>)}</tr></thead>
            <tbody>
              {data.programs.map((p) => (
                <tr key={p.code} className="border-t border-surface-line">
                  <td className="td">
                    <InlineForm action="rename_program" submit="Save" onSubmit={send}>
                      <input type="hidden" name="code" value={p.code} />
                      <span className="w-16 font-semibold">{p.code}<span className="block text-xs font-normal text-ink-muted">{p.college}</span></span>
                      <input name="name" defaultValue={p.name} aria-label={`${p.code} name`} className="field min-w-[240px]" required />
                    </InlineForm>
                  </td>
                  {data.campuses.map((c) => (
                    <td key={c.code} className="td">
                      <input type="checkbox" aria-label={`${p.code} offered at ${c.code}`} disabled={busy}
                        checked={offered.has(`${c.code}|${p.code}`)}
                        onChange={(e) => void send({ action: 'set_offered', campus: c.code, program: p.code, offered: e.currentTarget.checked })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <InlineForm action="add_program" submit="Add program" onSubmit={(b) => send(b, 'Program added. Tick the campuses that offer it.')}>
          <label className="text-xs">College
            <select name="college" className="field mt-1" required>{data.colleges.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
          </label>
          <label className="text-xs">Code<input name="code" className="field mt-1 w-28" required placeholder="BSHM" /></label>
          <label className="text-xs">Name<input name="name" className="field mt-1 min-w-[300px]" required /></label>
        </InlineForm>
      </Card>

      <Card title="Terms" description="Term codes use the form 2025-2 (school year start, then semester 1, 2 or 3 for summer). The SIS SESSION “SY 25-26 SEM II” is term 2025-2.">
        <ul className="mb-3 divide-y divide-surface-line">
          {data.terms.map((t) => (
            <li key={t.code} className="py-2">
              <InlineForm action="update_term" submit="Save" onSubmit={send}>
                <input type="hidden" name="code" value={t.code} />
                <span className="w-20 font-semibold">{t.code}<span className="block text-xs font-normal text-ink-muted">SY {t.school_year}</span></span>
                <label className="text-xs">Name<input name="name" defaultValue={t.name} className="field mt-1 min-w-[220px]" required /></label>
                <label className="text-xs">Start<input type="date" name="startDate" defaultValue={t.start_date ?? ''} className="field mt-1" /></label>
                <label className="text-xs">End<input type="date" name="endDate" defaultValue={t.end_date ?? ''} className="field mt-1" /></label>
                <label className="text-xs">Grade release<input type="date" name="gradeReleaseDate" defaultValue={t.grade_release_date ?? ''} className="field mt-1" /></label>
              </InlineForm>
            </li>
          ))}
        </ul>
        <InlineForm action="add_term" submit="Add term" onSubmit={(b) => send(b, 'Term added.')}>
          <label className="text-xs">Code<input name="code" className="field mt-1 w-28" required placeholder="2027-1" /></label>
          <label className="text-xs">Name<input name="name" className="field mt-1 min-w-[220px]" required placeholder="First Semester 2027-2028" /></label>
          <label className="text-xs">Start<input type="date" name="startDate" className="field mt-1" /></label>
          <label className="text-xs">End<input type="date" name="endDate" className="field mt-1" /></label>
        </InlineForm>
      </Card>
    </div>
  );
}
