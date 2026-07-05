import { AtlasInstituteLogger } from './atlas-institute-logger.js';
import { AtlasInstituteManager } from './atlas-institute-manager.js';
import { AtlasInstituteRecorder } from './atlas-institute-recorder.js';
import { AtlasInstituteRepository } from './atlas-institute-repository.js';
import { AtlasInstituteRetrieval } from './atlas-institute-retrieval.js';
import { KnowledgeCategory } from './models.js';

export class AtlasInstituteService {
  constructor({
    repository = new AtlasInstituteRepository(),
    recorder = new AtlasInstituteRecorder(),
    manager = null,
    retrieval = null,
    logger = new AtlasInstituteLogger(),
    executiveService = null,
    researchService = null,
    memoryService = null,
    metricsService = null,
    performanceService = null,
    approvalService = null,
    capabilityRegistryService = null,
    workerOrchestrationService = null,
    controlCenterService = null,
  } = {}) {
    this.repository = repository;
    this.recorder = recorder;
    this.manager = manager ?? new AtlasInstituteManager(this.repository, this.recorder);
    this.retrieval = retrieval ?? new AtlasInstituteRetrieval(this.repository);
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
  }

  recordLesson(payload) {
    const record = this.manager.recordLesson(payload);
    this.logger.log({ message: 'Lesson recorded', recordId: record.id });
    return record;
  }

  recordExperiment(payload) {
    const record = this.manager.recordExperiment(payload);
    this.logger.log({ message: 'Experiment recorded', recordId: record.id });
    return record;
  }

  recordBestPractice(payload) {
    const record = this.manager.recordBestPractice(payload);
    this.logger.log({ message: 'Best practice recorded', recordId: record.id });
    return record;
  }

  recordFailure(payload) {
    const record = this.manager.recordFailure(payload);
    this.logger.log({ message: 'Failure recorded', recordId: record.id });
    return record;
  }

  searchKnowledge(query = {}) {
    const result = this.retrieval.searchKnowledge(query);
    this.logger.log({ message: 'Knowledge search executed', count: result.total });
    return result;
  }

  generatePlaybook({ topic, query = {} }) {
    const synthesis = this.manager.generatePlaybook({ topic, query });
    this.logger.log({ message: 'Playbook generated', topic, guidanceCount: synthesis.guidance.length });
    return synthesis;
  }

  generateBestPractices({ domain, query = {} }) {
    const synthesis = this.manager.generateBestPractices({ domain, query });
    this.logger.log({ message: 'Best practices generated', domain, guidanceCount: synthesis.guidance.length });
    return synthesis;
  }

  recommendImprovements({ area, query = {} }) {
    const synthesis = this.manager.recommendImprovements({ area, query });
    this.logger.log({ message: 'Improvements recommended', area, guidanceCount: synthesis.guidance.length });
    return synthesis;
  }

  getStandards() {
    const standards = this.manager.getStandards();
    this.logger.log({ message: 'Standards retrieved', count: standards.total });
    return standards;
  }

  getKnowledgeSummary() {
    const summary = this.manager.getSummary();
    this.logger.log({ message: 'Knowledge summary generated', total: summary.total });
    return summary;
  }

  captureSystemKnowledge({ workflowId, requestId, objective, controlCenterView = null, executionResult = null } = {}) {
    const lessons = [];

    const capabilities = this.capabilityRegistryService?.listCapabilities?.() ?? [];
    const approvalResult = this.approvalService?.getApprovalHistory?.({ workflowId, requestId }) ?? [];
    const approvals = Array.isArray(approvalResult) ? approvalResult : (approvalResult.records ?? []);
    const workflowHistory = this.workerOrchestrationService?.getHistory?.() ?? [];
    const memoryRecords = this.memoryService?.retrieve?.({ workflowId, requestId })?.records ?? [];
    const metricsRecords = this.metricsService?.retrieveMetrics?.({ workflowId, requestId })?.records ?? [];
    const performanceRecords = this.performanceService?.retrieveIntelligence?.({ workflowId, requestId })?.records ?? [];

    const executiveSignal = {
      workflowId,
      requestId,
      objective,
      workflowState: executionResult?.workflowState ?? null,
    };
    const researchSignal = executionResult?.researchResponse ?? executionResult?.research ?? null;
    const memorySignal = executionResult?.memory ?? null;
    const metricsSignal = executionResult?.metrics ?? null;
    const performanceSignal = executionResult?.performance ?? null;
    const approvalSignal = executionResult?.authorization ?? executionResult?.approval ?? null;
    const registrySignal = executionResult?.capabilities ?? null;
    const workerSignal = executionResult?.execution ?? null;

    lessons.push(this.manager.recordKnowledge({
      category: KnowledgeCategory.ARCHITECTURAL_DECISIONS,
      title: `Workflow architectural context ${workflowId ?? 'unknown'}`,
      summary: 'Cross-service architecture boundaries preserved during workflow execution.',
      content: JSON.stringify({ workflowId, requestId, capabilityCount: capabilities.length }),
      source: 'capability-registry-service',
      metadata: { workflowId, requestId },
      tags: ['architecture', 'boundaries', 'capabilities'],
    }));

    lessons.push(this.manager.recordKnowledge({
      category: KnowledgeCategory.LESSONS,
      title: `Executive intent signal ${requestId ?? 'unknown'}`,
      summary: 'Executive intent signal captured for organizational learning continuity.',
      content: JSON.stringify(executiveSignal),
      source: 'executive-service',
      metadata: { workflowId, requestId },
      tags: ['executive', 'intent'],
    }));

    if (researchSignal) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.EXPERIMENTS,
        title: `Research synthesis signal ${workflowId ?? 'unknown'}`,
        summary: 'Research output captured as experiment and evidence learning input.',
        content: JSON.stringify(researchSignal),
        source: 'research-service',
        metadata: { workflowId, requestId },
        tags: ['research', 'evidence'],
      }));
    }

    if (memorySignal) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.BUSINESS_KNOWLEDGE,
        title: `Memory integration signal ${workflowId ?? 'unknown'}`,
        summary: 'Memory integration output captured for institutional continuity.',
        content: JSON.stringify(memorySignal),
        source: 'memory-service',
        metadata: { workflowId, requestId },
        tags: ['memory', 'integration'],
      }));
    }

    if (metricsSignal) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.BEST_PRACTICES,
        title: `Metrics integration signal ${workflowId ?? 'unknown'}`,
        summary: 'Metrics outputs captured as measurable best-practice signals.',
        content: JSON.stringify(metricsSignal),
        source: 'metrics-service',
        metadata: { workflowId, requestId },
        tags: ['metrics', 'measurement'],
      }));
    }

    if (performanceSignal) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.BEST_PRACTICES,
        title: `Performance intelligence signal ${workflowId ?? 'unknown'}`,
        summary: 'Performance intelligence converted into reusable guidance candidates.',
        content: JSON.stringify(performanceSignal),
        source: 'performance-intelligence-service',
        metadata: { workflowId, requestId },
        tags: ['performance', 'intelligence'],
      }));
    }

    if (approvalSignal) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.STANDARDS,
        title: `Approval governance signal ${workflowId ?? 'unknown'}`,
        summary: 'Governance authorization signals captured for policy learning.',
        content: JSON.stringify(approvalSignal),
        source: 'approval-service',
        metadata: { workflowId, requestId },
        tags: ['approval', 'governance'],
      }));
    }

    if (registrySignal) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.ARCHITECTURAL_DECISIONS,
        title: `Capability registry signal ${workflowId ?? 'unknown'}`,
        summary: 'Capability registry outputs captured for dependency and ownership learning.',
        content: JSON.stringify(registrySignal),
        source: 'capability-registry-service',
        metadata: { workflowId, requestId },
        tags: ['registry', 'capabilities'],
      }));
    }

    if (workerSignal) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.PLAYBOOKS,
        title: `Worker orchestration signal ${workflowId ?? 'unknown'}`,
        summary: 'Worker orchestration outcomes captured for reusable playbook generation.',
        content: JSON.stringify(workerSignal),
        source: 'worker-orchestration-service',
        metadata: { workflowId, requestId },
        tags: ['worker', 'orchestration'],
      }));
    }

    if (approvals.length > 0) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.STANDARDS,
        title: `Governance authorization outcomes ${workflowId ?? 'unknown'}`,
        summary: 'Approval outcomes captured for organizational governance learning.',
        content: JSON.stringify(approvals),
        source: 'approval-service',
        metadata: { workflowId, requestId },
        tags: ['governance', 'approval'],
      }));
    }

    if (workflowHistory.length > 0) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.EXPERIMENTS,
        title: `Worker execution patterns ${workflowId ?? 'unknown'}`,
        summary: 'Worker execution history captured for repeatability and pattern detection.',
        content: JSON.stringify(workflowHistory.slice(-10)),
        source: 'worker-orchestration-service',
        metadata: { workflowId, requestId },
        tags: ['worker', 'execution'],
      }));
    }

    if (memoryRecords.length > 0) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.BUSINESS_KNOWLEDGE,
        title: `Workflow memory context ${workflowId ?? 'unknown'}`,
        summary: 'Historical records captured as business and operational knowledge.',
        content: JSON.stringify(memoryRecords.slice(-10)),
        source: 'memory-service',
        metadata: { workflowId, requestId },
        tags: ['memory', 'history'],
      }));
    }

    if (metricsRecords.length > 0 || performanceRecords.length > 0) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.BEST_PRACTICES,
        title: `Measured operational outcomes ${workflowId ?? 'unknown'}`,
        summary: 'Metrics and performance intelligence converted into reusable guidance candidates.',
        content: JSON.stringify({ metrics: metricsRecords.slice(-10), performance: performanceRecords.slice(-10) }),
        source: 'performance-intelligence-service',
        metadata: { workflowId, requestId },
        tags: ['metrics', 'performance'],
      }));
    }

    if (controlCenterView) {
      lessons.push(this.manager.recordKnowledge({
        category: KnowledgeCategory.PLAYBOOKS,
        title: `Operational visibility synthesis ${workflowId ?? 'unknown'}`,
        summary: 'Control Center observations transformed into operational playbook inputs.',
        content: JSON.stringify(controlCenterView),
        source: 'control-center-service',
        metadata: { workflowId, requestId },
        tags: ['control-center', 'observability'],
      }));
    }

    if (executionResult?.execution?.executed === false) {
      lessons.push(this.manager.recordFailure({
        title: `Execution blocked ${workflowId ?? 'unknown'}`,
        summary: executionResult.execution.reason ?? 'Execution was blocked',
        content: JSON.stringify(executionResult.execution),
        source: 'approval-service',
        metadata: { workflowId, requestId, objective },
        tags: ['blocked', 'governance'],
      }));
    }

    if (objective) {
      lessons.push(this.manager.recordLesson({
        title: `Objective learning ${requestId ?? 'unknown'}`,
        summary: 'Objective captured for institutional continuity and synthesis.',
        content: objective,
        source: 'executive-service',
        metadata: { workflowId, requestId },
        tags: ['objective', 'continuity'],
      }));
    }

    this.logger.log({
      message: 'System knowledge captured',
      workflowId,
      requestId,
      capturedRecords: lessons.length,
    });

    return lessons;
  }

  getHistory() {
    return {
      repositoryHistory: this.retrieval.getHistory(),
      logEvents: this.logger.getEvents(),
    };
  }
}
