import Link from 'next/link';
import { ZoneChip } from '@/components/ZoneChip';
import type { getConcernDetail } from '@/lib/concerns/server';
import { CONCERN_STATUS_LABEL, INTERVENTION_STATUS_LABEL, REFERRAL_STATUS_LABEL, TEAM_LABEL } from '@/lib/concerns/labels';
import { formatDateTime } from '@/features/imports/shared';
import {
  ConcernStatusControl, DeliberationForm, FollowUpForm, InterventionForm, ReferralForm, ReferralNoteForm, ReferralStatusControl,
} from './forms';

type Detail = NonNullable<Awaited<ReturnType<typeof getConcernDetail>>>;

type Props = {
  detail: Detail;
  staff: { id: string; name: string; roles: string }[];
  interventionTypes: { code: string; name: string }[];
};

function Section({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
        </div>
      </div>
      {children}
      {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
    </section>
  );
}

export default function ConcernDetailPage({ detail, staff, interventionTypes }: Props) {
  const { concern: c, access, results, deliberations, interventions, referrals, can } = detail;
  const closed = c.status === 'closed';

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/deliberation" className="text-sm text-navy underline">← Concerns</Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">Concern #{c.concern_id}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {c.context} · {c.type_name} · {c.campus} {c.term} · opened {formatDateTime(c.opened_at)} by {c.opened_by_name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-navy-tint px-3 py-1 text-sm font-semibold text-navy-dark">{CONCERN_STATUS_LABEL[c.status]}</span>
          {can.changeStatus && <ConcernStatusControl concernId={c.concern_id} status={c.status} />}
        </div>
      </header>

      {access !== 'full' && (
        <p className="rounded-md bg-navy-tint px-4 py-2 text-sm text-navy-dark">
          {access === 'team'
            ? 'You see this concern because it was referred to your team. Deliberation records and other teams’ referrals are not shown.'
            : 'You see this concern because an action on it is assigned to you. Only your actions are shown.'}
        </p>
      )}

      <section className="grid items-start gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Section title="Concern">
          <p className="whitespace-pre-wrap text-sm">{c.description}</p>
        </Section>
        {results && (
          <Section title={results.kind === 'student' ? 'Student zone by period' : 'Subject section results by period'}
            description="From saved zone calculations for this term.">
            {results.rows.length === 0 ? <p className="text-sm text-ink-muted">No calculated results yet.</p> : (
              <ul className="divide-y divide-surface-line text-sm">
                {results.rows.map((r) => (
                  <li key={r.period} className="flex items-center justify-between gap-2 py-2">
                    <span><strong>{r.period}</strong> · {r.detail}</span><ZoneChip zone={r.zone} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </section>

      {deliberations && (
        <Section title="Deliberations" description="What was discussed, the evidence reviewed, and the decision."
          action={can.deliberate && !closed ? <DeliberationForm concernId={c.concern_id} staff={staff} /> : undefined}>
          {deliberations.length === 0 ? <p className="text-sm text-ink-muted">No deliberation recorded yet.</p> : (
            <ol className="flex flex-col gap-3">
              {deliberations.map((d) => (
                <li key={d.deliberation_id} className="rounded-lg border border-surface-border p-3 text-sm">
                  <div className="text-xs text-ink-muted">{d.meeting_date} · recorded by {d.recorded_by}</div>
                  <p className="mt-1 whitespace-pre-wrap">{d.decision}</p>
                  {d.evidence.length > 0 && <p className="mt-2 text-xs"><strong>Evidence:</strong> {d.evidence.join(' · ')}</p>}
                  {d.participants.length > 0 && <p className="mt-1 text-xs text-ink-muted">Participants: {d.participants.join(', ')}</p>}
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      <Section title={access === 'full' ? 'Interventions and follow-up' : 'Your actions'} description="Each action has an owner and a due date; follow-ups record progress."
        action={can.intervene && !closed ? <InterventionForm concernId={c.concern_id} staff={staff} types={interventionTypes} /> : undefined}>
        {interventions.length === 0 ? <p className="text-sm text-ink-muted">No interventions yet.</p> : (
          <ul className="flex flex-col gap-3">
            {interventions.map((i) => (
              <li key={i.intervention_id} className="rounded-lg border border-surface-border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <strong>{i.description}</strong>
                    <div className="text-xs text-ink-muted">
                      {i.type_name} · owner {i.owner_name} · due {i.due_date}{i.start_date ? ` · from ${i.start_date}` : ''}{i.target ? ` · target: ${i.target}` : ''}
                    </div>
                  </div>
                  <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-xs font-semibold">{INTERVENTION_STATUS_LABEL[i.status]}{i.end_date ? ` ${i.end_date}` : ''}</span>
                </div>
                {i.follow_ups.length > 0 && (
                  <ol className="mt-2 border-l-2 border-surface-border pl-3 text-xs">
                    {i.follow_ups.map((f, n) => (
                      <li key={n} className="py-1">
                        <strong>{f.date}</strong> · {f.progress}
                        {f.next_step && <> · next: {f.next_step}</>}{f.outcome && <> · outcome: {f.outcome}</>}
                        <span className="text-ink-muted"> ({f.by})</span>
                      </li>
                    ))}
                  </ol>
                )}
                {i.canUpdate && !closed && <div className="mt-2"><FollowUpForm concernId={c.concern_id} interventionId={i.intervention_id} status={i.status} /></div>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {(referrals.length > 0 || can.refer) && (
        <Section title="Referrals" description="Only the fact, date, destination and status are recorded. Restricted notes are shown only to roles allowed to see them."
          action={can.refer && !closed ? <ReferralForm concernId={c.concern_id} noteTeams={can.noteTeams} /> : undefined}>
          {referrals.length === 0 ? <p className="text-sm text-ink-muted">No referrals yet.</p> : (
            <ul className="flex flex-col gap-3">
              {referrals.map((r) => (
                <li key={r.referral_id} className="rounded-lg border border-surface-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong>{TEAM_LABEL[r.team] ?? r.team_name}</strong>
                      <div className="text-xs text-ink-muted">Referred {r.referral_date} by {r.referred_by}</div>
                    </div>
                    {r.canUpdate && !closed
                      ? <ReferralStatusControl concernId={c.concern_id} referralId={r.referral_id} status={r.status} />
                      : <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-xs font-semibold">{REFERRAL_STATUS_LABEL[r.status]}</span>}
                  </div>
                  {r.notes === null ? (
                    <p className="mt-2 text-xs text-ink-muted">Restricted notes are hidden for your role.</p>
                  ) : (
                    <div className="mt-2">
                      {r.notes.length === 0 ? <p className="text-xs text-ink-muted">No restricted notes.</p> : (
                        <ul className="flex flex-col gap-1 text-xs">
                          {r.notes.map((n, idx) => (
                            <li key={idx} className="rounded bg-zone-yellow-bg/50 px-2 py-1">
                              <span className="font-semibold">Restricted · </span>{n.note_text}
                              <span className="text-ink-muted"> ({n.created_by}, {formatDateTime(n.created_at)})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.canAddNote && !closed && <div className="mt-2"><ReferralNoteForm concernId={c.concern_id} referralId={r.referral_id} /></div>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
