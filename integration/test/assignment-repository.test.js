import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { AssignmentRepository } from '../src/assignment-repository.js';
import { WorkerAssignment } from '../src/worker-assignment.js';

const TEST_STORAGE_PATH = '/tmp/atlas-assignment-repository-test.json';

function resetStore() {
  rmSync(TEST_STORAGE_PATH, { force: true });
}

test('save stores assignment for later retrieval', () => {
  resetStore();
  const repository = new AssignmentRepository({ storagePath: TEST_STORAGE_PATH });
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-200',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-200'
  });

  repository.saveAssignment(assignment);
  const loaded = repository.loadAssignment('ASG-200');

  assert.equal(loaded.assignmentId, 'ASG-200');
  assert.equal(loaded.workerId, 'RESEARCH-WORKER-001');
  assert.equal(loaded.taskId, 'TASK-200');
  resetStore();
});

test('reload reads persisted assignments from repository storage', () => {
  resetStore();
  const repository = new AssignmentRepository({ storagePath: TEST_STORAGE_PATH });
  repository.saveAssignment(new WorkerAssignment({
    assignmentId: 'ASG-201',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-201'
  }));

  const reloadedRepository = new AssignmentRepository({ storagePath: TEST_STORAGE_PATH });
  const assignments = reloadedRepository.listAssignments();

  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].assignmentId, 'ASG-201');
  resetStore();
});

test('updateAssignment persists assignment lifecycle updates', () => {
  resetStore();
  const repository = new AssignmentRepository({ storagePath: TEST_STORAGE_PATH });
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-202',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-202'
  });

  repository.saveAssignment(assignment);
  assignment.start();
  assignment.complete({ summary: 'done' });
  repository.updateAssignment(assignment);

  const loaded = repository.loadAssignment('ASG-202');

  assert.equal(loaded.status, 'COMPLETED');
  assert.equal(loaded.startedAt, 'STARTED_AT_PLACEHOLDER');
  assert.equal(loaded.completedAt, 'COMPLETED_AT_PLACEHOLDER');
  assert.deepEqual(loaded.result, { summary: 'done' });
  resetStore();
});

test('restart recovery preserves assignments across repository instances', () => {
  resetStore();
  const repositoryBeforeRestart = new AssignmentRepository({ storagePath: TEST_STORAGE_PATH });
  repositoryBeforeRestart.saveAssignment(new WorkerAssignment({
    assignmentId: 'ASG-203',
    workerId: 'RESEARCH-WORKER-001',
    taskId: 'TASK-203'
  }));
  repositoryBeforeRestart.saveAssignment(new WorkerAssignment({
    assignmentId: 'ASG-204',
    workerId: 'RESEARCH-WORKER-002',
    taskId: 'TASK-204'
  }));

  const repositoryAfterRestart = new AssignmentRepository({ storagePath: TEST_STORAGE_PATH });
  const recoveredAssignments = repositoryAfterRestart.listAssignments();

  assert.equal(recoveredAssignments.length, 2);
  assert.deepEqual(recoveredAssignments.map(assignment => assignment.assignmentId), ['ASG-203', 'ASG-204']);
  resetStore();
});