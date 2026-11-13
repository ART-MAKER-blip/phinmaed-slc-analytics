'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { RoleId } from '@/lib/roles';

type RoleContextValue = {
  role: RoleId;
  ready: boolean;
  authenticated: boolean;
  setRole: (role: RoleId) => void;
  signOut: () => void;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setActiveRole] = useState<RoleId>('slc');
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const savedRole = window.localStorage.getItem('slc-demo-role') as RoleId | null;
    if (savedRole) {
      setActiveRole(savedRole);
      setAuthenticated(true);
    }
    setReady(true);
  }, []);

  function setRole(nextRole: RoleId) {
    setActiveRole(nextRole);
    setAuthenticated(true);
    window.localStorage.setItem('slc-demo-role', nextRole);
  }

  function signOut() {
    window.localStorage.removeItem('slc-demo-role');
    setActiveRole('slc');
    setAuthenticated(false);
  }

  return (
    <RoleContext.Provider value={{ role, ready, authenticated, setRole, signOut }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used inside RoleProvider');
  return context;
}