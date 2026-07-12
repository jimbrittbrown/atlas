const RecommendationPriorities = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
});

const RecommendationPriorityRank = Object.freeze({
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
});

const RiskLevels = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
});

function normalizeRecommendationPriority(value) {
  const normalized = String(value ?? '').toUpperCase().trim();

  if (
    normalized === RecommendationPriorities.CRITICAL
    || normalized === RecommendationPriorities.HIGH
    || normalized === RecommendationPriorities.MEDIUM
    || normalized === RecommendationPriorities.LOW
  ) {
    return normalized;
  }

  return RecommendationPriorities.LOW;
}

function normalizeRiskLevel(value) {
  const normalized = String(value ?? '').toUpperCase().trim();

  if (
    normalized === RiskLevels.CRITICAL
    || normalized === RiskLevels.HIGH
    || normalized === RiskLevels.MEDIUM
    || normalized === RiskLevels.LOW
  ) {
    return normalized;
  }

  return RiskLevels.LOW;
}

function createExecutiveSummary(input = {}) {
  return {
    overallHealth: String(input.overallHealth ?? 'HEALTHY').toUpperCase().trim(),
    businessCount: Number(input.businessCount ?? 0),
    activeMissionCount: Number(input.activeMissionCount ?? 0),
    criticalAlerts: Number(input.criticalAlerts ?? 0),
    pendingCEOApprovals: Number(input.pendingCEOApprovals ?? 0),
    publishingReady: Number(input.publishingReady ?? 0),
    configuredProviders: Number(input.configuredProviders ?? 0),
    healthyProviders: Number(input.healthyProviders ?? 0),
    credentialWarnings: Number(input.credentialWarnings ?? 0),
    providerAlerts: Number(input.providerAlerts ?? 0),
    productionReadyProviders: Number(input.productionReadyProviders ?? 0),
    assetsCreatedToday: Number(input.assetsCreatedToday ?? 0),
    releaseCandidateCount: Number(input.releaseCandidateCount ?? 0),
    approvedAssets: Number(input.approvedAssets ?? 0),
    assetsAwaitingReview: Number(input.assetsAwaitingReview ?? 0),
    assetIntegrityWarnings: Number(input.assetIntegrityWarnings ?? 0),
    highestPriorityRecommendation: input.highestPriorityRecommendation ?? null
  };
}

function createMissionCard(input = {}) {
  return {
    missionId: input.missionId ?? null,
    businessName: input.businessName ?? 'Unknown Business',
    currentStage: input.currentStage ?? 'UNKNOWN',
    qualityDecision: input.qualityDecision ?? 'UNKNOWN',
    executiveDecision: input.executiveDecision ?? 'IN_PROGRESS',
    publishStatus: input.publishStatus ?? 'NOT_REQUESTED',
    runtimeDuration: Number(input.runtimeDuration ?? 0),
    riskLevel: normalizeRiskLevel(input.riskLevel),
    nextAction: input.nextAction ?? 'NONE'
  };
}

function createRecommendation(input = {}) {
  return {
    recommendationId: input.recommendationId ?? null,
    priority: normalizeRecommendationPriority(input.priority),
    category: input.category ?? 'GENERAL',
    title: input.title ?? 'No recommendation title provided.',
    rationale: input.rationale ?? 'No recommendation rationale provided.',
    missionId: input.missionId ?? null,
    businessId: input.businessId ?? null
  };
}

function createDashboardDiagnostics(input = {}) {
  return {
    snapshotTimestamp: input.snapshotTimestamp ?? new Date().toISOString(),
    generationTime: Number(input.generationTime ?? 0),
    runtimeVersion: String(input.runtimeVersion ?? '1.0.0'),
    operationsCenterVersion: String(input.operationsCenterVersion ?? '1.0.0'),
    businessRegistryVersion: String(input.businessRegistryVersion ?? '1.0.0')
  };
}

function createCEODashboard(input = {}) {
  return {
    executiveSummary: createExecutiveSummary(input.executiveSummary ?? {}),
    systemHealth: {
      ...(input.systemHealth ?? {})
    },
    businessOverview: {
      ...(input.businessOverview ?? {})
    },
    missionQueue: {
      ...(input.missionQueue ?? {})
    },
    executiveDecisionsRequired: {
      ...(input.executiveDecisionsRequired ?? {})
    },
    publishingReadiness: {
      ...(input.publishingReadiness ?? {})
    },
    qualityStatus: {
      ...(input.qualityStatus ?? {})
    },
    knowledgeUpdates: Array.isArray(input.knowledgeUpdates) ? [...input.knowledgeUpdates] : [],
    providerStatus: {
      ...(input.providerStatus ?? {})
    },
    credentialStatus: {
      ...(input.credentialStatus ?? {})
    },
    assetStatus: {
      ...(input.assetStatus ?? {})
    },
    recentLessons: Array.isArray(input.recentLessons) ? [...input.recentLessons] : [],
    strategicRisks: Array.isArray(input.strategicRisks) ? [...input.strategicRisks] : [],
    recommendedActions: Array.isArray(input.recommendedActions)
      ? input.recommendedActions.map(action => createRecommendation(action))
      : [],
    diagnostics: createDashboardDiagnostics(input.diagnostics ?? {})
  };
}

module.exports = {
  RecommendationPriorities,
  RecommendationPriorityRank,
  RiskLevels,
  normalizeRecommendationPriority,
  normalizeRiskLevel,
  createExecutiveSummary,
  createMissionCard,
  createRecommendation,
  createDashboardDiagnostics,
  createCEODashboard
};
