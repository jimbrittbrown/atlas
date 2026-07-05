export class WorkerOrchestrationRepository {
  constructor() {
    this.workers = [];
    this.assignments = [];
    this.executions = [];
    this.history = [];
  }

  addWorker(worker) {
    this.workers.push(worker);
    this.history.push({ action: 'WORKER_REGISTERED', workerId: worker.id, timestamp: new Date().toISOString() });
    return worker;
  }

  updateWorker(worker) {
    const index = this.workers.findIndex((item) => item.id === worker.id);
    if (index < 0) {
      throw new Error(`Unknown worker: ${worker.id}`);
    }
    this.workers[index] = worker;
    this.history.push({ action: 'WORKER_UPDATED', workerId: worker.id, timestamp: new Date().toISOString() });
    return worker;
  }

  getWorker(workerId) {
    return this.workers.find((worker) => worker.id === workerId) ?? null;
  }

  listWorkers() {
    return [...this.workers];
  }

  addAssignment(assignment) {
    this.assignments.push(assignment);
    this.history.push({ action: 'ASSIGNMENT_CREATED', assignmentId: assignment.id, timestamp: new Date().toISOString() });
    return assignment;
  }

  updateAssignment(assignment) {
    const index = this.assignments.findIndex((item) => item.id === assignment.id);
    if (index < 0) {
      throw new Error(`Unknown assignment: ${assignment.id}`);
    }
    this.assignments[index] = assignment;
    this.history.push({ action: 'ASSIGNMENT_UPDATED', assignmentId: assignment.id, state: assignment.state.value, timestamp: new Date().toISOString() });
    return assignment;
  }

  getAssignment(assignmentId) {
    return this.assignments.find((assignment) => assignment.id === assignmentId) ?? null;
  }

  getAssignmentsByWorkflow(workflowId) {
    return this.assignments.filter((assignment) => assignment.workItem.workflowId === workflowId);
  }

  addExecution(execution) {
    this.executions.push(execution);
    this.history.push({ action: 'EXECUTION_CREATED', executionId: execution.id, workflowId: execution.workflowId, timestamp: new Date().toISOString() });
    return execution;
  }

  updateExecution(execution) {
    const index = this.executions.findIndex((item) => item.id === execution.id);
    if (index < 0) {
      throw new Error(`Unknown workflow execution: ${execution.id}`);
    }
    this.executions[index] = execution;
    this.history.push({ action: 'EXECUTION_UPDATED', executionId: execution.id, state: execution.state.value, timestamp: new Date().toISOString() });
    return execution;
  }

  getExecution(executionId) {
    return this.executions.find((execution) => execution.id === executionId) ?? null;
  }

  getExecutionByWorkflow(workflowId) {
    return this.executions.find((execution) => execution.workflowId === workflowId) ?? null;
  }

  getHistory() {
    return [...this.history];
  }
}
