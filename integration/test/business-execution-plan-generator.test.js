import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessExecutionPlanGenerator } from '../src/executive/business-execution-plan-generator.js';
import { ExecutiveWorkflowCoordinator } from '../src/executive-workflow-coordinator.js';

test('execution plan is generated from launch plan', () => {
  const generator = new BusinessExecutionPlanGenerator();

  const executionPlan = generator.generate({
    businessName: 'AI Horror Shorts',
    objective: 'Launch AI Horror Shorts studio.',
    phases: [
      {
        name: 'Foundation',
        milestones: ['FOUNDATION-M1: Define operating model and ownership.']
      },
      {
        name: 'Production',
        milestones: ['PRODUCTION-M1: Deliver initial production release.']
      },
      {
        name: 'Growth',
        milestones: ['GROWTH-M1: Activate repeatable demand channels.']
      }
    ]
  });

  assert.equal(Array.isArray(executionPlan.phases), true);
  assert.equal(Array.isArray(executionPlan.tasks), true);
  assert.equal(Array.isArray(executionPlan.dependencies), true);
  assert.equal(Array.isArray(executionPlan.executionOrder), true);
  assert.equal(Array.isArray(executionPlan.completionCriteria), true);
});

test('execution plan generates tasks from milestones', () => {
  const generator = new BusinessExecutionPlanGenerator();

  const executionPlan = generator.generate({
    phases: [
      {
        name: 'Foundation',
        milestones: [
          'FOUNDATION-M1: Define operating model and ownership.',
          'FOUNDATION-M2: Establish launch readiness baseline.'
        ]
      }
    ]
  });

  assert.equal(executionPlan.tasks.length, 2);
  assert.equal(executionPlan.tasks[0].milestone, 'FOUNDATION-M1: Define operating model and ownership.');
  assert.equal(executionPlan.tasks[1].milestone, 'FOUNDATION-M2: Establish launch readiness baseline.');
  assert.equal(executionPlan.tasks[0].status, 'PENDING');
});

test('execution plan includes deterministic execution order', () => {
  const generator = new BusinessExecutionPlanGenerator();

  const executionPlan = generator.generate({
    phases: [
      {
        name: 'Foundation',
        milestones: ['FOUNDATION-M1: Define operating model and ownership.']
      },
      {
        name: 'Production',
        milestones: ['PRODUCTION-M1: Deliver initial production release.']
      }
    ]
  });

  assert.deepEqual(executionPlan.executionOrder, ['TASK-001', 'TASK-002']);
  assert.deepEqual(executionPlan.dependencies, [
    { taskId: 'TASK-001', dependsOn: [] },
    { taskId: 'TASK-002', dependsOn: ['TASK-001'] }
  ]);
});

test('existing pipeline remains intact', async () => {
  const logger = { entries: [], log(entry) { this.entries.push(entry); } };
  const coordinator = new ExecutiveWorkflowCoordinator({
    executiveService: { handleRequest: async () => ({ workflowId: 'unused' }) },
    bridge: { execute: async () => ({ status: 'unused' }) },
    logger,
    investigationManager: {
      executeInvestigations: async investigations => investigations.map(investigation => ({
        investigationId: investigation.id,
        investigationName: investigation.name,
        research: {
          report: {
            confidence: 0.8,
            executiveSummary: `Completed: ${investigation.name}`
          }
        }
      }))
    }
  });

  const result = await coordinator.runValidationMission({
    id: 'VM-PIPE-BF-002',
    objective: 'Validate execution plan generator did not break pipeline'
  });

  assert.equal(result.mission.id, 'VM-PIPE-BF-002');
  assert.equal(result.investigations.length, 6);
  assert.equal(result.readiness.status, 'READY');
  assert.equal(result.recommendation, 'READY_FOR_EXECUTIVE_REVIEW');
  assert.equal(result.authorityRequired, 'CEO Strategic Approval');
});
