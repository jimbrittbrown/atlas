import test from 'node:test';
import assert from 'node:assert/strict';
import { IntegrationLogger } from '../src/integration-logger.js';
import { RequestTranslator } from '../src/request-translator.js';
import { ResponseTranslator } from '../src/response-translator.js';
import { MemoryService } from '../../memory/src/memory-service.js';
import { MetricsService } from '../../metrics/src/metrics-service.js';
import { PerformanceService } from '../../performance-intelligence/src/performance-service.js';
import { MemoryServiceAdapter } from '../src/memory-service-adapter.js';
import { MetricsServiceAdapter } from '../src/metrics-service-adapter.js';
import { PerformanceIntelligenceAdapter } from '../src/performance-intelligence-adapter.js';
import { ExecutiveResearchMemoryMetricsPerformanceBridge } from '../src/executive-research-memory-metrics-performance-bridge.js';

test('extends workflow integration to generate performance intelligence', async () => {
  const memoryService = new MemoryService();
  const metricsService = new MetricsService();
  const performanceService = new PerformanceService();

  const bridge = new ExecutiveResearchMemoryMetricsPerformanceBridge({
    executiveService: { handleRequest: async () => ({ workflowId: 'wf-900', state: { value: 'AWAITING_RESEARCH' } }) },
    researchService: {
      createResearchJob: async () => ({ id: 'job-900' }),
      executeResearch: async () => ({
        jobId: 'job-900',
        status: { value: 'COMPLETED' },
        report: 'report',
        evidence: [{ source: 'atlas', summary: 'evidence', confidence: 0.8 }],
        findings: [{ title: 'finding', detail: 'detail', confidence: 0.7 }],
      }),
    },
    memoryServiceAdapter: new MemoryServiceAdapter(memoryService),
    metricsServiceAdapter: new MetricsServiceAdapter(metricsService),
    performanceIntelligenceAdapter: new PerformanceIntelligenceAdapter({ performanceService, metricsService, memoryService }),
    requestTranslator: new RequestTranslator(),
    responseTranslator: new ResponseTranslator(),
    logger: new IntegrationLogger(),
  });

  const response = await bridge.execute({ id: 'req-900', objective: 'Generate performance intelligence', context: { sprint: 's3' } });
  const intelligence = performanceService.retrieveIntelligence({ workflowId: 'wf-900' });

  assert.equal(response.workflowId, 'wf-900');
  assert.equal(intelligence.total, 1);
  assert.equal(intelligence.records[0].status.value, 'GENERATED');
});

test('captures failure intelligence when integration execution fails', async () => {
  const performanceService = new PerformanceService();
  const metricsService = new MetricsService();

  const bridge = new ExecutiveResearchMemoryMetricsPerformanceBridge({
    executiveService: { handleRequest: async () => ({ workflowId: 'wf-901', state: { value: 'AWAITING_RESEARCH' } }) },
    researchService: {
      createResearchJob: async () => ({ id: 'job-901' }),
      executeResearch: async () => ({
        jobId: 'job-901',
        status: { value: 'COMPLETED' },
        report: 'report',
        evidence: [],
        findings: [],
      }),
    },
    memoryServiceAdapter: {
      storeResearchCompletion: async () => {
        throw new Error('memory failure');
      },
      storeWorkflowHistory: async () => {
        throw new Error('memory failure');
      },
    },
    metricsServiceAdapter: new MetricsServiceAdapter(metricsService),
    performanceIntelligenceAdapter: new PerformanceIntelligenceAdapter({
      performanceService,
      metricsService,
      memoryService: { retrieve: () => ({ total: 0 }) },
    }),
    requestTranslator: new RequestTranslator(),
    responseTranslator: new ResponseTranslator(),
    logger: new IntegrationLogger(),
  });

  await assert.rejects(() => bridge.execute({ id: 'req-901', objective: 'Failure path', context: {} }), /memory failure/);
  const failureIntelligence = performanceService.retrieveIntelligence({ requestId: 'req-901' });

  assert.equal(failureIntelligence.total, 1);
  assert.equal(failureIntelligence.records[0].context.tags.includes('failure'), true);
});
