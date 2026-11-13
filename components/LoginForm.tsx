'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DEMO_ROLES = ['slc', 'dean', 'alc', 'ssp', 'ksh', 'coo', 'admin'] as const;

export default function LoginForm({ showDemoAccounts }: { showDemoAccounts: boolean }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
          ? result.error
          : 'Sign in failed. Please try again.';
        setError(message);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Unable to sign in right now. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
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
            <span className="prototype-tag">Secure sign-in</span>
          </div>
          <h2 id="login-heading">Welcome back</h2>
          <p className="login-subtitle">Sign in to continue to your team workspace.</p>
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email" className="login-label">Work email</label>
            <input id="email" name="email" type="email" autoComplete="username" placeholder="name@phinmaed.com" required className="login-input" />
            <label htmlFor="password" className="login-label">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required className="login-input" />
            {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
            <button type="submit" disabled={submitting} className="login-submit disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="login-notice">Accounts are created by an administrator. Contact your system administrator if you need access.</p>
          {showDemoAccounts && (
            <details className="mt-4 rounded-md border border-surface-border bg-surface-soft p-3 text-xs">
              <summary className="cursor-pointer font-semibold">Local demo accounts (development only)</summary>
              <p className="mt-2">Password for each account: <code className="font-bold">SLCdemo-2026!</code></p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {DEMO_ROLES.map((role) => <li key={role}><code>{role}.demo@example.test</code></li>)}
              </ul>
              <p className="mt-2">These sample logins are disabled in production and do not use PostgreSQL.</p>
            </details>
          )}
          <div className="login-footer"><span>PHINMAED SLC System</span><span>Staff access</span></div>
        </section>
      </div>
    </div>
  );
}
