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

export class MissionRunner {
  constructor({
    enterpriseKnowledgeLibrary,
    businessEvaluationApplication,
    businessLaunchPlanGenerator,
    businessExecutionPlanGenerator,
    programManager,
    workers,
    qualityReviewEngine,
    publishingWorker
  } = {}) {
    this.enterpriseKnowledgeLibrary = enterpriseKnowledgeLibrary ?? new EnterpriseKnowledgeLibrary();
    this.businessEvaluationApplication = businessEvaluationApplication ?? null;
    this.businessLaunchPlanGenerator = businessLaunchPlanGenerator ?? new BusinessLaunchPlanGenerator();
    this.businessExecutionPlanGenerator = businessExecutionPlanGenerator ?? new BusinessExecutionPlanGenerator();
    this.programManager = programManager ?? new ProgramManager();
    this.workers = workers ?? {
      scriptWorker: new YouTubeScriptWorker(),
      voiceWorker: new VoiceWorker({ programManager: this.programManager }),
      imageWorker: new ImageWorker({ programManager: this.programManager }),
      videoWorker: new VideoWorker({ programManager: this.programManager })
    };
    this.qualityReviewEngine = qualityReviewEngine ?? new QualityReviewEngine();
    this.publishingWorker = publishingWorker ?? new PublishingWorker({ programManager: this.programManager });
  }

  async runMission({ playbookId, businessRequest = {} } = {}) {
    if (!this.businessEvaluationApplication || typeof this.businessEvaluationApplication.evaluateBusinessOpportunity !== 'function') {
      throw new Error('MissionRunner requires a BusinessEvaluationApplication instance.');
    }

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
    const { scriptResult, voiceResult, imageResult, videoResult } = await this.runWorkerPipeline({
      missionId,
      playbook,
      businessRequest,
      decisionPackage
    });

    const qualityReview = this.qualityReviewEngine.review({
      script: scriptResult.script,
      voiceOutput: voiceResult.audioFile,
      imageOutputs: imageResult.imageFiles,
      videoOutput: videoResult.videoFile,
      metadata: {
        missionId,
        playbookId,
        decisionRecommendation: decisionPackage.recommendation ?? 'UNKNOWN'
      }
    });

    const publishingAssignment = this.createAssignment({
      assignmentId: `${missionId}-PUBLISH`,
      workerId: 'PUBLISHING-WORKER-001',
      taskId: 'TASK-PUBLISH',
      metadata: {
        videoAsset: videoResult.videoFile,
        thumbnailAsset: imageResult.imageFiles?.[0] ?? null,
        title: scriptResult.scriptTitle ?? `${playbook.title} Mission Output`,
        description: businessRequest.objective ?? playbook.objective,
        tags: [playbook.playbookId, missionId.toLowerCase()],
        targetPlatform: businessRequest.targetPlatform ?? 'youtube',
        scheduledPublishTime: businessRequest.scheduledPublishTime ?? 'SCHEDULED_PUBLISH_TIME_PLACEHOLDER'
      }
    });
    const publishingResult = await this.publishingWorker.execute(publishingAssignment);

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
      executiveSummary: this.buildExecutiveSummary({
        status,
        missionId,
        decisionPackage,
        qualityReview,
        publishingResult
      })
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
    if (!qualityReview.passed) {
      return 'QUALITY_BLOCKED';
    }

    if (publishingResult.publishStatus !== 'SCHEDULED') {
      return 'PUBLISHING_BLOCKED';
    }

    return 'MISSION_COMPLETED';
  }

  buildExecutiveSummary({ status, missionId, decisionPackage, qualityReview, publishingResult }) {
    return `${missionId} is ${status}. Recommendation: ${decisionPackage.recommendation ?? 'NO_RECOMMENDATION'}. Quality passed: ${qualityReview.passed}. Publishing: ${publishingResult.publishStatus}.`;
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
