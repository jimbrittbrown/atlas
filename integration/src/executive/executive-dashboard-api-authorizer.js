import { RolePermissions } from './executive-dashboard-api-contracts.js';

export class ExecutiveDashboardApiAuthorizer {
  hasPermission(role, permission) {
    const permissions = RolePermissions[role] ?? [];
    return permissions.includes('*') || permissions.includes(permission);
  }

  authorize({ role, permission } = {}) {
    if (!role) {
      return {
        allowed: false,
        reason: 'No authenticated role found.'
      };
    }

    if (!permission) {
      return {
        allowed: false,
        reason: 'No permission requirement specified.'
      };
    }

    if (!this.hasPermission(role, permission)) {
      return {
        allowed: false,
        reason: `Role ${role} is not permitted for ${permission}.`
      };
    }

    return {
      allowed: true,
      reason: null
    };
  }
}
