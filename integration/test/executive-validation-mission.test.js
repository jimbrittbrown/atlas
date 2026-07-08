import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveWorkflowCoordinator } from '../src/executive-workflow-coordinator.js';

test('runs validation mission and generates executive decision package', async () => {
  const logger = { entries: [], log(entry) { this.entries.push(entry); } };

  const coordinator = new ExecutiveWorkflowCoordinator({
    executiveService: { handleRequest: async () => ({ workflowId: 'unused' }) },
    bridge: { execute: async () => ({ status: 'unused' }) },
    logger
  });

  const result = await coordinator.runValidationMission({
    id: 'VM-001',
    objective: 'Evaluate whether Atlas should launch the AI Horror Shorts business'
  });

  assert.equal(result.mission.id, 'VM-001');
  assert.equal(result.mission.decisionClass, 'Strategic');
  assert.equal(result.investigations.length, 6);
  assert.equal(result.readiness.status, 'READY');
  assert.equal(result.recommendation, 'READY_FOR_EXECUTIVE_REVIEW');
  assert.equal(result.authorityRequired, 'CEO Strategic Approval');
  assert.equal(logger.entries.at(-1).message, 'Executive Decision Package generated');
});
