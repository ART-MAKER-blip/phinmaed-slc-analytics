'use client';

import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { useRole } from '@/components/RoleProvider';

export function AppShell({ children }: { children: ReactNode }) {
  const isLogin = usePathname() === '/login';
  const router = useRouter();
  const { ready, authenticated } = useRole();

  useEffect(() => {
    if (ready && !authenticated && !isLogin) router.replace('/login');
    if (ready && authenticated && isLogin) router.replace('/');
  }, [authenticated, isLogin, ready, router]);

  if (!isLogin && (!ready || !authenticated)) return null;

  return (
    <div className={`flex min-h-screen flex-col ${isLogin ? '' : 'lg:flex-row'}`}>
      {!isLogin && <Sidebar />}
      <main className={isLogin ? 'min-w-0 flex-1' : 'min-w-0 flex-1 p-5 lg:p-8'}>{children}</main>
    </div>
  );
}