import { BusinessState, FactoryMetrics } from './models.js';

const activeStates = new Set([
  BusinessState.OPPORTUNITY,
  BusinessState.RESEARCH,
  BusinessState.VALIDATION,
  BusinessState.APPROVAL,
  BusinessState.PRODUCTION_PLANNING,
  BusinessState.WORKER_ASSIGNMENT,
  BusinessState.MVP_BUILD,
  BusinessState.LAUNCH,
  BusinessState.MARKETING,
  BusinessState.METRICS,
  BusinessState.PERFORMANCE_INTELLIGENCE,
  BusinessState.ATLAS_INSTITUTE_LEARNING,
  BusinessState.OPTIMIZATION,
  BusinessState.SCALE,
]);

export class BusinessFactoryManager {
  constructor(repository, recorder) {
    this.repository = repository;
    this.recorder = recorder;
  }

  createBusiness(payload) {
    const record = this.recorder.createBusinessRecord(payload);
    return this.repository.create(record);
  }

  buildPipeline({ businessId, pipelineTemplate = null }) {
    const business = this.repository.getById(businessId);
    if (!business) {
      throw new Error(`Unknown business: ${businessId}`);
    }

    business.pipeline = this.recorder.createPipeline(pipelineTemplate ?? undefined);
    this.recorder.transition(business, BusinessState.PRODUCTION_PLANNING);
    return this.repository.update(business);
  }

  assignPipeline({ businessId, workflowExecutionId = null }) {
    const business = this.repository.getById(businessId);
    if (!business) {
      throw new Error(`Unknown business: ${businessId}`);
    }

    business.assignedWorkflowExecutionId = workflowExecutionId;
    this.recorder.transition(business, BusinessState.WORKER_ASSIGNMENT);
    return this.repository.update(business);
  }

  launchBusiness({ businessId, metadata = {} }) {
    const business = this.repository.getById(businessId);
    if (!business) {
      throw new Error(`Unknown business: ${businessId}`);
    }

    this.recorder.transition(business, BusinessState.COMPLETED, metadata);
    return this.repository.update(business);
  }

  setPaused({ businessId, reason = 'Paused' }) {
    const business = this.repository.getById(businessId);
    if (!business) {
      throw new Error(`Unknown business: ${businessId}`);
    }

    this.recorder.transition(business, BusinessState.PAUSED, { pauseReason: reason });
    return this.repository.update(business);
  }

  setResumed({ businessId }) {
    const business = this.repository.getById(businessId);
    if (!business) {
      throw new Error(`Unknown business: ${businessId}`);
    }

    this.recorder.transition(business, BusinessState.PRODUCTION_PLANNING, { resumed: true });
    return this.repository.update(business);
  }

  setArchived({ businessId, reason = 'Archived' }) {
    const business = this.repository.getById(businessId);
    if (!business) {
      throw new Error(`Unknown business: ${businessId}`);
    }

    this.recorder.transition(business, BusinessState.ARCHIVED, { archiveReason: reason });
    return this.repository.update(business);
  }

  getFactoryMetrics() {
    const businesses = this.repository.list();
    const total = businesses.length;
    const paused = businesses.filter((item) => item.state === BusinessState.PAUSED).length;
    const archived = businesses.filter((item) => item.state === BusinessState.ARCHIVED).length;
    const completed = businesses.filter((item) => item.state === BusinessState.COMPLETED).length;
    const active = businesses.filter((item) => activeStates.has(item.state)).length;

    return new FactoryMetrics({ total, active, paused, archived, completed });
  }
}
