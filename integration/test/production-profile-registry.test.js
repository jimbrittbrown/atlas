import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionProfile, validateProductionProfile } from '../src/media-engine/contracts/production-profile-contracts.js';
import { ProductionProfileRegistry } from '../src/media-engine/core/production-profile-registry.js';

test('production profile contract validates required profile fields', () => {
  const profile = createProductionProfile({
    profileId: 'profile-1',
    name: 'Profile 1',
    compositionPolicy: {
      transitions: {
        mode: 'disabled',
        defaultDurationSeconds: 0
      }
    }
  });

  const validation = validateProductionProfile(profile);
  assert.equal(validation.isValid, true);
});

test('production profile registry includes cinematic_horror_landscape_v1', () => {
  const registry = new ProductionProfileRegistry();
  const profile = registry.getProfile('cinematic_horror_landscape_v1');

  assert.equal(profile.profileId, 'cinematic_horror_landscape_v1');
  assert.equal(profile.compositionPolicy.transitions.mode, 'enabled');
  assert.equal(profile.compositionPolicy.transitions.defaultPresetId, 'TRANSITION_CROSSFADE');
  assert.equal(profile.compositionPolicy.motion.mode, 'disabled');
  assert.equal(profile.compositionPolicy.music.mode, 'disabled');
  assert.equal(profile.compositionPolicy.titles.mode, 'disabled');
  assert.equal(profile.compositionPolicy.framing.mode, 'cinematic-wide-frame');
});

test('production profile registry falls back to legacy_default_v1', () => {
  const registry = new ProductionProfileRegistry();
  const profile = registry.getProfile('unknown-profile');

  assert.equal(profile.profileId, 'legacy_default_v1');
  assert.equal(profile.compositionPolicy.transitions.mode, 'disabled');
  assert.equal(profile.compositionPolicy.framing.mode, 'legacy-center-frame');
});
