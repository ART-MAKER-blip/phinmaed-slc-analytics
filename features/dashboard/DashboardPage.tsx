import Link from 'next/link';
import { ZoneChip, ZONE_SOLID } from '@/components/ZoneChip';
import { FLAGGED_STUDENTS, STUDENTS, subjectRows, teacherIndicators } from '@/lib/data';
import { DEFAULT_RULES, ZONES, ZONE_LABEL, studentZone, summarize } from '@/lib/zones';

const STUDENT_RULE_TEXT = ['0 failed subjects', '1 failed subject', '2 or more failed subjects'];
const SUBJECT_RULE_TEXT = ['0 to 10% failed', '10.01 to 40% failed', '40.01 to 100% failed'];

function ZoneSummary({
  title,
  unit,
  summary,
  rules,
}: {
  title: string;
  unit: string;
  summary: ReturnType<typeof summarize>;
  rules: string[];
}) {
  return (
    <article className="card flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">Counts and rates are shown together</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight">{summary.total}</span>
        <span className="text-ink-muted">{unit}</span>
      </div>
      <div className="flex h-7 gap-[3px]" role="img" aria-label={ZONES.map((z) => `${ZONE_LABEL[z]} ${summary.counts[z]}`).join(', ')}>
        {ZONES.map((z) => (
          <div
            key={z}
            style={{ flex: `${summary.counts[z] || 0.0001} 1 0` }}
            className={`flex min-w-[28px] items-center justify-center rounded-md text-sm font-bold ${ZONE_SOLID[z]}`}
          >
            {summary.counts[z]}
          </div>
        ))}
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        {ZONES.map((z, i) => (
          <div key={z} className="flex items-center gap-2">
            <dt className="w-14 font-semibold">{ZONE_LABEL[z]}</dt>
            <dd className="flex-1 text-ink-muted">{rules[i]}</dd>
            <dd className="font-semibold">
              {summary.counts[z]} <span className="font-normal text-ink-muted">({summary.rates[z]}%)</span>
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export default function DashboardPage() {
  const studentSummary = summarize(STUDENTS, (s) => studentZone(s.failedSubjects));
  const subjectSummary = summarize(subjectRows, (s) => s.zone);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">Zone overview</h1>
          <p className="mt-1.5 text-ink-muted">PHINMA COC · Term 2026-1 · Period 1 grade review</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-navy-tint px-3 py-1.5 text-xs font-semibold text-navy-dark">
            Rule set {DEFAULT_RULES.id} · effective {DEFAULT_RULES.effectiveTerm}
          </span>
          <Link href="/reports" className="btn btn-primary">Generate report</Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Zone summaries">
        <ZoneSummary title="Student zones" unit="students" summary={studentSummary} rules={STUDENT_RULE_TEXT} />
        <ZoneSummary title="Subject zones" unit="subjects" summary={subjectSummary} rules={SUBJECT_RULE_TEXT} />
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-5">
        <article className="card xl:col-span-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Students in Yellow and Red zones</h2>
            <Link href="/deliberation" className="inline-flex min-h-[44px] items-center font-semibold text-navy">Open deliberation</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr><th className="th">Student</th><th className="th">Program</th><th className="th">Year</th><th className="th">Failed subjects</th><th className="th">Zone</th></tr>
              </thead>
              <tbody>
                {FLAGGED_STUDENTS.slice(0, 8).map((s) => (
                  <tr key={s.id} className="border-t border-surface-line">
                    <td className="td font-semibold">{s.id}</td>
                    <td className="td">{s.program}</td>
                    <td className="td">{s.yearLevel}</td>
                    <td className="td">{s.failedSubjects}</td>
                    <td className="td"><ZoneChip zone={studentZone(s.failedSubjects)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-muted">Showing 8 of {FLAGGED_STUDENTS.length} flagged students.</p>
        </article>

        <article className="card xl:col-span-2">
          <h2 className="text-base font-semibold">Subject results</h2>
          <p className="mb-2 mt-0.5 text-sm text-ink-muted">Failed students out of enrolled</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead><tr><th className="th">Subject</th><th className="th">Failed / enrolled</th><th className="th">Rate</th><th className="th">Zone</th></tr></thead>
              <tbody>
                {subjectRows.slice(0, 6).map((s) => (
                  <tr key={s.code} className="border-t border-surface-line">
                    <td className="td font-semibold">{s.code}</td>
                    <td className="td">{s.failed} / {s.enrolled}</td>
                    <td className="td">{s.rate}%</td>
                    <td className="td"><ZoneChip zone={s.zone} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <article className="card">
        <h2 className="text-base font-semibold">Teacher-level indicators for review</h2>
        <p className="mb-3 mt-0.5 text-sm text-ink-muted">
          These results are indicators for review and support. They are not a rating or ranking of teachers, and a high failure
          rate is not treated as a teaching or content problem.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr><th className="th">Teacher</th><th className="th">Classes</th><th className="th">Enrolled</th><th className="th">Failed</th><th className="th">Failure rate</th></tr></thead>
            <tbody>
              {teacherIndicators.slice(0, 6).map((t) => (
                <tr key={t.teacher} className="border-t border-surface-line">
                  <td className="td font-semibold">{t.teacher}</td>
                  <td className="td">{t.classes}</td>
                  <td className="td">{t.enrolled}</td>
                  <td className="td">{t.failed}</td>
                  <td className="td">{t.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-muted">Listed in alphabetical order by placeholder ID.</p>
      </article>

      <p className="text-xs text-ink-muted">Sample data for a UI prototype. Names, counts and rules are placeholders pending confirmation from PHINMA.</p>
    </div>
  );
}
