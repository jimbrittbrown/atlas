import { randomUUID } from 'node:crypto';

export const DataAvailabilityStatuses = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  PARTIAL: 'PARTIAL',
  UNAVAILABLE: 'UNAVAILABLE',
  NOT_CONNECTED: 'NOT_CONNECTED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  ESTIMATED: 'ESTIMATED'
});

export const AlertSeverityLevels = Object.freeze({
  INFO: 'INFO',
  WARNING: 'WARNING',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

export const ActivitySeverityLevels = Object.freeze({
  INFO: 'INFO',
  WARNING: 'WARNING',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

export const RequiredDashboardSections = Object.freeze([
  'executiveOverview',
  'ceoDecisionCenter',
  'missionOrchestrator',
  'operationsLoop',
  'websiteProduction',
  'websiteBusinessLaunch',
  'missionControl',
  'workforce',
  'customerPipeline',
  'opportunityPortfolio',
  'providerHealth',
  'systemHealth',
  'activityFeed',
  'alerts',
  'generatedAt',
  'dataFreshness',
  'missingData',
  'limitations',
  'recommendedExecutiveActions'
]);

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export function createDecisionCenterItem({
  relatedCustomer = null,
  relatedMission = null,
  decisionType,
  recommendation,
  confidence,
  risk,
  estimatedCost,
  expectedValue,
  urgency,
  age,
  blockingIssues = [],
  requiredCeoAction,
  sourceReportPath = null,
  metadata = {}
} = {}) {
  return {
    decisionId: `decision_item_${randomUUID()}`,
    relatedCustomer,
    relatedMission,
    decisionType,
    recommendation,
    confidence,
    risk,
    estimatedCost,
    expectedValue,
    urgency,
    age,
    blockingIssues,
    requiredCeoAction,
    sourceReportPath,
    metadata
  };
}

export function createExecutiveActivityEvent({
  severity = ActivitySeverityLevels.INFO,
  category,
  title,
  description,
  customerId = null,
  missionId = null,
  workerId = null,
  sourceSystem,
  relatedReport = null,
  recommendedAction = null,
  timestamp,
  eventId
} = {}, { now } = {}) {
  return {
    eventId: eventId ?? `evt_${randomUUID()}`,
    timestamp: timestamp ?? isoNow(now),
    severity,
    category,
    title,
    description,
    customerId,
    missionId,
    workerId,
    sourceSystem,
    relatedReport,
    recommendedAction
  };
}

export function createExecutiveAlert({
  category,
  severity,
  title,
  description,
  sourceSystem,
  missionId = null,
  customerId = null,
  relatedEventId = null,
  recommendedAction = null,
  timestamp
} = {}, { now } = {}) {
  return {
    alertId: `alert_${randomUUID()}`,
    category,
    severity,
    title,
    description,
    sourceSystem,
    missionId,
    customerId,
    relatedEventId,
    recommendedAction,
    timestamp: timestamp ?? isoNow(now)
  };
}

export function createDataFreshnessRecord({ section, status, checkedAt, notes = [] } = {}, { now } = {}) {
  return {
    section,
    status,
    checkedAt: checkedAt ?? isoNow(now),
    notes
  };
}

export function validateExecutiveOperationsSnapshot(snapshot = {}) {
  const issues = [];

  RequiredDashboardSections.forEach((section) => {
    if (!(section in snapshot)) {
      issues.push(`Missing required dashboard section: ${section}`);
    }
  });

  if (!Array.isArray(snapshot.missingData)) {
    issues.push('missingData must be an array.');
  }

  if (!Array.isArray(snapshot.limitations)) {
    issues.push('limitations must be an array.');
  }

  if (!Array.isArray(snapshot.recommendedExecutiveActions)) {
    issues.push('recommendedExecutiveActions must be an array.');
  }

  if (typeof snapshot.generatedAt !== 'string' || snapshot.generatedAt.length === 0) {
    issues.push('generatedAt must be a non-empty ISO timestamp string.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
