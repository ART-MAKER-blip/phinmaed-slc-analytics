'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TEMPLATE_COLUMNS } from '@/lib/imports/grades';
import { toCsv } from '@/lib/imports/csv';

export type UploadOptions = {
  campuses: { campus_id: number; code: string; name: string }[];
  terms: { term_id: number; code: string; name: string }[];
  periods: { grading_period_id: number; code: string; name: string }[];
};

const TEMPLATE_EXAMPLE: Record<(typeof TEMPLATE_COLUMNS)[number], string> = {
  student_id: '2026-00014', last_name: 'Dela Cruz', first_name: 'Juan', program: 'BSIT', year_level: '1',
  course_code: 'IT 101', course_title: 'Introduction to Computing', section: 'A', result_status: 'Failed',
  grade: '68', teacher_id: 'T-0003', teacher_name: 'Santos, Maria', attempt: '1', term: '2026-1', period: 'P1',
};

function downloadTemplate() {
  const csv = toCsv([[...TEMPLATE_COLUMNS], TEMPLATE_COLUMNS.map((c) => TEMPLATE_EXAMPLE[c])]);
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'slc-grades-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function UploadForm({ options }: { options: UploadOptions }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/imports', { method: 'POST', body: new FormData(event.currentTarget) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
          ? result.error : 'Upload failed. Please try again.');
        return;
      }
      if (result && typeof result === 'object' && 'batchId' in result) router.push(`/imports/${String(result.batchId)}`);
    } catch {
      setError('Unable to upload right now. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (options.campuses.length === 0) {
    return <p className="text-xs text-ink-muted">Your account has no campus assigned for imports.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-xs font-semibold">
          Campus
          <select name="campusId" className="field mt-1" required>
            {options.campuses.map((c) => <option key={c.campus_id} value={c.campus_id}>{c.name}</option>)}
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
      </div>
      <label className="text-xs font-semibold">
        Grades file (.csv, up to 10 MB)
        <input name="file" type="file" accept=".csv,text/csv" required className="mt-1 block w-full text-xs" />
      </label>
      {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={submitting} className="btn btn-primary min-h-[38px] flex-1 text-sm disabled:opacity-60">
          {submitting ? 'Validating…' : 'Upload and validate'}
        </button>
        <button type="button" className="btn min-h-[38px] text-sm" onClick={downloadTemplate}>Template</button>
      </div>
    </form>
  );
}
