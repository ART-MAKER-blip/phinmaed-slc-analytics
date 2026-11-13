/**
 * Who may see and do what on a concern. Pure functions so the rules are unit tested and
 * shared by the server (enforcement) and the pages (which buttons to show).
 *
 * Proposal delimitation: SSP and KSH receive "only the information needed to act" and
 * referrals record only the fact, date, destination and status, plus restricted notes
 * where policy allows.
 */
import type { AccessUser } from '@/lib/access';
import { hasPermission } from '@/lib/access';
import type { RoleId } from '@/lib/roles';

export const REFERRAL_TEAMS = ['ALC', 'SSP', 'KSH'] as const;
export type ReferralTeam = (typeof REFERRAL_TEAMS)[number];

/** The referral team each support role works for. */
export const ROLE_TEAMS: Partial<Record<RoleId, ReferralTeam>> = { alc: 'ALC', ssp: 'SSP', ksh: 'KSH' };

export const CONCERN_STATUSES = ['open', 'in_progress', 'closed'] as const;
export const INTERVENTION_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export const REFERRAL_STATUSES = ['sent', 'acknowledged', 'in_progress', 'closed'] as const;
export type ConcernStatus = (typeof CONCERN_STATUSES)[number];
export type InterventionStatus = (typeof INTERVENTION_STATUSES)[number];
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/**
 * full  – coordinates the concern (SLC, Dean, ALC within scope): sees everything except
 *         notes it has no permission for.
 * team  – a support team the concern was referred to: sees the concern and its own
 *         team's referrals only.
 * owner – owns an intervention on the concern: sees the concern and own interventions.
 */
export type AccessLevel = 'full' | 'team' | 'owner';

type User = Pick<AccessUser, 'roles' | 'permissions'> & { id: string };

export function userTeams(user: Pick<AccessUser, 'roles'>): ReferralTeam[] {
  return [...new Set(user.roles.map((r) => ROLE_TEAMS[r]).filter((t): t is ReferralTeam => Boolean(t)))];
}

export function coordinates(user: Pick<AccessUser, 'permissions'>) {
  return ['concern.manage', 'deliberation.record', 'referral.create'].some((p) => hasPermission(user, p as never));
}

/** Programs list check for a concern: by the student's program or the subject's programs. */
export function concernInProgramScope(
  programs: 'all' | string[],
  concern: { studentProgram: string | null; coursePrograms: string[] },
) {
  if (programs === 'all') return true;
  if (concern.studentProgram) return programs.includes(concern.studentProgram);
  return concern.coursePrograms.some((p) => programs.includes(p));
}

export function concernAccess(
  user: User,
  facts: { inScope: boolean; campusInScope: boolean; referralTeams: string[]; interventionOwners: string[] },
): AccessLevel | null {
  if (facts.inScope && coordinates(user)) return 'full';
  const teams = userTeams(user);
  if (facts.campusInScope && hasPermission(user, 'referral.view') && facts.referralTeams.some((t) => teams.includes(t as ReferralTeam))) {
    return 'team';
  }
  if (facts.interventionOwners.includes(user.id)) return 'owner';
  return null;
}

/** Restricted notes: permission, and for team staff only their own team's referrals. */
export function canSeeNotes(user: Pick<AccessUser, 'roles' | 'permissions'>, team: string) {
  if (!hasPermission(user, 'referral_note.view')) return false;
  const teams = userTeams(user);
  return teams.length === 0 || teams.includes(team as ReferralTeam);
}

export function canAddNote(user: Pick<AccessUser, 'roles' | 'permissions'>, team: string) {
  if (!hasPermission(user, 'referral_note.create')) return false;
  const teams = userTeams(user);
  return teams.length === 0 || teams.includes(team as ReferralTeam);
}

/** Referrals a user may see on a concern they can open. */
export function canSeeReferral(user: Pick<AccessUser, 'roles' | 'permissions'>, level: AccessLevel, team: string) {
  if (level === 'full') return hasPermission(user, 'referral.view') || hasPermission(user, 'referral.create');
  if (level === 'team') return userTeams(user).includes(team as ReferralTeam);
  return false;
}

export function canUpdateReferral(user: Pick<AccessUser, 'roles' | 'permissions'>, level: AccessLevel, team: string) {
  return (level === 'full' && hasPermission(user, 'referral.create')) || userTeams(user).includes(team as ReferralTeam);
}

export function canUpdateIntervention(user: User, level: AccessLevel, ownerId: string) {
  return (level === 'full' && hasPermission(user, 'intervention.manage')) || ownerId === user.id;
}

export function canSeeIntervention(user: User, level: AccessLevel, ownerId: string) {
  return level === 'full' || ownerId === user.id;
}

/* ---- Input checks ---- */

export class InputError extends Error {}

export function text(value: unknown, label: string, { min = 1, max = 2000, optional = false } = {}): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v === '') {
    if (optional) return null;
    throw new InputError(`${label} is required.`);
  }
  if (v.length < min || v.length > max) throw new InputError(`${label} must be ${min} to ${max} characters.`);
  return v;
}

export function isoDate(value: unknown, label: string, { optional = false } = {}): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v === '') {
    if (optional) return null;
    throw new InputError(`${label} is required.`);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!date || date.toISOString().slice(0, 10) !== v || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) {
    throw new InputError(`${label} must be a valid date.`);
  }
  return v;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new InputError(`Choose a valid ${label}.`);
}
