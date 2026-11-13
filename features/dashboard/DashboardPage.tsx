'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ZoneChip, ZONE_SOLID } from '@/components/ZoneChip';
import { FLAGGED_STUDENTS, STUDENTS, subjectRows, teacherIndicators } from '@/lib/data';
import { DEFAULT_RULES, ZONES, ZONE_LABEL, studentZone, summarize } from '@/lib/zones';
import { useRole } from '@/components/RoleProvider';
import type { RoleId } from '@/lib/roles';

type RoleDashboardContent = {
  eyebrow: string;
  title: string;
  description: string;
  metrics: { label: string; value: string; detail: string; tone?: string }[];
  queueTitle: string;
  queue: { title: string; detail: string; status: string }[];
};

const ROLE_DASHBOARDS: Record<Exclude<RoleId, 'slc'>, RoleDashboardContent> = {
  dean: {
    eyebrow: 'Academic oversight', title: 'Program performance',
    description: 'A cross-program view of student progress and follow-through for Term 2026-1.',
    metrics: [
      { label: 'Students reviewed', value: '486', detail: 'Across 4 programs' },
      { label: 'Red zone', value: '18', detail: 'Requires coordinated support', tone: 'metric-red' },
      { label: 'Open deliberations', value: '12', detail: '3 awaiting program feedback' },
      { label: 'Actions on track', value: '84%', detail: 'Due dates this term', tone: 'metric-green' },
    ],
    queueTitle: 'Program review', queue: [
      { title: 'Business Administration', detail: '6 red · 21 yellow · 4 actions to review', status: 'Feedback due' },
      { title: 'Information Technology', detail: '5 red · 18 yellow · 2 actions to review', status: 'In review' },
      { title: 'Hospitality Management', detail: '4 red · 14 yellow · 3 actions to review', status: 'On track' },
      { title: 'Education', detail: '3 red · 12 yellow · 3 actions to review', status: 'On track' },
    ],
  },
  alc: {
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
  faculty: {
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
  coo: {
    eyebrow: 'Executive overview', title: 'Student success across campuses',
    description: 'A high-level view of term progress and support activity across PHINMA Education.',
    metrics: [
      { label: 'Campuses reporting', value: '5 / 5', detail: 'Term 2026-1' },
      { label: 'Students reviewed', value: '4,820', detail: 'Across active programs' },
      { label: 'Red zone', value: '6.4%', detail: 'Campus-wide share', tone: 'metric-red' },
      { label: 'Actions completed', value: '78%', detail: 'Of actions due to date', tone: 'metric-green' },
    ],
    queueTitle: 'Campus reporting status', queue: [
      { title: 'Cagayan de Oro College', detail: '1,046 students · Review complete', status: 'Submitted' },
      { title: 'Cebu College', detail: '982 students · 2 actions pending', status: 'Submitted' },
      { title: 'Araullo University', detail: '1,122 students · Review complete', status: 'Submitted' },
      { title: 'University of Pangasinan', detail: '1,670 students · Report finalized', status: 'Submitted' },
    ],
  },
  dod: {
    eyebrow: 'Semester review', title: 'Programs across the network',
    description: 'A semester-level summary across programs and campuses, using the same zone definitions and denominators.',
    metrics: [
      { label: 'Programs reporting', value: '38', detail: 'Across 5 campuses' },
      { label: 'Students reviewed', value: '4,820', detail: 'Semester 2026-1' },
      { label: 'Red zone', value: '309 (6.4%)', detail: 'Count and rate', tone: 'metric-red' },
      { label: 'Moved out of red', value: '41%', detail: 'Since Period 1', tone: 'metric-green' },
    ],
    queueTitle: 'Semester report items', queue: [
      { title: 'Programs with rising red share', detail: '4 programs above last semester', status: 'Review' },
      { title: 'Rule set RS-2026-01 approval', detail: 'Thresholds awaiting confirmation', status: 'Pending' },
      { title: 'Semester report draft', detail: 'Generated from Period 3 snapshots', status: 'Scheduled' },
    ],
  },
  tl: {
    eyebrow: 'PEN-wide leadership', title: 'Team Learning overview',
    description: 'Compare campuses and track whether agreed actions are followed by better results.',
    metrics: [
      { label: 'Campuses reporting', value: '5 / 5', detail: 'Term 2026-1' },
      { label: 'Subjects in red', value: '27', detail: 'Across all campuses', tone: 'metric-red' },
      { label: 'Interventions completed', value: '78%', detail: 'Of those due to date', tone: 'metric-green' },
      { label: 'Subjects improved', value: '12', detail: 'After an intervention' },
    ],
    queueTitle: 'Cross-campus watch list', queue: [
      { title: 'General education mathematics', detail: 'Red at 3 campuses · Period 1', status: 'Review' },
      { title: 'Accounting fundamentals', detail: 'Yellow at 4 campuses · improving', status: 'Monitoring' },
      { title: 'Campus comparison report', detail: 'Period 1, all programs', status: 'Ready' },
    ],
  },
  data_manager: {
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

function RoleDashboard({ content }: { content: RoleDashboardContent }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="role-dashboard-heading">
        <div>
          <p className="eyebrow">{content.eyebrow} <span>·</span> PHINMA COC</p>
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
          <div><h2 className="text-base font-semibold">{content.queueTitle}</h2><p className="mt-1 text-sm text-ink-muted">Sample items for this prototype workspace</p></div>
          <button type="button" className="btn">View all <span aria-hidden="true">→</span></button>
        </div>
        <div className="role-queue-list">
          {content.queue.map((item) => (
            <article key={item.title} className="role-queue-item">
              <div><h3>{item.title}</h3><p>{item.detail}</p></div>
              <span className="queue-status">{item.status}</span>
            </article>
          ))}
        </div>
      </section>
      <p className="text-xs text-ink-muted">Prototype dashboard. Metrics and case details are sample data and are not connected to a live student record system.</p>
    </div>
  );
}

const STUDENT_RULE_TEXT = ['0 failed subjects', '1 failed subject', '2 or more failed subjects'];
const SUBJECT_RULE_TEXT = ['0 to 10% failed', '10.01 to 40% failed', '40.01 to 100% failed'];

function ZoneSummary({
  title,
  description,
  unit,
  summary,
  rules,
}: {
  title: string;
  description: string;
  unit: string;
  summary: ReturnType<typeof summarize>;
  rules: string[];
}) {
  return (
    <article className="card flex min-h-[218px] flex-col gap-3 p-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
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
  const { role } = useRole();
  const [period, setPeriod] = useState(1);
  const studentSummary = summarize(STUDENTS, (s) => studentZone(s.failedSubjects));
  const subjectSummary = summarize(subjectRows, (s) => s.zone);
  const teacherById = new Map(teacherIndicators.map((teacher) => [teacher.teacher, teacher]));

  if (role !== 'slc') return <RoleDashboard content={ROLE_DASHBOARDS[role]} />;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">Zone overview</h1>
          <p className="mt-1.5 text-sm text-ink-muted">PHINMA COC · Period {period} grades · Bachelor of Science in Information Technology</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="period-control" role="group" aria-label="Grade period">
            {[1, 2, 3].map((item) => (
              <button key={item} type="button" aria-pressed={period === item} onClick={() => setPeriod(item)} className={period === item ? 'period-button period-button-active' : 'period-button'}>
                P{item}
              </button>
            ))}
          </div>
          <Link href="/reports" className="btn btn-primary">Export Week 3 report <span aria-hidden="true">↓</span></Link>
        </div>
      </header>

      <section className="review-progress" aria-label="Review progress">
        <div className="review-progress-title"><strong>Week 2 of 4</strong><span>Period {period} deliberation analysis is in progress. Next, present results to deans, program heads and advisers in Week 3.</span></div>
        <div className="review-progress-track"><span style={{ width: '50%' }} /></div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3" aria-label="Zone summaries">
        <ZoneSummary title="Subject level" description="Subjects by share of failed students" unit="subjects" summary={subjectSummary} rules={SUBJECT_RULE_TEXT} />
        <ZoneSummary title="Student level" description="Students by number of failed subjects" unit="students" summary={studentSummary} rules={STUDENT_RULE_TEXT} />
        <article className="card teacher-overview-card">
          <div>
            <h2 className="text-base font-semibold">Teacher level</h2>
            <p className="mt-0.5 text-sm text-ink-muted">Teachers by share of failing students</p>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">{teacherIndicators.length}</span>
            <span className="text-ink-muted">teachers</span>
          </div>
          <div className="teacher-overview-note">
            <span aria-hidden="true">i</span>
            Failure rates are review indicators only, not teacher ratings or rankings.
          </div>
          <p className="text-xs text-ink-muted">Rule set {DEFAULT_RULES.id} · effective {DEFAULT_RULES.effectiveTerm}</p>
        </article>
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-[1.65fr_1fr]">
        <article className="card p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <div><h2 className="text-base font-semibold">Students at risk</h2><p className="mt-0.5 text-xs text-ink-muted">Current results for review</p></div>
            <Link href="/deliberation" className="inline-flex min-h-[40px] items-center font-semibold text-navy">Open deliberation <span aria-hidden="true">→</span></Link>
          </div>
          <div className="overflow-x-auto px-2">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr><th className="th">Student</th><th className="th">Failed subjects</th><th className="th">Concern type</th><th className="th">Zone</th></tr>
              </thead>
              <tbody>
                {FLAGGED_STUDENTS.slice(0, 6).map((s) => (
                  <tr key={s.id} className="border-t border-surface-line">
                    <td className="td font-semibold">{s.id}</td>
                    <td className="td">{s.failedSubjects}</td>
                    <td className="td">{s.concern}</td>
                    <td className="td"><ZoneChip zone={studentZone(s.failedSubjects)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 pb-4 pt-2 text-xs text-ink-muted">Showing 6 of {FLAGGED_STUDENTS.length} students in Yellow or Red zones.</p>
        </article>

        <article className="card priority-panel">
          <h2 className="text-base font-semibold">Priority follow-up</h2>
          <p className="mb-2 mt-0.5 text-sm text-ink-muted">Students with current results that need review</p>
          <div className="priority-list">
            {FLAGGED_STUDENTS.slice(0, 3).map((student) => (
              <div className="priority-item" key={student.id}>
                <div><strong>{student.id}</strong><span>{student.failedSubjects} failed subjects · {student.concern.toLowerCase()}</span></div>
                <ZoneChip zone={studentZone(student.failedSubjects)} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">Based on current grade data; no predictive scoring is used.</p>
        </article>
      </section>

      <article className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <div><h2 className="text-base font-semibold">Subjects and teachers to review</h2><p className="mt-0.5 text-xs text-ink-muted">Failure rates are contextual indicators, not performance ratings.</p></div>
          <Link href="/reports" className="text-sm font-semibold text-navy">View report <span aria-hidden="true">→</span></Link>
        </div>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr><th className="th">Subject</th><th className="th">Teacher</th><th className="th">Failed students</th><th className="th">Subject zone</th><th className="th">Teacher indicator</th></tr></thead>
            <tbody>
              {subjectRows.slice(0, 6).map((subject) => {
                const teacher = teacherById.get(subject.teacher);
                return (
                <tr key={subject.code} className="border-t border-surface-line">
                  <td className="td font-semibold">{subject.code}</td>
                  <td className="td">{subject.teacher}</td>
                  <td className="td">{subject.failed} / {subject.enrolled} ({subject.rate}%)</td>
                  <td className="td"><ZoneChip zone={subject.zone} /></td>
                  <td className="td">{teacher?.rate}% failure rate</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>

      <p className="text-xs text-ink-muted">Sample data for a UI prototype. Names, counts and rules are placeholders pending confirmation from PHINMA.</p>
    </div>
  );
}
