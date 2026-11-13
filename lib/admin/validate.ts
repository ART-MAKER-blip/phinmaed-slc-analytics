/**
 * Input rules for the administration screens. Pure functions, unit tested; the server
 * calls them before every change.
 */
import { InputError } from '@/lib/concerns/rules';
import { isRoleId, type RoleId } from '@/lib/roles';
import { validateThresholds, type ZoneThreshold } from '@/lib/zones';

export { InputError };

export type Assignment = { role: RoleId; campus: string | null; program: string | null };

export function parseName(value: unknown) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 120) throw new InputError('Enter a name of 2 to 120 characters.');
  return name;
}

export function parseEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Enter a valid email address.');
  return email;
}

export function parsePassword(value: unknown) {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 12 || password.length > 1024) throw new InputError('Passwords must be at least 12 characters.');
  return password;
}

/**
 * Role assignments from the form: [{ role, campus, program }], where '' or null means "all".
 * A program without a campus is not allowed, so a scope always names where it applies.
 */
export function parseAssignments(
  value: unknown,
  known: { campuses: string[]; programs: string[] },
): Assignment[] {
  if (!Array.isArray(value)) throw new InputError('Choose at least one role.');
  const seen = new Set<string>();
  const rows: Assignment[] = [];
  for (const item of value.slice(0, 100)) {
    if (!item || typeof item !== 'object') throw new InputError('Invalid role assignment.');
    const { role, campus, program } = item as Record<string, unknown>;
    if (typeof role !== 'string' || !isRoleId(role)) throw new InputError('Choose a valid role.');
    const c = typeof campus === 'string' && campus !== '' ? campus : null;
    const p = typeof program === 'string' && program !== '' ? program : null;
    if (c !== null && !known.campuses.includes(c)) throw new InputError(`Unknown campus ${c}.`);
    if (p !== null && !known.programs.includes(p)) throw new InputError(`Unknown program ${p}.`);
    if (p !== null && c === null) throw new InputError('Choose a campus for a program scope.');
    const key = `${role}|${c}|${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ role, campus: c, program: p });
  }
  if (rows.length === 0) throw new InputError('Choose at least one role.');
  return rows;
}

/**
 * Stops changes that would lock everyone out: an administrator cannot deactivate or demote
 * themselves, and at least one other active administrator must remain otherwise.
 */
export function checkAdminLockout(input: {
  actorId: string;
  targetId: string;
  targetWasAdmin: boolean;
  targetWillBeAdmin: boolean;
  targetWillBeActive: boolean;
  otherActiveAdmins: number;
}) {
  const losesAdmin = input.targetWasAdmin && (!input.targetWillBeAdmin || !input.targetWillBeActive);
  if (!losesAdmin) return;
  if (input.actorId === input.targetId) {
    throw new InputError('You cannot remove your own administrator access or deactivate yourself. Ask another administrator.');
  }
  if (input.otherActiveAdmins === 0) throw new InputError('At least one active system administrator must remain.');
}

/** Builds stored thresholds from the four numbers an administrator edits. */
export function thresholdsFromForm(value: Record<string, unknown>): ZoneThreshold[] {
  const num = (key: string, label: string) => {
    const n = Number(value[key]);
    if (value[key] === '' || value[key] === undefined || !Number.isFinite(n)) throw new InputError(`${label} must be a number.`);
    return n;
  };
  const yellowFrom = num('studentYellowFrom', 'Student yellow starts at');
  const redFrom = num('studentRedFrom', 'Student red starts at');
  const greenMax = num('subjectGreenMax', 'Subject green ends at');
  const yellowMax = num('subjectYellowMax', 'Subject yellow ends at');
  if (!Number.isInteger(yellowFrom) || !Number.isInteger(redFrom) || yellowFrom < 1 || redFrom <= yellowFrom) {
    throw new InputError('Student thresholds must be whole numbers with yellow starting at 1 or more and red after yellow.');
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (round2(greenMax) !== greenMax || round2(yellowMax) !== yellowMax || greenMax < 0 || yellowMax <= greenMax || yellowMax >= 100) {
    throw new InputError('Subject limits need at most 2 decimals, with green below yellow and yellow below 100%.');
  }
  const thresholds: ZoneThreshold[] = [
    { level: 'student', zone: 'green', min: 0, max: yellowFrom - 1 },
    { level: 'student', zone: 'yellow', min: yellowFrom, max: redFrom - 1 },
    { level: 'student', zone: 'red', min: redFrom, max: null },
    { level: 'subject', zone: 'green', min: 0, max: greenMax },
    { level: 'subject', zone: 'yellow', min: round2(greenMax + 0.01), max: yellowMax },
    { level: 'subject', zone: 'red', min: round2(yellowMax + 0.01), max: 100 },
  ];
  const errors = validateThresholds(thresholds);
  if (errors.length) throw new InputError(errors.join(' '));
  return thresholds;
}

/** Term codes are compared as text to order terms, so the format is fixed: YYYY-N. */
export function parseTermCode(value: unknown) {
  const code = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-[1-3]$/.test(code)) throw new InputError('Term code must look like 2026-1 (year, then 1, 2 or 3 for the term).');
  return code;
}

export function parseCode(value: unknown, label: string) {
  const code = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z][A-Za-z0-9-]{1,19}$/.test(code)) throw new InputError(`${label} must be 2 to 20 letters, digits or dashes, starting with a letter.`);
  return code;
}
