export class WorkerOrchestrationRetrieval {
  constructor(repository) {
    this.repository = repository;
  }

  getWorkerStatus(workerId) {
    const worker = this.repository.getWorker(workerId);
    if (!worker) {
      throw new Error(`Unknown worker: ${workerId}`);
    }
    return worker;
  }

  getWorkflowStatus(workflowExecutionId) {
    const execution = this.repository.getExecution(workflowExecutionId);
    if (!execution) {
      throw new Error(`Unknown workflow execution: ${workflowExecutionId}`);
    }
    const assignments = this.repository.getAssignmentsByWorkflow(execution.workflowId);
    return { execution, assignments };
  }

  monitorExecution(workflowExecutionId) {
    return this.getWorkflowStatus(workflowExecutionId);
  }

  getHistory() {
    return this.repository.getHistory();
  }
}
