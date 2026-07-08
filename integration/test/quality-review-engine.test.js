import test from 'node:test';
import assert from 'node:assert/strict';
import { QualityReviewEngine } from '../src/production/quality-review-engine.js';

test('quality review engine passes completed production package', () => {
  const engine = new QualityReviewEngine();

  const result = engine.review({
    script: 'A cracked bell rings as the hallway lights fail.',
    voiceOutput: 'voice-cinematic-horror-en-us-crackedbell.wav',
    imageOutputs: [
      'image-noir-illustration-bell-01.png',
      'image-noir-illustration-bell-02.png'
    ],
    videoOutput: 'video-1920x1080-crackedbell.mp4',
    metadata: {
      missionId: 'MISSION-5001',
      packageVersion: '1.0'
    }
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.remediationTasks, []);
  assert.equal(result.executiveRecommendation, 'APPROVE_FOR_RELEASE');
});

test('quality review engine fails when required assets are missing', () => {
  const engine = new QualityReviewEngine();

  const result = engine.review({
    script: 'A voice calls from behind the mirror.',
    voiceOutput: '',
    imageOutputs: [],
    videoOutput: '',
    metadata: {}
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.issues.map(issue => issue.code), [
    'MISSING_VOICE',
    'MISSING_IMAGES',
    'MISSING_VIDEO',
    'MISSING_METADATA'
  ]);
  assert.equal(result.executiveRecommendation.decision, 'REMEDIATE_AND_REVIEW');
  assert.equal(result.executiveRecommendation.issueCount, 4);
});

test('quality review engine generates deterministic remediation task definitions', () => {
  const engine = new QualityReviewEngine();

  const result = engine.review({
    script: '',
    voiceOutput: '',
    imageOutputs: [],
    videoOutput: '',
    metadata: {}
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.remediationTasks, [
    {
      taskId: 'REMED-001',
      type: 'QUALITY_REMEDIATION',
      issueCode: 'MISSING_SCRIPT',
      requiredField: 'script',
      action: 'Regenerate script artifact and attach to package.',
      priority: 'HIGH'
    },
    {
      taskId: 'REMED-002',
      type: 'QUALITY_REMEDIATION',
      issueCode: 'MISSING_VOICE',
      requiredField: 'voiceOutput',
      action: 'Regenerate voice asset and attach audio output.',
      priority: 'HIGH'
    },
    {
      taskId: 'REMED-003',
      type: 'QUALITY_REMEDIATION',
      issueCode: 'MISSING_IMAGES',
      requiredField: 'imageOutputs',
      action: 'Regenerate image assets and attach at least one image output.',
      priority: 'HIGH'
    },
    {
      taskId: 'REMED-004',
      type: 'QUALITY_REMEDIATION',
      issueCode: 'MISSING_VIDEO',
      requiredField: 'videoOutput',
      action: 'Reassemble video package and attach video output.',
      priority: 'HIGH'
    },
    {
      taskId: 'REMED-005',
      type: 'QUALITY_REMEDIATION',
      issueCode: 'MISSING_METADATA',
      requiredField: 'metadata',
      action: 'Rebuild package metadata and include required release context.',
      priority: 'HIGH'
    }
  ]);
});
