'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { getRoleLabel } from '@/lib/roles';
import { useRole } from '@/components/RoleProvider';

const LINKS = [
  { href: '/', label: 'Dashboard', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { href: '/imports', label: 'Import reports', icon: 'M12 3v12M7 10l5 5 5-5M4 21h16' },
  { href: '/deliberation', label: 'Deliberation', icon: 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z' },
  { href: '/period-cycle', label: 'Period cycle', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z' },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { user } = useRole();
  const [signOutError, setSignOutError] = useState('');

  async function handleSignOut() {
    setSignOutError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign out failed. Please try again.');
      router.replace('/login');
      router.refresh();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Sign out failed. Please try again.');
    }
  }

  return (
    <aside className="flex flex-col gap-7 bg-navy-dark p-4 text-white lg:min-h-screen lg:w-64 lg:flex-none">
      <div className="flex h-1 overflow-hidden rounded" aria-hidden="true">
        <span className="flex-1 bg-brand-green" />
        <span className="flex-1 bg-brand-gold" />
        <span className="flex-1 bg-white/40" />
      </div>
      <div className="flex items-center gap-3 px-2">
        {/* Replace with the official logo: <Image src="/logo.png" alt="PHINMA Education" width={40} height={40} /> */}
        <div
          aria-hidden="true"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-dashed border-white/50 text-[11px] font-semibold text-white/80"
        >
          Logo
        </div>
        <div className="leading-tight">
          <div className="text-lg font-bold tracking-tight">PHINMAED</div>
          <div className="text-xs text-white/70">Learning Analytics</div>
        </div>
      </div>
      <nav aria-label="Main" className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
        {LINKS.map((l) => {
          const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[44px] flex-none items-center gap-3 rounded-lg px-3 font-semibold ${
                active ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={l.icon} />
              </svg>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-3 rounded-lg bg-white/10 p-3 text-xs text-white/80 lg:block">
        <div>
          <div className="font-semibold text-white">{user.name}</div>
          <div>{user.email}</div>
          <div>{getRoleLabel(user.role)}</div>
        </div>
        <div>
          <button type="button" onClick={handleSignOut} className="min-h-[36px] rounded-md border border-white/25 px-3 font-semibold text-white hover:bg-white/10 lg:mt-3 lg:w-full lg:px-2 lg:text-left">
            Sign out
          </button>
          {signOutError && <p role="alert" className="mt-2 text-xs text-red-200">{signOutError}</p>}
        </div>
      </div>
    </aside>
  );
}
