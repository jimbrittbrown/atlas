import test from 'node:test';
import assert from 'node:assert/strict';
import { ProcurementMission } from '../src/executive/procurement-mission.js';

test('procurement mission generates procurement package', () => {
  const mission = new ProcurementMission();

  const result = mission.run({
    capability: 'Voice Synthesis',
    evaluationCriteria: ['cost', 'security', 'latency']
  });

  assert.equal(result.capability, 'Voice Synthesis');
  assert.equal(Array.isArray(result.providers), true);
  assert.equal(result.providers.length, 3);
  assert.deepEqual(result.evaluationCriteria, ['cost', 'latency', 'security']);
  assert.equal(typeof result.implementationPlan.providerComparisonRequest, 'object');
  assert.equal(typeof result.implementationPlan.evaluationTemplate, 'object');
  assert.equal(typeof result.implementationPlan.executiveDecisionPackageTemplate, 'object');
});

test('procurement mission produces deterministic executive recommendation', () => {
  const mission = new ProcurementMission();

  const result = mission.run({
    capability: 'Image Generation',
    evaluationCriteria: ['reliability', 'compliance']
  });

  assert.equal(result.executiveRecommendation, 'PROCEED_TO_STRUCTURED_PROVIDER_EVALUATION');
  assert.equal(
    result.implementationPlan.implementationRecommendation,
    'Run provider scorecards, compile decision package, and submit for executive approval.'
  );
});

test('procurement mission requires approval before implementation', () => {
  const mission = new ProcurementMission();

  const result = mission.run({
    capability: 'Publishing API',
    evaluationCriteria: ['security', 'cost']
  });

  assert.equal(result.approvalRequired, true);
  assert.equal(
    result.implementationPlan.approvalRequirement,
    'CEO Strategic Approval Required Before External Provider Integration'
  );
});
