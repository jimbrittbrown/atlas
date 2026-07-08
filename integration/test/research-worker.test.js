import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchWorker } from '../src/research/research-worker.js';

test('worker accepts assigned task and maps it to research request', async () => {
  let receivedRequest = null;
  const worker = new ResearchWorker({
    research: async request => {
      receivedRequest = request;

      return { report: { findings: [] } };
    }
  });

  await worker.execute({
    id: 'TASK-RESEARCH-001',
    objective: 'Assess market demand',
    context: { missionId: 'VM-001' }
  });

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

  await worker.execute({
    id: 'TASK-RESEARCH-002',
    objective: 'Assess competitive landscape'
  });

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

  const result = await worker.execute({
    id: 'TASK-RESEARCH-003',
    objective: 'Assess legal exposure'
  });

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
});
