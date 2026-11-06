'use client';

import { useMemo, useState } from 'react';
import { ZoneChip } from '@/components/ZoneChip';
import { FLAGGED_STUDENTS, REFERRAL_TEAMS, ROLES } from '@/lib/data';
import { studentZone } from '@/lib/zones';

type Filter = 'All' | 'Academic' | 'Non-academic';

export default function DeliberationPage() {
  const [filter, setFilter] = useState<Filter>('All');
  const [selectedId, setSelectedId] = useState(FLAGGED_STUDENTS[0].id);
  const [roleId, setRoleId] = useState<(typeof ROLES)[number]['id']>('slc');
  const [referralTo, setReferralTo] = useState<string>(REFERRAL_TEAMS[1]);
  const [saved, setSaved] = useState('');

  const list = useMemo(
    () => FLAGGED_STUDENTS.filter((s) => filter === 'All' || s.concern === filter).slice(0, 12),
    [filter],
  );
  const student = FLAGGED_STUDENTS.find((s) => s.id === selectedId) ?? FLAGGED_STUDENTS[0];
  const role = ROLES.find((r) => r.id === roleId) ?? ROLES[0];

  const chip = (f: Filter) => (
    <button
      key={f}
      type="button"
      aria-pressed={filter === f}
      onClick={() => {
        setFilter(f);
        const first = FLAGGED_STUDENTS.find((s) => f === 'All' || s.concern === f);
        if (first) setSelectedId(first.id);
      }}
      className={`min-h-[44px] rounded-full border px-4 font-semibold ${
        filter === f ? 'border-navy bg-navy text-white' : 'border-[#C9CFDB] bg-white text-ink'
      }`}
    >
      {f}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">Deliberation</h1>
          <p className="mt-1.5 text-ink-muted">Record concerns, evidence, agreed actions and referrals for each student</p>
        </div>
        <div className="w-full sm:w-72">
          <label htmlFor="role" className="mb-1 block text-sm font-semibold">Preview as</label>
          <select id="role" className="field" value={roleId} onChange={(e) => setRoleId(e.target.value as typeof roleId)}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </header>

      <section className="grid items-start gap-4 xl:grid-cols-5">
        <article className="card flex flex-col gap-3 xl:col-span-2">
          <h2 className="text-base font-semibold">Students for deliberation</h2>
          <div role="group" aria-label="Filter by concern type" className="flex flex-wrap gap-2">
            {(['All', 'Academic', 'Non-academic'] as Filter[]).map(chip)}
          </div>
          <ul className="flex flex-col gap-2">
            {list.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={s.id === student.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left ${
                    s.id === student.id ? 'border-2 border-navy bg-navy-tint' : 'border-surface-border bg-white'
                  }`}
                >
                  <span>
                    <span className="block font-semibold">{s.id}</span>
                    <span className="block text-xs text-ink-muted">{s.program} · {s.concern} · {s.failedSubjects} failed subject{s.failedSubjects > 1 ? 's' : ''}</span>
                  </span>
                  <ZoneChip zone={studentZone(s.failedSubjects)} />
                </button>
              </li>
            ))}
          </ul>
        </article>

        <form
          className="card flex flex-col gap-5 xl:col-span-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(`Saved for ${student.id} (prototype only, nothing is stored).`);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{student.id}</h2>
              <p className="text-ink-muted">{student.program} · Year {student.yearLevel} · {student.concern} concern</p>
            </div>
            <ZoneChip zone={studentZone(student.failedSubjects)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="concern" className="mb-1 block text-sm font-semibold">Concern raised</label>
              <textarea id="concern" rows={2} className="field py-2" placeholder="What is the concern?" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="evidence" className="mb-1 block text-sm font-semibold">Evidence reviewed</label>
              <textarea id="evidence" rows={2} className="field py-2" placeholder="Grades, attendance or other records that were reviewed" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="decision" className="mb-1 block text-sm font-semibold">Agreed action</label>
              <textarea id="decision" rows={2} className="field py-2" placeholder="What did the group decide?" />
            </div>
            <div>
              <label htmlFor="owner" className="mb-1 block text-sm font-semibold">Owner</label>
              <select id="owner" className="field" defaultValue="slc">
                <option value="slc">Student Learning Coordinator</option>
                <option value="dean">Dean / Program Head</option>
                <option value="teacher">Faculty</option>
                <option value="alc">Active Learning Coordinator</option>
              </select>
            </div>
            <div>
              <label htmlFor="due" className="mb-1 block text-sm font-semibold">Due date</label>
              <input id="due" type="date" className="field" />
            </div>
          </div>

          <fieldset className="rounded-xl border border-surface-border p-4">
            <legend className="px-1 text-sm font-semibold">Referral</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="to" className="mb-1 block text-sm font-semibold">Refer to</label>
                <select id="to" className="field" value={referralTo} onChange={(e) => setReferralTo(e.target.value)}>
                  {REFERRAL_TEAMS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="status" className="mb-1 block text-sm font-semibold">Status</label>
                <select id="status" className="field" defaultValue="Open">
                  <option>Open</option><option>Accepted</option><option>In progress</option><option>Closed</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="restricted" className="mb-1 block text-sm font-semibold">Restricted note</label>
                {role.canSeeRestricted ? (
                  <textarea id="restricted" rows={2} className="field py-2" placeholder="Visible only to roles with permission" />
                ) : (
                  <p id="restricted" className="rounded-xl bg-surface-soft px-3 py-3 text-sm text-ink-soft">
                    Hidden for {role.label}. Only the fact, date, destination and status of the referral are visible.
                  </p>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Counseling records and detailed case files stay outside this system. Only the referral itself is recorded.
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" aria-live="polite" className="text-sm font-semibold text-zone-green-fg">{saved}</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn">Add follow-up</button>
              <button type="submit" className="btn btn-primary">Save record</button>
            </div>
          </div>
        </form>
      </section>

      <p className="text-xs text-ink-muted">Sample data for a UI prototype. Students are placeholders, and the form does not store anything yet.</p>
    </div>
  );
}
