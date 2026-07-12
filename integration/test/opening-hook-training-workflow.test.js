import test from 'node:test';
import assert from 'node:assert/strict';
import { OpeningHookTrainingWorkflow } from '../src/academy/opening-hook-training-workflow.js';

test('opening hook module generates multiple candidates, scores, and ranks them', () => {
  const workflow = new OpeningHookTrainingWorkflow({ candidateCount: 6 });

  const cycle = workflow.runTrainingCycle({
    cycle: 1,
    researchPackage: {
      summary: 'Archival evidence shows warnings were known before launch.',
      highestStoryValueFacts: [
        { findingText: 'Engineers warned that launch conditions exceeded safe tolerance.' },
        { findingText: 'Schedule pressure overruled unresolved engineering objections.' }
      ]
    }
  });

  assert.equal(cycle.candidateCount >= 6, true);
  assert.equal(Array.isArray(cycle.rankedHooks), true);
  assert.equal(cycle.rankedHooks[0].rank, 1);
  assert.equal(typeof cycle.rankedHooks[0].hookSkillScore, 'number');
  assert.equal(Array.isArray(cycle.rankedHooks[0].successAnalysis), true);
  assert.equal(Array.isArray(cycle.recurringWeaknesses), true);
  assert.equal(typeof cycle.coachingGuidance.nextCycleInstruction, 'string');

  for (let i = 1; i < cycle.rankedHooks.length; i += 1) {
    assert.equal(
      Number(cycle.rankedHooks[i - 1].hookSkillScore) >= Number(cycle.rankedHooks[i].hookSkillScore),
      true
    );
  }
});

test('opening hook training repeats until consistent target when evaluator supports improvement', () => {
  let cycleCount = 0;
  const mockEvaluator = {
    evaluate() {
      cycleCount += 1;
      const elite = cycleCount >= 4;
      return {
        scores: {
          openingStrength: elite ? 10 : 7,
          curiosity: elite ? 9 : 6,
          narrativeFlow: 7,
          informationDensity: 6,
          audienceCommitment: elite ? 9 : 6
        },
        overallScore: elite ? 9.2 : 6.6,
        improvementRecommendations: elite ? [] : ['Increase unresolved question pressure.']
      };
    }
  };

  const workflow = new OpeningHookTrainingWorkflow({
    storytellingEvaluator: mockEvaluator,
    consistencyTarget: 2,
    maxTrainingCycles: 5,
    candidateCount: 2
  });

  const report = workflow.runUntilConsistentTarget({
    researchPackage: {
      summary: 'Warning signals were documented before the final event.'
    }
  });

  assert.equal(report.stopReason, 'CONSISTENT_TARGET_ACHIEVED');
  assert.equal(report.cyclesCompleted <= 5, true);
  assert.equal(report.finalTopHookScore >= 9, true);
  assert.equal(Array.isArray(report.cycleHistory), true);
  assert.equal(typeof report.transferPlan.recommendedGate, 'string');
});
