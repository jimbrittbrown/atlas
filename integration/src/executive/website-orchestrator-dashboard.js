export class WebsiteOrchestratorDashboard {
  project({ orchestratorResult = {} } = {}) {
    const dashboard = orchestratorResult?.dashboard ?? {};
    const mission = orchestratorResult?.mission ?? {};

    return {
      missionId: mission.missionId ?? null,
      currentStage: dashboard.currentStage ?? 'Unknown',
      completionPercentage: Number(dashboard.completionPercentage ?? 0),
      warnings: Array.isArray(dashboard.warnings) ? dashboard.warnings : [],
      confidence: Number(dashboard.confidence ?? 0),
      blockingIssues: Array.isArray(dashboard.blockingIssues) ? dashboard.blockingIssues : [],
      estimatedCompletion: dashboard.estimatedCompletion ?? 'Unknown',
      stageCount: Array.isArray(mission?.stageHistory) ? mission.stageHistory.length : 0,
      failureCount: Array.isArray(mission?.failureLog) ? mission.failureLog.length : 0
    };
  }
}
