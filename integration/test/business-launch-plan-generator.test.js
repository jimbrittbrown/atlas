import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessLaunchPlanGenerator } from '../src/executive/business-launch-plan-generator.js';
import { ExecutiveWorkflowCoordinator } from '../src/executive-workflow-coordinator.js';

test('launch plan is generated from executive decision package', () => {
  const generator = new BusinessLaunchPlanGenerator();

  const launchPlan = generator.generate({
    businessName: 'AI Horror Shorts',
    objective: 'Launch AI Horror Shorts studio.',
    recommendation: 'READY_FOR_EXECUTIVE_REVIEW',
    confidence: 82,
    decisionReadiness: { status: 'READY' }
  });

  assert.equal(launchPlan.businessName, 'AI Horror Shorts');
  assert.equal(launchPlan.objective, 'Launch AI Horror Shorts studio.');
  assert.equal(Array.isArray(launchPlan.successCriteria), true);
});

test('launch plan includes default phases', () => {
  const generator = new BusinessLaunchPlanGenerator();

  const launchPlan = generator.generate({
    businessName: 'Atlas Media Venture',
    recommendation: 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION',
    confidence: 71,
    decisionReadiness: { status: 'READY_WITH_CONDITIONS' }
  });

  assert.equal(Array.isArray(launchPlan.phases), true);
  assert.deepEqual(launchPlan.phases.map(phase => phase.name), ['Foundation', 'Production', 'Growth']);
});

test('launch plan includes deterministic milestone placeholders', () => {
  const generator = new BusinessLaunchPlanGenerator();

  const launchPlan = generator.generate({
    mission: { title: 'Atlas Narrative Studio' },
    recommendation: 'READY_FOR_EXECUTIVE_REVIEW',
    confidence: 90,
    decisionReadiness: { status: 'READY' }
  });

  assert.equal(Array.isArray(launchPlan.milestones), true);
  assert.equal(launchPlan.milestones.length, 6);
  assert.equal(launchPlan.phases[0].milestones[0], 'FOUNDATION-M1: Define operating model and ownership.');
  assert.equal(launchPlan.phases[1].milestones[0], 'PRODUCTION-M1: Deliver initial production release.');
  assert.equal(launchPlan.phases[2].milestones[0], 'GROWTH-M1: Activate repeatable demand channels.');
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
    id: 'VM-PIPE-BF-001',
    objective: 'Validate launch plan generator did not break pipeline'
  });

  assert.equal(result.mission.id, 'VM-PIPE-BF-001');
  assert.equal(result.investigations.length, 6);
  assert.equal(result.readiness.status, 'READY');
  assert.equal(result.recommendation, 'READY_FOR_EXECUTIVE_REVIEW');
  assert.equal(result.authorityRequired, 'CEO Strategic Approval');
});
