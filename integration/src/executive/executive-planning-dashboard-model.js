import { ProposalStatuses } from './executive-planning-contracts.js';

export class ExecutivePlanningDashboardModel {
  build({
    proposals = [],
    missionPortfolio = null,
    missionRegistry,
    recentDecisions = [],
    recommendedNextActions = []
  } = {}) {
    const missionList = typeof missionRegistry?.listMissions === 'function'
      ? missionRegistry.listMissions()
      : [];

    const countByStatus = (status) => proposals.filter((proposal) => proposal.status === status).length;

    const portfolioValueEstimate = proposals.reduce((sum, proposal) => sum + Number(proposal.expectedBusinessValue ?? 0), 0);
    const portfolioCostEstimate = proposals.reduce((sum, proposal) => sum + Number(proposal.estimatedCost ?? 0), 0);

    const averageConfidence = proposals.length === 0
      ? 0
      : Number((proposals.reduce((sum, proposal) => sum + Number(proposal.confidence ?? 0), 0) / proposals.length).toFixed(4));

    const capacityUtilization = Number(missionPortfolio?.workforceSnapshot?.dashboard?.workerUtilization ?? 0);

    const topPriorityProposals = (missionPortfolio?.ranked ?? [])
      .slice(0, 10)
      .map((item) => ({
        proposalId: item.proposal.proposalId,
        title: item.proposal.title,
        missionType: item.proposal.missionType,
        score: item.evaluation?.overallScore ?? null,
        priorityBand: item.evaluation?.priorityBand ?? null,
        rank: item.prioritization?.rank ?? null,
        status: item.proposal.status
      }));

    const activeMissions = missionList.filter((mission) => (
      String(mission.executiveStatus ?? '').toUpperCase() === 'ACTIVE'
    )).length;

    const blockedMissions = missionList.filter((mission) => (
      String(mission.executiveStatus ?? '').toUpperCase() === 'BLOCKED'
    )).length;

    return {
      generatedAt: new Date().toISOString(),
      totalProposals: proposals.length,
      submitted: countByStatus(ProposalStatuses.SUBMITTED),
      underReview: countByStatus(ProposalStatuses.UNDER_REVIEW),
      approved: countByStatus(ProposalStatuses.APPROVED),
      deferred: countByStatus(ProposalStatuses.DEFERRED),
      rejected: countByStatus(ProposalStatuses.REJECTED),
      convertedToMissions: countByStatus(ProposalStatuses.CONVERTED_TO_MISSION),
      activeMissions,
      blockedMissions,
      portfolioValueEstimate,
      portfolioCostEstimate,
      averageConfidence,
      capacityUtilization,
      topPriorityProposals,
      resourceConflicts: missionPortfolio?.resourceConflicts ?? [],
      dependencyConflicts: missionPortfolio?.dependencyConflicts ?? [],
      recentDecisions: recentDecisions.slice(-20).reverse(),
      recommendedNextExecutiveActions: recommendedNextActions.slice(0, 20)
    };
  }
}
