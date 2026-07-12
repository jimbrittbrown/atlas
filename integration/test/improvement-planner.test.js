import test from 'node:test';
import assert from 'node:assert/strict';
import { ImprovementPlanner } from '../src/production/improvement-planner.js';

test('improvement planner returns top three prioritized objectives', () => {
  const planner = new ImprovementPlanner();

  const plan = planner.planImprovements({
    executiveProducerPackage: {
      cycleCount: 3
    },
    executiveScriptReview: {
      editorReview: {
        revisionRequests: [
          { issueType: 'repetition', diagnosis: 'Repeated phrasing.' },
          { issueType: 'production-note-language', diagnosis: 'Planning leakage.' },
          { issueType: 'abstraction-overload', diagnosis: 'Abstract language.' },
          { issueType: 'ending-impact', diagnosis: 'Ending is weak.' }
        ]
      }
    },
    storytellingScorecard: {
      scores: {
        curiosity: 5,
        narrativeFlow: 6,
        audienceCommitment: 7
      }
    },
    previousRevisionHistory: [
      {
        editorFeedback: [
          { issueType: 'abstraction-overload' },
          { issueType: 'abstraction-overload' },
          { issueType: 'repetition' }
        ]
      }
    ],
    goldStandard: {
      name: 'Atlas Documentary Storytelling Gold Standard'
    }
  });

  assert.equal(plan.planner, 'ImprovementPlanner');
  assert.equal(plan.goldStandardReference, 'Atlas Documentary Storytelling Gold Standard');
  assert.equal(plan.optimizationAuthority, 'EXECUTIVE_PRODUCER_SCORE');
  assert.equal(typeof plan.optimizationQuestion, 'string');
  assert.equal(typeof plan.singleHighestImpactChange, 'string');
  assert.equal(typeof plan.productionReadiness, 'object');
  assert.equal(typeof plan.productionReadiness.isReady, 'boolean');
  assert.equal(Array.isArray(plan.prioritizedObjectives), true);
  assert.equal(plan.prioritizedObjectives.length, 3);
  assert.equal(typeof plan.primaryObjective, 'object');
  assert.equal(plan.prioritizedObjectives[0].priority, 1);
  assert.equal(typeof plan.prioritizedObjectives[0].problem, 'string');
  assert.equal(typeof plan.prioritizedObjectives[0].rootCause, 'string');
  assert.equal(typeof plan.prioritizedObjectives[0].recommendedAction, 'string');
  assert.equal(typeof plan.prioritizedObjectives[0].successMetric, 'string');
  assert.equal(typeof plan.prioritizedObjectives[0].expectedQualityGain, 'number');
  assert.equal(plan.prioritizedObjectives[0].source, 'EXECUTIVE_PRODUCER');
});
