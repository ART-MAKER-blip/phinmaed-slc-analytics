// Same order as the role table in db/migrations/002_schema.sql. A user with several roles
// sees the dashboard of the first one in this order.
export const ROLES = [
  { id: 'slc', label: 'Student Learning Coordinator', shortLabel: 'SLC' },
  { id: 'tl', label: 'Team Learning Lead', shortLabel: 'Team Learning' },
  { id: 'coo', label: 'Chief Operating Officer', shortLabel: 'COO' },
  { id: 'admin', label: 'System Administrator', shortLabel: 'Administrator' },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];

export function isRoleId(value: string): value is RoleId {
  return ROLES.some((role) => role.id === value);
}

export function getRoleLabel(roleId: RoleId) {
  return ROLES.find((role) => role.id === roleId)?.label ?? ROLES[0].label;
}
