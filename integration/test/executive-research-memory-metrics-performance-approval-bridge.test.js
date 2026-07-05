import test from 'node:test';
import assert from 'node:assert/strict';
import { IntegrationLogger } from '../src/integration-logger.js';
import { RequestTranslator } from '../src/request-translator.js';
import { ResponseTranslator } from '../src/response-translator.js';
import { MemoryService } from '../../memory/src/memory-service.js';
import { MetricsService } from '../../metrics/src/metrics-service.js';
import { PerformanceService } from '../../performance-intelligence/src/performance-service.js';
import { ApprovalService } from '../../approval/src/approval-service.js';
import { MemoryServiceAdapter } from '../src/memory-service-adapter.js';
import { MetricsServiceAdapter } from '../src/metrics-service-adapter.js';
import { PerformanceIntelligenceAdapter } from '../src/performance-intelligence-adapter.js';
import { ApprovalServiceAdapter } from '../src/approval-service-adapter.js';
import { ExecutiveResearchMemoryMetricsPerformanceApprovalBridge } from '../src/executive-research-memory-metrics-performance-approval-bridge.js';

test('authorizes workflow through approval service after full service chain', async () => {
  const memoryService = new MemoryService();
  const metricsService = new MetricsService();
  const performanceService = new PerformanceService();
  const approvalService = new ApprovalService();

  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalBridge({
    executiveService: { handleRequest: async () => ({ workflowId: 'wf-1100', state: { value: 'AWAITING_RESEARCH' } }) },
    researchService: {
      createResearchJob: async () => ({ id: 'job-1100' }),
      executeResearch: async () => ({
        jobId: 'job-1100',
        status: { value: 'COMPLETED' },
        report: 'report',
        evidence: [{ source: 'atlas', summary: 'evidence', confidence: 0.8 }],
        findings: [{ title: 'finding', detail: 'detail', confidence: 0.7 }],
      }),
    },
    memoryServiceAdapter: new MemoryServiceAdapter(memoryService),
    metricsServiceAdapter: new MetricsServiceAdapter(metricsService),
    performanceIntelligenceAdapter: new PerformanceIntelligenceAdapter({ performanceService, metricsService, memoryService }),
    approvalServiceAdapter: new ApprovalServiceAdapter({ approvalService, metricsService, performanceService }),
    requestTranslator: new RequestTranslator(),
    responseTranslator: new ResponseTranslator(),
    logger: new IntegrationLogger(),
  });

  const response = await bridge.execute({
    id: 'req-1100',
    objective: 'Governance authorization',
    context: { approvedBy: 'CEO', approvalDecision: 'approve' },
  });

  assert.equal(response.workflowId, 'wf-1100');
  assert.equal(response.authorization.authorized, true);
  assert.equal(response.authorization.status, 'APPROVED');
});

test('returns rejected authorization when approval decision is reject', async () => {
  const memoryService = new MemoryService();
  const metricsService = new MetricsService();
  const performanceService = new PerformanceService();
  const approvalService = new ApprovalService();

  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalBridge({
    executiveService: { handleRequest: async () => ({ workflowId: 'wf-1101', state: { value: 'AWAITING_RESEARCH' } }) },
    researchService: {
      createResearchJob: async () => ({ id: 'job-1101' }),
      executeResearch: async () => ({
        jobId: 'job-1101',
        status: { value: 'COMPLETED' },
        report: 'report',
        evidence: [],
        findings: [],
      }),
    },
    memoryServiceAdapter: new MemoryServiceAdapter(memoryService),
    metricsServiceAdapter: new MetricsServiceAdapter(metricsService),
    performanceIntelligenceAdapter: new PerformanceIntelligenceAdapter({ performanceService, metricsService, memoryService }),
    approvalServiceAdapter: new ApprovalServiceAdapter({ approvalService, metricsService, performanceService }),
    requestTranslator: new RequestTranslator(),
    responseTranslator: new ResponseTranslator(),
    logger: new IntegrationLogger(),
  });

  const response = await bridge.execute({
    id: 'req-1101',
    objective: 'Governance rejection',
    context: { approvalDecision: 'reject', rejectionReason: 'Risk threshold exceeded', approvedBy: 'CEO' },
  });

  assert.equal(response.authorization.authorized, false);
  assert.equal(response.authorization.status, 'REJECTED');
  assert.equal(response.authorization.reason, 'Risk threshold exceeded');
});
