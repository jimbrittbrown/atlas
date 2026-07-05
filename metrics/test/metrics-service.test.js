import test from 'node:test';
import assert from 'node:assert/strict';
import { MetricCategory } from '../src/models.js';
import { MetricsService } from '../src/metrics-service.js';

test('records metric events and preserves metric history', () => {
  const service = new MetricsService();
  const record = service.recordMetricEvent({
    name: 'workflow_start',
    category: MetricCategory.WORKFLOW_METRICS,
    value: 1,
    unit: 'count',
    status: 'recorded',
    metadata: { workflowId: 'wf-600', requestId: 'req-600', tags: ['workflow'] },
  });

  assert.equal(record.event.name, 'workflow_start');
  assert.equal(service.getMetricHistory().length, 1);
});

test('retrieves metric records by category and metadata', () => {
  const service = new MetricsService();
  service.recordProjectStatistic({ projectId: 'atlas-project-1', metricName: 'project_completed_tasks', value: 7 });
  service.recordWorkflowTiming({ workflowId: 'wf-601', requestId: 'req-601', phase: 'workflow', durationMs: 1500 });

  const byCategory = service.retrieveMetrics({ category: MetricCategory.WORKFLOW_METRICS });
  const byWorkflow = service.retrieveMetrics({ workflowId: 'wf-601' });

  assert.equal(byCategory.total, 1);
  assert.equal(byWorkflow.total, 1);
});

test('aggregates metric records without analytics interpretation', () => {
  const service = new MetricsService();
  service.recordMetricEvent({ name: 'metric_a', category: MetricCategory.SERVICE_METRICS, value: 5, status: 'success' });
  service.recordMetricEvent({ name: 'metric_b', category: MetricCategory.SERVICE_METRICS, value: 7, status: 'success', retryCount: 1 });

  const summary = service.aggregateMetrics({ category: MetricCategory.SERVICE_METRICS });

  assert.equal(summary.count, 2);
  assert.equal(summary.totalValue, 12);
  assert.equal(summary.averageValue, 6);
  assert.equal(summary.byStatus.success, 2);
  assert.equal(summary.retryTotal, 1);
});

test('records workflow completion and service outcomes', () => {
  const service = new MetricsService();
  service.recordWorkflowCompletion({ workflowId: 'wf-602', requestId: 'req-602', completionStatus: 'completed', durationMs: 2020 });
  service.recordServiceOutcome({
    workflowId: 'wf-602',
    requestId: 'req-602',
    service: 'research-service',
    operation: 'execute-research',
    success: true,
    retryCount: 2,
  });

  const completion = service.retrieveMetrics({ workflowId: 'wf-602', tag: 'workflow-completion' });
  const outcomes = service.retrieveMetrics({ service: 'research-service' });

  assert.equal(completion.total, 1);
  assert.equal(outcomes.total, 1);
  assert.equal(outcomes.records[0].event.retryCount, 2);
});

test('handles invalid metric values with explicit failure', () => {
  const service = new MetricsService();
  assert.throws(() => {
    service.recordMetricEvent({ name: 'invalid', category: MetricCategory.ERROR_METRICS, value: Number.NaN });
  }, /requires a numeric value/);
});

test('records logging for record and retrieval operations', () => {
  const service = new MetricsService();
  service.recordOperationalKpi({ kpiName: 'availability', value: 99.95, unit: 'percent' });
  service.retrieveMetrics({ category: MetricCategory.SYSTEM_HEALTH });

  assert.equal(service.logger.getEntries().length, 2);
});
