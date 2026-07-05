import type {
  ExecutiveRequest,
  WorkflowContext,
  WorkflowInstance,
  WorkflowState,
} from './models.js';

export interface WorkflowManager {
  createWorkflow(request: ExecutiveRequest): WorkflowInstance;
  transition(workflowId: string, nextState: WorkflowState): WorkflowInstance;
  getWorkflow(workflowId: string): WorkflowInstance | undefined;
}

export interface WorkflowStateMachine {
  canTransition(from: WorkflowState, to: WorkflowState): boolean;
  transitionState(current: WorkflowState, next: WorkflowState): WorkflowState;
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

export interface ResearchService {
  execute(request: ExecutiveRequest): Promise<void>;
}

export interface ApprovalService {
  approve(request: ExecutiveRequest): Promise<boolean>;
}

export interface MemoryService {
  persist(workflowId: string, context: WorkflowContext): Promise<void>;
}

export interface MetricsService {
  collect(workflowId: string): Promise<void>;
}

export interface PerformanceIntelligenceService {
  analyze(workflowId: string): Promise<void>;
}

export interface AtlasInstituteService {
  review(workflowId: string): Promise<void>;
}

export interface StandardsRepositoryService {
  review(workflowId: string): Promise<void>;
}

export interface OpenClawIntegration {
  route(workflowId: string, request: ExecutiveRequest): Promise<void>;
}
