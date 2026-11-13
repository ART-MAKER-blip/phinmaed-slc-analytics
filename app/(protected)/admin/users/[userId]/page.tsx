import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/access';
import { adminOptions, getUser } from '@/lib/admin/server';
import { AdminTabs } from '@/features/admin/AdminTabs';
import { UserForm } from '@/features/admin/UserForm';
import { formatDateTime } from '@/features/imports/shared';

export default async function Page({ params }: { params: { userId: string } }) {
  const denied = await guardRoute('/admin/users');
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  if (!process.env.DATABASE_URL || user.isDemo) notFound();
  const [target, options] = await Promise.all([getUser(params.userId), adminOptions()]);
  if (!target) notFound();

  return (
    <div className="flex flex-col gap-4">
      <AdminTabs current="users" canUsers canReference={hasPermission(user, 'admin.reference_data')} />
      <section className="card p-4">
        <Link href="/admin/users" className="text-sm text-navy underline">← Accounts</Link>
        <h2 className="mt-1 text-xl font-bold">{target.name}</h2>
        <p className="mb-3 text-xs text-ink-muted">
          Created {formatDateTime(target.created_at)} · last sign-in {target.last_login ? formatDateTime(target.last_login) : 'never'}
          {target.id === user.id && ' · this is your account'}
        </p>
        <UserForm options={options} existing={target} />
      </section>
    </div>
  );
}
