import type {
  ApprovalService,
  AtlasInstituteService,
  ExecutiveRequest,
  ExecutiveResponse,
  MemoryService,
  MetricsService,
  OpenClawIntegration,
  PerformanceIntelligenceService,
  ResearchService,
  StandardsRepositoryService,
  WorkflowContext,
  WorkflowInstance,
  WorkflowState,
} from './types.js';

export interface WorkflowManager {
  createWorkflow(request: ExecutiveRequest): WorkflowInstance;
  transition(workflowId: string, nextState: WorkflowState): WorkflowInstance;
  getWorkflow(workflowId: string): WorkflowInstance | undefined;
}

export interface RequestRouter {
  route(request: ExecutiveRequest, workflow: WorkflowInstance): Promise<void>;
}

export interface EventLogger {
  log(event: { workflowId: string; state: WorkflowState; message: string; timestamp: string }): void;
}

export interface NotificationManager {
  notify(workflowId: string, message: string): void;
}

export interface WorkflowStateMachine {
  canTransition(from: WorkflowState, to: WorkflowState): boolean;
  transitionState(current: WorkflowState, next: WorkflowState): WorkflowState;
}

export class DefaultWorkflowStateMachine implements WorkflowStateMachine {
  private static readonly states = new Set<WorkflowState>([
    'NEW',
    'INTENT_ANALYSIS',
    'WORKFLOW_PLANNING',
    'AWAITING_RESEARCH',
    'RESEARCH_IN_PROGRESS',
    'RESEARCH_COMPLETE',
    'AWAITING_INTELLIGENCE_REVIEW',
    'INTELLIGENCE_REVIEW_IN_PROGRESS',
    'INTELLIGENCE_COMPLETE',
    'AWAITING_CEO_APPROVAL',
    'APPROVED',
    'EXECUTION_QUEUED',
    'EXECUTION_IN_PROGRESS',
    'EXECUTION_COMPLETE',
    'METRICS_COLLECTION',
    'PERFORMANCE_ANALYSIS',
    'MEMORY_UPDATE',
    'STANDARDS_REVIEW',
    'COMPLETED',
    'REJECTED',
    'PAUSED',
    'WAITING_FOR_INPUT',
    'FAILED',
    'CANCELLED',
  ]);

  canTransition(from: WorkflowState, to: WorkflowState): boolean {
    if (!DefaultWorkflowStateMachine.states.has(from) || !DefaultWorkflowStateMachine.states.has(to)) {
      return false;
    }

    const allowed: Record<WorkflowState, WorkflowState[]> = {
      NEW: ['INTENT_ANALYSIS'],
      INTENT_ANALYSIS: ['WORKFLOW_PLANNING', 'REJECTED', 'CANCELLED'],
      WORKFLOW_PLANNING: ['AWAITING_RESEARCH', 'REJECTED', 'CANCELLED'],
      AWAITING_RESEARCH: ['RESEARCH_IN_PROGRESS', 'PAUSED', 'CANCELLED'],
      RESEARCH_IN_PROGRESS: ['RESEARCH_COMPLETE', 'FAILED', 'CANCELLED'],
      RESEARCH_COMPLETE: ['AWAITING_INTELLIGENCE_REVIEW', 'PAUSED'],
      AWAITING_INTELLIGENCE_REVIEW: ['INTELLIGENCE_REVIEW_IN_PROGRESS', 'PAUSED', 'CANCELLED'],
      INTELLIGENCE_REVIEW_IN_PROGRESS: ['INTELLIGENCE_COMPLETE', 'FAILED', 'CANCELLED'],
      INTELLIGENCE_COMPLETE: ['AWAITING_CEO_APPROVAL', 'PAUSED'],
      AWAITING_CEO_APPROVAL: ['APPROVED', 'REJECTED', 'PAUSED', 'WAITING_FOR_INPUT'],
      APPROVED: ['EXECUTION_QUEUED', 'CANCELLED'],
      EXECUTION_QUEUED: ['EXECUTION_IN_PROGRESS', 'CANCELLED'],
      EXECUTION_IN_PROGRESS: ['EXECUTION_COMPLETE', 'FAILED', 'CANCELLED'],
      EXECUTION_COMPLETE: ['METRICS_COLLECTION', 'CANCELLED'],
      METRICS_COLLECTION: ['PERFORMANCE_ANALYSIS', 'CANCELLED'],
      PERFORMANCE_ANALYSIS: ['MEMORY_UPDATE', 'CANCELLED'],
      MEMORY_UPDATE: ['STANDARDS_REVIEW', 'CANCELLED'],
      STANDARDS_REVIEW: ['COMPLETED', 'CANCELLED'],
      REJECTED: [],
      PAUSED: ['AWAITING_RESEARCH', 'AWAITING_INTELLIGENCE_REVIEW', 'AWAITING_CEO_APPROVAL', 'EXECUTION_QUEUED'],
      WAITING_FOR_INPUT: ['AWAITING_CEO_APPROVAL', 'CANCELLED'],
      FAILED: [],
      CANCELLED: [],
      COMPLETED: [],
    };

    return allowed[from]?.includes(to) ?? false;
  }

  transitionState(current: WorkflowState, next: WorkflowState): WorkflowState {
    if (!this.canTransition(current, next)) {
      throw new Error(`Invalid state transition: ${current} -> ${next}`);
    }

    return next;
  }
}

export class InMemoryWorkflowManager implements WorkflowManager {
  private readonly workflows = new Map<string, WorkflowInstance>();

  constructor(private readonly stateMachine: WorkflowStateMachine) {}

  createWorkflow(request: ExecutiveRequest): WorkflowInstance {
    const workflowId = `wf-${request.id}`;
    const now = new Date().toISOString();
    const context: WorkflowContext = {
      workflowId,
      requestId: request.id,
      state: 'NEW',
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    const workflow: WorkflowInstance = {
      id: workflowId,
      requestId: request.id,
      state: 'NEW',
      context,
    };

    this.workflows.set(workflowId, workflow);
    return workflow;
  }

  transition(workflowId: string, nextState: WorkflowState): WorkflowInstance {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow: ${workflowId}`);
    }

    workflow.state = this.stateMachine.transitionState(workflow.state, nextState);
    workflow.context.state = workflow.state;
    workflow.context.updatedAt = new Date().toISOString();
    return workflow;
  }

  getWorkflow(workflowId: string): WorkflowInstance | undefined {
    return this.workflows.get(workflowId);
  }
}

export class SimpleRequestRouter implements RequestRouter {
  constructor(
    private readonly researchService?: ResearchService,
    private readonly approvalService?: ApprovalService,
    private readonly memoryService?: MemoryService,
    private readonly metricsService?: MetricsService,
    private readonly performanceIntelligenceService?: PerformanceIntelligenceService,
    private readonly atlasInstituteService?: AtlasInstituteService,
    private readonly standardsRepositoryService?: StandardsRepositoryService,
    private readonly openClawIntegration?: OpenClawIntegration,
  ) {}

  async route(request: ExecutiveRequest, workflow: WorkflowInstance): Promise<void> {
    if (workflow.state === 'AWAITING_RESEARCH') {
      await this.researchService?.execute(request);
    }

    if (workflow.state === 'AWAITING_CEO_APPROVAL') {
      await this.approvalService?.approve(request);
    }

    if (workflow.state === 'MEMORY_UPDATE') {
      await this.memoryService?.persist(workflow.id, workflow.context);
    }

    if (workflow.state === 'METRICS_COLLECTION') {
      await this.metricsService?.collect(workflow.id);
    }

    if (workflow.state === 'PERFORMANCE_ANALYSIS') {
      await this.performanceIntelligenceService?.analyze(workflow.id);
    }

    if (workflow.state === 'STANDARDS_REVIEW') {
      await this.standardsRepositoryService?.review(workflow.id);
    }

    if (workflow.state === 'EXECUTION_QUEUED') {
      await this.openClawIntegration?.route(workflow.id, request);
    }
  }
}

export class DefaultEventLogger implements EventLogger {
  private readonly events: Array<{ workflowId: string; state: WorkflowState; message: string; timestamp: string }> = [];

  log(event: { workflowId: string; state: WorkflowState; message: string; timestamp: string }): void {
    this.events.push(event);
  }

  getEvents(): Array<{ workflowId: string; state: WorkflowState; message: string; timestamp: string }> {
    return this.events;
  }
}

export class DefaultNotificationManager implements NotificationManager {
  notify(workflowId: string, message: string): void {
    console.info(`[${workflowId}] ${message}`);
  }
}

export class ExecutiveService {
  constructor(
    private readonly workflowManager: WorkflowManager,
    private readonly stateMachine: WorkflowStateMachine,
    private readonly requestRouter: RequestRouter,
    private readonly eventLogger: EventLogger,
    private readonly notificationManager: NotificationManager,
  ) {}

  async handleRequest(request: ExecutiveRequest): Promise<ExecutiveResponse> {
    const workflow = this.workflowManager.createWorkflow(request);
    this.eventLogger.log({
      workflowId: workflow.id,
      state: workflow.state,
      message: 'Workflow created',
      timestamp: new Date().toISOString(),
    });

    const nextState = this.stateMachine.transitionState(workflow.state, 'INTENT_ANALYSIS');
    this.workflowManager.transition(workflow.id, nextState);
    this.eventLogger.log({
      workflowId: workflow.id,
      state: nextState,
      message: 'Transitioned to intent analysis',
      timestamp: new Date().toISOString(),
    });

    return {
      workflowId: workflow.id,
      state: workflow.context.state,
      message: 'Executive request accepted',
    };
  }

  async processWorkflow(workflowId: string, request: ExecutiveRequest): Promise<ExecutiveResponse> {
    const workflow = this.workflowManager.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow: ${workflowId}`);
    }

    this.workflowManager.transition(workflow.id, 'WORKFLOW_PLANNING');
    this.workflowManager.transition(workflow.id, 'AWAITING_RESEARCH');
    this.requestRouter.route(request, workflow);

    this.eventLogger.log({
      workflowId: workflow.id,
      state: workflow.context.state,
      message: 'Workflow processed',
      timestamp: new Date().toISOString(),
    });

    return {
      workflowId: workflow.id,
      state: workflow.context.state,
      message: 'Workflow processed',
    };
  }
}
