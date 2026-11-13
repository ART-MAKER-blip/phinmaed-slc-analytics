'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '@/lib/auth';

type RoleContextValue = {
  user: AuthUser;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children, user }: { children: ReactNode; user: AuthUser }) {
  return (
    <RoleContext.Provider value={{ user }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used inside RoleProvider');
  return { ...context, role: context.user.role };
}