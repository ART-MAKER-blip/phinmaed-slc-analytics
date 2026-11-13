'use client';

import Link from 'next/link';
import { useState } from 'react';

const TIMELINE = [
  { week: 0, title: 'P1 exams and release of grades', detail: 'Grades are released in the SIS.', status: 'Done', href: '/reports', action: 'View release notes' },
  { week: 1, title: 'Data extraction and encoding', detail: 'The three SIS reports are imported, validated and merged.', status: 'Done', href: '/imports', action: 'Open import' },
  { week: 2, title: 'P1 deliberation analysis', detail: 'Analyze student, subject and teacher-level data and classify zones.', status: 'In progress', href: '/deliberation', action: 'Open deliberation' },
  { week: 3, title: 'Presentation and results', detail: 'Present analyses and insights to deans, program heads and advisers.', status: 'Upcoming', href: '/reports', action: 'Preview report' },
  { week: 4, title: 'Insights and feedback', detail: 'Gather feedback from deans, program heads and advisers.', status: 'Upcoming', href: '/reports', action: 'Open feedback form' },
];

const TEACHERS = [
  { teacher: 'Teacher 11', encoded: 0, total: 2, status: 'Overdue' },
  { teacher: 'Teacher 09', encoded: 1, total: 2, status: 'In progress' },
  { teacher: 'Teacher 07', encoded: 2, total: 3, status: 'In progress' },
  { teacher: 'Teacher 02', encoded: 3, total: 3, status: 'Submitted' },
  { teacher: 'Teacher 03', encoded: 4, total: 4, status: 'Submitted' },
] as const;

export default function PeriodCyclePage() {
  const [period, setPeriod] = useState(1);
  const [reminders, setReminders] = useState<Record<string, boolean>>({});
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">Period cycle</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Four weeks from grade release to feedback, tracked for every grading period</p>
        </div>
        <div className="period-control" role="group" aria-label="Grade period">
          {[1, 2, 3].map((item) => <button key={item} type="button" aria-pressed={period === item} onClick={() => setPeriod(item)} className={period === item ? 'period-button period-button-active' : 'period-button'}>P{item}</button>)}
        </div>
      </header>

      <div className="grid items-start gap-3 lg:grid-cols-[1.45fr_1fr]">
        <section className="card p-4" aria-label={`Period ${period} timeline`}>
          <h2 className="mb-3 text-base font-semibold">P{period} timeline</h2>
          <ol className="cycle-timeline">
            {TIMELINE.map((item) => (
              <li key={item.week} className={`cycle-timeline-item ${item.status === 'In progress' ? 'cycle-timeline-item-current' : ''}`}>
                <span className={`cycle-week ${item.status === 'In progress' || item.status === 'Done' ? 'cycle-week-active' : ''}`}>{item.week}</span>
                <article>
                  <div className="flex flex-wrap items-start justify-between gap-2"><h3>{item.title.replace('P1', `P${period}`)}</h3><span className={`cycle-status ${item.status === 'Done' ? 'cycle-status-done' : item.status === 'In progress' ? 'cycle-status-current' : ''}`}>{item.status}</span></div>
                  <p>{item.detail}</p>
                  <Link href={item.href}>{item.action} <span aria-hidden="true">→</span></Link>
                </article>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-col gap-3">
          <section className="card p-4">
            <h2 className="text-base font-semibold">Grade encoding by teacher</h2>
            <p className="mb-2 mt-0.5 text-xs text-ink-muted">Teachers who still need to encode P{period} grades</p>
            <ul className="divide-y divide-surface-line">
              {TEACHERS.map((teacher) => {
                const status = reminders[teacher.teacher] ? 'Reminder sent' : teacher.status;
                return (
                  <li key={teacher.teacher} className="teacher-encoding-row">
                    <div><strong>{teacher.teacher}</strong><span>{teacher.encoded} of {teacher.total} classes encoded</span></div>
                    <span className={`cycle-status ${status === 'Submitted' ? 'cycle-status-done' : status === 'Overdue' ? 'cycle-status-overdue' : ''}`}>{status}</span>
                    {status !== 'Submitted' && <button type="button" className="btn min-h-[36px] px-3 text-xs" onClick={() => setReminders((current) => ({ ...current, [teacher.teacher]: true }))}>{reminders[teacher.teacher] ? 'Sent' : 'Send reminder'}</button>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="period-target-panel">
            <h2 className="text-base font-semibold">Target for Period {period}</h2>
            {period < 3 ? <ul><li>P1 and P2: move up one level at each deliberation until reaching the Green zone.</li></ul> : <ul><li>P3: students pass the Common Final Examination.</li></ul>}
          </section>
          <p className="text-xs text-ink-muted">Sample cycle for planning purposes. Reminder actions are a local demo and are not sent to teachers.</p>
        </div>
      </div>
    </div>
  );
}