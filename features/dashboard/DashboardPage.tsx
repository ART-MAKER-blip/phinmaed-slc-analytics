import Link from 'next/link';
import { ZoneChip, ZONE_SOLID } from '@/components/ZoneChip';
import type { RoleId } from '@/lib/roles';
import { ZONES, ZONE_LABEL, type Zone, type ZoneLevel, type ZoneThreshold } from '@/lib/zones';
import { zoneRates, type ResultSelection, type RoleDashboardContent, type ZoneCounts, type ZoneOverview } from '@/lib/results/types';

/* ---- Roles with a metric-and-queue dashboard ---- */

/** Placeholder content: ALC, SSP and KSH until referrals are connected, and every role in demo mode. */
export const SAMPLE_ROLE_DASHBOARDS: Partial<Record<RoleId, RoleDashboardContent>> = {
  faculty: {
    sample: true,
    eyebrow: 'My classes', title: 'Class results and follow-up',
    description: 'Results for the classes you teach, shown as indicators for review, with the support actions assigned to you.',
    metrics: [
      { label: 'Classes this term', value: '4', detail: 'Term 2026-1' },
      { label: 'Students enrolled', value: '163', detail: 'Across your classes' },
      { label: 'Failed in Period 1', value: '21', detail: 'Indicator for review only' },
      { label: 'Actions assigned to you', value: '3', detail: '1 due this week', tone: 'metric-gold' },
    ],
    queueTitle: 'Your assigned actions', queue: [
      { title: 'Make-up activity · Subject A, section 2', detail: 'Agreed in deliberation on Oct 29', status: 'Due this week' },
      { title: 'Consultation hours · Subject C', detail: 'Share schedule with flagged students', status: 'In progress' },
      { title: 'Progress check · Subject A, section 2', detail: 'Report back before Period 2 review', status: 'Scheduled' },
    ],
  },

  alc: {
    sample: true,
    eyebrow: 'Teaching support', title: 'Active learning referrals',
    description: 'Coordinate teacher-related support referrals and track agreed follow-up actions.',
    metrics: [
      { label: 'Assigned referrals', value: '9', detail: 'Across 6 instructors' },
      { label: 'Needs attention', value: '2', detail: 'Follow-up overdue', tone: 'metric-red' },
      { label: 'In progress', value: '5', detail: 'Support plans underway' },
      { label: 'Resolved this term', value: '11', detail: 'Closed with follow-up', tone: 'metric-green' },
    ],
    queueTitle: 'Follow-up queue', queue: [
      { title: 'Referral AL-024 · General education', detail: 'Review class context with program head', status: 'Due today' },
      { title: 'Referral AL-021 · Business Administration', detail: 'Schedule instructor support conversation', status: 'Overdue' },
      { title: 'Referral AL-019 · Information Technology', detail: 'Check agreed learning support actions', status: 'In progress' },
    ],
  },

  ssp: {
    sample: true,
    eyebrow: 'Student support', title: 'Student success follow-up',
    description: 'Manage student referrals, adviser check-ins, and upcoming support milestones.',
    metrics: [
      { label: 'Assigned students', value: '16', detail: 'Active follow-ups' },
      { label: 'Check-ins due', value: '6', detail: 'Within the next 7 days', tone: 'metric-gold' },
      { label: 'Support plans active', value: '10', detail: 'With an assigned adviser' },
      { label: 'Completed this term', value: '8', detail: 'Follow-up recorded', tone: 'metric-green' },
    ],
    queueTitle: 'Upcoming student check-ins', queue: [
      { title: 'Student S-1048', detail: 'Business Administration · Adviser check-in', status: 'Today' },
      { title: 'Student S-1102', detail: 'Information Technology · Progress review', status: 'Tomorrow' },
      { title: 'Student S-1071', detail: 'Education · Support plan follow-up', status: 'Nov 18' },
      { title: 'Student S-1120', detail: 'Hospitality Management · Initial outreach', status: 'Nov 19' },
    ],
  },

  ksh: {
    sample: true,
    eyebrow: 'Restricted support', title: 'Kasama Support Hub',
    description: 'A private workspace for assigned referrals and confidential support coordination.',
    metrics: [
      { label: 'Assigned referrals', value: '9', detail: 'Only assigned cases shown' },
      { label: 'Priority follow-ups', value: '2', detail: 'Review promptly', tone: 'metric-red' },
      { label: 'Restricted notes', value: '7', detail: 'Access is role-limited' },
      { label: 'Follow-ups completed', value: '5', detail: 'This term', tone: 'metric-green' },
    ],
    queueTitle: 'Assigned support cases', queue: [
      { title: 'Case KSH-018', detail: 'Student support · Restricted note available', status: 'Priority' },
      { title: 'Case KSH-015', detail: 'Wellbeing check-in · Next step assigned', status: 'In progress' },
      { title: 'Case KSH-012', detail: 'Support coordination · Review follow-up', status: 'Scheduled' },
    ],
  },

  data_manager: {
    sample: true,
    eyebrow: 'Data operations', title: 'Imports and zone calculation',
    description: 'Upload SIS and Team Data files, resolve validation issues, and run zone calculation for each period.',
    metrics: [
      { label: 'Imports this term', value: '3', detail: 'Period 1' },
      { label: 'Needs review', value: '1', detail: '6 row issues open', tone: 'metric-gold' },
      { label: 'Rejected', value: '1', detail: 'Missing required columns', tone: 'metric-red' },
      { label: 'Last zone calculation', value: 'Oct 27', detail: 'Period 1 · RS-2026-01' },
    ],
    queueTitle: 'Import queue', queue: [
      { title: 'P1_grades_2026-1.csv', detail: '2 duplicates · 3 unmatched IDs · 1 program mapping', status: 'Needs review' },
      { title: 'teamdata_2026-1.xlsx', detail: 'Rejected · re-upload with required columns', status: 'Action needed' },
      { title: 'Run Period 1 zone calculation', detail: 'After the grades import is accepted', status: 'Waiting' },
    ],
  },

  admin: {
    sample: true,
    eyebrow: 'System operations', title: 'Administration',
    description: 'Manage workspace access, role assignments, and effective academic rule sets.',
    metrics: [
      { label: 'Active accounts', value: '84', detail: 'Across 11 role groups' },
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
      {content.sample && (
        <p className="text-xs text-ink-muted">Sample data. These metrics connect to live records when referrals and deliberations are stored.</p>
      )}
    </div>
  );
}

/* ---- Zone overview (SLC, Dean, COO, Dean of Deans, Team Learning) ---- */

export type OverviewHeading = { eyebrow: string; title: string; description: string };

export const ZONE_HEADINGS: Partial<Record<RoleId, OverviewHeading>> = {
  slc: { eyebrow: 'Student learning', title: 'Zone overview', description: 'Students, subjects and teacher indicators from the latest zone calculation.' },
  dean: { eyebrow: 'Academic oversight', title: 'Program performance', description: 'Results for the programs you oversee, from the latest zone calculation.' },
  coo: { eyebrow: 'Executive overview', title: 'Student success overview', description: 'Campus-level zone results. Use Reports to compare programs and campuses.' },
  dod: { eyebrow: 'Semester review', title: 'Programs across the network', description: 'Zone results across programs using the same definitions and denominators.' },
  tl: { eyebrow: 'PEN-wide leadership', title: 'Team Learning overview', description: 'Zone results to compare across campuses and follow over time.' },
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
              <article className="card teacher-overview-card">
                <div>
                  <h2 className="text-base font-semibold">Teacher level</h2>
                  <p className="mt-0.5 text-sm text-ink-muted">Teachers with classes in these results</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">{teachers.total}</span>
                  <span className="text-ink-muted">teachers</span>
                </div>
                <div className="teacher-overview-note">
                  <span aria-hidden="true">i</span>
                  Failure rates are review indicators only, not teacher ratings or rankings.
                </div>
              </article>
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
                  <p className="mt-0.5 text-xs text-ink-muted">Highest failure rates first. Rates are contextual indicators, not performance ratings.</p>
                </div>
              </div>
              <div className="overflow-x-auto px-2 pb-2">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr>
                      <th className="th">Subject · section</th>
                      {teachers && <th className="th">Teacher indicator</th>}
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
                              <div key={t.name}>{t.name} <span className="text-xs text-ink-muted">· {t.failed}/{t.students} ({t.rate}%) across their classes</span></div>
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
        </>
      )}

      {overview.source === 'sample' && (
        <p className="text-xs text-ink-muted">Sample data for demo accounts. Sign in with a database account to see calculated results.</p>
      )}
    </div>
  );
}
