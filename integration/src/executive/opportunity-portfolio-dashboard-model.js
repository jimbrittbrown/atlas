import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

export class OpportunityPortfolioDashboardModel {
  project({ proposals = [] } = {}) {
    const rows = proposals.map((proposal) => {
      const latestEvaluation = proposal.evaluationHistory?.[proposal.evaluationHistory.length - 1] ?? null;
      const latestPrioritization = proposal.prioritizationHistory?.[proposal.prioritizationHistory.length - 1] ?? null;
      const latestDecision = proposal.decisionHistory?.[proposal.decisionHistory.length - 1] ?? null;

      return {
        proposalId: proposal.proposalId,
        title: proposal.title,
        missionType: proposal.missionType,
        sourceType: proposal.sourceType,
        status: proposal.status,
        strategicAlignment: latestEvaluation?.scoreBreakdown?.strategicAlignment ?? null,
        expectedBusinessValue: proposal.expectedBusinessValue,
        urgency: proposal.urgency,
        feasibility: latestEvaluation?.scoreBreakdown?.feasibility ?? null,
        resourceReadiness: latestEvaluation?.scoreBreakdown?.resourceAvailability ?? null,
        dependencyReadiness: latestEvaluation?.scoreBreakdown?.dependencyReadiness ?? null,
        risk: latestEvaluation?.scoreBreakdown?.risk != null
          ? Number((1 - Number(latestEvaluation.scoreBreakdown.risk)).toFixed(4))
          : null,
        costEstimate: proposal.estimatedCost,
        effortEstimate: proposal.estimatedEffort,
        timeToValue: latestEvaluation?.scoreBreakdown?.timeToValue ?? null,
        priorityBand: latestEvaluation?.priorityBand ?? latestPrioritization?.priorityBand ?? null,
        recommendedExecutionOrder: latestEvaluation?.recommendedExecutionOrder ?? latestPrioritization?.rank ?? null,
        recommendedMissionType: latestEvaluation?.recommendedMissionType ?? proposal.missionType,
        recommendedCapabilities: latestEvaluation?.recommendedCapabilities ?? proposal.requiredCapabilities ?? [],
        recommendedResources: latestEvaluation?.recommendedResources ?? [],
        conflicts: {
          blockingIssues: latestEvaluation?.blockingIssues ?? [],
          dependencyConflicts: (proposal.dependencies ?? []).filter((dependency) => !dependency)
        },
        assumptions: latestEvaluation?.assumptions ?? [],
        warnings: latestEvaluation?.warnings ?? [],
        executiveDecisionStatus: latestDecision?.decision ?? 'PENDING',
        conversionStatus: proposal.linkedMissionId ? 'CONVERTED' : 'NOT_CONVERTED',
        linkedMissionId: proposal.linkedMissionId ?? null,
        confidence: proposal.confidence,
        overallScore: latestEvaluation?.overallScore ?? null
      };
    });

    const rankedRows = rows.slice().sort((a, b) => Number(b.overallScore ?? 0) - Number(a.overallScore ?? 0));

    return {
      status: proposals.length === 0 ? DataAvailabilityStatuses.PARTIAL : DataAvailabilityStatuses.AVAILABLE,
      totalProposals: proposals.length,
      rows: rankedRows,
      ranking: rankedRows.map((row, index) => ({
        proposalId: row.proposalId,
        rank: index + 1,
        priorityBand: row.priorityBand,
        score: row.overallScore
      }))
    };
  }
}
