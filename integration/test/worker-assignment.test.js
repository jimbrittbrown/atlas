import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerAssignment } from '../src/worker-assignment.js';

test('assignment is created with required fields', () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-010',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-010'
  });

  assert.equal(assignment.assignmentId, 'ASG-010');
  assert.equal(assignment.workerId, 'RESEARCH-WORKER-001');
  assert.equal(assignment.taskId, 'TASK-010');
  assert.equal(assignment.status, 'ASSIGNED');
  assert.equal(assignment.assignedAt, 'ASSIGNED_AT_PLACEHOLDER');
  assert.equal(assignment.startedAt, null);
  assert.equal(assignment.completedAt, null);
  assert.equal(assignment.result, null);
});

test('assignment status transitions from ASSIGNED to IN_PROGRESS to COMPLETED', () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-011',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-011'
  });

  assignment.start();
  assignment.complete({ message: 'done' });

  assert.equal(assignment.status, 'COMPLETED');
  assert.equal(assignment.startedAt, 'STARTED_AT_PLACEHOLDER');
  assert.equal(assignment.completedAt, 'COMPLETED_AT_PLACEHOLDER');
  assert.deepEqual(assignment.result, { message: 'done' });
});

test('assignment status transitions from ASSIGNED to IN_PROGRESS to BLOCKED', () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-012',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-012'
  });

  assignment.start();
  assignment.block({ reason: 'dependency missing' });

  assert.equal(assignment.status, 'BLOCKED');
  assert.equal(assignment.startedAt, 'STARTED_AT_PLACEHOLDER');
  assert.equal(assignment.completedAt, 'COMPLETED_AT_PLACEHOLDER');
  assert.deepEqual(assignment.result, { reason: 'dependency missing' });
});