import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

function average(values = []) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const numeric = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(4));
}

export class ExecutiveOverviewModel {
  project({ customers = [], missions = [], proposals = [], evaluations = [] } = {}) {
    const activeMissions = missions.filter((mission) => String(mission.executiveStatus ?? '').toUpperCase() === 'ACTIVE').length;
    const completedMissions = missions.filter((mission) => String(mission.executiveStatus ?? '').toUpperCase() === 'COMPLETED').length;
    const blockedMissions = missions.filter((mission) => String(mission.executiveStatus ?? '').toUpperCase() === 'BLOCKED').length;
    const failedMissions = missions.filter((mission) => String(mission.executiveStatus ?? '').toUpperCase() === 'FAILED').length;
    const awaitingCeoReview = missions.filter((mission) => String(mission.executiveStatus ?? '').toUpperCase() === 'AWAITING_EXECUTIVE_REVIEW').length;

    const queuedMissions = missions.filter((mission) => (
      Number(mission.progress ?? 0) <= 5 && String(mission.executiveStatus ?? '').toUpperCase() === 'ACTIVE'
    )).length;

    const proposalsAwaitingDecision = proposals.filter((proposal) => {
      const status = String(proposal.status ?? '').toUpperCase();
      return status === 'UNDER_REVIEW' || status === 'SUBMITTED' || status === 'REVISION_REQUIRED';
    }).length;

    const confidenceValues = [
      ...proposals.map((proposal) => proposal.confidence),
      ...evaluations.map((evaluation) => evaluation?.scoreBreakdown?.confidence ?? null)
    ];

    const riskValues = evaluations.map((evaluation) => {
      const normalizedSafety = Number(evaluation?.scoreBreakdown?.risk ?? null);
      return Number.isFinite(normalizedSafety) ? Number((1 - normalizedSafety).toFixed(4)) : null;
    }).filter((value) => value !== null);

    const averageConfidenceScore = average(confidenceValues);
    const averageRiskScore = average(riskValues);

    let systemHealthSummary = 'HEALTHY';
    if (blockedMissions > 0 || failedMissions > 0) {
      systemHealthSummary = 'ATTENTION_REQUIRED';
    }
    if (failedMissions > 0) {
      systemHealthSummary = 'AT_RISK';
    }

    return {
      totalCustomers: customers.length,
      totalMissions: missions.length,
      activeMissions,
      queuedMissions,
      completedMissions,
      failedMissions,
      blockedMissions,
      missionsAwaitingCeoReview: awaitingCeoReview,
      proposalsAwaitingCeoDecision: proposalsAwaitingDecision,
      currentPortfolioValue: Number(proposals.reduce((sum, proposal) => sum + Number(proposal.expectedBusinessValue ?? 0), 0).toFixed(2)),
      averageConfidenceScore,
      averageRiskScore,
      systemHealthSummary,
      generatedTimestamp: new Date().toISOString(),
      dataAvailability: missions.length === 0 && customers.length === 0
        ? DataAvailabilityStatuses.PARTIAL
        : DataAvailabilityStatuses.AVAILABLE
    };
  }
}
