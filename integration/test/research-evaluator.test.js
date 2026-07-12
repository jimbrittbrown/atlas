import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchEvaluator } from '../src/research/research-evaluator.js';

test('ResearchEvaluator returns category scores, overall score, and recommendations', () => {
  const evaluator = new ResearchEvaluator();

  const result = evaluator.evaluate({
    report: {
      executiveSummary: 'Why this matters: evidence and data show a contradiction with public impact and unresolved questions.',
      providers: [
        { provider: 'Government Archive', status: 'success', response: { sourceType: 'archive', year: 2025 } },
        { provider: 'Investigative News Report', status: 'success', response: { sourceType: 'analysis', year: 2024 } },
        { provider: 'Encyclopedia Summary', status: 'success', response: { sourceType: 'summary', year: 2020 } }
      ],
      findings: [
        { id: 'F1', claim: 'Key claim corroborated by independent records.' },
        { id: 'F2', claim: 'Conflicting account suggests contradictory testimony.' },
        { id: 'F3', claim: 'Follow-up evidence confirmed by second source.' },
        { id: 'F4', claim: 'Funding disclosure reveals possible conflict of interest.' }
      ]
    }
  });

  assert.equal(typeof result.scores.sourceQuality, 'number');
  assert.equal(typeof result.scores.evidenceStrength, 'number');
  assert.equal(typeof result.scores.storyPotential, 'number');
  assert.equal(typeof result.scores.novelty, 'number');
  assert.equal(typeof result.scores.audienceInterest, 'number');
  assert.equal(typeof result.scores.completeness, 'number');
  assert.equal(typeof result.overallScore, 'number');
  assert.equal(Array.isArray(result.recommendations), true);
  assert.equal(typeof result.score, 'object');
  assert.equal(Array.isArray(result.evidence), true);
  assert.equal(typeof result.diagnosis, 'string');
  assert.equal(Array.isArray(result.recommendedImprovements), true);
  assert.equal(Array.isArray(result.revisedWorkPlan), true);
  assert.equal(typeof result.sourceQualityReasoning, 'object');
  assert.equal(typeof result.sourceQualityReasoning.sourceClassification, 'object');
  assert.equal(typeof result.sourceQualityReasoning.sourceHierarchy, 'object');
  assert.equal(typeof result.sourceQualityReasoning.independentCorroboration, 'object');
  assert.equal(typeof result.sourceQualityReasoning.authorityAndExpertise, 'object');
  assert.equal(typeof result.sourceQualityReasoning.biasDetection, 'object');
  assert.equal(typeof result.sourceQualityReasoning.conflictsOfInterest, 'object');
  assert.equal(typeof result.sourceQualityReasoning.currency, 'object');
  assert.equal(typeof result.sourceQualityReasoning.evidenceConfidence, 'object');
  assert.equal(typeof result.sourceQualityReasoning.missingEvidence, 'object');
  assert.equal(typeof result.sourceQualityReasoning.contradictoryEvidence, 'object');
  assert.equal(typeof result.sourceQualityReasoning.rejectionCriteria, 'object');
  assert.equal(Array.isArray(result.sourceQualityReasoning.professionalMasterClassLessons), true);
  assert.equal(result.sourceQualityReasoning.professionalMasterClassLessons.length >= 9, true);
  assert.equal(typeof result.sourceQualityReasoning.professionalSourceVerificationWorkflow, 'object');
  assert.equal(Array.isArray(result.sourceQualityReasoning.professionalSourceVerificationWorkflow.steps), true);
  assert.equal(typeof result.sourceQualityReasoning.appliedProfessionalReasoning, 'object');
  assert.equal(Array.isArray(result.sourceQualityReasoning.appliedProfessionalReasoning.activatedLessons), true);
  assert.equal(Array.isArray(result.sourceQualityReasoning.appliedProfessionalReasoning.decisionAdjustments), true);

  const agendaLesson = result.sourceQualityReasoning.professionalMasterClassLessons
    .find(lesson => lesson.lessonTitle === 'Every Source Has an Agenda');
  assert.equal(typeof agendaLesson, 'object');
  assert.equal(typeof agendaLesson.professionalPrinciple, 'string');
  assert.equal(typeof agendaLesson.whyProfessionalsThinkThisWay, 'string');
  assert.equal(Array.isArray(agendaLesson.commonBeginnerMistakes), true);
  assert.equal(Array.isArray(agendaLesson.professionalExamples), true);
  assert.equal(Array.isArray(agendaLesson.questionsSpecialistShouldAskItself), true);
  assert.equal(typeof agendaLesson.howThisLessonChangesFutureDecisions, 'string');

  const workflowLesson = result.sourceQualityReasoning.professionalMasterClassLessons
    .find(lesson => lesson.lessonTitle === 'Professional Source Verification Workflow');
  assert.equal(typeof workflowLesson, 'object');
  assert.equal(typeof result.sourceQualityRationale, 'string');
  assert.equal(result.sourceQualityRationale.length > 0, true);
  assert.equal(typeof result.storyWorthinessReasoning, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.audienceCuriosityValue, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.surprise, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.emotionalSignificance, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.narrativeImportance, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.conflictCreation, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.characterSignificance, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.visualPotential, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.memorability, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.educationalValue, 'object');
  assert.equal(typeof result.storyWorthinessReasoning.centralQuestionRelevance, 'object');
  assert.equal(Array.isArray(result.storyWorthinessReasoning.findingJudgments), true);
  assert.equal(typeof result.storyWorthinessRationale, 'string');
  assert.equal(result.storyWorthinessRationale.length > 0, true);
  assert.equal(typeof result.researchPackage, 'object');
  assert.equal(Array.isArray(result.researchPackage.sourcesRejected), true);
  assert.equal(Array.isArray(result.researchPackage.sourcesAccepted), true);
  assert.equal(Array.isArray(result.researchPackage.topOpeningCandidates), true);
  assert.equal(Array.isArray(result.researchPackage.highestStoryValueFacts), true);
  assert.equal(typeof result.researchPackage.evidenceReasoningMatrix, 'object');
  assert.equal(Array.isArray(result.researchPackage.evidenceReasoningMatrix['VERIFIED FACT']), true);
  assert.equal(Array.isArray(result.researchPackage.evidenceReasoningMatrix['SUPPORTED INTERPRETATION']), true);
  assert.equal(Array.isArray(result.researchPackage.evidenceReasoningMatrix['COMPETING INTERPRETATIONS']), true);
  assert.equal(Array.isArray(result.researchPackage.evidenceReasoningMatrix['OPEN QUESTION']), true);
  assert.equal(result.researchPackage.evidenceReasoningMatrix['VERIFIED FACT'].length > 0, true);
  assert.equal(typeof result.researchPackage.confidenceLevel, 'object');
  assert.equal(Array.isArray(result.researchPackage.outstandingResearchGaps), true);
  assert.equal(['PASS', 'CONDITIONAL', 'FAIL'].includes(result.classification), true);
});

test('ResearchEvaluator story worthiness provides professional include exclude reasoning', () => {
  const evaluator = new ResearchEvaluator();

  const result = evaluator.evaluate({
    report: {
      executiveSummary: 'Why was the witness account excluded, and what changed the case after the archived footage reveal?',
      providers: [
        { provider: 'Court Archive', status: 'success', response: { year: 2025 } },
        { provider: 'Public Commentary Blog', status: 'success', response: { year: 2024 } }
      ],
      findings: [
        { id: 'OPEN-1', claim: 'Unexpected archived footage reveal created immediate mystery and conflict in the case timeline.' },
        { id: 'EMO-1', claim: 'Victim family testimony described severe loss and fear with no verifiable documentation attached.' },
        { id: 'SUP-1', claim: 'A technically correct background policy note explains procedural context.' }
      ]
    }
  });

  const reasoningTexts = result.storyWorthinessReasoning.findingJudgments.map(item => item.reasoning);

  assert.equal(reasoningTexts.some(text => text.includes('Strong opening candidate because it immediately creates curiosity.')), true);
  assert.equal(reasoningTexts.some(text => text.includes('High emotional value but weak evidence.')), true);
  assert.equal(reasoningTexts.some(text => text.includes('Technically correct but low story value.') || text.includes('Excellent supporting fact but not central to the narrative.')), true);
});

test('ResearchEvaluator marks empty research as fail', () => {
  const evaluator = new ResearchEvaluator();
  const result = evaluator.evaluate({ report: { executiveSummary: '', providers: [], findings: [] } });

  assert.equal(result.classification, 'FAIL');
  assert.equal(result.overallScore <= 5.5, true);
});

test('ResearchEvaluator source quality master class drives professional decision adjustments', () => {
  const evaluator = new ResearchEvaluator();
  const result = evaluator.evaluate({
    report: {
      executiveSummary: 'Interesting claim with disputed timeline and no verified record yet.',
      providers: [
        { provider: 'Partisan Commentary Blog', status: 'success', response: { year: 2024, note: 'opinion and advocacy framing' } },
        { provider: 'Sponsored Aggregator Digest', status: 'success', response: { year: 2023, note: 'funded by affiliate sponsor' } }
      ],
      findings: [
        { id: 'F1', claim: 'A contradictory account suggests the event never happened as reported.' },
        { id: 'F2', claim: 'The timeline remains contested by two narratives.' }
      ]
    }
  });

  const applied = result.sourceQualityReasoning.appliedProfessionalReasoning;

  assert.equal(Array.isArray(applied.activatedLessons), true);
  assert.equal(applied.activatedLessons.some(item => item.lessonId === 'SQ-MASTER-002'), true);
  assert.equal(applied.activatedLessons.some(item => item.lessonId === 'SQ-MASTER-004'), true);
  assert.equal(applied.activatedLessons.some(item => item.lessonId === 'SQ-MASTER-005'), true);
  assert.equal(applied.activatedLessons.some(item => item.lessonId === 'SQ-MASTER-006'), true);
  assert.equal(applied.activatedLessons.some(item => item.lessonId === 'SQ-MASTER-008'), true);
  assert.equal(Array.isArray(applied.decisionAdjustments), true);
  assert.equal(applied.decisionAdjustments.length > 0, true);
  assert.equal(Array.isArray(result.sourceQualityReasoning.evidenceConfidence.earnedConfidenceAdjustments), true);
});
