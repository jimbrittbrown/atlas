import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgramManager } from '../src/executive/program-manager.js';

test('progress is calculated from execution tasks', () => {
  const programManager = new ProgramManager();

  const report = programManager.supervise({
    tasks: [
      { id: 'TASK-001', status: 'COMPLETED' },
      { id: 'TASK-002', status: 'COMPLETED' },
      { id: 'TASK-003', status: 'PENDING' },
      { id: 'TASK-004', status: 'IN_PROGRESS' }
    ]
  });

  assert.equal(report.completionPercentage, 50);
  assert.equal(report.completedTasks, 2);
  assert.equal(report.activeTasks, 2);
  assert.equal(report.blockedTasks, 0);
  assert.equal(report.executiveStatus, 'ON_TRACK');
});

test('blocked tasks are identified in executive report', () => {
  const programManager = new ProgramManager();

  const report = programManager.generateExecutiveProgressReport({
    tasks: [
      { id: 'TASK-010', status: 'COMPLETED' },
      { id: 'TASK-011', status: 'BLOCKED' },
      { id: 'TASK-012', status: 'PENDING' }
    ]
  });

  assert.equal(report.blockedTasks, 1);
  assert.equal(report.activeTasks, 1);
  assert.equal(report.executiveStatus, 'BLOCKED');
});

test('executive report is generated with overdue detection placeholder logic', () => {
  const programManager = new ProgramManager();

  const report = programManager.supervise({
    tasks: [
      { id: 'TASK-020', status: 'COMPLETED' },
      { id: 'TASK-021', status: 'OVERDUE' },
      { id: 'TASK-022', status: 'PENDING' }
    ]
  });

  assert.deepEqual(report, {
    completionPercentage: 33,
    completedTasks: 1,
    activeTasks: 2,
    blockedTasks: 0,
    executiveStatus: 'AT_RISK'
  });
});
