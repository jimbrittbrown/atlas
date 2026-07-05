import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveResearchMemoryMetricsBridge } from '../src/executive-research-memory-metrics-bridge.js';
import { IntegrationLogger } from '../src/integration-logger.js';
import { MemoryService } from '../../memory/src/memory-service.js';
import { MemoryServiceAdapter } from '../src/memory-service-adapter.js';
import { MetricsService } from '../../metrics/src/metrics-service.js';
import { MetricsServiceAdapter } from '../src/metrics-service-adapter.js';
import { RequestTranslator } from '../src/request-translator.js';
import { ResponseTranslator } from '../src/response-translator.js';

test('records workflow metrics after executive-research-memory completion', async () => {
  const memoryService = new MemoryService();
  const metricsService = new MetricsService();

  const bridge = new ExecutiveResearchMemoryMetricsBridge({
    executiveService: { handleRequest: async () => ({ workflowId: 'wf-700', status: 'accepted' }) },
    researchService: {
      createResearchJob: async () => ({ id: 'job-700' }),
      executeResearch: async () => ({
        jobId: 'job-700',
        status: { value: 'COMPLETED' },
        report: 'Research report',
        evidence: [{ source: 'atlas', summary: 'summary', confidence: 0.8 }],
        findings: [{ title: 'finding', detail: 'detail', confidence: 0.7 }],
      }),
    },
    memoryServiceAdapter: new MemoryServiceAdapter(memoryService),
    metricsServiceAdapter: new MetricsServiceAdapter(metricsService),
    requestTranslator: new RequestTranslator(),
    responseTranslator: new ResponseTranslator(),
    logger: new IntegrationLogger(),
  });

  const response = await bridge.execute({ id: 'req-700', objective: 'Measure workflow outcomes', context: { sprint: 's2' } });

  const workflowMetrics = metricsService.retrieveMetrics({ workflowId: 'wf-700', tag: 'workflow-completion' });
  const serviceMetrics = metricsService.retrieveMetrics({ workflowId: 'wf-700', category: { value: 'Service Metrics' } });

  assert.equal(response.workflowId, 'wf-700');
  assert.equal(workflowMetrics.total, 1);
  assert.equal(serviceMetrics.total, 2);
});

test('records error metrics on integration failure', async () => {
  const metricsService = new MetricsService();

  const bridge = new ExecutiveResearchMemoryMetricsBridge({
    executiveService: { handleRequest: async () => ({ workflowId: 'wf-701', status: 'accepted' }) },
    researchService: {
      createResearchJob: async () => ({ id: 'job-701' }),
      executeResearch: async () => ({
        jobId: 'job-701',
        status: { value: 'COMPLETED' },
        report: 'Research report',
        evidence: [],
        findings: [],
      }),
    },
    memoryServiceAdapter: {
      storeResearchCompletion: async () => {
        throw new Error('Memory service failure');
      },
      storeWorkflowHistory: async () => {
        throw new Error('Memory service failure');
      },
    },
    metricsServiceAdapter: new MetricsServiceAdapter(metricsService),
    requestTranslator: new RequestTranslator(),
    responseTranslator: new ResponseTranslator(),
    logger: new IntegrationLogger(),
  });

  await assert.rejects(() => bridge.execute({ id: 'req-701', objective: 'Measure failure', context: {} }), /Memory service failure/);

  const errors = metricsService.retrieveMetrics({ category: { value: 'Error Metrics' } });
  assert.equal(errors.total, 1);
  assert.equal(errors.records[0].event.status, 'failure');
});
