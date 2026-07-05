import { BusinessPipelineStage, BusinessRecord, BusinessState } from './models.js';

const defaultPipelineTemplate = [
  { name: 'Opportunity', state: BusinessState.OPPORTUNITY },
  { name: 'Research', state: BusinessState.RESEARCH },
  { name: 'Validation', state: BusinessState.VALIDATION },
  { name: 'Approval', state: BusinessState.APPROVAL },
  { name: 'Production Planning', state: BusinessState.PRODUCTION_PLANNING },
  { name: 'Worker Assignment', state: BusinessState.WORKER_ASSIGNMENT },
  { name: 'MVP Build', state: BusinessState.MVP_BUILD },
  { name: 'Launch', state: BusinessState.LAUNCH },
  { name: 'Marketing', state: BusinessState.MARKETING },
  { name: 'Metrics', state: BusinessState.METRICS },
  { name: 'Performance Intelligence', state: BusinessState.PERFORMANCE_INTELLIGENCE },
  { name: 'Atlas Institute Learning', state: BusinessState.ATLAS_INSTITUTE_LEARNING },
  { name: 'Optimization', state: BusinessState.OPTIMIZATION },
  { name: 'Scale', state: BusinessState.SCALE },
];

const nextBusinessId = () => `business-${Math.random().toString(36).slice(2, 10)}`;

export class BusinessFactoryRecorder {
  createBusinessRecord({ opportunityId, name, objective, metadata = {} }) {
    if (!opportunityId || !name || !objective) {
      throw new Error('Business requires opportunityId, name, and objective');
    }

    return new BusinessRecord({
      id: nextBusinessId(),
      opportunityId,
      name,
      objective,
      state: BusinessState.OPPORTUNITY,
      pipeline: this.createPipeline(),
      metadata,
    });
  }

  createPipeline(template = defaultPipelineTemplate) {
    return template.map((stage, index) => new BusinessPipelineStage({
      name: stage.name,
      order: index,
      state: stage.state,
      metadata: stage.metadata ?? {},
    }));
  }

  transition(record, state, metadata = {}) {
    record.state = state;
    record.metadata = {
      ...record.metadata,
      ...metadata,
    };
    record.updatedAt = new Date().toISOString();
    return record;
  }
}
