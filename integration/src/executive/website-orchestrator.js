import {
  WebsiteMissionStates,
  WebsiteWorkflowStages,
  calculateCompletionPercentage,
  createWebsiteMissionRequest,
  createWebsiteMissionStateMachine,
  resolveStageById,
  stageIndex,
  validateWebsiteMissionRequest
} from './website-orchestrator-contracts.js';
import {
  FramerWebsiteAdapter,
  SpecialistWebsiteProviderAdapter,
  WebflowWebsiteAdapter,
  WebsiteProviderAdapterRegistry,
  WordPressWebsiteAdapter
} from './website-provider-adapters.js';

function isoNow(timeProvider) {
  return timeProvider?.() ?? new Date().toISOString();
}

export class AtlasWebsiteOrchestrator {
  constructor({
    adapterRegistry,
    stateMachine,
    logger,
    timeProvider,
    websiteIntelligenceEngine,
    websiteProductionSystem,
    qaEngine,
    deliveryPackageEngine
  } = {}) {
    this.timeProvider = timeProvider;
    this.logger = logger ?? { log: () => {} };
    this.stateMachine = stateMachine ?? createWebsiteMissionStateMachine();
    this.adapterRegistry = adapterRegistry ?? this.createDefaultAdapterRegistry();

    this.websiteIntelligenceEngine = websiteIntelligenceEngine ?? {
      researchCompany: async ({ adapter, mission }) => adapter.researchCompany({ prospect: mission.prospect }),
      generateBrandPackage: async ({ adapter, mission, artifacts }) =>
        adapter.generateBrandPackage({
          existingBranding: mission.existingBranding,
          companyResearch: artifacts.companyResearch
        })
    };

    this.websiteProductionSystem = websiteProductionSystem ?? {
      selectTemplate: async ({ adapter, artifacts }) => adapter.selectTemplate({ brandPackage: artifacts.brandPackage }),
      generateWebsite: async ({ adapter, artifacts }) =>
        adapter.generateWebsite({
          templateSelection: artifacts.templateSelection,
          brandPackage: artifacts.brandPackage
        }),
      publishWebsite: async ({ adapter, artifacts }) =>
        adapter.publishWebsite({ generatedWebsite: artifacts.generatedWebsite })
    };

    this.qaEngine = qaEngine ?? {
      review: async ({ artifacts }) => {
        const warnings = Array.isArray(artifacts?.generatedWebsite?.warnings)
          ? artifacts.generatedWebsite.warnings
          : [];

        return {
          passed: warnings.length === 0,
          warnings,
          blockingIssues: []
        };
      }
    };

    this.deliveryPackageEngine = deliveryPackageEngine ?? {
      create: async ({ adapter, mission, artifacts }) => adapter.buildDeliveryPackage({ mission, artifacts })
    };
  }

  createDefaultAdapterRegistry() {
    return new WebsiteProviderAdapterRegistry()
      .register({ adapterType: 'FRAMER', adapter: new FramerWebsiteAdapter() })
      .register({ adapterType: 'WEBFLOW', adapter: new WebflowWebsiteAdapter() })
      .register({ adapterType: 'WORDPRESS', adapter: new WordPressWebsiteAdapter() })
      .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });
  }

  createMission(requestPayload = {}) {
    const request = createWebsiteMissionRequest(requestPayload);
    const validation = validateWebsiteMissionRequest(request);

    if (!validation.isValid) {
      throw new Error(`Website mission request invalid: ${validation.issues.join(' | ')}`);
    }

    return {
      missionId: request.missionId,
      state: WebsiteMissionStates.WAITING,
      currentStageId: WebsiteWorkflowStages[0].id,
      completedStageIds: [],
      stageHistory: [],
      failureLog: [],
      warnings: [],
      blockingIssues: [],
      confidenceHistory: [],
      artifacts: {},
      prospect: request.prospect,
      existingBranding: request.existingBranding,
      brandingChangeRequest: request.brandingChangeRequest,
      ceoDecision: request.ceoDecision,
      adapterType: request.adapterType,
      providerHint: request.providerHint,
      estimatedStageMinutes: request.estimatedStageMinutes,
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

    if (mission.state === WebsiteMissionStates.DELIVERED) {
      return this.buildResult({ mission });
    }

    this.transitionState({ mission, nextState: WebsiteMissionStates.RUNNING });

    const startIndex = options.resumeFromStageId
      ? Math.max(0, stageIndex(options.resumeFromStageId))
      : Math.max(0, stageIndex(mission.currentStageId));

    for (let index = startIndex; index < WebsiteWorkflowStages.length; index += 1) {
      const stage = WebsiteWorkflowStages[index];

      try {
        await this.executeStage({ mission, stage });
      } catch (error) {
        this.logFailure({
          mission,
          stageId: stage.id,
          error,
          action: 'stage-execution'
        });

        if (mission.state !== WebsiteMissionStates.REVISION_REQUIRED) {
          this.transitionState({ mission, nextState: WebsiteMissionStates.FAILED });
        }

        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }

      if (mission.state === WebsiteMissionStates.REVISION_REQUIRED || mission.state === WebsiteMissionStates.FAILED) {
        mission.updatedAt = isoNow(this.timeProvider);
        return this.buildResult({ mission });
      }
    }

    if (mission.state !== WebsiteMissionStates.DELIVERED) {
      this.transitionState({ mission, nextState: WebsiteMissionStates.DELIVERED });
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

    switch (stage.id) {
      case 'PROSPECT_APPROVED': {
        if (mission.prospect?.approved !== true) {
          throw new Error('Prospect must be approved before execution can start.');
        }

        mission.artifacts.prospectApproval = {
          approvedBy: mission.prospect.approvedBy ?? 'UNKNOWN',
          approvedAt: mission.prospect.approvedAt ?? isoNow(this.timeProvider)
        };
        mission.confidenceHistory.push(1);
        break;
      }
      case 'COMPANY_RESEARCH': {
        const adapter = this.adapterRegistry.getAdapter(mission.adapterType);
        const companyResearch = await this.websiteIntelligenceEngine.researchCompany({
          mission,
          adapter
        });

        mission.artifacts.companyResearch = companyResearch;

        if (typeof adapter.readAllProjectDetails === 'function') {
          mission.artifacts.projectDetails = await adapter.readAllProjectDetails();
          mission.artifacts.companyResearch = {
            ...companyResearch,
            projectDetails: mission.artifacts.projectDetails
          };
        }

        mission.confidenceHistory.push(Number(mission.artifacts.companyResearch?.confidence ?? 0.7));
        break;
      }
      case 'BRAND_PACKAGE_GENERATION': {
        const adapter = this.adapterRegistry.getAdapter(mission.adapterType);
        mission.artifacts.brandPackage = await this.websiteIntelligenceEngine.generateBrandPackage({
          mission,
          adapter,
          artifacts: mission.artifacts
        });

        this.enforceBrandPreservation({ mission });
        mission.confidenceHistory.push(Number(mission.artifacts.brandPackage?.confidence ?? 0.72));
        break;
      }
      case 'TEMPLATE_SELECTION': {
        const adapter = this.adapterRegistry.getAdapter(mission.adapterType);
        mission.artifacts.templateSelection = await this.websiteProductionSystem.selectTemplate({
          mission,
          adapter,
          artifacts: mission.artifacts
        });
        mission.confidenceHistory.push(Number(mission.artifacts.templateSelection?.confidence ?? 0.74));
        break;
      }
      case 'WEBSITE_GENERATION': {
        const adapter = this.adapterRegistry.getAdapter(mission.adapterType);
        mission.artifacts.generatedWebsite = await this.websiteProductionSystem.generateWebsite({
          mission,
          adapter,
          artifacts: mission.artifacts
        });

        this.enforceBrandPreservation({ mission });
        mission.confidenceHistory.push(Number(mission.artifacts.generatedWebsite?.confidence ?? 0.75));
        break;
      }
      case 'QA': {
        mission.artifacts.qaReport = await this.qaEngine.review({ mission, artifacts: mission.artifacts });

        mission.warnings = Array.isArray(mission.artifacts.qaReport?.warnings)
          ? mission.artifacts.qaReport.warnings
          : [];
        mission.blockingIssues = Array.isArray(mission.artifacts.qaReport?.blockingIssues)
          ? mission.artifacts.qaReport.blockingIssues
          : [];

        if (mission.artifacts.qaReport?.passed !== true || mission.blockingIssues.length > 0) {
          this.transitionState({ mission, nextState: WebsiteMissionStates.REVISION_REQUIRED });
          this.updateStageRecord({ mission, stageId: stage.id, status: 'REVISION_REQUIRED' });
          return;
        }

        mission.confidenceHistory.push(0.8);
        break;
      }
      case 'EXECUTIVE_PREVIEW': {
        mission.artifacts.executivePreview = {
          previewUrl: mission.artifacts.generatedWebsite?.previewUrl ?? null,
          summary: 'Executive preview generated from QA-cleared website draft.'
        };
        mission.confidenceHistory.push(0.82);
        break;
      }
      case 'CEO_APPROVAL_GATE': {
        const decision = String(mission.ceoDecision ?? 'PENDING').toUpperCase();

        if (decision === 'APPROVED') {
          this.transitionState({ mission, nextState: WebsiteMissionStates.READY_FOR_APPROVAL });
          this.transitionState({ mission, nextState: WebsiteMissionStates.APPROVED });
          mission.artifacts.ceoApproval = {
            decision: 'APPROVED',
            approvedAt: isoNow(this.timeProvider)
          };
          mission.confidenceHistory.push(0.9);
        } else {
          this.transitionState({ mission, nextState: WebsiteMissionStates.READY_FOR_APPROVAL });
          this.transitionState({ mission, nextState: WebsiteMissionStates.REVISION_REQUIRED });
          mission.blockingIssues = ['CEO approval is required before publish.'];
          this.updateStageRecord({ mission, stageId: stage.id, status: 'REVISION_REQUIRED' });
          return;
        }
        break;
      }
      case 'PUBLISH': {
        this.enforcePublishGovernance({ mission });
        const adapter = this.adapterRegistry.getAdapter(mission.adapterType);
        mission.artifacts.publishedWebsite = await this.websiteProductionSystem.publishWebsite({
          mission,
          adapter,
          artifacts: mission.artifacts
        });
        this.transitionState({ mission, nextState: WebsiteMissionStates.PUBLISHED });
        mission.confidenceHistory.push(Number(mission.artifacts.publishedWebsite?.confidence ?? 0.85));
        break;
      }
      case 'DELIVERY_PACKAGE': {
        const adapter = this.adapterRegistry.getAdapter(mission.adapterType);
        mission.artifacts.deliveryPackage = await this.deliveryPackageEngine.create({
          mission,
          adapter,
          artifacts: mission.artifacts
        });
        mission.confidenceHistory.push(0.88);
        break;
      }
      default:
        throw new Error(`Unsupported stage ${stage.id}`);
    }

    mission.completedStageIds.push(stage.id);
    this.updateStageRecord({ mission, stageId: stage.id, status: 'COMPLETED' });
    mission.updatedAt = isoNow(this.timeProvider);
  }

  retryStage({ mission, stageId }) {
    const rollbackIndex = stageIndex(stageId);
    if (rollbackIndex < 0) {
      throw new Error(`Unknown stage for retry: ${stageId}`);
    }

    this.rollbackMission({ mission, stageId, reason: 'Retry requested' });
    mission.state = WebsiteMissionStates.RUNNING;
  }

  resumeMission({ mission }) {
    if (mission.state === WebsiteMissionStates.FAILED || mission.state === WebsiteMissionStates.REVISION_REQUIRED) {
      mission.state = WebsiteMissionStates.RUNNING;
    }

    return this.runMission({}, { mission, resumeFromStageId: mission.currentStageId });
  }

  rollbackMission({ mission, stageId, reason = 'Rollback requested' }) {
    const targetIndex = stageIndex(stageId);
    if (targetIndex < 0) {
      throw new Error(`Unknown stage for rollback: ${stageId}`);
    }

    const retainStageIds = WebsiteWorkflowStages.slice(0, targetIndex).map((stage) => stage.id);
    mission.completedStageIds = mission.completedStageIds.filter((id) => retainStageIds.includes(id));
    mission.currentStageId = stageId;

    const retainedArtifacts = {};
    if (retainStageIds.includes('PROSPECT_APPROVED')) retainedArtifacts.prospectApproval = mission.artifacts.prospectApproval;
    if (retainStageIds.includes('COMPANY_RESEARCH')) retainedArtifacts.companyResearch = mission.artifacts.companyResearch;
    if (retainStageIds.includes('BRAND_PACKAGE_GENERATION')) retainedArtifacts.brandPackage = mission.artifacts.brandPackage;
    if (retainStageIds.includes('TEMPLATE_SELECTION')) retainedArtifacts.templateSelection = mission.artifacts.templateSelection;

    mission.artifacts = retainedArtifacts;
    mission.warnings = [];
    mission.blockingIssues = [];
    mission.failureLog.push({
      stageId,
      action: 'rollback',
      reason,
      timestamp: isoNow(this.timeProvider)
    });
  }

  logFailure({ mission, stageId, error, action }) {
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

  enforcePublishGovernance({ mission }) {
    if (mission.state !== WebsiteMissionStates.APPROVED) {
      throw new Error('Publishing always requires CEO approval.');
    }

    if (String(mission.artifacts?.ceoApproval?.decision ?? '').toUpperCase() !== 'APPROVED') {
      throw new Error('Publishing blocked: CEO approval decision is missing.');
    }
  }

  enforceBrandPreservation({ mission }) {
    const existing = mission.existingBranding ?? {};
    const preserved = mission.artifacts?.brandPackage?.preservedBranding
      ?? mission.artifacts?.generatedWebsite?.brandingSnapshot
      ?? {};

    const brandingChanged = JSON.stringify(existing) !== JSON.stringify(preserved);
    const hasExplicitApproval = Boolean(mission.brandingChangeRequest?.approved === true);

    if (brandingChanged && !hasExplicitApproval) {
      throw new Error('Website modifications must preserve existing branding unless explicitly approved.');
    }
  }

  estimateCompletionTime({ mission }) {
    const minutesPerStage = Number(mission.estimatedStageMinutes ?? 15);
    const totalStages = WebsiteWorkflowStages.length;
    const completed = mission.completedStageIds.length;
    const remaining = Math.max(totalStages - completed, 0);
    const etaMinutes = remaining * minutesPerStage;

    return {
      etaMinutes,
      estimatedCompletion: `${etaMinutes}m`
    };
  }

  calculateConfidence(mission) {
    if (!Array.isArray(mission.confidenceHistory) || mission.confidenceHistory.length === 0) {
      return 0;
    }

    const sum = mission.confidenceHistory.reduce((acc, value) => acc + Number(value || 0), 0);
    return Number((sum / mission.confidenceHistory.length).toFixed(2));
  }

  buildExecutiveDashboard({ mission }) {
    const currentStage = resolveStageById(mission.currentStageId);
    const completionPercentage = calculateCompletionPercentage(mission.completedStageIds.length);
    const eta = this.estimateCompletionTime({ mission });

    return {
      currentStage: currentStage?.label ?? mission.currentStageId,
      completionPercentage,
      warnings: Array.isArray(mission.warnings) ? mission.warnings : [],
      confidence: this.calculateConfidence(mission),
      blockingIssues: Array.isArray(mission.blockingIssues) ? mission.blockingIssues : [],
      estimatedCompletion: eta.estimatedCompletion
    };
  }

  buildArchitectureSummary() {
    return {
      orchestrator: 'Atlas Website Orchestrator v1',
      missionPipeline: WebsiteWorkflowStages.map((stage) => stage.label),
      missionStateMachine: this.stateMachine.transitionMap,
      governance: {
        publishRequiresCeoApproval: true,
        preserveBrandingUnlessApproved: true
      },
      integrations: this.adapterRegistry.listAdapters()
    };
  }

  buildResult({ mission }) {
    return {
      mission,
      dashboard: this.buildExecutiveDashboard({ mission }),
      architecture: this.buildArchitectureSummary()
    };
  }
}
