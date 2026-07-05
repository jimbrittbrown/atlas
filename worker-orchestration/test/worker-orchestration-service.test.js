import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerOrchestrationService } from '../src/worker-orchestration-service.js';

test('discovers workers through capability registry only', () => {
  let searchCalls = 0;
  const registry = {
    searchCapabilities: () => {
      searchCalls += 1;
      return { records: [{ metadata: { name: 'Approval Service' } }], total: 1 };
    },
  };

  const service = new WorkerOrchestrationService({ capabilityRegistry: registry });
  service.registerWorker({ id: 'worker-1', name: 'Worker 1', capability: 'Approval Service' });

  const workers = service.discoverWorkers({ capability: 'Approval Service' });

  assert.equal(searchCalls, 1);
  assert.equal(workers.length, 1);
});

test('selects lowest-load active worker and assigns approved work', async () => {
  const registry = {
    searchCapabilities: () => ({ records: [{ metadata: { name: 'Approval Service' } }], total: 1 }),
  };
  const service = new WorkerOrchestrationService({ capabilityRegistry: registry });

  service.registerWorker({ id: 'worker-a', name: 'Worker A', capability: 'Approval Service', maxConcurrency: 2, currentLoad: 1 });
  service.registerWorker({ id: 'worker-b', name: 'Worker B', capability: 'Approval Service', maxConcurrency: 2, currentLoad: 0 });

  const assignment = await service.assignWork({
    authorization: { authorized: true },
    workItem: {
      id: 'work-1',
      workflowId: 'wf-1300',
      requestId: 'req-1300',
      capability: 'Approval Service',
      payload: {},
      dependencies: [],
      maxRetries: 2,
      timeoutMs: 60000,
      stage: 0,
    },
  });

  assert.equal(assignment.workerId, 'worker-b');
  assert.equal(assignment.state.value, 'COMPLETED');
});

test('coordinates parallel staged workflow execution and reports completion', async () => {
  const registry = {
    searchCapabilities: ({ search }) => ({
      records: [{ metadata: { name: search || 'Approval Service' } }],
      total: 1,
    }),
  };

  const service = new WorkerOrchestrationService({ capabilityRegistry: registry });
  service.registerWorker({ id: 'worker-2', name: 'Worker 2', capability: 'Approval Service', maxConcurrency: 2 });

  const result = await service.coordinateWorkflow({
    workflowId: 'wf-1301',
    requestId: 'req-1301',
    authorization: { authorized: true },
    workItems: [
      { id: 'a', workflowId: 'wf-1301', requestId: 'req-1301', capability: 'Approval Service', stage: 0, dependencies: [] },
      { id: 'b', workflowId: 'wf-1301', requestId: 'req-1301', capability: 'Approval Service', stage: 1, dependencies: ['a'] },
    ],
  });

  assert.equal(result.state.value, 'COMPLETED');
  assert.equal(result.completed, 2);
});

test('supports retry path after failure', async () => {
  let firstAttempt = true;
  const workerExecutor = {
    execute: async () => {
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error('Transient failure');
      }
      return { status: 'completed' };
    },
  };

  const registry = {
    searchCapabilities: () => ({ records: [{ metadata: { name: 'Approval Service' } }], total: 1 }),
  };

  const service = new WorkerOrchestrationService({ capabilityRegistry: registry, workerExecutor });
  service.registerWorker({ id: 'worker-retry', name: 'Worker Retry', capability: 'Approval Service' });

  const failed = await service.assignWork({
    authorization: { authorized: true },
    workItem: {
      id: 'work-retry',
      workflowId: 'wf-1302',
      requestId: 'req-1302',
      capability: 'Approval Service',
      maxRetries: 2,
    },
  });

  assert.equal(failed.state.value, 'FAILED');

  const retried = await service.retryWork({ assignmentId: failed.id });
  assert.equal(retried.state.value, 'COMPLETED');
});

test('rejects assignment when authorization is not approved', async () => {
  const registry = {
    searchCapabilities: () => ({ records: [{ metadata: { name: 'Approval Service' } }], total: 1 }),
  };
  const service = new WorkerOrchestrationService({ capabilityRegistry: registry });
  service.registerWorker({ id: 'worker-3', name: 'Worker 3', capability: 'Approval Service' });

  await assert.rejects(
    () => service.assignWork({
      authorization: { authorized: false },
      workItem: { id: 'work-unauth', workflowId: 'wf-1303', requestId: 'req-1303', capability: 'Approval Service' },
    }),
    /requires approved authorization/
  );
});
