import { randomUUID } from 'node:crypto';

export const ExecutiveMissionOrchestratorStates = Object.freeze({
  QUEUED: 'QUEUED',
  VALIDATING: 'VALIDATING',
  ROUTING: 'ROUTING',
  RUNNING: 'RUNNING',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  WAITING_RETRY: 'WAITING_RETRY',
  PAUSED: 'PAUSED',
  ROLLED_BACK: 'ROLLED_BACK',
  TIMED_OUT: 'TIMED_OUT',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
});

export const RecoveryActions = Object.freeze({
  RETRY: 'RETRY',
  RESUME: 'RESUME',
  ROLLBACK: 'ROLLBACK',
  TIMEOUT: 'TIMEOUT',
  CANCEL: 'CANCEL'
});

export const OrchestratorTransitionMap = Object.freeze({
  [ExecutiveMissionOrchestratorStates.QUEUED]: [
    ExecutiveMissionOrchestratorStates.VALIDATING,
    ExecutiveMissionOrchestratorStates.CANCELLED
  ],
  [ExecutiveMissionOrchestratorStates.VALIDATING]: [
    ExecutiveMissionOrchestratorStates.ROUTING,
    ExecutiveMissionOrchestratorStates.FAILED,
    ExecutiveMissionOrchestratorStates.CANCELLED
  ],
  [ExecutiveMissionOrchestratorStates.ROUTING]: [
    ExecutiveMissionOrchestratorStates.RUNNING,
    ExecutiveMissionOrchestratorStates.FAILED,
    ExecutiveMissionOrchestratorStates.CANCELLED
  ],
  [ExecutiveMissionOrchestratorStates.RUNNING]: [
    ExecutiveMissionOrchestratorStates.COMPLETED,
    ExecutiveMissionOrchestratorStates.REVISION_REQUIRED,
    ExecutiveMissionOrchestratorStates.WAITING_RETRY,
    ExecutiveMissionOrchestratorStates.ROLLED_BACK,
    ExecutiveMissionOrchestratorStates.TIMED_OUT,
    ExecutiveMissionOrchestratorStates.CANCELLED,
    ExecutiveMissionOrchestratorStates.FAILED
  ],
  [ExecutiveMissionOrchestratorStates.REVISION_REQUIRED]: [
    ExecutiveMissionOrchestratorStates.RUNNING,
    ExecutiveMissionOrchestratorStates.ROLLED_BACK,
    ExecutiveMissionOrchestratorStates.CANCELLED,
    ExecutiveMissionOrchestratorStates.FAILED
  ],
  [ExecutiveMissionOrchestratorStates.WAITING_RETRY]: [
    ExecutiveMissionOrchestratorStates.RUNNING,
    ExecutiveMissionOrchestratorStates.ROLLED_BACK,
    ExecutiveMissionOrchestratorStates.CANCELLED,
    ExecutiveMissionOrchestratorStates.FAILED
  ],
  [ExecutiveMissionOrchestratorStates.PAUSED]: [
    ExecutiveMissionOrchestratorStates.RUNNING,
    ExecutiveMissionOrchestratorStates.CANCELLED
  ],
  [ExecutiveMissionOrchestratorStates.ROLLED_BACK]: [
    ExecutiveMissionOrchestratorStates.RUNNING,
    ExecutiveMissionOrchestratorStates.CANCELLED,
    ExecutiveMissionOrchestratorStates.FAILED
  ],
  [ExecutiveMissionOrchestratorStates.TIMED_OUT]: [
    ExecutiveMissionOrchestratorStates.RUNNING,
    ExecutiveMissionOrchestratorStates.ROLLED_BACK,
    ExecutiveMissionOrchestratorStates.CANCELLED,
    ExecutiveMissionOrchestratorStates.FAILED
  ],
  [ExecutiveMissionOrchestratorStates.CANCELLED]: [],
  [ExecutiveMissionOrchestratorStates.COMPLETED]: [],
  [ExecutiveMissionOrchestratorStates.FAILED]: []
});

export function createExecutiveMissionOrchestratorStateMachine() {
  const terminalStates = new Set([
    ExecutiveMissionOrchestratorStates.CANCELLED,
    ExecutiveMissionOrchestratorStates.COMPLETED,
    ExecutiveMissionOrchestratorStates.FAILED
  ]);

  return {
    states: ExecutiveMissionOrchestratorStates,
    terminalStates,
    transitionMap: OrchestratorTransitionMap,
    canTransition(fromState, toState) {
      return (OrchestratorTransitionMap[fromState] ?? []).includes(toState);
    },
    validateTransition({ fromState, toState }) {
      if (terminalStates.has(fromState)) {
        return { isValid: false, reason: `Cannot transition from terminal state ${fromState}.` };
      }
      if (!this.canTransition(fromState, toState)) {
        return { isValid: false, reason: `Invalid transition ${fromState} -> ${toState}.` };
      }
      return { isValid: true, reason: null };
    }
  };
}

export function createOrchestrationSession({
  missionId,
  proposalId,
  missionType,
  customerId,
  timeoutMs = 300000,
  pipelineKey,
  createdAt = new Date().toISOString()
} = {}) {
  return {
    orchestrationId: `orc_${randomUUID()}`,
    missionId,
    proposalId,
    missionType,
    customerId,
    pipelineKey,
    timeoutMs,
    state: ExecutiveMissionOrchestratorStates.QUEUED,
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    endedAt: null,
    cancelRequested: false,
    retryCount: 0,
    currentStage: null,
    completionPercentage: 0,
    eta: null,
    blockers: [],
    assignedWorkers: [],
    confidence: null,
    lifecycle: [{ state: ExecutiveMissionOrchestratorStates.QUEUED, timestamp: createdAt }],
    failures: [],
    recoveryLog: [],
    pipelineMission: null,
    pipelineResult: null,
    governance: {
      readOnlyControlSurface: true,
      publishBypass: false,
      providerHardcoding: false,
      ceoApprovalGateBypassed: false
    }
  };
}
