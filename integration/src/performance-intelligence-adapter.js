export class PerformanceIntelligenceAdapter {
  constructor({ performanceService, metricsService, memoryService }) {
    this.performanceService = performanceService;
    this.metricsService = metricsService;
    this.memoryService = memoryService;
  }

  generateFromWorkflowOutcome({ workflowId, requestId, executiveState, researchStatus }) {
    const metricsResult = this.metricsService.retrieveMetrics({ workflowId });
    const metricSummary = this.metricsService.aggregateMetrics({ workflowId });
    const memoryResult = this.memoryService.retrieve({ workflowId });

    return this.performanceService.generateIntelligence({
      workflowId,
      requestId,
      executiveState,
      researchStatus,
      metricCount: metricsResult.total,
      metricSummary,
      memoryRecordCount: memoryResult.total,
      tags: ['workflow-performance', 'cross-service-intelligence'],
    });
  }

  recordIntegrationFailure({ workflowId, requestId, reason }) {
    return this.performanceService.generateIntelligence({
      workflowId: workflowId ?? 'unknown-workflow',
      requestId,
      executiveState: 'FAILED',
      researchStatus: 'FAILED',
      metricCount: 0,
      metricSummary: { totalValue: 0, retryTotal: 0 },
      memoryRecordCount: 0,
      tags: ['failure', reason],
    });
  }
}
