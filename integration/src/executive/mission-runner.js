import { WorkerAssignment } from '../worker-assignment.js';
import { EnterpriseKnowledgeLibrary } from '../enterprise-knowledge-library.js';
import { BusinessLaunchPlanGenerator } from './business-launch-plan-generator.js';
import { BusinessExecutionPlanGenerator } from './business-execution-plan-generator.js';
import { ProgramManager } from './program-manager.js';
import { YouTubeScriptWorker } from '../production/youtube-script-worker.js';
import { VoiceWorker } from '../production/voice-worker.js';
import { ImageWorker } from '../production/image-worker.js';
import { VideoWorker } from '../production/video-worker.js';
import { QualityReviewEngine } from '../production/quality-review-engine.js';
import { PublishingWorker } from '../production/publishing-worker.js';
import { ElevenLabsVoiceService } from '../services/voice-service.js';
import { GoogleImagenService } from '../services/image-service.js';
import { GoogleVideoAssemblyService } from '../services/video-service.js';
import { MissionRuntimeOrchestrator } from '../runtime/mission-runtime-orchestrator.js';

export class MissionRunner {
  constructor({
    enterpriseKnowledgeLibrary,
    businessEvaluationApplication,
    businessLaunchPlanGenerator,
    businessExecutionPlanGenerator,
    programManager,
    workers,
    qualityReviewEngine,
    publishingWorker,
    missionRuntimeOrchestrator
  } = {}) {
    this.enterpriseKnowledgeLibrary = enterpriseKnowledgeLibrary ?? new EnterpriseKnowledgeLibrary();
    this.businessEvaluationApplication = businessEvaluationApplication ?? null;
    this.businessLaunchPlanGenerator = businessLaunchPlanGenerator ?? new BusinessLaunchPlanGenerator();
    this.businessExecutionPlanGenerator = businessExecutionPlanGenerator ?? new BusinessExecutionPlanGenerator();
    this.programManager = programManager ?? new ProgramManager();
    this.workers = workers ?? {
      scriptWorker: new YouTubeScriptWorker(),
      voiceWorker: new VoiceWorker({
        programManager: this.programManager,
        voiceService: new ElevenLabsVoiceService({ configurationService: this.configurationService })
      }),
      imageWorker: new ImageWorker({
        programManager: this.programManager,
        imageService: new GoogleImagenService({ configurationService: this.configurationService })
      }),
      videoWorker: new VideoWorker({
        programManager: this.programManager,
        videoService: new GoogleVideoAssemblyService({ configurationService: this.configurationService })
      })
    };
    this.qualityReviewEngine = qualityReviewEngine ?? new QualityReviewEngine();
    this.publishingWorker = publishingWorker ?? new PublishingWorker({ programManager: this.programManager });
    this.missionRuntimeOrchestrator = missionRuntimeOrchestrator ?? new MissionRuntimeOrchestrator({
      launchPlanGenerator: this.businessLaunchPlanGenerator,
      executionPlanGenerator: this.businessExecutionPlanGenerator,
      workers: this.workers,
      qualityReviewEngine: this.qualityReviewEngine,
      publishingWorker: this.publishingWorker
    });
  }

  async runMission({ playbookId, businessRequest = {} } = {}) {
    this.validateMissionRequest({ playbookId, businessRequest });

    const playbook = this.enterpriseKnowledgeLibrary.getPlaybook(playbookId);

    if (!playbook) {
      throw new Error(`MissionRunner could not find playbook: ${playbookId}`);
    }

    const missionId = this.buildMissionId(playbookId, businessRequest);
    const executiveMission = this.buildExecutiveMission({ missionId, playbook, businessRequest });
    const decisionPackage = await this.businessEvaluationApplication.evaluateBusinessOpportunity(executiveMission);
    const launchPlan = this.businessLaunchPlanGenerator.generate({
      ...decisionPackage,
      businessName: businessRequest.businessName ?? decisionPackage.businessName ?? playbook.title,
      objective: executiveMission.objective
    });
    const executionPlan = this.businessExecutionPlanGenerator.generate(launchPlan);

    this.programManager.assignTasks(executionPlan, 'MISSION-RUNNER');
    const runtimeRequest = this.buildRuntimeRequest({
      missionId,
      businessRequest,
      decisionPackage,
      playbook,
      objective: executiveMission.objective,
      plan: {
        launchPlan,
        executionPlan
      }
    });
    const runtimeResult = await this.missionRuntimeOrchestrator.runMission(runtimeRequest);

    const qualityReview = runtimeResult.runtimeContext.artifacts.qualityReview;
    const publishingResult = runtimeResult.runtimeContext.artifacts.publishing;

    const progressReport = this.programManager.generateExecutiveProgressReport({ tasks: this.programManager.assignments });
    const status = this.resolveMissionStatus({ qualityReview, publishingResult });

    return {
      missionId,
      status,
      decisionPackage,
      launchPlan,
      executionPlan,
      progressReport,
      qualityReview,
      publishingResult,
      runtimeResult,
      executiveSummary: this.buildExecutiveSummary({
        status,
        missionId,
        decisionPackage,
        qualityReview,
        publishingResult,
        runtimeResult
      })
    };
  }

  validateMissionRequest({ playbookId, businessRequest }) {
    if (!this.businessEvaluationApplication || typeof this.businessEvaluationApplication.evaluateBusinessOpportunity !== 'function') {
      throw new Error('MissionRunner requires a BusinessEvaluationApplication instance.');
    }

    if (typeof playbookId !== 'string' || playbookId.trim().length === 0) {
      throw new Error('MissionRunner requires playbookId.');
    }

    if (!businessRequest || typeof businessRequest !== 'object') {
      throw new Error('MissionRunner requires businessRequest as an object.');
    }
  }

  buildRuntimeRequest({ missionId, businessRequest, decisionPackage, playbook, objective, plan }) {
    return {
      missionId,
      requestId: businessRequest.id ?? missionId,
      businessId: businessRequest.businessId ?? 'SYSTEM_INTERNAL',
      businessName: businessRequest.businessName ?? decisionPackage.businessName ?? playbook.title,
      objective,
      topic: businessRequest.topic ?? decisionPackage.businessName ?? playbook.title,
      audience: businessRequest.audience ?? 'General Audience',
      targetLength: businessRequest.targetLength ?? 900,
      style: businessRequest.style ?? 'Cinematic Horror',
      voiceStyle: businessRequest.voiceStyle ?? 'Cinematic Horror',
      language: businessRequest.language ?? 'en-US',
      targetDuration: businessRequest.targetDuration ?? 60,
      sceneDescription: businessRequest.sceneDescription ?? 'Primary promotional scene',
      artStyle: businessRequest.artStyle ?? 'Cinematic Illustration',
      imageCount: businessRequest.imageCount ?? 3,
      targetFormat: businessRequest.targetFormat ?? 'mp4',
      targetResolution: businessRequest.targetResolution ?? '1920x1080',
      targetPlatform: businessRequest.targetPlatform ?? 'youtube',
      categoryId: businessRequest.categoryId ?? '22',
      publishTime: businessRequest.publishTime ?? null,
      scheduledPublishTime: businessRequest.scheduledPublishTime ?? 'SCHEDULED_PUBLISH_TIME_PLACEHOLDER',
      publishingMode: businessRequest.runtimePolicy?.publishingMode ?? 'NONE',
      stopAfterReleaseCandidate: businessRequest.runtimePolicy?.stopAfterReleaseCandidate ?? false,
      decisionPackage,
      plan
    };
  }

  async runWorkerPipeline({ missionId, playbook, businessRequest, decisionPackage }) {
    const scriptAssignment = this.createAssignment({
      assignmentId: `${missionId}-SCRIPT`,
      workerId: 'YOUTUBE-SCRIPT-WORKER-001',
      taskId: 'TASK-SCRIPT',
      metadata: {
        topic: businessRequest.topic ?? decisionPackage.businessName ?? playbook.title,
        audience: businessRequest.audience ?? 'General Audience',
        targetLength: businessRequest.targetLength ?? 900,
        style: businessRequest.style ?? 'Cinematic Horror'
      }
    });
    const scriptResult = await this.workers.scriptWorker.execute(scriptAssignment);
    this.programManager.receiveCompletion(scriptAssignment);

    const voiceAssignment = this.createAssignment({
      assignmentId: `${missionId}-VOICE`,
      workerId: 'VOICE-WORKER-001',
      taskId: 'TASK-VOICE',
      metadata: {
        script: scriptResult.script,
        voiceStyle: businessRequest.voiceStyle ?? 'Cinematic Horror',
        language: businessRequest.language ?? 'en-US',
        targetDuration: businessRequest.targetDuration ?? 60
      }
    });
    const voiceResult = await this.workers.voiceWorker.execute(voiceAssignment);

    const imageAssignment = this.createAssignment({
      assignmentId: `${missionId}-IMAGE`,
      workerId: 'IMAGE-WORKER-001',
      taskId: 'TASK-IMAGE',
      metadata: {
        script: scriptResult.script,
        sceneDescription: businessRequest.sceneDescription ?? 'Primary promotional scene',
        artStyle: businessRequest.artStyle ?? 'Cinematic Illustration',
        imageCount: businessRequest.imageCount ?? 3
      }
    });
    const imageResult = await this.workers.imageWorker.execute(imageAssignment);

    const videoAssignment = this.createAssignment({
      assignmentId: `${missionId}-VIDEO`,
      workerId: 'VIDEO-WORKER-001',
      taskId: 'TASK-VIDEO',
      metadata: {
        script: scriptResult.script,
        voiceOutput: voiceResult.audioFile,
        imageOutputs: imageResult.imageFiles,
        targetFormat: businessRequest.targetFormat ?? 'mp4',
        targetResolution: businessRequest.targetResolution ?? '1920x1080'
      }
    });
    const videoResult = await this.workers.videoWorker.execute(videoAssignment);

    return {
      scriptResult,
      voiceResult,
      imageResult,
      videoResult
    };
  }

  buildExecutiveMission({ missionId, playbook, businessRequest }) {
    return {
      id: missionId,
      businessOpportunity: businessRequest.businessOpportunity ?? businessRequest.objective ?? playbook.title,
      objective: businessRequest.objective ?? playbook.objective,
      ceoQuestions: businessRequest.ceoQuestions ?? []
    };
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

  resolveMissionStatus({ qualityReview, publishingResult }) {
    if (publishingResult?.status === 'STOPPED_AFTER_RELEASE_CANDIDATE') {
      return 'RELEASE_CANDIDATE_CREATED';
    }

    if (!qualityReview.passed) {
      return 'QUALITY_BLOCKED';
    }

    if (String(publishingResult.publishStatus ?? '').toUpperCase().trim() === 'NOT_REQUESTED') {
      return 'MISSION_COMPLETED';
    }

    const publishStatus = String(publishingResult.publishStatus ?? '').toUpperCase().trim();

    if (!(publishStatus === 'SCHEDULED' || publishStatus.startsWith('PUBLISHED'))) {
      return 'PUBLISHING_BLOCKED';
    }

    return 'MISSION_COMPLETED';
  }

  buildExecutiveSummary({ status, missionId, decisionPackage, qualityReview, publishingResult, runtimeResult }) {
    const artifacts = runtimeResult?.runtimeContext?.artifacts ?? {};
    const inventory = artifacts.releaseCandidatePackage?.assetInventory ?? {};
    const videoPath = inventory.videoOutput ?? artifacts.video?.videoFile ?? 'UNAVAILABLE';
    const audioPath = inventory.voiceOutput ?? artifacts.voice?.audioFile ?? 'UNAVAILABLE';
    const imagePaths = Array.isArray(inventory.imageOutputs) && inventory.imageOutputs.length > 0
      ? inventory.imageOutputs
      : (Array.isArray(artifacts.images?.imageFiles) ? artifacts.images.imageFiles : []);
    const executiveReportPath = artifacts.executiveReportPath ?? 'UNAVAILABLE';
    const releaseCandidatePackagePath = artifacts.releaseCandidatePackagePath ?? 'UNAVAILABLE';

    const summary = `${missionId} is ${status}. Recommendation: ${decisionPackage.recommendation ?? 'NO_RECOMMENDATION'}. Quality passed: ${qualityReview.passed}. Publishing: ${publishingResult.publishStatus}. Video ID: ${publishingResult.videoId ?? 'UNAVAILABLE'}.`;

    if (!artifacts.releaseCandidatePackage) {
      return summary;
    }

    return `${summary} Artifact paths: mp4=${videoPath}; audio=${audioPath}; images=${imagePaths.length > 0 ? imagePaths.join(', ') : 'UNAVAILABLE'}; executiveReport=${executiveReportPath}; releaseCandidatePackage=${releaseCandidatePackagePath}.`;
  }

  buildMissionId(playbookId, businessRequest) {
    const requestToken = businessRequest.id
      ?? businessRequest.businessId
      ?? 'REQUEST';

    return `MISSION-${this.normalizeToken(playbookId)}-${this.normalizeToken(requestToken)}`;
  }

  normalizeToken(value) {
    return String(value)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'UNKNOWN';
  }
}
