import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualEvaluator } from '../src/production/visual-evaluator.js';

test('VisualEvaluator returns category scores, overall score, and recommendations', () => {
  const evaluator = new VisualEvaluator();
  const result = evaluator.evaluate({
    sceneDescription: 'Close-up framing of a documented archive discovery that changes the stakes of the investigation.',
    artStyle: 'Cinematic documentary composition with natural light',
    scriptSummary: 'The documentary reveals conflicting records and rising institutional pressure.',
    historicalContextNotes: ['Archive dated to correct period', 'Location details validated'],
    continuityNotes: ['Same location as prior beat', 'Consistent visual palette'],
    emotionalTarget: 'Rising tension with credibility'
  });

  assert.equal(typeof result.scores.storyRelevance, 'number');
  assert.equal(typeof result.scores.historicalAccuracy, 'number');
  assert.equal(typeof result.scores.emotionalImpact, 'number');
  assert.equal(typeof result.scores.visualContinuity, 'number');
  assert.equal(typeof result.scores.cinematicComposition, 'number');
  assert.equal(typeof result.scores.sceneQuality, 'number');
  assert.equal(typeof result.overallScore, 'number');
  assert.equal(Array.isArray(result.recommendations), true);
  assert.equal(typeof result.score, 'object');
  assert.equal(Array.isArray(result.evidence), true);
  assert.equal(typeof result.diagnosis, 'string');
  assert.equal(Array.isArray(result.recommendedImprovements), true);
  assert.equal(Array.isArray(result.revisedWorkPlan), true);
  assert.equal(['PASS', 'CONDITIONAL', 'FAIL'].includes(result.classification), true);
});

test('VisualEvaluator marks empty visual plan as fail', () => {
  const evaluator = new VisualEvaluator();
  const result = evaluator.evaluate({});

  assert.equal(result.classification, 'FAIL');
  assert.equal(result.overallScore <= 5.5, true);
});
