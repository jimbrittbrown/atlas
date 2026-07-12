import { createExecutiveActivityEvent } from './executive-operations-dashboard-contracts.js';

function severityFromType(type = '') {
  const normalized = String(type).toUpperCase();
  if (normalized.includes('FAILED') || normalized.includes('BLOCKED')) return 'HIGH';
  if (normalized.includes('WARNING') || normalized.includes('RETRY')) return 'WARNING';
  return 'INFO';
}

export class ExecutiveActivityFeedModel {
  project({
    intakeActivityFeed = [],
    proposals = [],
    missions = [],
    workforceDirector,
    providerHealth = null
  } = {}) {
    const events = [];

    intakeActivityFeed.forEach((entry) => {
      events.push(createExecutiveActivityEvent({
        eventId: `evt_intake_${entry.timestamp}_${entry.type}`,
        timestamp: entry.timestamp,
        severity: severityFromType(entry.type),
        category: 'CUSTOMER_INTAKE',
        title: entry.type,
        description: `Mission control intake event: ${entry.type}`,
        customerId: entry.details?.customerId ?? null,
        missionId: entry.details?.missionId ?? null,
        sourceSystem: 'CustomerIntakeMissionControl',
        relatedReport: 'review/customer-intake-mission-control-v1-report.json',
        recommendedAction: null
      }));
    });

    proposals.forEach((proposal) => {
      (proposal.auditTrail ?? []).forEach((auditItem) => {
        events.push(createExecutiveActivityEvent({
          eventId: `evt_prop_${proposal.proposalId}_${auditItem.type}_${auditItem.timestamp}`,
          timestamp: auditItem.timestamp,
          severity: severityFromType(auditItem.type),
          category: 'EXECUTIVE_PLANNING',
          title: auditItem.type,
          description: `Proposal ${proposal.proposalId} audit: ${auditItem.type}`,
          customerId: proposal.customerId,
          missionId: proposal.linkedMissionId,
          sourceSystem: 'ExecutivePlanningSystem',
          relatedReport: 'review/executive-planning-system-v1-report.json',
          recommendedAction: auditItem.type === 'STATUS_TRANSITION' ? 'Review proposal status progression.' : null
        }));
      });
    });

    missions.forEach((mission) => {
      events.push(createExecutiveActivityEvent({
        eventId: `evt_mission_${mission.missionId}`,
        timestamp: mission.completedDate ?? mission.startedDate,
        severity: severityFromType(mission.executiveStatus),
        category: 'MISSION_CONTROL',
        title: `Mission ${mission.executiveStatus}`,
        description: `Mission ${mission.missionId} currently in stage ${mission.currentStage}.`,
        customerId: mission.customerId,
        missionId: mission.missionId,
        sourceSystem: 'MissionRegistry',
        relatedReport: null,
        recommendedAction: mission.executiveStatus === 'BLOCKED' ? 'Unblock mission dependencies.' : null
      }));
    });

    if (workforceDirector) {
      const assignments = Array.isArray(workforceDirector.assignments) ? workforceDirector.assignments : [];
      assignments.forEach((assignment) => {
        events.push(createExecutiveActivityEvent({
          eventId: `evt_workforce_${assignment.workerId}_${assignment.stageId}`,
          timestamp: assignment.assignedAt,
          severity: 'INFO',
          category: 'WORKFORCE',
          title: 'Worker Assignment',
          description: `${assignment.workerName} assigned to stage ${assignment.stageId}.`,
          customerId: null,
          missionId: assignment.missionId,
          workerId: assignment.workerId,
          sourceSystem: 'WorkforceDirector',
          relatedReport: 'review/workforce-director-v1-report.json',
          recommendedAction: null
        }));
      });

      const blockers = Array.isArray(workforceDirector.blockers) ? workforceDirector.blockers : [];
      blockers.forEach((blocker, index) => {
        events.push(createExecutiveActivityEvent({
          eventId: `evt_workforce_blocker_${blocker.missionId}_${index}`,
          timestamp: blocker.detectedAt,
          severity: 'HIGH',
          category: 'WORKFORCE',
          title: 'Workforce Capacity Block',
          description: `Mission ${blocker.missionId} has unavailable specialties.`,
          missionId: blocker.missionId,
          sourceSystem: 'WorkforceDirector',
          relatedReport: 'review/workforce-director-v1-report.json',
          recommendedAction: 'Assign additional specialists or defer mission.'
        }));
      });
    }

    (providerHealth?.providers ?? []).forEach((provider) => {
      if (provider.lastFailure || (provider.blockingIssues ?? []).length > 0) {
        events.push(createExecutiveActivityEvent({
          eventId: `evt_provider_${provider.providerName}`,
          timestamp: provider.lastFailure?.timestamp ?? new Date().toISOString(),
          severity: 'WARNING',
          category: 'PROVIDER_HEALTH',
          title: `${provider.providerName} provider warning`,
          description: `Provider ${provider.providerName} has health warnings or blocking issues.`,
          sourceSystem: 'ProviderHealth',
          relatedReport: null,
          recommendedAction: 'Review provider configuration and credentials.'
        }));
      }
    });

    return {
      totalEvents: events.length,
      events: events
        .filter((event) => Boolean(event.timestamp))
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .slice(0, 250)
    };
  }
}
