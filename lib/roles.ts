export const ROLES = [
  { id: 'slc', label: 'Student Learning Coordinator', shortLabel: 'SLC', canSeeRestricted: true },
  { id: 'dean', label: 'Dean / Program Head', shortLabel: 'Dean', canSeeRestricted: false },
  { id: 'alc', label: 'Active Learning Coordinator', shortLabel: 'ALC', canSeeRestricted: false },
  { id: 'ssp', label: 'SSP Adviser', shortLabel: 'SSP', canSeeRestricted: false },
  { id: 'ksh', label: 'Kasama Support Hub Staff', shortLabel: 'KSH', canSeeRestricted: true },
  { id: 'coo', label: 'Chief Operating Officer', shortLabel: 'COO', canSeeRestricted: false },
  { id: 'admin', label: 'System Administrator', shortLabel: 'Administrator', canSeeRestricted: false },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];

export function isRoleId(value: string): value is RoleId {
  return ROLES.some((role) => role.id === value);
}

export function getRoleLabel(roleId: RoleId) {
  return ROLES.find((role) => role.id === roleId)?.label ?? ROLES[0].label;
}