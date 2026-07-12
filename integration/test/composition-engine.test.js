import test from 'node:test';
import assert from 'node:assert/strict';
import { CompositionEngine } from '../src/media-engine/core/composition-engine.js';
import { createDefaultCompositionPolicy } from '../src/media-engine/contracts/composition-policy-contracts.js';
import { ProductionProfileRegistry } from '../src/media-engine/core/production-profile-registry.js';

test('composition engine converts timeline scenes into deterministic composition plan', () => {
  const engine = new CompositionEngine();

  const output = engine.compose({
    request: {
      requestId: 'REQ-100',
      profileId: 'legacy_google_video_assembly',
      missionId: 'MISSION-100',
      businessId: 'BUSINESS-100'
    },
    narrationDurationSeconds: 4,
    timelineScenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', durationSeconds: 2 },
      { sceneId: 'SCENE-002', order: 2, imageAsset: 'image-02.png', durationSeconds: 2 }
    ]
  });

  assert.equal(output.validation.isValid, true);
  assert.equal(output.compositionPlan.planId, 'COMPOSITION-REQ-100');
  assert.equal(output.compositionPlan.requestId, 'REQ-100');
  assert.equal(output.compositionPlan.renderInstructions.length, 2);
  assert.equal(output.compositionPlan.renderInstructions[0].instructionId, 'RI-001');
  assert.equal(output.compositionPlan.renderInstructions[1].instructionId, 'RI-002');
  assert.equal(output.compositionPlan.totalDurationSeconds, 4);
});

test('composition engine keeps foundation policies disabled and renderer-compatible', () => {
  const engine = new CompositionEngine();

  const output = engine.compose({
    request: {
      requestId: 'REQ-200',
      missionId: 'MISSION-200',
      businessId: 'BUSINESS-200'
    },
    timelineScenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', durationSeconds: 2 }
    ]
  });

  const instruction = output.compositionPlan.renderInstructions[0];
  assert.equal(instruction.motionPreset.presetId, 'MOTION_NONE');
  assert.equal(instruction.transitionPreset.presetId, 'TRANSITION_NONE');
  assert.equal(instruction.transitionPreset.durationSeconds, 0);
  assert.equal(Array.isArray(instruction.overlays), true);
  assert.equal(instruction.overlays.length, 0);
  assert.equal(output.compositionPlan.policy.motion.mode, 'disabled');
  assert.equal(output.compositionPlan.policy.transitions.mode, 'disabled');
  assert.equal(output.compositionPlan.policy.music.mode, 'disabled');
  assert.equal(output.compositionPlan.policy.titles.mode, 'disabled');
  assert.equal(output.compositionPlan.policy.subtitles.layout, 'legacy');
});

test('golden parity: default composition policy produces identical render instructions', () => {
  const engine = new CompositionEngine();
  const input = {
    request: {
      requestId: 'REQ-PARITY',
      missionId: 'MISSION-PARITY',
      businessId: 'BUSINESS-PARITY'
    },
    timelineScenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', durationSeconds: 2 },
      { sceneId: 'SCENE-002', order: 2, imageAsset: 'image-02.png', durationSeconds: 2 }
    ]
  };

  const withoutPolicy = engine.compose(input);
  const withDefaultPolicy = engine.compose({
    ...input,
    compositionPolicy: createDefaultCompositionPolicy()
  });

  assert.deepEqual(withoutPolicy.compositionPlan.renderInstructions, withDefaultPolicy.compositionPlan.renderInstructions);
});

test('composition engine generates transition instructions when policy enables transitions', () => {
  const engine = new CompositionEngine();
  const registry = new ProductionProfileRegistry();
  const cinematicPolicy = registry.getProfile('cinematic_horror_landscape_v1').compositionPolicy;

  const output = engine.compose({
    request: {
      requestId: 'REQ-TRANSITION',
      missionId: 'MISSION-TRANSITION',
      businessId: 'BUSINESS-TRANSITION'
    },
    compositionPolicy: cinematicPolicy,
    timelineScenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', durationSeconds: 2 },
      { sceneId: 'SCENE-002', order: 2, imageAsset: 'image-02.png', durationSeconds: 2 }
    ]
  });

  assert.equal(output.compositionPlan.renderInstructions[0].transitionPreset.presetId, 'TRANSITION_CROSSFADE');
  assert.equal(output.compositionPlan.renderInstructions[0].transitionPreset.durationSeconds, 0.4);
  assert.equal(output.compositionPlan.renderInstructions[1].transitionPreset.presetId, 'TRANSITION_NONE');
});
