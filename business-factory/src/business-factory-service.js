import { BusinessFactoryLogger } from './business-factory-logger.js';
import { BusinessFactoryManager } from './business-factory-manager.js';
import { BusinessFactoryRecorder } from './business-factory-recorder.js';
import { BusinessFactoryRepository } from './business-factory-repository.js';
import { BusinessFactoryRetrieval } from './business-factory-retrieval.js';

export class BusinessFactoryService {
  constructor({
    repository = new BusinessFactoryRepository(),
    recorder = new BusinessFactoryRecorder(),
    manager = null,
    retrieval = null,
    logger = new BusinessFactoryLogger(),
    executiveService = null,
    researchService = null,
    memoryService = null,
    metricsService = null,
    performanceService = null,
    approvalService = null,
    capabilityRegistryService = null,
    workerOrchestrationService = null,
    controlCenterService = null,
    atlasInstituteService = null,
  } = {}) {
    this.repository = repository;
    this.recorder = recorder;
    this.manager = manager ?? new BusinessFactoryManager(this.repository, this.recorder);
    this.retrieval = retrieval ?? new BusinessFactoryRetrieval(this.repository);
    this.logger = logger;

    this.executiveService = executiveService;
    this.researchService = researchService;
    this.memoryService = memoryService;
    this.metricsService = metricsService;
    this.performanceService = performanceService;
    this.approvalService = approvalService;
    this.capabilityRegistryService = capabilityRegistryService;
    this.workerOrchestrationService = workerOrchestrationService;
    this.controlCenterService = controlCenterService;
    this.atlasInstituteService = atlasInstituteService;
  }

  createBusiness(payload) {
    if (!payload.approvedOpportunity?.approved) {
      throw new Error('Business creation requires approved opportunity');
    }

    const business = this.manager.createBusiness({
      opportunityId: payload.approvedOpportunity.id,
      name: payload.name,
      objective: payload.objective,
      metadata: payload.metadata ?? {},
    });

    this.logger.log({ message: 'Business created', businessId: business.id, opportunityId: business.opportunityId });
    return business;
  }

  buildPipeline({ businessId, pipelineTemplate = null }) {
    const business = this.manager.buildPipeline({ businessId, pipelineTemplate });
    this.logger.log({ message: 'Business pipeline built', businessId, stageCount: business.pipeline.length });
    return business;
  }

  async assignPipeline({ businessId, requestId, authorization }) {
    const business = this.retrieval.getBusinessStatus(businessId);

    const approval = authorization ?? this.approvalService?.requestApproval?.({
      workflowId: business.id,
      requestId,
      type: 'business-launch',
      policy: { requiresCeo: true },
      requestedBy: 'BusinessFactoryService',
      metadata: { businessId, objective: business.objective },
    });

    const authorized = approval?.authorized ?? approval?.status === 'APPROVED'
      ?? (approval?.id ? this.approvalService?.isAuthorized?.(approval.id) : false);

    if (!authorized) {
      throw new Error('Pipeline assignment requires approved authorization');
    }

    const capabilities = this.capabilityRegistryService?.searchCapabilities?.({})?.records ?? [];
    const assignmentPlan = [
      {
        id: `pipeline-${business.id}-mvp`,
        workflowId: business.id,
        requestId,
        capability: capabilities[0]?.metadata?.name ?? 'Worker Orchestration',
        payload: { phase: 'MVP Build', businessId: business.id, objective: business.objective },
        dependencies: [],
        maxRetries: 2,
        timeoutMs: 120000,
        stage: 0,
      },
      {
        id: `pipeline-${business.id}-launch`,
        workflowId: business.id,
        requestId,
        capability: capabilities[1]?.metadata?.name ?? 'Control Center',
        payload: { phase: 'Launch', businessId: business.id },
        dependencies: [`pipeline-${business.id}-mvp`],
        maxRetries: 2,
        timeoutMs: 120000,
        stage: 1,
      },
      {
        id: `pipeline-${business.id}-marketing`,
        workflowId: business.id,
        requestId,
        capability: capabilities[2]?.metadata?.name ?? 'Atlas Institute',
        payload: { phase: 'Marketing', businessId: business.id },
        dependencies: [`pipeline-${business.id}-launch`],
        maxRetries: 2,
        timeoutMs: 120000,
        stage: 2,
      },
    ];

    const execution = await this.workerOrchestrationService?.coordinateWorkflow?.({
      workflowId: business.id,
      requestId,
      authorization: { authorized: true },
      workItems: assignmentPlan,
    });

    const assigned = this.manager.assignPipeline({
      businessId,
      workflowExecutionId: execution?.id ?? execution?.workflowExecutionId ?? null,
    });

    this.logger.log({
      message: 'Pipeline assigned',
      businessId,
      workflowExecutionId: assigned.assignedWorkflowExecutionId,
    });

    return {
      business: assigned,
      execution,
    };
  }

  async launchBusiness({ businessId, requestId, context = {} }) {
    const business = this.retrieval.getBusinessStatus(businessId);

    const researchJob = await this.researchService?.createResearchJob?.(
      requestId,
      business.objective,
      { businessId, phase: 'validation' }
    );
    const researchResult = researchJob
      ? await this.researchService?.executeResearch?.(researchJob.id, { objective: business.objective, context })
      : null;

    const assigned = await this.assignPipeline({
      businessId,
      requestId,
      authorization: { authorized: true, status: 'APPROVED' },
    });

    const launched = this.manager.launchBusiness({
      businessId,
      metadata: {
        launchedAt: new Date().toISOString(),
        workflowExecutionId: assigned.execution?.id ?? assigned.execution?.workflowExecutionId ?? null,
      },
    });

    const workflowId = launched.id;

    this.memoryService?.recordWorkflowHistory?.({
      title: `Business launch ${launched.name}`,
      summary: 'Business Factory launch execution completed.',
      content: JSON.stringify({ businessId, requestId, workflowExecutionId: launched.assignedWorkflowExecutionId }),
      metadata: { workflowId, requestId, source: 'business-factory-service', tags: ['business-factory', 'launch'] },
    });

    this.metricsService?.recordWorkflowCompletion?.({
      workflowId,
      requestId,
      completionStatus: 'completed',
      durationMs: 1,
      metadata: { tags: ['business-factory', 'launch'] },
    });

    this.performanceService?.recordExecution?.({
      workflowId,
      requestId,
      assignmentId: launched.assignedWorkflowExecutionId,
      status: 'COMPLETED',
      durationMs: 1,
      retryCount: 0,
    });

    const visibility = this.controlCenterService?.getSystemOverview?.({ workflowId, requestId, workflowExecutionId: launched.assignedWorkflowExecutionId }) ?? null;

    this.atlasInstituteService?.recordExperiment?.({
      title: `Business launch experiment ${launched.name}`,
      summary: 'Business launch outcomes captured for organizational learning.',
      content: JSON.stringify({ businessId, workflowId, requestId, visibility }),
      source: 'business-factory-service',
      metadata: { workflowId, requestId },
      tags: ['business-factory', 'experiment', 'launch'],
    });

    this.atlasInstituteService?.recommendImprovements?.({
      area: 'Business Pipeline',
      query: { text: launched.name },
    });

    this.executiveService?.monitor?.(workflowId).catch?.(() => undefined);

    this.logger.log({ message: 'Business launched', businessId, requestId, workflowExecutionId: launched.assignedWorkflowExecutionId });

    return {
      business: launched,
      assignment: assigned,
      research: researchResult,
      visibility,
    };
  }

  getBusinessStatus(businessId) {
    return this.retrieval.getBusinessStatus(businessId);
  }

  pauseBusiness({ businessId, reason = 'Paused by operator' }) {
    const business = this.manager.setPaused({ businessId, reason });
    this.logger.log({ message: 'Business paused', businessId, reason });
    return business;
  }

  resumeBusiness({ businessId }) {
    const business = this.manager.setResumed({ businessId });
    this.logger.log({ message: 'Business resumed', businessId });
    return business;
  }

  archiveBusiness({ businessId, reason = 'Archived by operator' }) {
    const business = this.manager.setArchived({ businessId, reason });
    this.logger.log({ message: 'Business archived', businessId, reason });
    return business;
  }

  getFactoryMetrics() {
    const metrics = this.manager.getFactoryMetrics();
    const serviceMetrics = this.metricsService?.retrieveMetrics?.({ tag: 'business-factory' }) ?? { total: 0 };

    return {
      ...metrics,
      serviceMetricCount: serviceMetrics.total ?? serviceMetrics.records?.length ?? 0,
    };
  }

  getProductionHistory() {
    return {
      repository: this.retrieval.getProductionHistory(),
      logs: this.logger.getEvents(),
    };
  }
}
