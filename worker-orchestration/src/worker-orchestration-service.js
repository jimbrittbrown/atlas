import { WorkerOrchestrationLogger } from './worker-orchestration-logger.js';
import { WorkerOrchestrationManager } from './worker-orchestration-manager.js';
import { WorkerOrchestrationRecorder } from './worker-orchestration-recorder.js';
import { WorkerOrchestrationRepository } from './worker-orchestration-repository.js';
import { WorkerOrchestrationRetrieval } from './worker-orchestration-retrieval.js';
import { WorkflowExecutionState } from './models.js';

const defaultWorkerExecutor = {
  async execute(worker, workItem) {
    return {
      workerId: worker.id,
      workItemId: workItem.id,
      status: 'completed',
      output: { acknowledged: true },
    };
  },
};

export class WorkerOrchestrationService {
  constructor({
    repository = new WorkerOrchestrationRepository(),
    recorder = new WorkerOrchestrationRecorder(),
    manager = null,
    retrieval = null,
    logger = new WorkerOrchestrationLogger(),
    capabilityRegistry,
    workerExecutor = defaultWorkerExecutor,
    metricsAdapter = null,
    memoryAdapter = null,
    performanceAdapter = null,
  } = {}) {
    this.repository = repository;
    this.recorder = recorder;
    this.manager = manager ?? new WorkerOrchestrationManager(this.repository, this.recorder);
    this.retrieval = retrieval ?? new WorkerOrchestrationRetrieval(this.repository);
    this.logger = logger;
    this.capabilityRegistry = capabilityRegistry;
    this.workerExecutor = workerExecutor;
    this.metricsAdapter = metricsAdapter;
    this.memoryAdapter = memoryAdapter;
    this.performanceAdapter = performanceAdapter;
  }

  registerWorker(workerMetadata) {
    const worker = this.manager.registerWorker(workerMetadata);
    this.logger.log({ message: 'Worker registered', workerId: worker.id, capability: worker.capability, timestamp: new Date().toISOString() });
    return worker;
  }

  discoverWorkers(query = {}) {
    const workers = this.manager.discoverWorkers(query, this.capabilityRegistry);
    this.logger.log({ message: 'Workers discovered via capability registry', count: workers.length, query, timestamp: new Date().toISOString() });
    return workers;
  }

  selectWorker(selectionContext) {
    const worker = this.manager.selectWorker(selectionContext, this.capabilityRegistry);
    this.logger.log({ message: 'Worker selected', workerId: worker.id, capability: worker.capability, timestamp: new Date().toISOString() });
    return worker;
  }

  async assignWork(assignmentRequest) {
    if (!assignmentRequest.authorization?.authorized) {
      throw new Error('Work assignment requires approved authorization');
    }

    const workItem = this.recorder.createWorkItem(assignmentRequest.workItem);
    const assignment = await this.manager.dispatchWork({
      workItem,
      capabilityRegistry: this.capabilityRegistry,
      workerExecutor: this.workerExecutor,
    });

    await this.recordExecutionResult({
      workflowId: workItem.workflowId,
      requestId: workItem.requestId,
      assignment,
    });

    return assignment;
  }

  async coordinateWorkflow(coordinationPlan) {
    const execution = this.manager.beginWorkflowExecution({
      workflowId: coordinationPlan.workflowId,
      requestId: coordinationPlan.requestId,
    });

    this.recorder.transitionExecution(execution, WorkflowExecutionState.DISPATCHING);
    this.repository.updateExecution(execution);

    const workItems = coordinationPlan.workItems ?? [];
    const stages = new Map();
    for (const item of workItems) {
      const stage = item.stage ?? 0;
      if (!stages.has(stage)) {
        stages.set(stage, []);
      }
      stages.get(stage).push(item);
    }

    const orderedStages = [...stages.keys()].sort((a, b) => a - b);
    const allAssignments = [];

    for (const stageKey of orderedStages) {
      const stageItems = stages.get(stageKey);

      for (const item of stageItems) {
        const missingDependencies = (item.dependencies ?? []).filter((dependencyId) => {
          const dependency = allAssignments.find((assignment) => assignment.workItem.id === dependencyId);
          return !dependency || dependency.state.value !== 'COMPLETED';
        });

        if (missingDependencies.length > 0) {
          throw new Error(`Unsatisfied dependencies for work item ${item.id}: ${missingDependencies.join(', ')}`);
        }
      }

      const stageAssignments = await Promise.all(stageItems.map((item) => this.assignWork({
        authorization: coordinationPlan.authorization,
        workItem: item,
      })));

      allAssignments.push(...stageAssignments);

      const failedInStage = stageAssignments.some((assignment) => assignment.state.value === 'FAILED');
      if (failedInStage) {
        break;
      }
    }

    const result = this.manager.updateWorkflowExecution(execution, allAssignments);
    this.logger.log({ message: 'Workflow execution coordinated', workflowExecutionId: execution.id, state: result.state.value, timestamp: new Date().toISOString() });
    return result;
  }

  monitorExecution(workflowExecutionId) {
    return this.retrieval.monitorExecution(workflowExecutionId);
  }

  async retryWork(retryRequest) {
    const assignment = await this.manager.retryWork({
      assignmentId: retryRequest.assignmentId,
      capabilityRegistry: this.capabilityRegistry,
      workerExecutor: this.workerExecutor,
    });
    await this.recordExecutionResult({
      workflowId: assignment.workItem.workflowId,
      requestId: assignment.workItem.requestId,
      assignment,
      retry: true,
    });
    return assignment;
  }

  cancelWork(cancelRequest) {
    const assignment = this.manager.cancelWork(cancelRequest);
    this.logger.log({ message: 'Work cancelled', assignmentId: assignment.id, reason: cancelRequest.reason ?? 'Cancelled', timestamp: new Date().toISOString() });
    return assignment;
  }

  getWorkerStatus(workerId) {
    return this.retrieval.getWorkerStatus(workerId);
  }

  getWorkflowStatus(workflowExecutionId) {
    return this.retrieval.getWorkflowStatus(workflowExecutionId);
  }

  async recordExecutionResult({ workflowId, requestId, assignment, retry = false }) {
    const status = assignment.state.value;
    const durationMs = assignment.startedAt && assignment.finishedAt
      ? Math.max(0, new Date(assignment.finishedAt).getTime() - new Date(assignment.startedAt).getTime())
      : 0;

    if (this.metricsAdapter) {
      this.metricsAdapter.recordMetricEvent({
        name: retry ? 'worker_execution_retry' : 'worker_execution_result',
        category: status === 'FAILED' ? 'Error Metrics' : 'Service Metrics',
        value: durationMs,
        unit: 'ms',
        status: status.toLowerCase(),
        retryCount: Math.max(0, assignment.attempt - 1),
        metadata: {
          workflowId,
          requestId,
          service: 'worker-orchestration-service',
          operation: 'execute-work-item',
          source: 'worker-orchestration',
          tags: ['worker-orchestration', status.toLowerCase()],
        },
      });
    }

    if (this.memoryAdapter) {
      this.memoryAdapter.recordWorkflowHistory({
        title: `Worker execution result ${assignment.id}`,
        summary: `Worker ${assignment.workerId} finished with status ${status}`,
        content: JSON.stringify({
          assignmentId: assignment.id,
          workerId: assignment.workerId,
          status,
          attempt: assignment.attempt,
          error: assignment.error,
          result: assignment.result,
        }),
        metadata: {
          workflowId,
          requestId,
          source: 'worker-orchestration-service',
          createdBy: 'worker-orchestration',
          tags: ['worker-orchestration', status.toLowerCase()],
        },
      });
    }

    if (this.performanceAdapter) {
      this.performanceAdapter.recordExecution({
        workflowId,
        requestId,
        workerId: assignment.workerId,
        assignmentId: assignment.id,
        status,
        durationMs,
        retryCount: Math.max(0, assignment.attempt - 1),
      });
    }

    this.logger.log({ message: 'Execution result recorded', assignmentId: assignment.id, status, timestamp: new Date().toISOString() });
  }

  getHistory() {
    return this.retrieval.getHistory();
  }
}
