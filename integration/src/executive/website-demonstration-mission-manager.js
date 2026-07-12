import {
  WebsiteDemonstrationMissionStates,
  WebsiteDemonstrationWorkflowStages,
  calculateWebsiteDemonstrationCompletionPercentage,
  createWebsiteDemonstrationMissionRequest,
  createWebsiteDemonstrationMissionStateMachine,
  resolveWebsiteDemonstrationStageById,
  validateWebsiteDemonstrationMissionRequest,
  websiteDemonstrationStageIndex
} from './website-demonstration-mission-contracts.js';
import { AtlasWebsiteOrchestrator } from './website-orchestrator.js';
import { WebsiteBuilderMissionManager } from './website-builder-mission-manager.js';
import { WebsiteDemonstrationReviewPackageGenerator } from './website-demonstration-review-package-generator.js';

function isoNow(timeProvider) {
  return timeProvider?.() ?? new Date().toISOString();
}

function parseProspectFromWebsiteUrl({ websiteUrl, prospect = {} }) {
  const parsed = new URL(websiteUrl);
  const host = String(parsed.hostname ?? '').toLowerCase();
  const derivedName = host
    .replace(/^www\./, '')
    .split('.')
    .slice(0, 2)
    .join(' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    ...prospect,
    approved: prospect.approved ?? true,
    approvedBy: prospect.approvedBy ?? 'ATLAS_WEBSITE_DEMONSTRATION_MISSION_V1',
    approvedAt: prospect.approvedAt ?? new Date().toISOString(),
    companyName: prospect.companyName ?? derivedName,
    websiteUrl: parsed.toString(),
    websiteHost: host,
    segment: prospect.segment ?? 'Public Website Prospect'
  };
}

function summarizeCustomizationPackage({ mission, artifacts }) {
  return {
    source: 'ATLAS_WEBSITE_DEMONSTRATION_MISSION_V1',
    websiteUrl: mission.websiteUrl,
    companyName: artifacts.prospectProfile?.companyName ?? null,
    selectedTemplate: artifacts.templateSelection?.templateId ?? null,
    brandNarrative: artifacts.brandPackage?.brandNarrative ?? null,
    callToAction: 'Request quote and schedule consultation',
    contentSections: [
      'Hero',
      'Services',
      'Trust Signals',
      'Testimonials',
      'Contact'
    ],
    policy: {
      sandboxOnly: true,
      publishAllowed: false,
      deployAllowed: false,
      destructiveOperationsAllowed: false
    }
  };
}

function calculateConfidence({ intelligenceReport, brandPackage, templateSelection, qaReport, builderMissionResult }) {
  const values = [
    Number(intelligenceReport?.confidence ?? 0),
    Number(brandPackage?.confidence ?? 0),
    Number(templateSelection?.confidence ?? 0),
    qaReport?.passed ? 0.9 : 0.3,
    builderMissionResult?.mission?.state === 'COMPLETED' ? 0.9 : 0.2
  ].filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function recommendCeoApproval({ confidenceScore, qaReport, builderMissionResult }) {
  if (qaReport?.passed !== true) {
    return 'HOLD: QA issues require correction before CEO approval.';
  }

  if (builderMissionResult?.governance?.publishAttempted || builderMissionResult?.governance?.deployAttempted) {
    return 'HOLD: Governance violation detected. Publishing/deploy attempt is not allowed.';
  }

  if (confidenceScore >= 0.8) {
    return 'RECOMMEND_APPROVAL_FOR_NEXT_GATED_PHASE';
  }

  if (confidenceScore >= 0.6) {
    return 'CONDITIONAL_APPROVAL_AFTER_EXECUTIVE_REVIEW';
  }

  return 'HOLD_FOR_STRATEGY_REVISION';
}

export class WebsiteDemonstrationMissionManager {
  constructor({
    orchestrator,
    websiteBuilderMissionManager,
    reviewPackageGenerator,
    stateMachine,
    logger,
    timeProvider
  } = {}) {
    this.orchestrator = orchestrator ?? new AtlasWebsiteOrchestrator();
    this.stateMachine = stateMachine ?? createWebsiteDemonstrationMissionStateMachine();
    this.logger = logger ?? { log: () => {} };
    this.timeProvider = timeProvider;

    this.websiteIntelligenceEngine = this.orchestrator.websiteIntelligenceEngine;
    this.websiteProductionSystem = this.orchestrator.websiteProductionSystem;
    this.qaEngine = this.orchestrator.qaEngine;

    this.websiteBuilderMissionManager = websiteBuilderMissionManager ?? new WebsiteBuilderMissionManager({
      orchestrator: this.orchestrator,
      adapterRegistry: this.orchestrator.adapterRegistry
    });
    this.reviewPackageGenerator = reviewPackageGenerator ?? new WebsiteDemonstrationReviewPackageGenerator();
  }

  createMission(requestPayload = {}) {
    const request = createWebsiteDemonstrationMissionRequest(requestPayload);
    const validation = validateWebsiteDemonstrationMissionRequest(request);

    if (!validation.isValid) {
      throw new Error(`Website demonstration mission request invalid: ${validation.issues.join(' | ')}`);
    }

    return {
      missionId: request.missionId,
      websiteUrl: request.websiteUrl,
      prospect: request.prospect,
      existingBranding: request.existingBranding,
      adapterType: request.adapterType,
      providerHint: request.providerHint,
      estimatedStageMinutes: request.estimatedStageMinutes,
      state: WebsiteDemonstrationMissionStates.WAITING,
      currentStageId: WebsiteDemonstrationWorkflowStages[0].id,
      completedStageIds: [],
      stageHistory: [],
      failureLog: [],
      warnings: [],
      blockingIssues: [],
      artifacts: {
        prospectProfile: null,
        intelligenceReport: null,
        executiveIntelligenceReport: null,
        brandPackage: null,
        templateSelection: null,
        customizationPackage: null,
        builderMissionResult: null,
        framerBuildInstructions: null,
        qaReport: null,
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

    this.transitionState({ mission, nextState: WebsiteDemonstrationMissionStates.RUNNING });

    const startIndex = options.resumeFromStageId
      ? Math.max(0, websiteDemonstrationStageIndex(options.resumeFromStageId))
      : Math.max(0, websiteDemonstrationStageIndex(mission.currentStageId));

    for (let index = startIndex; index < WebsiteDemonstrationWorkflowStages.length; index += 1) {
      const stage = WebsiteDemonstrationWorkflowStages[index];

      try {
        await this.executeStage({ mission, stage });
      } catch (error) {
        this.logFailure({ mission, stageId: stage.id, action: 'stage-execution', error });
        this.transitionState({ mission, nextState: WebsiteDemonstrationMissionStates.FAILED });
        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }
    }

    if (mission.state !== WebsiteDemonstrationMissionStates.COMPLETED) {
      this.transitionState({ mission, nextState: WebsiteDemonstrationMissionStates.REVIEW_READY });
      this.transitionState({ mission, nextState: WebsiteDemonstrationMissionStates.COMPLETED });
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
      case 'RECEIVE_WEBSITE_URL': {
        mission.artifacts.prospectProfile = parseProspectFromWebsiteUrl({
          websiteUrl: mission.websiteUrl,
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
      case 'EXECUTIVE_INTELLIGENCE_REPORT': {
        mission.artifacts.executiveIntelligenceReport = {
          summary: mission.artifacts.intelligenceReport?.summary ?? null,
          findings: mission.artifacts.intelligenceReport?.findings ?? [],
          projectContext: mission.artifacts.intelligenceReport?.projectInfo ?? null,
          publishContext: mission.artifacts.intelligenceReport?.publishInfo ?? null,
          limitations: mission.artifacts.intelligenceReport?.projectDetails?.limitations ?? []
        };
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
      case 'TEMPLATE_SELECTION': {
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
      case 'WEBSITE_CUSTOMIZATION_PACKAGE': {
        mission.artifacts.customizationPackage = summarizeCustomizationPackage({
          mission,
          artifacts: mission.artifacts
        });
        break;
      }
      case 'EXECUTE_WEBSITE_BUILDER_MISSION': {
        mission.artifacts.builderMissionResult = await this.websiteBuilderMissionManager.runMission({
          missionId: `${mission.missionId}-builder`,
          prospectUrl: mission.websiteUrl,
          prospect: mission.artifacts.prospectProfile,
          existingBranding: mission.existingBranding,
          websiteRequirements: mission.artifacts.customizationPackage,
          adapterType: mission.adapterType,
          providerHint: mission.providerHint,
          stopAfterSandboxUpdate: true
        });

        mission.governance.publishAttempted = Boolean(mission.artifacts.builderMissionResult?.governance?.publishAttempted);
        mission.governance.deployAttempted = Boolean(mission.artifacts.builderMissionResult?.governance?.deployAttempted);
        mission.governance.destructiveOperationAttempted = Boolean(
          mission.artifacts.builderMissionResult?.governance?.destructiveOperationAttempted
        );
        break;
      }
      case 'FRAMER_SANDBOX_BUILD_INSTRUCTIONS': {
        mission.artifacts.framerBuildInstructions = mission.artifacts.builderMissionResult?.mission?.artifacts?.framerBuildInstructions ?? null;
        break;
      }
      case 'STOP_BEFORE_PUBLISH': {
        this.enforceGovernance({ mission });
        break;
      }
      case 'EXECUTIVE_REVIEW_PACKAGE': {
        mission.artifacts.qaReport = await this.qaEngine.review({
          mission,
          artifacts: {
            generatedWebsite: mission.artifacts.builderMissionResult?.mission?.artifacts?.productionCustomization ?? null
          }
        });

        const confidenceScore = calculateConfidence({
          intelligenceReport: mission.artifacts.intelligenceReport,
          brandPackage: mission.artifacts.brandPackage,
          templateSelection: mission.artifacts.templateSelection,
          qaReport: mission.artifacts.qaReport,
          builderMissionResult: mission.artifacts.builderMissionResult
        });

        const ceoApprovalRecommendation = recommendCeoApproval({
          confidenceScore,
          qaReport: mission.artifacts.qaReport,
          builderMissionResult: mission.artifacts.builderMissionResult
        });

        mission.artifacts.executiveReviewPackage = this.reviewPackageGenerator.generate({
          mission,
          intelligenceReport: mission.artifacts.intelligenceReport,
          brandPackage: mission.artifacts.brandPackage,
          templateSelection: mission.artifacts.templateSelection,
          customizationSummary: mission.artifacts.customizationPackage,
          builderMissionResult: mission.artifacts.builderMissionResult,
          framerBuildInstructions: mission.artifacts.framerBuildInstructions,
          qaReport: mission.artifacts.qaReport,
          confidenceScore,
          ceoApprovalRecommendation
        });

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
      throw new Error('Publishing is forbidden in Website Demonstration Mission v1.');
    }

    if (mission.governance.deployAttempted) {
      throw new Error('Deploy is forbidden in Website Demonstration Mission v1.');
    }

    if (mission.governance.destructiveOperationAttempted) {
      throw new Error('Destructive operations are forbidden in Website Demonstration Mission v1.');
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
    mission.state = WebsiteDemonstrationMissionStates.RUNNING;
  }

  resumeMission({ mission }) {
    if (mission.state === WebsiteDemonstrationMissionStates.FAILED) {
      mission.state = WebsiteDemonstrationMissionStates.RUNNING;
    }

    return this.runMission({}, {
      mission,
      resumeFromStageId: mission.currentStageId
    });
  }

  rollbackMission({ mission, stageId, reason = 'Rollback requested' }) {
    const targetIndex = websiteDemonstrationStageIndex(stageId);

    if (targetIndex < 0) {
      throw new Error(`Unknown stage for rollback: ${stageId}`);
    }

    const retainStageIds = WebsiteDemonstrationWorkflowStages.slice(0, targetIndex).map((item) => item.id);
    mission.completedStageIds = mission.completedStageIds.filter((item) => retainStageIds.includes(item));
    mission.currentStageId = stageId;

    if (!retainStageIds.includes('WEBSITE_INTELLIGENCE_RESEARCH')) mission.artifacts.intelligenceReport = null;
    if (!retainStageIds.includes('EXECUTIVE_INTELLIGENCE_REPORT')) mission.artifacts.executiveIntelligenceReport = null;
    if (!retainStageIds.includes('BRAND_PACKAGE_GENERATION')) mission.artifacts.brandPackage = null;
    if (!retainStageIds.includes('TEMPLATE_SELECTION')) mission.artifacts.templateSelection = null;
    if (!retainStageIds.includes('WEBSITE_CUSTOMIZATION_PACKAGE')) mission.artifacts.customizationPackage = null;
    if (!retainStageIds.includes('EXECUTE_WEBSITE_BUILDER_MISSION')) mission.artifacts.builderMissionResult = null;
    if (!retainStageIds.includes('FRAMER_SANDBOX_BUILD_INSTRUCTIONS')) mission.artifacts.framerBuildInstructions = null;
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
    const currentStage = resolveWebsiteDemonstrationStageById(mission.currentStageId);
    const completionPercentage = calculateWebsiteDemonstrationCompletionPercentage(mission.completedStageIds.length);
    const remainingStages = Math.max(WebsiteDemonstrationWorkflowStages.length - mission.completedStageIds.length, 0);
    const etaMinutes = remainingStages * Number(mission.estimatedStageMinutes ?? 15);

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
      workflow: WebsiteDemonstrationWorkflowStages,
      executiveReviewPackage: mission.artifacts.executiveReviewPackage
    };
  }
}
