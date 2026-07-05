import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveResearchMemoryBridge } from '../src/executive-research-memory-bridge.js';
import { MemoryServiceAdapter } from '../src/memory-service-adapter.js';
import { RequestTranslator } from '../src/request-translator.js';
import { ResponseTranslator } from '../src/response-translator.js';
import { IntegrationLogger } from '../src/integration-logger.js';
import { MemoryService } from '../../memory/src/memory-service.js';

test('stores completed research output in memory and returns executive-integrated response', async () => {
  const logger = new IntegrationLogger();
  const memoryService = new MemoryService();
  const memoryServiceAdapter = new MemoryServiceAdapter(memoryService);

  const executiveService = {
    handleRequest: async () => ({ workflowId: 'wf-500', status: 'accepted' }),
  };

  const researchService = {
    createResearchJob: async () => ({ id: 'job-500' }),
    executeResearch: async () => ({
      jobId: 'job-500',
      status: { value: 'COMPLETED' },
      report: 'Executive summary report',
      evidence: [{ source: 'atlas-docs', summary: 'evidence', confidence: 0.8 }],
      findings: [{ title: 'Finding', detail: 'Detail', confidence: 0.75 }],
    }),
  };

  const bridge = new ExecutiveResearchMemoryBridge({
    executiveService,
    researchService,
    memoryServiceAdapter,
    requestTranslator: new RequestTranslator(),
    responseTranslator: new ResponseTranslator(),
    logger,
  });

  const response = await bridge.execute({ id: 'req-500', objective: 'Assess institutional readiness', context: { domain: 'atlas' } });

  const researchRecords = memoryService.retrieve({ workflowId: 'wf-500', tag: 'research' });
  const workflowRecords = memoryService.retrieve({ workflowId: 'wf-500', tag: 'workflow-history' });

  assert.equal(response.workflowId, 'wf-500');
  assert.equal(researchRecords.total, 1);
  assert.equal(workflowRecords.total, 1);
  assert.equal(logger.entries[0].message, 'Research report stored in memory and returned to executive workflow');
});

test('propagates memory storage failures and does not hide integration errors', async () => {
  const logger = new IntegrationLogger();
  const failingMemoryAdapter = {
    storeResearchCompletion: async () => {
      throw new Error('Memory unavailable');
    },
    storeWorkflowHistory: async () => {
      throw new Error('Memory unavailable');
    },
  };

  const bridge = new ExecutiveResearchMemoryBridge({
    executiveService: { handleRequest: async () => ({ workflowId: 'wf-501', status: 'accepted' }) },
    researchService: {
      createResearchJob: async () => ({ id: 'job-501' }),
      executeResearch: async () => ({ jobId: 'job-501', status: { value: 'COMPLETED' }, report: 'report', evidence: [], findings: [] }),
    },
    memoryServiceAdapter: failingMemoryAdapter,
    requestTranslator: new RequestTranslator(),
    responseTranslator: new ResponseTranslator(),
    logger,
  });

  await assert.rejects(
    () => bridge.execute({ id: 'req-501', objective: 'Assess failure path', context: {} }),
    /Memory unavailable/
  );
  assert.equal(logger.entries.length, 0);
});
