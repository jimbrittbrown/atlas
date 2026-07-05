export class MetricsServiceAdapter {
  constructor(metricsService) {
    this.metricsService = metricsService;
  }

  recordWorkflowOutcome({ workflowId, requestId, startedAt, completedAt, researchStatus, memoryStored, retryCount = 0 }) {
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationMs = Math.max(0, end - start);

    this.metricsService.recordWorkflowTiming({
      workflowId,
      requestId,
      phase: 'end_to_end',
      durationMs,
      metadata: { tags: ['integration', 'workflow'] },
    });

    this.metricsService.recordExecutionDuration({
      workflowId,
      requestId,
      service: 'research-service',
      operation: 'execute-research',
      durationMs,
      metadata: { tags: ['integration', 'research'] },
    });

    this.metricsService.recordServiceOutcome({
      workflowId,
      requestId,
      service: 'research-service',
      operation: 'report-generation',
      success: researchStatus === 'COMPLETED' || researchStatus === 'completed',
      retryCount,
      metadata: { tags: ['research-outcome'] },
    });

    this.metricsService.recordServiceOutcome({
      workflowId,
      requestId,
      service: 'memory-service',
      operation: 'record-storage',
      success: Boolean(memoryStored),
      retryCount,
      metadata: { tags: ['memory-outcome'] },
    });

    this.metricsService.recordWorkflowCompletion({
      workflowId,
      requestId,
      completionStatus: 'completed',
      durationMs,
      metadata: {},
    });
  }

  recordIntegrationFailure({ workflowId, requestId, service, operation, retryCount = 0 }) {
    this.metricsService.recordMetricEvent({
      name: `${service}_${operation}_error`,
      category: 'Error Metrics',
      value: 1,
      unit: 'count',
      status: 'failure',
      retryCount,
      metadata: {
        workflowId,
        requestId,
        service,
        operation,
        source: 'integration',
        tags: ['error', 'integration'],
      },
    });
  }
}
