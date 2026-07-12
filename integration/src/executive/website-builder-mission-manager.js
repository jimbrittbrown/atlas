import {
  WebsiteBuilderMissionStates,
  WebsiteBuilderWorkflowStages,
  calculateWebsiteBuilderCompletionPercentage,
  createWebsiteBuilderMissionRequest,
  createWebsiteBuilderMissionStateMachine,
  resolveWebsiteBuilderStageById,
  validateWebsiteBuilderMissionRequest,
  websiteBuilderStageIndex
} from './website-builder-mission-contracts.js';
import { AtlasWebsiteOrchestrator } from './website-orchestrator.js';
import { WorkforceDirector } from './workforce-director.js';

function isoNow(timeProvider) {
  return timeProvider?.() ?? new Date().toISOString();
}

function parseProspectFromUrl({ prospectUrl, prospect = {} }) {
  const parsed = new URL(prospectUrl);
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
    approvedBy: prospect.approvedBy ?? 'ATLAS_WEBSITE_BUILDER_MISSION_V1',
    approvedAt: prospect.approvedAt ?? new Date().toISOString(),
    companyName: prospect.companyName ?? derivedName,
    websiteUrl: parsed.toString(),
    websiteHost: host
  };
}

function summarizeCustomizationPackage({ mission, artifacts }) {
  return {
    source: 'ATLAS_WEBSITE_BUILDER_MISSION_V1',
    prospectUrl: mission.prospectUrl,
    companyName: artifacts.prospectProfile?.companyName ?? null,
    brandPackage: artifacts.brandPackage ?? {},
    templateSelection: artifacts.templateSelection ?? {},
    websiteRequirements: mission.websiteRequirements ?? {},
    policy: {
      sandboxOnly: true,
      publishAllowed: false,
      deployAllowed: false,
      productionOverwriteAllowed: false
    }
  };
}

function buildFramerInstructions({ mission, artifacts }) {
  return {
    providerType: mission.adapterType,
    missionId: mission.missionId,
    operation: 'SANDBOX_PROJECT_UPSERT',
    sandboxOnly: true,
    publishAllowed: false,
    deployAllowed: false,
    destructiveOperationsAllowed: false,
    customizationPackage: artifacts.customizationPackage,
    productionCustomization: artifacts.productionCustomization,
    expectedOutputs: [
      'sandboxProjectId',
      'sandboxProjectName',
      'appliedOperations',
      'warnings',
      'limitations'
    ]
  };
}

export class WebsiteBuilderMissionManager {
  constructor({
    orchestrator,
    adapterRegistry,
    workforceDirector,
    stateMachine,
    logger,
    timeProvider
  } = {}) {
    this.orchestrator = orchestrator ?? new AtlasWebsiteOrchestrator();
    this.adapterRegistry = adapterRegistry ?? this.orchestrator.adapterRegistry;
    this.stateMachine = stateMachine ?? createWebsiteBuilderMissionStateMachine();
    this.logger = logger ?? { log: () => {} };
    this.timeProvider = timeProvider;
    this.workforceDirector = workforceDirector ?? new WorkforceDirector({ logger: this.logger });

    this.websiteIntelligenceEngine = this.orchestrator.websiteIntelligenceEngine;
    this.websiteProductionSystem = this.orchestrator.websiteProductionSystem;
  }

  createMission(requestPayload = {}) {
    const request = createWebsiteBuilderMissionRequest(requestPayload);
    const validation = validateWebsiteBuilderMissionRequest(request);

    if (!validation.isValid) {
      throw new Error(`Website builder mission request invalid: ${validation.issues.join(' | ')}`);
    }

    return {
      missionId: request.missionId,
      prospectUrl: request.prospectUrl,
      prospect: request.prospect,
      existingBranding: request.existingBranding,
      brandingChangeRequest: request.brandingChangeRequest,
      websiteRequirements: request.websiteRequirements,
      adapterType: request.adapterType,
      providerHint: request.providerHint,
      stopAfterSandboxUpdate: request.stopAfterSandboxUpdate,
      estimatedStageMinutes: request.estimatedStageMinutes,
      state: WebsiteBuilderMissionStates.WAITING,
      currentStageId: WebsiteBuilderWorkflowStages[0].id,
      completedStageIds: [],
      stageHistory: [],
      failureLog: [],
      warnings: [],
      blockingIssues: [],
      artifacts: {
        prospectProfile: null,
        companyResearch: null,
        brandPackage: null,
        templateSelection: null,
        customizationPackage: null,
        productionCustomization: null,
        framerBuildInstructions: null,
        sandboxBuildResult: null
      },
      workforce: {
        missionType: 'WEBSITE_BUILD',
        assignmentPlan: null,
        stageAssignments: {},
        retryByStage: {},
        blockedByStage: {},
        activity: []
      },
      governance: {
        publishAttempted: false,
        deployAttempted: false,
        destructiveOperationAttempted: false,
        ceoApprovalRequiredBeforePublish: true,
        stopBeforePublish: true
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

    this.transitionState({ mission, nextState: WebsiteBuilderMissionStates.RUNNING });

    if (!mission.workforce.assignmentPlan) {
      const assignmentPlan = this.workforceDirector.planMissionAssignments({
        missionId: mission.missionId,
        missionType: mission.workforce.missionType
      });

      mission.workforce.assignmentPlan = assignmentPlan;

      if (!assignmentPlan.ready) {
        mission.blockingIssues.push('Workforce assignment plan is blocked by unavailable specialists.');
        assignmentPlan.unavailable.forEach((item) => {
          mission.workforce.blockedByStage[item.stageId] = {
            unavailableSpecialty: item.specialty,
            unavailableWorkers: item.unavailableWorkers
          };
        });
        this.transitionState({ mission, nextState: WebsiteBuilderMissionStates.REVISION_REQUIRED });
        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }
    }

    const startIndex = options.resumeFromStageId
      ? Math.max(0, websiteBuilderStageIndex(options.resumeFromStageId))
      : Math.max(0, websiteBuilderStageIndex(mission.currentStageId));

    for (let index = startIndex; index < WebsiteBuilderWorkflowStages.length; index += 1) {
      const stage = WebsiteBuilderWorkflowStages[index];

      try {
        await this.executeStage({ mission, stage });
      } catch (error) {
        const recovery = this.reassignAndRetryStage({ mission, stage, error });
        if (recovery.recovered) {
          try {
            await this.executeStage({ mission, stage });
            continue;
          } catch (retryError) {
            this.logFailure({
              mission,
              stageId: stage.id,
              action: 'stage-retry-execution',
              error: retryError
            });
          }
        }

        this.logFailure({
          mission,
          stageId: stage.id,
          action: 'stage-execution',
          error
        });

        if (mission.state !== WebsiteBuilderMissionStates.REVISION_REQUIRED) {
          this.transitionState({ mission, nextState: WebsiteBuilderMissionStates.FAILED });
        }

        this.workforceDirector.completeMission({ missionId: mission.missionId });
        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }

      if (
        mission.state === WebsiteBuilderMissionStates.REVISION_REQUIRED
        || mission.state === WebsiteBuilderMissionStates.FAILED
      ) {
        this.workforceDirector.completeMission({ missionId: mission.missionId });
        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }

      if (mission.state === WebsiteBuilderMissionStates.SANDBOX_UPDATED && mission.stopAfterSandboxUpdate) {
        this.transitionState({ mission, nextState: WebsiteBuilderMissionStates.COMPLETED });
        this.workforceDirector.completeMission({ missionId: mission.missionId });
        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }
    }

    if (!this.stateMachine.terminalStates.has(mission.state)) {
      this.transitionState({ mission, nextState: WebsiteBuilderMissionStates.COMPLETED });
    }

    this.workforceDirector.completeMission({ missionId: mission.missionId });

    mission.updatedAt = isoNow(this.timeProvider);
    return this.buildResult({ mission });
  }

  async executeStage({ mission, stage }) {
    const stageRequirement = mission.workforce.assignmentPlan?.stageAssignments
      ?.find((item) => item.stageId === stage.id);
    const assignedWorkers = this.workforceDirector.getStageAssignments({
      missionId: mission.missionId,
      stageId: stage.id
    });

    mission.workforce.stageAssignments[stage.id] = assignedWorkers;
    const activatedWorkers = this.workforceDirector.markStageStarted({ missionId: mission.missionId, stageId: stage.id });

    if (stageRequirement && activatedWorkers.length < stageRequirement.requiredSpecialties.length) {
      throw new Error(`Unavailable workers for stage ${stage.id}. Required: ${stageRequirement.requiredSpecialties.join(', ')}`);
    }

    mission.currentStageId = stage.id;
    mission.stageHistory.push({
      stageId: stage.id,
      startedAt: isoNow(this.timeProvider),
      status: 'RUNNING'
    });

    const adapter = this.adapterRegistry.getAdapter(mission.adapterType);

    switch (stage.id) {
      case 'RECEIVE_PROSPECT_URL': {
        mission.artifacts.prospectProfile = parseProspectFromUrl({
          prospectUrl: mission.prospectUrl,
          prospect: mission.prospect
        });
        break;
      }
      case 'COMPANY_RESEARCH': {
        mission.artifacts.companyResearch = await this.websiteIntelligenceEngine.researchCompany({
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
            companyResearch: mission.artifacts.companyResearch
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
      case 'CUSTOMIZATION_PACKAGE_GENERATION': {
        mission.artifacts.customizationPackage = summarizeCustomizationPackage({
          mission,
          artifacts: mission.artifacts
        });
        break;
      }
      case 'WEBSITE_PRODUCTION_CUSTOMIZATION': {
        mission.artifacts.productionCustomization = await this.websiteProductionSystem.generateWebsite({
          adapter,
          mission,
          artifacts: {
            ...mission.artifacts,
            templateSelection: mission.artifacts.templateSelection,
            brandPackage: mission.artifacts.brandPackage,
            customizationPackage: mission.artifacts.customizationPackage
          },
          websiteSpec: mission.artifacts.customizationPackage
        });
        break;
      }
      case 'FRAMER_BUILD_INSTRUCTION_GENERATION': {
        mission.artifacts.framerBuildInstructions = buildFramerInstructions({
          mission,
          artifacts: mission.artifacts
        });
        break;
      }
      case 'SANDBOX_PROJECT_UPSERT': {
        const fallback = {
          status: 'PROVIDER_DOES_NOT_SUPPORT_SANDBOX_UPSERT',
          sandboxOnly: true,
          publishExecuted: false,
          deployExecuted: false,
          writeExecuted: false,
          limitations: ['Provider adapter does not expose applySandboxBuildInstructions().']
        };

        mission.artifacts.sandboxBuildResult = typeof adapter.applySandboxBuildInstructions === 'function'
          ? await adapter.applySandboxBuildInstructions({
            buildInstructions: mission.artifacts.framerBuildInstructions,
            customizationPackage: mission.artifacts.customizationPackage,
            productionCustomization: mission.artifacts.productionCustomization
          })
          : fallback;

        this.enforceGovernance({ mission });
        this.transitionState({ mission, nextState: WebsiteBuilderMissionStates.SANDBOX_UPDATED });
        break;
      }
      default:
        throw new Error(`Unsupported stage ${stage.id}`);
    }

    mission.completedStageIds.push(stage.id);
    this.updateStageRecord({ mission, stageId: stage.id, status: 'COMPLETED' });
    this.workforceDirector.markStageCompleted({ missionId: mission.missionId, stageId: stage.id });
    mission.workforce.activity.push({
      type: 'STAGE_COMPLETED',
      stageId: stage.id,
      timestamp: isoNow(this.timeProvider)
    });
    mission.updatedAt = isoNow(this.timeProvider);
  }

  reassignAndRetryStage({ mission, stage, error }) {
    const currentRetryCount = Number(mission.workforce.retryByStage[stage.id] ?? 0);
    if (currentRetryCount >= 1) {
      return {
        recovered: false,
        reason: 'Retry limit reached for stage.'
      };
    }

    const reassignment = this.workforceDirector.handleStageFailure({
      missionId: mission.missionId,
      stageId: stage.id,
      missionType: mission.workforce.missionType,
      errorMessage: error instanceof Error ? error.message : String(error)
    });

    mission.workforce.retryByStage[stage.id] = currentRetryCount + 1;
    mission.workforce.activity.push({
      type: 'STAGE_RETRY_REQUESTED',
      stageId: stage.id,
      recovered: reassignment.recovered,
      timestamp: isoNow(this.timeProvider),
      reason: reassignment.reason ?? null
    });

    if (!reassignment.recovered) {
      mission.blockingIssues.push(`Stage ${stage.id} retry blocked: ${reassignment.reason}`);
      mission.workforce.blockedByStage[stage.id] = {
        reason: reassignment.reason,
        unavailableSpecialties: reassignment.unavailableSpecialties ?? []
      };
    }

    return reassignment;
  }

  enforceGovernance({ mission }) {
    const sandboxBuildResult = mission.artifacts.sandboxBuildResult ?? {};

    mission.governance.publishAttempted = Boolean(sandboxBuildResult.publishExecuted);
    mission.governance.deployAttempted = Boolean(sandboxBuildResult.deployExecuted);
    mission.governance.destructiveOperationAttempted = Boolean(sandboxBuildResult.destructiveOperationExecuted);

    if (sandboxBuildResult.publishExecuted === true) {
      throw new Error('Publishing is not allowed in Website Builder Mission v1.');
    }

    if (sandboxBuildResult.deployExecuted === true) {
      throw new Error('Production deploy is not allowed in Website Builder Mission v1.');
    }

    if (sandboxBuildResult.productionOverwriteExecuted === true) {
      throw new Error('Production overwrite is not allowed in Website Builder Mission v1.');
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
    mission.state = WebsiteBuilderMissionStates.RUNNING;
  }

  resumeMission({ mission }) {
    if (
      mission.state === WebsiteBuilderMissionStates.FAILED
      || mission.state === WebsiteBuilderMissionStates.REVISION_REQUIRED
    ) {
      mission.state = WebsiteBuilderMissionStates.RUNNING;
    }

    return this.runMission({}, {
      mission,
      resumeFromStageId: mission.currentStageId
    });
  }

  rollbackMission({ mission, stageId, reason = 'Rollback requested' }) {
    const targetIndex = websiteBuilderStageIndex(stageId);

    if (targetIndex < 0) {
      throw new Error(`Unknown stage for rollback: ${stageId}`);
    }

    const retainStageIds = WebsiteBuilderWorkflowStages.slice(0, targetIndex).map((item) => item.id);
    mission.completedStageIds = mission.completedStageIds.filter((item) => retainStageIds.includes(item));
    mission.currentStageId = stageId;

    if (!retainStageIds.includes('COMPANY_RESEARCH')) mission.artifacts.companyResearch = null;
    if (!retainStageIds.includes('BRAND_PACKAGE_GENERATION')) mission.artifacts.brandPackage = null;
    if (!retainStageIds.includes('TEMPLATE_SELECTION')) mission.artifacts.templateSelection = null;
    if (!retainStageIds.includes('CUSTOMIZATION_PACKAGE_GENERATION')) mission.artifacts.customizationPackage = null;
    if (!retainStageIds.includes('WEBSITE_PRODUCTION_CUSTOMIZATION')) mission.artifacts.productionCustomization = null;
    if (!retainStageIds.includes('FRAMER_BUILD_INSTRUCTION_GENERATION')) mission.artifacts.framerBuildInstructions = null;
    if (!retainStageIds.includes('SANDBOX_PROJECT_UPSERT')) mission.artifacts.sandboxBuildResult = null;

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
    const currentStage = resolveWebsiteBuilderStageById(mission.currentStageId);
    const completionPercentage = calculateWebsiteBuilderCompletionPercentage(mission.completedStageIds.length);
    const remainingStages = Math.max(WebsiteBuilderWorkflowStages.length - mission.completedStageIds.length, 0);
    const estimatedMinutes = remainingStages * Number(mission.estimatedStageMinutes ?? 15);

    return {
      missionId: mission.missionId,
      currentStage: currentStage?.label ?? mission.currentStageId,
      completionPercentage,
      warnings: mission.warnings,
      blockingIssues: mission.blockingIssues,
      estimatedCompletion: `${estimatedMinutes}m`,
      state: mission.state
    };
  }

  buildResult({ mission }) {
    return {
      mission,
      progress: this.buildProgressReport({ mission }),
      governance: mission.governance,
      workforce: {
        assignments: mission.workforce,
        dashboard: this.workforceDirector.buildDashboard()
      },
      workflow: WebsiteBuilderWorkflowStages
    };
  }
}
