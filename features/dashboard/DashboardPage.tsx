import Link from 'next/link';
import { ZoneChip, ZONE_SOLID } from '@/components/ZoneChip';
import type { RoleId } from '@/lib/roles';
import { ZONES, ZONE_LABEL, type Zone, type ZoneLevel, type ZoneThreshold } from '@/lib/zones';
import { zoneRates, type ResultSelection, type RoleDashboardContent, type ZoneCounts, type ZoneOverview } from '@/lib/results/types';

/* ---- Roles with a metric-and-queue dashboard ---- */

/** Placeholder content for demo logins (no database). */
export const SAMPLE_ROLE_DASHBOARDS: Partial<Record<RoleId, RoleDashboardContent>> = {
  admin: {
    sample: true,
    eyebrow: 'System operations', title: 'Administration',
    description: 'Manage workspace access, role assignments, and effective academic rule sets.',
    metrics: [
      { label: 'Active accounts', value: '84', detail: 'Across 4 roles' },
      { label: 'Access requests', value: '3', detail: 'Awaiting review', tone: 'metric-gold' },
      { label: 'Active rule set', value: 'RS-2026-01', detail: 'Effective Term 2026-1' },
      { label: 'Recent access events', value: '128', detail: 'Recorded this week' },
    ],
    queueTitle: 'Administration tasks', queue: [
      { title: 'Review access requests', detail: '3 requests need role assignment', status: 'Pending' },
      { title: 'Rule set RS-2026-01', detail: 'Current thresholds · Effective 2026-1', status: 'Active' },
      { title: 'Term access review', detail: 'Confirm active campus assignments', status: 'Scheduled' },
    ],
  },
};

export function RoleDashboard({ content, campusName }: { content: RoleDashboardContent; campusName: string }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="role-dashboard-heading">
        <div>
          <p className="eyebrow">{content.eyebrow} <span>·</span> {campusName}</p>
          <h1 className="text-3xl font-bold tracking-tight text-navy">{content.title}</h1>
          <p className="mt-1.5 text-ink-muted">{content.description}</p>
        </div>
      </header>
      <section className="metric-grid" aria-label="Key metrics">
        {content.metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <p className="metric-label">{metric.label}</p>
            <p className={`metric-value ${metric.tone ?? ''}`}>{metric.value}</p>
            <p className="metric-detail">{metric.detail}</p>
          </article>
        ))}
      </section>
      <section className="card role-queue">
        <div className="role-queue-heading">
          <div>
            <h2 className="text-base font-semibold">{content.queueTitle}</h2>
            {content.sample && <p className="mt-1 text-sm text-ink-muted">Sample items for this prototype workspace</p>}
          </div>
        </div>
        <div className="role-queue-list">
          {content.queue.length === 0 && <p className="py-4 text-sm text-ink-muted">{content.queueEmpty ?? 'Nothing here yet.'}</p>}
          {content.queue.map((item) => (
            <article key={`${item.title}-${item.status}`} className="role-queue-item">
              <div>
                <h3>{item.href ? <Link href={item.href} className="underline">{item.title}</Link> : item.title}</h3>
                <p>{item.detail}</p>
              </div>
              <span className="queue-status">{item.status}</span>
            </article>
          ))}
        </div>
      </section>
      {content.sample && <p className="text-xs text-ink-muted">Sample data for demo logins.</p>}
    </div>
  );
}

/* ---- Zone overview (SLC, Dean, COO, Dean of Deans, Team Learning) ---- */

export type OverviewHeading = { eyebrow: string; title: string; description: string };

export const ZONE_HEADINGS: Partial<Record<RoleId, OverviewHeading>> = {
  slc: { eyebrow: 'Student learning', title: 'Zone overview', description: 'Students, subjects and teachers from the latest zone calculation.' },
  tl: { eyebrow: 'Team Learning', title: 'Zone overview', description: 'Zone results to compare across campuses and follow from period to period.' },
  coo: { eyebrow: 'Executive overview', title: 'Student success overview', description: 'Zone results for your campuses. Use Reports for programs, year levels and period trends.' },
};

function rangeText(thresholds: ZoneThreshold[], level: ZoneLevel, zone: Zone) {
  const t = thresholds.find((x) => x.level === level && x.zone === zone);
  if (!t) return '';
  if (level === 'student') {
    if (t.max === null) return `${t.min} or more failed subjects`;
    if (t.min === t.max) return `${t.min} failed subject${t.min === 1 ? '' : 's'}`;
    return `${t.min} to ${t.max} failed subjects`;
  }
  return `${t.min} to ${t.max ?? 100}% failed`;
}

function ZoneSummary({ title, description, unit, counts, total, thresholds, level }: {
  title: string; description: string; unit: string; counts: ZoneCounts; total: number; thresholds: ZoneThreshold[]; level: ZoneLevel;
}) {
  const rates = zoneRates(counts, total);
  return (
    <article className="card flex min-h-[218px] flex-col gap-3 p-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight">{total}</span>
        <span className="text-ink-muted">{unit}</span>
      </div>
      <div className="flex h-7 gap-[3px]" role="img" aria-label={ZONES.map((z) => `${ZONE_LABEL[z]} ${counts[z]}`).join(', ')}>
        {ZONES.map((z) => (
          <div key={z} style={{ flex: `${counts[z] || 0.0001} 1 0` }}
            className={`flex min-w-[28px] items-center justify-center rounded-md text-sm font-bold ${ZONE_SOLID[z]}`}>
            {counts[z]}
          </div>
        ))}
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        {ZONES.map((z) => (
          <div key={z} className="flex items-center gap-2">
            <dt className="w-14 font-semibold">{ZONE_LABEL[z]}</dt>
            <dd className="flex-1 text-ink-muted">{rangeText(thresholds, level, z)}</dd>
            <dd className="font-semibold">{counts[z]} <span className="font-normal text-ink-muted">({rates[z]}%)</span></dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function periodHref(selection: ResultSelection, period: string) {
  const params = new URLSearchParams();
  if (selection.campus) params.set('campus', selection.campus);
  if (selection.term) params.set('term', selection.term);
  params.set('period', period);
  return `/?${params.toString()}`;
}

export function ZoneOverviewDashboard({ overview, selection, heading, canReport }: {
  overview: ZoneOverview;
  selection: ResultSelection;
  heading: OverviewHeading;
  canReport: boolean;
}) {
  const { run, students, subjects, teachers } = overview;
  const scopeText = overview.programs === 'all' ? 'All programs' : overview.programs.join(', ') || 'No programs assigned';
  const campusName = selection.campuses.find((c) => c.value === selection.campus)?.label ?? selection.campus ?? '';

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{heading.eyebrow} <span>·</span> {campusName}</p>
          <h1 className="text-3xl font-bold tracking-tight text-navy">{heading.title}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {selection.term ?? 'No term'} · {selection.period} · {scopeText}
            {run && overview.source === 'live' && <> · rule set {run.ruleSet} · calculated {new Date(run.calculatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <nav className="period-control" aria-label="Grade period">
            {selection.periods.map((p) => (
              <Link key={p.value} href={periodHref(selection, p.value)} aria-current={selection.period === p.value ? 'page' : undefined}
                className={selection.period === p.value ? 'period-button period-button-active' : 'period-button'}>
                {p.label}
              </Link>
            ))}
          </nav>
          {canReport && <Link href="/reports" className="btn btn-primary">Reports <span aria-hidden="true">→</span></Link>}
        </div>
      </header>

      {!run ? (
        <section className="card p-6 text-center">
          <h2 className="text-base font-semibold">No zone results for {selection.term} {selection.period} yet</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Results appear after a data manager imports the grades and runs the zone calculation for this period.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-3 lg:grid-cols-3" aria-label="Zone summaries">
            {subjects && (
              <ZoneSummary title="Subject level" description="Subject sections by share of failed students" unit="subject sections"
                counts={subjects.counts} total={subjects.total} thresholds={overview.thresholds} level="subject" />
            )}
            {students && (
              <ZoneSummary title="Student level" description="Students by number of failed subjects" unit="students"
                counts={students.counts} total={students.total} thresholds={overview.thresholds} level="student" />
            )}
            {teachers && (
              <ZoneSummary title="Teacher level" description="Teachers by share of failed results across their classes" unit="teachers"
                counts={teachers.counts} total={teachers.total} thresholds={overview.thresholds} level="teacher" />
            )}
          </section>

          {students && (
            <article className="card p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                <div><h2 className="text-base font-semibold">Students at risk</h2><p className="mt-0.5 text-xs text-ink-muted">Yellow and Red zones, most failed subjects first</p></div>
              </div>
              {students.atRisk.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-ink-muted">No students are in the Yellow or Red zone.</p>
              ) : (
                <div className="overflow-x-auto px-2">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead><tr><th className="th">Student</th><th className="th">Program · year</th><th className="th">Failed subjects</th><th className="th">Zone</th></tr></thead>
                    <tbody>
                      {students.atRisk.map((s) => (
                        <tr key={s.id} className="border-t border-surface-line">
                          <td className="td"><span className="font-semibold">{s.name}</span>{s.name !== s.id && <><br /><span className="text-xs text-ink-muted">{s.id}</span></>}</td>
                          <td className="td">{s.program} · {s.yearLevel}</td>
                          <td className="td">{s.failed}</td>
                          <td className="td"><ZoneChip zone={s.zone} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-5 pb-4 pt-2 text-xs text-ink-muted">
                Showing {students.atRisk.length} of {students.atRiskTotal} students in Yellow or Red. Based on recorded grades only; no predictive scoring is used.
              </p>
            </article>
          )}

          {subjects && (
            <article className="card p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">Subjects{teachers ? ' and teachers' : ''} to review</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">Highest failure rates first, for the selected period.</p>
                </div>
              </div>
              <div className="overflow-x-auto px-2 pb-2">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr>
                      <th className="th">Subject · section</th>
                      {teachers && <th className="th">Teacher</th>}
                      <th className="th">Failed / graded</th><th className="th">Subject zone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.rows.map((row) => (
                      <tr key={row.key} className="border-t border-surface-line">
                        <td className="td"><span className="font-semibold">{row.code} · {row.section}</span><br /><span className="text-xs text-ink-muted">{row.title}</span></td>
                        {teachers && (
                          <td className="td">
                            {row.teachers?.length ? row.teachers.map((t) => (
                              <div key={t.name} className="flex flex-wrap items-center gap-1.5">
                                {t.name} <ZoneChip zone={t.zone} />
                                <span className="text-xs text-ink-muted">{t.failed}/{t.graded} ({t.rate}%) across their classes</span>
                              </div>
                            )) : <span className="text-ink-muted">No teacher recorded</span>}
                          </td>
                        )}
                        <td className="td">{row.failed} / {row.graded} ({row.rate}%)</td>
                        <td className="td"><ZoneChip zone={row.zone} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          {teachers && teachers.rows.length > 0 && (
            <article className="card p-0">
              <div className="px-5 py-4">
                <h2 className="text-base font-semibold">Teachers to review</h2>
                <p className="mt-0.5 text-xs text-ink-muted">Highest failure rates across each teacher&apos;s classes this period.</p>
              </div>
              <div className="overflow-x-auto px-2 pb-2">
                <table className="w-full min-w-[480px] text-sm">
                  <thead><tr><th className="th">Teacher</th><th className="th">Failed / counted</th><th className="th">Teacher zone</th></tr></thead>
                  <tbody>
                    {teachers.rows.map((t) => (
                      <tr key={t.name} className="border-t border-surface-line">
                        <td className="td font-semibold">{t.name}</td>
                        <td className="td">{t.failed} / {t.graded} ({t.rate}%)</td>
                        <td className="td"><ZoneChip zone={t.zone} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 pb-4 text-xs text-ink-muted">Showing {teachers.rows.length} of {teachers.total} teachers.</p>
            </article>
          )}
        </>
      )}

      {overview.source === 'sample' && (
        <p className="text-xs text-ink-muted">Sample data for demo accounts. Sign in with a database account to see calculated results.</p>
      )}
    </div>
  );
}
