import {
  AssignmentState,
  WorkAssignment,
  WorkflowExecutionRecord,
  WorkflowExecutionState,
  WorkerMetadata,
  WorkerState,
  WorkItem,
} from './models.js';

export class WorkerOrchestrationRecorder {
  createWorker(payload) {
    if (!payload.id || !payload.name || !payload.capability) {
      throw new Error('Worker requires id, name, and capability');
    }

    return new WorkerMetadata({
      ...payload,
      status: payload.status instanceof WorkerState ? payload.status : WorkerState.fromValue(payload.status ?? 'ACTIVE'),
    });
  }

  createExecution({ workflowId, requestId }) {
    if (!workflowId || !requestId) {
      throw new Error('Execution requires workflowId and requestId');
    }

    return new WorkflowExecutionRecord({
      id: `execution-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      workflowId,
      requestId,
      state: WorkflowExecutionState.NEW,
    });
  }

  createWorkItem(payload) {
    if (!payload.id || !payload.workflowId || !payload.requestId || !payload.capability) {
      throw new Error('Work item requires id, workflowId, requestId, and capability');
    }
    return new WorkItem(payload);
  }

  createAssignment({ workItem, workerId, attempt = 1 }) {
    return new WorkAssignment({
      id: `assignment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      workItem,
      workerId,
      state: AssignmentState.PENDING,
      attempt,
      events: [{ state: AssignmentState.PENDING.value, timestamp: new Date().toISOString() }],
    });
  }

  transitionAssignment(assignment, nextState, details = {}) {
    assignment.state = nextState instanceof AssignmentState ? nextState : AssignmentState.fromValue(nextState);
    assignment.events.push({
      state: assignment.state.value,
      timestamp: new Date().toISOString(),
      ...details,
    });
    if (assignment.state.value === AssignmentState.RUNNING.value && !assignment.startedAt) {
      assignment.startedAt = new Date().toISOString();
    }
    if (
      [AssignmentState.COMPLETED.value, AssignmentState.FAILED.value, AssignmentState.CANCELLED.value].includes(assignment.state.value)
    ) {
      assignment.finishedAt = new Date().toISOString();
    }
    return assignment;
  }

  transitionExecution(execution, nextState, summary = {}) {
    execution.state = nextState instanceof WorkflowExecutionState ? nextState : WorkflowExecutionState.fromValue(nextState);
    execution.summary = { ...execution.summary, ...summary };
    execution.updatedAt = new Date().toISOString();
    return execution;
  }
}
