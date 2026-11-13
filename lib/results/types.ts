import type { Zone, ZoneThreshold } from '@/lib/zones';

export type ZoneCounts = Record<Zone, number>;

export type RunInfo = {
  runId: number;
  campus: string;
  campusName: string;
  term: string;
  period: string;
  ruleSet: string;
  calculatedAt: string;
};

/** What the zone overview dashboard shows. Sections are omitted when the role may not see them. */
export type ZoneOverview = {
  source: 'live' | 'sample';
  run: RunInfo | null;
  /** Program codes the figures are limited to, or 'all'. */
  programs: 'all' | string[];
  thresholds: ZoneThreshold[];
  students?: {
    counts: ZoneCounts;
    total: number;
    atRisk: { id: string; name: string; program: string; yearLevel: number; failed: number; zone: Zone }[];
    atRiskTotal: number;
  };
  subjects?: {
    counts: ZoneCounts;
    total: number;
    rows: {
      key: string; code: string; section: string; title: string;
      failed: number; graded: number; rate: number; zone: Zone;
      teachers?: { name: string; failed: number; students: number; rate: number }[];
    }[];
  };
  teachers?: { total: number };
};

export type SelectOption = { value: string; label: string };

/** The campus, term and period a results page shows, plus the choices for its filters. */
export type ResultSelection = {
  campus: string | null;
  term: string | null;
  period: string;
  campuses: SelectOption[];
  terms: SelectOption[];
  periods: SelectOption[];
};

export function zoneRates(counts: ZoneCounts, total: number): ZoneCounts {
  const rate = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return { green: rate(counts.green), yellow: rate(counts.yellow), red: rate(counts.red) };
}

/** Content for the metric-and-queue dashboards used by roles without a zone overview. */
export type RoleDashboardContent = {
  eyebrow: string;
  title: string;
  description: string;
  metrics: { label: string; value: string; detail: string; tone?: string }[];
  queueTitle: string;
  queueEmpty?: string;
  queue: { title: string; detail: string; status: string; href?: string }[];
  /** True for placeholder content not yet backed by the database. */
  sample: boolean;
};
