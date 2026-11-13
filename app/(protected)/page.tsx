import { getCurrentUser } from '@/lib/auth';
import { canOpenRoute } from '@/lib/access';
import { sampleOverview } from '@/lib/data';
import { loadOverview, resolveSelection } from '@/lib/results/server';
import { adminDashboard, dataManagerDashboard, facultyDashboard, teamDashboard } from '@/lib/results/dashboards';
import { ROLE_TEAMS } from '@/lib/concerns/rules';
import { RoleDashboard, SAMPLE_ROLE_DASHBOARDS, ZONE_HEADINGS, ZoneOverviewDashboard } from '@/features/dashboard/DashboardPage';

type SearchParams = { campus?: string; term?: string; period?: string };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const user = (await getCurrentUser())!;
  const params: SearchParams = { campus: first(searchParams.campus), term: first(searchParams.term), period: first(searchParams.period) };
  const live = Boolean(process.env.DATABASE_URL) && !user.isDemo;
  const canReport = canOpenRoute(user, '/reports');
  const heading = ZONE_HEADINGS[user.role];

  if (heading) {
    if (!live) {
      const overview = sampleOverview(user.permissions);
      const selection = {
        campus: 'COC', term: '2026-1', period: 'P1',
        campuses: [{ value: 'COC', label: 'PHINMA COC' }], terms: [{ value: '2026-1', label: '2026-1' }],
        periods: [{ value: 'P1', label: 'P1' }],
      };
      return <ZoneOverviewDashboard overview={overview} selection={selection} heading={heading} canReport={canReport} />;
    }
    const selection = await resolveSelection(user, params);
    const overview = await loadOverview(user, selection);
    return <ZoneOverviewDashboard overview={overview} selection={selection} heading={heading} canReport={canReport} />;
  }

  const campusName = 'PHINMA COC';
  if (live) {
    if (user.role === 'data_manager') return <RoleDashboard content={await dataManagerDashboard(user)} campusName={campusName} />;
    if (user.role === 'admin') return <RoleDashboard content={await adminDashboard()} campusName={campusName} />;
    if (user.role === 'faculty') return <RoleDashboard content={await facultyDashboard(user)} campusName={campusName} />;
    const team = ROLE_TEAMS[user.role];
    if (team) return <RoleDashboard content={await teamDashboard(user, team)} campusName={campusName} />;
  }
  const sample = SAMPLE_ROLE_DASHBOARDS[user.role];
  if (!sample) return null;
  return <RoleDashboard content={sample} campusName={campusName} />;
}
