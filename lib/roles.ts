// Same order as the role table in db/migrations/002_erd_schema.sql. A user with several
// roles sees the dashboard of the first one in this order.
export const ROLES = [
  { id: 'slc', label: 'Student Learning Coordinator', shortLabel: 'SLC' },
  { id: 'dean', label: 'Dean / Program Head', shortLabel: 'Dean' },
  { id: 'faculty', label: 'Faculty / Teacher', shortLabel: 'Faculty' },
  { id: 'alc', label: 'Active Learning Coordinator', shortLabel: 'ALC' },
  { id: 'ssp', label: 'SSP Adviser / Coordinator', shortLabel: 'SSP' },
  { id: 'ksh', label: 'Kasama Support Hub Staff', shortLabel: 'KSH' },
  { id: 'coo', label: 'Chief Operating Officer', shortLabel: 'COO' },
  { id: 'dod', label: 'Dean of Deans', shortLabel: 'Dean of Deans' },
  { id: 'tl', label: 'Team Learning / PEN-wide Leadership', shortLabel: 'Team Learning' },
  { id: 'data_manager', label: 'Data Manager', shortLabel: 'Data Manager' },
  { id: 'admin', label: 'System Administrator', shortLabel: 'Administrator' },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];

export function isRoleId(value: string): value is RoleId {
  return ROLES.some((role) => role.id === value);
}

export function getRoleLabel(roleId: RoleId) {
  return ROLES.find((role) => role.id === roleId)?.label ?? ROLES[0].label;
}
