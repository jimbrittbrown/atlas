import { ATLAS_ENGINE_STANDARD_VERSION, createMediaRenderResult } from '../contracts/media-render-contracts.js';
import { TimelineBuilder } from './timeline-builder.js';
import { SceneTimingEngine } from './scene-timing-engine.js';
import { TimelineValidator } from './timeline-validator.js';
import { CompositionEngine } from './composition-engine.js';
import { CompositionPolicyResolver } from './composition-policy-resolver.js';
import { QualityIntelligenceEngine } from '../../quality-intelligence/core/quality-intelligence-engine.js';

export class AtlasMediaEngineService {
  constructor({
    engineId = 'media-engine',
    engineVersion = '0.1.0',
    now = () => Date.now(),
    timelineBuilder = null,
    sceneTimingEngine = null,
    timelineValidator = null,
    compositionEngine = null,
    compositionPolicyResolver = null,
    qualityIntelligenceEngine = null
  } = {}) {
    this.engineId = engineId;
    this.engineVersion = engineVersion;
    this.now = now;
    this.timelineBuilder = timelineBuilder ?? new TimelineBuilder();
    this.sceneTimingEngine = sceneTimingEngine ?? new SceneTimingEngine();
    this.timelineValidator = timelineValidator ?? new TimelineValidator();
    this.compositionPolicyResolver = compositionPolicyResolver ?? new CompositionPolicyResolver();
    this.compositionEngine = compositionEngine ?? new CompositionEngine();
    this.qualityIntelligenceEngine = qualityIntelligenceEngine ?? new QualityIntelligenceEngine();
    this.initialized = false;
    this.lifecycleState = 'DISCOVERED';
    this.lastInitializedAt = null;
    this.lastExecution = null;
    this.lastError = null;
  }

  getManifest() {
    return {
      engineId: this.engineId,
      engineVersion: this.engineVersion,
      contractVersion: ATLAS_ENGINE_STANDARD_VERSION,
      lifecycleState: this.lifecycleState,
      capabilities: [
        {
          id: 'legacy-video-assembly-compat',
          version: '1.0.0',
          status: 'GA'
        }
      ]
    };
  }

  async initialize(_context = {}) {
    this.initialized = true;
    this.lifecycleState = 'READY';
    this.lastInitializedAt = this.buildTimestamp();

    return {
      engineId: this.engineId,
      status: 'READY',
      initializedAt: this.lastInitializedAt
    };
  }

  async validate(request = {}, _context = {}) {
    const issues = [];

    if (!this.isNonEmptyString(request.requestId)) {
      issues.push({ field: 'requestId', issue: 'MISSING_REQUEST_ID' });
    }

    if (!request.metadata || typeof request.metadata !== 'object') {
      issues.push({ field: 'metadata', issue: 'MISSING_METADATA' });
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  async execute(request = {}, { executor } = {}) {
    const startedAt = this.buildTimestamp();
    const validation = await this.validate(request);

    if (!validation.isValid) {
      const pipelineReport = this.buildPipelineReport(request);
      this.lastExecution = {
        requestId: request.requestId ?? null,
        status: 'BLOCKED',
        startedAt,
        completedAt: this.buildTimestamp()
      };
      this.lifecycleState = this.initialized ? 'READY' : 'DISCOVERED';

      return {
        engineId: this.engineId,
        requestId: request.requestId ?? null,
        status: 'BLOCKED',
        validation,
        renderResult: createMediaRenderResult({
          requestId: request.requestId ?? null,
          missionId: request.missionId ?? null,
          businessId: request.businessId ?? null,
          status: 'BLOCKED',
          videoFile: null,
          duration: '0 seconds',
          validation,
          timelineDiagnostics: pipelineReport.timelineValidationReport,
          diagnostics: {
            pipelineReport
          }
        }),
        startedAt,
        completedAt: this.buildTimestamp()
      };
    }

    if (typeof executor !== 'function') {
      const pipelineReport = this.buildPipelineReport(request);
      const failure = {
        code: 'MISSING_EXECUTOR',
        message: 'AtlasMediaEngineService.execute requires an executor function.',
        retriable: false
      };
      this.lastError = failure;
      this.lifecycleState = 'DEGRADED';

      return {
        engineId: this.engineId,
        requestId: request.requestId ?? null,
        status: 'FAILED',
        validation,
        error: failure,
        renderResult: createMediaRenderResult({
          requestId: request.requestId ?? null,
          missionId: request.missionId ?? null,
          businessId: request.businessId ?? null,
          status: 'BLOCKED',
          videoFile: null,
          duration: '0 seconds',
          validation,
          timelineDiagnostics: pipelineReport.timelineValidationReport,
          diagnostics: {
            pipelineReport
          },
          error: failure
        }),
        startedAt,
        completedAt: this.buildTimestamp()
      };
    }

    try {
      const pipelineReport = this.buildPipelineReport(request);

      if (!pipelineReport.timelineValidationReport.isValid) {
        const completedAt = this.buildTimestamp();
        this.lastExecution = {
          requestId: request.requestId ?? null,
          status: 'BLOCKED',
          startedAt,
          completedAt
        };

        return {
          engineId: this.engineId,
          requestId: request.requestId ?? null,
          status: 'BLOCKED',
          validation,
          renderResult: createMediaRenderResult({
            requestId: request.requestId ?? null,
            missionId: request.missionId ?? null,
            businessId: request.businessId ?? null,
            status: 'BLOCKED',
            videoFile: null,
            duration: '0 seconds',
            validation,
            timelineDiagnostics: pipelineReport.timelineValidationReport,
            diagnostics: {
              pipelineReport
            },
            error: {
              code: 'TIMELINE_VALIDATION_FAILED',
              message: 'Timeline validation failed.',
              retriable: false
            }
          }),
          startedAt,
          completedAt
        };
      }

      if (!pipelineReport.compositionValidation.isValid) {
        const completedAt = this.buildTimestamp();
        this.lastExecution = {
          requestId: request.requestId ?? null,
          status: 'BLOCKED',
          startedAt,
          completedAt
        };

        return {
          engineId: this.engineId,
          requestId: request.requestId ?? null,
          status: 'BLOCKED',
          validation,
          renderResult: createMediaRenderResult({
            requestId: request.requestId ?? null,
            missionId: request.missionId ?? null,
            businessId: request.businessId ?? null,
            status: 'BLOCKED',
            videoFile: null,
            duration: '0 seconds',
            validation,
            timelineDiagnostics: pipelineReport.timelineValidationReport,
            diagnostics: {
              pipelineReport
            },
            error: {
              code: 'COMPOSITION_PLAN_INVALID',
              message: 'Composition plan validation failed.',
              retriable: false
            }
          }),
          startedAt,
          completedAt
        };
      }

      const executionRequest = {
        ...request,
        metadata: {
          ...(request.metadata ?? {}),
          timeline: {
            ...((request.metadata ?? {}).timeline ?? {}),
            scenes: pipelineReport.timelineScenes,
            narrationDurationSeconds: pipelineReport.narrationDurationSeconds
          },
          compositionPolicy: pipelineReport.compositionPolicy,
          compositionPlan: pipelineReport.compositionPlan
        }
      };
      const renderResult = await executor(executionRequest);
      const baseMediaRenderResult = createMediaRenderResult({
        requestId: request.requestId ?? null,
        missionId: request.missionId ?? null,
        businessId: request.businessId ?? null,
        status: renderResult?.status ?? 'COMPLETED',
        videoFile: renderResult?.videoFile ?? renderResult?.videoFilePath ?? null,
        duration: renderResult?.duration ?? '0 seconds',
        validation: renderResult?.validation ?? validation,
        timelineDiagnostics: pipelineReport.timelineValidationReport,
        diagnostics: {
          pipelineReport,
          rendererDiagnostics: renderResult?.diagnostics ?? null
        },
        error: renderResult?.error ?? null
      });
      const qualityReviewResult = this.runQualityReview({
        request: executionRequest,
        mediaRenderResult: baseMediaRenderResult
      });
      const completedAt = this.buildTimestamp();

      this.lastExecution = {
        requestId: request.requestId ?? null,
        status: renderResult?.status ?? 'COMPLETED',
        startedAt,
        completedAt
      };
      this.lastError = null;
      this.lifecycleState = this.initialized ? 'READY' : 'DISCOVERED';

      return {
        engineId: this.engineId,
        requestId: request.requestId ?? null,
        status: renderResult?.status ?? 'COMPLETED',
        validation,
        renderResult: {
          ...baseMediaRenderResult,
          diagnostics: {
            ...(baseMediaRenderResult.diagnostics ?? {}),
            qualityReviewResult: qualityReviewResult?.review ?? null,
            qualityReviewError: qualityReviewResult?.error ?? null
          }
        },
        startedAt,
        completedAt
      };
    } catch (error) {
      const pipelineReport = this.buildPipelineReport(request);
      const completedAt = this.buildTimestamp();
      const failure = {
        code: 'ENGINE_EXECUTION_FAILED',
        message: error?.message ?? 'Media engine execution failed.',
        retriable: false
      };

      this.lastError = failure;
      this.lastExecution = {
        requestId: request.requestId ?? null,
        status: 'FAILED',
        startedAt,
        completedAt
      };
      this.lifecycleState = 'DEGRADED';

      return {
        engineId: this.engineId,
        requestId: request.requestId ?? null,
        status: 'FAILED',
        validation,
        error: failure,
        renderResult: createMediaRenderResult({
          requestId: request.requestId ?? null,
          missionId: request.missionId ?? null,
          businessId: request.businessId ?? null,
          status: 'BLOCKED',
          videoFile: null,
          duration: '0 seconds',
          validation,
          timelineDiagnostics: pipelineReport.timelineValidationReport,
          diagnostics: {
            pipelineReport
          },
          error: failure
        }),
        startedAt,
        completedAt
      };
    }
  }

  async health(_context = {}) {
    return {
      engineId: this.engineId,
      status: this.lifecycleState === 'DEGRADED' ? 'DEGRADED' : (this.initialized ? 'HEALTHY' : 'UNKNOWN'),
      lifecycleState: this.lifecycleState,
      initialized: this.initialized,
      checkedAt: this.buildTimestamp(),
      lastError: this.lastError
    };
  }

  async diagnostics(_query = {}, _context = {}) {
    return {
      engineId: this.engineId,
      lifecycleState: this.lifecycleState,
      initialized: this.initialized,
      lastInitializedAt: this.lastInitializedAt,
      lastExecution: this.lastExecution,
      lastError: this.lastError,
      manifest: this.getManifest(),
      generatedAt: this.buildTimestamp()
    };
  }

  buildExecutionRequest(request = {}) {
    const metadata = request.metadata ?? {};
    const timelineMetadata = metadata.timeline ?? {};
    const scenes = this.timelineBuilder.build({
      metadata,
      timeline: timelineMetadata
    });
    const normalizedScenes = this.sceneTimingEngine.normalizeTimeline({
      scenes,
      narrationDurationSeconds: timelineMetadata.narrationDurationSeconds ?? null
    });

    return {
      ...request,
      metadata: {
        ...metadata,
        timeline: {
          ...timelineMetadata,
          scenes: normalizedScenes
        }
      }
    };
  }

  buildPipelineReport(request = {}) {
    const plannedRequest = this.buildExecutionRequest(request);
    const timelineScenes = plannedRequest.metadata?.timeline?.scenes ?? [];
    const narrationDurationSeconds = plannedRequest.metadata?.timeline?.narrationDurationSeconds ?? null;
    const timelineValidationReport = this.timelineValidator.validate({
      timelineScenes,
      metadata: plannedRequest.metadata ?? {},
      profileId: plannedRequest.profileId ?? 'legacy_google_video_assembly'
    });
    const policyResolution = this.compositionPolicyResolver.resolve({
      request: plannedRequest
    });
    const compositionPolicy = policyResolution.policy;
    const compositionPolicyValidation = policyResolution.validation;
    const compositionOutput = this.compositionEngine.compose({
      request: plannedRequest,
      timelineScenes,
      narrationDurationSeconds,
      compositionPolicy
    });
    const compositionPlan = compositionOutput.compositionPlan;
    const compositionValidation = compositionOutput.validation;
    const compositionDiagnostics = compositionOutput.diagnostics ?? {};

    return {
      planner: {
        requestId: request.requestId ?? null,
        profileId: plannedRequest.profileId ?? 'legacy_google_video_assembly'
      },
      builder: {
        sceneCount: timelineScenes.length
      },
      validator: {
        isValid: timelineValidationReport.isValid,
        errorCount: timelineValidationReport.errors.length,
        warningCount: timelineValidationReport.warnings.length
      },
      composition: {
        isValid: compositionValidation.isValid,
        instructionCount: compositionPlan.renderInstructions.length,
        issueCount: compositionValidation.issues.length,
        transitionCount: compositionDiagnostics.transitionCount ?? 0
      },
      compositionPolicyResolution: {
        isValid: compositionPolicyValidation.isValid,
        issueCount: compositionPolicyValidation.issues.length,
        usedFallback: policyResolution.usedFallback,
        selectedProfileId: policyResolution.selectedProfileId,
        transitionPolicyStatus: compositionPolicy.transitions?.mode ?? 'unknown'
      },
      timelineValidationReport,
      compositionPolicy,
      compositionPolicyValidation,
      compositionValidation,
      compositionPlan,
      timelineScenes,
      narrationDurationSeconds,
      executedAt: this.buildTimestamp()
    };
  }

  buildTimestamp() {
    return new Date(this.now()).toISOString();
  }

  isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  runQualityReview({ request, mediaRenderResult }) {
    if (!this.shouldRunQualityReview(request)) {
      return null;
    }

    try {
      const metadata = request.metadata ?? {};
      const review = this.qualityIntelligenceEngine.review({
        requestId: request.requestId ?? null,
        missionId: request.missionId ?? null,
        businessId: request.businessId ?? null,
        mediaRenderResult,
        assets: {
          voiceOutput: metadata.voiceOutput ?? null,
          imageOutputs: Array.isArray(metadata.imageOutputs) ? metadata.imageOutputs : [],
          videoOutput: mediaRenderResult.videoFile
        },
        context: request.context ?? {}
      });

      return {
        review,
        error: null
      };
    } catch (error) {
      return {
        review: null,
        error: {
          code: 'QUALITY_REVIEW_FAILED',
          message: error?.message ?? 'Quality review execution failed.'
        }
      };
    }
  }

  shouldRunQualityReview(request = {}) {
    const contextFlag = request.context?.qualityReview?.enabled;
    const metadataFlag = request.metadata?.qualityReview?.enabled;

    return contextFlag === true || metadataFlag === true;
  }
}