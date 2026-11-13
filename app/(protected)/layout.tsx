import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { RoleProvider } from '@/components/RoleProvider';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <RoleProvider user={user}>
      <AppShell>{children}</AppShell>
    </RoleProvider>
  );
}
