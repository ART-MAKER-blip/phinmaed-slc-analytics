import Link from 'next/link';
import type { BatchSummary } from '@/lib/imports/server';
import { BatchActions } from './BatchActions';
import { formatDateTime, ISSUE_LABEL, StatusBadge } from './shared';

type Issue = { row_number: number | null; issue_type: string; message: string; resolution_status: string };

type Props = {
  batch: BatchSummary;
  issues: Issue[];
  issuesTruncated: boolean;
  typeCounts: { issue_type: string; count: number }[];
  preview: { headers: string[]; rows: { rowNumber: number; cells: string[] }[] };
  canDecide: boolean;
};

export default function BatchPage({ batch, issues, issuesTruncated, typeCounts, preview, canDecide }: Props) {
  // Highlights rows in the preview; counts come from the database so they cover every issue.
  const rowsWithIssues = new Set(issues.map((i) => i.row_number).filter((n): n is number => n !== null));
  const open = batch.validation_status === 'pending' || batch.validation_status === 'needs_review';
  const rowsWithIssueCount = batch.issue_row_count - (batch.file_issue_count > 0 ? 1 : 0);
  const validRows = Math.max((batch.total_rows ?? 0) - rowsWithIssueCount, 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/imports" className="text-sm text-navy underline">← Import history</Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">
            Batch IB-{String(batch.batch_id).padStart(4, '0')}
          </h1>
          <p className="mt-1.5 break-all text-sm text-ink-muted">
            {batch.filename} · {batch.campus_code} · {batch.term_code} {batch.period_code} · uploaded {formatDateTime(batch.uploaded_at)} by {batch.uploaded_by_name}
          </p>
        </div>
        <StatusBadge status={batch.validation_status} />
      </header>

      <section className="grid gap-3 sm:grid-cols-4" aria-label="Summary">
        {[
          { label: 'Rows in file', value: batch.total_rows ?? 0 },
          { label: open ? 'Valid rows' : 'Imported rows', value: open ? validRows : batch.accepted_rows ?? 0 },
          { label: open ? 'Rows with issues' : 'Skipped rows', value: open ? rowsWithIssueCount : batch.skipped_rows ?? 0 },
          { label: 'Issues found', value: batch.issue_count },
        ].map((m) => (
          <div key={m.label} className="card p-4">
            <div className="text-xs font-semibold text-ink-muted">{m.label}</div>
            <div className="mt-1 text-2xl font-bold">{m.value.toLocaleString('en-PH')}</div>
          </div>
        ))}
      </section>

      {open && canDecide && (
        <BatchActions
          batchId={batch.batch_id}
          canAccept={batch.file_issue_count === 0 && validRows > 0}
          validRows={validRows}
          skippedRows={rowsWithIssueCount}
        />
      )}

      <section className="grid items-start gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Validation report</h2>
            <div className="flex gap-2">
              <a className="btn min-h-[36px] text-xs" href={`/api/imports/${batch.batch_id}/issues`}>Download error list</a>
              <a className="btn min-h-[36px] text-xs" href={`/api/imports/${batch.batch_id}/file`}>Original file</a>
            </div>
          </div>
          {issues.length === 0 ? (
            <p className="rounded-md bg-zone-green-bg px-3 py-2 text-sm font-semibold text-zone-green-fg">No issues found. Every row can be imported.</p>
          ) : (
            <>
              <ul className="mb-3 flex flex-wrap gap-1.5">
                {typeCounts.map(({ issue_type: type, count }) => (
                  <li key={type} className="rounded-full bg-zone-yellow-bg px-2.5 py-0.5 text-xs font-semibold text-zone-yellow-fg">
                    {ISSUE_LABEL[type] ?? type}: {count}
                  </li>
                ))}
              </ul>
              <ul className="max-h-[480px] divide-y divide-surface-line overflow-y-auto">
                {issues.map((issue, index) => (
                  <li key={index} className="flex gap-3 py-2 text-sm">
                    <span className="w-16 flex-none font-semibold">{issue.row_number === null ? 'File' : `Row ${issue.row_number}`}</span>
                    <span><strong>{ISSUE_LABEL[issue.issue_type] ?? issue.issue_type}.</strong> {issue.message}</span>
                  </li>
                ))}
              </ul>
              {issuesTruncated && <p className="mt-2 text-xs text-ink-muted">Showing the first {issues.length} issues. Download the error list for all of them.</p>}
            </>
          )}
        </article>

        <article className="card p-4">
          <h2 className="text-base font-semibold">File preview</h2>
          <p className="mb-2 mt-0.5 text-xs text-ink-muted">First {preview.rows.length} rows. Rows with issues are highlighted and will be skipped.</p>
          {preview.headers.length === 0 ? (
            <p className="text-sm text-ink-muted">The file could not be read for a preview.</p>
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="th">Row</th>
                    {preview.headers.map((h, i) => <th key={i} className="th whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className={`border-t border-surface-line ${rowsWithIssues.has(row.rowNumber) ? 'bg-zone-yellow-bg' : ''}`}>
                      <td className="td font-semibold">{row.rowNumber}</td>
                      {preview.headers.map((_, i) => <td key={i} className="td whitespace-nowrap">{row.cells[i] ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
