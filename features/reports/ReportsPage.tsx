import { ZONES, ZONE_LABEL } from '@/lib/zones';
import { zoneRates, type ResultSelection, type ZoneCounts } from '@/lib/results/types';
import type { ProgramReport } from '@/lib/results/server';

type Props = {
  selection: ResultSelection & { programs: 'all' | string[] };
  programOptions: string[];
  report: ProgramReport;
  canExport: boolean;
  sample: boolean;
};

function CountsCells({ counts, total, bold }: { counts: ZoneCounts; total: number; bold?: boolean }) {
  const rates = zoneRates(counts, total);
  return (
    <>
      {ZONES.map((z) => (
        <td key={z} className="td">
          {counts[z]} <span className={`${bold ? 'font-normal' : ''} text-ink-muted`}>({rates[z]}%)</span>
        </td>
      ))}
    </>
  );
}

type Counted = { total: number; counts: ZoneCounts };

/** Share of each zone per period and its change from the previous period, as in the SLC workbook. */
function TrendTable({ trend }: { trend: ProgramReport['trend'] }) {
  const levels: { key: 'students' | 'subjects' | 'teachers'; label: string }[] = [
    { key: 'students', label: 'Students' }, { key: 'subjects', label: 'Subject sections' }, { key: 'teachers', label: 'Teachers' },
  ];
  const share = (c: Counted | undefined, z: keyof ZoneCounts) => (c && c.total ? (c.counts[z] / c.total) * 100 : 0);
  return (
    <article className="card">
      <h2 className="text-base font-semibold">Period trend</h2>
      <p className="mb-2 mt-0.5 text-sm text-ink-muted">
        Share of each zone per period, with the change from the previous period in percentage points. More Green or less Red is an improvement.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr><th className="th">Level</th><th className="th">Period</th><th className="th">Total</th>{ZONES.map((z) => <th key={z} className="th">{ZONE_LABEL[z]}</th>)}</tr>
          </thead>
          <tbody>
            {levels.filter((l) => trend.some((t) => t[l.key])).map((level) => trend.map((t, i) => {
              const now = t[level.key];
              const before = i > 0 ? trend[i - 1][level.key] : undefined;
              return (
                <tr key={`${level.key}-${t.period}`} className={`border-t ${i === 0 ? 'border-surface-border' : 'border-surface-line'}`}>
                  <td className="td font-semibold">{i === 0 ? level.label : ''}</td>
                  <td className="td">{t.period}</td>
                  <td className="td">{now?.total ?? 0}</td>
                  {ZONES.map((z) => {
                    const value = share(now, z);
                    const delta = before ? value - share(before, z) : null;
                    const good = delta !== null && delta !== 0 && ((z === 'green') === (delta > 0));
                    return (
                      <td key={z} className="td">
                        {now?.counts[z] ?? 0} <span className="text-ink-muted">({value.toFixed(1)}%)</span>
                        {delta !== null && Math.abs(delta) >= 0.05 && (
                          <span className={`ml-1 text-xs font-semibold ${good ? 'text-zone-green-fg' : 'text-zone-red-fg'}`}>
                            {delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(1)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default function ReportsPage({ selection, programOptions, report, canExport, sample }: Props) {
  const totals = report.programs.reduce(
    (acc, p) => {
      for (const z of ZONES) acc.counts[z] += p.counts[z];
      acc.total += p.total;
      return acc;
    },
    { total: 0, counts: { green: 0, yellow: 0, red: 0 } as ZoneCounts },
  );
  const hidden = {
    campus: selection.campus ?? '', term: selection.term ?? '', period: selection.period, type: report.type, program: report.programFilter,
  };
  const outcome = report.outcome;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">Reports</h1>
          <p className="mt-1.5 text-ink-muted">Periodic and semester reports, limited to what your role is allowed to see</p>
        </div>
        {canExport && report.run && (
          <form method="post" action="/api/reports/export">
            {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <button type="submit" className="btn btn-primary">Export CSV</button>
          </form>
        )}
      </header>

      <form method="get" action="/reports" className="card" aria-label="Report filters">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-sm font-semibold">
            Report type
            <select name="type" className="field mt-1" defaultValue={report.type}>
              <option value="periodic">Periodic</option>
              <option value="semester">Semester</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Campus
            <select name="campus" className="field mt-1" defaultValue={selection.campus ?? ''}>
              {selection.campuses.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Term
            <select name="term" className="field mt-1" defaultValue={selection.term ?? ''}>
              {selection.terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Period
            <select name="period" className="field mt-1" defaultValue={selection.period}>
              {selection.periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Program
            <select name="program" className="field mt-1" defaultValue={report.programFilter}>
              {selection.programs === 'all' && <option value="all">All programs</option>}
              {selection.programs !== 'all' && selection.programs.length > 1 && <option value="all">All my programs</option>}
              {programOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <div className="flex items-end"><button type="submit" className="btn w-full">Apply</button></div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">A semester report uses the latest period calculated in the term.</p>
      </form>

      {!report.run ? (
        <section className="card p-6 text-center">
          <h2 className="text-base font-semibold">No zone results for this selection yet</h2>
          <p className="mt-1 text-sm text-ink-muted">Results appear after the grades are imported and zones are calculated for the period.</p>
        </section>
      ) : (
        <>
          <article className="card">
            <h2 className="text-base font-semibold">Student zones by program</h2>
            <p className="mb-2 mt-0.5 text-sm text-ink-muted">
              {report.run.campusName} · {report.run.term} {report.run.period} · rule set {report.run.ruleSet}.
              Each cell shows the count, then its share of the program, so small groups are not overstated.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr><th className="th">Program</th><th className="th">Students</th>{ZONES.map((z) => <th key={z} className="th">{ZONE_LABEL[z]}</th>)}</tr>
                </thead>
                <tbody>
                  {report.programs.map((r) => (
                    <tr key={r.program} className="border-t border-surface-line">
                      <td className="td font-semibold">{r.program}</td>
                      <td className="td">{r.total}</td>
                      <CountsCells counts={r.counts} total={r.total} />
                    </tr>
                  ))}
                  {report.programs.length > 1 && (
                    <tr className="border-t-2 border-surface-border bg-surface-soft font-semibold">
                      <td className="td">All shown</td>
                      <td className="td">{totals.total}</td>
                      <CountsCells counts={totals.counts} total={totals.total} bold />
                    </tr>
                  )}
                  {report.programs.length === 0 && (
                    <tr><td className="td text-ink-muted" colSpan={5}>No students in this selection.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {report.yearLevels.length > 0 && (
            <article className="card">
              <h2 className="text-base font-semibold">Student zones by year level</h2>
              <p className="mb-2 mt-0.5 text-sm text-ink-muted">Year level comes from the SIS SEMESTER column (Y2S2 = year 2).</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr><th className="th">Year level</th><th className="th">Students</th>{ZONES.map((z) => <th key={z} className="th">{ZONE_LABEL[z]}</th>)}</tr></thead>
                  <tbody>
                    {report.yearLevels.map((y) => (
                      <tr key={y.yearLevel} className="border-t border-surface-line">
                        <td className="td font-semibold">Year {y.yearLevel}</td>
                        <td className="td">{y.total}</td>
                        <CountsCells counts={y.counts} total={y.total} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          {report.trend.length > 0 && <TrendTable trend={report.trend} />}

          <section className="grid gap-4 md:grid-cols-3">
            <article className="card">
              <p className="text-sm text-ink-muted">Subject sections in the Red zone</p>
              <p className="mt-1 text-3xl font-bold tracking-tight">{report.subjects.counts.red}</p>
              <p className="text-sm text-ink-muted">
                of {report.subjects.total} · {report.subjects.counts.yellow} Yellow · {report.subjects.counts.green} Green
              </p>
            </article>
            <article className="card">
              <p className="text-sm text-ink-muted">Outcome review</p>
              {outcome ? (
                <>
                  <p className="mt-1 text-3xl font-bold tracking-tight">{outcome.nowGreen} <span className="text-base font-normal text-ink-muted">of {outcome.flaggedBefore}</span></p>
                  <p className="text-sm text-ink-muted">
                    students in Yellow or Red at {outcome.previousPeriod} are now Green. {outcome.improved} moved from Red to Yellow,
                    {' '}{outcome.unchanged} unchanged, {outcome.worse} moved to Red{outcome.noCurrentResult ? `, ${outcome.noCurrentResult} have no result this period` : ''}.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xl font-bold tracking-tight">Needs an earlier period</p>
                  <p className="text-sm text-ink-muted">Movement out of Red or Yellow is shown once an earlier period of this term has been calculated.</p>
                </>
              )}
            </article>
            {report.teachers ? (
              <article className="card">
                <p className="text-sm text-ink-muted">Teachers in the Red zone</p>
                <p className="mt-1 text-3xl font-bold tracking-tight">{report.teachers.counts.red}</p>
                <p className="text-sm text-ink-muted">
                  of {report.teachers.total} · {report.teachers.counts.yellow} Yellow · {report.teachers.counts.green} Green
                </p>
              </article>
            ) : (
              <article className="card">
                <p className="text-sm text-ink-muted">Targets</p>
                <p className="mt-1 text-base font-semibold">Set after PHINMA confirms them</p>
                <p className="text-sm text-ink-muted">Progress toward Green (P1, P2) and passing the Common Final Examination (P3).</p>
              </article>
            )}
          </section>
        </>
      )}

      {report.campuses && (
        <article className="card">
          <h2 className="text-base font-semibold">Campus comparison</h2>
          <p className="mb-2 mt-0.5 text-sm text-ink-muted">Latest calculation per campus for {selection.term}, using the same zone definitions and denominators.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr><th className="th">Campus</th><th className="th">Period</th><th className="th">Students</th>{ZONES.map((z) => <th key={z} className="th">{ZONE_LABEL[z]}</th>)}</tr></thead>
              <tbody>
                {report.campuses.map((c) => (
                  <tr key={c.campus} className="border-t border-surface-line">
                    <td className="td font-semibold">{c.name}</td>
                    <td className="td">{c.period ?? 'Not calculated'}</td>
                    <td className="td">{c.total}</td>
                    <CountsCells counts={c.counts} total={c.total} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {sample && <p className="text-xs text-ink-muted">Demo accounts see no stored results. Sign in with a database account to use reports.</p>}
    </div>
  );
}
