import { AssignmentState, OrchestrationResult, WorkflowExecutionState, WorkerQuery, WorkerState } from './models.js';

export class WorkerOrchestrationManager {
  constructor(repository, recorder) {
    this.repository = repository;
    this.recorder = recorder;
  }

  registerWorker(payload) {
    if (this.repository.getWorker(payload.id)) {
      throw new Error(`Worker already registered: ${payload.id}`);
    }
    return this.repository.addWorker(this.recorder.createWorker(payload));
  }

  discoverWorkers(query = {}, capabilityRegistry) {
    const workerQuery = query instanceof WorkerQuery ? query : new WorkerQuery(query);
    const registeredWorkers = this.repository.listWorkers();

    if (!capabilityRegistry || typeof capabilityRegistry.searchCapabilities !== 'function') {
      throw new Error('Capability Registry is required for worker discovery');
    }

    const capabilitySearch = capabilityRegistry.searchCapabilities({ search: workerQuery.capability ?? '' });
    const allowedCapabilities = new Set(capabilitySearch.records.map((record) => record.metadata.name));

    return registeredWorkers.filter((worker) => {
      if (!allowedCapabilities.has(worker.capability)) {
        return false;
      }
      if (workerQuery.status && worker.status.value !== workerQuery.status) {
        return false;
      }
      if (workerQuery.capability && worker.capability !== workerQuery.capability) {
        return false;
      }
      if (workerQuery.tags.length > 0 && !workerQuery.tags.every((tag) => worker.tags.includes(tag))) {
        return false;
      }
      return true;
    });
  }

  selectWorker(selectionContext, capabilityRegistry) {
    const candidates = this.discoverWorkers({
      capability: selectionContext.capability,
      status: WorkerState.ACTIVE.value,
      tags: selectionContext.tags ?? [],
    }, capabilityRegistry).filter((worker) => worker.currentLoad < worker.maxConcurrency);

    if (candidates.length === 0) {
      throw new Error(`No available workers for capability: ${selectionContext.capability}`);
    }

    return candidates.sort((a, b) => a.currentLoad - b.currentLoad)[0];
  }

  beginWorkflowExecution({ workflowId, requestId }) {
    const existing = this.repository.getExecutionByWorkflow(workflowId);
    if (existing) {
      return existing;
    }

    const execution = this.recorder.createExecution({ workflowId, requestId });
    return this.repository.addExecution(execution);
  }

  async dispatchWork({ workItem, capabilityRegistry, workerExecutor }) {
    const selectedWorker = this.selectWorker({ capability: workItem.capability }, capabilityRegistry);
    const assignment = this.recorder.createAssignment({ workItem, workerId: selectedWorker.id });

    selectedWorker.currentLoad += 1;
    selectedWorker.status = WorkerState.BUSY;
    this.repository.updateWorker(selectedWorker);

    this.recorder.transitionAssignment(assignment, AssignmentState.DISPATCHED);
    this.recorder.transitionAssignment(assignment, AssignmentState.RUNNING);

    try {
      const executionResult = await workerExecutor.execute(selectedWorker, workItem);
      assignment.result = executionResult;
      this.recorder.transitionAssignment(assignment, AssignmentState.COMPLETED);
      this.repository.addAssignment(assignment);
    } catch (error) {
      assignment.error = error.message;
      this.recorder.transitionAssignment(assignment, AssignmentState.FAILED, { error: error.message });
      this.repository.addAssignment(assignment);
    } finally {
      selectedWorker.currentLoad = Math.max(0, selectedWorker.currentLoad - 1);
      selectedWorker.status = WorkerState.ACTIVE;
      this.repository.updateWorker(selectedWorker);
    }

    return assignment;
  }

  async retryWork({ assignmentId, capabilityRegistry, workerExecutor }) {
    const previous = this.repository.getAssignment(assignmentId);
    if (!previous) {
      throw new Error(`Unknown assignment: ${assignmentId}`);
    }
    if (previous.state.value !== AssignmentState.FAILED.value) {
      throw new Error('Retry is allowed only for failed assignments');
    }
    if (previous.attempt >= previous.workItem.maxRetries + 1) {
      throw new Error('Retry limit exceeded');
    }

    const retryWorkItem = previous.workItem;
    const nextAssignment = this.recorder.createAssignment({ workItem: retryWorkItem, workerId: previous.workerId, attempt: previous.attempt + 1 });
    this.recorder.transitionAssignment(nextAssignment, AssignmentState.RETRYING, { previousAssignmentId: previous.id });
    this.repository.addAssignment(nextAssignment);

    return this.dispatchWork({ workItem: retryWorkItem, capabilityRegistry, workerExecutor });
  }

  cancelWork({ assignmentId, reason = 'Cancelled' }) {
    const assignment = this.repository.getAssignment(assignmentId);
    if (!assignment) {
      throw new Error(`Unknown assignment: ${assignmentId}`);
    }
    this.recorder.transitionAssignment(assignment, AssignmentState.CANCELLED, { reason });
    return this.repository.updateAssignment(assignment);
  }

  updateWorkflowExecution(execution, assignments) {
    const completed = assignments.filter((item) => item.state.value === AssignmentState.COMPLETED.value).length;
    const failed = assignments.filter((item) => item.state.value === AssignmentState.FAILED.value).length;
    const cancelled = assignments.filter((item) => item.state.value === AssignmentState.CANCELLED.value).length;

    let nextState = WorkflowExecutionState.RUNNING;
    if (failed > 0) {
      nextState = WorkflowExecutionState.FAILED;
    } else if (cancelled > 0) {
      nextState = WorkflowExecutionState.CANCELLED;
    } else if (completed === assignments.length && assignments.length > 0) {
      nextState = WorkflowExecutionState.COMPLETED;
    }

    execution.assignmentIds = assignments.map((item) => item.id);
    this.recorder.transitionExecution(execution, nextState, { completed, failed, cancelled });
    this.repository.updateExecution(execution);

    return new OrchestrationResult({
      workflowExecutionId: execution.id,
      state: execution.state,
      completed,
      failed,
      cancelled,
      assignments,
    });
  }
}
