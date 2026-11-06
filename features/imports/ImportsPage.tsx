import { IMPORT_HISTORY, IMPORT_ISSUES, IMPORT_PREVIEW } from '@/lib/data';

const STATUS_STYLE = {
  Accepted: 'bg-zone-green-bg text-zone-green-fg',
  'Needs review': 'bg-zone-yellow-bg text-zone-yellow-fg',
  Rejected: 'bg-zone-red-bg text-zone-red-fg',
} as const;

export default function ImportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">Data imports</h1>
          <p className="mt-1.5 text-ink-muted">Authorized SIS or Team Data files are validated before anything is accepted</p>
        </div>
        <button type="button" className="btn">Download file templates</button>
      </header>

      <section className="card">
        <h2 className="text-base font-semibold">Upload a file</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-[#AEB6C7] bg-[#F8F9FB] p-5">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">P1_grades_2026-1.csv</p>
            <p className="text-sm text-ink-muted">SIS grade file · 1,036 rows · The original file is kept with the import record</p>
          </div>
          <button type="button" className="btn">Choose another file</button>
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-5">
        <article className="card xl:col-span-2">
          <h2 className="text-base font-semibold">Error report</h2>
          <p className="mb-2 mt-0.5 text-sm text-ink-muted">Problems are flagged one by one. Invalid rows are never skipped silently.</p>
          <ul>
            {IMPORT_ISSUES.map((i) => (
              <li key={i.kind} className="flex flex-col gap-1.5 border-t border-surface-line py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${i.count ? 'bg-zone-yellow-bg text-zone-yellow-fg' : 'bg-zone-green-bg text-zone-green-fg'}`}>
                    {i.count ? `${i.count} found` : 'None'}
                  </span>
                  <span className="font-semibold">{i.kind}</span>
                </div>
                <span className="text-sm text-ink-muted">{i.detail}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className="btn">Download error report</button>
          </div>
        </article>

        <article className="card xl:col-span-3">
          <h2 className="text-base font-semibold">Preview</h2>
          <p className="mb-2 mt-0.5 text-sm text-ink-muted">Confirm the import only after the preview and error report look right</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr><th className="th">Row</th><th className="th">Student</th><th className="th">Course</th><th className="th">Term</th><th className="th">Grade</th><th className="th">Result</th><th className="th">Check</th></tr></thead>
              <tbody>
                {IMPORT_PREVIEW.map((r) => (
                  <tr key={r.row} className="border-t border-surface-line">
                    <td className="td">{r.row}</td>
                    <td className="td font-semibold">{r.student}</td>
                    <td className="td">{r.course}</td>
                    <td className="td">{r.term}</td>
                    <td className="td">{r.grade}</td>
                    <td className="td">{r.result}</td>
                    <td className="td">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.ok ? 'bg-zone-green-bg text-zone-green-fg' : 'bg-zone-yellow-bg text-zone-yellow-fg'}`}>
                        {r.ok ? 'Valid' : 'Needs fix'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button type="button" className="btn">Cancel import</button>
            <button type="button" className="btn btn-primary">Confirm import</button>
          </div>
        </article>
      </section>

      <article className="card">
        <h2 className="text-base font-semibold">Import history</h2>
        <p className="mb-2 mt-0.5 text-sm text-ink-muted">Original file, import date, uploader and status are saved for audit</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr><th className="th">Batch</th><th className="th">File</th><th className="th">Source</th><th className="th">Uploaded by</th><th className="th">Date</th><th className="th">Rows</th><th className="th">Status</th></tr></thead>
            <tbody>
              {IMPORT_HISTORY.map((b) => (
                <tr key={b.id} className="border-t border-surface-line">
                  <td className="td font-semibold">{b.id}</td>
                  <td className="td">{b.file}</td>
                  <td className="td">{b.source}</td>
                  <td className="td">{b.uploadedBy}</td>
                  <td className="td">{b.uploadedAt}</td>
                  <td className="td">{b.rows.toLocaleString('en-US')}</td>
                  <td className="td"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[b.status]}`}>{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <p className="text-xs text-ink-muted">Sample data for a UI prototype. File names and counts are placeholders.</p>
    </div>
  );
}
