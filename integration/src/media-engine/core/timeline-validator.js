export class TimelineValidator {
  constructor({
    supportedProfiles = ['legacy_google_video_assembly'],
    minSceneDurationSeconds = 1,
    maxSceneDurationSeconds = 300,
    minTotalTimelineSeconds = 1,
    maxTotalTimelineSeconds = 3600,
    narrationSyncToleranceSeconds = 2
  } = {}) {
    this.supportedProfiles = new Set(supportedProfiles);
    this.minSceneDurationSeconds = minSceneDurationSeconds;
    this.maxSceneDurationSeconds = maxSceneDurationSeconds;
    this.minTotalTimelineSeconds = minTotalTimelineSeconds;
    this.maxTotalTimelineSeconds = maxTotalTimelineSeconds;
    this.narrationSyncToleranceSeconds = narrationSyncToleranceSeconds;
  }

  validate({ timelineScenes = [], metadata = {}, profileId = 'legacy_google_video_assembly' } = {}) {
    const report = {
      isValid: true,
      profileId,
      summary: {
        sceneCount: Array.isArray(timelineScenes) ? timelineScenes.length : 0,
        totalDurationSeconds: 0,
        narrationDurationSeconds: this.normalizePositiveNumber(metadata.timeline?.narrationDurationSeconds)
      },
      checks: {
        sceneOrdering: this.okCheck('sceneOrdering'),
        imageAssetPresence: this.okCheck('imageAssetPresence'),
        durationSanity: this.okCheck('durationSanity'),
        narrationSynchronization: this.okCheck('narrationSynchronization'),
        profileCompatibility: this.okCheck('profileCompatibility'),
        totalTimelineIntegrity: this.okCheck('totalTimelineIntegrity')
      },
      errors: [],
      warnings: []
    };

    report.summary.totalDurationSeconds = this.computeTotalDurationSeconds(timelineScenes);

    this.validateProfileCompatibility(report);
    this.validateSceneOrdering(report, timelineScenes);
    this.validateImageAssets(report, timelineScenes);
    this.validateDurations(report, timelineScenes);
    this.validateTotalIntegrity(report, timelineScenes);
    this.validateNarrationSynchronization(report);
    report.isValid = report.errors.length === 0;

    return report;
  }

  validateProfileCompatibility(report) {
    if (this.supportedProfiles.has(report.profileId)) {
      return;
    }

    this.addError(report, 'profileCompatibility', 'UNSUPPORTED_PROFILE', `Unsupported media render profile: ${report.profileId}`);
  }

  validateSceneOrdering(report, timelineScenes) {
    if (!Array.isArray(timelineScenes) || timelineScenes.length === 0) {
      this.addError(report, 'sceneOrdering', 'EMPTY_TIMELINE', 'Timeline must contain at least one scene.');
      return;
    }

    for (let index = 0; index < timelineScenes.length; index += 1) {
      const expectedOrder = index + 1;
      const sceneOrder = Number(timelineScenes[index]?.order);

      if (sceneOrder !== expectedOrder) {
        this.addError(
          report,
          'sceneOrdering',
          'INVALID_SCENE_ORDER',
          `Scene order must be deterministic and contiguous. Expected ${expectedOrder}, received ${sceneOrder}.`
        );
        return;
      }
    }
  }

  validateImageAssets(report, timelineScenes) {
    for (const scene of timelineScenes) {
      const imageAsset = String(scene?.imageAsset ?? '').trim();

      if (imageAsset.length === 0) {
        this.addError(
          report,
          'imageAssetPresence',
          'MISSING_IMAGE_ASSET',
          `Scene ${scene?.sceneId ?? 'UNKNOWN'} is missing imageAsset.`
        );
      }
    }
  }

  validateDurations(report, timelineScenes) {
    for (const scene of timelineScenes) {
      const duration = this.normalizePositiveNumber(scene?.durationSeconds);

      if (duration === null) {
        this.addError(
          report,
          'durationSanity',
          'MISSING_SCENE_DURATION',
          `Scene ${scene?.sceneId ?? 'UNKNOWN'} is missing durationSeconds.`
        );
        continue;
      }

      if (duration < this.minSceneDurationSeconds || duration > this.maxSceneDurationSeconds) {
        this.addError(
          report,
          'durationSanity',
          'SCENE_DURATION_OUT_OF_RANGE',
          `Scene ${scene?.sceneId ?? 'UNKNOWN'} duration ${duration} is outside ${this.minSceneDurationSeconds}-${this.maxSceneDurationSeconds}.`
        );
      }
    }
  }

  validateTotalIntegrity(report, timelineScenes) {
    const total = this.computeTotalDurationSeconds(timelineScenes);

    if (total < this.minTotalTimelineSeconds || total > this.maxTotalTimelineSeconds) {
      this.addError(
        report,
        'totalTimelineIntegrity',
        'TOTAL_DURATION_OUT_OF_RANGE',
        `Total timeline duration ${total} is outside ${this.minTotalTimelineSeconds}-${this.maxTotalTimelineSeconds}.`
      );
    }
  }

  validateNarrationSynchronization(report) {
    const narrationDuration = report.summary.narrationDurationSeconds;

    if (narrationDuration === null) {
      this.addWarning(
        report,
        'narrationSynchronization',
        'NARRATION_DURATION_UNAVAILABLE',
        'Narration duration unavailable; deterministic fallback timing applied.'
      );
      return;
    }

    const delta = Math.abs(report.summary.totalDurationSeconds - narrationDuration);

    if (delta > this.narrationSyncToleranceSeconds) {
      this.addWarning(
        report,
        'narrationSynchronization',
        'NARRATION_SYNC_DELTA_HIGH',
        `Timeline and narration differ by ${delta.toFixed(3)} seconds.`
      );
    }
  }

  computeTotalDurationSeconds(timelineScenes) {
    if (!Array.isArray(timelineScenes)) {
      return 0;
    }

    return timelineScenes.reduce((total, scene) => total + (this.normalizePositiveNumber(scene?.durationSeconds) ?? 0), 0);
  }

  okCheck(name) {
    return {
      name,
      status: 'OK'
    };
  }

  addError(report, checkName, code, message) {
    report.checks[checkName] = {
      name: checkName,
      status: 'ERROR',
      code,
      message
    };
    report.errors.push({ check: checkName, code, message });
  }

  addWarning(report, checkName, code, message) {
    if (report.checks[checkName]?.status === 'OK') {
      report.checks[checkName] = {
        name: checkName,
        status: 'WARNING',
        code,
        message
      };
    }

    report.warnings.push({ check: checkName, code, message });
  }

  normalizePositiveNumber(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed) || parsed <= 0) {
      return null;
    }

    return Math.round(parsed * 1000) / 1000;
  }
}