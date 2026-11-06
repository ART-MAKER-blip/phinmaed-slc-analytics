/**
 * Zone rule engine.
 *
 * Thresholds come from the shared PHINMA definitions quoted in the proposal and are
 * still to be confirmed with PHINMA. They live in a RuleSet so a later term can use
 * different values without changing earlier results (each snapshot stores the rule
 * set id it was computed with).
 */
export type Zone = 'green' | 'yellow' | 'red';

export interface RuleSet {
  id: string;
  name: string;
  effectiveTerm: string;
  /** Student zone, by number of failed subjects. */
  student: { yellowMin: number; redMin: number };
  /** Subject zone, by failure rate in percent. */
  subject: { greenMax: number; yellowMax: number };
}

export const DEFAULT_RULES: RuleSet = {
  id: 'rs-2026-1',
  name: 'Shared PHINMA definitions (to be confirmed)',
  effectiveTerm: '2026-1',
  student: { yellowMin: 1, redMin: 2 },
  subject: { greenMax: 10, yellowMax: 40 },
};

export const ZONE_LABEL: Record<Zone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' };
export const ZONES: Zone[] = ['green', 'yellow', 'red'];

/** Green: 0 failed subjects. Yellow: 1. Red: 2 or more. */
export function studentZone(failedSubjects: number, rules: RuleSet = DEFAULT_RULES): Zone {
  if (failedSubjects >= rules.student.redMin) return 'red';
  if (failedSubjects >= rules.student.yellowMin) return 'yellow';
  return 'green';
}

/** Failure rate in percent, rounded to 2 decimals so boundaries such as 10.01 behave. */
export function failureRate(failed: number, enrolled: number): number {
  if (enrolled <= 0) return 0;
  return Math.round((failed / enrolled) * 10000) / 100;
}

/** Green: 0 to 10%. Yellow: above 10% up to 40%. Red: above 40%. */
export function subjectZone(ratePercent: number, rules: RuleSet = DEFAULT_RULES): Zone {
  if (ratePercent <= rules.subject.greenMax) return 'green';
  if (ratePercent <= rules.subject.yellowMax) return 'yellow';
  return 'red';
}

/** Counts per zone, plus the rate each count represents of the total. */
export function summarize<T>(items: T[], pick: (item: T) => Zone) {
  const counts: Record<Zone, number> = { green: 0, yellow: 0, red: 0 };
  for (const item of items) counts[pick(item)] += 1;
  const total = items.length;
  const rates: Record<Zone, number> = {
    green: total ? Math.round((counts.green / total) * 1000) / 10 : 0,
    yellow: total ? Math.round((counts.yellow / total) * 1000) / 10 : 0,
    red: total ? Math.round((counts.red / total) * 1000) / 10 : 0,
  };
  return { total, counts, rates };
}
