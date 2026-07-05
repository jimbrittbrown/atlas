export class WorkerState {
  static ACTIVE = new WorkerState('ACTIVE');
  static BUSY = new WorkerState('BUSY');
  static OFFLINE = new WorkerState('OFFLINE');
  static DRAINED = new WorkerState('DRAINED');

  static all() {
    return [WorkerState.ACTIVE, WorkerState.BUSY, WorkerState.OFFLINE, WorkerState.DRAINED];
  }

  static fromValue(value) {
    const state = WorkerState.all().find((item) => item.value === value);
    if (!state) {
      throw new Error(`Unknown worker state: ${value}`);
    }
    return state;
  }

  constructor(value) {
    this.value = value;
  }
}

export class AssignmentState {
  static PENDING = new AssignmentState('PENDING');
  static DISPATCHED = new AssignmentState('DISPATCHED');
  static RUNNING = new AssignmentState('RUNNING');
  static COMPLETED = new AssignmentState('COMPLETED');
  static FAILED = new AssignmentState('FAILED');
  static RETRYING = new AssignmentState('RETRYING');
  static CANCELLED = new AssignmentState('CANCELLED');

  static all() {
    return [
      AssignmentState.PENDING,
      AssignmentState.DISPATCHED,
      AssignmentState.RUNNING,
      AssignmentState.COMPLETED,
      AssignmentState.FAILED,
      AssignmentState.RETRYING,
      AssignmentState.CANCELLED,
    ];
  }

  static fromValue(value) {
    const state = AssignmentState.all().find((item) => item.value === value);
    if (!state) {
      throw new Error(`Unknown assignment state: ${value}`);
    }
    return state;
  }

  constructor(value) {
    this.value = value;
  }
}

export class WorkflowExecutionState {
  static NEW = new WorkflowExecutionState('NEW');
  static DISPATCHING = new WorkflowExecutionState('DISPATCHING');
  static RUNNING = new WorkflowExecutionState('RUNNING');
  static COMPLETED = new WorkflowExecutionState('COMPLETED');
  static FAILED = new WorkflowExecutionState('FAILED');
  static CANCELLED = new WorkflowExecutionState('CANCELLED');

  static all() {
    return [
      WorkflowExecutionState.NEW,
      WorkflowExecutionState.DISPATCHING,
      WorkflowExecutionState.RUNNING,
      WorkflowExecutionState.COMPLETED,
      WorkflowExecutionState.FAILED,
      WorkflowExecutionState.CANCELLED,
    ];
  }

  static fromValue(value) {
    const state = WorkflowExecutionState.all().find((item) => item.value === value);
    if (!state) {
      throw new Error(`Unknown workflow execution state: ${value}`);
    }
    return state;
  }

  constructor(value) {
    this.value = value;
  }
}

export class WorkerMetadata {
  constructor({
    id,
    name,
    capability,
    version = 'v1.0',
    status = WorkerState.ACTIVE,
    maxConcurrency = 1,
    currentLoad = 0,
    lastHeartbeat = new Date().toISOString(),
    tags = [],
  }) {
    this.id = id;
    this.name = name;
    this.capability = capability;
    this.version = version;
    this.status = status;
    this.maxConcurrency = maxConcurrency;
    this.currentLoad = currentLoad;
    this.lastHeartbeat = lastHeartbeat;
    this.tags = tags;
  }
}

export class WorkItem {
  constructor({
    id,
    workflowId,
    requestId,
    capability,
    payload = {},
    dependencies = [],
    maxRetries = 2,
    timeoutMs = 120000,
    stage = 0,
  }) {
    this.id = id;
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.capability = capability;
    this.payload = payload;
    this.dependencies = dependencies;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
    this.stage = stage;
  }
}

export class WorkAssignment {
  constructor({
    id,
    workItem,
    workerId,
    state = AssignmentState.PENDING,
    attempt = 1,
    error = null,
    result = null,
    startedAt = null,
    finishedAt = null,
    events = [],
  }) {
    this.id = id;
    this.workItem = workItem;
    this.workerId = workerId;
    this.state = state;
    this.attempt = attempt;
    this.error = error;
    this.result = result;
    this.startedAt = startedAt;
    this.finishedAt = finishedAt;
    this.events = events;
  }
}

export class WorkflowExecutionRecord {
  constructor({
    id,
    workflowId,
    requestId,
    state = WorkflowExecutionState.NEW,
    assignmentIds = [],
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
    summary = {},
  }) {
    this.id = id;
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.state = state;
    this.assignmentIds = assignmentIds;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.summary = summary;
  }
}

export class WorkerQuery {
  constructor({ capability = null, status = null, tags = [] } = {}) {
    this.capability = capability;
    this.status = status;
    this.tags = tags;
  }
}

export class OrchestrationResult {
  constructor({ workflowExecutionId, state, completed = 0, failed = 0, cancelled = 0, assignments = [] }) {
    this.workflowExecutionId = workflowExecutionId;
    this.state = state;
    this.completed = completed;
    this.failed = failed;
    this.cancelled = cancelled;
    this.assignments = assignments;
  }
}
