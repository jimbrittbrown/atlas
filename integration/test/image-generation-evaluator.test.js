import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageGenerationEvaluator } from '../src/production/image-generation-evaluator.js';

test('ImageGenerationEvaluator returns scores, overall score, evidence, diagnosis, prescription, and expected improvement', () => {
  const evaluator = new ImageGenerationEvaluator();

  const result = evaluator.evaluate({
    evaluatedVisualPlan: {
      sceneDescription: 'Historically grounded archive room scene with documentary realism and evidence table in foreground.',
      artStyle: 'Cinematic documentary realism',
      evaluation: {
        overallScore: 8,
        classification: 'PASS'
      }
    },
    imageFiles: ['/tmp/img-1.png', '/tmp/img-2.png', '/tmp/img-3.png'],
    generatedScenes: ['archive room scene 1', 'archive room scene 2']
  });

  assert.equal(typeof result.categoryScores.promptFidelity, 'number');
  assert.equal(typeof result.categoryScores.historicalAccuracy, 'number');
  assert.equal(typeof result.categoryScores.sceneAccuracy, 'number');
  assert.equal(typeof result.categoryScores.characterConsistency, 'number');
  assert.equal(typeof result.categoryScores.visualQuality, 'number');
  assert.equal(typeof result.categoryScores.documentaryStyleConsistency, 'number');
  assert.equal(typeof result.overallScore, 'number');
  assert.equal(typeof result.score, 'object');
  assert.equal(Array.isArray(result.evidence), true);
  assert.equal(typeof result.diagnosis, 'string');
  assert.equal(Array.isArray(result.recommendedImprovements), true);
  assert.equal(Array.isArray(result.revisedWorkPlan), true);
  assert.equal(Array.isArray(result.prescription), true);
  assert.equal(typeof result.expectedImprovement, 'string');
  assert.equal(['PASS', 'CONDITIONAL', 'FAIL'].includes(result.classification), true);
});

test('ImageGenerationEvaluator flags low-quality package as fail', () => {
  const evaluator = new ImageGenerationEvaluator();
  const result = evaluator.evaluate({
    evaluatedVisualPlan: { sceneDescription: '', artStyle: '', evaluation: { overallScore: 0 } },
    imageFiles: [],
    generatedScenes: []
  });

  assert.equal(result.classification, 'FAIL');
});
