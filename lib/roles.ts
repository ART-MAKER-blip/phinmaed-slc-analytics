export const ROLES = [
  { id: 'slc', label: 'Student Learning Coordinator', shortLabel: 'SLC' },
  { id: 'dean', label: 'Dean / Program Head', shortLabel: 'Dean' },
  { id: 'alc', label: 'Active Learning Coordinator', shortLabel: 'ALC' },
  { id: 'ssp', label: 'SSP Adviser', shortLabel: 'SSP' },
  { id: 'ksh', label: 'Kasama Support Hub Staff', shortLabel: 'KSH' },
  { id: 'coo', label: 'Chief Operating Officer', shortLabel: 'COO' },
  { id: 'admin', label: 'System Administrator', shortLabel: 'Administrator' },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];

export function getRoleLabel(roleId: RoleId) {
  return ROLES.find((role) => role.id === roleId)?.label ?? ROLES[0].label;
}