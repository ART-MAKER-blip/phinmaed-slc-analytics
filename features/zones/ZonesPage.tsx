import type { UploadOptions } from '@/features/imports/UploadForm';
import { formatDateTime } from '@/features/imports/shared';
import type { RuleSetSummary, RunSummary } from '@/lib/snapshots/server';
import { ZONES, ZONE_LABEL, type Zone, type ZoneThreshold } from '@/lib/zones';
import { ApproveButton, CalculateForm, RuleSetActionButton, RuleSetForm, VerifyButton } from './ZoneActions';

type Props = {
  unavailableReason: string | null;
  canCalculate: boolean;
  canApprove: boolean;
  canConfigure: boolean;
  options: UploadOptions;
  ruleSets: RuleSetSummary[];
  runs: RunSummary[];
};

const RULE_STATUS: Record<RuleSetSummary['status'], string> = {
  draft: 'bg-zone-yellow-bg text-zone-yellow-fg',
  approved: 'bg-zone-green-bg text-zone-green-fg',
  retired: 'bg-surface-soft text-ink-muted',
};

const ZONE_TEXT: Record<Zone, string> = {
  green: 'text-zone-green-fg', yellow: 'text-zone-yellow-fg', red: 'text-zone-red-fg',
};

function range(t: ZoneThreshold | undefined, unit: '' | '%') {
  if (!t) return '—';
  if (t.max === null) return `${t.min}${unit} or more`;
  if (t.min === t.max) return `${t.min}${unit}`;
  return `${t.min}–${t.max}${unit}`;
}

function ZoneCounts({ counts }: { counts: Record<Zone, number> }) {
  return (
    <span className="whitespace-nowrap">
      {ZONES.map((z, i) => (
        <span key={z}>
          {i > 0 && ' · '}
          <span className={`font-semibold ${ZONE_TEXT[z]}`}>{counts[z]}</span> {ZONE_LABEL[z].toLowerCase()}
        </span>
      ))}
    </span>
  );
}

export default function ZonesPage({ unavailableReason, canCalculate, canApprove, canConfigure, options, ruleSets, runs }: Props) {
  const termCodes = options.terms.map((t) => t.code);
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Zone calculation</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Zones are calculated from imported grades with the approved rule set for the term. Each run is saved, so past results stay as they were.
        </p>
      </header>

      {unavailableReason && (
        <p className="rounded-md bg-zone-yellow-bg px-4 py-3 text-sm font-semibold text-zone-yellow-fg">{unavailableReason}</p>
      )}

      <section className="card p-4" aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="text-base font-semibold">Rule sets</h2>
        <p className="mb-3 mt-0.5 text-xs text-ink-muted">
          A rule set applies from its effective term until a later one is approved. Approved thresholds cannot be changed.
        </p>
        {canConfigure && !unavailableReason && <div className="mb-3"><RuleSetForm terms={termCodes} /></div>}
        <div className="grid gap-3 lg:grid-cols-2">
          {ruleSets.map((rs) => {
            const t = (level: 'student' | 'subject', zone: Zone) => rs.thresholds.find((x) => x.level === level && x.zone === zone);
            return (
              <article key={rs.rule_set_id} className="rounded-lg border border-surface-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold">{rs.code}</h3>
                    <p className="text-xs text-ink-muted">{rs.name} · effective {rs.effective_term}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${RULE_STATUS[rs.status]}`}>{rs.status}</span>
                </div>
                <table className="mt-3 w-full text-sm">
                  <thead><tr><th className="th">Level</th>{ZONES.map((z) => <th key={z} className="th">{ZONE_LABEL[z]}</th>)}</tr></thead>
                  <tbody>
                    <tr className="border-t border-surface-line">
                      <td className="td">Student (failed subjects)</td>
                      {ZONES.map((z) => <td key={z} className="td">{range(t('student', z), '')}</td>)}
                    </tr>
                    <tr className="border-t border-surface-line">
                      <td className="td">Subject (failure rate)</td>
                      {ZONES.map((z) => <td key={z} className="td">{range(t('subject', z), '%')}</td>)}
                    </tr>
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                  <span>
                    {rs.approved_at ? `Approved ${formatDateTime(rs.approved_at)}${rs.approved_by_name ? ` by ${rs.approved_by_name}` : ''}` : 'Not approved yet'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {rs.status === 'draft' && canApprove && <ApproveButton ruleSetId={rs.rule_set_id} code={rs.code} />}
                    {rs.status === 'draft' && canConfigure && <RuleSetActionButton ruleSetId={rs.rule_set_id} code={rs.code} action="delete" />}
                    {rs.status === 'approved' && canApprove && <RuleSetActionButton ruleSetId={rs.rule_set_id} code={rs.code} action="retire" />}
                  </div>
                </div>
                {rs.status === 'draft' && canConfigure && (
                  <div className="mt-3">
                    <RuleSetForm terms={termCodes} existing={{
                      id: rs.rule_set_id, code: rs.code, name: rs.name, effectiveTerm: rs.effective_term,
                      studentYellowFrom: t('student', 'yellow')?.min ?? 1, studentRedFrom: t('student', 'red')?.min ?? 2,
                      subjectGreenMax: t('subject', 'green')?.max ?? 10, subjectYellowMax: t('subject', 'yellow')?.max ?? 40,
                    }} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {canCalculate && !unavailableReason && (
        <section className="card p-4" aria-labelledby="calc-heading">
          <h2 id="calc-heading" className="mb-3 text-base font-semibold">Calculate zones</h2>
          <CalculateForm options={options} />
        </section>
      )}

      <section className="card p-4" aria-labelledby="runs-heading">
        <h2 id="runs-heading" className="text-base font-semibold">Snapshot runs</h2>
        <p className="mb-3 mt-0.5 text-xs text-ink-muted">
          Verify recalculates a run from the grades in force at that time and its rule set, and checks that every result matches.
        </p>
        {runs.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No zone calculations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr>
                  <th className="th">Run</th><th className="th">Campus · term · period</th><th className="th">Rule set</th>
                  <th className="th">Students</th><th className="th">Subject offerings</th><th className="th">Calculated</th>
                  {canCalculate && <th className="th"><span className="sr-only">Verify</span></th>}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.run_id} className="border-t border-surface-line align-top">
                    <td className="td font-semibold">#{run.run_id}</td>
                    <td className="td">{run.campus_code} · {run.term_code} · {run.period_code}</td>
                    <td className="td">{run.rule_set_code}</td>
                    <td className="td">
                      {run.student_count}<br /><ZoneCounts counts={run.student_zones} />
                      {run.skipped_students > 0 && (
                        <><br /><span className="text-xs text-zone-yellow-fg">{run.skipped_students} without enrollment skipped</span></>
                      )}
                    </td>
                    <td className="td">{run.offering_count}<br /><ZoneCounts counts={run.subject_zones} /></td>
                    <td className="td">{formatDateTime(run.calculated_at)}<br /><span className="text-xs text-ink-muted">{run.calculated_by_name}</span></td>
                    {canCalculate && <td className="td"><VerifyButton runId={run.run_id} /></td>}
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
