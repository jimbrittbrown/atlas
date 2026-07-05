export type WorkflowState =
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

export interface ExecutiveRequest {
  id: string;
  requestType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ExecutiveResponse {
  workflowId: string;
  state: WorkflowState;
  message: string;
}

export interface WorkflowContext {
  workflowId: string;
  requestId: string;
  state: WorkflowState;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface WorkflowInstance {
  id: string;
  requestId: string;
  state: WorkflowState;
  context: WorkflowContext;
}

export interface WorkflowEvent {
  workflowId: string;
  state: WorkflowState;
  message: string;
  timestamp: string;
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
