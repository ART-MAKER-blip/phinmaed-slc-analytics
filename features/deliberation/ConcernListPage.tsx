import Link from 'next/link';
import type { ConcernSummary } from '@/lib/concerns/server';
import { CONCERN_STATUS_LABEL } from '@/lib/concerns/labels';
import { formatDateTime } from '@/features/imports/shared';
import { NewConcernForm, type NewConcernOptions } from './forms';

type Props = {
  concerns: ConcernSummary[];
  status: 'active' | 'closed' | 'all';
  newConcern: NewConcernOptions | null;
  unavailableReason: string | null;
};

const TABS = [
  { value: 'active', label: 'Open and in progress' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
] as const;

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-zone-yellow-bg text-zone-yellow-fg',
  in_progress: 'bg-navy-tint text-navy-dark',
  closed: 'bg-surface-soft text-ink-muted',
};

const ACCESS_NOTE: Record<string, string> = {
  team: 'Referred to your team',
  owner: 'Action assigned to you',
};

export default function ConcernListPage({ concerns, status, newConcern, unavailableReason }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Deliberation</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Concerns raised from zone results, what was decided, who is acting on it, and where students were referred.
        </p>
      </header>

      {unavailableReason && (
        <p className="rounded-md bg-zone-yellow-bg px-4 py-3 text-sm font-semibold text-zone-yellow-fg">{unavailableReason}</p>
      )}

      {newConcern && (
        <section className="card p-4" aria-labelledby="new-heading">
          <h2 id="new-heading" className="text-base font-semibold">Open a concern</h2>
          <p className="mb-3 mt-0.5 text-xs text-ink-muted">
            {newConcern.campus} · {newConcern.term}. Choose a student or subject section flagged in the latest zone results.
          </p>
          {newConcern.students.length + newConcern.subjects.length === 0 ? (
            <p className="text-sm text-ink-muted">No flagged students or subject sections without an open concern in the latest results.</p>
          ) : (
            <NewConcernForm options={newConcern} />
          )}
        </section>
      )}

      <section className="card p-4" aria-labelledby="list-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="list-heading" className="text-base font-semibold">Concerns</h2>
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter concerns">
            {TABS.map((tab) => (
              <Link key={tab.value} href={`/deliberation?status=${tab.value}`} aria-current={status === tab.value ? 'page' : undefined}
                className={`filter-pill ${status === tab.value ? 'filter-pill-active' : ''}`}>
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
        {concerns.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No concerns here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr><th className="th">Concern</th><th className="th">About</th><th className="th">Type</th><th className="th">Opened</th><th className="th">Status</th></tr>
              </thead>
              <tbody>
                {concerns.map((c) => (
                  <tr key={c.concern_id} className="border-t border-surface-line align-top">
                    <td className="td">
                      <Link href={`/deliberation/${c.concern_id}`} className="font-semibold text-navy underline">#{c.concern_id}</Link>
                      {ACCESS_NOTE[c.access] && <div className="text-xs text-ink-muted">{ACCESS_NOTE[c.access]}</div>}
                    </td>
                    <td className="td">
                      {c.context}
                      {c.access === 'full' && c.open_interventions > 0 && <div className="text-xs text-ink-muted">{c.open_interventions} open action{c.open_interventions === 1 ? '' : 's'}</div>}
                    </td>
                    <td className="td">{c.type_name}</td>
                    <td className="td">{formatDateTime(c.opened_at)}<div className="text-xs text-ink-muted">{c.opened_by_name}</div></td>
                    <td className="td"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status]}`}>{CONCERN_STATUS_LABEL[c.status]}</span></td>
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
