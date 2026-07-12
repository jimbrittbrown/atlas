import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  createQualityReviewRequest,
  createQualityReviewResult,
  createQualityIssue,
  createQualityScore,
  createQualityRecommendation,
  createQualityReport
} from '../contracts/quality-review-contracts.js';

const QUALITY_CATEGORIES = ['technical', 'timeline', 'composition', 'rendering'];

const SEVERITY_WEIGHT = {
  critical: 35,
  high: 20,
  medium: 10,
  low: 5
};

const DEFAULT_CONFIG = {
  ffprobePath: 'ffprobe',
  ffmpegPath: 'ffmpeg',
  expectedVideoCodec: 'h264',
  expectedAudioCodec: 'aac',
  expectedFrameRate: 30,
  frameRateTolerance: 3,
  narrationSyncToleranceSeconds: 0.5,
  durationConsistencyToleranceSeconds: 0.75,
  blackFrameThresholdSeconds: 2,
  frozenFrameThresholdSeconds: 1.5
};

export class QualityIntelligenceEngine {
  constructor({ now = () => Date.now(), config = {} } = {}) {
    this.now = now;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }

  review(input = {}) {
    const request = createQualityReviewRequest(input);
    const mediaRenderResult = request.mediaRenderResult ?? {};
    const issues = [];
    const diagnostics = {
      technical: {},
      timeline: {},
      composition: {},
      rendering: {}
    };

    this.evaluateTechnical({ request, mediaRenderResult, issues, diagnostics });
    this.evaluateTimeline({ mediaRenderResult, issues, diagnostics });
    this.evaluateComposition({ mediaRenderResult, issues, diagnostics });
    this.evaluateRendering({ request, mediaRenderResult, issues, diagnostics });

    const categoryScores = this.buildCategoryScores(issues);
    const overallScore = this.computeOverallScore(categoryScores);
    const recommendations = this.buildRecommendations(issues);
    const reviewDecision = this.resolveReviewDecision({ overallScore, issues });
    const executiveSummary = this.buildExecutiveSummary({ overallScore, reviewDecision, issues, categoryScores });
    const qualityReport = createQualityReport({
      reportId: this.buildReportId(request),
      generatedAt: this.buildTimestamp(),
      overallScore,
      categoryScores,
      issues,
      recommendations,
      executiveSummary,
      diagnostics
    });

    return createQualityReviewResult({
      requestId: request.requestId,
      missionId: request.missionId,
      businessId: request.businessId,
      status: 'COMPLETED',
      overallScore,
      categoryScores,
      issues,
      recommendations,
      reviewDecision,
      qualityReport,
      executiveSummary,
      improvementRecommendations: recommendations.map(rec => rec.action)
    });
  }

  evaluateTechnical({ request, mediaRenderResult, issues, diagnostics }) {
    const videoFile = request.assets.videoOutput ?? mediaRenderResult.videoFile ?? null;
    const technical = diagnostics.technical;
    technical.videoFile = videoFile;

    if (!this.isNonEmptyString(videoFile) || !existsSync(videoFile)) {
      issues.push(this.createIssue({
        code: 'TECH_VIDEO_MISSING',
        category: 'technical',
        severity: 'critical',
        message: 'Rendered MP4 asset is missing.',
        details: { videoFile }
      }));
      return;
    }

    const probeResult = this.runProbe(videoFile);

    if (!probeResult.success) {
      issues.push(this.createIssue({
        code: 'TECH_FFPROBE_FAILED',
        category: 'technical',
        severity: 'critical',
        message: 'Unable to inspect rendered media with ffprobe.',
        details: { error: probeResult.error }
      }));
      return;
    }

    const format = probeResult.payload.format ?? {};
    const videoStream = (probeResult.payload.streams ?? []).find(stream => stream.codec_type === 'video') ?? null;
    const audioStream = (probeResult.payload.streams ?? []).find(stream => stream.codec_type === 'audio') ?? null;

    technical.format = {
      formatName: format.format_name ?? null,
      durationSeconds: this.parseNumber(format.duration),
      bitRate: this.parseNumber(format.bit_rate)
    };
    technical.videoStream = {
      codec: videoStream?.codec_name ?? null,
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      frameRate: this.parseFrameRate(videoStream?.avg_frame_rate)
    };
    technical.audioStream = {
      codec: audioStream?.codec_name ?? null
    };

    const formatName = String(format.format_name ?? '');

    if (!formatName.includes('mp4') && !formatName.includes('mov')) {
      issues.push(this.createIssue({
        code: 'TECH_INVALID_MP4_FORMAT',
        category: 'technical',
        severity: 'high',
        message: 'Rendered file is not a valid MP4-compatible container.',
        details: { formatName }
      }));
    }

    const expectedResolution = this.parseResolution(mediaRenderResult?.diagnostics?.pipelineReport?.compositionPlan?.policy?.safeZones?.targetResolution
      ?? mediaRenderResult?.diagnostics?.pipelineReport?.compositionPlan?.targetResolution
      ?? null);

    if (videoStream && expectedResolution) {
      if (videoStream.width !== expectedResolution.width || videoStream.height !== expectedResolution.height) {
        issues.push(this.createIssue({
          code: 'TECH_RESOLUTION_MISMATCH',
          category: 'technical',
          severity: 'medium',
          message: 'Rendered resolution does not match expected target.',
          details: {
            expected: `${expectedResolution.width}x${expectedResolution.height}`,
            actual: `${videoStream.width}x${videoStream.height}`
          }
        }));
      }
    }

    if (videoStream?.codec_name !== this.config.expectedVideoCodec) {
      issues.push(this.createIssue({
        code: 'TECH_VIDEO_CODEC_MISMATCH',
        category: 'technical',
        severity: 'medium',
        message: 'Rendered video codec differs from expected codec.',
        details: {
          expected: this.config.expectedVideoCodec,
          actual: videoStream?.codec_name ?? null
        }
      }));
    }

    if (audioStream?.codec_name !== this.config.expectedAudioCodec) {
      issues.push(this.createIssue({
        code: 'TECH_AUDIO_CODEC_MISMATCH',
        category: 'technical',
        severity: 'low',
        message: 'Rendered audio codec differs from expected codec.',
        details: {
          expected: this.config.expectedAudioCodec,
          actual: audioStream?.codec_name ?? null
        }
      }));
    }

    const frameRate = this.parseFrameRate(videoStream?.avg_frame_rate);
    if (frameRate <= 0) {
      issues.push(this.createIssue({
        code: 'TECH_INVALID_FRAME_RATE',
        category: 'technical',
        severity: 'high',
        message: 'Rendered frame rate is invalid.',
        details: { frameRate }
      }));
    } else if (Math.abs(frameRate - this.config.expectedFrameRate) > this.config.frameRateTolerance) {
      issues.push(this.createIssue({
        code: 'TECH_FRAME_RATE_DRIFT',
        category: 'technical',
        severity: 'low',
        message: 'Rendered frame rate drifted from expected profile.',
        details: {
          expected: this.config.expectedFrameRate,
          actual: frameRate,
          tolerance: this.config.frameRateTolerance
        }
      }));
    }

    if (this.parseNumber(format.duration) <= 0) {
      issues.push(this.createIssue({
        code: 'TECH_INVALID_DURATION',
        category: 'technical',
        severity: 'high',
        message: 'Rendered duration must be greater than zero.',
        details: { duration: format.duration ?? null }
      }));
    }

    if (this.parseNumber(format.bit_rate) <= 0) {
      issues.push(this.createIssue({
        code: 'TECH_INVALID_BITRATE',
        category: 'technical',
        severity: 'medium',
        message: 'Rendered bitrate is missing or zero.',
        details: { bitRate: format.bit_rate ?? null }
      }));
    }

    const corruptionCheck = this.runCorruptionCheck(videoFile);
    technical.corruptionCheck = corruptionCheck;

    if (!corruptionCheck.success) {
      issues.push(this.createIssue({
        code: 'TECH_CORRUPTION_DETECTED',
        category: 'technical',
        severity: 'critical',
        message: 'Corruption detection found decode errors in rendered output.',
        details: { error: corruptionCheck.error }
      }));
    }
  }

  evaluateTimeline({ mediaRenderResult, issues, diagnostics }) {
    const timelineDiagnostics = mediaRenderResult.timelineDiagnostics ?? mediaRenderResult?.diagnostics?.pipelineReport?.timelineValidationReport ?? null;
    const pipelineReport = mediaRenderResult?.diagnostics?.pipelineReport ?? {};
    const timeline = diagnostics.timeline;

    timeline.timelineDiagnostics = timelineDiagnostics;

    if (!timelineDiagnostics || timelineDiagnostics.isValid !== true) {
      issues.push(this.createIssue({
        code: 'TIMELINE_VALIDATION_FAILED',
        category: 'timeline',
        severity: 'high',
        message: 'Timeline diagnostics are invalid.',
        details: {
          errors: timelineDiagnostics?.errors ?? []
        }
      }));
      return;
    }

    const summary = timelineDiagnostics.summary ?? {};
    const narrationDuration = this.parseNumber(summary.narrationDurationSeconds);
    const timelineDuration = this.parseNumber(summary.totalDurationSeconds);
    timeline.narrationDurationSeconds = narrationDuration;
    timeline.totalDurationSeconds = timelineDuration;

    if (narrationDuration > 0 && timelineDuration > 0) {
      const drift = Math.abs(narrationDuration - timelineDuration);
      timeline.narrationDriftSeconds = drift;

      if (drift > this.config.narrationSyncToleranceSeconds) {
        issues.push(this.createIssue({
          code: 'TIMELINE_NARRATION_SYNC_DRIFT',
          category: 'timeline',
          severity: 'medium',
          message: 'Narration and timeline durations are not synchronized.',
          details: {
            narrationDuration,
            timelineDuration,
            drift,
            tolerance: this.config.narrationSyncToleranceSeconds
          }
        }));
      }
    }

    const timelineScenes = Array.isArray(pipelineReport.timelineScenes) ? pipelineReport.timelineScenes : [];
    timeline.sceneCount = timelineScenes.length;

    if (timelineScenes.length === 0) {
      issues.push(this.createIssue({
        code: 'TIMELINE_MISSING_SCENES',
        category: 'timeline',
        severity: 'high',
        message: 'Timeline contains no scenes.',
        details: {}
      }));
    }

    const duplicateAssets = this.findDuplicateSceneAssets(timelineScenes);
    if (duplicateAssets.length > 0) {
      issues.push(this.createIssue({
        code: 'TIMELINE_DUPLICATE_SCENES',
        category: 'timeline',
        severity: 'medium',
        message: 'Timeline contains duplicate scene image assets.',
        details: {
          duplicateAssets
        }
      }));
    }

    const missingSceneAssets = timelineScenes.filter(scene => !this.isNonEmptyString(scene.imageAsset));
    if (missingSceneAssets.length > 0) {
      issues.push(this.createIssue({
        code: 'TIMELINE_MISSING_SCENE_ASSET',
        category: 'timeline',
        severity: 'high',
        message: 'Timeline contains scenes without image assets.',
        details: {
          sceneIds: missingSceneAssets.map(scene => scene.sceneId)
        }
      }));
    }

    const computedDuration = timelineScenes.reduce(
      (sum, scene) => sum + this.parseNumber(scene.durationSeconds),
      0
    );
    timeline.computedDurationSeconds = Math.round(computedDuration * 1000) / 1000;

    if (timelineDuration > 0) {
      const drift = Math.abs(computedDuration - timelineDuration);
      timeline.computedDurationDriftSeconds = Math.round(drift * 1000) / 1000;

      if (drift > this.config.durationConsistencyToleranceSeconds) {
        issues.push(this.createIssue({
          code: 'TIMELINE_DURATION_INCONSISTENT',
          category: 'timeline',
          severity: 'medium',
          message: 'Computed scene durations are inconsistent with timeline summary duration.',
          details: {
            computedDuration,
            timelineDuration,
            drift
          }
        }));
      }
    }

    const compositionTransitionCount = this.parseNumber(pipelineReport.composition?.transitionCount);
    const rendererTransitionCount = this.parseNumber(mediaRenderResult?.diagnostics?.rendererDiagnostics?.transitionCount);

    timeline.transitionIntegrity = {
      compositionTransitionCount,
      rendererTransitionCount
    };

    if (compositionTransitionCount !== rendererTransitionCount) {
      issues.push(this.createIssue({
        code: 'TIMELINE_TRANSITION_INTEGRITY_MISMATCH',
        category: 'timeline',
        severity: 'medium',
        message: 'Transition counts differ between composition and renderer diagnostics.',
        details: {
          compositionTransitionCount,
          rendererTransitionCount
        }
      }));
    }
  }

  evaluateComposition({ mediaRenderResult, issues, diagnostics }) {
    const pipelineReport = mediaRenderResult?.diagnostics?.pipelineReport ?? {};
    const compositionPlan = pipelineReport.compositionPlan ?? {};
    const instructions = Array.isArray(compositionPlan.renderInstructions)
      ? compositionPlan.renderInstructions
      : [];
    const composition = diagnostics.composition;

    composition.instructionCount = instructions.length;
    composition.policy = compositionPlan.policy ?? null;

    if (instructions.length === 0) {
      issues.push(this.createIssue({
        code: 'COMPOSITION_NO_INSTRUCTIONS',
        category: 'composition',
        severity: 'high',
        message: 'Composition plan contains no render instructions.',
        details: {}
      }));
      return;
    }

    const invalidInstructions = instructions.filter(instruction => (
      !this.isNonEmptyString(instruction.instructionId)
      || !this.isNonEmptyString(instruction.sceneId)
      || !this.isNonEmptyString(instruction.imageAsset)
      || this.parseNumber(instruction.durationSeconds) <= 0
    ));

    if (invalidInstructions.length > 0) {
      issues.push(this.createIssue({
        code: 'COMPOSITION_INVALID_INSTRUCTIONS',
        category: 'composition',
        severity: 'high',
        message: 'One or more composition instructions are invalid.',
        details: {
          instructionIds: invalidInstructions.map(instruction => instruction.instructionId ?? null)
        }
      }));
    }

    const timelineScenes = Array.isArray(pipelineReport.timelineScenes) ? pipelineReport.timelineScenes : [];

    if (timelineScenes.length > 0 && instructions.length !== timelineScenes.length) {
      issues.push(this.createIssue({
        code: 'COMPOSITION_INCOMPLETE',
        category: 'composition',
        severity: 'medium',
        message: 'Composition instruction count does not match timeline scene count.',
        details: {
          instructionCount: instructions.length,
          timelineSceneCount: timelineScenes.length
        }
      }));
    }

    const transitionMode = compositionPlan.policy?.transitions?.mode ?? 'disabled';
    const nonNoneTransitionCount = instructions.filter(
      instruction => instruction.transitionPreset?.presetId && instruction.transitionPreset.presetId !== 'TRANSITION_NONE'
    ).length;

    composition.transitionMode = transitionMode;
    composition.nonNoneTransitionCount = nonNoneTransitionCount;

    if (transitionMode === 'disabled' && nonNoneTransitionCount > 0) {
      issues.push(this.createIssue({
        code: 'COMPOSITION_POLICY_INCONSISTENT',
        category: 'composition',
        severity: 'medium',
        message: 'Transition policy is disabled but transition instructions are present.',
        details: {
          nonNoneTransitionCount
        }
      }));
    }

    if (transitionMode === 'enabled' && instructions.length > 1 && nonNoneTransitionCount === 0) {
      issues.push(this.createIssue({
        code: 'COMPOSITION_TRANSITIONS_MISSING',
        category: 'composition',
        severity: 'low',
        message: 'Transition policy is enabled but no transition instructions were emitted.',
        details: {}
      }));
    }
  }

  evaluateRendering({ request, mediaRenderResult, issues, diagnostics }) {
    const rendering = diagnostics.rendering;
    const videoFile = request.assets.videoOutput ?? mediaRenderResult.videoFile ?? null;

    rendering.status = mediaRenderResult.status ?? null;

    if (String(mediaRenderResult.status ?? '').toUpperCase() !== 'COMPLETED') {
      issues.push(this.createIssue({
        code: 'RENDER_NOT_COMPLETED',
        category: 'rendering',
        severity: 'critical',
        message: 'Render status is not completed.',
        details: {
          status: mediaRenderResult.status ?? null
        }
      }));
    }

    const zeroLengthAssets = this.detectZeroLengthAssets(request.assets);
    rendering.zeroLengthAssets = zeroLengthAssets;

    if (zeroLengthAssets.length > 0) {
      issues.push(this.createIssue({
        code: 'RENDER_ZERO_LENGTH_ASSET',
        category: 'rendering',
        severity: 'high',
        message: 'One or more render input/output assets are zero-length or missing.',
        details: {
          assets: zeroLengthAssets
        }
      }));
    }

    if (!this.isNonEmptyString(videoFile) || !existsSync(videoFile)) {
      return;
    }

    const blackFrameStats = this.detectBlackFrames(videoFile);
    rendering.blackFrameStats = blackFrameStats;
    if (blackFrameStats.totalBlackDurationSeconds > this.config.blackFrameThresholdSeconds) {
      issues.push(this.createIssue({
        code: 'RENDER_BLACK_FRAMES_EXCESSIVE',
        category: 'rendering',
        severity: 'medium',
        message: 'Black frame duration exceeded threshold.',
        details: {
          totalBlackDurationSeconds: blackFrameStats.totalBlackDurationSeconds,
          threshold: this.config.blackFrameThresholdSeconds
        }
      }));
    }

    const freezeStats = this.detectFrozenFrames(videoFile);
    rendering.freezeStats = freezeStats;
    if (freezeStats.maxFreezeDurationSeconds > this.config.frozenFrameThresholdSeconds) {
      issues.push(this.createIssue({
        code: 'RENDER_FROZEN_FRAMES_DETECTED',
        category: 'rendering',
        severity: 'medium',
        message: 'Frozen frames exceeded threshold duration.',
        details: {
          maxFreezeDurationSeconds: freezeStats.maxFreezeDurationSeconds,
          threshold: this.config.frozenFrameThresholdSeconds
        }
      }));
    }
  }

  runProbe(videoFile) {
    const command = [
      '-v', 'error',
      '-show_streams',
      '-show_format',
      '-of', 'json',
      videoFile
    ];
    const result = spawnSync(this.config.ffprobePath, command, {
      encoding: 'utf8'
    });

    if (result.status !== 0) {
      return {
        success: false,
        error: result.stderr ?? result.stdout ?? 'ffprobe failed'
      };
    }

    try {
      return {
        success: true,
        payload: JSON.parse(result.stdout)
      };
    } catch (_error) {
      return {
        success: false,
        error: 'Unable to parse ffprobe JSON output.'
      };
    }
  }

  runCorruptionCheck(videoFile) {
    const command = [
      '-v', 'error',
      '-xerror',
      '-i', videoFile,
      '-f', 'null',
      '-'
    ];
    const result = spawnSync(this.config.ffmpegPath, command, {
      encoding: 'utf8'
    });

    if (result.status !== 0) {
      return {
        success: false,
        error: result.stderr ?? result.stdout ?? 'ffmpeg corruption check failed'
      };
    }

    return {
      success: true,
      error: null
    };
  }

  detectBlackFrames(videoFile) {
    const command = [
      '-v', 'info',
      '-i', videoFile,
      '-vf', 'blackdetect=d=0.20:pix_th=0.10',
      '-an',
      '-f', 'null',
      '-'
    ];
    const result = spawnSync(this.config.ffmpegPath, command, {
      encoding: 'utf8'
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const durations = Array.from(output.matchAll(/black_duration:(\d+(?:\.\d+)?)/g)).map(match => this.parseNumber(match[1]));
    const totalBlackDurationSeconds = durations.reduce((sum, duration) => sum + duration, 0);

    return {
      occurrences: durations.length,
      totalBlackDurationSeconds: Math.round(totalBlackDurationSeconds * 1000) / 1000
    };
  }

  detectFrozenFrames(videoFile) {
    const command = [
      '-v', 'info',
      '-i', videoFile,
      '-vf', 'freezedetect=n=-50dB:d=0.20',
      '-an',
      '-f', 'null',
      '-'
    ];
    const result = spawnSync(this.config.ffmpegPath, command, {
      encoding: 'utf8'
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const durations = Array.from(output.matchAll(/freeze_duration:(\d+(?:\.\d+)?)/g)).map(match => this.parseNumber(match[1]));
    const maxFreezeDurationSeconds = durations.length > 0 ? Math.max(...durations) : 0;

    return {
      occurrences: durations.length,
      maxFreezeDurationSeconds: Math.round(maxFreezeDurationSeconds * 1000) / 1000
    };
  }

  detectZeroLengthAssets(assets = {}) {
    const results = [];
    const candidates = [
      { kind: 'voiceOutput', path: assets.voiceOutput ?? null },
      { kind: 'videoOutput', path: assets.videoOutput ?? null },
      ...(Array.isArray(assets.imageOutputs)
        ? assets.imageOutputs.map(path => ({ kind: 'imageOutput', path }))
        : [])
    ];

    for (const candidate of candidates) {
      if (!this.isNonEmptyString(candidate.path)) {
        results.push({ kind: candidate.kind, path: candidate.path, exists: false, size: 0 });
        continue;
      }

      if (!existsSync(candidate.path)) {
        results.push({ kind: candidate.kind, path: candidate.path, exists: false, size: 0 });
        continue;
      }

      const size = statSync(candidate.path).size;

      if (size <= 0) {
        results.push({ kind: candidate.kind, path: candidate.path, exists: true, size: 0 });
      }
    }

    return results;
  }

  findDuplicateSceneAssets(scenes) {
    const counts = new Map();

    for (const scene of scenes) {
      const imageAsset = scene?.imageAsset;

      if (!this.isNonEmptyString(imageAsset)) {
        continue;
      }

      counts.set(imageAsset, (counts.get(imageAsset) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([imageAsset, count]) => ({ imageAsset, count }));
  }

  buildCategoryScores(issues) {
    return QUALITY_CATEGORIES.map(category => {
      const categoryIssues = issues.filter(issue => issue.category === category);
      const deduction = categoryIssues.reduce((sum, issue) => sum + (SEVERITY_WEIGHT[issue.severity] ?? SEVERITY_WEIGHT.medium), 0);
      const score = Math.max(0, 100 - deduction);
      const maxSeverity = this.resolveMaxSeverity(categoryIssues);

      return createQualityScore({
        category,
        score,
        passed: categoryIssues.length === 0,
        issueCount: categoryIssues.length,
        maxSeverity
      });
    });
  }

  computeOverallScore(categoryScores) {
    if (!Array.isArray(categoryScores) || categoryScores.length === 0) {
      return 0;
    }

    const sum = categoryScores.reduce((acc, score) => acc + this.parseNumber(score.score), 0);

    return Math.round((sum / categoryScores.length) * 100) / 100;
  }

  buildRecommendations(issues) {
    if (!Array.isArray(issues) || issues.length === 0) {
      return [
        createQualityRecommendation({
          recommendationId: 'QREC-001',
          priority: 'low',
          action: 'Proceed to publishing workflow when gate is enabled.',
          rationale: 'No deterministic quality issues were detected.',
          relatedIssueCodes: []
        })
      ];
    }

    return issues.map((issue, index) => createQualityRecommendation({
      recommendationId: `QREC-${String(index + 1).padStart(3, '0')}`,
      priority: this.severityToPriority(issue.severity),
      action: this.recommendationAction(issue),
      rationale: issue.message,
      relatedIssueCodes: [issue.code]
    }));
  }

  resolveReviewDecision({ overallScore, issues }) {
    const hasCritical = issues.some(issue => issue.severity === 'critical');
    const hasHigh = issues.some(issue => issue.severity === 'high');

    if (hasCritical || overallScore < 60) {
      return 'BLOCK';
    }

    if (hasHigh || overallScore < 80) {
      return 'REVISE';
    }

    return 'PASS';
  }

  buildExecutiveSummary({ overallScore, reviewDecision, issues, categoryScores }) {
    const categorySummary = categoryScores
      .map(score => `${score.category}:${score.score}`)
      .join(', ');

    return `Quality decision ${reviewDecision}. Overall score ${overallScore}. Issues ${issues.length}. Category scores ${categorySummary}.`;
  }

  recommendationAction(issue) {
    const actionByCode = {
      TECH_VIDEO_MISSING: 'Re-render MP4 output and confirm artifact path availability.',
      TECH_FFPROBE_FAILED: 'Inspect render output and rerun media probe diagnostics.',
      TECH_CORRUPTION_DETECTED: 'Re-run rendering pipeline and verify source media integrity.',
      TIMELINE_NARRATION_SYNC_DRIFT: 'Adjust scene timing to align with narration duration.',
      TIMELINE_MISSING_SCENES: 'Rebuild timeline with complete scene coverage.',
      TIMELINE_DUPLICATE_SCENES: 'Replace duplicate scene assets with unique scene outputs.',
      COMPOSITION_INVALID_INSTRUCTIONS: 'Regenerate composition plan with valid render instructions.',
      COMPOSITION_INCOMPLETE: 'Ensure each timeline scene maps to a composition instruction.',
      RENDER_BLACK_FRAMES_EXCESSIVE: 'Review source images and transitions to reduce black frame gaps.',
      RENDER_FROZEN_FRAMES_DETECTED: 'Review render timing and scene movement to avoid frozen segments.',
      RENDER_ZERO_LENGTH_ASSET: 'Regenerate missing or zero-byte media assets.',
      RENDER_NOT_COMPLETED: 'Investigate render failure and re-run media rendering.'
    };

    return actionByCode[issue.code] ?? 'Resolve issue and rerun deterministic quality review.';
  }

  severityToPriority(severity) {
    const mapped = {
      critical: 'urgent',
      high: 'high',
      medium: 'medium',
      low: 'low'
    };

    return mapped[severity] ?? 'medium';
  }

  createIssue({ code, category, severity, message, details }) {
    return createQualityIssue({
      issueId: `QI-${category.toUpperCase()}-${code}`,
      code,
      category,
      severity,
      message,
      details
    });
  }

  resolveMaxSeverity(issues) {
    const order = ['none', 'low', 'medium', 'high', 'critical'];
    const maxIndex = issues.reduce((index, issue) => {
      const severityIndex = order.indexOf(issue.severity);
      return Math.max(index, severityIndex);
    }, 0);

    return order[maxIndex] ?? 'none';
  }

  parseFrameRate(value) {
    if (!this.isNonEmptyString(value)) {
      return 0;
    }

    if (!String(value).includes('/')) {
      return this.parseNumber(value);
    }

    const [numerator, denominator] = String(value).split('/').map(segment => this.parseNumber(segment));

    if (denominator <= 0) {
      return 0;
    }

    return Math.round((numerator / denominator) * 1000) / 1000;
  }

  parseResolution(value) {
    if (!this.isNonEmptyString(value) || !String(value).includes('x')) {
      return null;
    }

    const [width, height] = String(value).split('x').map(segment => Number.parseInt(segment, 10));

    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      return null;
    }

    return { width, height };
  }

  parseNumber(value) {
    const parsed = Number(value);

    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      return 0;
    }

    return parsed;
  }

  buildReportId(request) {
    const requestToken = String(request.requestId ?? 'QUALITY-REVIEW').toUpperCase().replace(/[^A-Z0-9]+/g, '-');
    return `QREP-${requestToken}`;
  }

  buildTimestamp() {
    return new Date(this.now()).toISOString();
  }

  isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
