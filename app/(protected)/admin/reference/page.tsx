import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/access';
import { referenceData } from '@/lib/admin/server';
import { AdminTabs, demoNotice } from '@/features/admin/AdminTabs';
import { ReferenceForms } from '@/features/admin/ReferenceForms';

export default async function Page() {
  const denied = await guardRoute('/admin/reference');
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  const tabs = <AdminTabs current="reference" canUsers={hasPermission(user, 'admin.users')} canReference />;
  if (!process.env.DATABASE_URL || user.isDemo) return <div className="flex flex-col gap-4">{tabs}{demoNotice}</div>;
  return <div className="flex flex-col gap-4">{tabs}<ReferenceForms data={await referenceData()} /></div>;
}
