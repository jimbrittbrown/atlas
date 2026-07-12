export const MissionLifecycleStates = Object.freeze({
  RECEIVED: 'RECEIVED',
  PLANNING: 'PLANNING',
  RESEARCH: 'RESEARCH',
  SCRIPTING: 'SCRIPTING',
  VOICE_GENERATION: 'VOICE_GENERATION',
  IMAGE_GENERATION: 'IMAGE_GENERATION',
  TIMELINE_BUILD: 'TIMELINE_BUILD',
  MEDIA_RENDER: 'MEDIA_RENDER',
  QUALITY_REVIEW: 'QUALITY_REVIEW',
  RC_PACKAGING: 'RC_PACKAGING',
  EXECUTIVE_REVIEW: 'EXECUTIVE_REVIEW',
  CEO_DECISION_PENDING: 'CEO_DECISION_PENDING',
  CEO_APPROVED: 'CEO_APPROVED',
  CEO_APPROVED_WITH_WAIVERS: 'CEO_APPROVED_WITH_WAIVERS',
  CEO_REVISION: 'CEO_REVISION',
  CEO_REJECTED: 'CEO_REJECTED',
  EXECUTIVE_REPORTING: 'EXECUTIVE_REPORTING',
  LESSON_CAPTURE: 'LESSON_CAPTURE',
  KNOWLEDGE_CANDIDATE_CAPTURE: 'KNOWLEDGE_CANDIDATE_CAPTURE',
  COUNCIL_RECOMMENDATION: 'COUNCIL_RECOMMENDATION',
  READINESS_SUMMARY: 'READINESS_SUMMARY',
  READY_FOR_APPROVAL: 'READY_FOR_APPROVAL',
  APPROVED: 'APPROVED',
  PUBLISHING: 'PUBLISHING',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
  RECOVERING: 'RECOVERING',
  CANCELLED: 'CANCELLED'
});

export const TerminalMissionStates = new Set([
  MissionLifecycleStates.COMPLETED,
  MissionLifecycleStates.FAILED,
  MissionLifecycleStates.CANCELLED,
  MissionLifecycleStates.CEO_REVISION,
  MissionLifecycleStates.CEO_REJECTED
]);

export function createRuntimeContext({
  request = {},
  runtimeVersion = '1.0.0',
  governanceProfileId = 'default',
  executionPolicy = {}
} = {}) {
  const missionId = request.missionId ?? request.requestId ?? `MISSION-${Date.now()}`;
  const requestId = request.requestId ?? missionId;
  const businessId = request.businessId ?? 'SYSTEM_INTERNAL';

  return {
    missionId,
    operationId: request.operationId ?? 'MISSION_RUNTIME_ORCHESTRATOR',
    businessId,
    requestId,
    missionObjective: request.objective ?? 'Mission objective unavailable',
    missionClass: request.missionClass ?? 'STANDARD',
    runtimeVersion,
    initiatedAt: new Date().toISOString(),
    initiatedBy: request.initiatedBy ?? 'SYSTEM',
    governanceProfileId,
    executionPolicy: {
      publishingMode: executionPolicy.publishingMode ?? 'NONE',
      ...executionPolicy
    },
    state: MissionLifecycleStates.RECEIVED,
    currentStage: MissionLifecycleStates.RECEIVED,
    runtimeBusinessContext: null,
    admissionDiagnostics: null,
    terminalMissionOutcome: null,
    stageAttempts: {},
    runtimeDiagnostics: {
      runtimeStageHistory: []
    },
    checkpoints: [],
    artifacts: {},
    evidenceRefs: [],
    metricsRefs: [],
    qualityRefs: [],
    releaseCandidateRefs: [],
    executiveDecisionRefs: [],
    lessonsRefs: [],
    knowledgeCandidateRefs: [],
    riskRegister: [],
    failureLedger: [],
    correlationIds: {
      missionId,
      requestId
    },
    events: []
  };
}
