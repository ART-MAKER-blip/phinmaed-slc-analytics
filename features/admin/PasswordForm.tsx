'use client';

import { useState } from 'react';

export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/account/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) return setMessage({ ok: false, text: data.error ?? 'The password was not changed.' });
      form.reset();
      setMessage({ ok: true, text: 'Password changed. Other devices have been signed out.' });
    } catch {
      setMessage({ ok: false, text: 'Unable to reach the server.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-3">
      <label className="text-xs font-semibold">Current password<input type="password" name="currentPassword" autoComplete="current-password" className="field mt-1" required /></label>
      <label className="text-xs font-semibold">New password (at least 12 characters)<input type="password" name="newPassword" autoComplete="new-password" minLength={12} className="field mt-1" required /></label>
      <label className="text-xs font-semibold">Confirm new password<input type="password" name="confirmPassword" autoComplete="new-password" minLength={12} className="field mt-1" required /></label>
      <div><button type="submit" disabled={busy} className="btn btn-primary text-sm disabled:opacity-60">{busy ? 'Saving…' : 'Change password'}</button></div>
      {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-semibold ${message.ok ? 'text-zone-green-fg' : 'text-red-700'}`}>{message.text}</p>}
    </form>
  );
}
