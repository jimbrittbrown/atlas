import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveWorkflowCoordinator } from '../src/executive-workflow-coordinator.js';
import { IntegrationLogger } from '../src/integration-logger.js';

test('coordinates executive workflow with the bridge and returns both responses', async () => {
  const logger = new IntegrationLogger();
  const executiveService = {
    handleRequest: async (request) => ({ workflowId: 'wf-2', status: 'accepted', request })
  };
  const bridge = {
    execute: async () => ({ workflowId: 'wf-2', status: 'completed', report: 'done' })
  };

  const coordinator = new ExecutiveWorkflowCoordinator({ executiveService, bridge, logger });
  const result = await coordinator.run({ id: 'req-2', objective: 'Assess', context: {} });

  assert.equal(result.executiveResponse.workflowId, 'wf-2');
  assert.equal(result.integrationResult.status, 'completed');
  assert.equal(logger.entries[0].message, 'Workflow coordination complete');
});
