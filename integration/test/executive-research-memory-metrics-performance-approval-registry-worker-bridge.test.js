import test from 'node:test';
import assert from 'node:assert/strict';
import { IntegrationLogger } from '../src/integration-logger.js';
import { ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerBridge } from '../src/executive-research-memory-metrics-performance-approval-registry-worker-bridge.js';

test('executes worker orchestration when governance result is authorized', async () => {
  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerBridge({
    registryBridge: {
      execute: async () => ({
        workflowId: 'wf-1400',
        authorization: { authorized: true, status: 'APPROVED' },
      }),
    },
    workerOrchestrationAdapter: {
      executeApprovedWorkflow: async () => ({
        workflowExecutionId: 'execution-1',
        state: { value: 'COMPLETED' },
        completed: 1,
        failed: 0,
        cancelled: 0,
      }),
    },
    logger: new IntegrationLogger(),
  });

  const result = await bridge.execute({ id: 'req-1400', objective: 'execute work', context: {} });
  assert.equal(result.execution.state.value, 'COMPLETED');
});

test('skips worker orchestration when governance result is rejected', async () => {
  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerBridge({
    registryBridge: {
      execute: async () => ({
        workflowId: 'wf-1401',
        authorization: { authorized: false, status: 'REJECTED' },
      }),
    },
    workerOrchestrationAdapter: {
      executeApprovedWorkflow: async () => {
        throw new Error('should not run');
      },
    },
    logger: new IntegrationLogger(),
  });

  const result = await bridge.execute({ id: 'req-1401', objective: 'do not execute', context: {} });
  assert.equal(result.execution.executed, false);
  assert.equal(result.execution.reason, 'Authorization not granted');
});
