import test from 'node:test';
import assert from 'node:assert/strict';
import { IntegrationLogger } from '../src/integration-logger.js';
import { ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterBridge } from '../src/executive-research-memory-metrics-performance-approval-registry-worker-control-center-bridge.js';

test('generates control center view for authorized workflow execution', async () => {
  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterBridge({
    workerBridge: {
      execute: async () => ({
        workflowId: 'wf-1600',
        execution: {
          id: 'exec-1600',
          state: { value: 'COMPLETED' },
        },
      }),
    },
    controlCenterAdapter: {
      buildOperationalView: ({ workflowExecutionId }) => ({
        overview: { workflowState: 'COMPLETED' },
        workflowOperations: { workflowExecution: { id: workflowExecutionId } },
      }),
    },
    logger: new IntegrationLogger(),
  });

  const result = await bridge.execute({ id: 'req-1600', objective: 'observe' });
  assert.equal(result.controlCenter.overview.workflowState, 'COMPLETED');
  assert.equal(result.controlCenter.workflowOperations.workflowExecution.id, 'exec-1600');
});

test('generates control center view for non-executed workflow outcomes without orchestration side effects', async () => {
  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterBridge({
    workerBridge: {
      execute: async () => ({
        workflowId: 'wf-1601',
        execution: {
          executed: false,
          reason: 'Authorization not granted',
        },
      }),
    },
    controlCenterAdapter: {
      buildOperationalView: () => ({
        overview: { workflowState: 'UNKNOWN' },
        alerts: { alerts: [{ source: 'approval-service', status: 'REJECTED' }] },
      }),
    },
    logger: new IntegrationLogger(),
  });

  const result = await bridge.execute({ id: 'req-1601', objective: 'observe-rejected' });
  assert.equal(result.execution.executed, false);
  assert.equal(result.controlCenter.alerts.alerts.length, 1);
});
