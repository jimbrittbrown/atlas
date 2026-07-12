import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

export const CeoDecisionCenterVersion = 'v1';

export const DecisionActions = Object.freeze({
  APPROVE: 'APPROVE',
  APPROVE_WITH_CONDITIONS: 'APPROVE_WITH_CONDITIONS',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  REJECT: 'REJECT'
});

export const DecisionCenterSections = Object.freeze([
  'executiveReviews',
  'blockedMissions',
  'opportunities',
  'risks',
  'decisionHistory',
  'dashboardHealth'
]);

export function waitingHoursFrom(timestamp) {
  if (!timestamp) return null;
  const delta = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(delta) || delta < 0) return null;
  return Number((delta / (1000 * 60 * 60)).toFixed(2));
}

export function evaluateRiskSeverity({ alertCount = 0, providerFailures = 0, blockedCount = 0 } = {}) {
  if (providerFailures > 0) return 'HIGH';
  if (blockedCount >= 3) return 'HIGH';
  if (alertCount > 0) return 'WARNING';
  return 'INFO';
}

export function validateDecisionCenterPayload(payload = {}) {
  const issues = [];

  for (const section of DecisionCenterSections) {
    if (!(section in payload)) issues.push(`Missing section: ${section}`);
  }

  if (!Array.isArray(payload.executiveReviews)) issues.push('executiveReviews must be an array.');
  if (!Array.isArray(payload.blockedMissions)) issues.push('blockedMissions must be an array.');
  if (!Array.isArray(payload.opportunities)) issues.push('opportunities must be an array.');
  if (!Array.isArray(payload.risks)) issues.push('risks must be an array.');
  if (!Array.isArray(payload.decisionHistory)) issues.push('decisionHistory must be an array.');
  if (!payload.dashboardHealth || typeof payload.dashboardHealth !== 'object') issues.push('dashboardHealth must be an object.');

  if (!Object.values(DataAvailabilityStatuses).includes(String(payload.dashboardHealth?.status ?? '').toUpperCase())) {
    issues.push('dashboardHealth.status must be a valid availability status.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
