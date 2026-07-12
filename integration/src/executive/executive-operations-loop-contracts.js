import { randomUUID } from 'node:crypto';

export const ExecutiveOperationsLoopStates = Object.freeze({
  STOPPED: 'STOPPED',
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  SLEEPING: 'SLEEPING',
  PAUSED: 'PAUSED',
  DEGRADED: 'DEGRADED',
  STOPPING: 'STOPPING',
  FAILED: 'FAILED'
});

export const ExecutiveOperationsCycleStates = Object.freeze({
  PENDING: 'PENDING',
  INSPECTING: 'INSPECTING',
  PLANNING: 'PLANNING',
  EXECUTING_SAFE_ACTIONS: 'EXECUTING_SAFE_ACTIONS',
  REPORTING: 'REPORTING',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_WARNINGS: 'COMPLETED_WITH_WARNINGS',
  FAILED: 'FAILED'
});

export const ExecutiveOperationsFindingTypes = Object.freeze({
  CUSTOMER_INTAKE_GAP: 'CUSTOMER_INTAKE_GAP',
  PENDING_PROPOSAL: 'PENDING_PROPOSAL',
  BLOCKED_MISSION: 'BLOCKED_MISSION',
  FAILED_MISSION: 'FAILED_MISSION',
  PAUSED_MISSION: 'PAUSED_MISSION',
  CEO_DECISION_REQUIRED: 'CEO_DECISION_REQUIRED',
  EXECUTIVE_REVIEW_REQUIRED: 'EXECUTIVE_REVIEW_REQUIRED',
  PROVIDER_HEALTH_WARNING: 'PROVIDER_HEALTH_WARNING',
  WORKFORCE_CAPACITY_ISSUE: 'WORKFORCE_CAPACITY_ISSUE',
  STALE_ACTIVITY: 'STALE_ACTIVITY',
  SYSTEM_HEALTH_WARNING: 'SYSTEM_HEALTH_WARNING',
  MISSING_TELEMETRY: 'MISSING_TELEMETRY',
  WEBSITE_PRODUCTION_QUEUE: 'WEBSITE_PRODUCTION_QUEUE',
  LOOP_FAILURE: 'LOOP_FAILURE'
});

export const ExecutiveOperationsActionTypes = Object.freeze({
  ROUTE_VALIDATED_INTAKE: 'ROUTE_VALIDATED_INTAKE',
  RETRY_MISSION: 'RETRY_MISSION',
  RESUME_MISSION: 'RESUME_MISSION',
  REASSIGN_WORKER: 'REASSIGN_WORKER',
  REFRESH_DASHBOARD_SNAPSHOT: 'REFRESH_DASHBOARD_SNAPSHOT',
  REFRESH_PROVIDER_HEALTH: 'REFRESH_PROVIDER_HEALTH',
  REQUEST_EXECUTIVE_REVIEW: 'REQUEST_EXECUTIVE_REVIEW',
  ESCALATE_TO_CEO_DECISION_CENTER: 'ESCALATE_TO_CEO_DECISION_CENTER',
  MARK_STALE_OPERATIONAL_RECORD: 'MARK_STALE_OPERATIONAL_RECORD'
});

export const ExecutiveOperationsAlertTypes = Object.freeze({
  CEO_APPROVAL_REQUIRED: 'CEO_APPROVAL_REQUIRED',
  MISSION_STALLED: 'MISSION_STALLED',
  MISSION_FAILED: 'MISSION_FAILED',
  REPEATED_RECOVERY_FAILURE: 'REPEATED_RECOVERY_FAILURE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  WORKFORCE_CAPACITY_ISSUE: 'WORKFORCE_CAPACITY_ISSUE',
  DEADLINE_RISK: 'DEADLINE_RISK',
  CUSTOMER_INTAKE_PROBLEM: 'CUSTOMER_INTAKE_PROBLEM',
  MISSING_REQUIRED_DATA: 'MISSING_REQUIRED_DATA',
  SYSTEM_HEALTH_DEGRADATION: 'SYSTEM_HEALTH_DEGRADATION',
  GOVERNANCE_VIOLATION_ATTEMPT: 'GOVERNANCE_VIOLATION_ATTEMPT',
  OLD_EXECUTIVE_DECISION: 'OLD_EXECUTIVE_DECISION',
  OPERATIONS_LOOP_FAILURE: 'OPERATIONS_LOOP_FAILURE'
});

export const ExecutiveOperationsRiskLevels = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

export const ExecutiveOperationsPriorityBands = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

export const ExecutiveOperationsUrgencyBands = Object.freeze({
  DEFER: 'DEFER',
  SOON: 'SOON',
  NOW: 'NOW',
  IMMEDIATE: 'IMMEDIATE'
});

function parseBool(value, fallback) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createExecutiveOperationsLoopConfig(env = process.env) {
  return {
    enabled: parseBool(env.ATLAS_OPERATIONS_LOOP_ENABLED, false),
    intervalMs: parsePositiveInt(env.ATLAS_OPERATIONS_LOOP_INTERVAL_MS, 300000),
    maxConsecutiveFailures: parsePositiveInt(env.ATLAS_OPERATIONS_LOOP_MAX_CONSECUTIVE_FAILURES, 3),
    recoveryEnabled: parseBool(env.ATLAS_OPERATIONS_LOOP_RECOVERY_ENABLED, true),
    maxRecoveryAttempts: parsePositiveInt(env.ATLAS_OPERATIONS_LOOP_MAX_RECOVERY_ATTEMPTS, 2),
    recoveryCooldownMs: parsePositiveInt(env.ATLAS_OPERATIONS_LOOP_RECOVERY_COOLDOWN_MS, 60000),
    dryRun: parseBool(env.ATLAS_OPERATIONS_LOOP_DRY_RUN, true),
    allowIntakeRouting: parseBool(env.ATLAS_OPERATIONS_LOOP_ALLOW_INTAKE_ROUTING, true),
    allowRetry: parseBool(env.ATLAS_OPERATIONS_LOOP_ALLOW_RETRY, true),
    allowResume: parseBool(env.ATLAS_OPERATIONS_LOOP_ALLOW_RESUME, true),
    allowReassignment: parseBool(env.ATLAS_OPERATIONS_LOOP_ALLOW_REASSIGNMENT, true),
    staleMissionHours: parsePositiveInt(env.ATLAS_OPERATIONS_LOOP_STALE_MISSION_HOURS, 24),
    deadlineRiskHours: parsePositiveInt(env.ATLAS_OPERATIONS_LOOP_DEADLINE_RISK_HOURS, 48),
    developmentMaxCycles: parsePositiveInt(env.ATLAS_OPERATIONS_LOOP_DEV_MAX_CYCLES, 1)
  };
}

export function sanitizeExecutiveOperationsLoopConfig(config = {}) {
  return {
    enabled: Boolean(config.enabled),
    intervalMs: Number(config.intervalMs ?? 0),
    maxConsecutiveFailures: Number(config.maxConsecutiveFailures ?? 0),
    recoveryEnabled: Boolean(config.recoveryEnabled),
    maxRecoveryAttempts: Number(config.maxRecoveryAttempts ?? 0),
    recoveryCooldownMs: Number(config.recoveryCooldownMs ?? 0),
    dryRun: Boolean(config.dryRun),
    allowIntakeRouting: Boolean(config.allowIntakeRouting),
    allowRetry: Boolean(config.allowRetry),
    allowResume: Boolean(config.allowResume),
    allowReassignment: Boolean(config.allowReassignment),
    staleMissionHours: Number(config.staleMissionHours ?? 0),
    deadlineRiskHours: Number(config.deadlineRiskHours ?? 0),
    developmentMaxCycles: Number(config.developmentMaxCycles ?? 0)
  };
}

export function createOperationalFinding({
  type,
  title,
  summary,
  sourceSystem,
  customerId = null,
  missionId = null,
  metadata = {},
  estimatedBusinessValue = null,
  estimatedRecoveryProbability = null,
  blockedDurationHours = null,
  deadlineHoursRemaining = null,
  customerImpact = 0,
  missionUrgency = 0,
  operationalRisk = 0,
  confidenceScore = 0.7
} = {}) {
  return {
    findingId: `ops_finding_${randomUUID()}`,
    type,
    title,
    summary,
    sourceSystem,
    customerId,
    missionId,
    metadata,
    estimatedBusinessValue,
    estimatedRecoveryProbability,
    blockedDurationHours,
    deadlineHoursRemaining,
    customerImpact,
    missionUrgency,
    operationalRisk,
    confidenceScore
  };
}

export function createOperationalAction({
  actionType,
  missionId = null,
  customerId = null,
  requestedRole = 'EXECUTIVE',
  reason,
  reversible = true,
  metadata = {}
} = {}) {
  return {
    actionId: `ops_action_${randomUUID()}`,
    actionType,
    missionId,
    customerId,
    requestedRole,
    reason,
    reversible,
    metadata
  };
}

export function createExecutiveOperationsAlert({
  type,
  severity,
  title,
  summary,
  sourceSystem,
  relatedCustomerId = null,
  relatedMissionId = null,
  firstDetectedAt,
  lastDetectedAt,
  occurrenceCount = 1,
  status = 'ACTIVE',
  acknowledgmentRequired = false,
  recommendedCeoAction = null,
  evidence = [],
  correlationId = `corr_${randomUUID()}`
} = {}) {
  return {
    alertId: `ops_alert_${randomUUID()}`,
    type,
    severity,
    title,
    summary,
    sourceSystem,
    relatedCustomerId,
    relatedMissionId,
    firstDetectedAt,
    lastDetectedAt,
    occurrenceCount,
    status,
    acknowledgmentRequired,
    recommendedCeoAction,
    evidence,
    correlationId
  };
}
