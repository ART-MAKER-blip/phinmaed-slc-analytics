'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { ROLES, type RoleId } from '@/lib/roles';

export default function LoginPage() {
  const router = useRouter();
  const { setRole } = useRole();
  const [selectedRole, setSelectedRole] = useState<RoleId>('slc');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRole(selectedRole);
    router.push('/');
  }

  return (
    <div className="login-page">
      <div className="login-band" aria-hidden="true"><span /><span /><span /></div>
      <div className="login-layout">
        <section className="login-intro">
          <div className="login-brand-mark">P</div>
          <p className="eyebrow">PHINMA Education</p>
          <h1>Student Learning<br />Analytics &amp;<br />Deliberation</h1>
          <p className="login-intro-copy">A shared workspace for timely student support, thoughtful review, and coordinated follow-through.</p>
          <div className="login-term"><span className="status-dot" /> Cagayan de Oro College <span>·</span> Term 2026-1</div>
        </section>

        <section className="login-panel" aria-labelledby="login-heading">
          <div className="login-panel-top">
            <span className="eyebrow">Workspace access</span>
            <span className="prototype-tag">Prototype</span>
          </div>
          <h2 id="login-heading">Welcome back</h2>
          <p className="login-subtitle">Sign in to continue to your team workspace.</p>
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email" className="login-label">Work email</label>
            <input id="email" name="email" type="email" autoComplete="username" placeholder="name@phinmaed.com" required className="login-input" />
            <div className="password-label-row">
              <label htmlFor="password" className="login-label">Password</label>
              <span className="login-muted">Demo only</span>
            </div>
            <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter any password" required className="login-input" />
            <label htmlFor="role" className="login-label">Open workspace as</label>
            <select id="role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as RoleId)} className="login-input login-select">
              {ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
            </select>
            <button type="submit" className="login-submit">Sign in <span aria-hidden="true">→</span></button>
          </form>
          <p className="login-notice">Prototype access: credentials are not verified. Do not enter a real password.</p>
          <div className="login-footer"><span>PHINMAED SLC System</span><span>Demo workspace</span></div>
        </section>
      </div>
    </div>
  );
}