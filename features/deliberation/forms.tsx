'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ZONE_LABEL, type Zone } from '@/lib/zones';
import { INTERVENTION_STATUS_LABEL, REFERRAL_STATUS_LABEL, TEAM_LABEL } from '@/lib/concerns/labels';

type Staff = { id: string; name: string; roles: string }[];

const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // Asia/Manila

/** Posts JSON, shows the server's error message, and refreshes the page on success. */
function useSubmit(url: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(body: Record<string, unknown>, onDone?: (data: Record<string, unknown>) => void) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'The request failed. Please try again.');
        return false;
      }
      onDone?.(data);
      router.refresh();
      return true;
    } catch {
      setError('Unable to reach the server. Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, submit };
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`text-xs font-semibold ${wide ? 'sm:col-span-2' : ''}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Actions({ busy, error, label, onCancel }: { busy: boolean; error: string; label: string; onCancel?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
      <button type="submit" disabled={busy} className="btn btn-primary min-h-[40px] text-sm disabled:opacity-60">{busy ? 'Saving…' : label}</button>
      {onCancel && <button type="button" className="btn min-h-[40px] text-sm" onClick={onCancel}>Cancel</button>}
      {error && <p role="alert" className="w-full text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}

const values = (form: HTMLFormElement) => Object.fromEntries(new FormData(form).entries());

/** A button that reveals a form, so detail pages stay readable. */
function Expandable({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn min-h-[38px] text-sm" onClick={() => setOpen(true)}>{label}</button>;
  return <div className="w-full rounded-lg border border-surface-border bg-surface-soft p-3">{children(() => setOpen(false))}</div>;
}

/* ---- New concern ---- */

export type NewConcernOptions = {
  campus: string;
  term: string;
  types: { code: string; name: string }[];
  students: { sis_id: string; name: string; program: string; failed: number; zone: Zone }[];
  subjects: { offering_id: number; code: string; section: string; rate: number; zone: Zone }[];
};

export function NewConcernForm({ options }: { options: NewConcernOptions }) {
  const router = useRouter();
  const { busy, error, submit } = useSubmit('/api/concerns');
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit({ ...values(e.currentTarget), campus: options.campus, term: options.term }, (data) => router.push(`/deliberation/${String(data.concernId)}`));
      }}
    >
      <Field label="Student or subject section" wide>
        <select name="context" className="field" required defaultValue="">
          <option value="" disabled>Choose from the latest flagged results…</option>
          <optgroup label="Students in Yellow or Red without an open concern">
            {options.students.map((s) => (
              <option key={s.sis_id} value={`student:${s.sis_id}`}>{s.name} ({s.sis_id}) · {s.program} · {s.failed} failed · {ZONE_LABEL[s.zone]}</option>
            ))}
          </optgroup>
          <optgroup label="Subject sections in Yellow or Red">
            {options.subjects.map((s) => (
              <option key={s.offering_id} value={`offering:${s.offering_id}`}>{s.code} · {s.section} · {s.rate}% failed · {ZONE_LABEL[s.zone]}</option>
            ))}
          </optgroup>
        </select>
      </Field>
      <Field label="Concern type">
        <select name="type" className="field" required>
          {options.types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
      </Field>
      <div className="hidden sm:block" />
      <Field label="What is the concern?" wide>
        <textarea name="description" rows={3} className="field py-2" required minLength={5} maxLength={2000} />
      </Field>
      <Actions busy={busy} error={error} label="Open concern" />
    </form>
  );
}

/* ---- Concern detail actions ---- */

export function ConcernStatusControl({ concernId, status }: { concernId: number; status: string }) {
  const { busy, error, submit } = useSubmit(`/api/concerns/${concernId}`);
  const closing = status !== 'closed';
  return (
    <div>
      <button type="button" className="btn min-h-[38px] text-sm" disabled={busy}
        onClick={() => {
          if (closing && !window.confirm('Close this concern? It can be reopened later.')) return;
          void submit({ action: 'status', status: closing ? 'closed' : 'in_progress' });
        }}>
        {busy ? 'Saving…' : closing ? 'Close concern' : 'Reopen concern'}
      </button>
      {error && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

export function DeliberationForm({ concernId, staff }: { concernId: number; staff: Staff }) {
  const { busy, error, submit } = useSubmit(`/api/concerns/${concernId}`);
  return (
    <Expandable label="Record deliberation">
      {(close) => (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const ok = await submit({ ...values(e.currentTarget), action: 'deliberation', participants: form.getAll('participants') });
          if (ok) close();
        }}>
          <Field label="Meeting date"><input type="date" name="meetingDate" className="field" defaultValue={today()} required /></Field>
          <div className="hidden sm:block" />
          <Field label="Decision and agreed actions" wide>
            <textarea name="decision" rows={3} className="field py-2" required minLength={5} maxLength={4000} />
          </Field>
          <Field label="Evidence reviewed (the latest zone results are attached automatically)" wide>
            <textarea name="evidence" rows={2} className="field py-2" maxLength={2000} placeholder="Grade reports, attendance, adviser notes…" />
          </Field>
          <fieldset className="text-xs sm:col-span-2">
            <legend className="font-semibold">Participants (you are included)</legend>
            <div className="mt-1 grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
              {staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2"><input type="checkbox" name="participants" value={s.id} /> {s.name} <span className="text-ink-muted">· {s.roles}</span></label>
              ))}
            </div>
          </fieldset>
          <Actions busy={busy} error={error} label="Save deliberation" onCancel={close} />
        </form>
      )}
    </Expandable>
  );
}

export function InterventionForm({ concernId, staff, types }: { concernId: number; staff: Staff; types: { code: string; name: string }[] }) {
  const { busy, error, submit } = useSubmit(`/api/concerns/${concernId}`);
  return (
    <Expandable label="Add intervention">
      {(close) => (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await submit({ ...values(e.currentTarget), action: 'intervention' })) close();
        }}>
          <Field label="Type">
            <select name="type" className="field" required>{types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select>
          </Field>
          <Field label="Owner">
            <select name="ownerId" className="field" required defaultValue="">
              <option value="" disabled>Choose who is responsible…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.roles}</option>)}
            </select>
          </Field>
          <Field label="Agreed action" wide><textarea name="description" rows={2} className="field py-2" required minLength={3} maxLength={2000} /></Field>
          <Field label="Target (optional)" wide><input name="target" className="field" maxLength={500} placeholder="e.g. Move out of Red by Period 2" /></Field>
          <Field label="Start date (optional)"><input type="date" name="startDate" className="field" /></Field>
          <Field label="Due date"><input type="date" name="dueDate" className="field" required /></Field>
          <Actions busy={busy} error={error} label="Save intervention" onCancel={close} />
        </form>
      )}
    </Expandable>
  );
}

export function FollowUpForm({ concernId, interventionId, status }: { concernId: number; interventionId: number; status: string }) {
  const { busy, error, submit } = useSubmit(`/api/concerns/${concernId}`);
  return (
    <Expandable label="Log follow-up">
      {(close) => (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await submit({ ...values(e.currentTarget), action: 'follow_up', interventionId })) close();
        }}>
          <Field label="Check-in date"><input type="date" name="checkinDate" className="field" defaultValue={today()} required /></Field>
          <Field label="Intervention status">
            <select name="status" className="field" defaultValue={status}>
              {Object.entries(INTERVENTION_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Progress" wide><textarea name="progress" rows={2} className="field py-2" required minLength={3} maxLength={2000} /></Field>
          <Field label="Next step (optional)"><input name="nextStep" className="field" maxLength={1000} /></Field>
          <Field label="Outcome (optional)"><input name="outcome" className="field" maxLength={1000} /></Field>
          <Actions busy={busy} error={error} label="Save follow-up" onCancel={close} />
        </form>
      )}
    </Expandable>
  );
}

export function ReferralForm({ concernId, noteTeams }: { concernId: number; noteTeams: string[] }) {
  const { busy, error, submit } = useSubmit(`/api/concerns/${concernId}`);
  const [team, setTeam] = useState('SSP');
  return (
    <Expandable label="Refer to a support team">
      {(close) => (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await submit({ ...values(e.currentTarget), action: 'referral' })) close();
        }}>
          <Field label="Refer to" wide>
            <select name="team" className="field" value={team} onChange={(e) => setTeam(e.currentTarget.value)}>
              {Object.entries(TEAM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          {noteTeams.includes(team) ? (
            <Field label="Restricted note (optional; visible only to roles allowed to see notes for this team)" wide>
              <textarea name="note" rows={2} className="field py-2" maxLength={2000} />
            </Field>
          ) : (
            <p className="text-xs text-ink-muted sm:col-span-2">
              Only the referral, its date, destination and status are recorded. Your role cannot add restricted notes for this team.
            </p>
          )}
          <Actions busy={busy} error={error} label="Send referral" onCancel={close} />
        </form>
      )}
    </Expandable>
  );
}

export function ReferralStatusControl({ concernId, referralId, status }: { concernId: number; referralId: number; status: string }) {
  const { busy, error, submit } = useSubmit(`/api/concerns/${concernId}`);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs font-semibold">
        <span className="sr-only">Referral status</span>
        <select className="field min-h-[36px] py-1 text-sm" value={status} disabled={busy}
          onChange={(e) => void submit({ action: 'referral_status', referralId, status: e.currentTarget.value })}>
          {Object.entries(REFERRAL_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

export function ReferralNoteForm({ concernId, referralId }: { concernId: number; referralId: number }) {
  const { busy, error, submit } = useSubmit(`/api/concerns/${concernId}`);
  return (
    <Expandable label="Add restricted note">
      {(close) => (
        <form className="grid gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await submit({ ...values(e.currentTarget), action: 'referral_note', referralId })) close();
        }}>
          <textarea name="note" rows={2} className="field py-2" required minLength={2} maxLength={2000} aria-label="Restricted note" />
          <Actions busy={busy} error={error} label="Save note" onCancel={close} />
        </form>
      )}
    </Expandable>
  );
}

