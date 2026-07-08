import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchWorker } from '../src/research/research-worker.js';
import { WorkerAssignment } from '../src/worker-assignment.js';

test('worker accepts assignment and maps it to research request', async () => {
  let receivedRequest = null;
  const worker = new ResearchWorker({
    research: async request => {
      receivedRequest = request;

      return { report: { findings: [] } };
    }
  });

  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-001',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-RESEARCH-001',
    result: {
      task: {
        id: 'TASK-RESEARCH-001',
        objective: 'Assess market demand',
        context: { missionId: 'VM-001' }
      }
    }
  });

  await worker.execute(assignment);

  assert.deepEqual(receivedRequest, {
    id: 'TASK-RESEARCH-001',
    objective: 'Assess market demand',
    context: { missionId: 'VM-001' },
    capability: 'research'
  });
});

test('worker executes research through coordinator', async () => {
  let executionCount = 0;
  const worker = new ResearchWorker({
    research: async () => {
      executionCount += 1;

      return { report: { findings: [] } };
    }
  });

  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-002',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-RESEARCH-002',
    result: {
      task: {
        id: 'TASK-RESEARCH-002',
        objective: 'Assess competitive landscape'
      }
    }
  });

  await worker.execute(assignment);

  assert.equal(executionCount, 1);
});

test('worker reports structured completion', async () => {
  const worker = new ResearchWorker({
    research: async () => ({
      report: {
        findings: [{ id: 'F-001', statement: 'Evidence collected.' }],
        confidence: 0.8,
        executiveSummary: 'Summary'
      }
    })
  });

  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-003',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-RESEARCH-003',
    result: {
      task: {
        id: 'TASK-RESEARCH-003',
        objective: 'Assess legal exposure'
      }
    }
  });

  const result = await worker.execute(assignment);

  assert.deepEqual(result, {
    taskId: 'TASK-RESEARCH-003',
    status: 'COMPLETED',
    findings: [{ id: 'F-001', statement: 'Evidence collected.' }],
    completedAt: 'COMPLETED_AT_PLACEHOLDER',
    report: {
      findings: [{ id: 'F-001', statement: 'Evidence collected.' }],
      confidence: 0.8,
      executiveSummary: 'Summary'
    }
  });
  assert.equal(assignment.status, 'COMPLETED');
  assert.equal(assignment.startedAt, 'STARTED_AT_PLACEHOLDER');
  assert.equal(assignment.completedAt, 'COMPLETED_AT_PLACEHOLDER');
});
