import test from 'node:test';
import assert from 'node:assert/strict';
import { NarrationEvaluator } from '../src/production/narration-evaluator.js';

test('NarrationEvaluator returns category scores, overall score, diagnosis, and improvements', () => {
  const evaluator = new NarrationEvaluator();
  const result = evaluator.evaluate({
    narrationText: 'The question is what happened next. However, the evidence remained hidden until a documented record surfaced.',
    voiceStyle: 'Documentary conversational dramatic',
    emphasisTargets: ['risk', 'evidence', 'consequence'],
    pauseHints: ['pause-before-major-claim', 'pause-after-evidence'],
    pronunciationNotes: ['Mikhail: mee-khail']
  });

  assert.equal(typeof result.scores.naturalFlow, 'number');
  assert.equal(typeof result.scores.emotionalDelivery, 'number');
  assert.equal(typeof result.scores.pacing, 'number');
  assert.equal(typeof result.scores.clarity, 'number');
  assert.equal(typeof result.scores.listenerEngagement, 'number');
  assert.equal(typeof result.scores.overallNarrationQuality, 'number');
  assert.equal(typeof result.overallScore, 'number');
  assert.equal(typeof result.score, 'object');
  assert.equal(Array.isArray(result.evidence), true);
  assert.equal(typeof result.diagnosis, 'string');
  assert.equal(Array.isArray(result.recommendedImprovements), true);
  assert.equal(Array.isArray(result.revisedWorkPlan), true);
  assert.equal(['PASS', 'CONDITIONAL', 'FAIL'].includes(result.classification), true);
});

test('NarrationEvaluator marks empty narration as fail', () => {
  const evaluator = new NarrationEvaluator();
  const result = evaluator.evaluate({});

  assert.equal(result.classification, 'FAIL');
  assert.equal(result.overallScore <= 5.5, true);
});
