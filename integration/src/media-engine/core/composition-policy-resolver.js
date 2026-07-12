import {
  createCompositionPolicy,
  createDefaultCompositionPolicy,
  validateCompositionPolicy
} from '../contracts/composition-policy-contracts.js';
import { ProductionProfileRegistry } from './production-profile-registry.js';

export class CompositionPolicyResolver {
  constructor({ productionProfileRegistry = null } = {}) {
    this.productionProfileRegistry = productionProfileRegistry ?? new ProductionProfileRegistry();
  }

  resolve({ request = {} } = {}) {
    const selectedProfileId = this.resolveProfileId(request);
    const selectedProfile = this.productionProfileRegistry.getProfile(selectedProfileId);
    const profilePolicy = selectedProfile?.compositionPolicy ?? createDefaultCompositionPolicy();
    const requestedPolicy = request.metadata?.compositionPolicy;
    const normalizedInput = requestedPolicy && typeof requestedPolicy === 'object'
      ? requestedPolicy
      : {};

    const policy = createCompositionPolicy(this.mergePolicy(profilePolicy, normalizedInput));
    const featureGatedPolicy = this.applyFeatureGates(policy, request);
    const validation = validateCompositionPolicy(featureGatedPolicy);

    if (validation.isValid) {
      return {
        policy: featureGatedPolicy,
        validation,
        usedFallback: false,
        selectedProfileId: selectedProfile.profileId
      };
    }

    return {
      policy: createDefaultCompositionPolicy(),
      validation,
      usedFallback: true,
      selectedProfileId: selectedProfile.profileId
    };
  }

  resolveProfileId(request = {}) {
    const requestedProfileId = request.metadata?.productionProfileId;

    if (typeof requestedProfileId !== 'string' || requestedProfileId.trim().length === 0) {
      return 'legacy_default_v1';
    }

    return requestedProfileId.trim();
  }

  applyFeatureGates(policy, request = {}) {
    const transitionsFeatureFlag = Boolean(request.metadata?.featureFlags?.transitions);

    if (policy.transitions?.mode !== 'enabled' || transitionsFeatureFlag) {
      return policy;
    }

    return {
      ...policy,
      transitions: {
        ...policy.transitions,
        mode: 'disabled',
        defaultPresetId: 'TRANSITION_NONE',
        defaultDurationSeconds: 0
      }
    };
  }

  mergePolicy(basePolicy = {}, overridePolicy = {}) {
    return {
      motion: {
        ...(basePolicy.motion ?? {}),
        ...(overridePolicy.motion ?? {})
      },
      transitions: {
        ...(basePolicy.transitions ?? {}),
        ...(overridePolicy.transitions ?? {})
      },
      overlays: {
        ...(basePolicy.overlays ?? {}),
        ...(overridePolicy.overlays ?? {})
      },
      titles: {
        ...(basePolicy.titles ?? {}),
        ...(overridePolicy.titles ?? {})
      },
      subtitles: {
        ...(basePolicy.subtitles ?? {}),
        ...(overridePolicy.subtitles ?? {})
      },
      music: {
        ...(basePolicy.music ?? {}),
        ...(overridePolicy.music ?? {})
      },
      framing: {
        ...(basePolicy.framing ?? {}),
        ...(overridePolicy.framing ?? {})
      },
      cropping: {
        ...(basePolicy.cropping ?? {}),
        ...(overridePolicy.cropping ?? {})
      },
      safeZones: {
        ...(basePolicy.safeZones ?? {}),
        ...(overridePolicy.safeZones ?? {})
      }
    };
  }
}
