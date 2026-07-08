export class ExecutiveOfficeDashboard {
  build({ workflowResults = [], currentPassingTestCount = 0, latestCommit = 'LATEST_COMMIT_PLACEHOLDER' } = {}) {
    const normalizedResults = this.normalizeWorkflowResults(workflowResults);
    const activeMissions = normalizedResults.length;
    const readyForDecision = normalizedResults.filter(result => !result.review.additionalInvestigationRequired).length;
    const awaitingInvestigation = normalizedResults.filter(result => result.review.additionalInvestigationRequired).length;
    const blockedMissions = normalizedResults.filter(result => result.decisionPackage.recommendation === 'NOT_READY_FOR_EXECUTIVE_DECISION').length;
    const outstandingInvestigationRequests = normalizedResults.reduce(
      (total, result) => total + result.review.investigationRequests.length,
      0
    );

    const latest = normalizedResults.at(-1) ?? null;
    const latestRecommendation = latest
      ? (latest.review.updatedRecommendation ?? latest.decisionPackage.recommendation ?? 'NO_RECOMMENDATION_AVAILABLE')
      : 'NO_RECOMMENDATION_AVAILABLE';
    const confidence = latest?.decisionPackage.confidence ?? 0;

    return {
      executiveHealth: this.calculateExecutiveHealth({ activeMissions, blockedMissions, awaitingInvestigation }),
      activeMissions,
      readyForDecision,
      awaitingInvestigation,
      blockedMissions,
      latestRecommendation,
      confidence,
      outstandingInvestigationRequests,
      currentPassingTestCount,
      latestCommit
    };
  }

  normalizeWorkflowResults(workflowResults) {
    return workflowResults
      .map(result => ({
        mission: result?.mission ?? null,
        decisionPackage: result?.decisionPackage ?? {},
        review: {
          additionalInvestigationRequired: result?.review?.additionalInvestigationRequired ?? false,
          updatedRecommendation: result?.review?.updatedRecommendation ?? null,
          investigationRequests: result?.review?.investigationRequests ?? []
        }
      }))
      .filter(result => result.mission !== null);
  }

  calculateExecutiveHealth({ activeMissions, blockedMissions, awaitingInvestigation }) {
    if (activeMissions === 0) {
      return 'NO_ACTIVE_MISSIONS';
    }

    if (blockedMissions > 0) {
      return 'AT_RISK';
    }

    if (awaitingInvestigation > 0) {
      return 'ATTENTION_REQUIRED';
    }

    return 'HEALTHY';
  }
}
