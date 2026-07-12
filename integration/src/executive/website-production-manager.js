import {
  createWebsiteProductionReviewRequest,
  validateWebsiteProductionReviewRequest,
  WebsiteProductionManagerStates
} from './website-production-manager-contracts.js';
import { WebsiteExecutiveReviewPackageGenerator } from './website-executive-review-package-generator.js';
import { WebsiteProductionExecutionOrchestrator } from './website-production-execution-orchestrator.js';
import { loadRecordMap, upsertRecord } from '../storage/provider-backed-state.js';
import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/^\//, '')
    .replace(/\/$/, '');
}

function resolveRequiredPages({ request, pipelineMission }) {
  const fromRequest = toArray(request.requiredPages).map(normalizeSlug).filter(Boolean);
  if (fromRequest.length > 0) return [...new Set(fromRequest)];

  const fromMission = toArray(pipelineMission?.websiteRequirements?.pages).map(normalizeSlug).filter(Boolean);
  if (fromMission.length > 0) return [...new Set(fromMission)];

  return ['home', 'contact'];
}

function buildChecklist({ checks, governance }) {
  return {
    sandboxProjectConfirmed: true,
    qaCompleted: checks.every((check) => typeof check.score === 'number'),
    requiredPagesVerified: checks.find((item) => item.checkId === 'REQUIRED_PAGE_VERIFICATION')?.passed === true,
    governanceValidated: governance.publishAttempted === false
      && governance.deployAttempted === false
      && governance.destructiveOperationAttempted === false,
    awaitingCeoApproval: true
  };
}

export class WebsiteProductionManager {
  constructor({
    missionControl,
    executivePlanningSystem,
    missionOrchestratorManager,
    missionControlManager,
    operationsLoopManager,
    workforceDirector,
    reviewPackageGenerator,
    executionOrchestrator,
    storageProvider,
    logger,
    now,
    namespace = 'executive.website-production-manager.reviews'
  } = {}) {
    this.missionControl = missionControl ?? null;
    this.executivePlanningSystem = executivePlanningSystem ?? null;
    this.missionOrchestratorManager = missionOrchestratorManager ?? null;
    this.missionControlManager = missionControlManager ?? null;
    this.operationsLoopManager = operationsLoopManager ?? null;
    this.workforceDirector = workforceDirector ?? missionControl?.workforceDirector ?? null;
    this.reviewPackageGenerator = reviewPackageGenerator ?? new WebsiteExecutiveReviewPackageGenerator();
    this.executionOrchestrator = executionOrchestrator ?? new WebsiteProductionExecutionOrchestrator({ now });
    this.storageProvider = storageProvider ?? null;
    this.logger = logger ?? { log: () => {} };
    this.now = now;
    this.namespace = namespace;
    this.reviews = loadRecordMap({ provider: this.storageProvider, namespace: this.namespace });
  }

  persistReview(reviewRecord) {
    if (!reviewRecord?.reviewId) return;
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key: reviewRecord.reviewId, value: reviewRecord });
  }

  resolveMissionContext(request) {
    const session = request.missionId
      ? this.missionOrchestratorManager?.getSessionByMissionId?.(request.missionId) ?? null
      : null;

    const pipelineMission = session?.pipelineMission ?? null;
    const adapterType = String(pipelineMission?.adapterType ?? request.adapterType ?? '').toUpperCase();

    if (adapterType !== 'FRAMER') {
      return {
        ok: false,
        reason: 'Only FRAMER sandbox projects are supported by Website Production Manager v1.'
      };
    }

    if (request.missionId && !session) {
      return {
        ok: false,
        reason: `Mission orchestration session not found for missionId ${request.missionId}.`
      };
    }

    if (pipelineMission) {
      const state = String(pipelineMission.state ?? '').toUpperCase();
      if (!['COMPLETED', 'SANDBOX_UPDATED'].includes(state)) {
        return {
          ok: false,
          reason: `Mission ${request.missionId} is not in a completed sandbox state. Current state: ${state}.`
        };
      }
    }

    const sandboxProject = request.sandboxProject
      ?? pipelineMission?.artifacts?.sandboxBuildResult?.sandboxProject
      ?? null;

    if (!sandboxProject) {
      return {
        ok: false,
        reason: 'Sandbox project details are required to produce a delivery package.'
      };
    }

    const projectDetails = pipelineMission?.artifacts?.companyResearch?.projectDetails
      ?? pipelineMission?.artifacts?.prospectProfile?.projectDetails
      ?? {};

    return {
      ok: true,
      session,
      pipelineMission,
      sandboxProject,
      projectDetails
    };
  }

  evaluateProductionReadiness(input = {}) {
    const request = createWebsiteProductionReviewRequest(input);
    const validation = validateWebsiteProductionReviewRequest(request);

    if (!validation.isValid) {
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: validation.issues.join(' | '),
        review: null
      };
    }

    const context = this.resolveMissionContext(request);
    if (!context.ok) {
      return {
        accepted: false,
        status: 409,
        code: 'INVALID_STATE',
        reason: context.reason,
        review: null
      };
    }

    const requiredPages = resolveRequiredPages({ request, pipelineMission: context.pipelineMission });

    const pipeline = this.executionOrchestrator.execute({
      request,
      context,
      requiredPages,
      workforceDirector: this.workforceDirector,
      reviewPackageGenerator: this.reviewPackageGenerator,
      operationsLoopManager: this.operationsLoopManager
    });

    const governance = {
      publishAttempted: false,
      deployAttempted: false,
      destructiveOperationAttempted: false,
      deliveryPackageGenerated: true,
      finalState: WebsiteProductionManagerStates.AWAITING_CEO_APPROVAL
    };

    const deliveryPackage = {
      executiveSummary: {
        title: 'Website Production Delivery Package',
        missionId: request.missionId,
        summary: `Production execution completed for sandbox project ${context.sandboxProject.name ?? context.sandboxProject.id ?? 'UNKNOWN_PROJECT'}.`,
        generatedAt: nowIso(this.now)
      },
      completedWebsiteOverview: {
        sandboxProjectId: context.sandboxProject.id ?? null,
        sandboxProjectName: context.sandboxProject.name ?? null,
        projectUrl: context.sandboxProject.projectUrl ?? null,
        missionState: context.pipelineMission?.state ?? null,
        proposalId: context.session?.proposalId ?? null,
        workforceStatus: this.workforceDirector?.buildDashboard?.() ?? null
      },
      qaResults: {
        score: pipeline.qaResult.qualityScore,
        checks: pipeline.qaResult.checks,
        qaStatus: pipeline.qaResult.qaStatus,
        issuesRemaining: pipeline.qaResult.issuesRemaining
      },
      screenshotReferences: pipeline.qaResult.screenshotTasks.map((task) => ({
        taskId: task.taskId,
        page: task.page,
        reference: `capture://${task.taskId}`,
        status: task.status
      })),
      recommendedRevisions: pipeline.qaResult.recommendations,
      confidenceScore: pipeline.deliveryPackage.confidenceScore,
      deliveryChecklist: buildChecklist({ checks: pipeline.qaResult.checks, governance }),
      productionExecution: {
        stage: pipeline.session.stage,
        qaStatus: pipeline.session.qaStatus,
        issuesRemaining: pipeline.session.issuesRemaining,
        workerAssignments: pipeline.session.workerAssignments,
        revisionRetries: pipeline.session.revisionRetries,
        estimatedCompletion: pipeline.session.estimatedCompletion,
        qualityScore: pipeline.session.qualityScore,
        deliveryReadiness: pipeline.session.deliveryReadiness
      },
      executionArtifacts: pipeline.deliveryPackage,
      reusedSystems: {
        missionControl: Boolean(this.missionControl),
        executivePlanning: Boolean(this.executivePlanningSystem),
        executiveDashboard: true,
        executiveReviewPackage: Boolean(this.reviewPackageGenerator),
        websiteBuilderMission: Boolean(context.pipelineMission),
        workforceDirector: Boolean(this.workforceDirector),
        persistenceLayer: Boolean(this.storageProvider),
        operationsLoop: Boolean(this.operationsLoopManager)
      },
      executiveReviewPackage: pipeline.deliveryPackage.executiveReviewPackage
    };

    const review = {
      reviewId: request.reviewId,
      missionId: request.missionId,
      orchestrationId: context.session?.orchestrationId ?? null,
      state: WebsiteProductionManagerStates.AWAITING_CEO_APPROVAL,
      createdAt: request.timestamp,
      updatedAt: nowIso(this.now),
      requestedBy: request.requestedBy,
      correlationId: request.correlationId,
      sandboxProject: context.sandboxProject,
      qa: {
        requiredPages,
        checks: pipeline.qaResult.checks,
        score: pipeline.qaResult.qualityScore,
        status: pipeline.qaResult.qaStatus,
        issuesRemaining: pipeline.qaResult.issuesRemaining
      },
      execution: pipeline.session,
      revisionHistory: pipeline.revisionHistory,
      deliveryPackage,
      governance
    };

    this.reviews.set(review.reviewId, review);
    this.persistReview(review);

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      review
    };
  }

  listReviews() {
    return Array.from(this.reviews.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  getDashboardProjection() {
    const records = this.listReviews().map((review) => ({
      reviewId: review.reviewId,
      missionId: review.missionId,
      orchestrationId: review.orchestrationId,
      state: review.state,
      stage: review.execution?.stage ?? null,
      qaStatus: review.execution?.qaStatus ?? review.qa?.status ?? 'UNKNOWN',
      issuesRemaining: Number(review.execution?.issuesRemaining ?? review.qa?.issuesRemaining ?? 0),
      workerAssignments: review.execution?.workerAssignments ?? [],
      estimatedCompletion: review.execution?.estimatedCompletion ?? null,
      qualityScore: Number(review.execution?.qualityScore ?? review.qa?.score ?? 0),
      deliveryReadiness: review.execution?.deliveryReadiness ?? 'UNKNOWN',
      score: review.qa.score,
      confidenceScore: review.deliveryPackage.confidenceScore,
      recommendedRevisionCount: review.deliveryPackage.recommendedRevisions.length,
      checklist: review.deliveryPackage.deliveryChecklist,
      generatedAt: review.updatedAt
    }));

    return {
      status: records.length > 0 ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.PARTIAL,
      totalReviews: records.length,
      awaitingCeoApproval: records.filter((item) => item.state === WebsiteProductionManagerStates.AWAITING_CEO_APPROVAL).length,
      records
    };
  }
}
