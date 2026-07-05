import { ResearchStatus } from './models.js';

export class ResearchStateMachine {
  canTransition(from, to) {
    if (!ResearchStatus.all().some((state) => state.value === from.value) || !ResearchStatus.all().some((state) => state.value === to.value)) {
      return false;
    }

    const allowed = {
      NEW: ['QUEUED'],
      QUEUED: ['RUNNING', 'PAUSED', 'CANCELLED'],
      RUNNING: ['COLLECTING_EVIDENCE', 'FAILED', 'CANCELLED'],
      COLLECTING_EVIDENCE: ['ANALYZING', 'FAILED', 'PAUSED', 'CANCELLED'],
      ANALYZING: ['GENERATING_REPORT', 'FAILED', 'PAUSED', 'CANCELLED'],
      GENERATING_REPORT: ['COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED'],
      COMPLETED: [],
      FAILED: [],
      PAUSED: ['QUEUED', 'RUNNING'],
      WAITING_FOR_INPUT: ['QUEUED', 'CANCELLED'],
      CANCELLED: [],
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
