import ZonesPage from '@/features/zones/ZonesPage';
import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/access';
import { getUploadOptions } from '@/lib/imports/server';
import { listRuleSets, listRuns } from '@/lib/snapshots/server';

export default async function Page() {
  const denied = await guardRoute('/zones');
  if (denied) return denied;
  const user = (await getCurrentUser())!;

  const empty = { campuses: [], terms: [], periods: [] };
  if (!process.env.DATABASE_URL) {
    return <ZonesPage unavailableReason="Zone calculation needs the database. Set DATABASE_URL and run npm run migrate." canCalculate={false} canApprove={false} canConfigure={false} options={empty} ruleSets={[]} runs={[]} />;
  }
  const unavailableReason = user.isDemo
    ? 'Demo accounts can view rule sets but cannot calculate or approve. Sign in with a database account.'
    : null;

  const [options, ruleSets, runs] = await Promise.all([
    user.isDemo ? empty : getUploadOptions(user),
    listRuleSets(),
    user.isDemo ? [] : listRuns(user),
  ]);
  return (
    <ZonesPage
      unavailableReason={unavailableReason}
      canCalculate={!user.isDemo && hasPermission(user, 'zones.calculate')}
      canApprove={!user.isDemo && hasPermission(user, 'rules.approve')}
      canConfigure={!user.isDemo && hasPermission(user, 'rules.configure')}
      options={options}
      ruleSets={ruleSets}
      runs={runs}
    />
  );
}
