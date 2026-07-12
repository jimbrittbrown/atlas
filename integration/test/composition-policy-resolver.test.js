import test from 'node:test';
import assert from 'node:assert/strict';
import { CompositionPolicyResolver } from '../src/media-engine/core/composition-policy-resolver.js';

test('composition policy resolver returns default no-op policy when no policy is requested', () => {
  const resolver = new CompositionPolicyResolver();

  const output = resolver.resolve({
    request: {
      requestId: 'REQ-DEFAULT',
      metadata: {}
    }
  });

  assert.equal(output.validation.isValid, true);
  assert.equal(output.policy.motion.mode, 'disabled');
  assert.equal(output.policy.transitions.defaultPresetId, 'TRANSITION_NONE');
  assert.equal(output.usedFallback, false);
  assert.equal(output.selectedProfileId, 'legacy_default_v1');
});

test('composition policy resolver normalizes valid custom policy without visual-effect changes', () => {
  const resolver = new CompositionPolicyResolver();

  const output = resolver.resolve({
    request: {
      requestId: 'REQ-CUSTOM',
      metadata: {
        compositionPolicy: {
          subtitles: {
            mode: 'legacy',
            layout: 'legacy'
          },
          safeZones: {
            mode: 'legacy-safe-zone'
          }
        }
      }
    }
  });

  assert.equal(output.validation.isValid, true);
  assert.equal(output.policy.subtitles.mode, 'legacy');
  assert.equal(output.policy.safeZones.mode, 'legacy-safe-zone');
  assert.equal(output.policy.motion.defaultPresetId, 'MOTION_NONE');
  assert.equal(output.usedFallback, false);
});

test('composition policy resolver applies profile policy and transition feature flag', () => {
  const resolver = new CompositionPolicyResolver();

  const disabledByFlag = resolver.resolve({
    request: {
      metadata: {
        productionProfileId: 'cinematic_horror_landscape_v1',
        featureFlags: {
          transitions: false
        }
      }
    }
  });
  assert.equal(disabledByFlag.selectedProfileId, 'cinematic_horror_landscape_v1');
  assert.equal(disabledByFlag.policy.transitions.mode, 'disabled');

  const enabledByFlag = resolver.resolve({
    request: {
      metadata: {
        productionProfileId: 'cinematic_horror_landscape_v1',
        featureFlags: {
          transitions: true
        }
      }
    }
  });
  assert.equal(enabledByFlag.policy.transitions.mode, 'enabled');
  assert.equal(enabledByFlag.policy.transitions.defaultPresetId, 'TRANSITION_CROSSFADE');
});

test('composition policy resolver preserves profile transition mode for partial transition overrides', () => {
  const resolver = new CompositionPolicyResolver();

  const output = resolver.resolve({
    request: {
      metadata: {
        productionProfileId: 'cinematic_horror_landscape_v1',
        featureFlags: {
          transitions: true
        },
        compositionPolicy: {
          transitions: {
            defaultDurationSeconds: 5
          }
        }
      }
    }
  });

  assert.equal(output.policy.transitions.mode, 'enabled');
  assert.equal(output.policy.transitions.defaultPresetId, 'TRANSITION_CROSSFADE');
  assert.equal(output.policy.transitions.defaultDurationSeconds, 5);
});

test('golden parity: missing profile and legacy_default_v1 resolve equivalent transition defaults', () => {
  const resolver = new CompositionPolicyResolver();

  const implicitLegacy = resolver.resolve({
    request: {
      metadata: {}
    }
  });
  const explicitLegacy = resolver.resolve({
    request: {
      metadata: {
        productionProfileId: 'legacy_default_v1'
      }
    }
  });

  assert.equal(implicitLegacy.policy.transitions.mode, explicitLegacy.policy.transitions.mode);
  assert.equal(implicitLegacy.policy.transitions.defaultPresetId, explicitLegacy.policy.transitions.defaultPresetId);
  assert.equal(implicitLegacy.policy.transitions.defaultDurationSeconds, explicitLegacy.policy.transitions.defaultDurationSeconds);
});

test('composition policy resolver falls back to defaults when resolved policy fails validation', () => {
  const resolver = new CompositionPolicyResolver();

  const output = resolver.resolve({
    request: {
      requestId: 'REQ-INVALID',
      metadata: {
        compositionPolicy: {
          motion: {
            mode: ''
          }
        }
      }
    }
  });

  assert.equal(output.validation.isValid, false);
  assert.equal(output.policy.motion.mode, 'disabled');
  assert.equal(output.usedFallback, true);
});
