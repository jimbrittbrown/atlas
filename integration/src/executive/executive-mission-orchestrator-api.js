export class ExecutiveMissionOrchestratorApi {
  constructor({ manager } = {}) {
    this.manager = manager;
  }

  buildResponse() {
    const projection = this.manager?.buildDashboardProjection?.() ?? {
      status: 'PARTIAL',
      totalSessions: 0,
      runningSessions: 0,
      blockedSessions: 0,
      averageCompletion: 0,
      records: [],
      workforce: null
    };

    return {
      ...projection,
      governance: {
        readOnly: true,
        missionExecutionEnabled: false,
        publishEnabled: false,
        deployEnabled: false,
        destructiveActionsEnabled: false
      }
    };
  }
}
