import type { RoleId } from '@/lib/roles';

export const PERMISSIONS = [
  'import.upload',
  'import.view',
  'zones.calculate',
  'results.student',
  'results.subject',
  'results.teacher',
  'results.own_classes',
  'results.compare_campus',
  'concern.manage',
  'deliberation.record',
  'intervention.manage',
  'intervention.own',
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
  slc: ['import.view', 'results.student', 'results.subject', 'results.teacher',
    'concern.manage', 'deliberation.record', 'intervention.manage',
    'referral.create', 'referral.view', 'referral_note.view', 'referral_note.create',
    'report.generate', 'report.view'],
  dean: ['results.student', 'results.subject', 'results.teacher', 'concern.manage',
    'deliberation.record', 'intervention.manage', 'referral.create', 'referral.view',
    'report.generate', 'report.view'],
  faculty: ['results.own_classes', 'intervention.own'],
  alc: ['results.subject', 'results.teacher', 'concern.manage', 'intervention.manage',
    'referral.view', 'report.view'],
  ssp: ['referral.view', 'referral_note.view', 'referral_note.create', 'intervention.own'],
  ksh: ['referral.view', 'referral_note.view', 'referral_note.create', 'intervention.own'],
  coo: ['results.student', 'results.subject', 'results.compare_campus',
    'report.generate', 'report.view', 'rules.approve'],
  dod: ['results.student', 'results.subject', 'results.compare_campus',
    'report.generate', 'report.view', 'rules.approve'],
  tl: ['results.student', 'results.subject', 'results.compare_campus',
    'report.generate', 'report.view'],
  data_manager: ['import.upload', 'import.view', 'zones.calculate'],
  admin: ['import.upload', 'import.view', 'zones.calculate', 'rules.configure',
    'admin.reference_data', 'admin.users', 'audit.view'],
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
