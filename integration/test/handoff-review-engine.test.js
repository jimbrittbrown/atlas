import test from 'node:test';
import assert from 'node:assert/strict';
import { HandoffReviewEngine } from '../src/runtime/handoff-review-engine.js';

test('HandoffReviewEngine returns structured review for research to storytelling', () => {
  const engine = new HandoffReviewEngine();
  const review = engine.reviewResearchToStorytelling({
    researchResult: {
      report: {
        executiveSummary: 'Summary with evidence.'
      },
      findings: [{ id: 'F1' }]
    },
    researchEvaluation: {
      overallScore: 6.2,
      scores: {
        sourceQuality: 7,
        evidenceStrength: 6,
        storyPotential: 6,
        novelty: 5,
        audienceInterest: 6,
        completeness: 8
      },
      storyWorthinessReasoning: {
        findingJudgments: [
          {
            findingId: 'F1',
            findingText: 'Technically correct context fact.',
            storyWorthinessScore: 5,
            evidenceStrength: 7,
            decision: 'SUPPORTING_NOT_CENTRAL',
            dimensions: {
              audienceCuriosityValue: 4,
              emotionalSignificance: 3,
              centralQuestionRelevance: 4
            },
            reasoning: 'Excellent supporting fact but not central to the narrative.'
          }
        ]
      },
      recommendations: ['Improve corroboration.']
    }
  });

  assert.equal(review.handoff, 'RESEARCH_TO_STORYTELLING');
  assert.equal(['ACCEPT', 'ACCEPT_WITH_RECOMMENDATIONS', 'REQUEST_RESEARCH_REVISION'].includes(review.decision), true);
  assert.equal(Array.isArray(review.missingInformation), true);
  assert.equal(Array.isArray(review.weaknesses), true);
  assert.equal(Array.isArray(review.questions), true);
  assert.equal(Array.isArray(review.recommendedImprovements), true);
  assert.equal(typeof review.peerReview, 'object');
  assert.equal(Array.isArray(review.peerReview.factsLackingStoryValue), true);
  assert.equal(Array.isArray(review.peerReview.factsShouldBecomeOpeningCandidates), true);
  assert.equal(Array.isArray(review.peerReview.factsCreateCuriosity), true);
  assert.equal(Array.isArray(review.peerReview.factsShouldBeRemoved), true);
  assert.equal(Array.isArray(review.peerReview.additionalInformationNeeded), true);
  assert.equal(typeof review.structuredFeedback, 'object');
  assert.equal(review.structuredFeedback.coachingMode, true);
});

test('HandoffReviewEngine requests revisions when required information is missing', () => {
  const engine = new HandoffReviewEngine();
  const review = engine.reviewVisualDirectorToImageGeneration({
    evaluatedVisualPlan: {
      sceneDescription: '',
      artStyle: '',
      evaluation: {
        overallScore: 5.2,
        scores: {
          storyRelevance: 4,
          historicalAccuracy: 5,
          emotionalImpact: 5,
          visualContinuity: 4,
          cinematicComposition: 5,
          sceneQuality: 4
        },
        recommendations: ['Add scene constraints.']
      }
    }
  });

  assert.equal(review.decision, 'REQUEST_REVISIONS');
  assert.equal(review.structuredFeedback.revisionRequested, true);
  assert.equal(review.structuredFeedback.actionItems.length > 0, true);
});
