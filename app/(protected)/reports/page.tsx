import ReportsPage from '@/features/reports/ReportsPage';
import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/access';
import { getPool } from '@/lib/db';
import { loadProgramReport, resolveSelection, type ProgramReport } from '@/lib/results/server';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const denied = await guardRoute('/reports');
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  const type = first(searchParams.type) === 'semester' ? 'semester' : 'periodic';

  if (!process.env.DATABASE_URL || user.isDemo) {
    const empty: ProgramReport = { run: null, type, programFilter: 'all', programs: [], subjects: { total: 0, counts: { green: 0, yellow: 0, red: 0 } }, outcome: null };
    const selection = { campus: null, term: null, period: 'P1', programs: 'all' as const, campuses: [], terms: [], periods: [] };
    return <ReportsPage selection={selection} programOptions={[]} report={empty} canExport={false} sample />;
  }

  const selection = await resolveSelection(user, {
    campus: first(searchParams.campus), term: first(searchParams.term), period: first(searchParams.period),
  });
  const programOptions = selection.programs === 'all'
    ? (await getPool().query<{ code: string }>(
        `SELECT p.code FROM campus_program cp JOIN campus c ON c.campus_id = cp.campus_id JOIN program p ON p.program_id = cp.program_id
          WHERE c.code = $1 ORDER BY p.code`, [selection.campus],
      )).rows.map((r) => r.code)
    : selection.programs;
  const requested = first(searchParams.program) ?? 'all';
  const program = requested === 'all' || programOptions.includes(requested)
    ? (requested === 'all' && selection.programs !== 'all' && selection.programs.length === 1 ? selection.programs[0] : requested)
    : 'all';

  const report = await loadProgramReport(user, selection, { type, program });
  return (
    <ReportsPage selection={selection} programOptions={programOptions} report={report}
      canExport={hasPermission(user, 'report.generate')} sample={false} />
  );
}
