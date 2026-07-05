import { PerformanceAssessment, PerformanceContext, PerformanceObservation, PerformanceSignal, PerformanceStatus } from './models.js';

export class PerformanceRecorder {
  buildAssessment({ workflowId, requestId, executiveState, researchStatus, memoryRecordCount, metricCount, metricSummary, tags = [] }) {
    if (!workflowId || !requestId) {
      throw new Error('Performance assessment requires workflowId and requestId');
    }

    const context = new PerformanceContext({
      workflowId,
      requestId,
      executiveState,
      researchStatus,
      memoryRecordCount,
      metricCount,
      tags,
    });

    const signals = [
      new PerformanceSignal({ name: 'metric_count', value: metricCount, unit: 'count', source: 'metrics-service', confidence: 1.0 }),
      new PerformanceSignal({ name: 'memory_record_count', value: memoryRecordCount, unit: 'count', source: 'memory-service', confidence: 1.0 }),
      new PerformanceSignal({ name: 'metric_total_value', value: metricSummary.totalValue ?? 0, unit: 'aggregate', source: 'metrics-service', confidence: 0.8 }),
      new PerformanceSignal({ name: 'metric_retry_total', value: metricSummary.retryTotal ?? 0, unit: 'count', source: 'metrics-service', confidence: 0.8 }),
    ];

    const observations = [
      new PerformanceObservation({
        title: 'Workflow performance context assembled',
        detail: `Workflow ${workflowId} has ${metricCount} metrics and ${memoryRecordCount} memory records.`,
        severity: 'info',
      }),
      new PerformanceObservation({
        title: 'Service completion state captured',
        detail: `Executive state: ${executiveState}; Research status: ${researchStatus}.`,
        severity: 'info',
      }),
    ];

    const summary = `Performance intelligence generated for workflow ${workflowId} using measured outcomes from metrics and memory records.`;
    const assessment = new PerformanceAssessment({
      workflowId,
      requestId,
      status: PerformanceStatus.GENERATED,
      signals,
      observations,
      summary,
      generatedAt: new Date().toISOString(),
    });

    assessment.context = context;
    return assessment;
  }
}
