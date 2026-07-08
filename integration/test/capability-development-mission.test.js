import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityDevelopmentMission } from '../src/executive/capability-development-mission.js';

test('capability mission generated', () => {
  const mission = new CapabilityDevelopmentMission();

  const result = mission.run({
    capabilityName: 'Enterprise Voice Generation',
    businessNeed: 'Replace placeholder voice synthesis with enterprise-grade service',
    expectedBusinessImpact: 'Faster and more reliable voice production'
  });

  assert.equal(result.capabilityName, 'Enterprise Voice Generation');
  assert.equal(typeof result.objective, 'string');
  assert.equal(Array.isArray(result.engineeringRoadmap.phases), true);
  assert.equal(result.approvalRequired, true);
});

test('roadmap generated', () => {
  const mission = new CapabilityDevelopmentMission();

  const result = mission.run({
    capabilityName: 'Enterprise Voice Generation',
    businessNeed: 'Replace placeholder voice synthesis with enterprise-grade service',
    expectedBusinessImpact: 'Faster and more reliable voice production'
  });

  assert.equal(result.engineeringRoadmap.roadmapId, 'ROADMAP-ENTERPRISE-VOICE-GENERATION');
  assert.deepEqual(result.engineeringRoadmap.phases.map(phase => phase.name), ['Discovery', 'Build', 'Launch']);
  assert.equal(result.engineeringRoadmap.researchDependencies.length, 4);
});

test('approval required', () => {
  const mission = new CapabilityDevelopmentMission();

  const result = mission.run({
    capabilityName: 'Enterprise Voice Generation',
    businessNeed: 'Replace placeholder voice synthesis with enterprise-grade service',
    expectedBusinessImpact: 'Faster and more reliable voice production'
  });

  assert.equal(result.approvalRequired, true);
  assert.equal(result.executiveRecommendation.authorityRequired, 'CEO Strategic Approval Required Before Proceeding');
});

test('decision package produced', () => {
  const mission = new CapabilityDevelopmentMission();

  const result = mission.run({
    capabilityName: 'Enterprise Voice Generation',
    businessNeed: 'Replace placeholder voice synthesis with enterprise-grade service',
    expectedBusinessImpact: 'Faster and more reliable voice production'
  });

  assert.equal(typeof result.executiveRecommendation, 'object');
  assert.equal(result.executiveRecommendation.recommendation, 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION');
  assert.equal(result.executiveRecommendation.traceability.recommendationToBeliefs.length, 1);
});
