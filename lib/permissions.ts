import type { RoleId } from '@/lib/roles';

export const PERMISSIONS = [
  'import.upload',
  'import.view',
  'zones.calculate',
  'results.student',
  'results.subject',
  'results.teacher',
  'results.compare_campus',
  'concern.manage',
  'deliberation.record',
  'intervention.manage',
  'referral.create',
  'referral.view',
  'referral_note.view',
  'referral_note.create',
  'report.generate',
  'report.view',
  'rules.configure',
  'rules.approve',
  'admin.reference_data',
  'admin.users',
  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role permissions. The database (role_permission) is the source of truth for real
 * accounts; this copy is used for development demo accounts, which have no database.
 * lib/access.test.ts fails if the two drift apart.
 */
export const ROLE_PERMISSIONS: Record<RoleId, readonly Permission[]> = {
  slc: ['import.upload', 'import.view', 'zones.calculate', 'results.student', 'results.subject',
    'results.teacher', 'concern.manage', 'deliberation.record', 'intervention.manage',
    'referral.create', 'referral.view', 'referral_note.view', 'referral_note.create',
    'report.generate', 'report.view'],
  tl: ['results.student', 'results.subject', 'results.teacher', 'results.compare_campus',
    'report.generate', 'report.view', 'rules.approve'],
  coo: ['results.student', 'results.subject', 'results.teacher', 'results.compare_campus',
    'report.generate', 'report.view'],
  admin: ['import.upload', 'import.view', 'zones.calculate', 'rules.configure',
    'admin.reference_data', 'admin.users', 'audit.view'],
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
