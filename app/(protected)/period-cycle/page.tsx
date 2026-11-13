import PeriodCyclePage from '@/features/period-cycle/PeriodCyclePage';
import { guardRoute } from '@/lib/authorize';

export default async function Page() {
  const denied = await guardRoute('/period-cycle');
  if (denied) return denied;
  return <PeriodCyclePage />;
}
