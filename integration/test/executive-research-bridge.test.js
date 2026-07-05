import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveResearchBridge } from '../src/executive-research-bridge.js';
import { RequestTranslator } from '../src/request-translator.js';
import { ResponseTranslator } from '../src/response-translator.js';
import { IntegrationLogger } from '../src/integration-logger.js';

test('bridges executive request to research execution and returns a translated response', async () => {
  const logger = new IntegrationLogger();
  const executiveService = {
    handleRequest: async (request) => ({ workflowId: 'wf-1', status: 'accepted', request })
  };
  const researchService = {
    createResearchJob: async () => ({ id: 'job-1' }),
    executeResearch: async () => ({ status: 'completed', report: 'summary', evidence: ['e1'], metadata: { source: 'atlas' } })
  };

  const bridge = new ExecutiveResearchBridge({
    executiveService,
    researchService,
    requestTranslator: new RequestTranslator(),
    responseTranslator: new ResponseTranslator(),
    logger
  });

  const result = await bridge.execute({ id: 'req-1', objective: 'Investigate', context: { topic: 'policy' } });

  assert.equal(result.workflowId, 'wf-1');
  assert.equal(result.status, 'completed');
  assert.equal(result.report, 'summary');
  assert.deepEqual(logger.entries[0].result, result);
});
