import type { BatchSummary } from '@/lib/imports/server';

const STATUS: Record<BatchSummary['validation_status'], { label: string; className: string }> = {
  pending: { label: 'Ready to import', className: 'bg-navy-tint text-navy-dark' },
  needs_review: { label: 'Needs review', className: 'bg-zone-yellow-bg text-zone-yellow-fg' },
  accepted: { label: 'Accepted', className: 'bg-zone-green-bg text-zone-green-fg' },
  rejected: { label: 'Rejected', className: 'bg-zone-red-bg text-zone-red-fg' },
};

export function StatusBadge({ status }: { status: BatchSummary['validation_status'] }) {
  const { label, className } = STATUS[status];
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{label}</span>;
}

export function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export const ISSUE_LABEL: Record<string, string> = {
  missing_column: 'Missing column',
  missing_value: 'Missing value',
  duplicate_record: 'Duplicate record',
  unmatched_identifier: 'Unmatched identifier',
  term_mapping: 'Term or period mapping',
  program_mapping: 'Program mapping',
  invalid_value: 'Invalid value',
};
