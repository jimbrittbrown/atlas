import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceProviderEvaluationMission } from '../src/executive/voice-provider-evaluation-mission.js';

test('voice provider evaluation mission generates procurement package', () => {
  const mission = new VoiceProviderEvaluationMission();

  const result = mission.run();

  assert.equal(result.capability, 'Enterprise Voice Generation');
  assert.equal(Array.isArray(result.providers), true);
  assert.equal(result.providers.length, 3);
  assert.equal(result.approvalRequired, true);
});

test('voice provider evaluation mission includes evaluation criteria', () => {
  const mission = new VoiceProviderEvaluationMission();

  const result = mission.run();

  assert.deepEqual(result.evaluationCriteria, [
    'api quality',
    'commercial licensing',
    'cost',
    'documentation',
    'emotional range',
    'enterprise support',
    'rate limits',
    'reliability',
    'scalability',
    'voice quality'
  ]);
  assert.equal(result.implementationPlan.providerComparisonRequest.capability, 'Enterprise Voice Generation');
  assert.equal(result.implementationPlan.providerComparisonRequest.providers.length, 3);
});

test('voice provider evaluation mission generates implementation plan', () => {
  const mission = new VoiceProviderEvaluationMission();

  const result = mission.run();

  assert.equal(typeof result.implementationPlan, 'object');
  assert.equal(result.implementationPlan.executiveDecisionPackageTemplate.templateId, 'EXECUTIVE-DECISION-PACKAGE-TEMPLATE-V1');
  assert.equal(result.implementationPlan.approvalRequirement, 'CEO Strategic Approval Required Before External Provider Integration');
  assert.deepEqual(result.implementationPlan.replacementChecklist, [
    'Evaluate provider against the enterprise voice criteria in the comparison request.',
    'Compile the executive decision package template with provider scorecards and risk notes.',
    'Obtain executive approval before replacing PlaceholderVoiceService.',
    'Execute a controlled rollout plan once approval is recorded.'
  ]);
});
