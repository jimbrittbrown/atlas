import {
  WebsiteExecutiveReviewMissionStates,
  WebsiteExecutiveReviewWorkflowStages,
  calculateWebsiteExecutiveReviewCompletionPercentage,
  createWebsiteExecutiveReviewMissionRequest,
  createWebsiteExecutiveReviewMissionStateMachine,
  resolveWebsiteExecutiveReviewStageById,
  validateWebsiteExecutiveReviewMissionRequest,
  websiteExecutiveReviewStageIndex
} from './website-executive-review-package-contracts.js';
import { AtlasWebsiteOrchestrator } from './website-orchestrator.js';
import { WebsiteExecutiveReviewPackageGenerator } from './website-executive-review-package-generator.js';

function isoNow(timeProvider) {
  return timeProvider?.() ?? new Date().toISOString();
}

function parseProspectFromUrl({ prospectUrl, prospect = {} }) {
  const parsed = new URL(prospectUrl);
  const host = String(parsed.hostname ?? '').toLowerCase();
  const companyName = host
    .replace(/^www\./, '')
    .split('.')
    .slice(0, 2)
    .join(' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    ...prospect,
    approved: prospect.approved ?? true,
    approvedBy: prospect.approvedBy ?? 'ATLAS_EXECUTIVE_REVIEW_PACKAGE_V1',
    approvedAt: prospect.approvedAt ?? new Date().toISOString(),
    companyName: prospect.companyName ?? companyName,
    websiteUrl: parsed.toString(),
    websiteHost: host,
    segment: prospect.segment ?? 'Website Prospect'
  };
}

function buildCustomizationPlan({ mission, artifacts }) {
  return {
    source: 'ATLAS_EXECUTIVE_REVIEW_PACKAGE_V1',
    prospectUrl: mission.prospectUrl,
    companyName: artifacts.prospectProfile?.companyName ?? null,
    selectedTemplate: artifacts.templateSelection?.templateId ?? null,
    primaryCallToAction: 'Request quote / consultation',
    sectionPlan: [
      'Hero with trust proposition',
      'Services overview',
      'Proof and testimonials',
      'Contact conversion section'
    ],
    policy: {
      publishAllowed: false,
      deployAllowed: false,
      destructiveOperationsAllowed: false,
      ceoApprovalRequiredBeforePublish: true
    }
  };
}

function inferWebsiteHealthScores({ intelligenceReport, brandPackage, templateSelection }) {
  const confidence = Number(intelligenceReport?.confidence ?? 0.7);
  const brand = Number(brandPackage?.confidence ?? 0.75);
  const template = Number(templateSelection?.confidence ?? 0.72);

  return {
    contentClarity: Math.round(confidence * 100),
    conversionReadiness: Math.round(template * 100),
    brandConsistency: Math.round(brand * 100),
    trustSignals: Math.round(((confidence + brand) / 2) * 100),
    technicalReadiness: Math.round(((confidence + template) / 2) * 100)
  };
}

export class WebsiteExecutiveReviewMissionManager {
  constructor({ orchestrator, reviewPackageGenerator, stateMachine, logger, timeProvider } = {}) {
    this.orchestrator = orchestrator ?? new AtlasWebsiteOrchestrator();
    this.reviewPackageGenerator = reviewPackageGenerator ?? new WebsiteExecutiveReviewPackageGenerator();
    this.stateMachine = stateMachine ?? createWebsiteExecutiveReviewMissionStateMachine();
    this.logger = logger ?? { log: () => {} };
    this.timeProvider = timeProvider;

    this.websiteIntelligenceEngine = this.orchestrator.websiteIntelligenceEngine;
    this.websiteProductionSystem = this.orchestrator.websiteProductionSystem;
  }

  createMission(requestPayload = {}) {
    const request = createWebsiteExecutiveReviewMissionRequest(requestPayload);
    const validation = validateWebsiteExecutiveReviewMissionRequest(request);

    if (!validation.isValid) {
      throw new Error(`Website executive review mission request invalid: ${validation.issues.join(' | ')}`);
    }

    return {
      missionId: request.missionId,
      prospectUrl: request.prospectUrl,
      prospect: request.prospect,
      existingBranding: request.existingBranding,
      adapterType: request.adapterType,
      providerHint: request.providerHint,
      estimatedStageMinutes: request.estimatedStageMinutes,
      state: WebsiteExecutiveReviewMissionStates.WAITING,
      currentStageId: WebsiteExecutiveReviewWorkflowStages[0].id,
      completedStageIds: [],
      stageHistory: [],
      failureLog: [],
      warnings: [],
      blockingIssues: [],
      artifacts: {
        prospectProfile: null,
        intelligenceReport: null,
        brandPackage: null,
        templateSelection: null,
        customizationPlan: null,
        executiveReviewPackage: null
      },
      governance: {
        publishAttempted: false,
        deployAttempted: false,
        destructiveOperationAttempted: false,
        stopBeforePublish: true,
        ceoApprovalRequiredBeforePublish: true
      },
      createdAt: isoNow(this.timeProvider),
      updatedAt: isoNow(this.timeProvider)
    };
  }

  async runMission(requestPayload = {}, options = {}) {
    const mission = options.mission ?? this.createMission(requestPayload);

    if (options.rollbackToStageId) {
      this.rollbackMission({ mission, stageId: options.rollbackToStageId, reason: options.rollbackReason });
    }

    if (options.retryStageId) {
      this.retryStage({ mission, stageId: options.retryStageId });
    }

    if (this.stateMachine.terminalStates.has(mission.state)) {
      return this.buildResult({ mission });
    }

    this.transitionState({ mission, nextState: WebsiteExecutiveReviewMissionStates.RUNNING });

    const startIndex = options.resumeFromStageId
      ? Math.max(0, websiteExecutiveReviewStageIndex(options.resumeFromStageId))
      : Math.max(0, websiteExecutiveReviewStageIndex(mission.currentStageId));

    for (let index = startIndex; index < WebsiteExecutiveReviewWorkflowStages.length; index += 1) {
      const stage = WebsiteExecutiveReviewWorkflowStages[index];

      try {
        await this.executeStage({ mission, stage });
      } catch (error) {
        this.logFailure({ mission, stageId: stage.id, action: 'stage-execution', error });
        this.transitionState({ mission, nextState: WebsiteExecutiveReviewMissionStates.FAILED });
        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }

      if (mission.state === WebsiteExecutiveReviewMissionStates.FAILED) {
        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }

      if (mission.state === WebsiteExecutiveReviewMissionStates.AWAITING_CEO_APPROVAL) {
        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }
    }

    mission.updatedAt = isoNow(this.timeProvider);
    return this.buildResult({ mission });
  }

  async executeStage({ mission, stage }) {
    mission.currentStageId = stage.id;
    mission.stageHistory.push({
      stageId: stage.id,
      startedAt: isoNow(this.timeProvider),
      status: 'RUNNING'
    });

    const adapter = this.orchestrator.adapterRegistry.getAdapter(mission.adapterType);

    switch (stage.id) {
      case 'RECEIVE_PROSPECT_URL': {
        mission.artifacts.prospectProfile = parseProspectFromUrl({
          prospectUrl: mission.prospectUrl,
          prospect: mission.prospect
        });
        break;
      }
      case 'WEBSITE_INTELLIGENCE_RESEARCH': {
        mission.artifacts.intelligenceReport = await this.websiteIntelligenceEngine.researchCompany({
          adapter,
          mission: {
            prospect: mission.artifacts.prospectProfile
          },
          artifacts: mission.artifacts
        });
        break;
      }
      case 'BRAND_PACKAGE_GENERATION': {
        mission.artifacts.brandPackage = await this.websiteIntelligenceEngine.generateBrandPackage({
          adapter,
          mission: {
            existingBranding: mission.existingBranding
          },
          artifacts: {
            ...mission.artifacts,
            companyResearch: mission.artifacts.intelligenceReport
          }
        });
        break;
      }
      case 'TEMPLATE_RECOMMENDATION': {
        mission.artifacts.templateSelection = await this.websiteProductionSystem.selectTemplate({
          adapter,
          mission,
          artifacts: {
            ...mission.artifacts,
            brandPackage: mission.artifacts.brandPackage
          }
        });
        break;
      }
      case 'CUSTOMIZATION_PLAN_GENERATION': {
        mission.artifacts.customizationPlan = buildCustomizationPlan({ mission, artifacts: mission.artifacts });
        break;
      }
      case 'EXECUTIVE_REVIEW_PACKAGE': {
        const websiteHealthScores = inferWebsiteHealthScores({
          intelligenceReport: mission.artifacts.intelligenceReport,
          brandPackage: mission.artifacts.brandPackage,
          templateSelection: mission.artifacts.templateSelection
        });

        mission.artifacts.executiveReviewPackage = this.reviewPackageGenerator.generate({
          mission,
          intelligenceReport: mission.artifacts.intelligenceReport,
          brandPackage: mission.artifacts.brandPackage,
          templateSelection: mission.artifacts.templateSelection,
          customizationPlan: mission.artifacts.customizationPlan,
          websiteHealthScores
        });

        this.transitionState({ mission, nextState: WebsiteExecutiveReviewMissionStates.REVIEW_READY });
        break;
      }
      case 'AWAIT_CEO_APPROVAL': {
        this.enforceGovernance({ mission });
        this.transitionState({ mission, nextState: WebsiteExecutiveReviewMissionStates.AWAITING_CEO_APPROVAL });
        break;
      }
      default:
        throw new Error(`Unsupported stage ${stage.id}`);
    }

    mission.completedStageIds.push(stage.id);
    this.updateStageRecord({ mission, stageId: stage.id, status: 'COMPLETED' });
    mission.updatedAt = isoNow(this.timeProvider);
  }

  enforceGovernance({ mission }) {
    if (mission.governance.publishAttempted) {
      throw new Error('Publishing is forbidden in Executive Review Package mission.');
    }

    if (mission.governance.deployAttempted) {
      throw new Error('Deploy is forbidden in Executive Review Package mission.');
    }

    if (mission.governance.destructiveOperationAttempted) {
      throw new Error('Destructive operations are forbidden in Executive Review Package mission.');
    }
  }

  transitionState({ mission, nextState }) {
    if (mission.state === nextState) {
      return;
    }

    const validation = this.stateMachine.validateTransition({
      fromState: mission.state,
      toState: nextState
    });

    if (!validation.isValid) {
      throw new Error(validation.reason);
    }

    mission.state = nextState;
  }

  updateStageRecord({ mission, stageId, status }) {
    for (let index = mission.stageHistory.length - 1; index >= 0; index -= 1) {
      const stageRecord = mission.stageHistory[index];
      if (stageRecord.stageId === stageId && stageRecord.status === 'RUNNING') {
        stageRecord.status = status;
        stageRecord.completedAt = isoNow(this.timeProvider);
        return;
      }
    }
  }

  logFailure({ mission, stageId, action, error }) {
    mission.failureLog.push({
      stageId,
      action,
      errorMessage: error instanceof Error ? error.message : String(error),
      timestamp: isoNow(this.timeProvider)
    });

    this.logger.log({
      missionId: mission.missionId,
      stageId,
      action,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  retryStage({ mission, stageId }) {
    this.rollbackMission({ mission, stageId, reason: 'Retry requested' });
    mission.state = WebsiteExecutiveReviewMissionStates.RUNNING;
  }

  resumeMission({ mission }) {
    if (mission.state === WebsiteExecutiveReviewMissionStates.FAILED) {
      mission.state = WebsiteExecutiveReviewMissionStates.RUNNING;
    }

    return this.runMission({}, {
      mission,
      resumeFromStageId: mission.currentStageId
    });
  }

  rollbackMission({ mission, stageId, reason = 'Rollback requested' }) {
    const targetIndex = websiteExecutiveReviewStageIndex(stageId);

    if (targetIndex < 0) {
      throw new Error(`Unknown stage for rollback: ${stageId}`);
    }

    const retainStageIds = WebsiteExecutiveReviewWorkflowStages.slice(0, targetIndex).map((item) => item.id);
    mission.completedStageIds = mission.completedStageIds.filter((item) => retainStageIds.includes(item));
    mission.currentStageId = stageId;

    if (!retainStageIds.includes('WEBSITE_INTELLIGENCE_RESEARCH')) mission.artifacts.intelligenceReport = null;
    if (!retainStageIds.includes('BRAND_PACKAGE_GENERATION')) mission.artifacts.brandPackage = null;
    if (!retainStageIds.includes('TEMPLATE_RECOMMENDATION')) mission.artifacts.templateSelection = null;
    if (!retainStageIds.includes('CUSTOMIZATION_PLAN_GENERATION')) mission.artifacts.customizationPlan = null;
    if (!retainStageIds.includes('EXECUTIVE_REVIEW_PACKAGE')) mission.artifacts.executiveReviewPackage = null;

    mission.warnings = [];
    mission.blockingIssues = [];
    mission.failureLog.push({
      stageId,
      action: 'rollback',
      reason,
      timestamp: isoNow(this.timeProvider)
    });
  }

  buildProgressReport({ mission }) {
    const currentStage = resolveWebsiteExecutiveReviewStageById(mission.currentStageId);
    const completionPercentage = calculateWebsiteExecutiveReviewCompletionPercentage(mission.completedStageIds.length);
    const remainingStages = Math.max(WebsiteExecutiveReviewWorkflowStages.length - mission.completedStageIds.length, 0);
    const etaMinutes = remainingStages * Number(mission.estimatedStageMinutes ?? 10);

    return {
      missionId: mission.missionId,
      currentStage: currentStage?.label ?? mission.currentStageId,
      completionPercentage,
      warnings: mission.warnings,
      blockingIssues: mission.blockingIssues,
      estimatedCompletion: `${etaMinutes}m`,
      state: mission.state
    };
  }

  buildResult({ mission }) {
    return {
      mission,
      progress: this.buildProgressReport({ mission }),
      governance: mission.governance,
      workflow: WebsiteExecutiveReviewWorkflowStages,
      executiveReviewPackage: mission.artifacts.executiveReviewPackage
    };
  }
}
