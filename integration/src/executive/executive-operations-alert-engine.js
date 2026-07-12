import {
  createExecutiveOperationsAlert,
  ExecutiveOperationsAlertTypes
} from './executive-operations-loop-contracts.js';

function inferAlertType(finding) {
  switch (finding.type) {
    case 'CEO_DECISION_REQUIRED':
      return ExecutiveOperationsAlertTypes.CEO_APPROVAL_REQUIRED;
    case 'BLOCKED_MISSION':
    case 'PAUSED_MISSION':
      return ExecutiveOperationsAlertTypes.MISSION_STALLED;
    case 'FAILED_MISSION':
      return ExecutiveOperationsAlertTypes.MISSION_FAILED;
    case 'PROVIDER_HEALTH_WARNING':
      return ExecutiveOperationsAlertTypes.PROVIDER_UNAVAILABLE;
    case 'WORKFORCE_CAPACITY_ISSUE':
      return ExecutiveOperationsAlertTypes.WORKFORCE_CAPACITY_ISSUE;
    case 'STALE_ACTIVITY':
      return ExecutiveOperationsAlertTypes.DEADLINE_RISK;
    case 'CUSTOMER_INTAKE_GAP':
      return ExecutiveOperationsAlertTypes.CUSTOMER_INTAKE_PROBLEM;
    case 'MISSING_TELEMETRY':
      return ExecutiveOperationsAlertTypes.MISSING_REQUIRED_DATA;
    case 'SYSTEM_HEALTH_WARNING':
      return ExecutiveOperationsAlertTypes.SYSTEM_HEALTH_DEGRADATION;
    default:
      return ExecutiveOperationsAlertTypes.OPERATIONS_LOOP_FAILURE;
  }
}

function inferSeverity(priorityBand) {
  if (priorityBand === 'CRITICAL') return 'CRITICAL';
  if (priorityBand === 'HIGH') return 'HIGH';
  if (priorityBand === 'MEDIUM') return 'WARNING';
  return 'INFO';
}

export class ExecutiveOperationsAlertEngine {
  constructor({ store, now } = {}) {
    this.store = store;
    this.now = now;
  }

  buildAlertKey({ type, missionId, customerId, sourceSystem }) {
    return [type, missionId ?? 'none', customerId ?? 'none', sourceSystem ?? 'none'].join(':');
  }

  upsertFromFindings(findings = [], blockedActions = []) {
    const timestamp = this.now?.() ?? new Date().toISOString();
    const results = [];

    findings.forEach((finding) => {
      const type = inferAlertType(finding);
      const key = this.buildAlertKey({
        type,
        missionId: finding.missionId,
        customerId: finding.customerId,
        sourceSystem: finding.sourceSystem
      });

      const alert = this.store.upsertAlert(key, createExecutiveOperationsAlert({
        type,
        severity: inferSeverity(finding.priorityBand),
        title: finding.title,
        summary: finding.summary,
        sourceSystem: finding.sourceSystem,
        relatedCustomerId: finding.customerId,
        relatedMissionId: finding.missionId,
        firstDetectedAt: timestamp,
        lastDetectedAt: timestamp,
        acknowledgmentRequired: type === ExecutiveOperationsAlertTypes.CEO_APPROVAL_REQUIRED,
        recommendedCeoAction: type === ExecutiveOperationsAlertTypes.CEO_APPROVAL_REQUIRED ? 'Review in CEO Decision Center.' : null,
        evidence: [finding.explanation ?? finding.summary],
        correlationId: finding.findingId
      }));

      results.push(alert);
    });

    blockedActions.forEach((blocked) => {
      const key = this.buildAlertKey({
        type: ExecutiveOperationsAlertTypes.GOVERNANCE_VIOLATION_ATTEMPT,
        missionId: blocked.missionId,
        customerId: blocked.customerId,
        sourceSystem: 'ExecutiveOperationsLoopPolicy'
      });

      results.push(this.store.upsertAlert(key, createExecutiveOperationsAlert({
        type: ExecutiveOperationsAlertTypes.GOVERNANCE_VIOLATION_ATTEMPT,
        severity: 'HIGH',
        title: `Blocked action: ${blocked.actionType}`,
        summary: blocked.reason,
        sourceSystem: 'ExecutiveOperationsLoopPolicy',
        relatedCustomerId: blocked.customerId,
        relatedMissionId: blocked.missionId,
        firstDetectedAt: timestamp,
        lastDetectedAt: timestamp,
        acknowledgmentRequired: true,
        recommendedCeoAction: blocked.recommendedNextAction ?? 'Review blocked action.',
        evidence: [blocked.governingRule ?? 'POLICY_BLOCK']
      })));
    });

    return results;
  }
}
