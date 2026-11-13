'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { UploadOptions } from '@/features/imports/UploadForm';

async function post(url: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: response.ok, data };
  } catch {
    return { ok: false, data: { error: 'Unable to reach the server. Check your connection and try again.' } };
  }
}

const errorText = (data: Record<string, unknown> | null) =>
  typeof data?.error === 'string' ? data.error : 'The request failed. Please try again.';

export function CalculateForm({ options }: { options: UploadOptions }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    const { ok, data } = await post('/api/zones/runs', {
      campusId: Number(form.get('campusId')), termId: Number(form.get('termId')), periodId: Number(form.get('periodId')),
    });
    setBusy(false);
    if (!ok) return setMessage({ kind: 'error', text: errorText(data) });
    setMessage({ kind: 'ok', text: `Run ${String(data?.runId)} saved with rule set ${String(data?.ruleSet)}.` });
    router.refresh();
  }

  if (options.campuses.length === 0) return <p className="text-sm text-ink-muted">Your account has no campus assigned.</p>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold">
        Campus
        <select name="campusId" className="field mt-1" required>
          {options.campuses.map((c) => <option key={c.campus_id} value={c.campus_id}>{c.code}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">
        Term
        <select name="termId" className="field mt-1" required>
          {options.terms.map((t) => <option key={t.term_id} value={t.term_id}>{t.code}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">
        Period
        <select name="periodId" className="field mt-1" required>
          {options.periods.map((p) => <option key={p.grading_period_id} value={p.grading_period_id}>{p.code}</option>)}
        </select>
      </label>
      <button type="submit" disabled={busy} className="btn btn-primary text-sm disabled:opacity-60">
        {busy ? 'Calculating…' : 'Calculate zones'}
      </button>
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'}
          className={`w-full text-sm font-semibold ${message.kind === 'error' ? 'text-red-700' : 'text-zone-green-fg'}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}

export function ApproveButton({ ruleSetId, code }: { ruleSetId: number; code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function approve() {
    if (!window.confirm(`Approve rule set ${code}? Its thresholds will be locked and used for zone calculations from its effective term.`)) return;
    setBusy(true);
    setError('');
    const { ok, data } = await post(`/api/zones/rule-sets/${ruleSetId}/approve`);
    setBusy(false);
    if (!ok) return setError(errorText(data));
    router.refresh();
  }

  return (
    <div>
      <button type="button" className="btn btn-primary min-h-[36px] text-sm" disabled={busy} onClick={approve}>
        {busy ? 'Approving…' : 'Approve'}
      </button>
      {error && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

export function VerifyButton({ runId }: { runId: number }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string; details?: string[] } | null>(null);

  async function verify() {
    setBusy(true);
    setResult(null);
    const { ok, data } = await post(`/api/zones/runs/${runId}/verify`);
    setBusy(false);
    if (!ok || !data) return setResult({ kind: 'error', text: errorText(data) });
    if (data.matches) return setResult({ kind: 'ok', text: `Matches: all ${String(data.compared)} saved results were reproduced.` });
    setResult({
      kind: 'warn',
      text: `${String(data.differenceCount)} differences found.`,
      details: Array.isArray(data.differences) ? data.differences.map(String) : [],
    });
  }

  return (
    <div className="min-w-[160px]">
      <button type="button" className="btn min-h-[34px] px-3 text-xs" disabled={busy} onClick={verify}>
        {busy ? 'Verifying…' : 'Verify'}
      </button>
      {result && (
        <div role="status" className={`mt-1 text-xs font-semibold ${
          result.kind === 'ok' ? 'text-zone-green-fg' : result.kind === 'warn' ? 'text-zone-yellow-fg' : 'text-red-700'}`}>
          {result.text}
          {result.details && result.details.length > 0 && (
            <ul className="mt-1 list-disc pl-4 font-normal">{result.details.map((d) => <li key={d}>{d}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
