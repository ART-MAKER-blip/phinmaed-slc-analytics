'use client';

import { useState } from 'react';
import { IMPORT_ISSUES } from '@/lib/data';

const SOURCES = [
  { id: 'grades', title: 'Periodic grades and Common Final Exam results', description: 'Exported from the SIS for the selected period.', file: 'P1_grades_BSIT.csv', rows: '1,036 rows · 148 students', state: 'Validated' },
  { id: 'attendance', title: 'Attendance report', description: 'Per-student attendance from the SIS.', file: 'P1_attendance_BSIT.csv', rows: '1,036 rows · 148 students', state: '2 issues' },
  { id: 'permits', title: 'Permit and payment records', description: 'From Finance or the SIS. Used only for non-academic flags.', file: 'P1_permits_BSIT.csv', rows: '148 rows · 148 students', state: 'Validated' },
] as const;

const MERGED_PREVIEW = [
  { student: 'Student 014', subject: 'Subject A', grade: '68', attendance: '72%', flag: 'None' },
  { student: 'Student 014', subject: 'Subject B', grade: '74', attendance: '80%', flag: 'None' },
  { student: 'Student 072', subject: 'Subject A', grade: '71', attendance: '85%', flag: 'None' },
  { student: 'Student 101', subject: 'Subject C', grade: '70', attendance: '90%', flag: 'Payment follow-up' },
  { student: 'Student 033', subject: 'Subject D', grade: '75', attendance: '88%', flag: 'None' },
];

function downloadCsv(name: string, rows: string[][]) {
  const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ImportsPage() {
  const [step, setStep] = useState<'Upload' | 'Validate' | 'Merge'>('Validate');
  const [files, setFiles] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState(false);
  const [notice, setNotice] = useState('');

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">Import SIS reports</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Week 1 · Data extraction and encoding for Period 1</p>
        </div>
        <button type="button" className="btn" onClick={() => downloadCsv('slc-import-template.csv', [['student_id', 'course_code', 'term', 'program', 'grade', 'result_status'], ['Student 014', 'Subject A', '2026-1', 'BSIT', '68', 'Failed']])}>
          Download CSV templates
        </button>
      </header>

      <nav className="workflow-steps" aria-label="Import workflow">
        {(['Upload', 'Validate', 'Merge'] as const).map((item, index) => (
          <button type="button" key={item} aria-current={step === item ? 'step' : undefined} onClick={() => setStep(item)} className={`workflow-step ${step === item ? 'workflow-step-active' : ''}`}>
            <span>{index + 1}</span>{item}
          </button>
        ))}
      </nav>

      <section className="grid items-start gap-3 lg:grid-cols-3" aria-label="Import sources">
        {SOURCES.map((source) => (
          <article className="card import-source-card" key={source.id}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-bold leading-5">{source.title}</h2>
              <span className={`import-source-state ${source.state === 'Validated' ? 'import-state-ok' : 'import-state-warn'}`}>{source.state}</span>
            </div>
            <p className="text-xs leading-5 text-ink-muted">{source.description}</p>
            <div className="file-summary"><strong>{files[source.id] ?? source.file}</strong><span>{source.rows}</span></div>
            <label className="btn min-h-[38px] w-full cursor-pointer text-sm">
              Replace file
              <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setFiles((current) => ({ ...current, [source.id]: file.name }));
              }} />
            </label>
          </article>
        ))}
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="card p-4">
          <h2 className="text-base font-semibold">Validation results</h2>
          <p className="mb-3 mt-0.5 text-xs text-ink-muted">Fix these before merging, or skip the affected rows.</p>
          <ul className="divide-y divide-surface-line">
            {IMPORT_ISSUES.filter((issue) => issue.count > 0).map((issue) => (
              <li key={issue.kind} className="flex flex-col gap-1.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zone-yellow-bg px-2.5 py-0.5 text-xs font-semibold text-zone-yellow-fg">Warning</span>
                  <strong className="text-sm">{issue.kind}</strong>
                </div>
                <p className="text-xs leading-5 text-ink-muted">{issue.detail}</p>
              </li>
            ))}
            <li className="flex flex-col gap-1.5 py-3">
              <div className="flex items-center gap-2"><span className="rounded-full bg-zone-green-bg px-2.5 py-0.5 text-xs font-semibold text-zone-green-fg">Info</span><strong className="text-sm">Grades are within range</strong></div>
              <p className="text-xs text-ink-muted">No invalid scores or duplicate rows found in the grades report.</p>
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn min-h-[40px] text-sm" onClick={() => { setSkipped(true); setNotice('Affected rows will be excluded in this demo merge.'); }}>Skip affected rows</button>
            <button type="button" className="btn min-h-[40px] text-sm" onClick={() => downloadCsv('import-validation-errors.csv', [['Issue', 'Count', 'Details'], ...IMPORT_ISSUES.filter((issue) => issue.count > 0).map((issue) => [issue.kind, String(issue.count), issue.detail])])}>Download error list</button>
          </div>
          {skipped && <p className="mt-3 text-xs font-semibold text-zone-green-fg" role="status">Affected rows marked to skip.</p>}
        </article>

        <article className="card p-4">
          <div className="mb-2">
            <h2 className="text-base font-semibold">Merged summary sheet preview</h2>
            <p className="mt-0.5 text-xs text-ink-muted">First 5 rows of the combined data</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr><th className="th">Student</th><th className="th">Subject</th><th className="th">P1 grade</th><th className="th">Attendance</th><th className="th">Non-academic flag</th></tr></thead>
              <tbody>
                {MERGED_PREVIEW.map((row) => (
                  <tr key={`${row.student}-${row.subject}`} className="border-t border-surface-line">
                    <td className="td font-semibold">{row.student}</td><td className="td">{row.subject}</td><td className="td">{row.grade}</td><td className="td">{row.attendance}</td><td className="td">{row.flag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 rounded-md bg-navy-tint px-3 py-2 text-xs leading-5 text-navy-dark">Permit and payment records only create a non-academic flag for the SLC to arrange support. They are not used to predict risk.</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-xs font-semibold text-zone-green-fg">{notice}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn min-h-[40px] text-sm" onClick={() => setNotice('Draft saved locally for this session only.')}>Save draft</button>
              <button type="button" className="btn btn-primary min-h-[40px] text-sm" onClick={() => { setStep('Merge'); setNotice('Demo merge complete. No data has been stored.'); }}>Merge and classify zones</button>
            </div>
          </div>
        </article>
      </section>
      <p className="text-xs text-ink-muted">Sample data for design purposes only. File names, counts and students are placeholders.</p>
    </div>
  );
}