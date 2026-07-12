import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MissionRuntimeOrchestrator } from '../src/runtime/mission-runtime-orchestrator.js';
import { MissionLifecycleStates } from '../src/runtime/mission-runtime-contracts.js';

function createDeterministicWorkers() {
  return {
    scriptWorker: {
      async execute() {
        return {
          scriptTitle: 'Operation Title',
          script: 'Opening Hook: Atlas mission runtime orchestrator test script.'
        };
      }
    },
    voiceWorker: {
      async execute() {
        return {
          audioFile: '/tmp/op2-voice.wav'
        };
      }
    },
    imageWorker: {
      async execute() {
        return {
          imageFiles: ['/tmp/op2-image-01.png', '/tmp/op2-image-02.png']
        };
      }
    },
    videoWorker: {
      async execute() {
        return {
          videoFile: '/tmp/op2-video.mp4',
          status: 'COMPLETED'
        };
      }
    }
  };
}

function createDocumentaryGradeResearchOutput({ topic = 'documentary topic' } = {}) {
  const findings = Array.from({ length: 30 }, (_, index) => {
    const year = 1995 + index;
    return {
      id: `FINDING-${String(index + 1).padStart(3, '0')}`,
      claim: `${year}: Verified evidence showed policy and market behavior that led to measurable outcomes in ${topic}; competing viewpoints disputed scope, and ending insight emphasized accountability reform implications.`,
      evidenceType: 'DOCUMENTED_SOURCE',
      confidence: index % 4 === 0 ? 'HIGH' : 'MEDIUM'
    };
  });

  return {
    findings,
    report: {
      executiveSummary: `Documentary-grade dossier assembled for ${topic} with verified facts, timeline, contradictions, cause-and-effect relationships, turning points, and ending insights for professional storytelling handoff.`,
      providers: [
        { provider: 'Federal Reserve Board Archive', status: 'success', response: { sourceType: 'primary', year: 2025 } },
        { provider: 'Treasury Department Records', status: 'success', response: { sourceType: 'primary', year: 2024 } },
        { provider: 'Congressional Hearing Archive', status: 'success', response: { sourceType: 'primary', year: 2023 } },
        { provider: 'Bank for International Settlements Data', status: 'success', response: { sourceType: 'secondary', year: 2022 } },
        { provider: 'International Monetary Fund Report', status: 'success', response: { sourceType: 'secondary', year: 2021 } },
        { provider: 'Investigative Documentary Research Desk', status: 'success', response: { sourceType: 'analysis', year: 2020 } }
      ],
      findings: findings.map(item => ({ id: item.id, summary: item.claim }))
    }
  };
}

function createValidProductionAssets({ suffix = 'default' } = {}) {
  const root = `/tmp/atlas-runtime-integrity-${suffix}`;
  mkdirSync(root, { recursive: true });

  const audioFile = join(root, 'voice.wav');
  const imageFiles = [
    join(root, 'image-01.png'),
    join(root, 'image-02.png'),
    join(root, 'image-03.png'),
    join(root, 'image-04.png')
  ];
  const videoFile = join(root, 'video.mp4');

  const audioResult = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=880:duration=2',
    '-c:a', 'pcm_s16le',
    audioFile
  ], { encoding: 'utf8' });
  assert.equal(audioResult.status, 0, audioResult.stderr);

  imageFiles.forEach((imageFile, index) => {
    const color = ['navy', 'teal', 'maroon', 'olive'][index] ?? 'navy';
    const imageResult = spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=${color}:s=640x360:d=1`,
      '-frames:v', '1',
      imageFile
    ], { encoding: 'utf8' });
    assert.equal(imageResult.status, 0, imageResult.stderr);
  });

  const videoResult = spawnSync('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', imageFiles[0],
    '-i', audioFile,
    '-shortest',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    videoFile
  ], { encoding: 'utf8' });
  assert.equal(videoResult.status, 0, videoResult.stderr);

  return {
    root,
    audioFile,
    imageFile: imageFiles[0],
    imageFiles,
    videoFile
  };
}

test('valid mission reaches completed state with publishing disabled', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-001',
    objective: 'Validate mission runtime',
    businessId: 'SYSTEM_INTERNAL',
    publishingMode: 'NONE'
  });

  assert.equal(result.state, MissionLifecycleStates.COMPLETED);
  assert.equal(typeof result.runtimeContext.missionPlan, 'object');
  assert.equal(result.runtimeContext.missionPlan.objective.missionObjective, 'Validate mission runtime');
  assert.equal(typeof result.runtimeContext.plan, 'object');
  assert.equal(typeof result.runtimeContext.plan.launchPlan, 'object');
  assert.equal(typeof result.runtimeContext.plan.executionPlan, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.research, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.researchEvaluation, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.researchEvaluation.overallScore, 'number');
  assert.equal(typeof result.runtimeContext.artifacts.storytellingEvaluation, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.storytellingEvaluation.overallScore, 'number');
  assert.equal(result.runtimeContext.executionPolicy.publishingMode, 'NONE');
  assert.equal(result.runtimeContext.artifacts.publishing.status, 'DISABLED_BY_POLICY');
});

test('quality review is invoked, rc package and executive report are produced', async () => {
  let qualityInvocations = 0;
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review(input) {
        qualityInvocations += 1;
        assert.equal(typeof input.script, 'string');

        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-002',
    objective: 'Validate mission runtime artifacts',
    businessId: 'SYSTEM_INTERNAL'
  });

  assert.equal(qualityInvocations, 1);
  assert.equal(typeof result.runtimeContext.artifacts.releaseCandidatePackage, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.releaseCandidatePackagePath, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.executiveReport, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.executiveReportPath, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.executiveImprovementReport, 'object');
  assert.equal(result.runtimeContext.artifacts.executiveImprovementReport.reportType, 'Executive Improvement Report');
  assert.equal(result.runtimeContext.artifacts.executiveImprovementReport.officialRoadmapForNextBenchmark, true);
  assert.equal(typeof result.runtimeContext.artifacts.executiveImprovementReportPath, 'string');
  assert.equal(Array.isArray(result.runtimeContext.artifacts.executiveImprovementReport.recommendations), true);
  assert.equal(result.runtimeContext.artifacts.executiveImprovementReport.recommendations.length > 0, true);
  assert.equal(
    result.runtimeContext.artifacts.executiveImprovementReport.recommendations.every(recommendation => /^BEAT-\d{3}$/.test(String(recommendation.beatId))),
    true
  );
  assert.equal(typeof result.runtimeContext.artifacts.publishDecisionReport, 'object');
  assert.equal(result.runtimeContext.artifacts.publishDecisionReport.reportType, 'Publish Decision Report');
  assert.equal(
    ['PUBLISH', 'REVISE', 'REJECT'].includes(result.runtimeContext.artifacts.publishDecisionReport.decision),
    true
  );
  assert.equal(typeof result.runtimeContext.artifacts.publishDecisionReport.rationale, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.publishDecisionReport.confidence, 'number');
  assert.equal(Array.isArray(result.runtimeContext.artifacts.publishDecisionReport.blockingIssues), true);
  assert.equal(typeof result.runtimeContext.artifacts.publishDecisionReport.recommendedNextAction, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.publishDecisionReportPath, 'string');
  assert.equal(result.runtimeContext.artifacts.releaseCandidatePackage.missionId, result.missionId);
  assert.equal(existsSync(result.runtimeContext.artifacts.releaseCandidatePackagePath), true);
  assert.equal(existsSync(result.runtimeContext.artifacts.executiveReportPath), true);
  assert.equal(existsSync(result.runtimeContext.artifacts.executiveImprovementReportPath), true);
  assert.equal(existsSync(result.runtimeContext.artifacts.publishDecisionReportPath), true);
});

test('topic selection engine ranks candidates and producer brief uses selected topic', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-002-TOPIC',
    businessId: 'SYSTEM_INTERNAL',
    objective: 'Select highest-value topic before documentary production',
    audience: 'Executive Producer Review Council and documentary audience',
    style: 'Investigative Documentary',
    candidateTopics: [
      {
        topic: 'Ancient coin cataloging methods in a single regional museum collection',
        rationale: 'Niche archival process focus.'
      },
      {
        topic: 'The 2008 Financial Crisis: Lehman Brothers collapse, contagion, and global policy reform',
        rationale: 'High public relevance and strong educational impact.'
      }
    ],
    stopAfterReleaseCandidate: true
  });

  assert.equal(result.state, MissionLifecycleStates.RC_PACKAGING);
  assert.equal(typeof result.runtimeContext.artifacts.topicEvaluationReport, 'object');
  assert.equal(result.runtimeContext.artifacts.topicEvaluationReport.reportType, 'Topic Evaluation Report');
  assert.equal(Array.isArray(result.runtimeContext.artifacts.topicEvaluationReport.rankedTopics), true);
  assert.equal(result.runtimeContext.artifacts.topicEvaluationReport.rankedTopics.length >= 2, true);
  assert.equal(typeof result.runtimeContext.artifacts.topicEvaluationReport.recommendedTopic, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.topicEvaluationReport.recommendedTopic.topic, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.topicEvaluationReport.recommendationWhy, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.topicEvaluationReportPath, 'string');
  assert.equal(existsSync(result.runtimeContext.artifacts.topicEvaluationReportPath), true);
  assert.equal(
    result.runtimeContext.events.some(event => event.type === 'TOPIC_EVALUATION_COMPLETED'),
    true
  );
  assert.equal(
    result.runtimeContext.artifacts.producerBrief.documentaryObjective.includes(
      result.runtimeContext.artifacts.topicEvaluationReport.selectedTopic
    ),
    true
  );
});

test('storytelling stage receives evaluated research metadata', async () => {
  let researchObservedProducerBrief = null;
  let researchObservedProducerBriefSupport = null;
  let scriptingObservedEvaluatedResearch = false;
  let scriptingObservedResearchRevisedWorkPlan = null;
  let scriptingObservedHandoffReview = null;
  let scriptingObservedResearchPackage = null;
  let scriptingObservedStorytellingPlan = null;
  let scriptingObservedProducerBrief = null;
  let scriptingObservedProducerBriefSupport = null;

  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      ...createDeterministicWorkers(),
      researchWorker: {
        async execute(assignment) {
          const metadata = assignment.result?.task?.metadata ?? {};
          researchObservedProducerBrief = metadata.producerBrief ?? null;
          researchObservedProducerBriefSupport = metadata.producerBriefSupport ?? null;

          const researchOutput = createDocumentaryGradeResearchOutput({
            topic: metadata.topic ?? 'research handoff validation topic'
          });

          return {
            taskId: assignment.taskId,
            status: 'COMPLETED',
            findings: researchOutput.findings,
            report: researchOutput.report
          };
        }
      },
      scriptWorker: {
        async execute(assignment) {
          const metadata = assignment.result?.task?.metadata ?? {};
          scriptingObservedEvaluatedResearch = Boolean(metadata.evaluatedResearch && typeof metadata.evaluatedResearch.overallScore === 'number');
          scriptingObservedResearchRevisedWorkPlan = metadata.evaluatedResearchRevisedWorkPlan ?? null;
          scriptingObservedHandoffReview = metadata.handoffReview ?? null;
          scriptingObservedResearchPackage = metadata.researchPackage ?? null;
          scriptingObservedStorytellingPlan = metadata.storytellingPlan ?? null;
          scriptingObservedProducerBrief = metadata.producerBrief ?? null;
          scriptingObservedProducerBriefSupport = metadata.producerBriefSupport ?? null;
          return {
            scriptTitle: 'Research-informed title',
            script: 'Opening Hook: Research-informed script output.'
          };
        }
      }
    },
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-002B',
    objective: 'Validate research handoff into storytelling',
    businessId: 'SYSTEM_INTERNAL'
  });

  assert.equal(result.state, MissionLifecycleStates.COMPLETED);
  assert.equal(typeof result.runtimeContext.artifacts.producerBrief, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.producerBrief.briefId, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.producerBrief.targetAudience, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.producerBrief.documentaryObjective, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.producerBrief.runtimeTargetSeconds, 'number');
  assert.equal(typeof researchObservedProducerBrief, 'object');
  assert.equal(typeof researchObservedProducerBriefSupport, 'string');
  assert.equal(researchObservedProducerBriefSupport.includes('Research alignment for'), true);
  assert.equal(typeof scriptingObservedProducerBrief, 'object');
  assert.equal(typeof scriptingObservedProducerBriefSupport, 'string');
  assert.equal(scriptingObservedProducerBriefSupport.includes('Storytelling alignment for'), true);
  assert.equal(scriptingObservedEvaluatedResearch, true);
  assert.equal(Array.isArray(scriptingObservedResearchRevisedWorkPlan), true);
  assert.equal(typeof scriptingObservedResearchPackage, 'object');
  assert.equal(Array.isArray(scriptingObservedResearchPackage.sourcesRejected), true);
  assert.equal(Array.isArray(scriptingObservedResearchPackage.sourcesAccepted), true);
  assert.equal(Array.isArray(scriptingObservedResearchPackage.topOpeningCandidates), true);
  assert.equal(Array.isArray(scriptingObservedResearchPackage.highestStoryValueFacts), true);
  assert.equal(typeof scriptingObservedResearchPackage.confidenceLevel, 'object');
  assert.equal(Array.isArray(scriptingObservedResearchPackage.outstandingResearchGaps), true);
  assert.equal(typeof scriptingObservedStorytellingPlan, 'object');
  assert.equal(typeof scriptingObservedStorytellingPlan.openingHook, 'object');
  assert.equal(Array.isArray(scriptingObservedStorytellingPlan.narrativeBeats), true);
  assert.equal(scriptingObservedStorytellingPlan.narrativeBeats.length >= 4, true);
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].beatObjective, 'string');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].audienceEmotion, 'string');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].curiosityObjective, 'string');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].visualObjective, 'string');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].narrationObjective, 'string');
  assert.equal(Array.isArray(scriptingObservedStorytellingPlan.narrativeBeats[0].supportingResearchFacts), true);
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].transitionIntoNextBeat, 'string');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].beatStartReason, 'string');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].objective, 'string');
  assert.equal(Array.isArray(scriptingObservedStorytellingPlan.narrativeBeats[0].supportingResearch), true);
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].transition, 'string');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].estimatedDurationSeconds, 'number');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].durationSeconds, 'number');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].duration, 'number');
  assert.equal(scriptingObservedStorytellingPlan.narrativeBeats[0].estimatedDurationSeconds >= 5, true);
  assert.equal(scriptingObservedStorytellingPlan.narrativeBeats[0].estimatedDurationSeconds <= 10, true);
  assert.equal(['major', 'minor'].includes(scriptingObservedStorytellingPlan.narrativeBeats[0].importance), true);
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].suggestedVisualType, 'string');
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeBeats[0].visualType, 'string');
  assert.equal(Array.isArray(scriptingObservedStorytellingPlan.researchGapsThatCouldWeakenStory), true);
  assert.equal(Array.isArray(scriptingObservedStorytellingPlan.sectionsRequiringAdditionalResearchBeforeScripting), true);
  assert.equal(typeof scriptingObservedStorytellingPlan.narrativeRiskAssessment, 'object');
  assert.equal(typeof scriptingObservedStorytellingPlan.recommendedDocumentaryStructure, 'object');
  assert.equal(typeof scriptingObservedStorytellingPlan.researchReasoningInfluence, 'object');
  assert.equal(Array.isArray(scriptingObservedStorytellingPlan.researchReasoningInfluence.decisionInfluence), true);
  assert.equal(typeof result.runtimeContext.artifacts.storytellingPlan, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.storytellingPlan.openingHook, 'object');
  assert.equal(Array.isArray(result.runtimeContext.artifacts.storytellingPlan.narrativeBeats), true);
  assert.equal(typeof result.runtimeContext.artifacts.storytellingPlan.researchReasoningInfluence, 'object');
  assert.equal(
    result.runtimeContext.events.some(event => event.type === 'STORYTELLING_PLAN_CREATED'),
    true
  );
  assert.equal(typeof scriptingObservedHandoffReview, 'object');
  assert.equal(typeof scriptingObservedHandoffReview.decision, 'string');
  assert.equal(['ACCEPT', 'ACCEPT_WITH_RECOMMENDATIONS', 'REQUEST_RESEARCH_REVISION'].includes(scriptingObservedHandoffReview.decision), true);
  assert.equal(Array.isArray(scriptingObservedHandoffReview.missingInformation), true);
  assert.equal(Array.isArray(scriptingObservedHandoffReview.weaknesses), true);
  assert.equal(Array.isArray(scriptingObservedHandoffReview.questions), true);
  assert.equal(Array.isArray(scriptingObservedHandoffReview.recommendedImprovements), true);
  assert.equal(typeof scriptingObservedHandoffReview.peerReview, 'object');
  assert.equal(Array.isArray(scriptingObservedHandoffReview.peerReview.factsLackingStoryValue), true);
  assert.equal(Array.isArray(scriptingObservedHandoffReview.peerReview.factsShouldBecomeOpeningCandidates), true);
  assert.equal(Array.isArray(scriptingObservedHandoffReview.peerReview.factsCreateCuriosity), true);
  assert.equal(Array.isArray(scriptingObservedHandoffReview.peerReview.factsShouldBeRemoved), true);
  assert.equal(Array.isArray(scriptingObservedHandoffReview.peerReview.additionalInformationNeeded), true);
  assert.equal(typeof scriptingObservedHandoffReview.structuredFeedback, 'object');
  assert.equal(scriptingObservedHandoffReview.structuredFeedback.coachingMode, true);
  assert.equal(
    result.runtimeContext.events.some(event => event.type === 'PRODUCER_BRIEF_CREATED'),
    true
  );
});

test('writer room runs at least one full revision cycle and keeps rewrites with the screenwriter', async () => {
  let reviewCallCount = 0;
  const scriptWorkerCallMetadata = [];
  const composerCallMetadata = [];

  const checklist = {
    openingHooksImmediately: true,
    productionNoteLines: [],
    repeatedIdeas: [],
    paragraphMomentum: 'Strong progression.',
    explainsInsteadOfDramatizes: false,
    narratorVoiceAuthentic: true,
    unnecessaryAbstractions: [],
    endingFeelsEarned: true,
    unforgettableIdea: 'A single institution was never the whole story.',
    weakestParagraphIndex: 1,
    weakestParagraphWhy: 'Needs tighter phrasing.'
  };

  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      ...createDeterministicWorkers(),
      scriptWorker: {
        async execute(assignment) {
          const metadata = assignment.result?.task?.metadata ?? {};
          scriptWorkerCallMetadata.push(metadata);

          return {
            scriptTitle: 'Writer Room Planning Draft',
            script: 'When the panic began, the market looked like it could contain the damage. The audience should see how quickly confidence broke.'
          };
        }
      },
      screenplayComposer: {
        async execute(assignment) {
          const metadata = assignment.result?.task?.metadata ?? {};
          composerCallMetadata.push(metadata);

          if (Array.isArray(metadata.revisionRequests) && metadata.revisionRequests.length > 0) {
            return {
              scriptTitle: 'Writer Room Revised Draft',
              script: `${metadata.previousComposedScript}\n\nRevision Applied: removed production-note language in paragraph ${metadata.revisionRequests[0].paragraphIndex}.`
            };
          }

          return {
            scriptTitle: 'Writer Room Composed Draft',
            script: String(metadata.planningScript ?? '')
          };
        }
      },
      executiveScriptEditor: {
        reviewScreenplay() {
          reviewCallCount += 1;

          if (reviewCallCount === 1) {
            return {
              approvalStatus: 'REVISION_REQUIRED',
              summary: 'Remove production-note language and preserve the opening hook.',
              strengths: ['Opening hook creates immediate tension.'],
              revisionRequests: [
                {
                  requestId: 'REV-001',
                  issueType: 'production-note-language',
                  paragraphIndex: 1,
                  priority: 'HIGH',
                  reason: 'Directive language breaks narrator voice.',
                  request: 'Rewrite sentence in pure narration voice.'
                }
              ],
              reviewChecklist: checklist,
              weakestParagraphIndex: 1,
              weakestParagraphWhy: 'Contains production-note phrasing.'
            };
          }

          return {
            approvalStatus: 'APPROVED_FOR_PRODUCTION',
            summary: 'Revision applied successfully and approved for production.',
            strengths: ['Opening hook remains strong after revision.'],
            revisionRequests: [],
            reviewChecklist: checklist,
            weakestParagraphIndex: 1,
            weakestParagraphWhy: 'No blocking weaknesses remain.'
          };
        },
        reviewAndRevise({ script }) {
          return {
            review: checklist,
            revisedScript: script
          };
        }
      }
    },
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-WRITERS-ROOM-001',
    objective: 'Validate iterative writers room workflow',
    businessId: 'SYSTEM_INTERNAL',
    stopAfterReleaseCandidate: true
  });

  assert.equal(result.state, MissionLifecycleStates.RC_PACKAGING);
  assert.equal(Array.isArray(result.runtimeContext.artifacts.writersRoomCycles), true);
  assert.equal(result.runtimeContext.artifacts.writersRoomCycles.length >= 2, true);
  assert.equal(result.runtimeContext.artifacts.writersRoomCycles[0].revisionRequestCount, 1);
  assert.equal(result.runtimeContext.artifacts.writersRoomCycles[1].revisionRequestCount, 0);
  assert.equal(typeof result.runtimeContext.artifacts.scriptFirstDraft?.script, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.scriptFinalDraft?.script, 'string');
  assert.equal(result.runtimeContext.artifacts.scriptFinalDraft.script.includes('Revision Applied:'), true);
  assert.equal(result.runtimeContext.artifacts.executiveScriptReview?.approvalStatus, 'APPROVED_FOR_PRODUCTION');
  assert.equal(result.runtimeContext.artifacts.executiveScriptReview?.executiveProducerCritique?.doesRewriteScript, false);
  assert.equal(typeof result.runtimeContext.artifacts.currentImprovementPlan, 'object');
  assert.equal(Array.isArray(result.runtimeContext.artifacts.improvementPlans), true);
  assert.equal(result.runtimeContext.artifacts.writersRoomCycles[0].prioritizedObjectiveCount >= 1, true);
  assert.equal(result.runtimeContext.artifacts.writersRoomCycles[0].prioritizedRevisionRequestCount <= 3, true);
  assert.equal(typeof result.runtimeContext.artifacts.writersRoomCycles[0].optimizationQuestion, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.writersRoomCycles[0].singleHighestImpactChange, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.writersRoomCycles[0].cycleScoreReport, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.writersRoomCycles[0].cycleScoreReport.newScore, 'number');
  assert.equal(Array.isArray(result.runtimeContext.artifacts.writersRoomCycles[0].cycleScoreReport.unresolvedObjectives), true);
  assert.equal(
    result.runtimeContext.artifacts.writersRoomCycles[0].prioritizedRevisionRequestCount
      + result.runtimeContext.artifacts.writersRoomCycles[0].strategicObjectiveRequestCount >= 1,
    true
  );
  const firstCycleWriterResponse = result.runtimeContext.artifacts.writersRoomCycles?.[0]?.writerResponse?.[0] ?? null;
  assert.equal(
    ['EDIT', 'REWRITE'].includes(
      String(firstCycleWriterResponse?.revisionMode ?? '')
    ),
    true
  );

  const revisionCalls = scriptWorkerCallMetadata.filter(metadata => Array.isArray(metadata.revisionRequests) && metadata.revisionRequests.length > 0);
  assert.equal(revisionCalls.length, 0);
  const composerRevisionCalls = composerCallMetadata.filter(metadata => Array.isArray(metadata.revisionRequests) && metadata.revisionRequests.length > 0);
  assert.equal(composerRevisionCalls.length >= 1, true);
});

test('runtime blocks before storytelling when research dossier is insufficient', async () => {
  let scriptWorkerCalled = false;

  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      ...createDeterministicWorkers(),
      researchWorker: {
        async execute(assignment) {
          return {
            taskId: assignment.taskId,
            status: 'COMPLETED',
            findings: [
              {
                id: 'FINDING-001',
                claim: 'Single weak claim with limited corroboration.',
                evidenceType: 'DOCUMENTED_SOURCE',
                confidence: 'LOW'
              }
            ],
            report: {
              executiveSummary: 'Insufficient dossier sample.',
              providers: [
                {
                  provider: 'Low Coverage Source',
                  status: 'success',
                  response: { sourceType: 'unknown' },
                  error: null
                }
              ],
              findings: [
                {
                  id: 'FINDING-001',
                  summary: 'Single weak claim with limited corroboration.'
                }
              ]
            }
          };
        }
      },
      scriptWorker: {
        async execute() {
          scriptWorkerCalled = true;
          return {
            scriptTitle: 'Should not be generated',
            script: 'This should not run when research is insufficient.'
          };
        }
      }
    },
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-RESEARCH-BLOCK',
    objective: 'Ensure storytelling never receives incomplete research package',
    businessId: 'SYSTEM_INTERNAL'
  });

  assert.equal(result.state, MissionLifecycleStates.BLOCKED);
  assert.equal(result.runtimeContext.terminalMissionOutcome, 'RESEARCH INSUFFICIENT');
  assert.equal(scriptWorkerCalled, false);
  assert.equal(result.runtimeContext.artifacts.researchGate.status, 'RESEARCH INSUFFICIENT');
  assert.equal(Array.isArray(result.runtimeContext.artifacts.researchGate.unmetRequirements), true);
  assert.equal(result.runtimeContext.artifacts.researchGate.unmetRequirements.length > 0, true);
});

test('narrative beat target count follows documentary density pacing', () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers()
  });

  const reflectiveCount = orchestrator.resolveNarrativeBeatTargetCount({
    request: {
      targetDuration: 360,
      emotionalTarget: 'reflective documentary analysis'
    }
  });
  const highTensionCount = orchestrator.resolveNarrativeBeatTargetCount({
    request: {
      targetDuration: 360,
      emotionalTarget: 'urgent high-stakes tension and escalation'
    }
  });

  assert.equal(reflectiveCount >= 36, true);
  assert.equal(reflectiveCount <= 72, true);
  assert.equal(highTensionCount >= 36, true);
  assert.equal(highTensionCount <= 72, true);
  assert.equal(highTensionCount > reflectiveCount, true);
});

test('storytelling performs iterative self-rewrite and forwards highest-scoring script downstream', async () => {
  let storytellingEvaluationCalls = 0;
  let observedVisualScriptSummary = null;

  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      ...createDeterministicWorkers(),
      scriptWorker: {
        async execute() {
          return {
            scriptTitle: 'Iterative Rewrite Script',
            script: [
              'Scene one opens the unresolved mystery.',
              'Scene two gives the answer too early.',
              'Scene three closes quietly.'
            ].join('\n')
          };
        }
      },
      imageWorker: {
        async execute(assignment) {
          observedVisualScriptSummary = assignment.result?.task?.metadata?.evaluatedVisualPlan?.scriptSummary ?? null;
          return {
            imageFiles: ['/tmp/op2-image-01.png', '/tmp/op2-image-02.png']
          };
        }
      }
    },
    storytellingEvaluator: {
      evaluate() {
        storytellingEvaluationCalls += 1;

        if (storytellingEvaluationCalls === 1) {
          return {
            scores: {
              openingStrength: 7,
              curiosity: 5,
              narrativeFlow: 6,
              informationDensity: 6,
              audienceCommitment: 6
            },
            overallScore: 6.2,
            classification: 'CONDITIONAL',
            improvementRecommendations: [
              'Rewrite SCENE-002: Move the reveal later and rebuild tension.'
            ],
            revisedWorkPlan: ['Revise SCENE-002'],
            curiosityEngineeringReasoning: {
              sectionsShouldBeRewritten: [{ sceneId: 'SCENE-002', rewriteReason: 'Reveal is too early.' }],
              revealsTooEarly: [{ sceneId: 'SCENE-002', reason: 'Answer appears before tension builds.' }],
              questionsShouldBeIntroduced: [{ sceneId: 'SCENE-002', reason: 'Add an unresolved guiding question.' }],
              sceneMostLikelyToLoseAudience: { sceneId: 'SCENE-002', reason: 'Low curiosity retention.' }
            }
          };
        }

        if (storytellingEvaluationCalls === 2) {
          return {
            scores: {
              openingStrength: 7,
              curiosity: 9,
              narrativeFlow: 8,
              informationDensity: 7,
              audienceCommitment: 8
            },
            overallScore: 8.6,
            classification: 'PASS',
            improvementRecommendations: [
              'Rewrite SCENE-003: Add stronger unresolved continuation pressure.'
            ],
            revisedWorkPlan: ['Revise SCENE-003'],
            curiosityEngineeringReasoning: {
              sectionsShouldBeRewritten: [{ sceneId: 'SCENE-003', rewriteReason: 'Ending lacks continuation pressure.' }],
              revealsTooEarly: [],
              questionsShouldBeIntroduced: [{ sceneId: 'SCENE-003', reason: 'Add a final unresolved question.' }],
              sceneMostLikelyToLoseAudience: { sceneId: 'SCENE-003', reason: 'Ending momentum can still improve.' }
            }
          };
        }

        return {
          scores: {
            openingStrength: 7,
            curiosity: 8,
            narrativeFlow: 8,
            informationDensity: 7,
            audienceCommitment: 8
          },
          overallScore: 8.5,
          classification: 'PASS',
          improvementRecommendations: [],
          revisedWorkPlan: [],
          curiosityEngineeringReasoning: {
            sectionsShouldBeRewritten: [],
            revealsTooEarly: [],
            questionsShouldBeIntroduced: [],
            sceneMostLikelyToLoseAudience: null
          }
        };
      }
    },
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-002B-ITERATIVE',
    objective: 'Validate storytelling iterative rewrite loop',
    businessId: 'SYSTEM_INTERNAL',
    storytellingIterationConfig: {
      targetScore: 9,
      minimumImprovementThreshold: 0.2,
      maxIterations: 4
    }
  });

  assert.equal(result.state, MissionLifecycleStates.COMPLETED);
  assert.equal(storytellingEvaluationCalls >= 3, true);
  assert.equal(result.runtimeContext.artifacts.storytellingEvaluation.overallScore, 8.6);
  assert.equal(result.runtimeContext.artifacts.storytellingEvaluation.iterativeRewrite.selectedIteration, 2);
  assert.equal(result.runtimeContext.artifacts.storytellingEvaluation.iterativeRewrite.completedIterations, 3);
  assert.equal(Array.isArray(result.runtimeContext.artifacts.storytellingIterations), true);
  assert.equal(result.runtimeContext.artifacts.storytellingIterations.length, 3);
  assert.equal(Array.isArray(result.runtimeContext.artifacts.storytellingIterations[1].rewrittenSections), true);
  assert.equal(result.runtimeContext.artifacts.storytellingIterations[1].rewrittenSections.includes('SCENE-002'), true);
  assert.equal(result.runtimeContext.artifacts.storytellingIterations[2].rewrittenSections.includes('SCENE-003'), true);
  assert.equal(
    result.runtimeContext.artifacts.script.script.includes('Scene three closes quietly. The stakes rise as new evidence challenges the obvious conclusion.'),
    false
  );
  assert.equal(
    result.runtimeContext.artifacts.script.script.includes('But what are we still missing?'),
    true
  );
  assert.equal(typeof observedVisualScriptSummary, 'string');
  assert.equal(
    observedVisualScriptSummary.includes('Scene three closes quietly. The stakes rise as new evidence challenges the obvious conclusion.'),
    false
  );
});

test('image generation receives evaluated visual plan instead of raw scene request', async () => {
  let observedEvaluatedVisualPlan = null;
  let observedVisualRevisedWorkPlan = null;
  let observedHandoffReview = null;
  let observedProducerBrief = null;
  let observedProducerBriefSupport = null;

  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      ...createDeterministicWorkers(),
      imageWorker: {
        async execute(assignment) {
          observedEvaluatedVisualPlan = assignment.result?.task?.metadata?.evaluatedVisualPlan ?? null;
          observedVisualRevisedWorkPlan = assignment.result?.task?.metadata?.visualRevisedWorkPlan ?? null;
          observedHandoffReview = assignment.result?.task?.metadata?.handoffReview ?? null;
          observedProducerBrief = assignment.result?.task?.metadata?.producerBrief ?? null;
          observedProducerBriefSupport = assignment.result?.task?.metadata?.producerBriefSupport ?? null;
          return {
            imageFiles: ['/tmp/op2-image-01.png', '/tmp/op2-image-02.png']
          };
        }
      }
    },
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-002C',
    objective: 'Validate visual evaluator handoff',
    businessId: 'SYSTEM_INTERNAL',
    sceneDescription: 'Wide shot of archival room with foreground evidence table.',
    artStyle: 'Cinematic documentary realism'
  });

  assert.equal(result.state, MissionLifecycleStates.COMPLETED);
  assert.equal(typeof observedEvaluatedVisualPlan, 'object');
  assert.equal(typeof observedEvaluatedVisualPlan.evaluation.overallScore, 'number');
  assert.equal(typeof observedEvaluatedVisualPlan.producerBrief, 'object');
  assert.equal(typeof observedEvaluatedVisualPlan.producerBriefSupport, 'string');
  assert.equal(Array.isArray(observedVisualRevisedWorkPlan), true);
  assert.equal(typeof observedHandoffReview, 'object');
  assert.equal(typeof observedHandoffReview.decision, 'string');
  assert.equal(Array.isArray(observedHandoffReview.recommendedImprovements), true);
  assert.equal(typeof observedProducerBrief, 'object');
  assert.equal(typeof observedProducerBriefSupport, 'string');
  assert.equal(observedProducerBriefSupport.includes('Visual alignment for'), true);
  assert.equal(typeof result.runtimeContext.artifacts.visualEvaluation.overallScore, 'number');
});

test('runtime stores all configured adjacent handoff reviews', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-002F',
    objective: 'Validate adjacent handoff review coverage',
    businessId: 'SYSTEM_INTERNAL'
  });

  const handoffReviews = result.runtimeContext.artifacts.handoffReviews;

  assert.equal(typeof handoffReviews, 'object');
  assert.equal(typeof handoffReviews.researchToStorytelling, 'object');
  assert.equal(typeof handoffReviews.storytellingToVisualDirector, 'object');
  assert.equal(typeof handoffReviews.visualDirectorToImageGeneration, 'object');
  assert.equal(typeof handoffReviews.researchToStorytelling.decision, 'string');
  assert.equal(typeof handoffReviews.storytellingToVisualDirector.decision, 'string');
  assert.equal(typeof handoffReviews.visualDirectorToImageGeneration.decision, 'string');
});

test('voice generation receives evaluated narration plan instead of raw narration text', async () => {
  let observedEvaluatedNarrationPlan = null;
  let observedNarrationRevisedWorkPlan = null;
  let observedProducerBrief = null;
  let observedProducerBriefSupport = null;

  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      ...createDeterministicWorkers(),
      voiceWorker: {
        async execute(assignment) {
          observedEvaluatedNarrationPlan = assignment.result?.task?.metadata?.evaluatedNarrationPlan ?? null;
          observedNarrationRevisedWorkPlan = assignment.result?.task?.metadata?.narrationRevisedWorkPlan ?? null;
          observedProducerBrief = assignment.result?.task?.metadata?.producerBrief ?? null;
          observedProducerBriefSupport = assignment.result?.task?.metadata?.producerBriefSupport ?? null;
          return {
            audioFile: '/tmp/op2-voice.wav'
          };
        }
      }
    },
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-002D',
    objective: 'Validate narration evaluator handoff',
    businessId: 'SYSTEM_INTERNAL',
    voiceStyle: 'Documentary conversational dramatic'
  });

  assert.equal(result.state, MissionLifecycleStates.COMPLETED);
  assert.equal(typeof observedEvaluatedNarrationPlan, 'object');
  assert.equal(typeof observedEvaluatedNarrationPlan.evaluation.overallScore, 'number');
  assert.equal(typeof observedEvaluatedNarrationPlan.producerBrief, 'object');
  assert.equal(typeof observedEvaluatedNarrationPlan.producerBriefSupport, 'string');
  assert.equal(Array.isArray(observedNarrationRevisedWorkPlan), true);
  assert.equal(typeof observedProducerBrief, 'object');
  assert.equal(typeof observedProducerBriefSupport, 'string');
  assert.equal(observedProducerBriefSupport.includes('Narration alignment for'), true);
  assert.equal(typeof result.runtimeContext.artifacts.narrationEvaluation.overallScore, 'number');
});

test('video assembly receives evaluated image package after image generation', async () => {
  let observedEvaluatedImagePackage = null;
  let observedImageGenerationRevisedWorkPlan = null;

  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      ...createDeterministicWorkers(),
      imageWorker: {
        async execute() {
          return {
            imageFiles: ['/tmp/op2-image-01.png', '/tmp/op2-image-02.png'],
            generatedScenes: ['scene-a', 'scene-b']
          };
        }
      },
      videoWorker: {
        async execute(assignment) {
          observedEvaluatedImagePackage = assignment.result?.task?.metadata?.evaluatedImagePackage ?? null;
          observedImageGenerationRevisedWorkPlan = assignment.result?.task?.metadata?.imageGenerationRevisedWorkPlan ?? null;
          return {
            videoFile: '/tmp/op2-video.mp4',
            status: 'COMPLETED'
          };
        }
      }
    },
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-002E',
    objective: 'Validate image package handoff to video assembly',
    businessId: 'SYSTEM_INTERNAL',
    artStyle: 'Cinematic documentary realism'
  });

  assert.equal(result.state, MissionLifecycleStates.COMPLETED);
  assert.equal(typeof observedEvaluatedImagePackage, 'object');
  assert.equal(typeof observedEvaluatedImagePackage.evaluation.overallScore, 'number');
  assert.equal(Array.isArray(observedImageGenerationRevisedWorkPlan), true);
  assert.equal(typeof result.runtimeContext.artifacts.imageGenerationEvaluation.overallScore, 'number');
});

test('stopAfterReleaseCandidate exits immediately after rc package creation', async () => {
  let publishingCalls = 0;
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    },
    publishingWorker: {
      async execute() {
        publishingCalls += 1;
        throw new Error('Publishing should not be reached when stopAfterReleaseCandidate is enabled.');
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-002A',
    objective: 'Validate RC-only mission stop',
    businessId: 'SYSTEM_INTERNAL',
    publishingMode: 'PRIVATE',
    stopAfterReleaseCandidate: true
  });

  assert.equal(result.state, MissionLifecycleStates.RC_PACKAGING);
  assert.equal(result.runtimeContext.terminalMissionOutcome, 'RELEASE_CANDIDATE_CREATED');
  assert.equal(typeof result.runtimeContext.artifacts.releaseCandidatePackage, 'object');
  assert.equal(typeof result.runtimeContext.artifacts.releaseCandidatePackagePath, 'string');
  assert.equal(typeof result.runtimeContext.artifacts.executiveImprovementReport, 'object');
  assert.equal(result.runtimeContext.artifacts.executiveImprovementReport.reportType, 'Executive Improvement Report');
  assert.equal(typeof result.runtimeContext.artifacts.executiveImprovementReportPath, 'string');
  assert.equal(Array.isArray(result.runtimeContext.artifacts.executiveImprovementReport.recommendations), true);
  assert.equal(result.runtimeContext.artifacts.executiveImprovementReport.recommendations.length >= 6, true);
  assert.equal(
    result.runtimeContext.artifacts.executiveImprovementReport.recommendations.every(recommendation => /^BEAT-\d{3}$/.test(String(recommendation.beatId))),
    true
  );
  assert.equal(typeof result.runtimeContext.artifacts.publishDecisionReport, 'object');
  assert.equal(result.runtimeContext.artifacts.publishDecisionReport.reportType, 'Publish Decision Report');
  assert.equal(
    ['PUBLISH', 'REVISE', 'REJECT'].includes(result.runtimeContext.artifacts.publishDecisionReport.decision),
    true
  );
  assert.equal(typeof result.runtimeContext.artifacts.publishDecisionReportPath, 'string');
  assert.equal(result.runtimeContext.artifacts.publishDecisionReport.executionPolicy.autoPublish, false);
  assert.equal(result.runtimeContext.artifacts.publishDecisionReport.executionPolicy.autoRevise, false);
  assert.equal(result.runtimeContext.artifacts.executiveReport, undefined);
  assert.equal(typeof result.runtimeContext.artifacts.executiveReportPath, 'string');
  assert.equal(result.runtimeContext.artifacts.publishing.status, 'STOPPED_AFTER_RELEASE_CANDIDATE');
  assert.equal(existsSync(result.runtimeContext.artifacts.releaseCandidatePackagePath), true);
  assert.equal(existsSync(result.runtimeContext.artifacts.executiveReportPath), true);
  assert.equal(existsSync(result.runtimeContext.artifacts.executiveImprovementReportPath), true);
  assert.equal(existsSync(result.runtimeContext.artifacts.publishDecisionReportPath), true);
  assert.equal(publishingCalls, 0);
});

test('lessons learned and knowledge candidates are produced', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-003',
    objective: 'Validate lessons and knowledge generation',
    businessId: 'SYSTEM_INTERNAL'
  });

  assert.equal(Array.isArray(result.runtimeContext.artifacts.lessonsLearned), true);
  assert.equal(result.runtimeContext.artifacts.lessonsLearned.length > 0, true);
  assert.equal(Array.isArray(result.runtimeContext.artifacts.knowledgeCandidates), true);
  assert.equal(result.runtimeContext.artifacts.knowledgeCandidates.length > 0, true);
});

test('invalid transition is blocked by guard', () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers()
  });
  const runtimeContext = orchestrator.createRuntimeContext({
    requestId: 'REQ-RUNTIME-004',
    objective: 'Transition guard test',
    businessId: 'SYSTEM_INTERNAL'
  });

  assert.throws(
    () => orchestrator.transitionTo(runtimeContext, MissionLifecycleStates.QUALITY_REVIEW),
    /Invalid state transition/
  );
});

test('ceo approve decision continues runtime to completion', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-005',
    objective: 'CEO approval flow',
    businessId: 'SYSTEM_INTERNAL',
    ceoDecision: 'APPROVE'
  });

  assert.equal(result.state, MissionLifecycleStates.COMPLETED);
  assert.equal(result.runtimeContext.stageAttempts[MissionLifecycleStates.CEO_APPROVED] > 0, true);
});

test('ceo revision decision ends mission in revision state', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-006',
    objective: 'CEO revision flow',
    businessId: 'SYSTEM_INTERNAL',
    ceoDecision: 'RETURN_FOR_REVISION'
  });

  assert.equal(result.state, MissionLifecycleStates.CEO_REVISION);
  assert.equal(result.runtimeContext.artifacts.publishing.publishStatus, 'NOT_REQUESTED');
});

test('ceo reject decision ends mission in rejected state', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-007',
    objective: 'CEO reject flow',
    businessId: 'SYSTEM_INTERNAL',
    ceoDecision: 'REJECT'
  });

  assert.equal(result.state, MissionLifecycleStates.CEO_REJECTED);
  assert.equal(result.runtimeContext.artifacts.publishing.publishStatus, 'NOT_REQUESTED');
});

test('publishing executes only after approval when policy enables it', async () => {
  let publishingCalls = 0;
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    },
    publishingWorker: {
      async execute() {
        publishingCalls += 1;
        return {
          publishStatus: 'SCHEDULED',
          publishId: 'PUBLISH-001',
          publishUrl: 'https://publish.placeholder/youtube/publish-001',
          videoId: 'VIDEO-001'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-008',
    objective: 'Publish after approval flow',
    businessId: 'SYSTEM_INTERNAL',
    publishingMode: 'PRIVATE',
    ceoDecision: 'APPROVE'
  });

  assert.equal(result.state, MissionLifecycleStates.COMPLETED);
  assert.equal(publishingCalls, 1);
  assert.equal(result.runtimeContext.artifacts.publishing.publishStatus, 'SCHEDULED');
});

test('canonical stage ordering enforces report before council and lessons before knowledge', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-009',
    objective: 'Canonical stage ordering',
    businessId: 'SYSTEM_INTERNAL',
    ceoDecision: 'APPROVE'
  });

  const history = result.runtimeContext.runtimeDiagnostics.runtimeStageHistory;
  const stageOrder = history.map(record => record.stage);

  assert.equal(stageOrder.indexOf(MissionLifecycleStates.RC_PACKAGING) < stageOrder.indexOf(MissionLifecycleStates.EXECUTIVE_REPORTING), true);
  assert.equal(stageOrder.indexOf(MissionLifecycleStates.EXECUTIVE_REPORTING) < stageOrder.indexOf(MissionLifecycleStates.EXECUTIVE_REVIEW), true);
  assert.equal(stageOrder.indexOf(MissionLifecycleStates.CEO_DECISION_PENDING) < stageOrder.indexOf(MissionLifecycleStates.LESSON_CAPTURE), true);
  assert.equal(stageOrder.indexOf(MissionLifecycleStates.LESSON_CAPTURE) < stageOrder.indexOf(MissionLifecycleStates.KNOWLEDGE_CANDIDATE_CAPTURE), true);
  assert.equal(typeof result.runtimeContext.terminalMissionOutcome, 'string');
  assert.equal(result.runtimeContext.terminalMissionOutcome.length > 0, true);
});

test('stage dependency failure is recorded in runtime diagnostics history', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers()
  });
  const runtimeContext = orchestrator.createRuntimeContext({
    requestId: 'REQ-RUNTIME-010',
    objective: 'Dependency failure diagnostics',
    businessId: 'SYSTEM_INTERNAL'
  });

  await assert.rejects(
    async () => orchestrator.executeStage({
      runtimeContext,
      stage: MissionLifecycleStates.EXECUTIVE_REVIEW,
      dependencies: ['executiveReport'],
      action: async () => {}
    }),
    /Stage dependency failure/
  );

  const history = runtimeContext.runtimeDiagnostics.runtimeStageHistory;
  const entry = history.find(record => record.stage === MissionLifecycleStates.EXECUTIVE_REVIEW);

  assert.equal(Boolean(entry), true);
  assert.equal(entry.stageDependenciesSatisfied, false);
  assert.equal(entry.stageOutcome, 'FAILED');
});

test('runtime diagnostics history captures stage timing and outcome fields', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: createDeterministicWorkers(),
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-011',
    objective: 'Stage diagnostics fields',
    businessId: 'SYSTEM_INTERNAL',
    ceoDecision: 'APPROVE'
  });

  const history = result.runtimeContext.runtimeDiagnostics.runtimeStageHistory;
  assert.equal(Array.isArray(history), true);
  assert.equal(history.length > 0, true);

  history.forEach(entry => {
    assert.equal(typeof entry.stage, 'string');
    assert.equal(typeof entry.stageStartTime, 'string');
    assert.equal(typeof entry.stageEndTime, 'string');
    assert.equal(typeof entry.stageDuration, 'number');
    assert.equal(entry.stageDuration >= 0, true);
    assert.equal(typeof entry.stageOutcome, 'string');
    assert.equal(typeof entry.stageDependenciesSatisfied, 'boolean');
  });
});

test('placeholder images block rendering for production missions', async () => {
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      scriptWorker: {
        async execute() {
          return {
            scriptTitle: 'Operation Title',
            script: 'Opening Hook: Atlas mission runtime orchestrator test script.'
          };
        }
      },
      voiceWorker: {
        async execute() {
          const { audioFile } = createValidProductionAssets({ suffix: 'placeholder-images-voice' });
          return { audioFile };
        }
      },
      imageWorker: {
        async execute() {
          return {
            imageFiles: ['/tmp/image-failed-cinematic-illustration-scene-01.png']
          };
        }
      },
      videoWorker: {
        async execute() {
          return {
            videoFile: '/tmp/should-not-run.mp4',
            status: 'COMPLETED'
          };
        }
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-012',
    objective: 'Placeholder image integrity block',
    businessId: 'MIDNIGHT_ARCHIVES'
  });

  assert.equal(result.state, MissionLifecycleStates.BLOCKED);
  assert.equal(result.runtimeContext.terminalMissionOutcome, 'ARTIFACT_INTEGRITY_BLOCKED');
  assert.equal(result.runtimeContext.artifacts.releaseCandidatePackage, undefined);
  assert.equal(result.runtimeContext.artifacts.qualityReview.passed, false);
  assert.equal(
    result.runtimeContext.artifacts.artifactIntegrity.issues.some(issue => issue.code === 'IMAGE_PLACEHOLDER_DETECTED'),
    true
  );
});

test('placeholder video blocks rc creation for production missions', async () => {
  const { root, audioFile, imageFiles } = createValidProductionAssets({ suffix: 'placeholder-video' });
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      scriptWorker: {
        async execute() {
          return {
            scriptTitle: 'Operation Title',
            script: 'Opening Hook: Atlas mission runtime orchestrator test script.'
          };
        }
      },
      voiceWorker: {
        async execute() {
          return { audioFile };
        }
      },
      imageWorker: {
        async execute() {
          return {
            imageFiles
          };
        }
      },
      videoWorker: {
        async execute() {
          return {
            videoFile: join(root, 'video-failed-1920x1080-scene.txt'),
            status: 'BLOCKED'
          };
        }
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-013',
    objective: 'Placeholder video integrity block',
    businessId: 'MIDNIGHT_ARCHIVES'
  });

  assert.equal(result.state, MissionLifecycleStates.BLOCKED);
  assert.equal(result.runtimeContext.artifacts.releaseCandidatePackage, undefined);
  assert.equal(
    result.runtimeContext.artifacts.artifactIntegrity.issues.some(issue => issue.code === 'VIDEO_PLACEHOLDER_DETECTED'),
    true
  );

  rmSync(root, { recursive: true, force: true });
});

test('missing mp4 cannot receive a passing quality score', async () => {
  const { root, audioFile, imageFiles } = createValidProductionAssets({ suffix: 'missing-mp4' });
  const orchestrator = new MissionRuntimeOrchestrator({
    workers: {
      scriptWorker: {
        async execute() {
          return {
            scriptTitle: 'Operation Title',
            script: 'Opening Hook: Atlas mission runtime orchestrator test script.'
          };
        }
      },
      voiceWorker: {
        async execute() {
          return { audioFile };
        }
      },
      imageWorker: {
        async execute() {
          return {
            imageFiles
          };
        }
      },
      videoWorker: {
        async execute() {
          return {
            videoFile: join(root, 'missing-video.mp4'),
            status: 'COMPLETED'
          };
        }
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-014',
    objective: 'Missing mp4 quality block',
    businessId: 'MIDNIGHT_ARCHIVES'
  });

  assert.equal(result.state, MissionLifecycleStates.BLOCKED);
  assert.equal(result.runtimeContext.artifacts.qualityReview.passed, false);
  assert.equal(result.runtimeContext.artifacts.releaseCandidatePackage, undefined);
  assert.equal(
    result.runtimeContext.artifacts.artifactIntegrity.issues.some(issue => issue.code === 'VIDEO_NOT_FOUND'),
    true
  );

  rmSync(root, { recursive: true, force: true });
});

test('valid image audio mp4 set proceeds normally for production missions', async () => {
  const { root, audioFile, imageFiles, videoFile } = createValidProductionAssets({ suffix: 'valid-production' });
  let qualityInvocations = 0;
  const orchestrator = new MissionRuntimeOrchestrator({
    qualityIntelligenceEngine: {
      review() {
        qualityInvocations += 1;
        return {
          overallScore: 96,
          reviewDecision: 'PASS',
          issues: [],
          recommendations: [],
          executiveSummary: 'Playable media validated.'
        };
      }
    },
    workers: {
      scriptWorker: {
        async execute() {
          return {
            scriptTitle: 'Operation Title',
            script: 'Opening Hook: Atlas mission runtime orchestrator test script.'
          };
        }
      },
      voiceWorker: {
        async execute() {
          return { audioFile };
        }
      },
      imageWorker: {
        async execute() {
          return {
            imageFiles
          };
        }
      },
      videoWorker: {
        async execute() {
          return {
            videoFile,
            status: 'COMPLETED',
            duration: '2 seconds'
          };
        }
      }
    }
  });

  const result = await orchestrator.runMission({
    requestId: 'REQ-RUNTIME-015',
    objective: 'Valid production artifact flow',
    businessId: 'MIDNIGHT_ARCHIVES',
    stopAfterReleaseCandidate: true
  });

  assert.equal(result.state, MissionLifecycleStates.RC_PACKAGING);
  assert.equal(qualityInvocations, 1);
  assert.equal(result.runtimeContext.artifacts.qualityReview.passed, true);
  assert.equal(result.runtimeContext.artifacts.qualityReview.executiveRecommendation, 'APPROVE_FOR_RELEASE');
  assert.equal(typeof result.runtimeContext.artifacts.releaseCandidatePackage, 'object');

  rmSync(root, { recursive: true, force: true });
});
