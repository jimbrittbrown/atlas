import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompositionPlan, validateCompositionPlan } from '../src/media-engine/contracts/composition-plan-contracts.js';

test('composition plan contract creates valid renderer instructions', () => {
  const plan = createCompositionPlan({
    planId: 'COMPOSITION-REQ-1',
    requestId: 'REQ-1',
    renderInstructions: [
      {
        instructionId: 'RI-001',
        sceneId: 'SCENE-001',
        order: 1,
        imageAsset: 'image-01.png',
        durationSeconds: 2
      }
    ]
  });

  const validation = validateCompositionPlan(plan);

  assert.equal(validation.isValid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(plan.renderInstructions[0].motionPreset.presetId, 'MOTION_NONE');
  assert.equal(plan.renderInstructions[0].transitionPreset.presetId, 'TRANSITION_NONE');
});

test('composition plan contract reports missing and invalid fields', () => {
  const invalidPlan = createCompositionPlan({
    planId: '',
    requestId: '',
    renderInstructions: [
      {
        instructionId: 'RI-001',
        sceneId: 'SCENE-001',
        order: 2,
        imageAsset: '',
        durationSeconds: 0
      }
    ]
  });

  const validation = validateCompositionPlan(invalidPlan);

  assert.equal(validation.isValid, false);
  assert.equal(validation.issues.some(issue => issue.issue === 'MISSING_PLAN_ID'), true);
  assert.equal(validation.issues.some(issue => issue.issue === 'MISSING_REQUEST_ID'), true);
  assert.equal(validation.issues.some(issue => issue.issue === 'INVALID_INSTRUCTION_ORDER'), true);
  assert.equal(validation.issues.some(issue => issue.issue === 'MISSING_IMAGE_ASSET'), true);
  assert.equal(validation.issues.some(issue => issue.issue === 'INVALID_DURATION_SECONDS'), true);
});
