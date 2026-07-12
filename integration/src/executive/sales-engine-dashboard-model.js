export class AtlasSalesEngineDashboardModel {
  build({ salesEnginePackage = {}, snapshot = {} } = {}) {
    const pipeline = Array.isArray(salesEnginePackage?.pipeline) ? salesEnginePackage.pipeline : [];
    const won = Number(snapshot?.closedWon ?? 0);
    const lost = Number(snapshot?.closedLost ?? 0);
    const totalClosed = won + lost;

    const winRate = totalClosed === 0 ? 0 : Number((won / totalClosed).toFixed(4));

    return {
      generatedAt: new Date().toISOString(),
      operatingCompany: salesEnginePackage?.dashboardModel?.operatingCompany ?? 'UNKNOWN',
      pipelineStageCount: pipeline.length,
      stageHealth: pipeline.map(stage => ({
        stage: stage.stage,
        owner: stage.owner,
        status: 'TRACKING_ENABLED'
      })),
      revenueSummary: {
        forecastRevenue: Number(snapshot?.forecastRevenue ?? 0),
        collectedRevenue: Number(snapshot?.collectedRevenue ?? 0),
        winRate,
        proposalCount: Number(snapshot?.proposalCount ?? 0)
      },
      customerSummary: {
        satisfactionScore: Number(snapshot?.satisfactionScore ?? 0),
        referralCount: Number(snapshot?.referralCount ?? 0),
        repeatBusinessCount: Number(snapshot?.repeatBusinessCount ?? 0)
      },
      executiveSignal: this.resolveExecutiveSignal({ winRate, snapshot })
    };
  }

  resolveExecutiveSignal({ winRate, snapshot }) {
    if (winRate >= 0.35 && Number(snapshot?.collectedRevenue ?? 0) > 0) return 'HEALTHY';
    if (winRate >= 0.2) return 'ATTENTION_REQUIRED';
    return 'INTERVENTION_REQUIRED';
  }
}
