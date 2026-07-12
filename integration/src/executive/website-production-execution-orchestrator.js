import {
  WebsiteProductionExecutionStages,
  WebsiteProductionManagerStates
} from './website-production-manager-contracts.js';
import { WebsiteProductionQaEngine } from './website-production-qa-engine.js';
import { WebsiteProductionRevisionEngine } from './website-production-revision-engine.js';
import { WebsiteProductionDeliveryPackageGenerator } from './website-production-delivery-package-generator.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export class WebsiteProductionExecutionOrchestrator {
  constructor({ qaEngine, revisionEngine, deliveryPackageGenerator, now } = {}) {
    this.now = now;
    this.qaEngine = qaEngine ?? new WebsiteProductionQaEngine();
    this.revisionEngine = revisionEngine ?? new WebsiteProductionRevisionEngine({ now });
    this.deliveryPackageGenerator = deliveryPackageGenerator ?? new WebsiteProductionDeliveryPackageGenerator({ now });
  }

  createSession({ request, context }) {
    return {
      reviewId: request.reviewId,
      missionId: request.missionId,
      orchestrationId: context.session?.orchestrationId ?? null,
      state: WebsiteProductionManagerStates.RUNNING_QA,
      stage: WebsiteProductionExecutionStages.RECEIVE_SANDBOX_PROJECT,
      startedAt: request.timestamp,
      updatedAt: nowIso(this.now),
      qaStatus: 'NOT_STARTED',
      qualityScore: 0,
      issuesRemaining: 0,
      revisionRetries: 0,
      workerAssignments: [],
      estimatedCompletion: null,
      deliveryReadiness: 'NOT_READY'
    };
  }

  execute({ request, context, requiredPages, workforceDirector, reviewPackageGenerator, operationsLoopManager } = {}) {
    const session = this.createSession({ request, context });

    session.stage = WebsiteProductionExecutionStages.QUALITY_ASSURANCE;
    const qaResult = this.qaEngine.evaluate({
      reviewId: request.reviewId,
      requiredPages,
      pipelineMission: context.pipelineMission,
      projectDetails: context.projectDetails
    });

    session.qaStatus = qaResult.qaStatus;
    session.qualityScore = qaResult.qualityScore;
    session.issuesRemaining = qaResult.issuesRemaining;

    session.stage = WebsiteProductionExecutionStages.REVISION_CYCLE;
    const revisionOutcome = this.revisionEngine.run({
      qaEngine: this.qaEngine,
      session,
      requiredPages,
      pipelineMission: context.pipelineMission,
      projectDetails: context.projectDetails,
      workforceDirector
    });

    session.revisionRetries = revisionOutcome.retries;
    session.qaStatus = revisionOutcome.qa.qaStatus;
    session.qualityScore = revisionOutcome.qa.qualityScore;
    session.issuesRemaining = revisionOutcome.qa.issuesRemaining;

    session.stage = WebsiteProductionExecutionStages.DELIVERY_PACKAGE;
    const deliveryPackageGenerator = reviewPackageGenerator
      ? new WebsiteProductionDeliveryPackageGenerator({ reviewPackageGenerator, now: this.now })
      : this.deliveryPackageGenerator;

    const deliveryPackage = deliveryPackageGenerator.generate({
      session,
      pipelineMission: context.pipelineMission,
      sandboxProject: context.sandboxProject,
      qaResult: revisionOutcome.qa,
      revisionHistory: revisionOutcome.history,
      workforceDirector
    });

    session.stage = WebsiteProductionExecutionStages.AWAIT_GOVERNANCE_APPROVAL;
    session.state = WebsiteProductionManagerStates.AWAITING_CEO_APPROVAL;
    session.deliveryReadiness = revisionOutcome.qa.qaStatus === 'PASS' ? 'READY_FOR_CEO_APPROVAL' : 'REVISIONS_PENDING_CEO_DECISION';
    session.estimatedCompletion = session.deliveryReadiness === 'READY_FOR_CEO_APPROVAL'
      ? nowIso(this.now)
      : 'AFTER_REVISION_APPROVAL';
    session.workerAssignments = (workforceDirector?.buildDashboard?.()?.currentWorkload ?? [])
      .flatMap((entry) => entry.workers ?? [])
      .map((worker) => worker.workerName ?? worker.workerId ?? 'UNASSIGNED');
    session.updatedAt = nowIso(this.now);

    operationsLoopManager?.store?.recordAudit?.({
      timestamp: nowIso(this.now),
      event: 'WEBSITE_PRODUCTION_PIPELINE_EXECUTED',
      details: {
        reviewId: session.reviewId,
        missionId: session.missionId,
        qaStatus: session.qaStatus,
        qualityScore: session.qualityScore,
        issuesRemaining: session.issuesRemaining
      }
    });

    return {
      session,
      qaResult: revisionOutcome.qa,
      revisionHistory: revisionOutcome.history,
      deliveryPackage
    };
  }
}
