import { CeoDecisionCenterDashboardModel } from './ceo-decision-center-dashboard-model.js';
import {
  DecisionActions,
  evaluateRiskSeverity,
  validateDecisionCenterPayload,
  waitingHoursFrom
} from './ceo-decision-center-contracts.js';
import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

function mapExecutiveReviewItem(item = {}, missionById = new Map()) {
  const mission = missionById.get(item.relatedMission) ?? null;
  return {
    missionId: item.relatedMission ?? mission?.missionId ?? null,
    missionType: mission?.missionType ?? item.metadata?.missionType ?? 'UNKNOWN',
    customer: item.relatedCustomer ?? mission?.customerId ?? 'UNKNOWN_CUSTOMER',
    priority: item.metadata?.priorityBand ?? 'UNSPECIFIED',
    confidenceScore: item.confidence ?? null,
    estimatedValue: item.expectedValue ?? null,
    recommendedAction: item.recommendation ?? 'REVIEW_REQUIRED',
    availableDecisions: [
      DecisionActions.APPROVE,
      DecisionActions.APPROVE_WITH_CONDITIONS,
      DecisionActions.REVISION_REQUIRED,
      DecisionActions.REJECT
    ],
    actionType: item.requiredCeoAction ?? 'REVIEW_AND_DECIDE'
  };
}

export class CeoDecisionCenterManager {
  constructor({ dashboard, dashboardModel } = {}) {
    this.dashboard = dashboard;
    this.dashboardModel = dashboardModel ?? new CeoDecisionCenterDashboardModel();
  }

  buildDecisionCenter() {
    const snapshot = this.dashboard.generateSnapshot();

    const missionRecords = snapshot?.missionControl?.records ?? [];
    const missionById = new Map(missionRecords.map((record) => [record.missionId, record]));

    const executiveReviews = (snapshot?.ceoDecisionCenter?.items ?? [])
      .map((item) => mapExecutiveReviewItem(item, missionById));

    const blockedMissions = missionRecords
      .filter((mission) => String(mission.currentState ?? '').toUpperCase() === 'BLOCKED' || (mission.blockingIssues ?? []).length > 0)
      .map((mission) => ({
        missionId: mission.missionId,
        reasonBlocked: (mission.blockingIssues ?? []).join(' | ') || 'BLOCKED_STATE',
        requiredAction: mission.ceoReviewStatus === 'REQUIRES_CEO_REVIEW' ? 'EXECUTIVE_DECISION_REQUIRED' : 'UNBLOCK_DEPENDENCIES',
        responsibleWorker: mission.assignedWorkers?.[0] ?? 'UNASSIGNED',
        waitingDurationHours: waitingHoursFrom(mission.lastActivity)
      }));

    const opportunities = (snapshot?.opportunityPortfolio?.ranking ?? [])
      .slice(0, 15)
      .map((entry, index) => ({
        opportunity: entry.title ?? entry.proposalId ?? 'UNNAMED_OPPORTUNITY',
        expectedValue: entry.expectedBusinessValue ?? null,
        strategicAlignment: entry.scoreBreakdown?.strategicAlignment ?? null,
        urgency: entry.urgency ?? null,
        confidence: entry.confidence ?? null,
        recommendedOrder: index + 1
      }));

    const providerFailures = (snapshot?.providerHealth?.providers ?? [])
      .filter((provider) => String(provider.connectionStatus ?? '').toUpperCase() !== 'AVAILABLE');

    const risks = [
      {
        title: 'Operational alerts',
        detail: `${snapshot?.alerts?.alerts?.length ?? 0} active alerts detected.`,
        severity: evaluateRiskSeverity({ alertCount: snapshot?.alerts?.alerts?.length ?? 0 })
      },
      {
        title: 'Provider failures',
        detail: providerFailures.length > 0
          ? providerFailures.map((provider) => provider.providerName).join(', ')
          : 'No provider connectivity failures detected.',
        severity: evaluateRiskSeverity({ providerFailures: providerFailures.length })
      },
      {
        title: 'Missing assets/data',
        detail: (snapshot?.missingData ?? []).join(' | ') || 'No missing data markers.',
        severity: (snapshot?.missingData ?? []).length > 0 ? 'WARNING' : 'INFO'
      },
      {
        title: 'Capacity conflicts',
        detail: blockedMissions.length > 0 ? `${blockedMissions.length} blocked missions indicate capacity/dependency pressure.` : 'No immediate capacity conflicts detected.',
        severity: evaluateRiskSeverity({ blockedCount: blockedMissions.length })
      },
      {
        title: 'Framer connectivity',
        detail: providerFailures.find((provider) => String(provider.providerName).toUpperCase() === 'FRAMER')
          ? 'Framer provider connectivity issue detected.'
          : 'Framer provider reachable or not configured.',
        severity: providerFailures.find((provider) => String(provider.providerName).toUpperCase() === 'FRAMER') ? 'HIGH' : 'INFO'
      },
      {
        title: 'API issues',
        detail: snapshot?.dashboardStatus === DataAvailabilityStatuses.PARTIAL
          ? 'Dashboard snapshot indicates partial availability.'
          : 'No major API integrity issues detected in current snapshot.',
        severity: snapshot?.dashboardStatus === DataAvailabilityStatuses.PARTIAL ? 'WARNING' : 'INFO'
      }
    ];

    const proposalRegistry = this.dashboard?.manager?.executivePlanningSystem?.portfolioManager?.portfolioRegistry;
    const proposals = proposalRegistry?.listProposals?.() ?? [];
    const decisionHistory = proposals
      .flatMap((proposal) => (proposal.decisionHistory ?? []).map((decision) => ({
        decision: decision.decision,
        timestamp: decision.timestamp,
        mission: proposal.linkedMissionId ?? proposal.proposalId,
        outcome: decision.rationale ?? decision.decision,
      })))
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, 25);

    const payload = this.dashboardModel.build({
      executiveReviews,
      blockedMissions,
      opportunities,
      risks,
      decisionHistory,
      dashboardHealth: {
        status: snapshot?.dashboardStatus ?? DataAvailabilityStatuses.PARTIAL,
        generatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
        source: 'EXECUTIVE_OPERATIONS_DASHBOARD',
        limitations: snapshot?.limitations ?? []
      }
    });

    const validation = validateDecisionCenterPayload(payload);
    if (!validation.isValid) {
      throw new Error(`CEO decision center payload invalid: ${validation.issues.join(' | ')}`);
    }

    return payload;
  }
}
