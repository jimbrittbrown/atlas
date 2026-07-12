export const ExecutiveDashboardApiVersion = 'v1';
export const ExecutiveDashboardVersion = 'v1';

export const ApiErrorCodes = Object.freeze({
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  STALE_EXPECTED_STATE: 'STALE_EXPECTED_STATE',
  DUPLICATE_COMMAND: 'DUPLICATE_COMMAND',
  RATE_LIMITED: 'RATE_LIMITED',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
});

export const ApiRoles = Object.freeze({
  CEO: 'CEO',
  EXECUTIVE: 'EXECUTIVE',
  OPERATOR: 'OPERATOR',
  VIEWER: 'VIEWER',
  AUDITOR: 'AUDITOR',
  CUSTOMER: 'CUSTOMER',
  READ_ONLY_SERVICE: 'READ_ONLY_SERVICE'
});

export const RolePermissions = Object.freeze({
  [ApiRoles.CEO]: ['*'],
  [ApiRoles.EXECUTIVE]: [
    'dashboard:overview',
    'dashboard:decisions',
    'dashboard:ceo-decision-center',
    'dashboard:mission-orchestrator',
    'dashboard:operations-loop',
    'dashboard:website-production',
    'mission-control:read:list',
    'mission-control:read:get',
    'mission-control:command:retry',
    'mission-control:command:resume',
    'mission-control:command:pause',
    'dashboard:missions',
    'dashboard:opportunities',
    'dashboard:customers',
    'dashboard:providers',
    'dashboard:system-health',
    'dashboard:alerts',
    'dashboard:health',
    'dashboard:metadata',
    'dashboard:snapshots:list',
    'dashboard:snapshots:get'
  ],
  [ApiRoles.OPERATOR]: [
    'dashboard:missions',
    'dashboard:workforce',
    'dashboard:providers',
    'dashboard:system-health',
    'dashboard:activity',
    'dashboard:alerts',
    'dashboard:health',
    'dashboard:metadata'
  ],
  [ApiRoles.VIEWER]: [
    'dashboard:overview',
    'dashboard:decisions',
    'dashboard:mission-orchestrator',
    'dashboard:operations-loop',
    'dashboard:website-production',
    'mission-control:read:list',
    'mission-control:read:get',
    'dashboard:health',
    'dashboard:metadata'
  ],
  [ApiRoles.AUDITOR]: [
    'dashboard:snapshots:list',
    'dashboard:snapshots:get',
    'dashboard:system-health',
    'dashboard:activity',
    'dashboard:health',
    'dashboard:metadata',
    'dashboard:governance'
  ],
  [ApiRoles.CUSTOMER]: [
    'customer:login',
    'customer:register',
    'customer:logout',
    'customer:session:refresh',
    'customer:session:current',
    'customer:password-reset:request',
    'customer:password-reset:complete',
    'customer:sessions:revoke-all',
    'customer:auth:health',
    'customer:payments:checkout',
    'customer:payments:history',
    'customer:payments:health',
    'customer:projects:list',
    'customer:projects:get',
    'customer:request:create',
    'customer:revision:create',
    'customer:completion:approve',
    'customer:downloads:get',
    'customer:downloads:issue',
    'customer:downloads:redeem',
    'dashboard:health',
    'dashboard:metadata'
  ],
  [ApiRoles.READ_ONLY_SERVICE]: [
    'dashboard:full',
    'dashboard:health',
    'dashboard:metadata',
    'payments:webhook:ingest'
  ]
});

export const RouteDefinitions = Object.freeze([
  { method: 'GET', path: '/api/v1/dashboard', permission: 'dashboard:full' },
  { method: 'GET', path: '/api/v1/ceo/decision-center', permission: 'dashboard:ceo-decision-center' },
  { method: 'GET', path: '/api/v1/mission-orchestrator', permission: 'dashboard:mission-orchestrator' },
  { method: 'GET', path: '/api/v1/operations-loop', permission: 'dashboard:operations-loop' },
  { method: 'GET', path: '/api/v1/website-production', permission: 'dashboard:website-production' },
  { method: 'GET', path: '/api/v1/mission-control', permission: 'mission-control:read:list' },
  { method: 'GET', path: '/api/v1/mission-control/:missionId', permission: 'mission-control:read:get' },
  { method: 'GET', path: '/api/v1/customer/projects', permission: 'customer:projects:list' },
  { method: 'GET', path: '/api/v1/customer/project/:id', permission: 'customer:projects:get' },
  { method: 'POST', path: '/api/v1/customer/register', permission: 'customer:register' },
  { method: 'POST', path: '/api/v1/customer/login', permission: 'customer:login' },
  { method: 'POST', path: '/api/v1/customer/logout', permission: 'customer:logout' },
  { method: 'POST', path: '/api/v1/customer/session/refresh', permission: 'customer:session:refresh' },
  { method: 'GET', path: '/api/v1/customer/session', permission: 'customer:session:current' },
  { method: 'POST', path: '/api/v1/customer/password-reset/request', permission: 'customer:password-reset:request' },
  { method: 'POST', path: '/api/v1/customer/password-reset/complete', permission: 'customer:password-reset:complete' },
  { method: 'POST', path: '/api/v1/customer/sessions/revoke-all', permission: 'customer:sessions:revoke-all' },
  { method: 'GET', path: '/api/v1/customer/auth/health', permission: 'customer:auth:health' },
  { method: 'POST', path: '/api/v1/customer/payments/checkout', permission: 'customer:payments:checkout' },
  { method: 'GET', path: '/api/v1/customer/payments/history', permission: 'customer:payments:history' },
  { method: 'GET', path: '/api/v1/customer/payments/health', permission: 'customer:payments:health' },
  { method: 'POST', path: '/api/v1/customer/request', permission: 'customer:request:create' },
  { method: 'POST', path: '/api/v1/customer/revision', permission: 'customer:revision:create' },
  { method: 'POST', path: '/api/v1/customer/project/:id/approve', permission: 'customer:completion:approve' },
  { method: 'GET', path: '/api/v1/customer/downloads/:id', permission: 'customer:downloads:get' },
  { method: 'POST', path: '/api/v1/customer/downloads/:id/authorize', permission: 'customer:downloads:issue' },
  { method: 'POST', path: '/api/v1/customer/downloads/redeem', permission: 'customer:downloads:redeem' },
  { method: 'POST', path: '/api/v1/mission-control/:missionId/retry', permission: 'mission-control:command:retry' },
  { method: 'POST', path: '/api/v1/mission-control/:missionId/resume', permission: 'mission-control:command:resume' },
  { method: 'POST', path: '/api/v1/mission-control/:missionId/rollback', permission: 'mission-control:command:rollback' },
  { method: 'POST', path: '/api/v1/mission-control/:missionId/cancel', permission: 'mission-control:command:cancel' },
  { method: 'POST', path: '/api/v1/mission-control/:missionId/pause', permission: 'mission-control:command:pause' },
  { method: 'POST', path: '/api/v1/mission-control/:missionId/force-executive-review', permission: 'mission-control:command:force-review' },
  { method: 'GET', path: '/api/v1/dashboard/overview', permission: 'dashboard:overview' },
  { method: 'GET', path: '/api/v1/dashboard/decisions', permission: 'dashboard:decisions' },
  { method: 'GET', path: '/api/v1/dashboard/missions', permission: 'dashboard:missions' },
  { method: 'GET', path: '/api/v1/dashboard/workforce', permission: 'dashboard:workforce' },
  { method: 'GET', path: '/api/v1/dashboard/customers', permission: 'dashboard:customers' },
  { method: 'GET', path: '/api/v1/dashboard/opportunities', permission: 'dashboard:opportunities' },
  { method: 'GET', path: '/api/v1/dashboard/providers', permission: 'dashboard:providers' },
  { method: 'GET', path: '/api/v1/dashboard/system-health', permission: 'dashboard:system-health' },
  { method: 'GET', path: '/api/v1/dashboard/activity', permission: 'dashboard:activity' },
  { method: 'GET', path: '/api/v1/dashboard/alerts', permission: 'dashboard:alerts' },
  { method: 'GET', path: '/api/v1/dashboard/snapshots', permission: 'dashboard:snapshots:list' },
  { method: 'GET', path: '/api/v1/dashboard/snapshots/:snapshotId', permission: 'dashboard:snapshots:get' },
  { method: 'GET', path: '/api/v1/dashboard/health', permission: 'dashboard:health' },
  { method: 'GET', path: '/api/v1/dashboard/metadata', permission: 'dashboard:metadata' },
  { method: 'POST', path: '/api/v1/payments/webhook/stripe', permission: 'payments:webhook:ingest' }
]);

export const SupportedFilters = Object.freeze({
  decisions: ['decisionType', 'recommendation', 'urgency', 'risk', 'customer', 'mission', 'age', 'blockingStatus'],
  missions: ['state', 'stage', 'missionType', 'customer', 'worker', 'priority', 'confidence', 'risk', 'ceoReviewStatus', 'blockedStatus'],
  activity: ['severity', 'category', 'sourceSystem', 'customer', 'mission', 'worker', 'startTimestamp', 'endTimestamp'],
  alerts: ['severity', 'category', 'source', 'resolvedStatus', 'customer', 'mission']
});

export const SortingDefaults = Object.freeze({
  decisions: { field: 'urgency', direction: 'desc' },
  missions: { field: 'missionId', direction: 'asc' },
  activity: { field: 'timestamp', direction: 'desc' },
  alerts: { field: 'timestamp', direction: 'desc' },
  snapshots: { field: 'createdAt', direction: 'desc' }
});

export const PaginationDefaults = Object.freeze({
  page: 1,
  pageSize: 25,
  maxPageSize: 100
});

export function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function parsePageAndSize(query = {}, maxPageSize = PaginationDefaults.maxPageSize) {
  const page = parsePositiveInt(query.page, PaginationDefaults.page);
  const requestedSize = parsePositiveInt(query.pageSize, PaginationDefaults.pageSize);
  const pageSize = Math.min(requestedSize, maxPageSize);
  return { page, pageSize, maxPageSizeEnforced: requestedSize > maxPageSize };
}

export function validateFilters(query = {}, allowedFilters = []) {
  const allowed = new Set(allowedFilters);
  const invalid = Object.keys(query).filter((key) => !allowed.has(key) && key !== 'page' && key !== 'pageSize' && key !== 'sortBy' && key !== 'sortDirection');
  return {
    isValid: invalid.length === 0,
    invalid
  };
}
