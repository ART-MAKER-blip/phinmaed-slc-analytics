'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = { batchId: number; canAccept: boolean; validRows: number; skippedRows: number };

export function BatchActions({ batchId, canAccept, validRows, skippedRows }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [message, setMessage] = useState('');

  async function decide(action: 'accept' | 'reject') {
    const prompt = action === 'accept'
      ? `Import ${validRows} valid rows${skippedRows ? ` and skip ${skippedRows} rows with issues` : ''}?`
      : 'Reject this batch? Nothing from it will be imported.';
    if (!window.confirm(prompt)) return;

    setBusy(action);
    setMessage('');
    try {
      const response = await fetch(`/api/imports/${batchId}/${action}`, { method: 'POST' });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
          ? result.error : 'The request failed. Please try again.');
        return;
      }
      router.refresh();
    } catch {
      setMessage('Unable to reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-4" aria-label="Decision">
      <p className="text-sm">
        {canAccept
          ? <>Accepting imports <strong>{validRows}</strong> rows{skippedRows > 0 && <> and skips <strong>{skippedRows}</strong> rows with issues. Fix those rows in the source file and upload it again to import them later</>}.</>
          : 'This file cannot be imported. Fix the issues listed below and upload it again, or reject this batch.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn min-h-[40px] text-sm" disabled={busy !== null} onClick={() => decide('reject')}>
          {busy === 'reject' ? 'Rejecting…' : 'Reject batch'}
        </button>
        {canAccept && (
          <button type="button" className="btn btn-primary min-h-[40px] text-sm" disabled={busy !== null} onClick={() => decide('accept')}>
            {busy === 'accept' ? 'Importing…' : `Accept ${validRows} rows`}
          </button>
        )}
      </div>
      {message && <p role="alert" className="w-full text-sm font-semibold text-red-700">{message}</p>}
    </section>
  );
}
