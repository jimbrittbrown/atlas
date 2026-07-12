const AllowedRiskLevels = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

/**
 * @typedef {Object} MissionPlanObjective
 * @property {string} missionObjective
 * @property {string} businessGoal
 * @property {string} audience
 */

/**
 * @typedef {Object} MissionPlan
 * @property {string} planId
 * @property {string} missionId
 * @property {string} requestId
 * @property {MissionPlanObjective} objective
 * @property {Array<Object>} successMetrics
 * @property {Object} constraints
 * @property {Object} selectedStrategy
 * @property {Object} confidence
 * @property {Array<Object>} requiredDirectors
 * @property {Array<Object>} requiredCertifiedCapabilities
 * @property {Object} providerPreferences
 * @property {Array<Object>} executionPhases
 * @property {Array<Object>} expectedArtifacts
 * @property {Object} approvalRequirements
 * @property {Object} riskAssessment
 * @property {Object} aeisMeasurementHooks
 * @property {Object} translation
 * @property {string} generatedAt
 * @property {string} plannerVersion
 */

export function createMissionPlan(plan = {}) {
  return {
    planId: plan.planId,
    missionId: plan.missionId,
    requestId: plan.requestId,
    objective: {
      missionObjective: plan.objective?.missionObjective,
      businessGoal: plan.objective?.businessGoal,
      audience: plan.objective?.audience
    },
    successMetrics: Array.isArray(plan.successMetrics) ? [...plan.successMetrics] : [],
    constraints: {
      hardConstraints: Array.isArray(plan.constraints?.hardConstraints) ? [...plan.constraints.hardConstraints] : [],
      softConstraints: Array.isArray(plan.constraints?.softConstraints) ? [...plan.constraints.softConstraints] : [],
      timeBudgetMinutes: plan.constraints?.timeBudgetMinutes ?? null
    },
    selectedStrategy: {
      strategyId: plan.selectedStrategy?.strategyId,
      name: plan.selectedStrategy?.name,
      rationale: plan.selectedStrategy?.rationale,
      approach: plan.selectedStrategy?.approach,
      assumptions: Array.isArray(plan.selectedStrategy?.assumptions) ? [...plan.selectedStrategy.assumptions] : []
    },
    confidence: {
      score: Number(plan.confidence?.score ?? 0),
      rationale: plan.confidence?.rationale ?? 'Mission confidence rationale not supplied.'
    },
    requiredDirectors: Array.isArray(plan.requiredDirectors) ? [...plan.requiredDirectors] : [],
    requiredCertifiedCapabilities: Array.isArray(plan.requiredCertifiedCapabilities)
      ? [...plan.requiredCertifiedCapabilities]
      : [],
    providerPreferences: {
      script: Array.isArray(plan.providerPreferences?.script) ? [...plan.providerPreferences.script] : [],
      voice: Array.isArray(plan.providerPreferences?.voice) ? [...plan.providerPreferences.voice] : [],
      image: Array.isArray(plan.providerPreferences?.image) ? [...plan.providerPreferences.image] : [],
      video: Array.isArray(plan.providerPreferences?.video) ? [...plan.providerPreferences.video] : [],
      fallbackPolicy: Array.isArray(plan.providerPreferences?.fallbackPolicy)
        ? [...plan.providerPreferences.fallbackPolicy]
        : []
    },
    executionPhases: Array.isArray(plan.executionPhases) ? [...plan.executionPhases] : [],
    expectedArtifacts: Array.isArray(plan.expectedArtifacts) ? [...plan.expectedArtifacts] : [],
    approvalRequirements: {
      requiredApprovers: Array.isArray(plan.approvalRequirements?.requiredApprovers)
        ? [...plan.approvalRequirements.requiredApprovers]
        : [],
      minimumApprovals: Number(plan.approvalRequirements?.minimumApprovals ?? 0),
      requiresExecutiveReview: Boolean(plan.approvalRequirements?.requiresExecutiveReview),
      requiresCEODecision: Boolean(plan.approvalRequirements?.requiresCEODecision)
    },
    riskAssessment: {
      overallRiskLevel: String(plan.riskAssessment?.overallRiskLevel ?? 'MEDIUM').toUpperCase(),
      risks: Array.isArray(plan.riskAssessment?.risks) ? [...plan.riskAssessment.risks] : []
    },
    aeisMeasurementHooks: {
      hookVersion: plan.aeisMeasurementHooks?.hookVersion ?? '1.0.0',
      hooks: Array.isArray(plan.aeisMeasurementHooks?.hooks) ? [...plan.aeisMeasurementHooks.hooks] : []
    },
    translation: {
      launchPlan: plan.translation?.launchPlan ?? { phases: [] },
      executionPlan: plan.translation?.executionPlan ?? { tasks: [] },
      executionInputs: plan.translation?.executionInputs ?? {}
    },
    generatedAt: plan.generatedAt,
    plannerVersion: plan.plannerVersion ?? '1.0.0'
  };
}

export function validateMissionPlan(plan = {}) {
  const issues = [];

  if (!isNonEmptyString(plan.planId)) {
    issues.push({ field: 'planId', issue: 'MISSING_PLAN_ID' });
  }

  if (!isNonEmptyString(plan.missionId)) {
    issues.push({ field: 'missionId', issue: 'MISSING_MISSION_ID' });
  }

  if (!isNonEmptyString(plan.objective?.missionObjective)) {
    issues.push({ field: 'objective.missionObjective', issue: 'MISSING_MISSION_OBJECTIVE' });
  }

  if (!Array.isArray(plan.successMetrics) || plan.successMetrics.length === 0) {
    issues.push({ field: 'successMetrics', issue: 'MISSING_SUCCESS_METRICS' });
  }

  if (!Array.isArray(plan.requiredDirectors) || plan.requiredDirectors.length === 0) {
    issues.push({ field: 'requiredDirectors', issue: 'MISSING_REQUIRED_DIRECTORS' });
  }

  if (!Array.isArray(plan.requiredCertifiedCapabilities) || plan.requiredCertifiedCapabilities.length === 0) {
    issues.push({ field: 'requiredCertifiedCapabilities', issue: 'MISSING_REQUIRED_CERTIFIED_CAPABILITIES' });
  }

  if (!Array.isArray(plan.executionPhases) || plan.executionPhases.length === 0) {
    issues.push({ field: 'executionPhases', issue: 'MISSING_EXECUTION_PHASES' });
  }

  if (!Array.isArray(plan.expectedArtifacts) || plan.expectedArtifacts.length === 0) {
    issues.push({ field: 'expectedArtifacts', issue: 'MISSING_EXPECTED_ARTIFACTS' });
  }

  if (!AllowedRiskLevels.has(String(plan.riskAssessment?.overallRiskLevel ?? '').toUpperCase())) {
    issues.push({ field: 'riskAssessment.overallRiskLevel', issue: 'INVALID_RISK_LEVEL' });
  }

  if (!Number.isFinite(Number(plan.confidence?.score))) {
    issues.push({ field: 'confidence.score', issue: 'INVALID_CONFIDENCE_SCORE' });
  }

  if (!Array.isArray(plan.aeisMeasurementHooks?.hooks) || plan.aeisMeasurementHooks.hooks.length === 0) {
    issues.push({ field: 'aeisMeasurementHooks.hooks', issue: 'MISSING_AEIS_HOOKS' });
  }

  if (!plan.translation || typeof plan.translation !== 'object') {
    issues.push({ field: 'translation', issue: 'MISSING_TRANSLATION' });
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}