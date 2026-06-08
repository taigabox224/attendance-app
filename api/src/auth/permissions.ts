export const ROLES = ['sysadmin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

const ROLE_LEVEL: Record<Role, number> = {
  sysadmin: 3,
  editor: 2,
  viewer: 1,
};

export function hasMinimumRole(actual: Role, required: Role): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
