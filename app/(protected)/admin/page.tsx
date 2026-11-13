import { redirect } from 'next/navigation';
import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/access';

export default async function Page() {
  const denied = await guardRoute('/admin');
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  redirect(hasPermission(user, 'admin.users') ? '/admin/users' : '/admin/reference');
}
