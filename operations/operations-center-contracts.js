const HealthStatuses = Object.freeze({
  HEALTHY: 'HEALTHY',
  WARNING: 'WARNING',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED'
});

const AlertSeverities = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
});

const AttentionTypes = Object.freeze({
  CEO_APPROVAL: 'CEO_APPROVAL',
  QUALITY_BLOCK: 'QUALITY_BLOCK',
  RUNTIME_FAILURE: 'RUNTIME_FAILURE',
  CREDENTIAL_FAILURE: 'CREDENTIAL_FAILURE',
  PROVIDER_OUTAGE: 'PROVIDER_OUTAGE',
  KNOWLEDGE_CONFLICT: 'KNOWLEDGE_CONFLICT',
  EXPIRED_WAIVER: 'EXPIRED_WAIVER',
  CRITICAL_OPERATIONAL_ALERT: 'CRITICAL_OPERATIONAL_ALERT'
});

function normalizeHealthStatus(value) {
  const normalized = String(value ?? '').toUpperCase().trim();

  if (
    normalized === HealthStatuses.HEALTHY
    || normalized === HealthStatuses.WARNING
    || normalized === HealthStatuses.DEGRADED
    || normalized === HealthStatuses.FAILED
  ) {
    return normalized;
  }

  return HealthStatuses.WARNING;
}

function createOperationsMissionView(input = {}) {
  return {
    missionId: input.missionId ?? null,
    businessId: input.businessId ?? null,
    currentStage: input.currentStage ?? null,
    currentState: input.currentState ?? null,
    qualityStatus: input.qualityStatus ?? 'UNKNOWN',
    executiveStatus: input.executiveStatus ?? 'UNKNOWN',
    publishingStatus: input.publishingStatus ?? 'NOT_REQUESTED',
    runtimeDuration: Number(input.runtimeDuration ?? 0),
    activeRisks: Array.isArray(input.activeRisks) ? [...input.activeRisks] : [],
    nextRequiredDecision: input.nextRequiredDecision ?? 'NONE'
  };
}

function createOperationsDashboard(input = {}) {
  return {
    systemHealth: normalizeHealthStatus(input.systemHealth ?? HealthStatuses.HEALTHY),
    runtimeStatus: {
      ...(input.runtimeStatus ?? {})
    },
    assetCount: Number(input.assetCount ?? 0),
    releaseCandidateCount: Number(input.releaseCandidateCount ?? 0),
    approvedAssets: Number(input.approvedAssets ?? 0),
    assetsAwaitingReview: Number(input.assetsAwaitingReview ?? 0),
    assetIntegrityWarnings: Number(input.assetIntegrityWarnings ?? 0),
    assetHealth: {
      ...(input.assetHealth ?? {})
    },
    recentAssets: Array.isArray(input.recentAssets) ? [...input.recentAssets] : [],
    orphanAssets: Array.isArray(input.orphanAssets) ? [...input.orphanAssets] : [],
    failedAssets: Array.isArray(input.failedAssets) ? [...input.failedAssets] : [],
    assetGrowth: {
      ...(input.assetGrowth ?? {})
    },
    assetStorageSummary: {
      ...(input.assetStorageSummary ?? {})
    },
    assetsCreatedToday: Number(input.assetsCreatedToday ?? 0),
    assetSummary: {
      ...(input.assetSummary ?? {})
    },
    assetStatus: {
      ...(input.assetStatus ?? {})
    },
    activeMissions: Array.isArray(input.activeMissions) ? [...input.activeMissions] : [],
    queuedMissions: Array.isArray(input.queuedMissions) ? [...input.queuedMissions] : [],
    completedMissions: Array.isArray(input.completedMissions) ? [...input.completedMissions] : [],
    failedMissions: Array.isArray(input.failedMissions) ? [...input.failedMissions] : [],
    executiveAttentionItems: Array.isArray(input.executiveAttentionItems) ? [...input.executiveAttentionItems] : [],
    qualityAlerts: Array.isArray(input.qualityAlerts) ? [...input.qualityAlerts] : [],
    publishingQueue: Array.isArray(input.publishingQueue) ? [...input.publishingQueue] : [],
    businessSummary: {
      ...(input.businessSummary ?? {})
    },
    configurationSummary: {
      ...(input.configurationSummary ?? {})
    },
    configurationDrift: Array.isArray(input.configurationDrift) ? [...input.configurationDrift] : [],
    missingProductionItems: Array.isArray(input.missingProductionItems) ? [...input.missingProductionItems] : [],
    knowledgeUpdates: Array.isArray(input.knowledgeUpdates) ? [...input.knowledgeUpdates] : [],
    recentLessonsLearned: Array.isArray(input.recentLessonsLearned) ? [...input.recentLessonsLearned] : [],
    providerHealth: {
      ...(input.providerHealth ?? {})
    },
    credentialHealth: {
      ...(input.credentialHealth ?? {})
    },
    providerSummary: {
      ...(input.providerSummary ?? {})
    },
    credentialSummary: {
      ...(input.credentialSummary ?? {})
    },
    missingCredentials: Array.isArray(input.missingCredentials) ? [...input.missingCredentials] : [],
    failedProviders: Array.isArray(input.failedProviders) ? [...input.failedProviders] : [],
    quotaWarnings: Array.isArray(input.quotaWarnings) ? [...input.quotaWarnings] : [],
    verificationFailures: Array.isArray(input.verificationFailures) ? [...input.verificationFailures] : [],
    diagnostics: {
      ...(input.diagnostics ?? {})
    }
  };
}

module.exports = {
  HealthStatuses,
  AlertSeverities,
  AttentionTypes,
  normalizeHealthStatus,
  createOperationsMissionView,
  createOperationsDashboard
};
