import { createExecutiveAlert } from './executive-operations-dashboard-contracts.js';

function parseDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function daysSince(timestamp) {
  const parsed = parseDateOrNull(timestamp);
  if (!parsed) return null;
  return (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
}

export class ExecutiveAlertsModel {
  project({ missions = [], proposals = [], activityFeed = [], workforce = null, providerHealth = null } = {}) {
    const alerts = [];

    missions.forEach((mission) => {
      const status = String(mission.executiveStatus ?? '').toUpperCase();

      if (status === 'BLOCKED') {
        alerts.push(createExecutiveAlert({
          category: 'blocked missions',
          severity: 'HIGH',
          title: 'Blocked mission',
          description: `Mission ${mission.missionId} is blocked at stage ${mission.currentStage}.`,
          sourceSystem: 'MissionRegistry',
          missionId: mission.missionId,
          customerId: mission.customerId,
          recommendedAction: 'Resolve blocking issues and retry stage.'
        }));
      }

      const ageDays = daysSince(mission.startedDate);
      if (ageDays !== null && ageDays > 30 && status !== 'COMPLETED') {
        alerts.push(createExecutiveAlert({
          category: 'overdue missions',
          severity: 'WARNING',
          title: 'Overdue mission',
          description: `Mission ${mission.missionId} has been active for ${ageDays.toFixed(1)} days.`,
          sourceSystem: 'MissionRegistry',
          missionId: mission.missionId,
          customerId: mission.customerId,
          recommendedAction: 'Review timeline and reassignment options.'
        }));
      }

      if (status === 'ACTIVE' && Number(mission.progress ?? 0) <= 10 && ageDays !== null && ageDays > 14) {
        alerts.push(createExecutiveAlert({
          category: 'stalled missions',
          severity: 'HIGH',
          title: 'Stalled mission',
          description: `Mission ${mission.missionId} progress is stalled (${mission.progress}%).`,
          sourceSystem: 'MissionRegistry',
          missionId: mission.missionId,
          customerId: mission.customerId,
          recommendedAction: 'Escalate to mission lead and workforce director.'
        }));
      }
    });

    proposals.forEach((proposal) => {
      const latestEval = proposal.evaluationHistory?.[proposal.evaluationHistory.length - 1] ?? null;
      const confidence = Number(proposal.confidence ?? 0);
      const risk = latestEval?.scoreBreakdown?.risk != null
        ? Number((1 - Number(latestEval.scoreBreakdown.risk)).toFixed(4))
        : null;

      if (confidence < 0.5) {
        alerts.push(createExecutiveAlert({
          category: 'low-confidence proposals',
          severity: 'WARNING',
          title: 'Low-confidence proposal',
          description: `Proposal ${proposal.proposalId} confidence is ${confidence}.`,
          sourceSystem: 'ExecutivePlanningSystem',
          customerId: proposal.customerId,
          recommendedAction: 'Request evidence and revised assumptions.'
        }));
      }

      if (risk !== null && risk > 0.6) {
        alerts.push(createExecutiveAlert({
          category: 'high-risk proposals',
          severity: 'HIGH',
          title: 'High-risk proposal',
          description: `Proposal ${proposal.proposalId} risk score is ${risk}.`,
          sourceSystem: 'ExecutivePlanningSystem',
          customerId: proposal.customerId,
          recommendedAction: 'Require mitigation plan before approval.'
        }));
      }

      if ((latestEval?.blockingIssues ?? []).length > 0) {
        alerts.push(createExecutiveAlert({
          category: 'unresolved dependencies',
          severity: 'WARNING',
          title: 'Proposal blocking issues',
          description: `Proposal ${proposal.proposalId} has unresolved blocking issues.`,
          sourceSystem: 'ExecutivePlanningSystem',
          customerId: proposal.customerId,
          recommendedAction: 'Resolve dependency and capability blockers.'
        }));
      }

      const status = String(proposal.status ?? '').toUpperCase();
      if (status === 'UNDER_REVIEW' || status === 'REVISION_REQUIRED') {
        alerts.push(createExecutiveAlert({
          category: 'missions awaiting CEO action',
          severity: 'INFO',
          title: 'Proposal awaiting executive action',
          description: `Proposal ${proposal.proposalId} requires CEO decision flow.`,
          sourceSystem: 'ExecutivePlanningSystem',
          customerId: proposal.customerId,
          recommendedAction: 'Review in CEO Decision Center.'
        }));
      }
    });

    const providerFailures = (providerHealth?.providers ?? []).filter((provider) => (
      provider.lastFailure || (provider.blockingIssues ?? []).length > 0
    ));

    providerFailures.forEach((provider) => {
      alerts.push(createExecutiveAlert({
        category: 'provider failures',
        severity: 'HIGH',
        title: `${provider.providerName} provider failure`,
        description: `Provider ${provider.providerName} reported failures or blocking issues.`,
        sourceSystem: 'ProviderHealth',
        recommendedAction: 'Repair provider authentication and connectivity.'
      }));
    });

    if (workforce?.capabilityGaps?.length > 0) {
      alerts.push(createExecutiveAlert({
        category: 'capability gaps',
        severity: 'HIGH',
        title: 'Capability coverage gaps detected',
        description: `Missing capabilities: ${workforce.capabilityGaps.join(', ')}`,
        sourceSystem: 'WorkforceDirector',
        recommendedAction: 'Acquire or reassign specialists to close capability gaps.'
      }));
    }

    if ((workforce?.unavailableWorkers ?? 0) > 0) {
      alerts.push(createExecutiveAlert({
        category: 'missing workers',
        severity: 'WARNING',
        title: 'Unavailable workforce detected',
        description: `${workforce.unavailableWorkers} workers are unavailable/offline.`,
        sourceSystem: 'WorkforceDirector',
        recommendedAction: 'Reassign workload and evaluate backup staffing.'
      }));
    }

    const governanceEvents = (activityFeed?.events ?? []).filter((event) => String(event.category).toUpperCase().includes('GOVERNANCE'));
    governanceEvents.forEach((event) => {
      alerts.push(createExecutiveAlert({
        category: 'governance violations',
        severity: 'CRITICAL',
        title: 'Governance event flagged',
        description: event.description,
        sourceSystem: event.sourceSystem,
        missionId: event.missionId,
        customerId: event.customerId,
        relatedEventId: event.eventId,
        recommendedAction: event.recommendedAction ?? 'Escalate to CEO and governance council.'
      }));
    });

    return {
      totalAlerts: alerts.length,
      bySeverity: {
        INFO: alerts.filter((alert) => alert.severity === 'INFO').length,
        WARNING: alerts.filter((alert) => alert.severity === 'WARNING').length,
        HIGH: alerts.filter((alert) => alert.severity === 'HIGH').length,
        CRITICAL: alerts.filter((alert) => alert.severity === 'CRITICAL').length
      },
      alerts: alerts.slice(0, 250)
    };
  }
}
