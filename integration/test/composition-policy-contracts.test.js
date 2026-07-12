import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultCompositionPolicy,
  createCompositionPolicy,
  validateCompositionPolicy
} from '../src/media-engine/contracts/composition-policy-contracts.js';

test('composition policy contract exposes all required policy categories with deterministic defaults', () => {
  const policy = createDefaultCompositionPolicy();

  assert.equal(policy.motion.mode, 'disabled');
  assert.equal(policy.transitions.mode, 'disabled');
  assert.equal(policy.overlays.mode, 'disabled');
  assert.equal(policy.titles.mode, 'disabled');
  assert.equal(policy.subtitles.mode, 'legacy');
  assert.equal(policy.music.mode, 'disabled');
  assert.equal(policy.framing.mode, 'legacy-center-frame');
  assert.equal(policy.cropping.mode, 'legacy-fit');
  assert.equal(policy.safeZones.mode, 'legacy-16-9');
  assert.equal(policy.transitions.defaultDurationSeconds, 0);
});

test('composition policy contract merges partial policy input over defaults', () => {
  const policy = createCompositionPolicy({
    subtitles: {
      mode: 'legacy',
      layout: 'legacy'
    },
    safeZones: {
      mode: 'legacy-safe-zone'
    }
  });

  assert.equal(policy.motion.defaultPresetId, 'MOTION_NONE');
  assert.equal(policy.transitions.defaultPresetId, 'TRANSITION_NONE');
  assert.equal(policy.safeZones.mode, 'legacy-safe-zone');
  assert.equal(policy.music.mode, 'disabled');
});

test('composition policy validation reports invalid fields', () => {
  const result = validateCompositionPolicy({
    motion: { mode: '' },
    transitions: { mode: 'disabled', defaultDurationSeconds: -1 },
    overlays: { mode: 'disabled' },
    titles: { mode: 'disabled' },
    subtitles: { mode: '' },
    music: { mode: 'disabled' },
    framing: { mode: '' },
    cropping: { mode: '' },
    safeZones: { mode: '' }
  });

  assert.equal(result.isValid, false);
  assert.equal(result.issues.some(issue => issue.field === 'motion.mode'), true);
  assert.equal(result.issues.some(issue => issue.field === 'transitions.defaultDurationSeconds'), true);
  assert.equal(result.issues.some(issue => issue.field === 'subtitles.mode'), true);
  assert.equal(result.issues.some(issue => issue.field === 'framing.mode'), true);
  assert.equal(result.issues.some(issue => issue.field === 'cropping.mode'), true);
  assert.equal(result.issues.some(issue => issue.field === 'safeZones.mode'), true);
});
