import ReportsPage from '@/features/reports/ReportsPage';
import { guardRoute } from '@/lib/authorize';

export default async function Page() {
  const denied = await guardRoute('/reports');
  if (denied) return denied;
  return <ReportsPage />;
}
