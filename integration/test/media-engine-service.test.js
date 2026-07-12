import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasMediaEngineService } from '../src/media-engine/core/atlas-media-engine-service.js';
import { LegacyVideoAssemblyCompatibilityAdapter } from '../src/media-engine/adapters/legacy-video-assembly-compatibility-adapter.js';
import { TimelineValidator } from '../src/media-engine/core/timeline-validator.js';

test('media engine exposes AES-style methods and manifest', async () => {
  const service = new AtlasMediaEngineService();

  assert.equal(typeof service.getManifest, 'function');
  assert.equal(typeof service.initialize, 'function');
  assert.equal(typeof service.validate, 'function');
  assert.equal(typeof service.execute, 'function');
  assert.equal(typeof service.health, 'function');
  assert.equal(typeof service.diagnostics, 'function');

  const manifest = service.getManifest();

  assert.equal(manifest.engineId, 'media-engine');
  assert.equal(typeof manifest.engineVersion, 'string');
  assert.equal(Array.isArray(manifest.capabilities), true);
  assert.equal(manifest.capabilities.length > 0, true);
});

test('media engine initialize, validate, execute, health, diagnostics lifecycle works', async () => {
  const service = new AtlasMediaEngineService();
  const adapter = new LegacyVideoAssemblyCompatibilityAdapter();
  const request = adapter.toMediaRenderRequest({
    missionId: 'MISSION-1',
    businessId: 'BUSINESS-1',
    script: 'Atlas builds durable systems.',
    voiceOutput: '/tmp/voice.wav',
    imageOutputs: ['/tmp/image-01.png'],
    targetFormat: 'mp4',
    targetResolution: '1920x1080'
  });

  const initResult = await service.initialize();
  assert.equal(initResult.status, 'READY');

  const validation = await service.validate(request);
  assert.equal(validation.isValid, true);

  const execution = await service.execute(request, {
    executor: async () => ({
      videoFile: '/var/lib/atlas/assets/video/video-1920x1080-atlasbuildsdu.mp4',
      duration: '5 seconds',
      validation: { isValid: true },
      status: 'COMPLETED'
    })
  });

  assert.equal(execution.status, 'COMPLETED');
  assert.equal(execution.renderResult.videoFile, '/var/lib/atlas/assets/video/video-1920x1080-atlasbuildsdu.mp4');
  assert.equal(execution.renderResult.duration, '5 seconds');

  const health = await service.health();
  assert.equal(health.status, 'HEALTHY');

  const diagnostics = await service.diagnostics();
  assert.equal(diagnostics.engineId, 'media-engine');
  assert.equal(diagnostics.initialized, true);
  assert.equal(typeof diagnostics.generatedAt, 'string');
});

test('media engine execution request includes deterministic fixed timeline fallback when timeline metadata is absent', async () => {
  const service = new AtlasMediaEngineService();
  const adapter = new LegacyVideoAssemblyCompatibilityAdapter();
  const request = adapter.toMediaRenderRequest({
    missionId: 'MISSION-2',
    businessId: 'BUSINESS-2',
    script: 'Atlas keeps rendering behavior stable.',
    voiceOutput: '/tmp/voice.wav',
    imageOutputs: ['/tmp/image-01.png', '/tmp/image-02.png'],
    targetFormat: 'mp4',
    targetResolution: '1920x1080'
  });

  await service.initialize();

  let capturedRequest = null;
  await service.execute(request, {
    executor: async (executionRequest) => {
      capturedRequest = executionRequest;
      return {
        videoFile: '/var/lib/atlas/assets/video/video-1920x1080-atlaskeepsren.mp4',
        duration: '4 seconds',
        status: 'COMPLETED'
      };
    }
  });

  assert.equal(Array.isArray(capturedRequest.metadata.timeline.scenes), true);
  assert.equal(capturedRequest.metadata.timeline.scenes.length, 2);
  assert.equal(capturedRequest.metadata.timeline.scenes[0].durationSeconds, 2);
  assert.equal(capturedRequest.metadata.timeline.scenes[1].durationSeconds, 2);
  assert.equal(Array.isArray(capturedRequest.metadata.compositionPlan.renderInstructions), true);
  assert.equal(capturedRequest.metadata.compositionPlan.renderInstructions.length, 2);
  assert.equal(capturedRequest.metadata.compositionPolicy.motion.mode, 'disabled');
  assert.equal(capturedRequest.metadata.compositionPolicy.transitions.defaultPresetId, 'TRANSITION_NONE');
  assert.equal(capturedRequest.metadata.compositionPlan.renderInstructions[0].imageAsset, '/tmp/image-01.png');
  assert.equal(capturedRequest.metadata.compositionPlan.renderInstructions[0].durationSeconds, 2);
  assert.equal(capturedRequest.metadata.compositionPlan.renderInstructions[1].imageAsset, '/tmp/image-02.png');
  assert.equal(capturedRequest.metadata.compositionPlan.renderInstructions[1].durationSeconds, 2);
});

test('AtlasMediaEngineService includes timeline diagnostics on successful execution', async () => {
  const fixedNow = 1700000000000;
  const service = new AtlasMediaEngineService({
    now: () => fixedNow,
    timelineValidator: new TimelineValidator({ narrationSyncToleranceSeconds: 0.5 })
  });

  await service.initialize();

  const result = await service.execute(
    {
      requestId: 'REQ-DIAGNOSTICS',
      missionId: 'MISSION-DIAGNOSTICS',
      businessId: 'BUSINESS-DIAGNOSTICS',
      profileId: 'legacy_google_video_assembly',
      metadata: {
        imageOutputs: ['/tmp/scene-01.png', '/tmp/scene-02.png']
      }
    },
    {
      executor: async () => ({
        status: 'COMPLETED',
        videoFile: '/tmp/video-diagnostics.mp4',
        duration: '4 seconds'
      })
    }
  );

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.renderResult.timelineDiagnostics.isValid, true);
  assert.equal(
    result.renderResult.timelineDiagnostics.warnings.some(warning => warning.code === 'NARRATION_DURATION_UNAVAILABLE'),
    true
  );
  assert.equal(result.renderResult.diagnostics.pipelineReport.builder.sceneCount, 2);
  assert.equal(result.renderResult.diagnostics.pipelineReport.composition.isValid, true);
  assert.equal(result.renderResult.diagnostics.pipelineReport.composition.instructionCount, 2);
  assert.equal(result.renderResult.diagnostics.pipelineReport.composition.transitionCount, 0);
  assert.equal(result.renderResult.diagnostics.pipelineReport.compositionPolicyResolution.isValid, true);
  assert.equal(result.renderResult.diagnostics.pipelineReport.compositionPolicyResolution.usedFallback, false);
  assert.equal(result.renderResult.diagnostics.pipelineReport.compositionPolicyResolution.selectedProfileId, 'legacy_default_v1');
  assert.equal(result.renderResult.diagnostics.pipelineReport.compositionPolicyResolution.transitionPolicyStatus, 'disabled');
});

test('AtlasMediaEngineService blocks execution when timeline validation fails', async () => {
  const service = new AtlasMediaEngineService();

  await service.initialize();

  const result = await service.execute(
    {
      requestId: 'REQ-INVALID-TIMELINE',
      missionId: 'MISSION-INVALID',
      businessId: 'BUSINESS-INVALID',
      profileId: 'legacy_google_video_assembly',
      metadata: {
        timeline: {
          scenes: [
            { sceneId: 'SCENE-001', order: 1, imageAsset: '', durationSeconds: 2 }
          ]
        }
      }
    },
    {
      executor: async () => {
        throw new Error('executor should not run for invalid timeline');
      }
    }
  );

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.renderResult.error.code, 'TIMELINE_VALIDATION_FAILED');
  assert.equal(result.renderResult.timelineDiagnostics.isValid, false);
  assert.equal(
    result.renderResult.timelineDiagnostics.errors.some(error => error.code === 'MISSING_IMAGE_ASSET'),
    true
  );
});

test('media engine applies cinematic_horror_landscape_v1 transitions only when feature flag is enabled', async () => {
  const service = new AtlasMediaEngineService();
  await service.initialize();

  let capturedRequest = null;
  await service.execute(
    {
      requestId: 'REQ-PROFILE-TRANSITIONS',
      missionId: 'MISSION-PROFILE',
      businessId: 'BUSINESS-PROFILE',
      profileId: 'legacy_google_video_assembly',
      metadata: {
        productionProfileId: 'cinematic_horror_landscape_v1',
        featureFlags: {
          transitions: true
        },
        imageOutputs: ['/tmp/scene-01.png', '/tmp/scene-02.png']
      }
    },
    {
      executor: async (executionRequest) => {
        capturedRequest = executionRequest;
        return {
          status: 'COMPLETED',
          videoFile: '/tmp/video-profile.mp4',
          duration: '4 seconds'
        };
      }
    }
  );

  assert.equal(capturedRequest.metadata.compositionPolicy.transitions.mode, 'enabled');
  assert.equal(capturedRequest.metadata.compositionPlan.renderInstructions[0].transitionPreset.presetId, 'TRANSITION_CROSSFADE');
  assert.equal(capturedRequest.metadata.compositionPlan.renderInstructions[1].transitionPreset.presetId, 'TRANSITION_NONE');
  assert.equal(capturedRequest.metadata.compositionPolicy.motion.mode, 'disabled');
  assert.equal(capturedRequest.metadata.compositionPolicy.music.mode, 'disabled');
  assert.equal(capturedRequest.metadata.compositionPolicy.titles.mode, 'disabled');
  assert.equal(capturedRequest.metadata.compositionPolicy.overlays.mode, 'disabled');
  assert.equal(capturedRequest.metadata.compositionPolicy.cropping.mode, 'cinematic-letterbox-ready');
  assert.equal(capturedRequest.metadata.compositionPolicy.safeZones.mode, 'landscape-title-safe');
});

test('media engine keeps transitions disabled for cinematic profile when feature flag is false', async () => {
  const service = new AtlasMediaEngineService();
  await service.initialize();

  let capturedRequest = null;
  await service.execute(
    {
      requestId: 'REQ-PROFILE-TRANSITIONS-DISABLED',
      missionId: 'MISSION-PROFILE-DISABLED',
      businessId: 'BUSINESS-PROFILE-DISABLED',
      profileId: 'legacy_google_video_assembly',
      metadata: {
        productionProfileId: 'cinematic_horror_landscape_v1',
        featureFlags: {
          transitions: false
        },
        imageOutputs: ['/tmp/scene-01.png', '/tmp/scene-02.png']
      }
    },
    {
      executor: async (executionRequest) => {
        capturedRequest = executionRequest;
        return {
          status: 'COMPLETED',
          videoFile: '/tmp/video-profile-disabled.mp4',
          duration: '4 seconds'
        };
      }
    }
  );

  assert.equal(capturedRequest.metadata.compositionPolicy.transitions.mode, 'disabled');
  assert.equal(capturedRequest.metadata.compositionPlan.renderInstructions[0].transitionPreset.presetId, 'TRANSITION_NONE');
});

test('media engine emits quality review diagnostics when quality review is enabled', async () => {
  const service = new AtlasMediaEngineService({
    qualityIntelligenceEngine: {
      review() {
        return {
          overallScore: 88,
          categoryScores: [
            { category: 'technical', score: 90, passed: true, issueCount: 0, maxSeverity: 'none' },
            { category: 'timeline', score: 85, passed: true, issueCount: 0, maxSeverity: 'none' }
          ],
          issues: [],
          recommendations: [
            {
              recommendationId: 'QREC-001',
              priority: 'low',
              action: 'Proceed to publishing workflow when gate is enabled.',
              rationale: 'No deterministic quality issues were detected.',
              relatedIssueCodes: []
            }
          ],
          reviewDecision: 'PASS',
          qualityReport: {
            reportId: 'QREP-REQ',
            generatedAt: '2026-07-09T00:00:00.000Z'
          },
          executiveSummary: 'Quality decision PASS. Overall score 88.',
          improvementRecommendations: ['Proceed to publishing workflow when gate is enabled.']
        };
      }
    }
  });

  await service.initialize();

  const result = await service.execute(
    {
      requestId: 'REQ-QUALITY-INTEGRATION',
      missionId: 'MISSION-QUALITY-INTEGRATION',
      businessId: 'BUSINESS-QUALITY-INTEGRATION',
      profileId: 'legacy_google_video_assembly',
      metadata: {
        script: 'Atlas quality integration test',
        voiceOutput: '/tmp/voice.wav',
        imageOutputs: ['/tmp/image-01.png']
      },
      context: {
        qualityReview: {
          enabled: true
        }
      }
    },
    {
      executor: async () => ({
        status: 'COMPLETED',
        videoFile: '/tmp/video-quality.mp4',
        duration: '4 seconds'
      })
    }
  );

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.renderResult.diagnostics.qualityReviewResult.overallScore, 88);
  assert.equal(result.renderResult.diagnostics.qualityReviewResult.reviewDecision, 'PASS');
  assert.equal(result.renderResult.diagnostics.qualityReviewError, null);
});