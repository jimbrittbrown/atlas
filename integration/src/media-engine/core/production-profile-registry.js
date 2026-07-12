import { createProductionProfile, validateProductionProfile } from '../contracts/production-profile-contracts.js';

export class ProductionProfileRegistry {
  constructor({ profiles = null } = {}) {
    this.profiles = profiles ?? this.buildDefaultProfiles();
  }

  getProfile(profileId) {
    const normalizedId = String(profileId ?? '').trim();

    if (normalizedId.length === 0) {
      return this.getDefaultProfile();
    }

    return this.profiles.get(normalizedId) ?? this.getDefaultProfile();
  }

  getDefaultProfile() {
    return this.profiles.get('legacy_default_v1');
  }

  listProfiles() {
    return [...this.profiles.values()].map(profile => ({ ...profile }));
  }

  buildDefaultProfiles() {
    const legacyDefault = createProductionProfile({
      profileId: 'legacy_default_v1',
      name: 'Legacy Default',
      description: 'Preserves deterministic legacy rendering behavior.',
      compositionPolicy: {
        transitions: {
          mode: 'disabled',
          defaultPresetId: 'TRANSITION_NONE',
          defaultDurationSeconds: 0,
          ffmpegTransition: 'fade'
        },
        motion: {
          mode: 'disabled'
        },
        titles: {
          mode: 'disabled'
        },
        subtitles: {
          mode: 'legacy',
          layout: 'legacy'
        },
        music: {
          mode: 'disabled'
        },
        framing: {
          mode: 'legacy-center-frame'
        },
        overlays: {
          mode: 'disabled'
        },
        cropping: {
          mode: 'legacy-fit'
        },
        safeZones: {
          mode: 'legacy-16-9'
        }
      }
    });

    const cinematicHorrorLandscape = createProductionProfile({
      profileId: 'cinematic_horror_landscape_v1',
      name: 'Cinematic Horror Landscape v1',
      description: 'Profile scaffold for cinematic horror landscape content with controlled transitions.',
      compositionPolicy: {
        transitions: {
          mode: 'enabled',
          defaultPresetId: 'TRANSITION_CROSSFADE',
          defaultDurationSeconds: 0.4,
          ffmpegTransition: 'fade'
        },
        motion: {
          mode: 'disabled'
        },
        titles: {
          mode: 'disabled'
        },
        subtitles: {
          mode: 'disabled',
          layout: 'legacy'
        },
        music: {
          mode: 'disabled'
        },
        framing: {
          mode: 'cinematic-wide-frame'
        },
        overlays: {
          mode: 'disabled'
        },
        cropping: {
          mode: 'cinematic-letterbox-ready'
        },
        safeZones: {
          mode: 'landscape-title-safe'
        }
      }
    });

    const profiles = [legacyDefault, cinematicHorrorLandscape];
    profiles.forEach(profile => {
      const validation = validateProductionProfile(profile);

      if (!validation.isValid) {
        throw new Error(`Invalid production profile ${profile.profileId}`);
      }
    });

    return new Map(profiles.map(profile => [profile.profileId, profile]));
  }
}
