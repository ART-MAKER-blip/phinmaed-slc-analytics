'use client';

import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 p-5 lg:p-8">{children}</main>
    </div>
  );
}