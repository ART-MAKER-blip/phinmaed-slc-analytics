import DeliberationPage from '@/features/deliberation/DeliberationPage';
import { guardRoute } from '@/lib/authorize';

export default async function Page() {
  const denied = await guardRoute('/deliberation');
  if (denied) return denied;
  return <DeliberationPage />;
}
