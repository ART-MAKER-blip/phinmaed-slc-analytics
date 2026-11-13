'use client';

import { useMemo, useState } from 'react';
import { ZoneChip } from '@/components/ZoneChip';
import { FLAGGED_STUDENTS, REFERRAL_TEAMS, subjectRows } from '@/lib/data';
import { studentZone } from '@/lib/zones';
import { useRole } from '@/components/RoleProvider';
import { ROLES } from '@/lib/roles';

type Filter = 'All' | 'Academic' | 'Non-academic';

const STEPS = ['Data gathering', 'Identify at risk', 'Deliberation', 'Intervention', 'Evaluation'];
const STARTING_INTERVENTIONS = [
  { title: 'Meet the student to review a study plan', owner: 'Adviser', due: 'Week 4', status: 'In progress' },
  { title: 'Ask subject teachers for make-up activities', owner: 'SLC', due: 'Week 4', status: 'To do' },
  { title: 'Weekly check-in during Period 2', owner: 'Support coach', due: 'Week 2', status: 'To do' },
];

export default function DeliberationPage() {
  const { role: roleId } = useRole();
  const [filter, setFilter] = useState<Filter>('All');
  const [selectedId, setSelectedId] = useState(FLAGGED_STUDENTS[0].id);
  const [referralTo, setReferralTo] = useState<string>(REFERRAL_TEAMS[1]);
  const [activeStep, setActiveStep] = useState(2);
  const [interventions, setInterventions] = useState(STARTING_INTERVENTIONS);
  const [saved, setSaved] = useState('');
  const [marked, setMarked] = useState(false);

  const students = [0, 1, 4, 14, 15, 16].map((index) => FLAGGED_STUDENTS[index]);
  const list = useMemo(() => students.filter((student) => filter === 'All' || student.concern === filter), [filter]);
  const student = students.find((item) => item.id === selectedId) ?? list[0] ?? students[0];
  const role = ROLES.find((item) => item.id === roleId) ?? ROLES[0];
  const concernCounts = {
    All: students.length,
    Academic: students.filter((item) => item.concern === 'Academic').length,
    'Non-academic': students.filter((item) => item.concern === 'Non-academic').length,
  };

  function chooseFilter(nextFilter: Filter) {
    setFilter(nextFilter);
    const first = students.find((item) => nextFilter === 'All' || item.concern === nextFilter);
    if (first) setSelectedId(first.id);
  }

  function addIntervention() {
    setInterventions((current) => [...current, { title: 'Add a student support follow-up', owner: 'SLC', due: 'Set due date', status: 'To do' }]);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">Student-level deliberation</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Period 1 · Review each student at risk and agree on support</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-sm font-semibold text-ink-muted">{role.label}</span>
          <button type="button" className="btn btn-primary min-h-[40px]" onClick={() => setSaved('Deliberation report prepared for this demo.')}>Export deliberation report</button>
        </div>
      </header>

      <nav className="workflow-steps deliberation-steps" aria-label="Deliberation process">
        {STEPS.map((step, index) => (
          <button key={step} type="button" aria-current={activeStep === index ? 'step' : undefined} onClick={() => setActiveStep(index)} className={`workflow-step ${activeStep === index ? 'workflow-step-active' : ''}`}>
            <span>{index + 1}</span>{step}
          </button>
        ))}
      </nav>

      <section className="grid items-start gap-3 lg:grid-cols-[0.86fr_1.7fr]">
        <article className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Students at risk</h2>
            <span className="text-xs text-ink-muted">{list.length} shown</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by concern type">
            {(['All', 'Academic', 'Non-academic'] as Filter[]).map((item) => (
              <button key={item} type="button" aria-pressed={filter === item} onClick={() => chooseFilter(item)} className={`filter-pill ${filter === item ? 'filter-pill-active' : ''}`}>
                {item} <span>{concernCounts[item]}</span>
              </button>
            ))}
          </div>
          <ul className="flex flex-col gap-1.5">
            {list.map((item) => (
              <li key={item.id}>
                <button type="button" aria-pressed={item.id === student.id} onClick={() => { setSelectedId(item.id); setMarked(false); setSaved(''); }} className={`student-select-row ${item.id === student.id ? 'student-select-row-active' : ''}`}>
                  <span className="min-w-0"><strong>{item.id}</strong><span>{item.concern} · {item.failedSubjects} failed subject{item.failedSubjects === 1 ? '' : 's'}</span></span>
                  <ZoneChip zone={studentZone(item.failedSubjects)} />
                </button>
              </li>
            ))}
          </ul>
        </article>

        <form className="card flex flex-col gap-4 p-4" onSubmit={(event) => { event.preventDefault(); setSaved(`Notes saved for ${student.id} in this session only.`); }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-bold tracking-tight">{student.id}</h2><p className="text-sm text-ink-muted">{student.concern} concern · {student.failedSubjects} failed subjects</p></div>
            <ZoneChip zone={studentZone(student.failedSubjects)} />
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Failed subjects</h3>
            <div className="divide-y divide-surface-line">
              {subjectRows.slice(0, Math.max(student.failedSubjects, 1)).map((subject, index) => (
                <div className="flex items-center justify-between gap-3 py-2 text-xs" key={subject.code}>
                  <strong>{subject.code}</strong><span className="text-ink-muted">{subject.teacher}</span><strong> P1 grade {index === 0 ? '68' : index === 1 ? '71' : '72'}</strong>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Intervention plan</h3><button type="button" className="btn min-h-[34px] px-3 text-xs" onClick={addIntervention}>Add intervention</button></div>
            <ul className="flex flex-col gap-1.5">
              {interventions.map((item, index) => (
                <li className="intervention-item" key={`${item.title}-${index}`}>
                  <div><strong>{item.title}</strong><span>Owner: {item.owner} · Due: {item.due}</span></div><span className={`queue-status ${item.status === 'In progress' ? 'queue-status-active' : ''}`}>{item.status}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label htmlFor="notes" className="mb-1 block text-sm font-semibold">Deliberation notes</label><textarea id="notes" rows={2} className="field py-2" placeholder="Record what the adviser, coach and teachers agreed on" /></div>
          </div>

          <details className="rounded-md border border-surface-border px-3 py-2">
            <summary className="cursor-pointer py-1 text-sm font-semibold">Referral and supporting record</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="concern" className="mb-1 block text-xs font-semibold">Concern raised</label><textarea id="concern" rows={2} className="field py-2" placeholder="What is the concern?" /></div>
              <div><label htmlFor="evidence" className="mb-1 block text-xs font-semibold">Evidence reviewed</label><textarea id="evidence" rows={2} className="field py-2" placeholder="Grades, attendance or other records" /></div>
              <div><label htmlFor="owner" className="mb-1 block text-xs font-semibold">Action owner</label><select id="owner" className="field min-h-[40px]" defaultValue="slc"><option value="slc">Student Learning Coordinator</option><option value="dean">Dean / Program Head</option><option value="teacher">Faculty</option><option value="alc">Active Learning Coordinator</option></select></div>
              <div><label htmlFor="due" className="mb-1 block text-xs font-semibold">Due date</label><input id="due" type="date" className="field min-h-[40px]" /></div>
              <div><label htmlFor="to" className="mb-1 block text-xs font-semibold">Refer to</label><select id="to" className="field min-h-[40px]" value={referralTo} onChange={(event) => setReferralTo(event.target.value)}>{REFERRAL_TEAMS.map((team) => <option key={team}>{team}</option>)}</select></div>
              <div><label htmlFor="status" className="mb-1 block text-xs font-semibold">Referral status</label><select id="status" className="field min-h-[40px]" defaultValue="Open"><option>Open</option><option>Accepted</option><option>In progress</option><option>Closed</option></select></div>
              <div className="sm:col-span-2"><label htmlFor="restricted" className="mb-1 block text-xs font-semibold">Restricted note</label>{role.canSeeRestricted ? <textarea id="restricted" rows={2} className="field py-2" placeholder="Visible only to roles with permission" /> : <p id="restricted" className="rounded-md bg-surface-soft px-3 py-3 text-sm text-ink-soft">Hidden for {role.label}. Only the referral fact, date, destination and status are visible.</p>}</div>
            </div>
            <p className="mt-3 text-xs text-ink-muted">Counseling records and detailed case files stay outside this system.</p>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-line pt-3">
            <p role="status" aria-live="polite" className="text-xs font-semibold text-zone-green-fg">{saved || (marked ? 'Marked as deliberated for this session.' : '')}</p>
            <div className="flex flex-wrap justify-end gap-2"><button type="submit" className="btn min-h-[40px] text-sm">Save notes</button><button type="button" className="btn btn-primary min-h-[40px] text-sm" onClick={() => setMarked(true)}>Mark as deliberated</button></div>
          </div>
        </form>
      </section>
      <p className="text-xs text-ink-muted">Sample data for design purposes only. This prototype does not store deliberation or referral records.</p>
    </div>
  );
}