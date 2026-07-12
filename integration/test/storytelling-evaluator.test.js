import test from 'node:test';
import assert from 'node:assert/strict';
import { StorytellingEvaluator } from '../src/production/storytelling-evaluator.js';

test('StorytellingEvaluator returns category scores, overall score, and recommendations', () => {
  const evaluator = new StorytellingEvaluator();
  const result = evaluator.evaluate(
    'Opening Hook: Tonight we uncover an unresolved mystery. Beat 1 introduces the stakes. '
    + 'Beat 2 reveals clues and rising risk. Beat 3 delivers the final reveal and asks viewers to continue.'
  );

  assert.equal(typeof result.scores.openingStrength, 'number');
  assert.equal(typeof result.scores.curiosity, 'number');
  assert.equal(typeof result.scores.narrativeFlow, 'number');
  assert.equal(typeof result.scores.informationDensity, 'number');
  assert.equal(typeof result.scores.audienceCommitment, 'number');
  assert.equal(typeof result.overallScore, 'number');
  assert.equal(Array.isArray(result.improvementRecommendations), true);
  assert.equal(typeof result.score, 'object');
  assert.equal(Array.isArray(result.evidence), true);
  assert.equal(typeof result.diagnosis, 'string');
  assert.equal(Array.isArray(result.recommendedImprovements), true);
  assert.equal(Array.isArray(result.revisedWorkPlan), true);
  assert.equal(['PASS', 'CONDITIONAL', 'FAIL'].includes(result.classification), true);
  assert.equal(typeof result.curiosityEngineeringReasoning, 'object');
  assert.equal(typeof result.curiosityEngineeringRationale, 'string');
  assert.equal(Array.isArray(result.curiosityEngineeringReasoning.whyCuriosityIncreasing), true);
  assert.equal(Array.isArray(result.curiosityEngineeringReasoning.whyCuriosityDecreasing), true);
  assert.equal(Array.isArray(result.curiosityEngineeringReasoning.sectionsShouldBeRewritten), true);
  assert.equal(Array.isArray(result.curiosityEngineeringReasoning.revealsTooEarly), true);
  assert.equal(Array.isArray(result.curiosityEngineeringReasoning.questionsShouldBeIntroduced), true);
});

test('StorytellingEvaluator flags empty script as fail-level quality', () => {
  const evaluator = new StorytellingEvaluator();
  const result = evaluator.evaluate('');

  assert.equal(result.classification, 'FAIL');
  assert.equal(result.overallScore, 0);
  assert.equal(result.scores.openingStrength, 0);
  assert.equal(result.scores.audienceCommitment, 0);
  assert.equal(result.curiosityEngineeringReasoning.sceneMostLikelyToLoseAudience, null);
});

test('StorytellingEvaluator identifies curiosity collapse and early reveal coaching', () => {
  const evaluator = new StorytellingEvaluator();
  const result = evaluator.evaluate(
    'The answer is already clear from the beginning.\n'
    + 'Everyone agrees and there is nothing left to question.\n'
    + 'Finally we say exactly what happened with no new tension.'
  );

  assert.equal(typeof result.curiosityEngineeringReasoning.curiosityCollapseDetection, 'object');
  assert.equal(Array.isArray(result.curiosityEngineeringReasoning.curiosityCollapseDetection.collapseSections), true);
  assert.equal(Array.isArray(result.curiosityEngineeringReasoning.revealsTooEarly), true);
  assert.equal(Array.isArray(result.curiosityEngineeringReasoning.sectionsShouldBeRewritten), true);
  assert.equal(typeof result.curiosityEngineeringReasoning.sceneMostLikelyToLoseAudience, 'object');
  assert.equal(Array.isArray(result.improvementRecommendations), true);
  assert.equal(
    result.improvementRecommendations.some(recommendation => recommendation.includes('Rewrite SCENE-')),
    true
  );
  assert.equal(
    result.improvementRecommendations.some(recommendation => recommendation.includes('Delay reveal in SCENE-')),
    true
  );
});
