import Link from 'next/link';
import type { BatchSummary } from '@/lib/imports/server';
import { UploadForm, type UploadOptions } from './UploadForm';
import { formatDateTime, StatusBadge } from './shared';

type Props = {
  canUpload: boolean;
  /** Set when imports cannot be used for this account, explaining why. */
  unavailableReason: string | null;
  options: UploadOptions;
  batches: BatchSummary[];
};

export default function ImportsPage({ canUpload, unavailableReason, options, batches }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Import SIS reports</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Upload a grades file, review the validation report, then accept the valid rows. The original file is kept for audit.
        </p>
      </header>

      {unavailableReason ? (
        <p className="rounded-md bg-zone-yellow-bg px-4 py-3 text-sm font-semibold text-zone-yellow-fg">{unavailableReason}</p>
      ) : (
        <section className="grid items-start gap-3 lg:grid-cols-3" aria-label="Import sources">
          <article className="card import-source-card lg:col-span-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-bold leading-5">Periodic grades</h2>
              <span className="import-source-state import-state-ok">Connected</span>
            </div>
            <p className="text-xs leading-5 text-ink-muted">Exported from the SIS for the selected term and period, saved as CSV.</p>
            {canUpload ? (
              <UploadForm options={options} />
            ) : (
              <p className="text-xs text-ink-muted">Your role can view imports but not upload them.</p>
            )}
          </article>
          {[
            { title: 'Attendance report', description: 'Per-student attendance from the SIS.' },
            { title: 'Permit and payment records', description: 'From Finance or the SIS. Used only for non-academic flags.' },
          ].map((source) => (
            <article className="card import-source-card" key={source.title}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-bold leading-5">{source.title}</h2>
                <span className="import-source-state import-state-warn">Not connected</span>
              </div>
              <p className="text-xs leading-5 text-ink-muted">{source.description}</p>
              <p className="text-xs leading-5 text-ink-muted">
                Waiting on the confirmed file format and a place for this data in the database design.
              </p>
            </article>
          ))}
        </section>
      )}

      <section className="card p-4" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-base font-semibold">Import history</h2>
        <p className="mb-3 mt-0.5 text-xs text-ink-muted">Most recent 50 uploads at your campus.</p>
        {batches.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No files have been uploaded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className="th">Batch</th><th className="th">File</th><th className="th">Term · period</th>
                  <th className="th">Uploaded</th><th className="th">Rows</th><th className="th">Issues</th><th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.batch_id} className="border-t border-surface-line">
                    <td className="td font-semibold">
                      <Link className="text-navy underline" href={`/imports/${batch.batch_id}`}>IB-{String(batch.batch_id).padStart(4, '0')}</Link>
                    </td>
                    <td className="td break-all">{batch.filename}</td>
                    <td className="td">{batch.term_code ?? '—'} · {batch.period_code ?? '—'}</td>
                    <td className="td">{formatDateTime(batch.uploaded_at)}<br /><span className="text-xs text-ink-muted">{batch.uploaded_by_name}</span></td>
                    <td className="td">
                      {batch.validation_status === 'accepted'
                        ? <>{batch.accepted_rows} imported<br /><span className="text-xs text-ink-muted">{batch.skipped_rows} skipped</span></>
                        : batch.total_rows ?? '—'}
                    </td>
                    <td className="td">{batch.issue_count}</td>
                    <td className="td"><StatusBadge status={batch.validation_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
