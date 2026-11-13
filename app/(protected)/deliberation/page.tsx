import ConcernListPage from '@/features/deliberation/ConcernListPage';
import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/access';
import { concernFormOptions, listConcerns } from '@/lib/concerns/server';
import { findRun, resolveSelection } from '@/lib/results/server';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const denied = await guardRoute('/deliberation');
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  const requested = first(searchParams.status);
  const status = requested === 'closed' || requested === 'all' ? requested : 'active';

  if (!process.env.DATABASE_URL || user.isDemo) {
    return (
      <ConcernListPage concerns={[]} status={status} newConcern={null}
        unavailableReason="Concerns are stored in the database. Sign in with a database account to record deliberations." />
    );
  }

  let newConcern = null;
  if (hasPermission(user, 'concern.manage')) {
    // New concerns come from the latest zone results of the most recently calculated term.
    const selection = await resolveSelection(user, {});
    const run = selection.campus && selection.term ? await findRun(selection.campus, selection.term, 'semester') : null;
    if (selection.campus && selection.term) {
      newConcern = await concernFormOptions(user, selection.campus, selection.term, run?.run_id ?? null);
    }
  }
  return <ConcernListPage concerns={await listConcerns(user, status)} status={status} newConcern={newConcern} unavailableReason={null} />;
}
