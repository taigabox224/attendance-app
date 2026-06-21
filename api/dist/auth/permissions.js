export const ROLES = ['sysadmin', 'editor', 'viewer'];
const ROLE_LEVEL = {
    sysadmin: 3,
    editor: 2,
    viewer: 1,
};
export function hasMinimumRole(actual, required) {
    return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}
export function isRole(value) {
    return typeof value === 'string' && ROLES.includes(value);
}
//# sourceMappingURL=permissions.js.map