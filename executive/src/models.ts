export type WorkflowStateValue =
  | 'NEW'
  | 'INTENT_ANALYSIS'
  | 'WORKFLOW_PLANNING'
  | 'AWAITING_RESEARCH'
  | 'RESEARCH_IN_PROGRESS'
  | 'RESEARCH_COMPLETE'
  | 'AWAITING_INTELLIGENCE_REVIEW'
  | 'INTELLIGENCE_REVIEW_IN_PROGRESS'
  | 'INTELLIGENCE_COMPLETE'
  | 'AWAITING_CEO_APPROVAL'
  | 'APPROVED'
  | 'EXECUTION_QUEUED'
  | 'EXECUTION_IN_PROGRESS'
  | 'EXECUTION_COMPLETE'
  | 'METRICS_COLLECTION'
  | 'PERFORMANCE_ANALYSIS'
  | 'MEMORY_UPDATE'
  | 'STANDARDS_REVIEW'
  | 'COMPLETED'
  | 'REJECTED'
  | 'PAUSED'
  | 'WAITING_FOR_INPUT'
  | 'FAILED'
  | 'CANCELLED';

export class WorkflowState {
  static readonly NEW = new WorkflowState('NEW');
  static readonly INTENT_ANALYSIS = new WorkflowState('INTENT_ANALYSIS');
  static readonly WORKFLOW_PLANNING = new WorkflowState('WORKFLOW_PLANNING');
  static readonly AWAITING_RESEARCH = new WorkflowState('AWAITING_RESEARCH');
  static readonly RESEARCH_IN_PROGRESS = new WorkflowState('RESEARCH_IN_PROGRESS');
  static readonly RESEARCH_COMPLETE = new WorkflowState('RESEARCH_COMPLETE');
  static readonly AWAITING_INTELLIGENCE_REVIEW = new WorkflowState('AWAITING_INTELLIGENCE_REVIEW');
  static readonly INTELLIGENCE_REVIEW_IN_PROGRESS = new WorkflowState('INTELLIGENCE_REVIEW_IN_PROGRESS');
  static readonly INTELLIGENCE_COMPLETE = new WorkflowState('INTELLIGENCE_COMPLETE');
  static readonly AWAITING_CEO_APPROVAL = new WorkflowState('AWAITING_CEO_APPROVAL');
  static readonly APPROVED = new WorkflowState('APPROVED');
  static readonly EXECUTION_QUEUED = new WorkflowState('EXECUTION_QUEUED');
  static readonly EXECUTION_IN_PROGRESS = new WorkflowState('EXECUTION_IN_PROGRESS');
  static readonly EXECUTION_COMPLETE = new WorkflowState('EXECUTION_COMPLETE');
  static readonly METRICS_COLLECTION = new WorkflowState('METRICS_COLLECTION');
  static readonly PERFORMANCE_ANALYSIS = new WorkflowState('PERFORMANCE_ANALYSIS');
  static readonly MEMORY_UPDATE = new WorkflowState('MEMORY_UPDATE');
  static readonly STANDARDS_REVIEW = new WorkflowState('STANDARDS_REVIEW');
  static readonly COMPLETED = new WorkflowState('COMPLETED');
  static readonly REJECTED = new WorkflowState('REJECTED');
  static readonly PAUSED = new WorkflowState('PAUSED');
  static readonly WAITING_FOR_INPUT = new WorkflowState('WAITING_FOR_INPUT');
  static readonly FAILED = new WorkflowState('FAILED');
  static readonly CANCELLED = new WorkflowState('CANCELLED');

  static all(): WorkflowState[] {
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

  static fromValue(value: string): WorkflowState {
    const match = WorkflowState.all().find((state) => state.value === value);
    if (!match) {
      throw new Error(`Unknown workflow state: ${value}`);
    }
    return match;
  }

  private constructor(public readonly value: WorkflowStateValue) {}

  toString(): string {
    return this.value;
  }
}

export class WorkflowTransition {
  constructor(
    public readonly from: WorkflowState,
    public readonly to: WorkflowState,
  ) {}

  toString(): string {
    return `${this.from.value} -> ${this.to.value}`;
  }
}

export class ExecutiveRequest {
  constructor(
    public readonly id: string,
    public readonly requestType: string,
    public readonly payload: Record<string, unknown>,
    public readonly createdAt: string,
  ) {}
}

export class ExecutiveResponse {
  constructor(
    public readonly workflowId: string,
    public readonly state: WorkflowState,
    public readonly message: string,
  ) {}
}

export class WorkflowContext {
  constructor(
    public readonly workflowId: string,
    public readonly requestId: string,
    public state: WorkflowState,
    public readonly createdAt: string,
    public updatedAt: string,
    public readonly metadata: Record<string, unknown> = {},
  ) {}
}

export class WorkflowInstance {
  constructor(
    public readonly id: string,
    public readonly requestId: string,
    public readonly context: WorkflowContext,
  ) {}

  get state(): WorkflowState {
    return this.context.state;
  }

  set state(nextState: WorkflowState) {
    this.context.state = nextState;
  }
}

export class WorkflowEvent {
  constructor(
    public readonly workflowId: string,
    public readonly state: WorkflowState,
    public readonly message: string,
    public readonly timestamp: string,
  ) {}
}
