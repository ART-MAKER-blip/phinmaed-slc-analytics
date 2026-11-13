import ImportsPage from '@/features/imports/ImportsPage';
import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/access';
import { getUploadOptions, listBatches } from '@/lib/imports/server';

export default async function Page() {
  const denied = await guardRoute('/imports');
  if (denied) return denied;
  const user = (await getCurrentUser())!;

  const unavailableReason = !process.env.DATABASE_URL
    ? 'Imports need the database. Set DATABASE_URL and run npm run migrate.'
    : user.isDemo
      ? 'Demo accounts cannot save data. Sign in with a database account (npm run seed-demo) to import files.'
      : null;

  if (unavailableReason) {
    return <ImportsPage canUpload={false} unavailableReason={unavailableReason} options={{ campuses: [], terms: [], periods: [] }} batches={[]} />;
  }

  const [options, batches] = await Promise.all([getUploadOptions(user), listBatches(user)]);
  return (
    <ImportsPage
      canUpload={hasPermission(user, 'import.upload')}
      unavailableReason={null}
      options={options}
      batches={batches}
    />
  );
}
