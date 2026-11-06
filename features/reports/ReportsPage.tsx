import { STUDENTS, subjectRows } from '@/lib/data';
import { ZONES, ZONE_LABEL, studentZone, summarize } from '@/lib/zones';

const PROGRAMS = ['BSIT', 'BSEd', 'BSBA', 'BSCrim'];

export default function ReportsPage() {
  const rows = PROGRAMS.map((p) => {
    const group = STUDENTS.filter((s) => s.program === p);
    return { program: p, ...summarize(group, (s) => studentZone(s.failedSubjects)) };
  });
  const all = summarize(STUDENTS, (s) => studentZone(s.failedSubjects));
  const redSubjects = subjectRows.filter((s) => s.zone === 'red').length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">Reports</h1>
          <p className="mt-1.5 text-ink-muted">Periodic and semester reports, limited to what your role is allowed to see</p>
        </div>
        <button type="button" className="btn btn-primary">Export report</button>
      </header>

      <section className="card" aria-label="Report filters">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="type" className="mb-1 block text-sm font-semibold">Report type</label>
            <select id="type" className="field" defaultValue="periodic">
              <option value="periodic">Periodic report</option>
              <option value="semester">Semester report</option>
            </select>
          </div>
          <div>
            <label htmlFor="term" className="mb-1 block text-sm font-semibold">Term</label>
            <select id="term" className="field" defaultValue="2026-1"><option>2026-1</option></select>
          </div>
          <div>
            <label htmlFor="campus" className="mb-1 block text-sm font-semibold">Campus</label>
            <select id="campus" className="field" defaultValue="coc">
              <option value="coc">PHINMA COC</option>
              <option disabled>Other campuses (not in pilot data)</option>
            </select>
          </div>
          <div>
            <label htmlFor="program" className="mb-1 block text-sm font-semibold">Program</label>
            <select id="program" className="field" defaultValue="all">
              <option value="all">All programs</option>
              {PROGRAMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </section>

      <article className="card">
        <h2 className="text-base font-semibold">Student zones by program</h2>
        <p className="mb-2 mt-0.5 text-sm text-ink-muted">
          Each cell shows the count first, then its rate of that program. Using counts with rates keeps small groups from looking large.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th className="th">Program</th>
                <th className="th">Students</th>
                {ZONES.map((z) => <th key={z} className="th">{ZONE_LABEL[z]}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.program} className="border-t border-surface-line">
                  <td className="td font-semibold">{r.program}</td>
                  <td className="td">{r.total}</td>
                  {ZONES.map((z) => (
                    <td key={z} className="td">{r.counts[z]} <span className="text-ink-muted">({r.rates[z]}%)</span></td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-surface-border bg-surface-soft font-semibold">
                <td className="td">All programs</td>
                <td className="td">{all.total}</td>
                {ZONES.map((z) => (
                  <td key={z} className="td">{all.counts[z]} <span className="font-normal text-ink-muted">({all.rates[z]}%)</span></td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="card">
          <p className="text-sm text-ink-muted">Subjects in the Red zone</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{redSubjects}</p>
          <p className="text-sm text-ink-muted">of {subjectRows.length} subjects</p>
        </article>
        <article className="card">
          <p className="text-sm text-ink-muted">Outcome review</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">Not yet available</p>
          <p className="text-sm text-ink-muted">Movement out of Red or Yellow needs at least two review periods.</p>
        </article>
        <article className="card">
          <p className="text-sm text-ink-muted">Targets</p>
          <p className="mt-1 text-base font-semibold">Set after PHINMA confirms them</p>
          <p className="text-sm text-ink-muted">Progress toward Green (P1, P2) and passing the Common Final Examination (P3).</p>
        </article>
      </section>

      <p className="text-xs text-ink-muted">Sample data for a UI prototype. Programs and counts are placeholders. The pilot uses PHINMA COC data only.</p>
    </div>
  );
}
