export const BusinessState = Object.freeze({
  OPPORTUNITY: 'OPPORTUNITY',
  RESEARCH: 'RESEARCH',
  VALIDATION: 'VALIDATION',
  APPROVAL: 'APPROVAL',
  PRODUCTION_PLANNING: 'PRODUCTION_PLANNING',
  WORKER_ASSIGNMENT: 'WORKER_ASSIGNMENT',
  MVP_BUILD: 'MVP_BUILD',
  LAUNCH: 'LAUNCH',
  MARKETING: 'MARKETING',
  METRICS: 'METRICS',
  PERFORMANCE_INTELLIGENCE: 'PERFORMANCE_INTELLIGENCE',
  ATLAS_INSTITUTE_LEARNING: 'ATLAS_INSTITUTE_LEARNING',
  OPTIMIZATION: 'OPTIMIZATION',
  SCALE: 'SCALE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  COMPLETED: 'COMPLETED',
});

export class BusinessPipelineStage {
  constructor({ name, order, state, metadata = {} }) {
    this.name = name;
    this.order = order;
    this.state = state;
    this.metadata = metadata;
  }
}

export class BusinessRecord {
  constructor({
    id,
    opportunityId,
    name,
    objective,
    state,
    pipeline,
    assignedWorkflowExecutionId = null,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString(),
  }) {
    this.id = id;
    this.opportunityId = opportunityId;
    this.name = name;
    this.objective = objective;
    this.state = state;
    this.pipeline = pipeline;
    this.assignedWorkflowExecutionId = assignedWorkflowExecutionId;
    this.metadata = metadata;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export class FactoryMetrics {
  constructor({ total, active, paused, archived, completed, generatedAt = new Date().toISOString() }) {
    this.total = total;
    this.active = active;
    this.paused = paused;
    this.archived = archived;
    this.completed = completed;
    this.generatedAt = generatedAt;
  }
}
