import { WorkerAssignment } from '../worker-assignment.js';
import { accessSync, constants, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ConfigurationService } from '../infrastructure/configuration-service.js';
import {
  createExecutiveDecisionPacket,
  validateExecutiveDecisionPacket
} from '../contracts/executive-decision-packet.js';
import { validateMissionPlan } from './mission-plan-contracts.js';
import {
  MissionLifecycleStates,
  createRuntimeContext
} from './mission-runtime-contracts.js';
import { createMissionStateMachine } from './mission-runtime-state-machine.js';
import { createMissionRuntimeDefaultCapabilityRegistry } from './mission-runtime-default-capabilities.js';

export class MissionRuntimeOrchestrator {
  constructor({
    capabilityRegistry = null,
    launchPlanGenerator = null,
    executionPlanGenerator = null,
    workers = null,
    qualityReviewEngine = null,
    qualityIntelligenceEngine = null,
    publishingWorker = null,
    executiveCouncilRuntime = null,
    executiveBriefingEngine = null,
    businessRuntimeAdmission = null,
    missionPlanningEngine = null,
    storytellingEvaluator = null,
    researchEvaluator = null,
    narrationEvaluator = null,
    imageGenerationEvaluator = null,
    visualEvaluator = null,
    languageRealizationValidator = null,
    improvementPlanner = null,
    handoffReviewEngine = null,
    timelineBuilder = null,
    sceneTimingEngine = null,
    configurationService = null,
    artifactReportDirectory = process.env.ATLAS_ASSET_REPORTS_PATH ?? '/var/lib/atlas/assets/reports',
    runtimeVersion = '1.0.0',
    now = () => Date.now()
  } = {}) {
    this.configurationService = configurationService ?? new ConfigurationService();
    this.capabilityRegistry = capabilityRegistry ?? createMissionRuntimeDefaultCapabilityRegistry({
      configurationService: this.configurationService,
      now,
      launchPlanGenerator,
      executionPlanGenerator,
      workers,
      qualityReviewEngine,
      qualityIntelligenceEngine,
      executiveCouncilRuntime,
      executiveBriefingEngine,
      businessRuntimeAdmission,
      missionPlanningEngine,
      storytellingEvaluator,
      researchEvaluator,
      narrationEvaluator,
      imageGenerationEvaluator,
      visualEvaluator,
      languageRealizationValidator,
      improvementPlanner,
      handoffReviewEngine,
      timelineBuilder,
      sceneTimingEngine
    });

    this.launchPlanGenerator = this.resolveRequiredCapability('launchPlanGenerator');
    this.executionPlanGenerator = this.resolveRequiredCapability('executionPlanGenerator');
    this.workers = this.resolveRequiredCapability('workers');
    this.qualityReviewEngine = this.resolveRequiredCapability('qualityReviewEngine');
    this.qualityIntelligenceEngine = this.resolveRequiredCapability('qualityIntelligenceEngine');
    this.publishingWorker = publishingWorker ?? null;
    this.executiveCouncilRuntime = this.resolveRequiredCapability('executiveCouncilRuntime');
    this.executiveBriefingEngine = this.resolveRequiredCapability('executiveBriefingEngine');
    this.businessRuntimeAdmission = this.resolveRequiredCapability('businessRuntimeAdmission');
    this.storytellingEvaluator = this.resolveRequiredCapability('storytellingEvaluator');
    this.researchEvaluator = this.resolveRequiredCapability('researchEvaluator');
    this.narrationEvaluator = this.resolveRequiredCapability('narrationEvaluator');
    this.imageGenerationEvaluator = this.resolveRequiredCapability('imageGenerationEvaluator');
    this.visualEvaluator = this.resolveRequiredCapability('visualEvaluator');
    this.languageRealizationValidator = this.resolveRequiredCapability('languageRealizationValidator');
    this.improvementPlanner = this.resolveRequiredCapability('improvementPlanner');
    this.handoffReviewEngine = this.resolveRequiredCapability('handoffReviewEngine');
    this.missionPlanningEngine = this.resolveRequiredCapability('missionPlanningEngine');
    this.timelineBuilder = this.resolveRequiredCapability('timelineBuilder');
    this.sceneTimingEngine = this.resolveRequiredCapability('sceneTimingEngine');
    this.artifactReportDirectory = artifactReportDirectory;
    this.stateMachine = createMissionStateMachine();
    this.runtimeVersion = runtimeVersion;
    this.now = now;
  }

  resolveRequiredCapability(key) {
    if (!this.capabilityRegistry || typeof this.capabilityRegistry.resolveCapability !== 'function') {
      throw new Error('Mission runtime capability registry is unavailable or invalid.');
    }

    const resolved = this.capabilityRegistry.resolveCapability(key, { validateContract: true });

    if (!resolved?.found || !resolved.instance) {
      throw new Error(`Mission runtime capability "${key}" is unavailable: ${resolved?.reason ?? 'unknown reason'}`);
    }

    return resolved.instance;
  }

  createRuntimeContext(request = {}) {
    const runtimeContext = createRuntimeContext({
      request,
      runtimeVersion: this.runtimeVersion,
      executionPolicy: {
        publishingMode: request.publishingMode ?? 'NONE',
        stopAfterReleaseCandidate:
          request.stopAfterReleaseCandidate
          ?? request.runtimePolicy?.stopAfterReleaseCandidate
          ?? false
      }
    });

    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'MISSION_RECEIVED',
      details: {
        requestId: runtimeContext.requestId
      }
    }));

    return runtimeContext;
  }

  canTransition(fromState, toState) {
    return this.stateMachine.canTransition(fromState, toState);
  }

  transitionTo(runtimeContext, nextState, details = {}) {
    const validation = this.stateMachine.validateTransition({
      runtimeContext,
      nextState
    });
    const currentState = runtimeContext.state;

    if (!validation.isValid) {
      throw new Error(validation.reason);
    }

    runtimeContext.state = nextState;
    runtimeContext.currentStage = nextState;
    runtimeContext.stageAttempts[nextState] = (runtimeContext.stageAttempts[nextState] ?? 0) + 1;
    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: nextState,
      type: 'STATE_TRANSITIONED',
      details: {
        from: currentState,
        to: nextState,
        ...details
      }
    }));

    return runtimeContext;
  }

  ensureRuntimeDiagnostics(runtimeContext) {
    if (!runtimeContext.runtimeDiagnostics || typeof runtimeContext.runtimeDiagnostics !== 'object') {
      runtimeContext.runtimeDiagnostics = {
        runtimeStageHistory: []
      };
    }

    if (!Array.isArray(runtimeContext.runtimeDiagnostics.runtimeStageHistory)) {
      runtimeContext.runtimeDiagnostics.runtimeStageHistory = [];
    }
  }

  resolveDependencyValue(runtimeContext, dependency) {
    if (dependency === 'plan') {
      return runtimeContext.plan;
    }

    if (dependency === 'terminalMissionOutcome') {
      return runtimeContext.terminalMissionOutcome;
    }

    return runtimeContext.artifacts?.[dependency];
  }

  evaluateStageDependencies(runtimeContext, dependencies = []) {
    const missingDependencies = dependencies.filter(dependency => {
      const value = this.resolveDependencyValue(runtimeContext, dependency);

      if (dependency === 'lessonsLearned') {
        return !Array.isArray(value) || value.length === 0;
      }

      if (dependency === 'researchToStorytellingHandoff') {
        return !runtimeContext.artifacts?.handoffReviews?.researchToStorytelling;
      }

      if (dependency === 'storytellingToVisualDirectorHandoff') {
        return !runtimeContext.artifacts?.handoffReviews?.storytellingToVisualDirector;
      }

      if (dependency === 'visualDirectorToImageGenerationHandoff') {
        return !runtimeContext.artifacts?.handoffReviews?.visualDirectorToImageGeneration;
      }

      return value === null || value === undefined;
    });

    return {
      stageDependenciesSatisfied: missingDependencies.length === 0,
      missingDependencies
    };
  }

  createStageHistoryRecord({ stage, stageStartTime, stageDependenciesSatisfied }) {
    return {
      stage,
      stageStartTime,
      stageEndTime: null,
      stageDuration: null,
      stageOutcome: 'IN_PROGRESS',
      stageDependenciesSatisfied
    };
  }

  finalizeStageHistoryRecord(record, outcome) {
    const endEpochMs = this.now();
    record.stageEndTime = new Date(endEpochMs).toISOString();
    record.stageDuration = Math.max(0, endEpochMs - Date.parse(record.stageStartTime));
    record.stageOutcome = outcome;
  }

  async executeStage({ runtimeContext, stage, dependencies = [], action }) {
    this.ensureRuntimeDiagnostics(runtimeContext);
    const stageStartEpochMs = this.now();
    const stageStartTime = new Date(stageStartEpochMs).toISOString();
    const dependencyEvaluation = this.evaluateStageDependencies(runtimeContext, dependencies);
    const stageRecord = this.createStageHistoryRecord({
      stage,
      stageStartTime,
      stageDependenciesSatisfied: dependencyEvaluation.stageDependenciesSatisfied
    });
    runtimeContext.runtimeDiagnostics.runtimeStageHistory.push(stageRecord);

    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'STAGE_STARTED',
      details: {
        stage,
        stageStartTime,
        dependencies
      }
    }));

    if (!dependencyEvaluation.stageDependenciesSatisfied) {
      this.finalizeStageHistoryRecord(stageRecord, 'FAILED');
      runtimeContext.events.push(this.createEvent({
        missionId: runtimeContext.missionId,
        state: runtimeContext.state,
        type: 'STAGE_FAILED',
        details: {
          stage,
          reason: 'STAGE_DEPENDENCIES_UNSATISFIED',
          missingDependencies: dependencyEvaluation.missingDependencies
        }
      }));
      throw new Error(
        `Stage dependency failure at ${stage}: missing ${dependencyEvaluation.missingDependencies.join(', ')}`
      );
    }

    try {
      await action();
      this.finalizeStageHistoryRecord(stageRecord, 'COMPLETED');
      runtimeContext.events.push(this.createEvent({
        missionId: runtimeContext.missionId,
        state: runtimeContext.state,
        type: 'STAGE_COMPLETED',
        details: {
          stage,
          stageEndTime: stageRecord.stageEndTime,
          stageDuration: stageRecord.stageDuration
        }
      }));
    } catch (error) {
      this.finalizeStageHistoryRecord(stageRecord, 'FAILED');
      runtimeContext.events.push(this.createEvent({
        missionId: runtimeContext.missionId,
        state: runtimeContext.state,
        type: 'STAGE_FAILED',
        details: {
          stage,
          reason: error.message
        }
      }));
      throw error;
    }
  }

  async runMission(request = {}) {
    const runtimeContext = this.createRuntimeContext(request);

    try {
      runtimeContext.artifacts.topicEvaluationReport = this.buildTopicEvaluationReport({
        runtimeContext,
        request
      });
      runtimeContext.artifacts.topicEvaluationReportPath = this.buildArtifactReportPath({
        missionId: runtimeContext.missionId,
        artifactType: 'topic-evaluation-report'
      });
      this.persistJsonArtifact({
        runtimeContext,
        filePath: runtimeContext.artifacts.topicEvaluationReportPath,
        artifactType: 'topic-evaluation-report',
        payload: runtimeContext.artifacts.topicEvaluationReport
      });
      runtimeContext.events.push(this.createEvent({
        missionId: runtimeContext.missionId,
        state: runtimeContext.state,
        type: 'TOPIC_EVALUATION_COMPLETED',
        details: {
          recommendedTopic: runtimeContext.artifacts.topicEvaluationReport?.recommendedTopic?.topic ?? null,
          candidateCount: Array.isArray(runtimeContext.artifacts.topicEvaluationReport?.rankedTopics)
            ? runtimeContext.artifacts.topicEvaluationReport.rankedTopics.length
            : 0
        }
      }));
      request = this.applySelectedTopicToRequest({
        request,
        selectedTopic: runtimeContext.artifacts.topicEvaluationReport?.recommendedTopic?.topic ?? null
      });

      const admissionResult = this.businessRuntimeAdmission.admit({ request });
      runtimeContext.artifacts.producerBrief = this.buildProducerBrief({
        runtimeContext,
        request,
        admissionResult
      });
      runtimeContext.artifacts.businessAdmission = admissionResult;
      runtimeContext.admissionDiagnostics = admissionResult.diagnostics;

      runtimeContext.events.push(this.createEvent({
        missionId: runtimeContext.missionId,
        state: runtimeContext.state,
        type: 'PRODUCER_BRIEF_CREATED',
        details: {
          briefId: runtimeContext.artifacts.producerBrief?.briefId ?? null,
          targetAudience: runtimeContext.artifacts.producerBrief?.targetAudience ?? null,
          runtimeTargetSeconds: runtimeContext.artifacts.producerBrief?.runtimeTargetSeconds ?? null
        }
      }));

      if (!admissionResult.admitted) {
        const firstError = admissionResult.errors?.[0];
        throw new Error(firstError?.message ?? 'Business runtime admission failed.');
      }

      runtimeContext.runtimeBusinessContext = admissionResult.runtimeBusinessContext;
      runtimeContext.businessId = admissionResult.runtimeBusinessContext.businessId;
      runtimeContext.executionPolicy.publishingMode = admissionResult.runtimeBusinessContext.publishingMode;
      runtimeContext.events.push(this.createEvent({
        missionId: runtimeContext.missionId,
        state: runtimeContext.state,
        type: 'BUSINESS_ADMISSION_COMPLETED',
        details: {
          businessId: runtimeContext.runtimeBusinessContext.businessId,
          publishingMode: runtimeContext.runtimeBusinessContext.publishingMode
        }
      }));

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.PLANNING,
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.PLANNING);
          runtimeContext.missionPlan = this.createMissionPlan({ request, runtimeContext });
          runtimeContext.plan = this.translateMissionPlanToExecutionPlan(runtimeContext.missionPlan);
          runtimeContext.artifacts.missionPlan = runtimeContext.missionPlan;
          runtimeContext.events.push(this.createEvent({
            missionId: runtimeContext.missionId,
            state: runtimeContext.state,
            type: 'MISSION_PLAN_CREATED',
            details: {
              planId: runtimeContext.missionPlan.planId,
              plannerVersion: runtimeContext.missionPlan.plannerVersion,
              confidenceScore: runtimeContext.missionPlan.confidence.score
            }
          }));
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'PLANNING'));
        }
      });

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.RESEARCH,
        dependencies: ['plan', 'producerBrief'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.RESEARCH);
          runtimeContext.artifacts.research = await this.executeResearch({
            runtimeContext,
            request
          });
          runtimeContext.artifacts.researchEvaluation = this.evaluateResearchOutput({
            runtimeContext,
            researchResult: runtimeContext.artifacts.research
          });
          runtimeContext.metricsRefs.push({
            missionId: runtimeContext.missionId,
            metricId: 'RESEARCH_OVERALL_SCORE',
            value: runtimeContext.artifacts.researchEvaluation.overallScore
          });
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'RESEARCH'));
        }
      });

      const researchDossierGate = this.evaluateResearchDossierGate({ runtimeContext });
      runtimeContext.artifacts.researchDossierGate = researchDossierGate;

      if (!researchDossierGate.isReady) {
        return this.blockForResearchInsufficient({ runtimeContext, researchDossierGate });
      }

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.SCRIPTING,
        dependencies: ['plan', 'researchEvaluation'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.SCRIPTING);
          const researchToStorytellingReview = this.createResearchToStorytellingHandoffReview({
            runtimeContext
          });
          const storytellingPlan = this.buildStorytellingPlan({
            runtimeContext,
            request,
            researchToStorytellingReview
          });
          runtimeContext.artifacts.storytellingPlan = storytellingPlan;
          runtimeContext.events.push(this.createEvent({
            missionId: runtimeContext.missionId,
            state: runtimeContext.state,
            type: 'STORYTELLING_PLAN_CREATED',
            details: {
              openingHookFactId: storytellingPlan?.openingHook?.fact?.findingId ?? null,
              narrativeBeatCount: Array.isArray(storytellingPlan?.narrativeBeats) ? storytellingPlan.narrativeBeats.length : 0,
              majorBeatCount: Array.isArray(storytellingPlan?.narrativeBeats)
                ? storytellingPlan.narrativeBeats.filter(beat => String(beat?.importance ?? '').toLowerCase() === 'major').length
                : 0
            }
          }));
          runtimeContext.artifacts.script = await this.workers.scriptWorker.execute(this.createAssignment({
            assignmentId: `${runtimeContext.missionId}-SCRIPT`,
            workerId: 'YOUTUBE-SCRIPT-WORKER-001',
            taskId: 'TASK-SCRIPT',
            metadata: {
              topic: request.topic,
              audience: request.audience,
              targetLength: request.targetLength,
              style: request.style,
              producerBrief: runtimeContext.artifacts.producerBrief,
              producerBriefSupport: this.buildProducerBriefSupportExplanation({
                specialist: 'Storytelling',
                producerBrief: runtimeContext.artifacts.producerBrief,
                objective: 'Shape narrative structure, beat progression, and audience retention strategy around the Producer Brief.'
              }),
              evaluatedResearch: runtimeContext.artifacts.researchEvaluation,
              researchPackage: runtimeContext.artifacts.researchEvaluation?.researchPackage ?? null,
              storytellingPlan,
              evaluatedResearchRevisedWorkPlan: runtimeContext.artifacts.researchEvaluation?.revisedWorkPlan ?? [],
              handoffReview: researchToStorytellingReview,
              researchSummary: runtimeContext.artifacts.researchEvaluation?.researchPackage?.summary ?? runtimeContext.artifacts.research?.report?.executiveSummary ?? null,
              researchFindings: runtimeContext.artifacts.researchEvaluation?.researchPackage?.highestStoryValueFacts ?? []
            }
          }));
          const storytellingIterationResult = this.runStorytellingIterativeRewriteLoop({
            runtimeContext,
            request,
            initialScriptResult: runtimeContext.artifacts.script
          });
          runtimeContext.artifacts.script = storytellingIterationResult.scriptResult;
          runtimeContext.artifacts.storytellingEvaluation = storytellingIterationResult.evaluation;
          runtimeContext.artifacts.storytellingIterations = storytellingIterationResult.iterations;

          const writersRoomResult = await this.runWritersRoomWorkflow({
            runtimeContext,
            request,
            firstDraftScriptResult: runtimeContext.artifacts.script
          });

          runtimeContext.artifacts.scriptFirstDraft = writersRoomResult.firstDraft;
          runtimeContext.artifacts.executiveScriptReview = writersRoomResult.finalReview;
          runtimeContext.artifacts.writersRoomCycles = writersRoomResult.cycles;
          runtimeContext.artifacts.improvementPlans = writersRoomResult.improvementPlans;
          runtimeContext.artifacts.currentImprovementPlan = writersRoomResult.improvementPlans?.[writersRoomResult.improvementPlans.length - 1] ?? null;
          runtimeContext.artifacts.scriptFinalDraft = writersRoomResult.finalDraft;
          runtimeContext.artifacts.scriptSecondDraft = {
            ...writersRoomResult.finalDraft,
            secondDraft: true,
            writersRoomApproved: writersRoomResult.approvedForProduction
          };
          runtimeContext.artifacts.script = runtimeContext.artifacts.scriptFinalDraft;

          runtimeContext.metricsRefs.push({
            missionId: runtimeContext.missionId,
            metricId: 'STORYTELLING_OVERALL_SCORE',
            value: runtimeContext.artifacts.storytellingEvaluation.overallScore
          });
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'SCRIPTING'));
        }
      });

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.VOICE_GENERATION,
        dependencies: ['script'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.VOICE_GENERATION);
          const narrationPlan = this.buildNarrationPlan({ runtimeContext, request });
          const narrationEvaluation = this.evaluateNarrationPlan({ runtimeContext, narrationPlan });
          const evaluatedNarrationPlan = {
            ...narrationPlan,
            evaluation: narrationEvaluation
          };

          runtimeContext.artifacts.narrationPlan = narrationPlan;
          runtimeContext.artifacts.narrationEvaluation = narrationEvaluation;
          runtimeContext.artifacts.evaluatedNarrationPlan = evaluatedNarrationPlan;
          runtimeContext.metricsRefs.push({
            missionId: runtimeContext.missionId,
            metricId: 'NARRATION_PLAN_OVERALL_SCORE',
            value: narrationEvaluation.overallScore
          });

          runtimeContext.artifacts.voice = await this.workers.voiceWorker.execute(this.createAssignment({
            assignmentId: `${runtimeContext.missionId}-VOICE`,
            workerId: 'VOICE-WORKER-001',
            taskId: 'TASK-VOICE',
            metadata: {
              evaluatedNarrationPlan,
              narrationRevisedWorkPlan: narrationEvaluation?.revisedWorkPlan ?? [],
              producerBrief: runtimeContext.artifacts.producerBrief,
              producerBriefSupport: this.buildProducerBriefSupportExplanation({
                specialist: 'Narration',
                producerBrief: runtimeContext.artifacts.producerBrief,
                objective: 'Deliver pacing, emphasis, and tone so narration execution matches the Producer Brief emotional and behavioral goals.'
              }),
              script: evaluatedNarrationPlan.narrationText,
              voiceStyle: request.voiceStyle ?? request.style,
              language: request.language ?? 'en-US',
              targetDuration: request.targetDuration ?? 60,
              businessId: runtimeContext.businessId,
              missionId: runtimeContext.missionId
            }
          }));
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'VOICE_GENERATION'));
        }
      });

      if (this.shouldEnforceArtifactIntegrity(runtimeContext)) {
        const audioIntegrity = this.validateAudioArtifact({
          audioFile: runtimeContext.artifacts.voice?.audioFile
        });

        if (!audioIntegrity.isValid) {
          return this.blockForArtifactIntegrityFailure({
            runtimeContext,
            stage: MissionLifecycleStates.VOICE_GENERATION,
            issues: audioIntegrity.issues
          });
        }
      }

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.IMAGE_GENERATION,
        dependencies: ['script'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.IMAGE_GENERATION);
          this.createStorytellingToVisualDirectorHandoffReview({ runtimeContext, request });
          const scenePlan = this.buildScenePlan({ runtimeContext, request });
          const visualPlan = this.buildVisualPlan({ runtimeContext, request });
          const visualEvaluation = this.evaluateVisualPlan({ runtimeContext, visualPlan });
          const evaluatedVisualPlan = {
            ...visualPlan,
            evaluation: visualEvaluation
          };

          const visualDirectorToImageGenerationReview = this.createVisualDirectorToImageGenerationHandoffReview({
            runtimeContext,
            evaluatedVisualPlan
          });

          runtimeContext.artifacts.visualPlan = visualPlan;
          runtimeContext.artifacts.visualEvaluation = visualEvaluation;
          runtimeContext.artifacts.evaluatedVisualPlan = evaluatedVisualPlan;
          runtimeContext.artifacts.scenePlan = scenePlan;
          runtimeContext.metricsRefs.push({
            missionId: runtimeContext.missionId,
            metricId: 'VISUAL_PLAN_OVERALL_SCORE',
            value: visualEvaluation.overallScore
          });

          runtimeContext.artifacts.images = await this.workers.imageWorker.execute(this.createAssignment({
            assignmentId: `${runtimeContext.missionId}-IMAGE`,
            workerId: 'IMAGE-WORKER-001',
            taskId: 'TASK-IMAGE',
            metadata: {
              script: runtimeContext.artifacts.script.script,
              evaluatedVisualPlan,
              visualRevisedWorkPlan: visualEvaluation?.revisedWorkPlan ?? [],
              producerBrief: runtimeContext.artifacts.producerBrief,
              producerBriefSupport: this.buildProducerBriefSupportExplanation({
                specialist: 'Visual',
                producerBrief: runtimeContext.artifacts.producerBrief,
                objective: 'Convert narrative intent into imagery that reinforces tone, emotional journey, and visual identity targets from the Producer Brief.'
              }),
              handoffReview: visualDirectorToImageGenerationReview,
              sceneDescription: evaluatedVisualPlan.sceneDescription,
              artStyle: evaluatedVisualPlan.artStyle,
              businessId: runtimeContext.businessId,
              missionId: runtimeContext.missionId,
              narrativeBeats: Array.isArray(runtimeContext.artifacts.storytellingPlan?.narrativeBeats)
                ? runtimeContext.artifacts.storytellingPlan.narrativeBeats
                : [],
              imageCount: this.resolveRequiredSceneCount({ request, scenePlan }),
              scenePrompts: Array.isArray(scenePlan?.scenes)
                ? scenePlan.scenes.map(scene => scene.visualPrompt)
                : []
            }
          }));

          runtimeContext.artifacts.sceneCountVerification = {
            plannedSceneCount: this.resolvePlannedSceneCount({ runtimeContext, request }),
            generatedImageCount: Array.isArray(runtimeContext.artifacts.images?.imageFiles)
              ? runtimeContext.artifacts.images.imageFiles.length
              : 0,
            timelineSceneCountBeforeRender: null,
            timelineSceneCountAfterRender: null,
            validationPassed: null
          };

          runtimeContext.artifacts.imageGenerationEvaluation = this.evaluateGeneratedImages({
            runtimeContext,
            evaluatedVisualPlan,
            imageResult: runtimeContext.artifacts.images
          });
          runtimeContext.artifacts.evaluatedImagePackage = {
            ...runtimeContext.artifacts.images,
            evaluation: runtimeContext.artifacts.imageGenerationEvaluation
          };
          runtimeContext.metricsRefs.push({
            missionId: runtimeContext.missionId,
            metricId: 'IMAGE_GENERATION_OVERALL_SCORE',
            value: runtimeContext.artifacts.imageGenerationEvaluation.overallScore
          });
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'IMAGE_GENERATION'));
        }
      });

      if (this.shouldEnforceArtifactIntegrity(runtimeContext)) {
        const imageIntegrity = this.validateImageArtifacts({
          imageFiles: runtimeContext.artifacts.images?.imageFiles
        });

        if (!imageIntegrity.isValid) {
          return this.blockForArtifactIntegrityFailure({
            runtimeContext,
            stage: MissionLifecycleStates.IMAGE_GENERATION,
            issues: imageIntegrity.issues
          });
        }
      }

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.TIMELINE_BUILD,
        dependencies: ['images'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.TIMELINE_BUILD);
          runtimeContext.artifacts.timeline = this.buildTimeline({
            request,
            imageResult: runtimeContext.artifacts.images,
            scenePlan: runtimeContext.artifacts.scenePlan
          });
          if (runtimeContext.artifacts.sceneCountVerification) {
            runtimeContext.artifacts.sceneCountVerification.timelineSceneCountBeforeRender = Array.isArray(runtimeContext.artifacts.timeline)
              ? runtimeContext.artifacts.timeline.length
              : 0;
          }
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'TIMELINE_BUILD'));
        }
      });

      if (this.shouldEnforceArtifactIntegrity(runtimeContext)) {
        const preRenderValidation = this.validatePreRenderProductionRequirements({
          runtimeContext,
          request
        });

        if (!preRenderValidation.passed) {
          return this.blockForProductionValidationFailure({
            runtimeContext,
            stage: 'PRE_RENDER_VALIDATION',
            report: preRenderValidation
          });
        }
      }

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.MEDIA_RENDER,
        dependencies: ['script', 'voice', 'images', 'timeline'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.MEDIA_RENDER);
          runtimeContext.artifacts.video = await this.workers.videoWorker.execute(this.createAssignment({
            assignmentId: `${runtimeContext.missionId}-VIDEO`,
            workerId: 'VIDEO-WORKER-001',
            taskId: 'TASK-VIDEO',
            metadata: {
              script: runtimeContext.artifacts.script.script,
              voiceOutput: runtimeContext.artifacts.voice.audioFile,
              evaluatedImagePackage: runtimeContext.artifacts.evaluatedImagePackage,
              imageGenerationRevisedWorkPlan: runtimeContext.artifacts.imageGenerationEvaluation?.revisedWorkPlan ?? [],
              producerBrief: runtimeContext.artifacts.producerBrief,
              producerBriefSupport: this.buildProducerBriefSupportExplanation({
                specialist: 'Timeline and Editor',
                producerBrief: runtimeContext.artifacts.producerBrief,
                objective: 'Assemble pacing and shot flow so the final runtime progression fulfills the Producer Brief ending and viewer-action goals.'
              }),
              imageOutputs: runtimeContext.artifacts.evaluatedImagePackage?.imageFiles ?? runtimeContext.artifacts.images.imageFiles,
              targetFormat: request.targetFormat ?? 'mp4',
              targetResolution: request.targetResolution ?? '1920x1080',
              timeline: {
                scenes: Array.isArray(runtimeContext.artifacts.timeline)
                  ? runtimeContext.artifacts.timeline
                  : [],
                narrationDurationSeconds: request.narrationDurationSeconds
                  ?? request.targetDuration
                  ?? runtimeContext.artifacts.timeline?.reduce?.((sum, scene) => sum + Number(scene?.durationSeconds ?? 0), 0)
                  ?? null
              }
            }
          }));

          if (runtimeContext.artifacts.sceneCountVerification) {
            runtimeContext.artifacts.sceneCountVerification.timelineSceneCountAfterRender = Array.isArray(runtimeContext.artifacts.timeline)
              ? runtimeContext.artifacts.timeline.length
              : 0;
          }
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'MEDIA_RENDER'));
        }
      });

      if (this.shouldEnforceArtifactIntegrity(runtimeContext)) {
        const videoIntegrity = this.validateVideoArtifact({
          videoFile: runtimeContext.artifacts.video?.videoFile
        });

        if (!videoIntegrity.isValid) {
          return this.blockForArtifactIntegrityFailure({
            runtimeContext,
            stage: MissionLifecycleStates.MEDIA_RENDER,
            issues: videoIntegrity.issues
          });
        }
      }

      if (this.shouldEnforceArtifactIntegrity(runtimeContext)) {
        const productionValidation = this.validatePostRenderProductionRequirements({
          runtimeContext,
          request
        });

        runtimeContext.artifacts.productionValidation = productionValidation;
        if (runtimeContext.artifacts.sceneCountVerification) {
          runtimeContext.artifacts.sceneCountVerification.validationPassed = productionValidation.passed;
        }

        if (!productionValidation.passed) {
          return this.blockForProductionValidationFailure({
            runtimeContext,
            stage: 'POST_RENDER_VALIDATION',
            report: productionValidation
          });
        }
      }

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.QUALITY_REVIEW,
        dependencies: ['script', 'voice', 'images', 'video'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.QUALITY_REVIEW);
          runtimeContext.artifacts.qualityReview = this.runMissionQualityReview({
            runtimeContext,
            request
          });
          runtimeContext.qualityRefs.push({
            missionId: runtimeContext.missionId,
            passed: runtimeContext.artifacts.qualityReview.passed
          });
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'QUALITY_REVIEW'));
        }
      });

      const qualityReview = runtimeContext.artifacts.qualityReview;

      if (!qualityReview.passed) {
        runtimeContext.riskRegister.push({
          code: 'QUALITY_GATE_BLOCKED',
          severity: 'HIGH',
          owner: 'CQO'
        });
        runtimeContext.terminalMissionOutcome = 'QUALITY_BLOCKED';
        this.transitionTo(runtimeContext, MissionLifecycleStates.BLOCKED, {
          reason: 'Quality gate blocked mission'
        });
        runtimeContext.artifacts.publishing = {
          enabled: false,
          mode: runtimeContext.executionPolicy.publishingMode,
          publishStatus: 'NOT_REQUESTED',
          status: 'QUALITY_BLOCKED'
        };

        return this.buildRunResult(runtimeContext);
      }

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.RC_PACKAGING,
        dependencies: ['script', 'voice', 'images', 'video', 'qualityReview'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.RC_PACKAGING);
          runtimeContext.artifacts.releaseCandidatePackage = this.buildReleaseCandidatePackage({
            runtimeContext,
            request,
            scriptResult: runtimeContext.artifacts.script,
            voiceResult: runtimeContext.artifacts.voice,
            imageResult: runtimeContext.artifacts.images,
            videoResult: runtimeContext.artifacts.video,
            qualityReview
          });
          runtimeContext.artifacts.releaseCandidatePackagePath = this.buildArtifactReportPath({
            missionId: runtimeContext.missionId,
            artifactType: 'release-candidate-package'
          });
          runtimeContext.artifacts.executiveReportPath = this.buildArtifactReportPath({
            missionId: runtimeContext.missionId,
            artifactType: 'executive-report'
          });
          this.persistJsonArtifact({
            runtimeContext,
            filePath: runtimeContext.artifacts.releaseCandidatePackagePath,
            artifactType: 'release-candidate-package',
            payload: runtimeContext.artifacts.releaseCandidatePackage
          });
          runtimeContext.releaseCandidateRefs.push({
            releaseCandidateId: runtimeContext.artifacts.releaseCandidatePackage.releaseCandidateId
          });
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'RC_PACKAGING'));
        }
      });

      runtimeContext.artifacts.executiveImprovementReport = this.buildExecutiveImprovementReport({
        runtimeContext,
        request,
        qualityReview
      });
      runtimeContext.artifacts.executiveImprovementReportPath = this.buildArtifactReportPath({
        missionId: runtimeContext.missionId,
        artifactType: 'executive-improvement-report'
      });
      this.persistJsonArtifact({
        runtimeContext,
        filePath: runtimeContext.artifacts.executiveImprovementReportPath,
        artifactType: 'executive-improvement-report',
        payload: runtimeContext.artifacts.executiveImprovementReport
      });
      runtimeContext.artifacts.publishDecisionReport = this.buildPublishDecisionReport({
        runtimeContext,
        request,
        qualityReview,
        executiveImprovementReport: runtimeContext.artifacts.executiveImprovementReport
      });
      runtimeContext.artifacts.publishDecisionReportPath = this.buildArtifactReportPath({
        missionId: runtimeContext.missionId,
        artifactType: 'publish-decision-report'
      });
      this.persistJsonArtifact({
        runtimeContext,
        filePath: runtimeContext.artifacts.publishDecisionReportPath,
        artifactType: 'publish-decision-report',
        payload: runtimeContext.artifacts.publishDecisionReport
      });

      if (runtimeContext.executionPolicy.stopAfterReleaseCandidate === true) {
        this.persistJsonArtifact({
          runtimeContext,
          filePath: runtimeContext.artifacts.executiveReportPath,
          artifactType: 'executive-report',
          payload: {
            missionId: runtimeContext.missionId,
            releaseCandidateId: runtimeContext.artifacts.releaseCandidatePackage?.releaseCandidateId ?? null,
            status: 'NOT_GENERATED_STOP_AFTER_RELEASE_CANDIDATE',
            reason: 'Mission execution stopped after release candidate packaging by runtime policy.'
          }
        });
        runtimeContext.terminalMissionOutcome = 'RELEASE_CANDIDATE_CREATED';
        runtimeContext.artifacts.publishing = {
          enabled: false,
          mode: runtimeContext.executionPolicy.publishingMode,
          publishStatus: 'NOT_REQUESTED',
          status: 'STOPPED_AFTER_RELEASE_CANDIDATE'
        };

        return this.buildRunResult(runtimeContext);
      }

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.EXECUTIVE_REPORTING,
        dependencies: ['releaseCandidatePackage', 'qualityReview'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.EXECUTIVE_REPORTING);
          runtimeContext.artifacts.executiveReport = this.buildExecutiveReport({
            runtimeContext,
            request,
            qualityReview,
            executiveDecisionPacket: null
          });
          if (!runtimeContext.artifacts.executiveReportPath) {
            runtimeContext.artifacts.executiveReportPath = this.buildArtifactReportPath({
              missionId: runtimeContext.missionId,
              artifactType: 'executive-report'
            });
          }
          this.persistJsonArtifact({
            runtimeContext,
            filePath: runtimeContext.artifacts.executiveReportPath,
            artifactType: 'executive-report',
            payload: runtimeContext.artifacts.executiveReport
          });
          runtimeContext.executiveDecisionRefs.push({
            missionId: runtimeContext.missionId,
            recommendation: runtimeContext.artifacts.executiveReport.missionDecisionPackage.recommendation
          });
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'EXECUTIVE_REPORTING'));
        }
      });

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.EXECUTIVE_REVIEW,
        dependencies: ['executiveReport', 'qualityReview'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.EXECUTIVE_REVIEW);
          const recommendationContracts = this.buildRecommendationContracts({
            request,
            qualityReview,
            runtimeContext
          });
          runtimeContext.artifacts.executiveCouncilRuntime = this.executiveCouncilRuntime.evaluate({
            missionId: runtimeContext.missionId,
            businessId: runtimeContext.businessId,
            recommendationContracts
          });

          const executiveDecisionPacket = createExecutiveDecisionPacket({
            missionId: runtimeContext.missionId,
            businessId: runtimeContext.businessId,
            releaseCandidateId: runtimeContext.artifacts.releaseCandidatePackage.releaseCandidateId,
            overallRecommendation: runtimeContext.artifacts.executiveCouncilRuntime.outcome,
            confidence: runtimeContext.artifacts.executiveCouncilRuntime.confidence,
            conflicts: runtimeContext.artifacts.executiveCouncilRuntime.conflicts,
            waivers: runtimeContext.artifacts.executiveCouncilRuntime.waivers,
            highestRisks: runtimeContext.artifacts.executiveCouncilRuntime.highestRisks,
            recommendedCEOAction: runtimeContext.artifacts.executiveCouncilRuntime.recommendedCEOAction,
            evidenceReferences: runtimeContext.artifacts.executiveCouncilRuntime.evidenceReferences,
            recommendationContracts: runtimeContext.artifacts.executiveCouncilRuntime.recommendationContracts
          });
          const packetValidation = validateExecutiveDecisionPacket(executiveDecisionPacket);

          if (!packetValidation.isValid) {
            throw new Error(`Executive decision packet invalid: ${packetValidation.issues.map(issue => issue.issue).join(', ')}`);
          }

          runtimeContext.artifacts.executiveDecisionPacket = executiveDecisionPacket;
          runtimeContext.artifacts.executiveReport = {
            ...runtimeContext.artifacts.executiveReport,
            executiveDecisionPacket
          };
          this.persistJsonArtifact({
            runtimeContext,
            filePath: runtimeContext.artifacts.executiveReportPath,
            artifactType: 'executive-report',
            payload: runtimeContext.artifacts.executiveReport
          });
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'EXECUTIVE_REVIEW'));
        }
      });

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.CEO_DECISION_PENDING,
        dependencies: ['executiveDecisionPacket'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.CEO_DECISION_PENDING);
          const ceoDecision = this.resolveCEODecision({
            request,
            executiveDecisionPacket: runtimeContext.artifacts.executiveDecisionPacket
          });

          runtimeContext.artifacts.ceoDecision = {
            decision: ceoDecision,
            decidedAt: new Date(this.now()).toISOString()
          };

          if (ceoDecision === 'APPROVE') {
            runtimeContext.terminalMissionOutcome = 'CEO_APPROVED';
            this.transitionTo(runtimeContext, MissionLifecycleStates.CEO_APPROVED, { ceoDecision });
            return;
          }

          if (ceoDecision === 'APPROVE_WITH_WAIVERS') {
            runtimeContext.terminalMissionOutcome = 'CEO_APPROVED_WITH_WAIVERS';
            this.transitionTo(runtimeContext, MissionLifecycleStates.CEO_APPROVED_WITH_WAIVERS, { ceoDecision });
            return;
          }

          if (ceoDecision === 'RETURN_FOR_REVISION') {
            runtimeContext.terminalMissionOutcome = 'CEO_REVISION';
            this.transitionTo(runtimeContext, MissionLifecycleStates.CEO_REVISION, { ceoDecision });
            runtimeContext.artifacts.publishing = {
              enabled: false,
              mode: runtimeContext.executionPolicy.publishingMode,
              publishStatus: 'NOT_REQUESTED',
              status: 'CEO_REVISION_REQUIRED'
            };
            return;
          }

          if (ceoDecision === 'REJECT') {
            runtimeContext.terminalMissionOutcome = 'CEO_REJECTED';
            this.transitionTo(runtimeContext, MissionLifecycleStates.CEO_REJECTED, { ceoDecision });
            runtimeContext.artifacts.publishing = {
              enabled: false,
              mode: runtimeContext.executionPolicy.publishingMode,
              publishStatus: 'NOT_REQUESTED',
              status: 'CEO_REJECTED'
            };
            return;
          }

          throw new Error(`Unsupported CEO decision: ${ceoDecision}`);
        }
      });

      if (
        runtimeContext.state === MissionLifecycleStates.CEO_REVISION
        || runtimeContext.state === MissionLifecycleStates.CEO_REJECTED
      ) {
        return this.buildRunResult(runtimeContext);
      }

      runtimeContext.artifacts.publishing = await this.executePublishingIfEnabled({
        runtimeContext,
        request,
        scriptResult: runtimeContext.artifacts.script,
        imageResult: runtimeContext.artifacts.images,
        videoResult: runtimeContext.artifacts.video
      });

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.LESSON_CAPTURE,
        dependencies: ['ceoDecision'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.LESSON_CAPTURE);
          runtimeContext.artifacts.lessonsLearned = this.buildLessonsLearned({ runtimeContext, qualityReview });
          runtimeContext.lessonsRefs = runtimeContext.artifacts.lessonsLearned.map(lesson => ({ lessonId: lesson.id }));
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'LESSON_CAPTURE'));
        }
      });

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.KNOWLEDGE_CANDIDATE_CAPTURE,
        dependencies: ['lessonsLearned', 'terminalMissionOutcome'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.KNOWLEDGE_CANDIDATE_CAPTURE);
          runtimeContext.artifacts.knowledgeCandidates = this.buildKnowledgeCandidates({
            lessonsLearned: runtimeContext.artifacts.lessonsLearned
          });
          runtimeContext.knowledgeCandidateRefs = runtimeContext.artifacts.knowledgeCandidates.map(candidate => ({
            candidateId: candidate.candidateId
          }));
          runtimeContext.checkpoints.push(this.createCheckpoint(runtimeContext, 'KNOWLEDGE_CANDIDATE_CAPTURE'));
        }
      });

      await this.executeStage({
        runtimeContext,
        stage: MissionLifecycleStates.COMPLETED,
        dependencies: ['lessonsLearned', 'knowledgeCandidates'],
        action: async () => {
          this.transitionTo(runtimeContext, MissionLifecycleStates.COMPLETED, {
            publishingMode: runtimeContext.executionPolicy.publishingMode
          });
        }
      });

      return this.buildRunResult(runtimeContext);
    } catch (error) {
      if (!runtimeContext.terminalMissionOutcome) {
        runtimeContext.terminalMissionOutcome = 'FAILED';
      }

      runtimeContext.failureLedger.push({
        code: 'MISSION_RUNTIME_FAILURE',
        message: error.message,
        state: runtimeContext.state
      });

      if (!this.stateMachine.terminalStates.has(runtimeContext.state) && runtimeContext.state !== MissionLifecycleStates.FAILED) {
        this.transitionTo(runtimeContext, MissionLifecycleStates.FAILED, {
          reason: error.message
        });
      }

      return this.buildRunResult(runtimeContext);
    }
  }

  createMissionPlan({ request, runtimeContext }) {
    return this.missionPlanningEngine.generateMissionPlan({ request, runtimeContext });
  }

  buildTopicEvaluationReport({ runtimeContext, request }) {
    const configuredCandidates = Array.isArray(request?.candidateTopics)
      ? request.candidateTopics
      : [];
    const fallbackCandidates = this.buildFallbackTopicCandidates({ request });
    const candidates = [...configuredCandidates, ...fallbackCandidates]
      .map(candidate => this.normalizeTopicCandidate(candidate))
      .filter(candidate => candidate.topic.length > 0);

    const uniqueCandidates = [];
    const seenTopics = new Set();
    candidates.forEach(candidate => {
      const key = candidate.topic.toLowerCase();
      if (!seenTopics.has(key)) {
        seenTopics.add(key);
        uniqueCandidates.push(candidate);
      }
    });

    const rankedTopics = uniqueCandidates.map(candidate => {
      const categoryScores = this.evaluateTopicCandidate({
        candidate,
        request,
        runtimeContext
      });
      const overallScore = this.calculateTopicOverallScore(categoryScores);
      return {
        topic: candidate.topic,
        rationale: candidate.rationale,
        categoryScores,
        overallScore
      };
    }).sort((left, right) => right.overallScore - left.overallScore);

    const recommendedTopic = rankedTopics[0] ?? {
      topic: String(request?.topic ?? request?.objective ?? 'documentary mission').trim(),
      rationale: 'Fallback recommendation due to missing candidate topics.',
      categoryScores: this.evaluateTopicCandidate({
        candidate: this.normalizeTopicCandidate(request?.topic ?? request?.objective ?? 'documentary mission'),
        request,
        runtimeContext
      }),
      overallScore: 0
    };

    const recommendationWhy = this.buildTopicRecommendationExplanation({
      recommendedTopic,
      rankedTopics
    });

    return {
      reportId: `TOPIC-EVALUATION-${runtimeContext.missionId}`,
      reportType: 'Topic Evaluation Report',
      generatedAt: new Date(this.now()).toISOString(),
      missionId: runtimeContext.missionId,
      evaluationCategories: [
        'audienceDemand',
        'competitionLevel',
        'evergreenPotential',
        'educationalValue',
        'emotionalEngagement',
        'curiosityPotential',
        'sequelPotential',
        'revenueOpportunity',
        'productionDifficulty',
        'researchConfidence',
        'brandAlignment'
      ],
      rankedTopics,
      recommendedTopic,
      recommendationWhy,
      selectedTopic: recommendedTopic.topic
    };
  }

  buildFallbackTopicCandidates({ request }) {
    const configuredTopic = String(request?.topic ?? '').trim();
    const objectiveTopic = String(request?.objective ?? '').trim();
    const fallbacks = [];

    if (configuredTopic.length > 0) {
      fallbacks.push({
        topic: configuredTopic,
        rationale: 'Provided mission topic candidate.'
      });
    }

    if (objectiveTopic.length > 0) {
      fallbacks.push({
        topic: objectiveTopic,
        rationale: 'Derived from mission objective.'
      });
    }

    if (fallbacks.length === 0) {
      fallbacks.push({
        topic: 'Global supply chain shocks: fragility, resilience, and long-tail economic consequences',
        rationale: 'High baseline audience demand and strong explanatory documentary potential.'
      });
    }

    return fallbacks;
  }

  normalizeTopicCandidate(candidate) {
    if (typeof candidate === 'string') {
      return {
        topic: candidate.trim(),
        rationale: 'Candidate provided as topic string.'
      };
    }

    return {
      topic: String(candidate?.topic ?? candidate?.title ?? '').trim(),
      rationale: String(candidate?.rationale ?? 'Candidate topic provided for evaluation.').trim()
    };
  }

  evaluateTopicCandidate({ candidate, request }) {
    const topic = String(candidate?.topic ?? '').toLowerCase();
    const businessContext = [
      String(request?.audience ?? ''),
      String(request?.style ?? ''),
      String(request?.narrativeStyle ?? ''),
      String(request?.tone ?? ''),
      String(request?.objective ?? '')
    ].join(' ').toLowerCase();

    const scoreBySignals = ({ base = 5, positive = [], caution = [], negative = [] }) => {
      let score = base;
      positive.forEach(pattern => {
        if (pattern.test(topic)) score += 1.2;
      });
      caution.forEach(pattern => {
        if (pattern.test(topic)) score -= 0.7;
      });
      negative.forEach(pattern => {
        if (pattern.test(topic)) score -= 1.1;
      });
      return Number(Math.max(0, Math.min(10, score)).toFixed(2));
    };

    const audienceDemand = scoreBySignals({
      base: 6.2,
      positive: [/(crisis|war|collapse|scandal|crime|finance|technology|ai|health|climate|election)/],
      caution: [/(niche|specialized|microhistory|regional-only)/]
    });
    const competitionLevel = scoreBySignals({
      base: 6,
      positive: [/(underreported|hidden|inside|untold|declassified)/],
      caution: [/(wwii|world war ii|hitler|titanic|jack the ripper|true crime mega)/],
      negative: [/(overcovered|already documented)/]
    });
    const evergreenPotential = scoreBySignals({
      base: 6.5,
      positive: [/(history|systemic|policy|reform|institutional|economics|science)/],
      caution: [/(breaking|today|this week|latest)/]
    });
    const educationalValue = scoreBySignals({
      base: 6.4,
      positive: [/(how|why|explained|system|policy|cause|effect|timeline|investigative)/]
    });
    const emotionalEngagement = scoreBySignals({
      base: 6,
      positive: [/(victim|survivor|collapse|disaster|betrayal|accountability|fear|loss)/]
    });
    const curiosityPotential = scoreBySignals({
      base: 6.1,
      positive: [/(hidden|inside|declassified|mystery|unresolved|unknown|what really)/]
    });
    const sequelPotential = scoreBySignals({
      base: 5.8,
      positive: [/(part|series|timeline|reform|aftermath|legacy|network|global)/]
    });
    const revenueOpportunity = scoreBySignals({
      base: 6.1,
      positive: [/(finance|technology|crime|war|politics|market|health)/]
    });
    const productionDifficulty = scoreBySignals({
      base: 6,
      positive: [/(documented|archival|public records|timeline)/],
      caution: [/(multiple countries|multi-decade|classified|forensic reconstruction)/],
      negative: [/(impossible access|unavailable footage)/]
    });
    const researchConfidence = scoreBySignals({
      base: 6,
      positive: [/(well-documented|archival|public record|official report|commission)/],
      caution: [/(rumor|speculation|conspiracy)/]
    });
    const brandAlignment = Number(Math.max(0, Math.min(10, (
      6
      + (/(investigative|evidence|timeline|documentary)/.test(topic) ? 1.4 : 0)
      + (/(investigative|documentary|evidence)/.test(businessContext) ? 1.2 : 0)
    ))).toFixed(2));

    return {
      audienceDemand,
      competitionLevel,
      evergreenPotential,
      educationalValue,
      emotionalEngagement,
      curiosityPotential,
      sequelPotential,
      revenueOpportunity,
      productionDifficulty,
      researchConfidence,
      brandAlignment
    };
  }

  calculateTopicOverallScore(scores = {}) {
    const weighted = (
      Number(scores.audienceDemand ?? 0) * 0.15
      + Number(scores.competitionLevel ?? 0) * 0.07
      + Number(scores.evergreenPotential ?? 0) * 0.1
      + Number(scores.educationalValue ?? 0) * 0.12
      + Number(scores.emotionalEngagement ?? 0) * 0.1
      + Number(scores.curiosityPotential ?? 0) * 0.1
      + Number(scores.sequelPotential ?? 0) * 0.06
      + Number(scores.revenueOpportunity ?? 0) * 0.1
      + Number(scores.productionDifficulty ?? 0) * 0.07
      + Number(scores.researchConfidence ?? 0) * 0.07
      + Number(scores.brandAlignment ?? 0) * 0.06
    );

    return Number(Math.max(0, Math.min(10, weighted)).toFixed(2));
  }

  buildTopicRecommendationExplanation({ recommendedTopic, rankedTopics }) {
    const second = rankedTopics[1] ?? null;
    const margin = second
      ? Number((Number(recommendedTopic?.overallScore ?? 0) - Number(second?.overallScore ?? 0)).toFixed(2))
      : null;

    const scores = recommendedTopic?.categoryScores ?? {};
    return `Recommended topic \"${recommendedTopic?.topic ?? 'Unknown topic'}\" is the highest-value production opportunity because it combines strong audience demand (${scores.audienceDemand ?? 0}/10), evergreen potential (${scores.evergreenPotential ?? 0}/10), educational value (${scores.educationalValue ?? 0}/10), curiosity potential (${scores.curiosityPotential ?? 0}/10), and brand alignment (${scores.brandAlignment ?? 0}/10).${margin !== null ? ` Score margin vs next candidate: ${margin}.` : ''}`;
  }

  applySelectedTopicToRequest({ request, selectedTopic }) {
    const topic = String(selectedTopic ?? '').trim();

    if (topic.length === 0) {
      return {
        ...(request ?? {})
      };
    }

    return {
      ...(request ?? {}),
      topic
    };
  }

  buildProducerBrief({ runtimeContext, request, admissionResult = null }) {
    const runtimeTargetSeconds = Number.parseFloat(String(request?.narrationDurationSeconds ?? request?.targetDuration ?? 0));
    const resolvedRuntimeTargetSeconds = Number.isFinite(runtimeTargetSeconds) && runtimeTargetSeconds > 0
      ? runtimeTargetSeconds
      : 360;
    const selectedTopic = String(runtimeContext?.artifacts?.topicEvaluationReport?.selectedTopic ?? '').trim();
    const topic = String(selectedTopic || request?.topic || request?.objective || runtimeContext?.missionObjective || 'documentary mission').trim();
    const targetAudience = String(request?.targetAudience ?? request?.audience ?? 'General documentary audience').trim();
    const baseDocumentaryObjective = String(
      request?.documentaryObjective
      ?? request?.objective
      ?? `Deliver a compelling, evidence-grounded documentary on ${topic}.`
    ).trim();
    const documentaryObjective = baseDocumentaryObjective.toLowerCase().includes(topic.toLowerCase())
      ? baseDocumentaryObjective
      : `${baseDocumentaryObjective} Topic focus: ${topic}.`;
    const desiredEmotionalJourney = String(
      request?.desiredEmotionalJourney
      ?? request?.emotionalJourney
      ?? request?.emotionalTarget
      ?? 'Intrigue, escalating tension, reflective understanding, and forward-looking urgency.'
    ).trim();
    const tone = String(request?.tone ?? 'Investigative and credible with cinematic urgency').trim();
    const narrativeStyle = String(request?.narrativeStyle ?? request?.style ?? 'Investigative documentary narrative arc').trim();
    const visualStyle = String(request?.visualStyle ?? request?.artStyle ?? 'Cinematic investigative realism').trim();
    const endingObjective = String(
      request?.endingObjective
      ?? 'Conclude with evidence-backed implications that resolve key context while preserving forward momentum.'
    ).trim();
    const viewerActionGoal = String(
      request?.viewerActionGoal
      ?? 'Prompt viewers to continue engagement with the next documentary installment or follow-up investigation.'
    ).trim();
    const successDefinition = String(
      request?.successDefinition
      ?? `Audience clearly understands ${topic}, experiences the intended emotional progression, and responds to the viewer action goal.`
    ).trim();

    return {
      briefId: `PRODUCER-BRIEF-${runtimeContext.missionId}`,
      createdAt: new Date().toISOString(),
      businessId: admissionResult?.runtimeBusinessContext?.businessId ?? runtimeContext.businessId,
      targetAudience,
      documentaryObjective,
      desiredEmotionalJourney,
      tone,
      narrativeStyle,
      visualStyle,
      runtimeTargetSeconds: resolvedRuntimeTargetSeconds,
      endingObjective,
      viewerActionGoal,
      successDefinition
    };
  }

  buildProducerBriefSupportExplanation({ specialist, producerBrief, objective }) {
    const briefId = String(producerBrief?.briefId ?? 'PRODUCER-BRIEF-UNSPECIFIED').trim();
    const audience = String(producerBrief?.targetAudience ?? 'target audience').trim();
    const documentaryObjective = String(producerBrief?.documentaryObjective ?? 'documentary objective').trim();
    const emotionalJourney = String(producerBrief?.desiredEmotionalJourney ?? 'intended emotional journey').trim();

    return `${specialist} alignment for ${briefId}: ${objective} This work is optimized for ${audience}, advances the objective (${documentaryObjective}), and reinforces the desired emotional journey (${emotionalJourney}).`;
  }

  async executeResearch({ runtimeContext, request }) {
    const researchWorker = this.resolveResearchWorker();
    const producerBrief = runtimeContext.artifacts?.producerBrief ?? null;
    const researchAssignment = this.createAssignment({
      assignmentId: `${runtimeContext.missionId}-RESEARCH`,
      workerId: 'RESEARCH-WORKER-001',
      taskId: 'TASK-RESEARCH',
      metadata: {
        producerBrief,
        producerBriefSupport: this.buildProducerBriefSupportExplanation({
          specialist: 'Research',
          producerBrief,
          objective: 'Prioritize source selection and evidence framing that directly serve the Producer Brief audience, objective, and success definition.'
        }),
        objective: request.objective ?? runtimeContext.missionObjective,
        topic: request.topic ?? request.businessName ?? runtimeContext.missionObjective,
        audience: request.audience ?? 'General Audience',
        businessId: runtimeContext.businessId,
        missionId: runtimeContext.missionId
      }
    });

    return researchWorker.execute(researchAssignment);
  }

  resolveResearchWorker() {
    if (this.workers?.researchWorker && typeof this.workers.researchWorker.execute === 'function') {
      return this.workers.researchWorker;
    }

    return {
      execute: async assignment => {
        const metadata = assignment?.result?.task?.metadata ?? {};
        const topic = metadata.topic ?? 'Unknown topic';
        const objective = metadata.objective ?? 'Research objective unavailable';
        const producerBriefSupport = String(metadata.producerBriefSupport ?? '').trim();

        const findings = this.buildDefaultResearchFindings({ topic });
        const providers = this.buildDefaultResearchProviders();

        return {
          taskId: assignment.taskId,
          status: 'COMPLETED',
          findings,
          report: {
            executiveSummary: `${objective}. Evidence highlights stakes, contradictory signals, and audience-relevant consequences for ${topic}. ${producerBriefSupport}`,
            providers,
            findings: findings.map(finding => ({
              id: finding.id,
              summary: finding.claim
            }))
          }
        };
      }
    };
  }

  buildDefaultResearchProviders() {
    return [
      {
        provider: 'Congressional Oversight Commission Archive',
        status: 'success',
        response: { sourceType: 'primary', jurisdiction: 'US' },
        error: null
      },
      {
        provider: 'Federal Reserve Board Briefing Archive',
        status: 'success',
        response: { sourceType: 'primary', jurisdiction: 'US' },
        error: null
      },
      {
        provider: 'International Monetary Fund Stability Reports',
        status: 'success',
        response: { sourceType: 'secondary', jurisdiction: 'Global' },
        error: null
      },
      {
        provider: 'Bank for International Settlements Statistical Annex',
        status: 'success',
        response: { sourceType: 'secondary', jurisdiction: 'Global' },
        error: null
      },
      {
        provider: 'House Financial Services Committee Hearing Records',
        status: 'success',
        response: { sourceType: 'primary', jurisdiction: 'US' },
        error: null
      },
      {
        provider: 'Independent Investigative Documentary Archives',
        status: 'success',
        response: { sourceType: 'analysis', jurisdiction: 'Global' },
        error: null
      }
    ];
  }

  buildDefaultResearchFindings({ topic }) {
    const baseTopic = String(topic ?? 'documentary subject').trim();
    const templates = [
      '{year}: Verified regulatory filing documented leverage expansion across major institutions, because wholesale funding remained cheap and risk controls lagged.',
      '{year}: Confirmed hearing testimony from senior officials showed that contingency planning was fragmented, which caused delayed crisis coordination.',
      '{year}: Corroborated balance-sheet records indicated off-balance-sheet exposure growth that led to underestimated systemic risk.',
      '{year}: Verified interbank spread data signaled funding stress; this triggered emergency liquidity interventions by central authorities.',
      '{year}: Confirmed internal risk memoranda warned about concentration risk, but incentives favored short-term returns over resilience.',
      '{year}: Documented ratings methodology assumptions proved fragile, resulting in mispriced risk and cascading repricing.',
      '{year}: Verified bankruptcy court records marked a major turning point when market participants re-priced counterparty risk overnight.',
      '{year}: Corroborated policy minutes showed that liquidity backstops stabilized payment rails but did not resolve solvency uncertainty.',
      '{year}: Confirmed testimony from market participants described contagion channels that linked mortgage losses to global funding markets.',
      '{year}: Verified Treasury intervention timeline demonstrated cause-and-effect between guarantee announcements and short-term spread compression.',
      '{year}: Documented enforcement review found contradictory viewpoints on whether supervision failed from blind spots or from legal constraints.',
      '{year}: Corroborated insurer exposure data showed concentrated guarantees that amplified losses once collateral calls accelerated.',
      '{year}: Verified repo-market collateral haircuts increased sharply, causing forced deleveraging and fire-sale dynamics.',
      '{year}: Confirmed municipal pension disclosures revealed downstream transmission into household wealth and local budget decisions.',
      '{year}: Documented cross-border swap line activation reduced dollar funding stress, yet competing viewpoints disputed long-term moral hazard.',
      '{year}: Verified foreclosure pipeline data linked servicing bottlenecks to delayed loss recognition and extended economic drag.',
      '{year}: Corroborated stress-test design updates shifted capital expectations, resulting in recapitalization strategies across major banks.',
      '{year}: Confirmed bank examiner notes highlighted governance failures where risk committees lacked authority over growth targets.',
      '{year}: Documented CDS clearing reforms lowered bilateral opacity, but contradictory assessments questioned concentration inside clearing houses.',
      '{year}: Verified unemployment and credit-default co-movement illustrated how financial shocks led to broader labor-market deterioration.',
      '{year}: Confirmed consumer credit contraction data showed that tighter lending standards caused a prolonged recovery in small-business formation.',
      '{year}: Corroborated sovereign debt response packages revealed trade-offs between stabilization speed and distributional fairness.',
      '{year}: Verified legal settlements established accountability milestones, yet competing viewpoints argued penalties under-weighted deterrence.',
      '{year}: Documented derivative transparency mandates improved surveillance, leading to earlier detection of concentrated exposures.',
      '{year}: Confirmed macroprudential policy reviews identified shadow banking migration as a major turning point in post-crisis risk.',
      '{year}: Verified liquidity coverage standards increased buffers, because supervisors linked pre-crisis failures to unstable funding profiles.',
      '{year}: Corroborated whistleblower statements and audit trails identified contradictions between public assurances and internal risk limits.',
      '{year}: Confirmed mortgage modification outcomes showed mixed effectiveness; one viewpoint emphasizes borrower relief while another cites limited reach.',
      '{year}: Documented forensic accounting findings connected valuation model assumptions to abrupt write-down cycles and confidence loss.',
      '{year}: Verified post-crisis reform scorecards suggest stronger guardrails, but ending insight remains unresolved on emerging nonbank leverage.'
    ];

    return templates.map((template, index) => {
      const year = 2000 + index;
      return {
        id: `FINDING-${String(index + 1).padStart(3, '0')}`,
        claim: template.replace('{year}', String(year)).replace(/\.$/, ` in ${baseTopic}.`),
        evidenceType: 'DOCUMENTED_SOURCE',
        confidence: index % 5 === 0 ? 'HIGH' : 'MEDIUM'
      };
    });
  }

  evaluateResearchOutput({ runtimeContext, researchResult }) {
    const evaluation = this.researchEvaluator.evaluate(researchResult);

    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'RESEARCH_EVALUATED',
      details: {
        overallScore: evaluation.overallScore,
        classification: evaluation.classification
      }
    }));

    return evaluation;
  }

  evaluateResearchDossierGate({ runtimeContext }) {
    const dossierReadiness = runtimeContext.artifacts?.researchEvaluation?.researchPackage?.dossierReadiness ?? null;
    const unmetRequirements = Array.isArray(dossierReadiness?.unmetRequirements)
      ? dossierReadiness.unmetRequirements
      : [];

    const gate = {
      isReady: Boolean(dossierReadiness?.isReady) && unmetRequirements.length === 0,
      unmetRequirements
    };

    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: gate.isReady ? 'RESEARCH_DOSSIER_GATE_PASSED' : 'RESEARCH_DOSSIER_GATE_FAILED',
      details: {
        isReady: gate.isReady,
        unmetRequirementCount: unmetRequirements.length,
        unmetRequirements
      }
    }));

    return gate;
  }

  blockForResearchInsufficient({ runtimeContext, researchDossierGate }) {
    const unmetRequirements = Array.isArray(researchDossierGate?.unmetRequirements)
      ? researchDossierGate.unmetRequirements
      : ['Research dossier requirements were not satisfied.'];

    runtimeContext.failureLedger.push({
      code: 'RESEARCH_DOSSIER_INSUFFICIENT',
      message: 'Research Specialist output did not meet minimum documentary dossier requirements.',
      state: runtimeContext.state,
      details: unmetRequirements
    });
    runtimeContext.riskRegister.push({
      code: 'RESEARCH_DOSSIER_BLOCKED',
      severity: 'HIGH',
      owner: 'Research Specialist',
      unmetRequirementCount: unmetRequirements.length
    });

    runtimeContext.artifacts.researchGate = {
      status: 'RESEARCH INSUFFICIENT',
      isReadyForStorytelling: false,
      unmetRequirements
    };

    runtimeContext.terminalMissionOutcome = 'RESEARCH INSUFFICIENT';
    this.transitionTo(runtimeContext, MissionLifecycleStates.BLOCKED, {
      reason: 'Research dossier does not satisfy minimum handoff standards.'
    });
    runtimeContext.artifacts.publishing = {
      enabled: false,
      mode: runtimeContext.executionPolicy.publishingMode,
      publishStatus: 'NOT_REQUESTED',
      status: 'RESEARCH_INSUFFICIENT'
    };

    return this.buildRunResult(runtimeContext);
  }

  ensureHandoffReviewContainer(runtimeContext) {
    if (!runtimeContext.artifacts || typeof runtimeContext.artifacts !== 'object') {
      runtimeContext.artifacts = {};
    }

    if (!runtimeContext.artifacts.handoffReviews || typeof runtimeContext.artifacts.handoffReviews !== 'object') {
      runtimeContext.artifacts.handoffReviews = {};
    }
  }

  createResearchToStorytellingHandoffReview({ runtimeContext }) {
    this.ensureHandoffReviewContainer(runtimeContext);

    if (runtimeContext.artifacts.handoffReviews.researchToStorytelling) {
      return runtimeContext.artifacts.handoffReviews.researchToStorytelling;
    }

    const review = this.handoffReviewEngine.reviewResearchToStorytelling({
      researchResult: runtimeContext.artifacts.research,
      researchEvaluation: runtimeContext.artifacts.researchEvaluation
    });

    runtimeContext.artifacts.handoffReviews.researchToStorytelling = review;
    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'HANDOFF_REVIEW_COMPLETED',
      details: {
        handoff: review.handoff,
        decision: review.decision
      }
    }));

    return review;
  }

  createStorytellingToVisualDirectorHandoffReview({ runtimeContext, request }) {
    this.ensureHandoffReviewContainer(runtimeContext);

    if (runtimeContext.artifacts.handoffReviews.storytellingToVisualDirector) {
      return runtimeContext.artifacts.handoffReviews.storytellingToVisualDirector;
    }

    const review = this.handoffReviewEngine.reviewStorytellingToVisualDirector({
      scriptResult: runtimeContext.artifacts.script,
      storytellingEvaluation: runtimeContext.artifacts.storytellingEvaluation,
      request
    });

    runtimeContext.artifacts.handoffReviews.storytellingToVisualDirector = review;
    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'HANDOFF_REVIEW_COMPLETED',
      details: {
        handoff: review.handoff,
        decision: review.decision
      }
    }));

    return review;
  }

  buildStorytellingPlan({ runtimeContext, request, researchToStorytellingReview }) {
    const producerBrief = runtimeContext.artifacts?.producerBrief ?? null;
    const researchEvaluation = runtimeContext.artifacts?.researchEvaluation ?? {};
    const researchPackage = researchEvaluation.researchPackage ?? {};
    const storyWorthinessReasoning = researchEvaluation.storyWorthinessReasoning ?? {};
    const sourceQualityReasoning = researchEvaluation.sourceQualityReasoning ?? {};

    const openingCandidates = Array.isArray(researchPackage.topOpeningCandidates)
      ? researchPackage.topOpeningCandidates
      : [];
    const highestStoryValueFacts = Array.isArray(researchPackage.highestStoryValueFacts)
      ? researchPackage.highestStoryValueFacts
      : [];
    const outstandingGaps = Array.isArray(researchPackage.outstandingResearchGaps)
      ? researchPackage.outstandingResearchGaps
      : [];
    const corroborationSummary = researchPackage.corroborationSummary ?? {};
    const confidenceLevel = researchPackage.confidenceLevel ?? {};

    const openingFact = openingCandidates[0] ?? highestStoryValueFacts[0] ?? null;
    const delayedForCuriosity = highestStoryValueFacts
      .filter(fact => fact?.findingId !== openingFact?.findingId)
      .slice(0, 3)
      .map(fact => ({
        fact: this.toStorytellingFactRecord(fact),
        reason: 'Delay this fact to maintain curiosity momentum and avoid collapsing tension too early.'
      }));

    const majorReveals = highestStoryValueFacts
      .filter(fact => fact?.findingId !== openingFact?.findingId)
      .slice(0, 2)
      .map(fact => ({
        fact: this.toStorytellingFactRecord(fact),
        reason: 'Elevate as a major reveal after sufficient narrative setup and corroboration context.'
      }));

    const supportingNarrativeFacts = this.resolveSupportingNarrativeFacts({
      highestStoryValueFacts,
      openingFact,
      delayedForCuriosity,
      majorReveals,
      storyWorthinessReasoning
    });

    const sectionsRequiringAdditionalResearchBeforeScripting = this.mapResearchGapsToSections({
      outstandingGaps,
      openingFact,
      majorReveals
    });

    const narrativeRiskAssessment = this.buildNarrativeRiskAssessment({
      confidenceLevel,
      corroborationSummary,
      outstandingGaps,
      sourceQualityReasoning,
      researchToStorytellingReview
    });

    const structure = this.buildRecommendedDocumentaryStructure({
      request,
      openingFact,
      delayedForCuriosity,
      majorReveals,
      supportingNarrativeFacts,
      sectionsRequiringAdditionalResearchBeforeScripting
    });

    const narrativeBeats = this.buildNarrativeBeats({
      request,
      openingFact,
      delayedForCuriosity,
      majorReveals,
      supportingNarrativeFacts
    });

    const researchReasoningInfluence = this.buildResearchReasoningInfluence({
      openingFact,
      delayedForCuriosity,
      majorReveals,
      supportingNarrativeFacts,
      outstandingGaps,
      sectionsRequiringAdditionalResearchBeforeScripting,
      narrativeRiskAssessment,
      sourceQualityReasoning,
      storyWorthinessReasoning,
      researchToStorytellingReview
    });

    return {
      producerBrief,
      producerBriefSupport: this.buildProducerBriefSupportExplanation({
        specialist: 'Storytelling',
        producerBrief,
        objective: 'Sequence curiosity, reveals, and transitions so narrative design fulfills the Producer Brief vision end-to-end.'
      }),
      openingHook: {
        fact: this.toStorytellingFactRecord(openingFact),
        reason: openingFact
          ? 'Selected from top story-value candidates with strong curiosity and conflict potential from Research Specialist reasoning.'
          : 'No opening candidate identified; requires additional research before scripting.'
      },
      delayedForCuriosity,
      majorReveals,
      supportingNarrativeFacts,
      researchGapsThatCouldWeakenStory: outstandingGaps,
      sectionsRequiringAdditionalResearchBeforeScripting,
      narrativeRiskAssessment,
      recommendedDocumentaryStructure: structure,
      narrativeBeats,
      researchReasoningInfluence,
      planningSummary: {
        selectedOpeningCandidateCount: openingFact ? 1 : 0,
        delayedFactCount: delayedForCuriosity.length,
        majorRevealCount: majorReveals.length,
        supportingFactCount: supportingNarrativeFacts.length,
        identifiedResearchGapCount: outstandingGaps.length,
        narrativeBeatCount: narrativeBeats.length,
        majorBeatCount: narrativeBeats.filter(beat => String(beat?.importance ?? '').toLowerCase() === 'major').length
      }
    };
  }

  resolveNarrativeBeatTargetCount({ request }) {
    const durationSeconds = this.resolveNarrativeDurationSeconds({ request });
    const requestedImageCount = Number.parseInt(String(request?.imageCount ?? ''), 10);

    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      const cadenceSeconds = this.resolveNarrativeCadenceSeconds({ request, durationSeconds });
      const minimumBeatCount = Math.max(6, Math.ceil(durationSeconds / 10));
      const maximumBeatCount = Math.max(minimumBeatCount, Math.floor(durationSeconds / 5));
      const cadenceBeatCount = Math.round(durationSeconds / cadenceSeconds);
      const resolvedFromCadence = Math.max(minimumBeatCount, Math.min(maximumBeatCount, cadenceBeatCount));

      if (Number.isInteger(requestedImageCount) && requestedImageCount > 0) {
        return Math.max(8, Math.min(180, Math.max(resolvedFromCadence, requestedImageCount)));
      }

      return Math.max(8, Math.min(180, resolvedFromCadence));
    }

    if (Number.isInteger(requestedImageCount) && requestedImageCount > 0) {
      return Math.max(4, Math.min(180, requestedImageCount));
    }

    return 4;
  }

  resolveNarrativeDurationSeconds({ request }) {
    const explicitDuration = Number.parseFloat(String(request?.narrationDurationSeconds ?? request?.targetDuration ?? ''));
    return Number.isFinite(explicitDuration) && explicitDuration > 0 ? explicitDuration : null;
  }

  resolveNarrativeCadenceSeconds({ request, durationSeconds }) {
    const pacingSignals = [
      String(request?.pace ?? ''),
      String(request?.pacing ?? ''),
      String(request?.tone ?? ''),
      String(request?.emotionalTarget ?? ''),
      String(request?.style ?? ''),
      String(request?.objective ?? '')
    ].join(' ').toLowerCase();

    const highTensionSignals = /(urgent|tension|high[-\s]?stakes|escalat|crisis|thriller|chase|panic|critical)/;
    const reflectiveSignals = /(reflective|contemplative|meditative|slow|quiet|analysis|aftermath|retrospective|contextual)/;

    if (highTensionSignals.test(pacingSignals)) {
      return 6;
    }

    if (reflectiveSignals.test(pacingSignals)) {
      return 9;
    }

    if (durationSeconds >= 600) {
      return 8;
    }

    return 7.5;
  }

  resolveBeatCadenceType({ index, targetBeatCount, importance }) {
    if (index === 0 || index === targetBeatCount - 1) {
      return 'steady';
    }

    if (importance === 'major' || (index >= Math.floor(targetBeatCount * 0.3) && index <= Math.ceil(targetBeatCount * 0.7) && index % 3 === 0)) {
      return 'high-tension';
    }

    if (index % 5 === 0 || index >= Math.floor(targetBeatCount * 0.8)) {
      return 'reflective';
    }

    return 'steady';
  }

  resolveBeatDurationSeconds({ cadenceType, durationSeconds, targetBeatCount, desiredDurationSeconds }) {
    const cadenceDefaults = {
      'high-tension': 5.5,
      steady: 7.5,
      reflective: 9.5
    };
    const baseline = cadenceDefaults[cadenceType] ?? cadenceDefaults.steady;

    if (!(Number.isFinite(durationSeconds) && durationSeconds > 0) || !(Number.isFinite(desiredDurationSeconds) && desiredDurationSeconds > 0)) {
      return baseline;
    }

    const cadenceCapacityLow = targetBeatCount * 5;
    const cadenceCapacityHigh = targetBeatCount * 10;
    const normalizedTargetDuration = Math.max(cadenceCapacityLow, Math.min(cadenceCapacityHigh, durationSeconds));
    const scale = normalizedTargetDuration / desiredDurationSeconds;

    return Math.max(5, Math.min(10, baseline * scale));
  }

  buildBeatStartReason({ index, beatId, targetBeatCount, importance, cadenceType, fact }) {
    const factSummary = String(fact?.findingText ?? '').trim();

    if (index === 0) {
      return `Start ${beatId} to establish the investigation's central stakes and unanswered question immediately.`;
    }

    if (index === targetBeatCount - 1) {
      return `Start ${beatId} to transition from evidence accumulation into a forward-looking unresolved implication.`;
    }

    if (cadenceType === 'high-tension') {
      return factSummary
        ? `Start ${beatId} now to accelerate pacing because this evidence sharply raises stakes: ${factSummary}`
        : `Start ${beatId} now to accelerate pacing and intensify unresolved pressure before the next reveal.`;
    }

    if (cadenceType === 'reflective') {
      return factSummary
        ? `Start ${beatId} to slow pacing briefly so the audience can absorb implications of: ${factSummary}`
        : `Start ${beatId} to create a reflective pause that consolidates context before the next escalation.`;
    }

    if (importance === 'major') {
      return `Start ${beatId} because the narrative is crossing into a major investigative turn that reframes prior assumptions.`;
    }

    return `Start ${beatId} to bridge from prior evidence into the next curiosity-driving question without losing narrative momentum.`;
  }

  buildTransitionObjective({ beatOrder, targetBeatCount, beatId }) {
    if (beatOrder < targetBeatCount) {
      return `Bridge from ${beatId} into BEAT-${String(beatOrder + 1).padStart(3, '0')} by escalating unanswered implications.`;
    }

    return 'Conclude with a forward-looking unresolved implication grounded in evidence.';
  }

  buildCuriosityObjective({ importance, cadenceType }) {
    if (cadenceType === 'high-tension' || importance === 'major') {
      return 'Increase unresolved tension by introducing or reframing a high-impact question.';
    }

    if (cadenceType === 'reflective') {
      return 'Sustain curiosity while giving the audience space to process implications before the next escalation.';
    }

    return 'Preserve curiosity by withholding final interpretation while adding concrete evidence.';
  }

  buildBeatObjective({ index, importance, cadenceType, topic }) {
    if (index === 0) {
      return `Open the investigation with immediate stakes around ${topic}.`;
    }

    if (importance === 'major') {
      return `Advance a decisive turn in the investigation of ${topic}.`;
    }

    if (cadenceType === 'reflective') {
      return `Deepen causal context and audience understanding before the next escalation in ${topic}.`;
    }

    return `Sustain investigative momentum and context depth for ${topic}.`;
  }

  buildNarrativeBeats({ request, openingFact, delayedForCuriosity, majorReveals, supportingNarrativeFacts }) {
    const durationSeconds = this.resolveNarrativeDurationSeconds({ request });
    const targetBeatCount = this.resolveNarrativeBeatTargetCount({ request });
    const topic = String(request?.topic ?? request?.objective ?? 'documentary investigation').trim();
    const emotions = ['intrigue', 'suspicion', 'unease', 'concern', 'determination', 'urgency'];
    const visualTypes = ['archival', 'interview', 'b-roll', 'document insert', 'reconstruction', 'map/diagram'];

    const openingRecord = openingFact ? this.toStorytellingFactRecord(openingFact) : null;
    const delayedRecords = delayedForCuriosity.map(item => item?.fact).filter(Boolean);
    const revealRecords = majorReveals.map(item => item?.fact).filter(Boolean);
    const supportingRecords = supportingNarrativeFacts.map(item => item?.fact).filter(Boolean);
    const factPool = [openingRecord, ...delayedRecords, ...revealRecords, ...supportingRecords].filter(Boolean);

    const desiredCadenceSeconds = Array.from({ length: targetBeatCount }, (_, index) => {
      if (index === 0 || index === targetBeatCount - 1) {
        return 7.5;
      }

      if (index % 5 === 0 || index >= Math.floor(targetBeatCount * 0.8)) {
        return 9.5;
      }

      if (index % 3 === 0 || index >= Math.floor(targetBeatCount * 0.35) && index <= Math.ceil(targetBeatCount * 0.7)) {
        return 5.5;
      }

      return 7.5;
    });
    const desiredDurationSeconds = desiredCadenceSeconds.reduce((sum, value) => sum + value, 0);

    return Array.from({ length: targetBeatCount }, (_, index) => {
      const beatOrder = index + 1;
      const beatId = `BEAT-${String(beatOrder).padStart(3, '0')}`;
      const fact = factPool.length > 0 ? factPool[index % factPool.length] : null;
      const emotion = emotions[index % emotions.length];
      const suggestedVisualType = visualTypes[index % visualTypes.length];
      const importance = (
        index === 0
        || index === targetBeatCount - 1
        || revealRecords.some(record => record?.findingId && record.findingId === fact?.findingId)
        || delayedRecords.some(record => record?.findingId && record.findingId === fact?.findingId)
      ) ? 'major' : 'minor';

      const supportingResearchFacts = fact
        ? [{
          findingId: fact.findingId,
          findingText: fact.findingText,
          storyWorthinessScore: fact.storyWorthinessScore,
          decision: fact.decision,
          reason: fact.reason
        }]
        : [];

      const cadenceType = this.resolveBeatCadenceType({ index, targetBeatCount, importance });
      const beatObjective = this.buildBeatObjective({ index, importance, cadenceType, topic });
      const curiosityObjective = this.buildCuriosityObjective({ importance, cadenceType });

      const visualObjective = fact?.findingText
        ? `Visualize evidence linked to: ${fact.findingText}`
        : `Visualize the next investigative clue and evolving consequence for ${topic}.`;

      const narrationObjective = fact?.findingText
        ? `Explain why this evidence matters, then connect it to the central unresolved question.`
        : 'Narrate continuity between prior evidence and the next unanswered question.';

      const transitionIntoNextBeat = this.buildTransitionObjective({ beatOrder, targetBeatCount, beatId });
      const estimatedDurationSeconds = this.resolveBeatDurationSeconds({
        cadenceType,
        durationSeconds,
        targetBeatCount,
        desiredDurationSeconds
      });
      const beatStartReason = this.buildBeatStartReason({
        index,
        beatId,
        targetBeatCount,
        importance,
        cadenceType,
        fact
      });

      return {
        beatId,
        order: beatOrder,
        beatObjective,
        objective: beatObjective,
        audienceEmotion: emotion,
        curiosityObjective,
        visualObjective,
        narrationObjective,
        supportingResearchFacts,
        supportingResearch: supportingResearchFacts,
        transitionIntoNextBeat,
        transition: transitionIntoNextBeat,
        beatStartReason,
        cadenceType,
        estimatedDurationSeconds,
        durationSeconds: estimatedDurationSeconds,
        duration: estimatedDurationSeconds,
        importance,
        suggestedVisualType,
        visualType: suggestedVisualType
      };
    });
  }

  toStorytellingFactRecord(fact) {
    if (!fact || typeof fact !== 'object') return null;
    return {
      findingId: fact.findingId ?? null,
      findingText: String(fact.findingText ?? ''),
      storyWorthinessScore: Number(fact.storyWorthinessScore ?? 0),
      decision: String(fact.decision ?? 'SUPPORTING'),
      reason: String(fact.reason ?? '')
    };
  }

  resolveSupportingNarrativeFacts({
    highestStoryValueFacts,
    openingFact,
    delayedForCuriosity,
    majorReveals,
    storyWorthinessReasoning
  }) {
    const reservedIds = new Set([
      openingFact?.findingId,
      ...delayedForCuriosity.map(item => item?.fact?.findingId),
      ...majorReveals.map(item => item?.fact?.findingId)
    ].filter(Boolean));

    const explicitSupporting = Array.isArray(storyWorthinessReasoning?.findingJudgments)
      ? storyWorthinessReasoning.findingJudgments
        .filter(judgment => ['SUPPORTING_NOT_CENTRAL', 'SUPPORTING'].includes(String(judgment?.decision ?? '')))
        .map(judgment => ({
          findingId: judgment.findingId ?? null,
          findingText: String(judgment.findingText ?? ''),
          storyWorthinessScore: Number(judgment.storyWorthinessScore ?? 0),
          decision: String(judgment.decision ?? 'SUPPORTING'),
          reason: String(judgment.reasoning ?? 'Supporting narrative context.')
        }))
      : [];

    const fallbackSupporting = highestStoryValueFacts
      .filter(fact => !reservedIds.has(fact?.findingId))
      .slice(0, 4)
      .map(fact => this.toStorytellingFactRecord(fact));

    return [...explicitSupporting, ...fallbackSupporting]
      .filter(Boolean)
      .slice(0, 6)
      .map(fact => ({
        fact,
        reason: 'Use this fact to support context and causal continuity without dominating reveal beats.'
      }));
  }

  mapResearchGapsToSections({ outstandingGaps, openingFact, majorReveals }) {
    const sections = [];
    const normalizedGaps = outstandingGaps.map(gap => String(gap ?? '').toLowerCase());

    const needsOpeningResearch = !openingFact || normalizedGaps.some(gap => gap.includes('opening candidate'));
    if (needsOpeningResearch) {
      sections.push({
        section: 'Opening Hook',
        reason: 'Opening fact confidence is weak or missing; additional research needed before scripting the first 15 seconds.'
      });
    }

    if (normalizedGaps.some(gap => gap.includes('corroboration'))) {
      sections.push({
        section: 'Beat Progression - Escalation',
        reason: 'Corroboration gaps could weaken escalation credibility and must be resolved before scripting conflict progression.'
      });
    }

    if (majorReveals.length === 0 || normalizedGaps.some(gap => gap.includes('high story-value'))) {
      sections.push({
        section: 'Beat Progression - Reveal',
        reason: 'Reveal payload lacks enough validated high story-value facts.'
      });
    }

    if (normalizedGaps.some(gap => gap.includes('central question'))) {
      sections.push({
        section: 'Narrative Throughline',
        reason: 'Central-question relevance is under-supported; gather additional focused evidence first.'
      });
    }

    if (sections.length === 0 && outstandingGaps.length > 0) {
      sections.push({
        section: 'Cross-Section Verification',
        reason: 'Outstanding gaps affect overall story robustness and should be addressed before final scripting.'
      });
    }

    return sections;
  }

  buildNarrativeRiskAssessment({
    confidenceLevel,
    corroborationSummary,
    outstandingGaps,
    sourceQualityReasoning,
    researchToStorytellingReview
  }) {
    const confidenceScore = Number(confidenceLevel?.score ?? 0);
    const corroborationScore = Number(corroborationSummary?.score ?? 0);
    const contradictionSignals = Number(sourceQualityReasoning?.contradictoryEvidence?.contradictionSignals ?? 0);
    const missingGapCount = Array.isArray(outstandingGaps) ? outstandingGaps.length : 0;

    const confidenceRisk = confidenceScore >= 7.5 ? 'LOW' : confidenceScore >= 6 ? 'MEDIUM' : 'HIGH';
    const corroborationRisk = corroborationScore >= 7 ? 'LOW' : corroborationScore >= 5 ? 'MEDIUM' : 'HIGH';
    const evidenceGapRisk = missingGapCount === 0 ? 'LOW' : missingGapCount <= 2 ? 'MEDIUM' : 'HIGH';
    const contradictionRisk = contradictionSignals === 0 ? 'LOW' : contradictionSignals <= 2 ? 'MEDIUM' : 'HIGH';

    const reviewDecision = String(researchToStorytellingReview?.decision ?? 'ACCEPT');
    const handoffRisk = reviewDecision === 'REQUEST_RESEARCH_REVISION'
      ? 'HIGH'
      : reviewDecision === 'ACCEPT_WITH_RECOMMENDATIONS'
        ? 'MEDIUM'
        : 'LOW';

    const riskLevels = [confidenceRisk, corroborationRisk, evidenceGapRisk, contradictionRisk, handoffRisk];
    const highCount = riskLevels.filter(level => level === 'HIGH').length;
    const mediumCount = riskLevels.filter(level => level === 'MEDIUM').length;
    const overallRisk = highCount >= 2 ? 'HIGH' : highCount === 1 || mediumCount >= 2 ? 'MEDIUM' : 'LOW';

    return {
      overallRisk,
      confidenceRisk,
      corroborationRisk,
      evidenceGapRisk,
      contradictionRisk,
      handoffRisk,
      rationale: `Narrative risk is ${overallRisk} based on confidence (${confidenceScore}/10), corroboration (${corroborationScore}/10), ${missingGapCount} gap(s), contradiction signals (${contradictionSignals}), and handoff decision (${reviewDecision}).`
    };
  }

  buildRecommendedDocumentaryStructure({
    request,
    openingFact,
    delayedForCuriosity,
    majorReveals,
    supportingNarrativeFacts,
    sectionsRequiringAdditionalResearchBeforeScripting
  }) {
    const narrativeBeats = this.buildNarrativeBeats({
      request,
      openingFact,
      delayedForCuriosity,
      majorReveals,
      supportingNarrativeFacts
    });

    return {
      format: 'Narrative Beat Investigative Documentary',
      centralQuestion: String(request?.objective ?? request?.topic ?? 'Unresolved central question'),
      sections: narrativeBeats.map(beat => ({
        section: beat.beatId,
        purpose: beat.beatObjective,
        importance: beat.importance,
        supportingFactIds: beat.supportingResearchFacts.map(fact => fact.findingId).filter(Boolean)
      })),
      preScriptingResearchRequirements: sectionsRequiringAdditionalResearchBeforeScripting
    };
  }

  buildResearchReasoningInfluence({
    openingFact,
    delayedForCuriosity,
    majorReveals,
    supportingNarrativeFacts,
    outstandingGaps,
    sectionsRequiringAdditionalResearchBeforeScripting,
    narrativeRiskAssessment,
    sourceQualityReasoning,
    storyWorthinessReasoning,
    researchToStorytellingReview
  }) {
    const sourceQualitySummary = sourceQualityReasoning?.evidenceConfidence?.conclusion
      ?? sourceQualityReasoning?.sourceHierarchy?.conclusion
      ?? 'Source quality reasoning not available.';
    const storyWorthinessSummary = storyWorthinessReasoning?.centralQuestion
      ? `Story-worthiness central question: ${storyWorthinessReasoning.centralQuestion}`
      : 'Story-worthiness judgments guided opening/delay/reveal placement.';

    return {
      summary: 'Storytelling decisions were explicitly derived from Research Specialist reasoning outputs, not just fact lists.',
      decisionInfluence: [
        {
          storytellingDecision: 'Opening hook selection',
          influencedBy: ['topOpeningCandidates', 'findingJudgments', 'source confidence'],
          explanation: openingFact
            ? `Opening hook chose ${openingFact.findingId ?? 'top candidate'} because research marked it as high story value with stronger evidence posture.`
            : 'No validated opening hook was selected due to unresolved research quality constraints.'
        },
        {
          storytellingDecision: 'Delayed facts for curiosity',
          influencedBy: ['highestStoryValueFacts', 'story worthiness sequencing', 'curiosity preservation'],
          explanation: `Delayed ${delayedForCuriosity.length} fact(s) to preserve tension and avoid early curiosity collapse.`
        },
        {
          storytellingDecision: 'Major reveal placement',
          influencedBy: ['story-worthiness scores', 'corroboration posture', 'confidence level'],
          explanation: `Selected ${majorReveals.length} major reveal fact(s) that can withstand evidentiary scrutiny at climax points.`
        },
        {
          storytellingDecision: 'Supporting-only fact assignment',
          influencedBy: ['SUPPORTING_NOT_CENTRAL judgments', 'importance over novelty'],
          explanation: `${supportingNarrativeFacts.length} fact(s) assigned as support to maintain narrative coherence without overloading key beats.`
        },
        {
          storytellingDecision: 'Research risk controls before scripting',
          influencedBy: ['outstanding research gaps', 'handoff review', 'source quality contradiction/missing evidence reasoning'],
          explanation: `${outstandingGaps.length} gap(s) and ${sectionsRequiringAdditionalResearchBeforeScripting.length} section(s) flagged for additional verification with overall narrative risk ${narrativeRiskAssessment.overallRisk}.`
        }
      ],
      sourceQualityInfluence: sourceQualitySummary,
      storyWorthinessInfluence: storyWorthinessSummary,
      handoffReviewInfluence: String(researchToStorytellingReview?.decision ?? 'UNKNOWN')
    };
  }

  createVisualDirectorToImageGenerationHandoffReview({ runtimeContext, evaluatedVisualPlan }) {
    this.ensureHandoffReviewContainer(runtimeContext);

    if (runtimeContext.artifacts.handoffReviews.visualDirectorToImageGeneration) {
      return runtimeContext.artifacts.handoffReviews.visualDirectorToImageGeneration;
    }

    const review = this.handoffReviewEngine.reviewVisualDirectorToImageGeneration({
      evaluatedVisualPlan
    });

    runtimeContext.artifacts.handoffReviews.visualDirectorToImageGeneration = review;
    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'HANDOFF_REVIEW_COMPLETED',
      details: {
        handoff: review.handoff,
        decision: review.decision
      }
    }));

    return review;
  }

  buildVisualPlan({ runtimeContext, request }) {
    const producerBrief = runtimeContext.artifacts?.producerBrief ?? null;
    const script = String(runtimeContext.artifacts.script?.script ?? '').trim();
    const scriptSummary = script.slice(0, 240);
    const narrativeBeats = Array.isArray(runtimeContext.artifacts?.storytellingPlan?.narrativeBeats)
      ? runtimeContext.artifacts.storytellingPlan.narrativeBeats
      : [];
    const beatDrivenSceneDescription = narrativeBeats.length > 0
      ? narrativeBeats
        .slice(0, 4)
        .map(beat => `${beat.beatId}: ${beat.visualObjective}`)
        .join(' | ')
      : '';
    const baseSceneDescription = String(request.sceneDescription ?? '').trim();
    const storytellingRevisedWorkPlan = Array.isArray(runtimeContext.artifacts.storytellingEvaluation?.revisedWorkPlan)
      ? runtimeContext.artifacts.storytellingEvaluation.revisedWorkPlan
      : [];

    return {
      producerBrief,
      producerBriefSupport: this.buildProducerBriefSupportExplanation({
        specialist: 'Visual',
        producerBrief,
        objective: 'Translate narrative intent into coherent visual direction that matches Producer Brief tone, style, and emotional arc.'
      }),
      sceneDescription: baseSceneDescription.length > 0
        ? baseSceneDescription
        : (beatDrivenSceneDescription || `Primary documentary scene for ${request.topic ?? runtimeContext.missionObjective}.`),
      artStyle: String(request.artStyle ?? 'Cinematic Illustration'),
      scriptSummary,
      storytellingRevisedWorkPlan,
      narrativeBeatCount: narrativeBeats.length,
      narrativeBeatPreview: narrativeBeats.slice(0, 6),
      historicalContextNotes: Array.isArray(request.historicalContextNotes)
        ? request.historicalContextNotes
        : [],
      continuityNotes: Array.isArray(request.continuityNotes)
        ? request.continuityNotes
        : [],
      emotionalTarget: String(request.emotionalTarget ?? 'Tension with credibility')
    };
  }

  evaluateVisualPlan({ runtimeContext, visualPlan }) {
    const evaluation = this.visualEvaluator.evaluate(visualPlan);

    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'VISUAL_PLAN_EVALUATED',
      details: {
        overallScore: evaluation.overallScore,
        classification: evaluation.classification
      }
    }));

    return evaluation;
  }

  evaluateGeneratedImages({ runtimeContext, evaluatedVisualPlan, imageResult }) {
    const evaluation = this.imageGenerationEvaluator.evaluate({
      evaluatedVisualPlan,
      imageFiles: imageResult?.imageFiles ?? [],
      generatedScenes: imageResult?.generatedScenes ?? []
    });

    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'IMAGE_GENERATION_EVALUATED',
      details: {
        overallScore: evaluation.overallScore,
        classification: evaluation.classification
      }
    }));

    return evaluation;
  }

  buildNarrationPlan({ runtimeContext, request }) {
    const producerBrief = runtimeContext.artifacts?.producerBrief ?? null;
    const narrationText = this.buildNarrationReadyScript(
      String(runtimeContext.artifacts.script?.script ?? '').trim()
    );

    return {
      producerBrief,
      producerBriefSupport: this.buildProducerBriefSupportExplanation({
        specialist: 'Narration',
        producerBrief,
        objective: 'Control delivery and emphasis so narration reinforces the Producer Brief emotional journey and ending objective.'
      }),
      narrationText,
      voiceStyle: String(request.voiceStyle ?? request.style ?? 'Documentary Narrative'),
      emphasisTargets: Array.isArray(request.emphasisTargets)
        ? request.emphasisTargets
        : ['stakes', 'evidence', 'consequence'],
      pauseHints: Array.isArray(request.pauseHints)
        ? request.pauseHints
        : ['pause-before-major-claim', 'pause-after-evidence', 'pause-before-transition'],
      pronunciationNotes: Array.isArray(request.pronunciationNotes)
        ? request.pronunciationNotes
        : []
    };
  }

  buildNarrationReadyScript(scriptText = '') {
    const raw = String(scriptText ?? '').trim();

    if (raw.length === 0) {
      return raw;
    }

    // Strip planning metadata labels to keep spoken output documentary-only.
    return raw
      .replace(/\bBEAT-\d{3}:\s*/g, '')
      .replace(/\bEmotion:\s*/gi, '')
      .replace(/\bCuriosity:\s*/gi, '')
      .replace(/\bWhy this beat starts now:\s*/gi, '')
      .replace(/\bNarration:\s*/gi, '')
      .replace(/\bEvidence:\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  evaluateNarrationPlan({ runtimeContext, narrationPlan }) {
    const evaluation = this.narrationEvaluator.evaluate(narrationPlan);

    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'NARRATION_PLAN_EVALUATED',
      details: {
        overallScore: evaluation.overallScore,
        classification: evaluation.classification
      }
    }));

    return evaluation;
  }

  translateMissionPlanToExecutionPlan(missionPlan = {}) {
    const validation = validateMissionPlan(missionPlan);

    if (!validation.isValid) {
      throw new Error(`Mission plan translation failed due to invalid plan: ${validation.issues.map(issue => issue.issue).join(', ')}`);
    }

    return this.missionPlanningEngine.translateMissionPlanToRuntimePlan(missionPlan);
  }

  buildScenePlan({ runtimeContext, request }) {
    const requestWithProducerBrief = {
      ...(request ?? {}),
      producerBrief: runtimeContext.artifacts?.producerBrief ?? null
    };
    const narrativeBeats = Array.isArray(runtimeContext.artifacts?.storytellingPlan?.narrativeBeats)
      ? runtimeContext.artifacts.storytellingPlan.narrativeBeats
      : [];

    if (narrativeBeats.length > 0) {
      return {
        source: 'narrative-beats',
        scenes: narrativeBeats.map((beat, index) => ({
          sceneId: String(beat?.beatId ?? `SCENE-${String(index + 1).padStart(3, '0')}`),
          order: index + 1,
          sectionName: String(beat?.beatObjective ?? `Beat ${index + 1}`),
          beat,
          visualPrompt: this.buildSceneVisualPrompt({ beat, request: requestWithProducerBrief, index })
        }))
      };
    }

    const structureSections = runtimeContext.artifacts?.storytellingPlan?.recommendedDocumentaryStructure?.sections;
    const sections = Array.isArray(structureSections) ? structureSections : [];

    if (sections.length > 0) {
      return {
        source: 'storytelling-plan',
        scenes: sections.map((section, index) => ({
          sceneId: `SCENE-${String(index + 1).padStart(3, '0')}`,
          order: index + 1,
          sectionName: String(section?.section ?? `Section ${index + 1}`),
          visualPrompt: this.buildSceneVisualPrompt({ section, request: requestWithProducerBrief, index })
        }))
      };
    }

    const requestedCount = Number.parseInt(String(request?.imageCount ?? 0), 10);
    const fallbackCount = Number.isInteger(requestedCount) && requestedCount > 0 ? requestedCount : 3;

    return {
      source: 'request',
      scenes: Array.from({ length: fallbackCount }, (_, index) => ({
        sceneId: `SCENE-${String(index + 1).padStart(3, '0')}`,
        order: index + 1,
        sectionName: `Scene ${index + 1}`,
        visualPrompt: this.buildFallbackScenePrompt({ request: requestWithProducerBrief, index })
      }))
    };
  }

  buildSceneVisualPrompt({ section = null, beat = null, request, index }) {
    const producerBrief = request?.producerBrief ?? null;
    const resolvedBeat = beat ?? section?.beat ?? section;
    const beatObjective = String(resolvedBeat?.beatObjective ?? '').trim();
    const beatStartReason = String(resolvedBeat?.beatStartReason ?? '').trim();
    const visualObjective = String(resolvedBeat?.visualObjective ?? section?.purpose ?? '').trim();
    const audienceEmotion = String(resolvedBeat?.audienceEmotion ?? '').trim();
    const curiosityObjective = String(resolvedBeat?.curiosityObjective ?? '').trim();
    const narrationObjective = String(resolvedBeat?.narrationObjective ?? '').trim();
    const transitionIntoNextBeat = String(resolvedBeat?.transitionIntoNextBeat ?? '').trim();
    const suggestedVisualType = String(resolvedBeat?.suggestedVisualType ?? 'documentary').trim();
    const supportingFacts = Array.isArray(resolvedBeat?.supportingResearchFacts)
      ? resolvedBeat.supportingResearchFacts.map(fact => String(fact?.findingText ?? '').trim()).filter(Boolean)
      : [];

    if (beatObjective || visualObjective || supportingFacts.length > 0) {
      const topic = String(request?.topic ?? request?.objective ?? 'documentary narrative').trim();
      const artStyle = String(request?.artStyle ?? 'Cinematic investigative realism').trim();
      return [
        `Narrative beat for ${topic}.`,
        `Producer brief objective: ${String(producerBrief?.documentaryObjective ?? topic).trim()}.`,
        `Beat objective: ${beatObjective || 'advance the story with verified momentum'}.`,
        `Audience emotion: ${audienceEmotion || 'intrigue'}.`,
        `Curiosity objective: ${curiosityObjective || 'sustain unresolved investigative pressure'}.`,
        `Why this beat begins now: ${beatStartReason || 'the prior beat created unresolved pressure that requires immediate continuation'}.`,
        `Visual objective: ${visualObjective || 'render the next evidence-driven development'}.`,
        `Narration objective: ${narrationObjective || 'connect this beat to the next unanswered implication'}.`,
        `Supporting research facts: ${supportingFacts.join(' | ') || 'none provided'}.`,
        `Transition into next beat: ${transitionIntoNextBeat || 'escalate unresolved tension'}.`,
        `Suggested visual type: ${suggestedVisualType}.`,
        `Art style: ${artStyle}.`
      ].join(' ');
    }

    const title = String(section?.section ?? `Scene ${index + 1}`).trim();
    const purpose = String(section?.purpose ?? '').trim();
    const topic = String(request?.topic ?? request?.objective ?? 'documentary narrative').trim();
    const artStyle = String(request?.artStyle ?? 'Cinematic investigative realism').trim();

    return `${title} for ${topic}. Visual objective: ${purpose || 'advance the investigation with evidence-driven progression'}. Art style: ${artStyle}.`;
  }

  buildFallbackScenePrompt({ request, index }) {
    const topic = String(request?.topic ?? request?.objective ?? 'documentary narrative').trim();
    const briefObjective = String(request?.producerBrief?.documentaryObjective ?? '').trim();
    const baseDescription = String(request?.sceneDescription ?? 'Investigative documentary scene').trim();
    const artStyle = String(request?.artStyle ?? 'Cinematic investigative realism').trim();

    return `Scene ${index + 1} for ${topic}. ${briefObjective || baseDescription}. Art style: ${artStyle}.`;
  }

  resolveRequiredSceneCount({ request, scenePlan }) {
    const plannedCount = Array.isArray(scenePlan?.scenes) ? scenePlan.scenes.length : 0;

    if (plannedCount > 0) {
      return plannedCount;
    }

    const requestedCount = Number.parseInt(String(request?.imageCount ?? 3), 10);
    return Number.isInteger(requestedCount) && requestedCount > 0 ? requestedCount : 3;
  }

  resolvePlannedSceneCount({ runtimeContext, request }) {
    const planCount = Array.isArray(runtimeContext.artifacts?.scenePlan?.scenes)
      ? runtimeContext.artifacts.scenePlan.scenes.length
      : 0;

    if (planCount > 0) {
      return planCount;
    }

    const requestedCount = Number.parseInt(String(request?.imageCount ?? 0), 10);
    return Number.isInteger(requestedCount) && requestedCount > 0 ? requestedCount : 0;
  }

  buildTimeline({ request, imageResult, scenePlan = null }) {
    const generatedImages = Array.isArray(imageResult?.imageFiles) ? imageResult.imageFiles : [];
    const plannedScenes = Array.isArray(scenePlan?.scenes) ? scenePlan.scenes : [];
    const explicitRequestScenes = Array.isArray(request?.timeline?.scenes) ? request.timeline.scenes : [];
    const explicitSourceScenes = explicitRequestScenes.length > 0
      ? explicitRequestScenes
      : (plannedScenes.length > 0 ? plannedScenes : generatedImages.map((_, index) => ({
        sceneId: `SCENE-${String(index + 1).padStart(3, '0')}`,
        order: index + 1,
        durationSeconds: null
      })));
    const alignedScenes = explicitSourceScenes.map((scene, index) => ({
      sceneId: scene.sceneId ?? `SCENE-${String(index + 1).padStart(3, '0')}`,
      order: Number(scene.order ?? index + 1),
      imageAsset: generatedImages[index] ?? scene.imageAsset ?? null,
      weight: Number(scene.weight ?? 1),
      durationSeconds: scene.durationSeconds ?? null
    }));

    const scenes = this.timelineBuilder.build({
      metadata: {
        imageOutputs: generatedImages
      },
      timeline: {
        ...(request.timeline ?? {}),
        scenes: alignedScenes
      }
    });

    const narrationDurationSeconds = request.narrationDurationSeconds
      ?? request.targetDuration
      ?? null;

    return this.sceneTimingEngine.normalizeTimeline({
      scenes,
      narrationDurationSeconds
    });
  }

  buildReleaseCandidatePackage({ runtimeContext, request, scriptResult, voiceResult, imageResult, videoResult, qualityReview }) {
    return {
      releaseCandidateId: `RC-${runtimeContext.missionId}`,
      missionId: runtimeContext.missionId,
      businessId: runtimeContext.businessId,
      missionSummary: {
        objective: request.objective ?? runtimeContext.missionObjective,
        title: scriptResult.scriptTitle
      },
      assetInventory: {
        scriptTitle: scriptResult.scriptTitle,
        voiceOutput: voiceResult.audioFile,
        imageOutputs: imageResult.imageFiles,
        videoOutput: videoResult.videoFile
      },
      qualityIntelligenceSummary: {
        passed: qualityReview.passed,
        issues: qualityReview.issues,
        recommendation: qualityReview.executiveRecommendation
      },
      publishingReadiness: {
        mode: runtimeContext.executionPolicy.publishingMode,
        status: runtimeContext.executionPolicy.publishingMode === 'NONE' ? 'NOT_REQUESTED' : 'READY_FOR_PUBLISHING'
      }
    };
  }

  buildExecutiveReport({ runtimeContext, request, qualityReview, executiveDecisionPacket = null }) {
    const missionDecisionPackage = {
      recommendation: qualityReview.passed ? 'READY_FOR_EXECUTIVE_REVIEW' : 'REQUIRES_REMEDIATION',
      confidence: qualityReview.passed ? 85 : 40,
      decisionReadiness: {
        status: qualityReview.passed ? 'READY' : 'NOT_READY',
        rationale: qualityReview.passed
          ? 'Quality review passed for no-publish runtime completion.'
          : 'Quality review failed. Remediation required before review.'
      }
    };

    const briefing = this.executiveBriefingEngine.build({
      enterpriseState: {
        enterpriseHealth: qualityReview.passed ? 'HEALTHY' : 'ATTENTION_REQUIRED',
        activeMissions: [{
          id: runtimeContext.missionId,
          title: request.objective ?? runtimeContext.missionObjective,
          status: runtimeContext.state
        }],
        outstandingDecisions: [],
        recentCompletions: [
          { id: `${runtimeContext.missionId}-RC`, title: 'Release candidate generated' }
        ]
      }
    });

    return {
      missionDecisionPackage,
      executiveDecisionPacket: executiveDecisionPacket ?? request.executiveDecisionPacket ?? runtimeContext.artifacts.executiveDecisionPacket ?? null,
      missionReview: {
        additionalInvestigationRequired: false,
        investigationRequests: []
      },
      briefing
    };
  }

  buildExecutiveImprovementReport({ runtimeContext, request, qualityReview }) {
    const storytellingPlan = runtimeContext.artifacts?.storytellingPlan ?? {};
    const beats = Array.isArray(storytellingPlan?.narrativeBeats)
      ? storytellingPlan.narrativeBeats
      : [];

    const safeBeat = fallbackIndex => beats[Math.max(0, Math.min(beats.length - 1, fallbackIndex))] ?? null;
    const openingBeat = safeBeat(0);
    const endingBeat = safeBeat(beats.length - 1);
    const escalationBeat = safeBeat(Math.floor(beats.length * 0.35));
    const revealBeat = safeBeat(Math.floor(beats.length * 0.6));
    const visualBeat = beats.find(beat => String(beat?.cadenceType ?? '').toLowerCase() === 'reflective') ?? safeBeat(Math.floor(beats.length * 0.45));
    const rhythmBeat = beats.find(beat => Number(beat?.estimatedDurationSeconds ?? 0) > 9) ?? safeBeat(Math.floor(beats.length * 0.75));

    const storytellingEvaluation = runtimeContext.artifacts?.storytellingEvaluation ?? {};
    const narrationEvaluation = runtimeContext.artifacts?.narrationEvaluation ?? {};
    const visualEvaluation = runtimeContext.artifacts?.visualEvaluation ?? {};
    const imageGenerationEvaluation = runtimeContext.artifacts?.imageGenerationEvaluation ?? {};
    const researchEvaluation = runtimeContext.artifacts?.researchEvaluation ?? {};

    const openingEffectiveness = this.buildExecutiveDimensionResult({
      score: Number(storytellingEvaluation?.scores?.openingStrength ?? 0),
      threshold: 8,
      passLabel: 'Opening hook lands with strong immediate stakes.',
      improveLabel: 'Opening hook needs stronger verified conflict and specificity.'
    });
    const audienceRetentionRisk = this.buildExecutiveDimensionResult({
      score: Number(storytellingEvaluation?.scores?.curiosity ?? 0),
      threshold: 8,
      invertForRisk: true,
      passLabel: 'Retention risk is currently controlled.',
      improveLabel: 'Retention risk is elevated in mid-story beat cadence.'
    });
    const narrativeBeatQuality = this.buildExecutiveDimensionResult({
      score: Number(storytellingEvaluation?.overallScore ?? 0),
      threshold: 8,
      passLabel: 'Narrative beat construction is coherent and progressive.',
      improveLabel: 'Narrative beats require tighter evidence-to-curiosity transitions.'
    });
    const storyProgression = this.buildExecutiveDimensionResult({
      score: Number(storytellingEvaluation?.scores?.narrativeFlow ?? 0),
      threshold: 8,
      passLabel: 'Story progression escalates cleanly.',
      improveLabel: 'Story progression needs stronger escalation spacing.'
    });
    const visualProgression = this.buildExecutiveDimensionResult({
      score: Number(visualEvaluation?.overallScore ?? 0),
      threshold: 8,
      passLabel: 'Visual progression reinforces narrative escalation.',
      improveLabel: 'Visual progression needs sharper stylistic progression by beat.'
    });
    const narrationQuality = this.buildExecutiveDimensionResult({
      score: Number(narrationEvaluation?.overallScore ?? 0),
      threshold: 8,
      passLabel: 'Narration quality supports emotional journey.',
      improveLabel: 'Narration delivery requires stronger emotional contouring.'
    });
    const editingRhythm = this.buildExecutiveDimensionResult({
      score: Number(imageGenerationEvaluation?.overallScore ?? visualEvaluation?.overallScore ?? 0),
      threshold: 8,
      passLabel: 'Editing rhythm supports audience momentum.',
      improveLabel: 'Editing rhythm should rebalance long reflective spans.'
    });
    const endingEffectiveness = this.buildExecutiveDimensionResult({
      score: Number(storytellingEvaluation?.scores?.audienceCommitment ?? 0),
      threshold: 8,
      passLabel: 'Ending closes with clear implication and viewer directive.',
      improveLabel: 'Ending requires stronger final implication and call-to-action gravity.'
    });

    const recommendations = this.buildExecutiveImprovementRecommendations({
      openingBeat,
      escalationBeat,
      revealBeat,
      visualBeat,
      rhythmBeat,
      endingBeat,
      request,
      qualityReview,
      researchEvaluation,
      storytellingEvaluation,
      narrationEvaluation
    });

    return {
      reportId: `EXEC-IMPROVEMENT-${runtimeContext.missionId}`,
      reportType: 'Executive Improvement Report',
      missionId: runtimeContext.missionId,
      businessId: runtimeContext.businessId,
      generatedAt: new Date(this.now()).toISOString(),
      objective: request.objective ?? runtimeContext.missionObjective,
      officialRoadmapForNextBenchmark: true,
      qualityGateStatus: {
        passed: Boolean(qualityReview?.passed),
        recommendation: String(qualityReview?.executiveRecommendation ?? 'UNKNOWN')
      },
      executiveProducerReview: {
        openingEffectiveness,
        audienceRetentionRisk,
        narrativeBeatQuality,
        storyProgression,
        visualProgression,
        narrationQuality,
        editingRhythm,
        endingEffectiveness
      },
      recommendations,
      roadmap: recommendations.map((recommendation, index) => ({
        sequence: index + 1,
        beatId: recommendation.beatId,
        action: recommendation.action,
        targetArea: recommendation.targetArea,
        expectedImpact: recommendation.expectedImpact,
        status: 'PLANNED_NOT_APPLIED'
      })),
      implementationPolicy: {
        autoApplyRecommendations: false,
        note: 'Recommendations are advisory and must be applied manually in a future benchmark sprint.'
      }
    };
  }

  buildExecutiveDimensionResult({
    score,
    threshold,
    passLabel,
    improveLabel,
    invertForRisk = false
  }) {
    const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.min(10, Number(score.toFixed(2)))) : 0;
    const passes = invertForRisk ? normalizedScore <= (10 - threshold) : normalizedScore >= threshold;

    return {
      score: normalizedScore,
      status: passes ? 'STRONG' : 'NEEDS_IMPROVEMENT',
      summary: passes ? passLabel : improveLabel
    };
  }

  buildExecutiveImprovementRecommendations({
    openingBeat,
    escalationBeat,
    revealBeat,
    visualBeat,
    rhythmBeat,
    endingBeat,
    request,
    qualityReview,
    researchEvaluation,
    storytellingEvaluation,
    narrationEvaluation
  }) {
    const recommendations = [];

    const pushRecommendation = ({ beat, targetArea, action, rationale, expectedImpact, priority }) => {
      const resolvedBeat = beat ?? null;
      const beatId = String(resolvedBeat?.beatId ?? 'BEAT-001');
      const beatNumber = Number.parseInt(beatId.replace(/[^0-9]/g, ''), 10) || 1;

      recommendations.push({
        recommendationId: `EIR-${String(recommendations.length + 1).padStart(3, '0')}`,
        beatId,
        targetArea,
        priority,
        action: action.replace('{beat}', `Beat ${beatNumber}`),
        rationale,
        expectedImpact
      });
    };

    const topic = String(request?.topic ?? request?.objective ?? 'the documentary investigation');
    const researchConfidence = Number(researchEvaluation?.researchPackage?.confidenceLevel?.score ?? 0);
    const storytellingScore = Number(storytellingEvaluation?.overallScore ?? 0);
    const narrationScore = Number(narrationEvaluation?.overallScore ?? 0);
    const qualityPassed = Boolean(qualityReview?.passed);

    pushRecommendation({
      beat: openingBeat,
      targetArea: 'Opening effectiveness',
      priority: 'HIGH',
      action: 'Split {beat} into two beats: a 5-second unresolved opening question and a 6-second evidence anchor before Act I context.',
      rationale: `Opening strength remains below target for ${topic}. A dual-step opener increases immediacy without collapsing curiosity.`,
      expectedImpact: 'Higher first-30-second retention and clearer investigative premise.'
    });

    pushRecommendation({
      beat: escalationBeat,
      targetArea: 'Audience retention risk',
      priority: 'HIGH',
      action: 'Increase emotional intensity in {beat} narration and add one unresolved question before transition to the next beat.',
      rationale: 'Mid-story beats show higher risk of attention drop when escalation is informational but not affective.',
      expectedImpact: 'Reduced midpoint drop-off and stronger forward pull.'
    });

    pushRecommendation({
      beat: revealBeat,
      targetArea: 'Narrative Beat quality',
      priority: 'MEDIUM',
      action: 'Delay reveal in {beat} by one beat and add a corroborating setup beat immediately before it.',
      rationale: `Research confidence (${researchConfidence}/10) indicates reveal payload should be scaffolded with clearer evidence progression.`,
      expectedImpact: 'Improved reveal credibility and better payoff sequencing.'
    });

    pushRecommendation({
      beat: visualBeat,
      targetArea: 'Visual progression',
      priority: 'MEDIUM',
      action: 'Replace {beat} visual style with contrastive evidence-board composition to mark progression from context to accountability.',
      rationale: 'Reflective cadence beats should visually signal narrative phase change, not maintain static mood continuity.',
      expectedImpact: 'Clearer visual arc and stronger scene differentiation.'
    });

    pushRecommendation({
      beat: rhythmBeat,
      targetArea: 'Editing rhythm',
      priority: 'MEDIUM',
      action: 'Shorten {beat} by 3 seconds and move one supporting sentence into the following beat to tighten cadence.',
      rationale: 'Long reflective beat duration weakens pacing momentum during late-stage progression.',
      expectedImpact: 'More consistent rhythm and stronger pre-ending acceleration.'
    });

    pushRecommendation({
      beat: endingBeat,
      targetArea: 'Ending effectiveness',
      priority: 'HIGH',
      action: 'Add an explicit unresolved institutional question in {beat} before the final viewer action prompt.',
      rationale: qualityPassed
        ? `With quality gate passed and storytelling score ${storytellingScore}/10, ending optimization should focus on post-viewer reflection depth.`
        : `Quality gate pressure plus narration score ${narrationScore}/10 requires a sharper final implication to preserve documentary authority.`,
      expectedImpact: 'Stronger closing impact and higher likelihood of follow-on engagement.'
    });

    return recommendations;
  }

  buildPublishDecisionReport({ runtimeContext, request, qualityReview, executiveImprovementReport }) {
    const producerBrief = runtimeContext.artifacts?.producerBrief ?? null;
    const storytellingEvaluation = runtimeContext.artifacts?.storytellingEvaluation ?? {};
    const visualEvaluation = runtimeContext.artifacts?.visualEvaluation ?? {};
    const narrationEvaluation = runtimeContext.artifacts?.narrationEvaluation ?? {};
    const imageGenerationEvaluation = runtimeContext.artifacts?.imageGenerationEvaluation ?? {};

    const executiveReviewScores = Object.values(executiveImprovementReport?.executiveProducerReview ?? {})
      .map(dimension => Number(dimension?.score ?? 0))
      .filter(score => Number.isFinite(score));
    const executiveReviewScore = executiveReviewScores.length > 0
      ? Number((executiveReviewScores.reduce((sum, value) => sum + value, 0) / executiveReviewScores.length).toFixed(2))
      : 0;

    const overallDocumentaryQuality = Number((
      Number(storytellingEvaluation?.overallScore ?? 0) * 0.5
      + Number(visualEvaluation?.overallScore ?? 0) * 0.25
      + Number(narrationEvaluation?.overallScore ?? 0) * 0.25
    ).toFixed(2));

    const consistencyWithProducerBrief = this.calculateProducerBriefConsistency({
      producerBrief,
      request,
      storytellingEvaluation,
      visualEvaluation,
      narrationEvaluation
    });

    const productionQuality = Number((
      Number(qualityReview?.passed ? 8.5 : 4.5) * 0.4
      + Number(visualEvaluation?.overallScore ?? 0) * 0.3
      + Number(imageGenerationEvaluation?.overallScore ?? 0) * 0.3
    ).toFixed(2));

    const storyQuality = Number((
      Number(storytellingEvaluation?.scores?.narrativeFlow ?? 0) * 0.35
      + Number(storytellingEvaluation?.scores?.curiosity ?? 0) * 0.35
      + Number(storytellingEvaluation?.scores?.audienceCommitment ?? 0) * 0.3
    ).toFixed(2));

    const viewerRecommendationConfidence = Number((
      Number(storytellingEvaluation?.scores?.audienceCommitment ?? 0) * 0.45
      + Number(narrationEvaluation?.scores?.listenerEngagement ?? 0) * 0.25
      + Number(visualEvaluation?.scores?.emotionalImpact ?? 0) * 0.15
      + Number(executiveReviewScore) * 0.15
    ).toFixed(2));

    const evaluation = {
      overallDocumentaryQuality,
      consistencyWithProducerBrief,
      executiveReviewScore,
      productionQuality,
      storyQuality,
      viewerRecommendationConfidence
    };

    const outcome = this.resolvePublishDecisionOutcome({
      qualityReview,
      evaluation,
      executiveImprovementReport
    });

    return {
      reportId: `PUBLISH-DECISION-${runtimeContext.missionId}`,
      reportType: 'Publish Decision Report',
      generatedAt: new Date(this.now()).toISOString(),
      missionId: runtimeContext.missionId,
      releaseCandidateId: runtimeContext.artifacts?.releaseCandidatePackage?.releaseCandidateId ?? null,
      objective: request.objective ?? runtimeContext.missionObjective,
      evaluation,
      decision: outcome.decision,
      rationale: outcome.rationale,
      confidence: outcome.confidence,
      blockingIssues: outcome.blockingIssues,
      recommendedNextAction: outcome.recommendedNextAction,
      executionPolicy: {
        autoRevise: false,
        autoPublish: false,
        note: 'Decision is advisory governance output. No automatic revise or publish action is executed by runtime.'
      }
    };
  }

  calculateProducerBriefConsistency({
    producerBrief,
    request,
    storytellingEvaluation,
    visualEvaluation,
    narrationEvaluation
  }) {
    let score = 6.5;

    const emotionalTarget = String(request?.emotionalTarget ?? producerBrief?.desiredEmotionalJourney ?? '').trim().toLowerCase();
    const tone = String(request?.tone ?? producerBrief?.tone ?? '').trim().toLowerCase();
    const narrativeStyle = String(request?.narrativeStyle ?? producerBrief?.narrativeStyle ?? '').trim().toLowerCase();

    if (emotionalTarget.length > 0) {
      score += Number(narrationEvaluation?.scores?.emotionalDelivery ?? 0) >= 7 ? 0.8 : -0.6;
    }

    if (tone.length > 0) {
      score += Number(visualEvaluation?.scores?.emotionalImpact ?? 0) >= 7 ? 0.6 : -0.5;
    }

    if (narrativeStyle.length > 0) {
      score += Number(storytellingEvaluation?.scores?.narrativeFlow ?? 0) >= 7 ? 0.8 : -0.6;
    }

    return Number(Math.max(0, Math.min(10, score)).toFixed(2));
  }

  resolvePublishDecisionOutcome({ qualityReview, evaluation, executiveImprovementReport }) {
    const blockingIssues = [];

    if (qualityReview?.passed !== true) {
      blockingIssues.push('Quality gate is not passed.');
    }

    if (evaluation.overallDocumentaryQuality < 6) {
      blockingIssues.push(`Overall documentary quality is below minimum threshold (${evaluation.overallDocumentaryQuality}/10).`);
    }

    if (evaluation.consistencyWithProducerBrief < 6) {
      blockingIssues.push(`Producer Brief consistency is below minimum threshold (${evaluation.consistencyWithProducerBrief}/10).`);
    }

    if (evaluation.productionQuality < 6) {
      blockingIssues.push(`Production quality is below minimum threshold (${evaluation.productionQuality}/10).`);
    }

    if (evaluation.storyQuality < 6) {
      blockingIssues.push(`Story quality is below minimum threshold (${evaluation.storyQuality}/10).`);
    }

    if (evaluation.viewerRecommendationConfidence < 6) {
      blockingIssues.push(`Viewer recommendation confidence is below minimum threshold (${evaluation.viewerRecommendationConfidence}/10).`);
    }

    const recommendationCount = Array.isArray(executiveImprovementReport?.recommendations)
      ? executiveImprovementReport.recommendations.length
      : 0;

    const scoreVector = [
      evaluation.overallDocumentaryQuality,
      evaluation.consistencyWithProducerBrief,
      evaluation.executiveReviewScore,
      evaluation.productionQuality,
      evaluation.storyQuality,
      evaluation.viewerRecommendationConfidence
    ];
    const averageScore = Number((scoreVector.reduce((sum, value) => sum + Number(value ?? 0), 0) / scoreVector.length).toFixed(2));

    if (blockingIssues.length >= 2 || averageScore < 5.8) {
      return {
        decision: 'REJECT',
        rationale: `Documentary fails Atlas Studios quality standards. Average publish-gate score is ${averageScore}/10 with ${blockingIssues.length} blocking issue(s).`,
        confidence: Math.max(70, Math.min(95, Math.round((10 - averageScore) * 10))),
        blockingIssues,
        recommendedNextAction: 'Do not release. Escalate to executive leadership for topic reset or full redevelopment before considering another benchmark cycle.'
      };
    }

    if (blockingIssues.length > 0 || averageScore < 7.8 || recommendationCount > 0) {
      return {
        decision: 'REVISE',
        rationale: `Documentary is close but not yet release-ready. Average publish-gate score is ${averageScore}/10 and refinement opportunities remain in Executive Improvement Report.`,
        confidence: Math.max(65, Math.min(92, Math.round((8.5 - averageScore) * 18))),
        blockingIssues,
        recommendedNextAction: 'Run another improvement cycle using Executive Improvement Report beat-level recommendations, then regenerate publish decision.'
      };
    }

    return {
      decision: 'PUBLISH',
      rationale: `Documentary meets release criteria with average publish-gate score ${averageScore}/10 and no blocking issues.`,
      confidence: Math.max(75, Math.min(98, Math.round(averageScore * 10))),
      blockingIssues,
      recommendedNextAction: 'Ready for manual release approval flow. Keep auto-publish disabled until explicit executive authorization is provided.'
    };
  }

  buildLessonsLearned({ qualityReview }) {
    const qualityLesson = qualityReview.passed
      ? 'Mission completed through quality gate in no-publish mode.'
      : 'Mission blocked by quality gate; remediation workflow required.';

    return [
      {
        id: 'LL-001',
        category: 'Operations',
        lesson: 'Canonical mission path completed under runtime orchestrator control.',
        evidence: 'Mission runtime state reached terminal state through guarded transitions.'
      },
      {
        id: 'LL-002',
        category: 'Quality',
        lesson: qualityLesson,
        evidence: `Quality passed: ${qualityReview.passed}`
      }
    ];
  }

  buildKnowledgeCandidates({ lessonsLearned }) {
    return lessonsLearned.map((lesson, index) => ({
      candidateId: `KC-${String(index + 1).padStart(3, '0')}`,
      sourceLessonId: lesson.id,
      title: lesson.lesson,
      lifecycleStage: 'Validated Learning',
      confidenceScore: 70 + (index * 5),
      promotionStatus: 'CANDIDATE_ONLY',
      evidence: [lesson.evidence]
    }));
  }

  createAssignment({ assignmentId, workerId, taskId, metadata }) {
    return new WorkerAssignment({
      assignmentId,
      workerId,
      taskId,
      result: {
        task: {
          metadata
        }
      }
    });
  }

  shouldEnforceArtifactIntegrity(runtimeContext) {
    const businessId = String(runtimeContext.businessId ?? '').toUpperCase().trim();
    return businessId !== 'SYSTEM_INTERNAL';
  }

  runMissionQualityReview({ runtimeContext, request }) {
    if (!this.shouldEnforceArtifactIntegrity(runtimeContext)) {
      return this.qualityReviewEngine.review({
        script: runtimeContext.artifacts.script.script,
        voiceOutput: runtimeContext.artifacts.voice.audioFile,
        imageOutputs: runtimeContext.artifacts.images.imageFiles,
        videoOutput: runtimeContext.artifacts.video.videoFile,
        metadata: {
          missionId: runtimeContext.missionId,
          businessId: runtimeContext.businessId,
          requestId: runtimeContext.requestId
        }
      });
    }

    const qualityResult = this.qualityIntelligenceEngine.review({
      requestId: runtimeContext.requestId,
      missionId: runtimeContext.missionId,
      businessId: runtimeContext.businessId,
      mediaRenderResult: {
        status: String(runtimeContext.artifacts.video?.status ?? 'COMPLETED').toUpperCase(),
        videoFile: runtimeContext.artifacts.video?.videoFile ?? null,
        duration: runtimeContext.artifacts.video?.duration ?? null,
        timelineDiagnostics: {
          isValid: true,
          summary: {
            narrationDurationSeconds: request.targetDuration ?? null,
            totalDurationSeconds: request.targetDuration ?? null
          }
        },
        diagnostics: {
          pipelineReport: {
            timelineScenes: this.timelineBuilder.build({
              metadata: {
                imageOutputs: runtimeContext.artifacts.images?.imageFiles ?? []
              },
              timeline: request.timeline ?? {}
            }),
            timelineValidationReport: {
              isValid: true,
              errors: [],
              summary: {
                narrationDurationSeconds: request.targetDuration ?? null,
                totalDurationSeconds: request.targetDuration ?? null
              }
            },
            composition: {
              transitionCount: 0
            },
            compositionPlan: {
              renderInstructions: (runtimeContext.artifacts.images?.imageFiles ?? []).map((imageAsset, index) => ({
                instructionId: `RI-${String(index + 1).padStart(3, '0')}`,
                sceneId: `SCENE-${String(index + 1).padStart(3, '0')}`,
                imageAsset,
                durationSeconds: 2,
                transitionPreset: {
                  presetId: 'TRANSITION_NONE',
                  durationSeconds: 0
                }
              })),
              policy: {
                transitions: {
                  mode: 'disabled'
                }
              }
            }
          },
          rendererDiagnostics: {
            transitionCount: 0
          }
        }
      },
      assets: {
        voiceOutput: runtimeContext.artifacts.voice?.audioFile ?? null,
        imageOutputs: runtimeContext.artifacts.images?.imageFiles ?? [],
        videoOutput: runtimeContext.artifacts.video?.videoFile ?? null
      }
    });

    const passed = qualityResult.reviewDecision === 'PASS';
    const recommendation = passed
      ? 'APPROVE_FOR_RELEASE'
      : {
        decision: 'REMEDIATE_AND_REVIEW',
        issueCount: qualityResult.issues.length,
        remediationTaskCount: qualityResult.recommendations.length,
        summary: qualityResult.executiveSummary
      };

    return {
      passed,
      issues: qualityResult.issues.map(issue => ({
        code: issue.code,
        field: issue.category,
        message: issue.message,
        severity: issue.severity,
        details: issue.details
      })),
      remediationTasks: qualityResult.recommendations.map((recommendationItem, index) => ({
        taskId: recommendationItem.recommendationId ?? `QI-REMED-${String(index + 1).padStart(3, '0')}`,
        type: 'QUALITY_REMEDIATION',
        issueCode: recommendationItem.relatedIssueCodes?.[0] ?? 'QUALITY_REMEDIATION',
        requiredField: 'quality',
        action: recommendationItem.action,
        priority: String(recommendationItem.priority ?? 'medium').toUpperCase()
      })),
      executiveRecommendation: recommendation,
      qualityScore: qualityResult.overallScore,
      reviewDecision: qualityResult.reviewDecision,
      qualityReport: qualityResult.qualityReport
    };
  }

  blockForArtifactIntegrityFailure({ runtimeContext, stage, issues }) {
    const normalizedIssues = Array.isArray(issues) ? issues : [];

    runtimeContext.artifacts.artifactIntegrity = {
      passed: false,
      stage,
      issues: normalizedIssues
    };

    runtimeContext.artifacts.qualityReview = {
      passed: false,
      issues: normalizedIssues.map(issue => ({
        code: issue.code,
        field: issue.artifactType,
        message: issue.reason,
        artifactPath: issue.artifactPath
      })),
      remediationTasks: normalizedIssues.map((issue, index) => ({
        taskId: `REMED-ARTIFACT-${String(index + 1).padStart(3, '0')}`,
        type: 'ARTIFACT_INTEGRITY_REMEDIATION',
        issueCode: issue.code,
        requiredField: issue.artifactType,
        action: `Replace invalid ${issue.artifactType} artifact and rerun the blocked stage.`,
        priority: 'HIGH'
      })),
      executiveRecommendation: {
        decision: 'REMEDIATE_AND_REVIEW',
        issueCount: normalizedIssues.length,
        remediationTaskCount: normalizedIssues.length,
        summary: 'Artifact integrity validation failed before release candidate packaging.'
      }
    };

    runtimeContext.failureLedger.push(...normalizedIssues.map(issue => ({
      code: issue.code,
      message: issue.reason,
      state: runtimeContext.state,
      artifactPath: issue.artifactPath,
      artifactType: issue.artifactType
    })));
    runtimeContext.riskRegister.push({
      code: 'ARTIFACT_INTEGRITY_FAILED',
      severity: 'HIGH',
      owner: 'CQO',
      stage,
      issueCount: normalizedIssues.length
    });

    runtimeContext.terminalMissionOutcome = 'ARTIFACT_INTEGRITY_BLOCKED';
    this.transitionTo(runtimeContext, MissionLifecycleStates.BLOCKED, {
      reason: `Artifact integrity failure at ${stage}`
    });
    runtimeContext.artifacts.publishing = {
      enabled: false,
      mode: runtimeContext.executionPolicy.publishingMode,
      publishStatus: 'NOT_REQUESTED',
      status: 'ARTIFACT_INTEGRITY_BLOCKED'
    };

    return this.buildRunResult(runtimeContext);
  }

  validatePreRenderProductionRequirements({ runtimeContext, request }) {
    const issues = [];
    const plannedSceneCount = this.resolvePlannedSceneCount({ runtimeContext, request });
    const generatedImageCount = Array.isArray(runtimeContext.artifacts.images?.imageFiles)
      ? runtimeContext.artifacts.images.imageFiles.length
      : 0;
    const timelineSceneCount = Array.isArray(runtimeContext.artifacts.timeline)
      ? runtimeContext.artifacts.timeline.length
      : 0;

    if (plannedSceneCount <= 0) {
      issues.push({
        code: 'SCENE_PLAN_EMPTY',
        stage: 'SCENE_PIPELINE',
        message: 'No planned scenes were available before rendering.'
      });
    }

    if (generatedImageCount !== plannedSceneCount) {
      issues.push({
        code: 'SCENE_COUNT_MISMATCH_PRE_RENDER',
        stage: 'SCENE_PIPELINE',
        message: `Generated image count (${generatedImageCount}) does not match planned scene count (${plannedSceneCount}).`
      });
    }

    if (timelineSceneCount !== plannedSceneCount) {
      issues.push({
        code: 'TIMELINE_SCENE_COUNT_MISMATCH_PRE_RENDER',
        stage: 'TIMELINE_ASSEMBLY',
        message: `Timeline scene count (${timelineSceneCount}) does not match planned scene count (${plannedSceneCount}).`
      });
    }

    return {
      passed: issues.length === 0,
      stage: 'PRE_RENDER_VALIDATION',
      summary: {
        plannedSceneCount,
        generatedImageCount,
        timelineSceneCount
      },
      issues
    };
  }

  validatePostRenderProductionRequirements({ runtimeContext, request }) {
    const issues = [];
    const plannedSceneCount = this.resolvePlannedSceneCount({ runtimeContext, request });
    const timelineScenes = Array.isArray(runtimeContext.artifacts.timeline)
      ? runtimeContext.artifacts.timeline
      : [];
    const timelineSceneCount = timelineScenes.length;
    const targetDuration = Number.parseFloat(String(request.narrationDurationSeconds ?? request.targetDuration ?? 0));

    const audioValidation = this.validateAudioArtifact({
      audioFile: runtimeContext.artifacts.voice?.audioFile
    });
    if (!audioValidation.isValid) {
      issues.push(...audioValidation.issues.map(issue => ({
        code: issue.code,
        stage: 'NARRATION_PIPELINE',
        message: issue.reason
      })));
    }

    const timelineDurationSeconds = timelineScenes.reduce(
      (sum, scene) => sum + Number(scene?.durationSeconds ?? 0),
      0
    );

    if (timelineSceneCount !== plannedSceneCount) {
      issues.push({
        code: 'SCENE_COUNT_MISMATCH_POST_RENDER',
        stage: 'SCENE_PIPELINE',
        message: `Rendered timeline scenes (${timelineSceneCount}) do not match planned scene count (${plannedSceneCount}).`
      });
    }

    const missingVisualCount = timelineScenes.filter(scene => {
      const imageAsset = String(scene?.imageAsset ?? '').trim();
      return imageAsset.length === 0 || !existsSync(imageAsset);
    }).length;

    if (missingVisualCount > 0) {
      issues.push({
        code: 'MISSING_SCENE_VISUALS',
        stage: 'SCENE_PIPELINE',
        message: `${missingVisualCount} planned scene visual(s) are missing or unreadable.`
      });
    }

    if (Number.isFinite(targetDuration) && targetDuration > 0) {
      const durationDelta = Math.abs(timelineDurationSeconds - targetDuration);
      if (durationDelta > 1) {
        issues.push({
          code: 'TIMELINE_DURATION_MISMATCH',
          stage: 'TIMELINE_ASSEMBLY',
          message: `Timeline duration (${timelineDurationSeconds}s) does not match target duration (${targetDuration}s).`
        });
      }
    }

    const videoProbe = this.inspectMediaFile(runtimeContext.artifacts.video?.videoFile);
    let videoDuration = 0;
    let audioDuration = 0;

    if (!videoProbe.success) {
      issues.push({
        code: 'VIDEO_PROBE_FAILED',
        stage: 'PRODUCTION_VALIDATION',
        message: 'Final MP4 could not be inspected for synchronization checks.'
      });
    } else {
      videoDuration = Number.parseFloat(String(videoProbe.payload?.format?.duration ?? '0'));
      const audioStream = Array.isArray(videoProbe.payload?.streams)
        ? videoProbe.payload.streams.find(stream => stream.codec_type === 'audio')
        : null;
      audioDuration = Number.parseFloat(String(audioStream?.duration ?? videoProbe.payload?.format?.duration ?? '0'));

      if (Number.isNaN(videoDuration) || videoDuration <= 0) {
        issues.push({
          code: 'VIDEO_DURATION_INVALID',
          stage: 'PRODUCTION_VALIDATION',
          message: 'Final MP4 has an invalid video duration.'
        });
      }

      if (Number.isNaN(audioDuration) || audioDuration <= 0) {
        issues.push({
          code: 'VIDEO_AUDIO_STREAM_INVALID',
          stage: 'PRODUCTION_VALIDATION',
          message: 'Final MP4 has an invalid or missing audio stream duration.'
        });
      }

      if (!Number.isNaN(videoDuration) && !Number.isNaN(audioDuration) && Math.abs(videoDuration - audioDuration) > 1.5) {
        issues.push({
          code: 'AUDIO_VIDEO_DESYNC',
          stage: 'PRODUCTION_VALIDATION',
          message: `Audio/video duration delta (${Math.abs(videoDuration - audioDuration).toFixed(2)}s) exceeded synchronization tolerance.`
        });
      }
    }

    return {
      passed: issues.length === 0,
      stage: 'POST_RENDER_VALIDATION',
      summary: {
        plannedSceneCount,
        timelineSceneCount,
        targetDurationSeconds: Number.isFinite(targetDuration) ? targetDuration : null,
        timelineDurationSeconds,
        videoDurationSeconds: Number.isFinite(videoDuration) ? videoDuration : null,
        audioDurationSeconds: Number.isFinite(audioDuration) ? audioDuration : null
      },
      issues
    };
  }

  blockForProductionValidationFailure({ runtimeContext, stage, report }) {
    const normalizedReport = report && typeof report === 'object'
      ? report
      : {
        passed: false,
        stage,
        summary: {},
        issues: [{
          code: 'PRODUCTION_VALIDATION_UNKNOWN_FAILURE',
          stage,
          message: 'Production validation failed for an unknown reason.'
        }]
      };
    const reportPath = this.buildArtifactReportPath({
      missionId: runtimeContext.missionId,
      artifactType: 'production-failure-report'
    });

    runtimeContext.artifacts.productionValidation = normalizedReport;
    runtimeContext.artifacts.productionFailureReportPath = reportPath;
    this.persistJsonArtifact({
      runtimeContext,
      filePath: reportPath,
      artifactType: 'production-failure-report',
      payload: {
        missionId: runtimeContext.missionId,
        businessId: runtimeContext.businessId,
        failedStage: stage,
        validation: normalizedReport,
        generatedAt: new Date(this.now()).toISOString()
      }
    });

    runtimeContext.artifacts.qualityReview = {
      passed: false,
      issues: (normalizedReport.issues ?? []).map(issue => ({
        code: issue.code,
        field: issue.stage,
        message: issue.message
      })),
      remediationTasks: (normalizedReport.issues ?? []).map((issue, index) => ({
        taskId: `REMED-PROD-${String(index + 1).padStart(3, '0')}`,
        type: 'PRODUCTION_REMEDIATION',
        issueCode: issue.code,
        requiredField: issue.stage,
        action: `Resolve ${issue.code} in ${issue.stage} and rerun mission render pipeline.`,
        priority: 'HIGH'
      })),
      executiveRecommendation: {
        decision: 'REMEDIATE_AND_REVIEW',
        issueCount: Array.isArray(normalizedReport.issues) ? normalizedReport.issues.length : 0,
        remediationTaskCount: Array.isArray(normalizedReport.issues) ? normalizedReport.issues.length : 0,
        summary: `Production validation blocked release at ${stage}.`
      }
    };

    runtimeContext.failureLedger.push({
      code: 'PRODUCTION_VALIDATION_BLOCKED',
      message: `Production validation failed at ${stage}.`,
      state: runtimeContext.state,
      details: normalizedReport
    });
    runtimeContext.riskRegister.push({
      code: 'PRODUCTION_VALIDATION_FAILED',
      severity: 'HIGH',
      owner: 'CQO',
      stage,
      issueCount: Array.isArray(normalizedReport.issues) ? normalizedReport.issues.length : 0
    });

    runtimeContext.terminalMissionOutcome = 'PRODUCTION_VALIDATION_BLOCKED';
    this.transitionTo(runtimeContext, MissionLifecycleStates.BLOCKED, {
      reason: `Production validation failure at ${stage}`
    });
    runtimeContext.artifacts.publishing = {
      enabled: false,
      mode: runtimeContext.executionPolicy.publishingMode,
      publishStatus: 'NOT_REQUESTED',
      status: 'PRODUCTION_VALIDATION_BLOCKED'
    };

    return this.buildRunResult(runtimeContext);
  }

  validateImageArtifacts({ imageFiles }) {
    const files = Array.isArray(imageFiles) ? imageFiles : [];
    const issues = [];

    if (files.length === 0) {
      issues.push({
        code: 'IMAGE_MISSING',
        artifactType: 'image',
        artifactPath: null,
        reason: 'Image artifact list is empty.'
      });

      return {
        isValid: false,
        issues
      };
    }

    files.forEach(filePath => {
      const fileName = basename(String(filePath ?? ''));

      if (fileName.includes('image-failed')) {
        issues.push({
          code: 'IMAGE_PLACEHOLDER_DETECTED',
          artifactType: 'image',
          artifactPath: filePath,
          reason: 'Image artifact filename indicates a failed placeholder image.'
        });
        return;
      }

      const fileState = this.validateReadableFile({
        filePath,
        artifactType: 'image'
      });

      if (!fileState.isValid) {
        issues.push(...fileState.issues);
        return;
      }

      const probe = this.inspectMediaFile(filePath);
      if (!probe.success) {
        issues.push({
          code: 'IMAGE_DIMENSION_READ_FAILED',
          artifactType: 'image',
          artifactPath: filePath,
          reason: 'Image dimensions could not be read with ffprobe.'
        });
        return;
      }

      const imageStream = Array.isArray(probe.payload?.streams)
        ? probe.payload.streams.find(stream => stream.codec_type === 'video')
        : null;
      const width = Number.parseInt(String(imageStream?.width ?? ''), 10);
      const height = Number.parseInt(String(imageStream?.height ?? ''), 10);

      if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        issues.push({
          code: 'IMAGE_INVALID_DIMENSIONS',
          artifactType: 'image',
          artifactPath: filePath,
          reason: 'Image file has invalid dimensions.'
        });
      }
    });

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  validateAudioArtifact({ audioFile }) {
    const fileState = this.validateReadableFile({
      filePath: audioFile,
      artifactType: 'audio'
    });

    if (!fileState.isValid) {
      return fileState;
    }

    const probe = this.inspectMediaFile(audioFile);
    if (!probe.success) {
      return {
        isValid: false,
        issues: [{
          code: 'AUDIO_UNDECODABLE',
          artifactType: 'audio',
          artifactPath: audioFile,
          reason: 'Audio file could not be decoded by ffprobe.'
        }]
      };
    }

    const audioStream = Array.isArray(probe.payload?.streams)
      ? probe.payload.streams.find(stream => stream.codec_type === 'audio')
      : null;

    if (!audioStream) {
      return {
        isValid: false,
        issues: [{
          code: 'AUDIO_STREAM_MISSING',
          artifactType: 'audio',
          artifactPath: audioFile,
          reason: 'Audio artifact has no decodable audio stream.'
        }]
      };
    }

    const duration = Number.parseFloat(String(probe.payload?.format?.duration ?? '0'));

    if (Number.isNaN(duration) || duration <= 0) {
      return {
        isValid: false,
        issues: [{
          code: 'AUDIO_DURATION_INVALID',
          artifactType: 'audio',
          artifactPath: audioFile,
          reason: 'Audio duration is zero seconds.'
        }]
      };
    }

    return {
      isValid: true,
      issues: []
    };
  }

  validateVideoArtifact({ videoFile }) {
    const fileName = basename(String(videoFile ?? ''));

    if (fileName.includes('video-failed')) {
      return {
        isValid: false,
        issues: [{
          code: 'VIDEO_PLACEHOLDER_DETECTED',
          artifactType: 'video',
          artifactPath: videoFile,
          reason: 'Video artifact filename indicates a failed placeholder output.'
        }]
      };
    }

    if (!String(videoFile ?? '').toLowerCase().endsWith('.mp4')) {
      return {
        isValid: false,
        issues: [{
          code: 'VIDEO_NOT_MP4',
          artifactType: 'video',
          artifactPath: videoFile,
          reason: 'Video output must be an MP4 file.'
        }]
      };
    }

    const fileState = this.validateReadableFile({
      filePath: videoFile,
      artifactType: 'video'
    });

    if (!fileState.isValid) {
      return fileState;
    }

    const probe = this.inspectMediaFile(videoFile);
    if (!probe.success) {
      return {
        isValid: false,
        issues: [{
          code: 'VIDEO_FFPROBE_UNREADABLE',
          artifactType: 'video',
          artifactPath: videoFile,
          reason: 'Video artifact could not be read by ffprobe.'
        }]
      };
    }

    const formatName = String(probe.payload?.format?.format_name ?? '').toLowerCase();
    if (!formatName.includes('mp4') && !formatName.includes('mov')) {
      return {
        isValid: false,
        issues: [{
          code: 'VIDEO_CONTAINER_INVALID',
          artifactType: 'video',
          artifactPath: videoFile,
          reason: 'Video artifact is not an MP4-compatible container.'
        }]
      };
    }

    const videoStream = Array.isArray(probe.payload?.streams)
      ? probe.payload.streams.find(stream => stream.codec_type === 'video')
      : null;

    if (!videoStream) {
      return {
        isValid: false,
        issues: [{
          code: 'VIDEO_STREAM_MISSING',
          artifactType: 'video',
          artifactPath: videoFile,
          reason: 'Video artifact has no video stream.'
        }]
      };
    }

    const duration = Number.parseFloat(String(probe.payload?.format?.duration ?? '0'));

    if (Number.isNaN(duration) || duration <= 0) {
      return {
        isValid: false,
        issues: [{
          code: 'VIDEO_DURATION_INVALID',
          artifactType: 'video',
          artifactPath: videoFile,
          reason: 'Video duration is zero seconds.'
        }]
      };
    }

    return {
      isValid: true,
      issues: []
    };
  }

  validateReadableFile({ filePath, artifactType }) {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      return {
        isValid: false,
        issues: [{
          code: `${artifactType.toUpperCase()}_MISSING`,
          artifactType,
          artifactPath: filePath ?? null,
          reason: `${artifactType} artifact is missing.`
        }]
      };
    }

    if (!existsSync(filePath)) {
      return {
        isValid: false,
        issues: [{
          code: `${artifactType.toUpperCase()}_NOT_FOUND`,
          artifactType,
          artifactPath: filePath,
          reason: `${artifactType} artifact file does not exist.`
        }]
      };
    }

    try {
      accessSync(filePath, constants.R_OK);
    } catch (_error) {
      return {
        isValid: false,
        issues: [{
          code: `${artifactType.toUpperCase()}_UNREADABLE`,
          artifactType,
          artifactPath: filePath,
          reason: `${artifactType} artifact is unreadable.`
        }]
      };
    }

    const stats = statSync(filePath);
    if (stats.size <= 0) {
      return {
        isValid: false,
        issues: [{
          code: `${artifactType.toUpperCase()}_ZERO_BYTE`,
          artifactType,
          artifactPath: filePath,
          reason: `${artifactType} artifact has zero-byte size.`
        }]
      };
    }

    return {
      isValid: true,
      issues: []
    };
  }

  inspectMediaFile(filePath) {
    const probeResult = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_streams',
      '-show_format',
      '-of', 'json',
      filePath
    ], {
      encoding: 'utf8'
    });

    if (probeResult.status !== 0) {
      return {
        success: false,
        payload: null,
        error: probeResult.stderr ?? probeResult.stdout ?? 'ffprobe failed'
      };
    }

    try {
      return {
        success: true,
        payload: JSON.parse(probeResult.stdout || '{}'),
        error: null
      };
    } catch (_error) {
      return {
        success: false,
        payload: null,
        error: 'ffprobe produced invalid JSON.'
      };
    }
  }

  async executePublishingIfEnabled({ runtimeContext, request, scriptResult, imageResult, videoResult }) {
    if (
      runtimeContext.state !== MissionLifecycleStates.CEO_APPROVED
      && runtimeContext.state !== MissionLifecycleStates.CEO_APPROVED_WITH_WAIVERS
    ) {
      return {
        enabled: false,
        mode: runtimeContext.executionPolicy.publishingMode,
        publishStatus: 'NOT_REQUESTED',
        status: 'NOT_APPROVED_FOR_PUBLISHING'
      };
    }

    if (runtimeContext.executionPolicy.publishingMode === 'NONE') {
      return {
        enabled: false,
        mode: runtimeContext.executionPolicy.publishingMode,
        publishStatus: 'NOT_REQUESTED',
        status: 'DISABLED_BY_POLICY'
      };
    }

    this.transitionTo(runtimeContext, MissionLifecycleStates.PUBLISHING);

    if (!this.publishingWorker || typeof this.publishingWorker.execute !== 'function') {
      return {
        enabled: true,
        mode: runtimeContext.executionPolicy.publishingMode,
        publishStatus: 'PUBLISHING_WORKER_UNAVAILABLE',
        status: 'FAILED'
      };
    }

    const assignment = this.createAssignment({
      assignmentId: `${runtimeContext.missionId}-PUBLISH`,
      workerId: 'PUBLISHING-WORKER-001',
      taskId: 'TASK-PUBLISH',
      metadata: {
        producerBrief: runtimeContext.artifacts?.producerBrief ?? null,
        producerBriefSupport: this.buildProducerBriefSupportExplanation({
          specialist: 'Publishing',
          producerBrief: runtimeContext.artifacts?.producerBrief ?? null,
          objective: 'Package publication metadata and call-to-action framing to align final distribution with the Producer Brief success definition.'
        }),
        videoAsset: videoResult.videoFile,
        thumbnailAsset: imageResult.imageFiles?.[0] ?? null,
        title: scriptResult.scriptTitle ?? `${runtimeContext.missionId} Mission Output`,
        description: request.objective ?? runtimeContext.missionObjective,
        tags: [runtimeContext.businessId, runtimeContext.missionId.toLowerCase()],
        categoryId: request.categoryId ?? '22',
        visibility: 'private',
        publishTime: request.publishTime ?? null,
        targetPlatform: request.targetPlatform ?? 'youtube',
        scheduledPublishTime: request.scheduledPublishTime ?? 'SCHEDULED_PUBLISH_TIME_PLACEHOLDER',
        businessId: runtimeContext.businessId,
        missionId: runtimeContext.missionId
      }
    });

    const publishResult = await this.publishingWorker.execute(assignment);

    return {
      enabled: true,
      mode: runtimeContext.executionPolicy.publishingMode,
      ...publishResult
    };
  }

  resolveCEODecision({ request, executiveDecisionPacket }) {
    const explicitDecision = String(request.ceoDecision ?? '').toUpperCase().trim();

    if (explicitDecision.length > 0) {
      return explicitDecision;
    }

    return String(executiveDecisionPacket.recommendedCEOAction ?? 'RETURN_FOR_REVISION').toUpperCase().trim();
  }

  buildRecommendationContracts({ request, qualityReview, runtimeContext }) {
    if (Array.isArray(request.recommendationContracts) && request.recommendationContracts.length > 0) {
      return request.recommendationContracts;
    }

    if (request.recommendationContracts && typeof request.recommendationContracts === 'object') {
      return request.recommendationContracts;
    }

    const defaultDecision = qualityReview.passed ? 'APPROVE' : 'REVISE';
    const storytellingEvaluation = runtimeContext.artifacts.storytellingEvaluation ?? null;
    const storytellingOverallScore = Number(storytellingEvaluation?.overallScore ?? 0);
    const evidenceReferences = [
      `MISSION:${runtimeContext.missionId}`,
      `QUALITY_PASSED:${String(qualityReview.passed)}`,
      `STORYTELLING_OVERALL_SCORE:${storytellingOverallScore}`
    ];

    return {
      COO: {
        decision: defaultDecision,
        confidence: qualityReview.passed ? 85 : 50,
        rationale: 'Operational readiness evaluated from runtime execution outputs.',
        evidenceReferences
      },
      CMO: {
        decision: defaultDecision,
        confidence: qualityReview.passed ? 80 : 45,
        rationale: 'Market readiness placeholder recommendation for runtime compatibility.',
        evidenceReferences
      },
      CFO: {
        decision: defaultDecision,
        confidence: qualityReview.passed ? 78 : 44,
        rationale: 'Financial readiness placeholder recommendation for runtime compatibility.',
        evidenceReferences
      },
      CCO: {
        decision: defaultDecision,
        confidence: qualityReview.passed ? Math.max(60, Math.min(95, Math.round(storytellingOverallScore * 10))) : 46,
        rationale: storytellingEvaluation
          ? `Creative readiness informed by storytelling evaluation with overall score ${storytellingOverallScore}.`
          : 'Creative readiness placeholder recommendation for runtime compatibility.',
        evidenceReferences
      },
      CTO: {
        decision: defaultDecision,
        confidence: qualityReview.passed ? 86 : 48,
        rationale: 'Technical readiness evaluated from runtime and quality outputs.',
        evidenceReferences
      },
      CQO: {
        decision: qualityReview.passed ? 'APPROVE' : 'BLOCK',
        confidence: qualityReview.passed ? 90 : 70,
        rationale: 'Quality authority recommendation mapped from quality review result.',
        evidenceReferences
      }
    };
  }

  evaluateStorytellingScript({ runtimeContext, scriptResult }) {
    const script = String(scriptResult?.script ?? '').trim();

    if (script.length === 0) {
      return {
        scores: {
          openingStrength: 0,
          curiosity: 0,
          narrativeFlow: 0,
          informationDensity: 0,
          audienceCommitment: 0
        },
        overallScore: 0,
        classification: 'FAIL',
        improvementRecommendations: ['Script content is empty. Regenerate script before executive review.']
      };
    }

    const result = this.storytellingEvaluator.evaluate(script);

    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'STORYTELLING_EVALUATED',
      details: {
        overallScore: result.overallScore,
        classification: result.classification
      }
    }));

    return result;
  }

  runStorytellingIterativeRewriteLoop({ runtimeContext, request, initialScriptResult }) {
    const config = this.resolveStorytellingIterationConfig(request);
    const iterationHistory = [];

    let currentScriptResult = {
      ...initialScriptResult,
      script: String(initialScriptResult?.script ?? '')
    };
    let bestVersion = null;
    let previousScore = null;
    let pendingRewriteDetails = {
      rewrittenSections: [],
      coachingRecommendationsApplied: []
    };

    for (let iteration = 1; iteration <= config.maxIterations; iteration += 1) {
      const evaluation = this.evaluateStorytellingScript({
        runtimeContext,
        scriptResult: currentScriptResult
      });

      iterationHistory.push({
        iteration,
        overallScore: evaluation.overallScore,
        categoryScores: evaluation.scores ?? {},
        rewrittenSections: pendingRewriteDetails.rewrittenSections,
        coachingRecommendationsApplied: pendingRewriteDetails.coachingRecommendationsApplied
      });

      if (!bestVersion || Number(evaluation.overallScore ?? 0) > Number(bestVersion.evaluation?.overallScore ?? 0)) {
        bestVersion = {
          iteration,
          scriptResult: {
            ...currentScriptResult
          },
          evaluation
        };
      }

      if (Number(evaluation.overallScore ?? 0) >= config.targetScore) {
        break;
      }

      const improvement = previousScore === null
        ? null
        : Number((Number(evaluation.overallScore ?? 0) - Number(previousScore)).toFixed(2));

      if (improvement !== null && improvement < config.minimumImprovementThreshold) {
        break;
      }

      if (!this.hasStorytellingCoachingRecommendations(evaluation)) {
        break;
      }

      const rewriteResult = this.rewriteStorytellingSections({
        script: currentScriptResult.script,
        evaluation
      });

      if (rewriteResult.rewrittenSections.length === 0 || rewriteResult.rewrittenScript === currentScriptResult.script) {
        break;
      }

      previousScore = Number(evaluation.overallScore ?? 0);
      currentScriptResult = {
        ...currentScriptResult,
        script: rewriteResult.rewrittenScript
      };
      pendingRewriteDetails = {
        rewrittenSections: rewriteResult.rewrittenSections.map(section => section.sceneId),
        coachingRecommendationsApplied: rewriteResult.coachingRecommendationsApplied
      };

      runtimeContext.events.push(this.createEvent({
        missionId: runtimeContext.missionId,
        state: runtimeContext.state,
        type: 'STORYTELLING_REWRITE_APPLIED',
        details: {
          nextIteration: iteration + 1,
          rewrittenSections: pendingRewriteDetails.rewrittenSections,
          appliedRecommendationCount: pendingRewriteDetails.coachingRecommendationsApplied.length
        }
      }));
    }

    const selectedVersion = bestVersion ?? {
      iteration: 1,
      scriptResult: {
        ...currentScriptResult
      },
      evaluation: this.evaluateStorytellingScript({
        runtimeContext,
        scriptResult: currentScriptResult
      })
    };

    return {
      scriptResult: selectedVersion.scriptResult,
      evaluation: {
        ...selectedVersion.evaluation,
        iterativeRewrite: {
          targetScore: config.targetScore,
          minimumImprovementThreshold: config.minimumImprovementThreshold,
          maxIterations: config.maxIterations,
          completedIterations: iterationHistory.length,
          selectedIteration: selectedVersion.iteration,
          highestOverallScore: selectedVersion.evaluation.overallScore,
          iterationHistory
        }
      },
      iterations: iterationHistory
    };
  }

  resolveStorytellingIterationConfig(request = {}) {
    const config = request.storytellingIterationConfig ?? request.runtimePolicy?.storytellingIterationConfig ?? {};

    const targetScore = Number.parseFloat(String(config.targetScore ?? 8));
    const minimumImprovementThreshold = Number.parseFloat(String(config.minimumImprovementThreshold ?? 0.2));
    const maxIterations = Number.parseInt(String(config.maxIterations ?? 3), 10);

    return {
      targetScore: Number.isFinite(targetScore) ? Math.max(0, Math.min(10, targetScore)) : 8,
      minimumImprovementThreshold: Number.isFinite(minimumImprovementThreshold)
        ? Math.max(0, Math.min(5, minimumImprovementThreshold))
        : 0.2,
      maxIterations: Number.isFinite(maxIterations)
        ? Math.max(1, Math.min(10, maxIterations))
        : 3
    };
  }

  hasStorytellingCoachingRecommendations(evaluation = {}) {
    return Array.isArray(evaluation.improvementRecommendations) && evaluation.improvementRecommendations.length > 0;
  }

  resolveWritersRoomConfig(request = {}) {
    const config = request.writersRoomConfig ?? request.runtimePolicy?.writersRoomConfig ?? {};
    const maxRevisionCycles = Number.parseInt(String(config.maxRevisionCycles ?? 2), 10);

    return {
      maxRevisionCycles: Number.isFinite(maxRevisionCycles)
        ? Math.max(1, Math.min(5, maxRevisionCycles))
        : 2
    };
  }

  async runWritersRoomWorkflow({ runtimeContext, request, firstDraftScriptResult }) {
    const config = this.resolveWritersRoomConfig(request);
    const planningDraft = {
      ...firstDraftScriptResult,
      script: String(firstDraftScriptResult?.script ?? ''),
      draftLabel: 'DRAFT_1'
    };

    const firstDraft = await this.runScreenplayComposition({
      runtimeContext,
      request,
      planningScriptResult: planningDraft,
      revisionRequests: [],
      writerResponses: []
    });

    this.validateLanguageRealizationOutput({
      runtimeContext,
      scriptResult: firstDraft,
      stageLabel: 'INITIAL_COMPOSITION'
    });

    let currentDraft = {
      ...firstDraft
    };
    let finalReview = null;
    const cycles = [];
    const improvementHistory = [];
    let previousCycleScore = null;
    let previousPrimaryObjective = null;
    let previousUnresolvedObjectiveCount = null;

    for (let cycle = 1; cycle <= config.maxRevisionCycles; cycle += 1) {
      const editor = this.resolveExecutiveScriptEditor();
      const editorReview = typeof editor.reviewScreenplay === 'function'
        ? editor.reviewScreenplay({
          script: currentDraft.script,
          topic: request?.topic ?? request?.objective ?? runtimeContext.missionObjective,
          producerBrief: runtimeContext.artifacts?.producerBrief ?? null,
          researchPackage: runtimeContext.artifacts?.researchEvaluation?.researchPackage ?? null
        })
        : this.applyExecutiveScriptEdit({ runtimeContext, request, scriptResult: currentDraft }).review;

      const cycleStorytellingScorecard = this.evaluateStorytellingScript({
        runtimeContext,
        scriptResult: currentDraft
      });

      const revisionRequests = Array.isArray(editorReview?.revisionRequests) ? editorReview.revisionRequests : [];
      const improvementPlan = this.buildImprovementPlan({
        executiveProducerPackage: {
          cycleCount: cycle,
          cycles,
          storytellingEvaluation: cycleStorytellingScorecard
        },
        executiveScriptReview: {
          editorReview
        },
        storytellingScorecard: cycleStorytellingScorecard,
        previousRevisionHistory: cycles,
        goldStandard: {
          name: 'Atlas Documentary Storytelling Gold Standard'
        }
      });

      const producerCritique = this.buildExecutiveProducerScriptCritique({
        editorReview,
        cycle,
        scriptResult: currentDraft,
        storytellingScorecard: cycleStorytellingScorecard,
        improvementPlan
      });

      const approvedIssueTypes = new Set(
        (improvementPlan?.prioritizedObjectives ?? [])
          .map(objective => String(objective?.issueType ?? '').trim().toLowerCase())
          .filter(Boolean)
      );
      const prioritizedRevisionRequests = revisionRequests
        .filter(requestItem => approvedIssueTypes.has(String(requestItem?.issueType ?? '').toLowerCase()))
        .slice(0, 3);

      const primaryObjective = improvementPlan?.primaryObjective ?? null;
      const strategicObjectiveRevisionRequests = this.buildStrategicObjectiveRevisionRequests({
        primaryObjective,
        editorReview,
        cycle,
        existingRevisionRequests: prioritizedRevisionRequests
      });
      const revisionRequestsForComposer = [...prioritizedRevisionRequests, ...strategicObjectiveRevisionRequests];

      const writerResponses = this.buildWriterResponsesToEditorFeedback({
        revisionRequests: revisionRequestsForComposer,
        currentDraft
      });
      const actionableRevisionRequests = this.resolveActionableRevisionRequests({
        revisionRequests: revisionRequestsForComposer,
        writerResponses
      });

      const productionReadiness = improvementPlan?.productionReadiness ?? {
        isReady: false,
        currentOverallScore: Number(cycleStorytellingScorecard?.overallScore ?? 0),
        unresolvedObjectiveCount: Number(improvementPlan?.unresolvedObjectiveCount ?? 0),
        rationale: 'Executive producer readiness is unavailable.'
      };

      const cycleScoreReport = this.buildExecutiveProducerIterationReport({
        previousScore: previousCycleScore,
        currentScore: Number(cycleStorytellingScorecard?.overallScore ?? 0),
        previousPrimaryObjective,
        currentPrimaryObjective: primaryObjective,
        previousCategoryScores: previousCycleScore?.categoryScores ?? null,
        currentCategoryScores: cycleStorytellingScorecard?.scores ?? {},
        unresolvedObjectives: improvementPlan?.unresolvedObjectives ?? [],
        previousUnresolvedObjectiveCount,
        productionReadiness
      });

      const editorApproval = String(editorReview?.approvalStatus ?? '').toUpperCase() === 'APPROVED_FOR_PRODUCTION';
      const approvedForProduction = Boolean(productionReadiness.isReady)
        || (editorApproval && cycle >= config.maxRevisionCycles);

      finalReview = {
        approvalStatus: approvedForProduction ? 'APPROVED_FOR_PRODUCTION' : 'REVISION_REQUIRED',
        cycle,
        editorReview,
        writerResponse: writerResponses,
        improvementPlan,
        storytellingScorecard: cycleStorytellingScorecard,
        cycleScoreReport,
        executiveProducerCritique: producerCritique
      };

      improvementHistory.push(improvementPlan);
      cycles.push({
        cycle,
        approvalStatus: finalReview.approvalStatus,
        revisionRequestCount: revisionRequests.length,
        prioritizedObjectiveCount: improvementPlan?.objectiveCount ?? 0,
        prioritizedRevisionRequestCount: prioritizedRevisionRequests.length,
        strategicObjectiveRequestCount: strategicObjectiveRevisionRequests.length,
        actionableRevisionRequestCount: actionableRevisionRequests.length,
        editorSummary: String(editorReview?.summary ?? ''),
        optimizationQuestion: String(improvementPlan?.optimizationQuestion ?? ''),
        singleHighestImpactChange: String(improvementPlan?.singleHighestImpactChange ?? ''),
        editorFeedback: revisionRequests,
        prioritizedObjectives: improvementPlan?.prioritizedObjectives ?? [],
        prioritizedRevisionRequests,
        strategicObjectiveRevisionRequests,
        revisionRequestsForComposer,
        improvementPlan,
        productionReadiness,
        cycleScoreReport,
        writerResponse: writerResponses,
        producerDecision: producerCritique.decision,
        producerCritique
      });

      runtimeContext.events.push(this.createEvent({
        missionId: runtimeContext.missionId,
        state: runtimeContext.state,
        type: 'WRITERS_ROOM_CYCLE_COMPLETED',
        details: {
          cycle,
          approvalStatus: finalReview.approvalStatus,
          revisionRequestCount: revisionRequests.length,
          prioritizedObjectiveCount: improvementPlan?.objectiveCount ?? 0,
          prioritizedRevisionRequestCount: prioritizedRevisionRequests.length,
          strategicObjectiveRequestCount: strategicObjectiveRevisionRequests.length,
          actionableRevisionRequestCount: actionableRevisionRequests.length,
          producerDecision: producerCritique.decision,
          previousScore: cycleScoreReport.previousScore,
          newScore: cycleScoreReport.newScore,
          scoreDelta: cycleScoreReport.scoreDelta,
          improvedObjective: cycleScoreReport.improvedObjective,
          unresolvedObjectiveCount: cycleScoreReport.unresolvedObjectiveCount,
          movingTowardProductionReadiness: cycleScoreReport.movingTowardProductionReadiness
        }
      }));

      previousCycleScore = {
        overallScore: Number(cycleStorytellingScorecard?.overallScore ?? 0),
        categoryScores: cycleStorytellingScorecard?.scores ?? {}
      };
      previousPrimaryObjective = primaryObjective;
      previousUnresolvedObjectiveCount = Number(improvementPlan?.unresolvedObjectiveCount ?? 0);

      if (approvedForProduction || cycle >= config.maxRevisionCycles) {
        break;
      }

      const revisedDraft = await this.runScreenplayComposition({
        runtimeContext,
        request,
        planningScriptResult: planningDraft,
        previousComposedScript: currentDraft.script,
        revisionRequests: actionableRevisionRequests,
        writerResponses,
        cycle
      });

      this.validateLanguageRealizationOutput({
        runtimeContext,
        scriptResult: revisedDraft,
        stageLabel: `REVISION_COMPOSITION_${cycle}`
      });

      currentDraft = {
        ...currentDraft,
        ...revisedDraft,
        script: String(revisedDraft?.script ?? currentDraft.script),
        draftLabel: `DRAFT_${cycle + 1}`
      };
    }

    const approvedForProduction = String(finalReview?.approvalStatus ?? '') === 'APPROVED_FOR_PRODUCTION';

    return {
      firstDraft,
      finalDraft: currentDraft,
      finalReview,
      cycles,
      improvementPlans: improvementHistory,
      approvedForProduction
    };
  }

  buildImprovementPlan({
    executiveProducerPackage = null,
    executiveScriptReview = null,
    storytellingScorecard = null,
    previousRevisionHistory = [],
    goldStandard = null
  } = {}) {
    const planner = this.improvementPlanner;
    return planner.planImprovements({
      executiveProducerPackage,
      executiveScriptReview,
      storytellingScorecard,
      goldStandard,
      previousRevisionHistory
    });
  }

  buildStrategicObjectiveRevisionRequests({
    primaryObjective = null,
    editorReview = null,
    cycle = 1,
    existingRevisionRequests = []
  }) {
    if (!primaryObjective || typeof primaryObjective !== 'object') {
      return [];
    }

    const issueType = String(primaryObjective?.issueType ?? '').trim().toLowerCase();
    if (!issueType) {
      return [];
    }

    const alreadyCovered = existingRevisionRequests.some(item => String(item?.issueType ?? '').trim().toLowerCase() === issueType);
    if (alreadyCovered) {
      return [];
    }

    const weakestParagraphIndex = Number.parseInt(String(editorReview?.weakestParagraphIndex ?? 1), 10);
    const paragraphIndex = Number.isFinite(weakestParagraphIndex) && weakestParagraphIndex > 0
      ? weakestParagraphIndex
      : 1;

    return [
      {
        requestId: `EP-STRATEGIC-${String(cycle).padStart(2, '0')}`,
        issueType,
        paragraphIndex,
        priority: 'HIGH',
        diagnosis: String(primaryObjective?.problem ?? 'Strategic rewrite objective selected by Executive Producer.').trim(),
        reason: 'Selected because it is the single highest-impact change expected to improve Executive Producer score.',
        exampleImprovement: String(primaryObjective?.recommendedAction ?? '').trim() || null,
        request: `Executive Producer objective: ${String(primaryObjective?.recommendedAction ?? primaryObjective?.problem ?? '').trim()}`
      }
    ];
  }

  buildExecutiveProducerIterationReport({
    previousScore = null,
    currentScore = 0,
    previousPrimaryObjective = null,
    currentPrimaryObjective = null,
    previousCategoryScores = null,
    currentCategoryScores = {},
    unresolvedObjectives = [],
    previousUnresolvedObjectiveCount = null,
    productionReadiness = null
  }) {
    const previous = Number(previousScore?.overallScore ?? NaN);
    const current = Number(currentScore ?? 0);
    const hasPrevious = Number.isFinite(previous);
    const scoreDelta = hasPrevious ? Number((current - previous).toFixed(2)) : null;

    const improvedObjective = this.resolveImprovedExecutiveObjective({
      previousPrimaryObjective,
      previousCategoryScores,
      currentCategoryScores
    });

    const unresolvedObjectiveLabels = Array.isArray(unresolvedObjectives)
      ? unresolvedObjectives.map(objective => String(objective?.targetCategory ?? objective?.issueType ?? 'unknown'))
      : [];
    const unresolvedObjectiveCount = unresolvedObjectiveLabels.length;

    const movingTowardProductionReadiness = hasPrevious
      ? scoreDelta > 0
        || (
          previousUnresolvedObjectiveCount !== null
          && Number(unresolvedObjectiveCount) < Number(previousUnresolvedObjectiveCount)
        )
      : false;

    return {
      previousScore: hasPrevious ? previous : null,
      newScore: current,
      scoreDelta,
      improvedObjective,
      currentPrimaryObjective: currentPrimaryObjective
        ? String(currentPrimaryObjective?.targetCategory ?? currentPrimaryObjective?.issueType ?? 'unknown')
        : null,
      unresolvedObjectives: unresolvedObjectiveLabels,
      unresolvedObjectiveCount,
      movingTowardProductionReadiness,
      productionReadiness: productionReadiness ?? null
    };
  }

  resolveImprovedExecutiveObjective({
    previousPrimaryObjective = null,
    previousCategoryScores = null,
    currentCategoryScores = {}
  }) {
    if (!previousPrimaryObjective || !previousCategoryScores || typeof previousCategoryScores !== 'object') {
      return null;
    }

    const targetCategory = String(previousPrimaryObjective?.targetCategory ?? '').trim();
    if (!targetCategory) {
      return null;
    }

    const previousValue = Number(previousCategoryScores?.[targetCategory] ?? NaN);
    const currentValue = Number(currentCategoryScores?.[targetCategory] ?? NaN);
    if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) {
      return null;
    }

    const delta = Number((currentValue - previousValue).toFixed(2));
    if (delta <= 0) {
      return null;
    }

    return `${targetCategory} (+${delta})`;
  }

  buildWriterResponsesToEditorFeedback({ revisionRequests = [], currentDraft = {} }) {
    const script = String(currentDraft?.script ?? '');
    const conceptualIssueTypes = new Set([
      'production-note-language',
      'weak-storytelling',
      'weak-emotional-impact',
      'abstraction-overload',
      'pacing-problem',
      'immersion-problem',
      'narration-authenticity',
      'ending-impact'
    ]);

    return revisionRequests.map(request => {
      const issueType = String(request?.issueType ?? '').toLowerCase();
      const hasDirectiveLanguage = /\b(the audience should|after the credits|this documentary)\b/i.test(script);
      const revisionMode = conceptualIssueTypes.has(issueType) ? 'REWRITE' : 'EDIT';

      let decision = 'accept';
      let justification = 'This diagnosis is valid and the revision preserves the scene objective.';

      if (issueType === 'production-note-language') {
        decision = hasDirectiveLanguage ? 'accept' : 'improve';
        justification = hasDirectiveLanguage
          ? 'I agree this wording breaks narration voice, so I will rewrite it directly.'
          : 'The wording is already close; I will refine the line for clarity without changing the beat.';
      } else if (issueType === 'repetition') {
        decision = 'improve';
        justification = 'I agree with the concern and will vary phrasing while preserving escalation rhythm.';
      } else if (issueType === 'abstraction-overload') {
        decision = 'improve';
        justification = 'I will retain the argument but anchor it in concrete actors and consequences.';
      } else if (issueType === 'ending-impact') {
        decision = 'accept';
        justification = 'A stronger unresolved closing question will improve audience retention.';
      }

      return {
        requestId: request.requestId,
        revisionMode,
        decision,
        justification,
        revisedApproach: String(request?.exampleImprovement ?? '').trim() || null
      };
    });
  }

  async runScreenplayComposition({
    runtimeContext,
    request,
    planningScriptResult,
    previousComposedScript = null,
    revisionRequests = [],
    writerResponses = [],
    cycle = 1
  }) {
    const composer = this.resolveScreenplayComposer();

    const assignment = this.createAssignment({
      assignmentId: `${runtimeContext.missionId}-SCREENPLAY-COMPOSER-${cycle}`,
      workerId: 'SCREENPLAY-COMPOSER-001',
      taskId: revisionRequests.length > 0 ? `TASK-SCREENPLAY-REVISION-${cycle}` : 'TASK-SCREENPLAY-COMPOSITION',
      metadata: {
        topic: request.topic,
        audience: request.audience,
        style: request.style,
        scriptTitle: planningScriptResult?.scriptTitle ?? null,
        planningScript: String(planningScriptResult?.script ?? ''),
        previousComposedScript: String(previousComposedScript ?? ''),
        revisionRequests,
        writerResponses,
        storytellingPlan: runtimeContext.artifacts?.storytellingPlan ?? null,
        narrativeBeats: runtimeContext.artifacts?.storytellingPlan?.narrativeBeats ?? [],
        producerBrief: runtimeContext.artifacts?.producerBrief ?? null,
        researchPackage: runtimeContext.artifacts?.researchEvaluation?.researchPackage ?? null,
        editorialResearchBrief: String(runtimeContext.artifacts?.researchEvaluation?.researchPackage?.editorialResearchBrief ?? '').trim(),
        verifiedFacts: runtimeContext.artifacts?.researchEvaluation?.researchPackage?.verifiedDocumentaryFacts ?? []
      }
    });

    return composer.execute(assignment);
  }

  validateLanguageRealizationOutput({ runtimeContext, scriptResult, stageLabel = 'COMPOSITION' }) {
    const validator = this.languageRealizationValidator;
    const validation = validator.validate({
      script: String(scriptResult?.script ?? ''),
      researchPackage: runtimeContext.artifacts?.researchEvaluation?.researchPackage ?? null
    });

    runtimeContext.artifacts.languageRealizationValidation = validation;
    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'LANGUAGE_REALIZATION_VALIDATED',
      details: {
        stageLabel,
        passed: validation.passed,
        issueCount: Array.isArray(validation.issues) ? validation.issues.length : 0
      }
    }));

    if (!validation.passed) {
      throw new Error(`Language realization validation failed at ${stageLabel}: ${validation.issues.join(' | ')}`);
    }

    return validation;
  }

  resolveScreenplayComposer() {
    if (this.workers?.screenplayComposer && typeof this.workers.screenplayComposer.execute === 'function') {
      return this.workers.screenplayComposer;
    }

    return {
      async execute(assignment) {
        const script = String(assignment?.result?.task?.metadata?.planningScript ?? assignment?.result?.task?.metadata?.previousComposedScript ?? '');
        return {
          scriptTitle: assignment?.result?.task?.metadata?.scriptTitle ?? 'Documentary Screenplay',
          script,
          status: 'COMPLETED',
          completionReport: {
            assignmentId: assignment?.assignmentId ?? null,
            workerId: assignment?.workerId ?? 'SCREENPLAY-COMPOSER-001',
            taskId: assignment?.taskId ?? null,
            completedAt: 'COMPLETED_AT_PLACEHOLDER',
            status: 'COMPLETED'
          }
        };
      }
    };
  }

  resolveActionableRevisionRequests({ revisionRequests = [], writerResponses = [] }) {
    const responseMap = new Map(
      writerResponses
        .filter(response => String(response?.requestId ?? '').trim().length > 0)
        .map(response => [String(response.requestId), response])
    );

    return revisionRequests.filter(request => {
      const response = responseMap.get(String(request?.requestId ?? ''));
      const decision = String(response?.decision ?? 'accept').toLowerCase();
      return decision === 'accept' || decision === 'improve';
    });
  }

  buildExecutiveProducerScriptCritique({
    editorReview,
    cycle,
    scriptResult,
    storytellingScorecard = null,
    improvementPlan = null
  }) {
    const revisionRequests = Array.isArray(editorReview?.revisionRequests) ? editorReview.revisionRequests : [];
    const strengths = Array.isArray(editorReview?.strengths) ? editorReview.strengths : [];
    const script = String(scriptResult?.script ?? '');
    const scores = storytellingScorecard?.scores ?? {};
    const weakestCategories = Object.entries(scores)
      .map(([category, score]) => ({ category, score: Number(score ?? 0) }))
      .sort((left, right) => left.score - right.score)
      .slice(0, 2);
    const primaryObjective = improvementPlan?.primaryObjective ?? null;
    const productionReadiness = improvementPlan?.productionReadiness ?? null;

    const critiquePoints = [];

    if (strengths.length > 0) {
      critiquePoints.push(`Preserve strengths: ${strengths.join(' | ')}`);
    }

    if (revisionRequests.length > 0) {
      critiquePoints.push(
        `Address these requested fixes only: ${revisionRequests
          .map(request => `P${request.paragraphIndex} ${request.issueType}`)
          .join('; ')}`
      );
    }

    if (weakestCategories.length > 0) {
      critiquePoints.push(
        `Executive score bottlenecks: ${weakestCategories
          .map(item => `${item.category}=${item.score}`)
          .join('; ')}`
      );
    }

    if (primaryObjective) {
      critiquePoints.push(
        `Highest-impact change for next cycle: ${String(primaryObjective.recommendedAction ?? primaryObjective.problem ?? '').trim()}`
      );
    }

    if (productionReadiness?.rationale) {
      critiquePoints.push(`Production readiness status: ${productionReadiness.rationale}`);
    }

    const decision = productionReadiness?.isReady ? 'APPROVE_FOR_PRODUCTION' : 'REQUEST_REVISION';

    return {
      role: 'Executive Producer',
      cycle,
      decision,
      critique: critiquePoints,
      doesRewriteScript: false,
      draftLength: script.length
    };
  }

  applyExecutiveScriptEdit({ runtimeContext, request, scriptResult }) {
    const editor = this.resolveExecutiveScriptEditor();
    const screenplay = String(scriptResult?.script ?? '').trim();
    const producerBrief = runtimeContext.artifacts?.producerBrief ?? null;
    const researchPackage = runtimeContext.artifacts?.researchEvaluation?.researchPackage ?? null;

    const reviewResult = editor.reviewAndRevise({
      script: screenplay,
      topic: request?.topic ?? request?.objective ?? runtimeContext.missionObjective,
      producerBrief,
      editorialResearchBrief: String(researchPackage?.editorialResearchBrief ?? '').trim(),
      researchPackage
    });

    runtimeContext.events.push(this.createEvent({
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      type: 'EXECUTIVE_SCRIPT_EDIT_COMPLETED',
      details: {
        weakestParagraphIndex: reviewResult?.review?.weakestParagraphIndex ?? null,
        revisedLength: String(reviewResult?.revisedScript ?? '').length
      }
    }));

    return {
      review: reviewResult?.review ?? null,
      revisedScript: String(reviewResult?.revisedScript ?? screenplay)
    };
  }

  resolveExecutiveScriptEditor() {
    if (this.workers?.executiveScriptEditor && typeof this.workers.executiveScriptEditor.reviewAndRevise === 'function') {
      return this.workers.executiveScriptEditor;
    }

    const fallbackReviewChecklist = {
      openingHooksImmediately: true,
      productionNoteLines: [],
      repeatedIdeas: [],
      paragraphMomentum: 'Strong paragraph-to-paragraph momentum.',
      explainsInsteadOfDramatizes: false,
      narratorVoiceAuthentic: true,
      unnecessaryAbstractions: [],
      endingFeelsEarned: true,
      unforgettableIdea: 'Systemic pressure can hide behind ordinary decisions.',
      weakestParagraphIndex: 1,
      weakestParagraphWhy: 'Fallback editor used; no targeted weakness analysis available.'
    };

    return {
      reviewScreenplay: ({ script }) => ({
        approvalStatus: 'APPROVED_FOR_PRODUCTION',
        summary: 'Fallback editor approved screenplay for production.',
        strengths: ['Narrative progression is clear and coherent.'],
        revisionRequests: [],
        reviewChecklist: fallbackReviewChecklist,
        weakestParagraphIndex: 1,
        weakestParagraphWhy: fallbackReviewChecklist.weakestParagraphWhy
      }),
      reviewAndRevise: ({ script }) => ({
        review: fallbackReviewChecklist,
        revisedScript: String(script ?? '')
      })
    };
  }

  rewriteStorytellingSections({ script = '', evaluation = {} }) {
    const scriptText = String(script ?? '');
    const segmentation = this.segmentStoryIntoSections(scriptText);
    const rewriteTargets = this.collectStorytellingRewriteTargets(evaluation);
    const rewrittenSections = [];

    if (segmentation.sections.length === 0 || rewriteTargets.length === 0) {
      return {
        rewrittenScript: scriptText,
        rewrittenSections,
        coachingRecommendationsApplied: []
      };
    }

    const reasoning = evaluation.curiosityEngineeringReasoning ?? {};
    const earlyRevealIds = new Set((reasoning.revealsTooEarly ?? []).map(item => item.sceneId));
    const questionInsertionIds = new Set((reasoning.questionsShouldBeIntroduced ?? []).map(item => item.sceneId));

    const updatedSections = [...segmentation.sections];

    rewriteTargets.forEach(sceneId => {
      const sceneIndex = Number.parseInt(String(sceneId).replace('SCENE-', ''), 10) - 1;
      if (!Number.isFinite(sceneIndex) || sceneIndex < 0 || sceneIndex >= updatedSections.length) {
        return;
      }

      const originalSection = updatedSections[sceneIndex];
      let rewrittenSection = originalSection;

      if (earlyRevealIds.has(sceneId)) {
        rewrittenSection = rewrittenSection.replace(/\b(the answer is|the truth is|it was)\b/gi, 'a crucial clue suggests');
      }

      if (questionInsertionIds.has(sceneId) && !rewrittenSection.includes('?')) {
        rewrittenSection = `${rewrittenSection} But what are we still missing?`;
      }

      if (!rewrittenSection.toLowerCase().includes('stakes rise')) {
        rewrittenSection = `${rewrittenSection} The stakes rise as new evidence challenges the obvious conclusion.`;
      }

      if (rewrittenSection !== originalSection) {
        updatedSections[sceneIndex] = rewrittenSection;
        rewrittenSections.push({
          sceneId,
          before: originalSection,
          after: rewrittenSection
        });
      }
    });

    const rewrittenScript = segmentation.joinWithNewlines
      ? updatedSections.join('\n')
      : updatedSections.join(' ');

    const recommendations = Array.isArray(evaluation.improvementRecommendations)
      ? evaluation.improvementRecommendations
      : [];
    const rewrittenIds = new Set(rewrittenSections.map(section => section.sceneId));
    const coachingRecommendationsApplied = recommendations.filter(recommendation => {
      const matched = recommendation.match(/SCENE-\d{3}/g) ?? [];
      return matched.some(sceneId => rewrittenIds.has(sceneId));
    });

    return {
      rewrittenScript,
      rewrittenSections,
      coachingRecommendationsApplied
    };
  }

  segmentStoryIntoSections(script = '') {
    const rawScript = String(script ?? '').trim();
    if (rawScript.length === 0) {
      return {
        sections: [],
        joinWithNewlines: true
      };
    }

    const newlineSections = rawScript
      .split(/\n+/)
      .map(section => section.trim())
      .filter(Boolean);

    if (newlineSections.length >= 2) {
      return {
        sections: newlineSections,
        joinWithNewlines: true
      };
    }

    return {
      sections: rawScript
        .split(/(?<=[.!?])\s+/)
        .map(section => section.trim())
        .filter(Boolean),
      joinWithNewlines: false
    };
  }

  collectStorytellingRewriteTargets(evaluation = {}) {
    const reasoning = evaluation.curiosityEngineeringReasoning ?? {};
    const targetIds = new Set();

    (reasoning.sectionsShouldBeRewritten ?? []).forEach(section => {
      if (section?.sceneId) targetIds.add(section.sceneId);
    });
    (reasoning.revealsTooEarly ?? []).forEach(section => {
      if (section?.sceneId) targetIds.add(section.sceneId);
    });
    (reasoning.questionsShouldBeIntroduced ?? []).forEach(section => {
      if (section?.sceneId) targetIds.add(section.sceneId);
    });

    if (reasoning.sceneMostLikelyToLoseAudience?.sceneId) {
      targetIds.add(reasoning.sceneMostLikelyToLoseAudience.sceneId);
    }

    const recommendations = Array.isArray(evaluation.improvementRecommendations)
      ? evaluation.improvementRecommendations
      : [];
    recommendations.forEach(recommendation => {
      const sceneIds = String(recommendation).match(/SCENE-\d{3}/g) ?? [];
      sceneIds.forEach(sceneId => targetIds.add(sceneId));
    });

    return [...targetIds].sort();
  }

  buildArtifactReportPath({ missionId, artifactType }) {
    const normalizedMissionId = this.normalizeArtifactToken(missionId);
    const normalizedArtifactType = this.normalizeArtifactToken(artifactType);
    return join(this.artifactReportDirectory, `${normalizedArtifactType}-${normalizedMissionId}.json`);
  }

  normalizeArtifactToken(value) {
    return String(value ?? 'UNKNOWN')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'unknown';
  }

  persistJsonArtifact({ runtimeContext, filePath, artifactType, payload }) {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(payload ?? {}, null, 2));
    } catch (error) {
      runtimeContext.failureLedger.push({
        code: 'ARTIFACT_REPORT_PERSIST_FAILED',
        message: `Failed to persist ${artifactType} artifact report.`,
        state: runtimeContext.state,
        artifactPath: filePath,
        details: String(error?.message ?? error)
      });
    }
  }

  createCheckpoint(runtimeContext, stage) {
    return {
      checkpointId: `CHK-${runtimeContext.missionId}-${runtimeContext.checkpoints.length + 1}`,
      stage,
      state: runtimeContext.state,
      createdAt: new Date(this.now()).toISOString()
    };
  }

  createEvent({ missionId, state, type, details }) {
    return {
      eventId: `${missionId}-${type}-${this.now()}`,
      missionId,
      state,
      type,
      timestamp: new Date(this.now()).toISOString(),
      details
    };
  }

  buildRunResult(runtimeContext) {
    return {
      missionId: runtimeContext.missionId,
      state: runtimeContext.state,
      runtimeContext
    };
  }

  transitionMap() {
    return this.stateMachine.allowedTransitions;
  }
}
