import test from 'node:test';
import assert from 'node:assert/strict';
import { TimelineValidator } from '../src/media-engine/core/timeline-validator.js';

test('timeline validator passes deterministic fallback timeline for legacy profile', () => {
  const validator = new TimelineValidator();

  const report = validator.validate({
    profileId: 'legacy_google_video_assembly',
    metadata: {
      timeline: {}
    },
    timelineScenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', durationSeconds: 2 },
      { sceneId: 'SCENE-002', order: 2, imageAsset: 'image-02.png', durationSeconds: 2 }
    ]
  });

  assert.equal(report.isValid, true);
  assert.equal(report.errors.length, 0);
  assert.equal(report.warnings.length >= 0, true);
  assert.equal(report.summary.sceneCount, 2);
  assert.equal(report.summary.totalDurationSeconds, 4);
});

test('timeline validator reports ordering and image asset errors', () => {
  const validator = new TimelineValidator();

  const report = validator.validate({
    profileId: 'legacy_google_video_assembly',
    timelineScenes: [
      { sceneId: 'SCENE-001', order: 2, imageAsset: '', durationSeconds: 2 }
    ]
  });

  assert.equal(report.isValid, false);
  assert.equal(report.errors.some(error => error.code === 'INVALID_SCENE_ORDER'), true);
  assert.equal(report.errors.some(error => error.code === 'MISSING_IMAGE_ASSET'), true);
});

test('timeline validator reports duration and total timeline integrity errors', () => {
  const validator = new TimelineValidator({ minTotalTimelineSeconds: 2 });

  const report = validator.validate({
    profileId: 'legacy_google_video_assembly',
    timelineScenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', durationSeconds: 0.1 }
    ]
  });

  assert.equal(report.isValid, false);
  assert.equal(report.errors.some(error => error.code === 'SCENE_DURATION_OUT_OF_RANGE'), true);
  assert.equal(report.errors.some(error => error.code === 'TOTAL_DURATION_OUT_OF_RANGE'), true);
});

test('timeline validator warns when narration sync delta is high', () => {
  const validator = new TimelineValidator({ narrationSyncToleranceSeconds: 1 });

  const report = validator.validate({
    profileId: 'legacy_google_video_assembly',
    metadata: {
      timeline: {
        narrationDurationSeconds: 10
      }
    },
    timelineScenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', durationSeconds: 2 },
      { sceneId: 'SCENE-002', order: 2, imageAsset: 'image-02.png', durationSeconds: 2 }
    ]
  });

  assert.equal(report.isValid, true);
  assert.equal(report.warnings.some(warning => warning.code === 'NARRATION_SYNC_DELTA_HIGH'), true);
});

test('timeline validator reports unsupported profile compatibility error', () => {
  const validator = new TimelineValidator({ supportedProfiles: ['legacy_google_video_assembly'] });

  const report = validator.validate({
    profileId: 'unsupported_profile',
    timelineScenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', durationSeconds: 2 }
    ]
  });

  assert.equal(report.isValid, false);
  assert.equal(report.errors.some(error => error.code === 'UNSUPPORTED_PROFILE'), true);
});