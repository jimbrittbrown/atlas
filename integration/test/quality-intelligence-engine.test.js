import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createQualityReviewRequest,
  createQualityReviewResult,
  createQualityScore,
  createQualityIssue,
  createQualityRecommendation,
  createQualityReport
} from '../src/quality-intelligence/contracts/quality-review-contracts.js';
import { QualityIntelligenceEngine } from '../src/quality-intelligence/core/quality-intelligence-engine.js';

const TEST_DIR = '/tmp/atlas-quality-intelligence-tests';

function resetTestDir() {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

function runChecked(command, args, context) {
  const result = spawnSync(command, args, { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(`${context} failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }

  return result;
}

function createFixtureVideo(videoPath) {
  const audioPath = join(TEST_DIR, 'voice.wav');
  const imagePaths = [
    join(TEST_DIR, 'scene-01.png'),
    join(TEST_DIR, 'scene-02.png'),
    join(TEST_DIR, 'scene-03.png')
  ];

  runChecked('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=660:duration=3',
    '-c:a', 'pcm_s16le',
    audioPath
  ], 'audio fixture generation');

  for (const imagePath of imagePaths) {
    runChecked('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=#1A1A1A:s=1920x1080:d=1',
      '-frames:v', '1',
      imagePath
    ], `image fixture generation ${imagePath}`);
  }

  runChecked('ffmpeg', [
    '-y',
    '-i', audioPath,
    '-loop', '1', '-t', '1', '-i', imagePaths[0],
    '-loop', '1', '-t', '1', '-i', imagePaths[1],
    '-loop', '1', '-t', '1', '-i', imagePaths[2],
    '-filter_complex', '[1:v]fps=30,format=yuv420p[v0];[2:v]fps=30,format=yuv420p[v1];[3:v]fps=30,format=yuv420p[v2];[v0][v1][v2]concat=n=3:v=1:a=0[v]',
    '-map', '[v]',
    '-map', '0:a',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    videoPath
  ], 'video fixture generation');

  return {
    audioPath,
    imagePaths,
    videoPath
  };
}

test('quality review contracts create deterministic shape', () => {
  const request = createQualityReviewRequest({
    requestId: 'REQ-QUALITY-1',
    missionId: 'MISSION-QUALITY-1',
    businessId: 'BUSINESS-QUALITY-1',
    mediaRenderResult: {
      status: 'COMPLETED',
      videoFile: '/tmp/video.mp4'
    },
    assets: {
      voiceOutput: '/tmp/voice.wav',
      imageOutputs: ['/tmp/image-01.png']
    }
  });
  const score = createQualityScore({ category: 'technical', score: 95, passed: true });
  const issue = createQualityIssue({
    issueId: 'QI-1',
    code: 'TECH_FRAME_RATE_DRIFT',
    category: 'technical',
    severity: 'low',
    message: 'Frame rate drift detected.'
  });
  const recommendation = createQualityRecommendation({
    recommendationId: 'QREC-1',
    priority: 'low',
    action: 'Normalize frame rate.',
    rationale: 'Keep deterministic profile output.',
    relatedIssueCodes: ['TECH_FRAME_RATE_DRIFT']
  });
  const report = createQualityReport({
    reportId: 'QREP-1',
    generatedAt: '2026-07-09T00:00:00.000Z',
    overallScore: 95,
    categoryScores: [score],
    issues: [issue],
    recommendations: [recommendation],
    executiveSummary: 'Quality score acceptable.',
    diagnostics: { technical: {} }
  });
  const result = createQualityReviewResult({
    requestId: request.requestId,
    missionId: request.missionId,
    businessId: request.businessId,
    overallScore: 95,
    categoryScores: [score],
    issues: [issue],
    recommendations: [recommendation],
    reviewDecision: 'PASS',
    qualityReport: report,
    executiveSummary: 'Quality score acceptable.',
    improvementRecommendations: ['Normalize frame rate.']
  });

  assert.equal(request.assets.videoOutput, '/tmp/video.mp4');
  assert.equal(score.category, 'technical');
  assert.equal(issue.code, 'TECH_FRAME_RATE_DRIFT');
  assert.equal(recommendation.recommendationId, 'QREC-1');
  assert.equal(report.reportId, 'QREP-1');
  assert.equal(result.reviewDecision, 'PASS');
});

test('quality intelligence engine evaluates deterministic media quality', () => {
  resetTestDir();
  const videoPath = join(TEST_DIR, 'rendered.mp4');
  const fixture = createFixtureVideo(videoPath);
  const engine = new QualityIntelligenceEngine();

  const review = engine.review({
    requestId: 'REQ-QUALITY-DETERMINISTIC',
    missionId: 'MISSION-QUALITY-DETERMINISTIC',
    businessId: 'BUSINESS-QUALITY-DETERMINISTIC',
    mediaRenderResult: {
      requestId: 'REQ-QUALITY-DETERMINISTIC',
      missionId: 'MISSION-QUALITY-DETERMINISTIC',
      businessId: 'BUSINESS-QUALITY-DETERMINISTIC',
      status: 'COMPLETED',
      videoFile: fixture.videoPath,
      duration: '3 seconds',
      timelineDiagnostics: {
        isValid: true,
        summary: {
          sceneCount: 3,
          totalDurationSeconds: 3,
          narrationDurationSeconds: 3
        },
        checks: {},
        errors: [],
        warnings: []
      },
      diagnostics: {
        pipelineReport: {
          composition: {
            transitionCount: 2
          },
          timelineScenes: [
            { sceneId: 'SCENE-001', imageAsset: fixture.imagePaths[0], durationSeconds: 1 },
            { sceneId: 'SCENE-002', imageAsset: fixture.imagePaths[1], durationSeconds: 1 },
            { sceneId: 'SCENE-003', imageAsset: fixture.imagePaths[2], durationSeconds: 1 }
          ],
          compositionPlan: {
            renderInstructions: [
              {
                instructionId: 'RI-001',
                sceneId: 'SCENE-001',
                imageAsset: fixture.imagePaths[0],
                durationSeconds: 1,
                transitionPreset: { presetId: 'TRANSITION_CROSSFADE' }
              },
              {
                instructionId: 'RI-002',
                sceneId: 'SCENE-002',
                imageAsset: fixture.imagePaths[1],
                durationSeconds: 1,
                transitionPreset: { presetId: 'TRANSITION_CROSSFADE' }
              },
              {
                instructionId: 'RI-003',
                sceneId: 'SCENE-003',
                imageAsset: fixture.imagePaths[2],
                durationSeconds: 1,
                transitionPreset: { presetId: 'TRANSITION_NONE' }
              }
            ],
            policy: {
              transitions: {
                mode: 'enabled'
              }
            }
          }
        },
        rendererDiagnostics: {
          transitionCount: 2
        }
      }
    },
    assets: {
      voiceOutput: fixture.audioPath,
      imageOutputs: fixture.imagePaths,
      videoOutput: fixture.videoPath
    }
  });

  assert.equal(review.status, 'COMPLETED');
  assert.equal(typeof review.overallScore, 'number');
  assert.equal(Array.isArray(review.categoryScores), true);
  assert.equal(Array.isArray(review.issues), true);
  assert.equal(Array.isArray(review.recommendations), true);
  assert.equal(typeof review.executiveSummary, 'string');
  assert.equal(typeof review.qualityReport, 'object');
  assert.equal(review.reviewDecision === 'PASS' || review.reviewDecision === 'REVISE' || review.reviewDecision === 'BLOCK', true);
  assert.equal(review.issues.some(issue => issue.code === 'TECH_VIDEO_MISSING'), false);
});

test('quality intelligence engine blocks missing video artifact', () => {
  const engine = new QualityIntelligenceEngine();

  const review = engine.review({
    requestId: 'REQ-QUALITY-MISSING-VIDEO',
    missionId: 'MISSION-QUALITY-MISSING-VIDEO',
    businessId: 'BUSINESS-QUALITY-MISSING-VIDEO',
    mediaRenderResult: {
      status: 'FAILED',
      videoFile: '/tmp/nonexistent-video.mp4',
      timelineDiagnostics: {
        isValid: false,
        summary: {
          sceneCount: 0,
          totalDurationSeconds: 0,
          narrationDurationSeconds: 0
        },
        errors: [{ code: 'MISSING_TIMELINE' }],
        warnings: []
      },
      diagnostics: {
        pipelineReport: {
          timelineScenes: [],
          composition: {
            transitionCount: 0
          },
          compositionPlan: {
            renderInstructions: []
          }
        },
        rendererDiagnostics: {
          transitionCount: 0
        }
      }
    },
    assets: {
      voiceOutput: '/tmp/nonexistent-voice.wav',
      imageOutputs: ['/tmp/nonexistent-image.png'],
      videoOutput: '/tmp/nonexistent-video.mp4'
    }
  });

  assert.equal(review.reviewDecision, 'BLOCK');
  assert.equal(review.issues.some(issue => issue.code === 'TECH_VIDEO_MISSING'), true);
  assert.equal(review.issues.some(issue => issue.code === 'RENDER_NOT_COMPLETED'), true);
});
