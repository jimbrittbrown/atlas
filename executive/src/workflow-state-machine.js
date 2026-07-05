import { WorkflowState } from './models.js';

export class DefaultWorkflowStateMachine {
  canTransition(from, to) {
    if (!WorkflowState.all().some((state) => state.value === from.value) || !WorkflowState.all().some((state) => state.value === to.value)) {
      return false;
    }

    const allowed = {
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

    return allowed[from.value]?.includes(to.value) ?? false;
  }

  transitionState(current, next) {
    if (!this.canTransition(current, next)) {
      throw new Error(`Invalid state transition: ${current.value} -> ${next.value}`);
    }

    return next;
  }
}
