import { WorkerOrchestrationService } from '../../worker-orchestration/src/worker-orchestration-service.js';

export class WorkerOrchestrationAdapter {
  constructor({
    capabilityRegistryService,
    metricsService = null,
    memoryService = null,
    performanceService = null,
    workerExecutor = null,
    service = null,
  }) {
    this.capabilityRegistryService = capabilityRegistryService;
    this.service = service ?? new WorkerOrchestrationService({
      capabilityRegistry: this.capabilityRegistryService,
      workerExecutor: workerExecutor ?? undefined,
      metricsAdapter: metricsService,
      memoryAdapter: memoryService,
      performanceAdapter: performanceService,
    });
  }

  registerWorker(workerMetadata) {
    return this.service.registerWorker(workerMetadata);
  }

  async executeApprovedWorkflow({ workflowId, requestId, authorization, executionPlan }) {
    if (!authorization?.authorized) {
      return {
        executed: false,
        reason: 'Workflow not authorized for execution',
      };
    }

    return this.service.coordinateWorkflow({
      workflowId,
      requestId,
      authorization,
      workItems: executionPlan,
    });
  }

  getWorkerStatus(workerId) {
    return this.service.getWorkerStatus(workerId);
  }

  getWorkflowStatus(workflowExecutionId) {
    return this.service.getWorkflowStatus(workflowExecutionId);
  }
}
