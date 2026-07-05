export class WorkflowState {
  static NEW = new WorkflowState('NEW');
  static INTENT_ANALYSIS = new WorkflowState('INTENT_ANALYSIS');
  static WORKFLOW_PLANNING = new WorkflowState('WORKFLOW_PLANNING');
  static AWAITING_RESEARCH = new WorkflowState('AWAITING_RESEARCH');
  static RESEARCH_IN_PROGRESS = new WorkflowState('RESEARCH_IN_PROGRESS');
  static RESEARCH_COMPLETE = new WorkflowState('RESEARCH_COMPLETE');
  static AWAITING_INTELLIGENCE_REVIEW = new WorkflowState('AWAITING_INTELLIGENCE_REVIEW');
  static INTELLIGENCE_REVIEW_IN_PROGRESS = new WorkflowState('INTELLIGENCE_REVIEW_IN_PROGRESS');
  static INTELLIGENCE_COMPLETE = new WorkflowState('INTELLIGENCE_COMPLETE');
  static AWAITING_CEO_APPROVAL = new WorkflowState('AWAITING_CEO_APPROVAL');
  static APPROVED = new WorkflowState('APPROVED');
  static EXECUTION_QUEUED = new WorkflowState('EXECUTION_QUEUED');
  static EXECUTION_IN_PROGRESS = new WorkflowState('EXECUTION_IN_PROGRESS');
  static EXECUTION_COMPLETE = new WorkflowState('EXECUTION_COMPLETE');
  static METRICS_COLLECTION = new WorkflowState('METRICS_COLLECTION');
  static PERFORMANCE_ANALYSIS = new WorkflowState('PERFORMANCE_ANALYSIS');
  static MEMORY_UPDATE = new WorkflowState('MEMORY_UPDATE');
  static STANDARDS_REVIEW = new WorkflowState('STANDARDS_REVIEW');
  static COMPLETED = new WorkflowState('COMPLETED');
  static REJECTED = new WorkflowState('REJECTED');
  static PAUSED = new WorkflowState('PAUSED');
  static WAITING_FOR_INPUT = new WorkflowState('WAITING_FOR_INPUT');
  static FAILED = new WorkflowState('FAILED');
  static CANCELLED = new WorkflowState('CANCELLED');

  static all() {
    return [
      WorkflowState.NEW,
      WorkflowState.INTENT_ANALYSIS,
      WorkflowState.WORKFLOW_PLANNING,
      WorkflowState.AWAITING_RESEARCH,
      WorkflowState.RESEARCH_IN_PROGRESS,
      WorkflowState.RESEARCH_COMPLETE,
      WorkflowState.AWAITING_INTELLIGENCE_REVIEW,
      WorkflowState.INTELLIGENCE_REVIEW_IN_PROGRESS,
      WorkflowState.INTELLIGENCE_COMPLETE,
      WorkflowState.AWAITING_CEO_APPROVAL,
      WorkflowState.APPROVED,
      WorkflowState.EXECUTION_QUEUED,
      WorkflowState.EXECUTION_IN_PROGRESS,
      WorkflowState.EXECUTION_COMPLETE,
      WorkflowState.METRICS_COLLECTION,
      WorkflowState.PERFORMANCE_ANALYSIS,
      WorkflowState.MEMORY_UPDATE,
      WorkflowState.STANDARDS_REVIEW,
      WorkflowState.COMPLETED,
      WorkflowState.REJECTED,
      WorkflowState.PAUSED,
      WorkflowState.WAITING_FOR_INPUT,
      WorkflowState.FAILED,
      WorkflowState.CANCELLED,
    ];
  }

  static fromValue(value) {
    const match = WorkflowState.all().find((state) => state.value === value);
    if (!match) {
      throw new Error(`Unknown workflow state: ${value}`);
    }
    return match;
  }

  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export class WorkflowTransition {
  constructor(from, to) {
    this.from = from;
    this.to = to;
  }

  toString() {
    return `${this.from.value} -> ${this.to.value}`;
  }
}

export class ExecutiveRequest {
  constructor(id, requestType, payload, createdAt) {
    this.id = id;
    this.requestType = requestType;
    this.payload = payload;
    this.createdAt = createdAt;
  }
}

export class ExecutiveResponse {
  constructor(workflowId, state, message) {
    this.workflowId = workflowId;
    this.state = state;
    this.message = message;
  }
}

export class WorkflowContext {
  constructor(workflowId, requestId, state, createdAt, updatedAt, metadata = {}) {
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.state = state;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.metadata = metadata;
  }
}

export class WorkflowInstance {
  constructor(id, requestId, context) {
    this.id = id;
    this.requestId = requestId;
    this.context = context;
  }

  get state() {
    return this.context.state;
  }

  set state(nextState) {
    this.context.state = nextState;
  }
}

export class WorkflowEvent {
  constructor(workflowId, state, message, timestamp) {
    this.workflowId = workflowId;
    this.state = state;
    this.message = message;
    this.timestamp = timestamp;
  }
}
