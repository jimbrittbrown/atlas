import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceService } from '../src/performance-service.js';

test('generates and stores performance intelligence record', () => {
  const service = new PerformanceService();

  const record = service.generateIntelligence({
    workflowId: 'wf-800',
    requestId: 'req-800',
    executiveState: 'AWAITING_RESEARCH',
    researchStatus: 'COMPLETED',
    metricCount: 5,
    metricSummary: { totalValue: 100, retryTotal: 1 },
    memoryRecordCount: 2,
    tags: ['workflow-performance'],
  });

  assert.equal(record.workflowId, 'wf-800');
  assert.equal(record.status.value, 'GENERATED');
  assert.equal(record.signals.length, 4);
  assert.equal(service.getHistory().length, 1);
});

test('retrieves intelligence by workflow and status', () => {
  const service = new PerformanceService();
  service.generateIntelligence({
    workflowId: 'wf-801',
    requestId: 'req-801',
    executiveState: 'AWAITING_RESEARCH',
    researchStatus: 'COMPLETED',
    metricCount: 3,
    metricSummary: { totalValue: 30, retryTotal: 0 },
    memoryRecordCount: 1,
    tags: ['tag-a'],
  });

  const byWorkflow = service.retrieveIntelligence({ workflowId: 'wf-801' });
  const byStatus = service.retrieveIntelligence({ status: 'GENERATED' });

  assert.equal(byWorkflow.total, 1);
  assert.equal(byStatus.total, 1);
});

test('captures performance snapshot', () => {
  const service = new PerformanceService();
  service.generateIntelligence({
    workflowId: 'wf-802',
    requestId: 'req-802',
    executiveState: 'AWAITING_RESEARCH',
    researchStatus: 'COMPLETED',
    metricCount: 4,
    metricSummary: { totalValue: 45, retryTotal: 2 },
    memoryRecordCount: 3,
    tags: ['tag-snapshot'],
  });

  const snapshot = service.captureSnapshot({ workflowId: 'wf-802' });
  assert.equal(snapshot.result.total, 1);
  assert.equal(snapshot.result.records[0].requestId, 'req-802');
});

test('fails when required identifiers are missing', () => {
  const service = new PerformanceService();
  assert.throws(() => {
    service.generateIntelligence({
      workflowId: '',
      requestId: '',
      executiveState: 'NEW',
      researchStatus: 'NEW',
      metricCount: 0,
      metricSummary: { totalValue: 0, retryTotal: 0 },
      memoryRecordCount: 0,
    });
  }, /requires workflowId and requestId/);
});

test('logs generation and retrieval operations', () => {
  const service = new PerformanceService();
  service.generateIntelligence({
    workflowId: 'wf-803',
    requestId: 'req-803',
    executiveState: 'AWAITING_RESEARCH',
    researchStatus: 'COMPLETED',
    metricCount: 2,
    metricSummary: { totalValue: 20, retryTotal: 0 },
    memoryRecordCount: 1,
    tags: ['tag-log'],
  });
  service.retrieveIntelligence({ workflowId: 'wf-803' });

  assert.equal(service.logger.getEntries().length, 2);
});

test('supports executive-facing facade contract methods', () => {
  const service = new PerformanceService();

  service.recordExecution({
    workflowId: 'wf-804',
    requestId: 'req-804',
    executiveState: 'AWAITING_RESEARCH',
    researchStatus: 'COMPLETED',
    metricCount: 4,
    metricSummary: { totalValue: 40, retryTotal: 0 },
    memoryRecordCount: 2,
    tags: ['capability-a'],
  });

  service.recordCapabilityResult({
    workflowId: 'wf-804',
    requestId: 'req-804',
    executiveState: 'AWAITING_RESEARCH',
    researchStatus: 'COMPLETED',
    metricCount: 6,
    metricSummary: { totalValue: 60, retryTotal: 1 },
    memoryRecordCount: 3,
    tags: ['capability-a'],
  });

  const report = service.generatePerformanceReport({ workflowId: 'wf-804' });
  const recommendations = service.generateRecommendations({ workflowId: 'wf-804' });
  const confidence = service.calculateConfidence({ workflowId: 'wf-804' });
  const regression = service.detectRegression({ workflowId: 'wf-804' });
  const improvement = service.detectImprovement({ workflowId: 'wf-804' });
  const health = service.getCapabilityHealth({ workflowId: 'wf-804' });

  assert.equal(report.total, 2);
  assert.equal(recommendations.length, 2);
  assert.equal(confidence > 0, true);
  assert.equal(regression, false);
  assert.equal(improvement, true);
  assert.equal(health.status, 'HEALTHY');
});
