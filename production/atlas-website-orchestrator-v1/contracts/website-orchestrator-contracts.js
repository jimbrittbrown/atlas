const MissionStates = Object.freeze({
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  FAILED: 'FAILED',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  READY_FOR_APPROVAL: 'READY_FOR_APPROVAL',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  DELIVERED: 'DELIVERED'
});

const StageIds = Object.freeze({
  PROSPECT_APPROVED: 'PROSPECT_APPROVED',
  COMPANY_RESEARCH: 'COMPANY_RESEARCH',
  BRAND_PACKAGE_GENERATION: 'BRAND_PACKAGE_GENERATION',
  TEMPLATE_SELECTION: 'TEMPLATE_SELECTION',
  WEBSITE_GENERATION: 'WEBSITE_GENERATION',
  QA: 'QA',
  EXECUTIVE_PREVIEW: 'EXECUTIVE_PREVIEW',
  CEO_APPROVAL_GATE: 'CEO_APPROVAL_GATE',
  PUBLISH: 'PUBLISH',
  DELIVERY_PACKAGE: 'DELIVERY_PACKAGE'
});

const StageSequence = Object.freeze([
  StageIds.PROSPECT_APPROVED,
  StageIds.COMPANY_RESEARCH,
  StageIds.BRAND_PACKAGE_GENERATION,
  StageIds.TEMPLATE_SELECTION,
  StageIds.WEBSITE_GENERATION,
  StageIds.QA,
  StageIds.EXECUTIVE_PREVIEW,
  StageIds.CEO_APPROVAL_GATE,
  StageIds.PUBLISH,
  StageIds.DELIVERY_PACKAGE
]);

const RecoveryActions = Object.freeze({
  RETRY: 'RETRY',
  RESUME: 'RESUME',
  ROLLBACK: 'ROLLBACK'
});

const StageStatuses = Object.freeze({
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED'
});

const IntegrationProviders = Object.freeze({
  FRAMER: 'FRAMER',
  WEBFLOW: 'WEBFLOW',
  WORDPRESS: 'WORDPRESS',
  OTHER: 'OTHER'
});

function normalizeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function createStageSnapshot(input = {}) {
  return {
    stageId: normalizeString(input.stageId),
    status: normalizeString(input.status, StageStatuses.WAITING),
    attemptCount: Number.isFinite(input.attemptCount) ? input.attemptCount : 0,
    startedAt: normalizeString(input.startedAt),
    completedAt: normalizeString(input.completedAt),
    warnings: normalizeArray(input.warnings).map(item => normalizeString(item)).filter(Boolean),
    blockingIssues: normalizeArray(input.blockingIssues).map(item => normalizeString(item)).filter(Boolean),
    confidence: Number.isFinite(input.confidence) ? Number(input.confidence.toFixed(2)) : null,
    failureLog: normalizeArray(input.failureLog),
    checkpoints: normalizeArray(input.checkpoints)
  };
}

function createMission(input = {}) {
  const stages = StageSequence.map(stageId => {
    const existing = (input.stages ?? []).find(stage => stage.stageId === stageId) ?? {};
    return createStageSnapshot({ ...existing, stageId });
  });

  return {
    missionId: normalizeString(input.missionId).toUpperCase(),
    clientId: normalizeString(input.clientId).toUpperCase(),
    state: normalizeString(input.state, MissionStates.WAITING),
    currentStage: normalizeString(input.currentStage, StageIds.PROSPECT_APPROVED),
    stages,
    warnings: normalizeArray(input.warnings).map(item => normalizeString(item)).filter(Boolean),
    blockingIssues: normalizeArray(input.blockingIssues).map(item => normalizeString(item)).filter(Boolean),
    confidence: Number.isFinite(input.confidence) ? Number(input.confidence.toFixed(2)) : null,
    estimatedCompletion: normalizeString(input.estimatedCompletion),
    createdAt: normalizeString(input.createdAt),
    updatedAt: normalizeString(input.updatedAt),
    ceoApproval: {
      required: true,
      approved: Boolean(input.ceoApproval?.approved),
      approvedBy: normalizeString(input.ceoApproval?.approvedBy),
      approvedAt: normalizeString(input.ceoApproval?.approvedAt)
    },
    governance: {
      preserveBrandingByDefault: true,
      logoOverwriteExplicitApprovalOnly: true
    },
    integrationProfile: {
      provider: normalizeString(input.integrationProfile?.provider, IntegrationProviders.OTHER),
      adapterId: normalizeString(input.integrationProfile?.adapterId)
    },
    context: input.context && typeof input.context === 'object' ? { ...input.context } : {}
  };
}

function validateMissionStateTransition(currentState, nextState) {
  const allowedTransitions = {
    [MissionStates.WAITING]: [MissionStates.RUNNING, MissionStates.FAILED],
    [MissionStates.RUNNING]: [MissionStates.REVISION_REQUIRED, MissionStates.READY_FOR_APPROVAL, MissionStates.FAILED],
    [MissionStates.REVISION_REQUIRED]: [MissionStates.RUNNING, MissionStates.FAILED],
    [MissionStates.READY_FOR_APPROVAL]: [MissionStates.APPROVED, MissionStates.REVISION_REQUIRED, MissionStates.FAILED],
    [MissionStates.APPROVED]: [MissionStates.PUBLISHED, MissionStates.FAILED],
    [MissionStates.PUBLISHED]: [MissionStates.DELIVERED, MissionStates.FAILED],
    [MissionStates.DELIVERED]: [],
    [MissionStates.FAILED]: [MissionStates.RUNNING, MissionStates.REVISION_REQUIRED]
  };

  const valid = (allowedTransitions[currentState] ?? []).includes(nextState);

  return {
    isValid: valid,
    issue: valid ? null : `INVALID_TRANSITION_${currentState}_TO_${nextState}`
  };
}

function getStageIndex(stageId) {
  return StageSequence.indexOf(stageId);
}

function calculateCompletionPercent(stages = []) {
  const completed = stages.filter(stage => stage.status === StageStatuses.COMPLETE).length;
  return Math.round((completed / StageSequence.length) * 100);
}

function createDashboardView(mission = {}) {
  const stages = mission.stages ?? [];
  const completionPercent = calculateCompletionPercent(stages);
  const currentStage = mission.currentStage;
  const allWarnings = [
    ...(mission.warnings ?? []),
    ...stages.flatMap(stage => stage.warnings ?? [])
  ];
  const blockingIssues = [
    ...(mission.blockingIssues ?? []),
    ...stages.flatMap(stage => stage.blockingIssues ?? [])
  ];

  const stageConfidence = stages
    .map(stage => stage.confidence)
    .filter(value => typeof value === 'number');

  const confidence = stageConfidence.length > 0
    ? Number((stageConfidence.reduce((sum, value) => sum + value, 0) / stageConfidence.length).toFixed(2))
    : mission.confidence;

  return {
    missionId: mission.missionId,
    clientId: mission.clientId,
    state: mission.state,
    currentStage,
    completionPercent,
    warnings: allWarnings,
    confidence,
    blockingIssues,
    estimatedCompletion: mission.estimatedCompletion
  };
}

function validateGovernanceForPublish(mission = {}) {
  if (!mission.ceoApproval?.approved) {
    return {
      allowed: false,
      issue: 'CEO_APPROVAL_REQUIRED'
    };
  }

  return {
    allowed: true,
    issue: null
  };
}

module.exports = {
  MissionStates,
  StageIds,
  StageSequence,
  RecoveryActions,
  StageStatuses,
  IntegrationProviders,
  createStageSnapshot,
  createMission,
  validateMissionStateTransition,
  getStageIndex,
  calculateCompletionPercent,
  createDashboardView,
  validateGovernanceForPublish
};
