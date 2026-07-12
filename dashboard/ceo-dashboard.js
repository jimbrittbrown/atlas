const {
  RecommendationPriorities,
  RecommendationPriorityRank,
  RiskLevels,
  createCEODashboard,
  createMissionCard,
  createRecommendation,
  createDashboardDiagnostics
} = require('./ceo-dashboard-contracts.js');

class CEODashboard {
  constructor({
    operationsCenter = null,
    businessRegistry = null,
    now = () => Date.now(),
    runtimeVersion = '1.0.0',
    operationsCenterVersion = '1.0.0',
    businessRegistryVersion = '1.0.0'
  } = {}) {
    this.operationsCenter = operationsCenter;
    this.businessRegistry = businessRegistry;
    this.now = now;
    this.runtimeVersion = runtimeVersion;
    this.operationsCenterVersion = operationsCenterVersion;
    this.businessRegistryVersion = businessRegistryVersion;
  }

  generateSnapshot({
    operationsInput = {},
    runtimeVersion = null,
    operationsCenterVersion = null,
    businessRegistryVersion = null
  } = {}) {
    const startedAt = this.now();
    const operationsSnapshot = this.loadOperationsSnapshot(operationsInput);
    const businessNameById = this.buildBusinessNameIndex(operationsSnapshot);

    const missionCards = this.buildMissionCards({
      operationsSnapshot,
      businessNameById
    });
    const strategicRisks = this.buildStrategicRisks({
      operationsSnapshot,
      missionCards
    });
    const recommendedActions = this.buildRecommendedActions({
      operationsSnapshot,
      strategicRisks,
      missionCards
    });

    const pendingCEOApprovals = this.countPendingCEOApprovals(operationsSnapshot);
    const publishingReady = this.countPublishingReady(operationsSnapshot);
    const criticalAlerts = this.countCriticalAlerts(operationsSnapshot);
    const assetSummary = this.resolveAssetSummary(operationsSnapshot);
    const configuredProviders = Number(operationsSnapshot.providerSummary?.configuredProviders ?? 0);
    const healthyProviders = Number(operationsSnapshot.providerSummary?.healthyProviders ?? 0);
    const productionReadyProviders = Number(operationsSnapshot.providerSummary?.productionReadyProviders ?? 0);
    const credentialWarnings = Number(operationsSnapshot.credentialSummary?.warningCredentials ?? 0);
    const providerAlerts = Number(
      (Array.isArray(operationsSnapshot.failedProviders) ? operationsSnapshot.failedProviders.length : 0)
      + (Array.isArray(operationsSnapshot.quotaWarnings) ? operationsSnapshot.quotaWarnings.length : 0)
    );

    const diagnostics = createDashboardDiagnostics({
      snapshotTimestamp: operationsSnapshot?.diagnostics?.snapshotTimestamp ?? new Date(startedAt).toISOString(),
      generationTime: Math.max(0, this.now() - startedAt),
      runtimeVersion: runtimeVersion ?? this.resolveRuntimeVersion(operationsSnapshot) ?? this.runtimeVersion,
      operationsCenterVersion: operationsCenterVersion ?? this.operationsCenterVersion,
      businessRegistryVersion: businessRegistryVersion ?? this.businessRegistryVersion
    });

    return createCEODashboard({
      executiveSummary: {
        overallHealth: operationsSnapshot.systemHealth,
        businessCount: Number(operationsSnapshot.businessSummary?.businessCount ?? 0),
        activeMissionCount: Number(operationsSnapshot.runtimeStatus?.activeMissionCount ?? 0),
        criticalAlerts,
        pendingCEOApprovals,
        publishingReady,
        configuredProviders,
        healthyProviders,
        credentialWarnings,
        providerAlerts,
        productionReadyProviders,
        assetsCreatedToday: Number(assetSummary.assetsCreatedToday ?? 0),
        releaseCandidateCount: Number(assetSummary.releaseCandidateCount ?? 0),
        approvedAssets: Number(assetSummary.approvedAssets ?? 0),
        assetsAwaitingReview: Number(assetSummary.assetsAwaitingReview ?? 0),
        assetIntegrityWarnings: Number(assetSummary.assetIntegrityWarnings ?? 0),
        highestPriorityRecommendation: recommendedActions[0]?.title ?? null
      },
      systemHealth: {
        overallHealth: operationsSnapshot.systemHealth,
        runtimeStatus: {
          ...(operationsSnapshot.runtimeStatus ?? {})
        }
      },
      businessOverview: {
        ...(operationsSnapshot.businessSummary ?? {})
      },
      missionQueue: {
        activeMissions: Array.isArray(operationsSnapshot.activeMissions) ? [...operationsSnapshot.activeMissions] : [],
        queuedMissions: Array.isArray(operationsSnapshot.queuedMissions) ? [...operationsSnapshot.queuedMissions] : [],
        completedMissions: Array.isArray(operationsSnapshot.completedMissions) ? [...operationsSnapshot.completedMissions] : [],
        failedMissions: Array.isArray(operationsSnapshot.failedMissions) ? [...operationsSnapshot.failedMissions] : [],
        missionCards
      },
      executiveDecisionsRequired: {
        pendingCEOApprovals,
        items: this.resolveExecutiveDecisionItems({ operationsSnapshot, missionCards })
      },
      publishingReadiness: {
        publishingReady,
        queue: Array.isArray(operationsSnapshot.publishingQueue) ? [...operationsSnapshot.publishingQueue] : []
      },
      qualityStatus: {
        blockedMissionCount: missionCards.filter(card => card.qualityDecision === 'BLOCK').length,
        alerts: Array.isArray(operationsSnapshot.qualityAlerts) ? [...operationsSnapshot.qualityAlerts] : []
      },
      knowledgeUpdates: Array.isArray(operationsSnapshot.knowledgeUpdates) ? [...operationsSnapshot.knowledgeUpdates] : [],
      providerStatus: {
        ...(operationsSnapshot.providerHealth ?? {}),
        providerSummary: {
          ...(operationsSnapshot.providerSummary ?? {})
        },
        failedProviders: Array.isArray(operationsSnapshot.failedProviders)
          ? [...operationsSnapshot.failedProviders]
          : [],
        quotaWarnings: Array.isArray(operationsSnapshot.quotaWarnings)
          ? [...operationsSnapshot.quotaWarnings]
          : []
      },
      credentialStatus: {
        ...(operationsSnapshot.credentialHealth ?? {}),
        credentialSummary: {
          ...(operationsSnapshot.credentialSummary ?? {})
        },
        missingCredentials: Array.isArray(operationsSnapshot.missingCredentials)
          ? [...operationsSnapshot.missingCredentials]
          : [],
        verificationFailures: Array.isArray(operationsSnapshot.verificationFailures)
          ? [...operationsSnapshot.verificationFailures]
          : []
      },
      assetStatus: {
        ...(operationsSnapshot.assetStatus ?? {}),
        assetSummary: {
          ...(assetSummary ?? {})
        },
        recentAssets: Array.isArray(operationsSnapshot.recentAssets) ? [...operationsSnapshot.recentAssets] : [],
        orphanAssets: Array.isArray(operationsSnapshot.orphanAssets) ? [...operationsSnapshot.orphanAssets] : [],
        failedAssets: Array.isArray(operationsSnapshot.failedAssets) ? [...operationsSnapshot.failedAssets] : [],
        assetGrowth: {
          ...(operationsSnapshot.assetGrowth ?? {})
        },
        assetStorageSummary: {
          ...(operationsSnapshot.assetStorageSummary ?? {})
        }
      },
      recentLessons: Array.isArray(operationsSnapshot.recentLessonsLearned)
        ? [...operationsSnapshot.recentLessonsLearned]
        : [],
      strategicRisks,
      recommendedActions,
      diagnostics
    });
  }

  loadOperationsSnapshot(operationsInput = {}) {
    if (this.operationsCenter && typeof this.operationsCenter.snapshot === 'function') {
      return this.operationsCenter.snapshot(operationsInput);
    }

    return {
      systemHealth: String(operationsInput.systemHealth ?? 'HEALTHY').toUpperCase().trim(),
      runtimeStatus: {
        status: String(operationsInput.runtimeStatus?.status ?? 'HEALTHY').toUpperCase().trim(),
        totalMissions: Number(operationsInput.runtimeStatus?.totalMissions ?? 0),
        activeMissionCount: Number(operationsInput.runtimeStatus?.activeMissionCount ?? 0),
        queuedMissionCount: Number(operationsInput.runtimeStatus?.queuedMissionCount ?? 0),
        completedMissionCount: Number(operationsInput.runtimeStatus?.completedMissionCount ?? 0),
        failedMissionCount: Number(operationsInput.runtimeStatus?.failedMissionCount ?? 0)
      },
      activeMissions: Array.isArray(operationsInput.activeMissions) ? [...operationsInput.activeMissions] : [],
      queuedMissions: Array.isArray(operationsInput.queuedMissions) ? [...operationsInput.queuedMissions] : [],
      completedMissions: Array.isArray(operationsInput.completedMissions) ? [...operationsInput.completedMissions] : [],
      failedMissions: Array.isArray(operationsInput.failedMissions) ? [...operationsInput.failedMissions] : [],
      executiveAttentionItems: Array.isArray(operationsInput.executiveAttentionItems) ? [...operationsInput.executiveAttentionItems] : [],
      qualityAlerts: Array.isArray(operationsInput.qualityAlerts) ? [...operationsInput.qualityAlerts] : [],
      publishingQueue: Array.isArray(operationsInput.publishingQueue) ? [...operationsInput.publishingQueue] : [],
      providerSummary: {
        providerCount: Number(operationsInput.providerSummary?.providerCount ?? 0),
        configuredProviders: Number(operationsInput.providerSummary?.configuredProviders ?? 0),
        healthyProviders: Number(operationsInput.providerSummary?.healthyProviders ?? 0),
        productionReadyProviders: Number(operationsInput.providerSummary?.productionReadyProviders ?? 0)
      },
      credentialSummary: {
        credentialCount: Number(operationsInput.credentialSummary?.credentialCount ?? 0),
        configuredCredentials: Number(operationsInput.credentialSummary?.configuredCredentials ?? 0),
        verifiedCredentials: Number(operationsInput.credentialSummary?.verifiedCredentials ?? 0),
        warningCredentials: Number(operationsInput.credentialSummary?.warningCredentials ?? 0)
      },
      missingCredentials: Array.isArray(operationsInput.missingCredentials) ? [...operationsInput.missingCredentials] : [],
      failedProviders: Array.isArray(operationsInput.failedProviders) ? [...operationsInput.failedProviders] : [],
      quotaWarnings: Array.isArray(operationsInput.quotaWarnings) ? [...operationsInput.quotaWarnings] : [],
      verificationFailures: Array.isArray(operationsInput.verificationFailures) ? [...operationsInput.verificationFailures] : [],
      businessSummary: {
        businessCount: Number(operationsInput.businessSummary?.businessCount ?? 0),
        registeredBusinesses: Array.isArray(operationsInput.businessSummary?.registeredBusinesses)
          ? [...operationsInput.businessSummary.registeredBusinesses]
          : [],
        businessHealth: {
          ...(operationsInput.businessSummary?.businessHealth ?? {})
        },
        businessProfiles: Array.isArray(operationsInput.businessSummary?.businessProfiles)
          ? [...operationsInput.businessSummary.businessProfiles]
          : [],
        missionCountByBusiness: {
          ...(operationsInput.businessSummary?.missionCountByBusiness ?? {})
        },
        businesses: Array.isArray(operationsInput.businessSummary?.businesses)
          ? [...operationsInput.businessSummary.businesses]
          : []
      },
      knowledgeUpdates: Array.isArray(operationsInput.knowledgeUpdates) ? [...operationsInput.knowledgeUpdates] : [],
      recentLessonsLearned: Array.isArray(operationsInput.recentLessonsLearned) ? [...operationsInput.recentLessonsLearned] : [],
      assetCount: Number(operationsInput.assetCount ?? 0),
      releaseCandidateCount: Number(operationsInput.releaseCandidateCount ?? 0),
      approvedAssets: Number(operationsInput.approvedAssets ?? 0),
      assetsAwaitingReview: Number(operationsInput.assetsAwaitingReview ?? 0),
      assetIntegrityWarnings: Number(operationsInput.assetIntegrityWarnings ?? 0),
      assetSummary: {
        ...(operationsInput.assetSummary ?? {})
      },
      recentAssets: Array.isArray(operationsInput.recentAssets) ? [...operationsInput.recentAssets] : [],
      orphanAssets: Array.isArray(operationsInput.orphanAssets) ? [...operationsInput.orphanAssets] : [],
      failedAssets: Array.isArray(operationsInput.failedAssets) ? [...operationsInput.failedAssets] : [],
      assetGrowth: {
        ...(operationsInput.assetGrowth ?? {})
      },
      assetStorageSummary: {
        ...(operationsInput.assetStorageSummary ?? {})
      },
      providerHealth: {
        status: String(operationsInput.providerHealth?.status ?? 'HEALTHY').toUpperCase().trim(),
        issues: Array.isArray(operationsInput.providerHealth?.issues) ? [...operationsInput.providerHealth.issues] : []
      },
      credentialHealth: {
        status: String(operationsInput.credentialHealth?.status ?? 'HEALTHY').toUpperCase().trim(),
        issues: Array.isArray(operationsInput.credentialHealth?.issues) ? [...operationsInput.credentialHealth.issues] : []
      },
      diagnostics: {
        ...(operationsInput.diagnostics ?? {}),
        snapshotTimestamp: operationsInput.diagnostics?.snapshotTimestamp ?? new Date(this.now()).toISOString()
      }
    };
  }

  resolveAssetSummary(operationsSnapshot = {}) {
    const assetSummary = operationsSnapshot.assetSummary ?? {};

    return {
      assetsCreatedToday: Number(operationsSnapshot.assetsCreatedToday ?? assetSummary.assetsCreatedToday ?? 0),
      releaseCandidateCount: Number(operationsSnapshot.releaseCandidateCount ?? assetSummary.releaseCandidateCount ?? 0),
      approvedAssets: Number(operationsSnapshot.approvedAssets ?? assetSummary.approvedAssets ?? 0),
      assetsAwaitingReview: Number(operationsSnapshot.assetsAwaitingReview ?? assetSummary.assetsAwaitingReview ?? 0),
      assetIntegrityWarnings: Number(operationsSnapshot.assetIntegrityWarnings ?? assetSummary.assetIntegrityWarnings ?? 0),
      assetCount: Number(operationsSnapshot.assetCount ?? assetSummary.assetCount ?? 0)
    };
  }

  buildBusinessNameIndex(operationsSnapshot = {}) {
    const index = new Map();

    const businessProfiles = Array.isArray(operationsSnapshot.businessSummary?.businessProfiles)
      ? operationsSnapshot.businessSummary.businessProfiles
      : [];

    businessProfiles.forEach(profile => {
      const businessId = String(profile.businessId ?? '').toUpperCase().trim();

      if (businessId.length === 0) {
        return;
      }

      index.set(businessId, profile.displayName ?? profile.businessName ?? businessId);
    });

    if (this.businessRegistry && typeof this.businessRegistry.listBusinesses === 'function') {
      this.businessRegistry.listBusinesses().forEach(profile => {
        const businessId = String(profile.businessId ?? '').toUpperCase().trim();

        if (businessId.length === 0) {
          return;
        }

        index.set(businessId, profile.displayName ?? profile.businessName ?? businessId);
      });
    }

    return index;
  }

  buildMissionCards({ operationsSnapshot = {}, businessNameById = new Map() } = {}) {
    const missions = [
      ...(Array.isArray(operationsSnapshot.activeMissions) ? operationsSnapshot.activeMissions : []),
      ...(Array.isArray(operationsSnapshot.completedMissions) ? operationsSnapshot.completedMissions : []),
      ...(Array.isArray(operationsSnapshot.failedMissions) ? operationsSnapshot.failedMissions : [])
    ];

    return missions.map(mission => {
      const businessId = String(mission.businessId ?? '').toUpperCase().trim();
      const risks = Array.isArray(mission.activeRisks) ? mission.activeRisks : [];
      const businessName = businessNameById.get(businessId) ?? (businessId.length > 0 ? businessId : 'Unknown Business');

      return createMissionCard({
        missionId: mission.missionId ?? null,
        businessName,
        currentStage: mission.currentStage ?? mission.currentState ?? 'UNKNOWN',
        qualityDecision: mission.qualityStatus ?? 'UNKNOWN',
        executiveDecision: mission.executiveStatus ?? 'IN_PROGRESS',
        publishStatus: mission.publishingStatus ?? 'NOT_REQUESTED',
        runtimeDuration: Number(mission.runtimeDuration ?? 0),
        riskLevel: this.resolveRiskLevel(risks),
        nextAction: mission.nextRequiredDecision ?? 'NONE'
      });
    });
  }

  resolveRiskLevel(risks = []) {
    if (!Array.isArray(risks) || risks.length === 0) {
      return RiskLevels.LOW;
    }

    const bySeverity = risks.map(risk => String(risk.severity ?? '').toUpperCase().trim());

    if (bySeverity.includes(RiskLevels.CRITICAL)) {
      return RiskLevels.CRITICAL;
    }

    if (bySeverity.includes(RiskLevels.HIGH)) {
      return RiskLevels.HIGH;
    }

    if (bySeverity.includes(RiskLevels.MEDIUM)) {
      return RiskLevels.MEDIUM;
    }

    return RiskLevels.LOW;
  }

  buildStrategicRisks({ operationsSnapshot = {}, missionCards = [] } = {}) {
    const risks = [];

    missionCards.forEach(card => {
      if (card.riskLevel !== RiskLevels.LOW) {
        risks.push({
          priority: card.riskLevel,
          category: 'MISSION_RISK',
          missionId: card.missionId,
          message: `Mission ${card.missionId} has ${card.riskLevel} risk posture.`,
          nextAction: card.nextAction
        });
      }
    });

    const executiveItems = Array.isArray(operationsSnapshot.executiveAttentionItems)
      ? operationsSnapshot.executiveAttentionItems
      : [];

    executiveItems.forEach(item => {
      risks.push({
        priority: String(item.severity ?? '').toUpperCase().trim() || RecommendationPriorities.LOW,
        category: String(item.type ?? 'EXECUTIVE_ALERT').toUpperCase().trim(),
        missionId: item.missionId ?? null,
        message: item.message ?? 'Executive attention required.',
        nextAction: item.missionId ? 'EXECUTIVE_INTERVENTION' : 'MONITOR'
      });
    });

    return this.sortByPriority(risks);
  }

  buildRecommendedActions({ operationsSnapshot = {}, strategicRisks = [], missionCards = [] } = {}) {
    const recommendations = [];

    strategicRisks.forEach((risk, index) => {
      recommendations.push(createRecommendation({
        recommendationId: `REC-${String(index + 1).padStart(3, '0')}`,
        priority: risk.priority,
        category: risk.category,
        title: this.buildRecommendationTitle(risk),
        rationale: risk.message,
        missionId: risk.missionId ?? null,
        businessId: this.resolveBusinessIdForMission(missionCards, risk.missionId)
      }));
    });

    const publishingQueue = Array.isArray(operationsSnapshot.publishingQueue)
      ? operationsSnapshot.publishingQueue
      : [];

    if (publishingQueue.length > 0) {
      recommendations.push(createRecommendation({
        recommendationId: `REC-${String(recommendations.length + 1).padStart(3, '0')}`,
        priority: RecommendationPriorities.MEDIUM,
        category: 'PUBLISHING',
        title: 'Review publishing queue readiness and scheduling constraints.',
        rationale: `${publishingQueue.length} mission(s) are in publishing queue states.`,
        missionId: null,
        businessId: null
      }));
    }

    if (recommendations.length === 0) {
      recommendations.push(createRecommendation({
        recommendationId: 'REC-001',
        priority: RecommendationPriorities.LOW,
        category: 'OPERATIONS',
        title: 'Maintain current operational posture; no immediate intervention required.',
        rationale: 'No critical or high-priority operational risks were identified.',
        missionId: null,
        businessId: null
      }));
    }

    return this.sortByPriority(recommendations);
  }

  buildRecommendationTitle(risk) {
    if (risk.category === 'CEO_APPROVAL') {
      return 'Resolve pending CEO approval decisions.';
    }

    if (risk.category === 'RUNTIME_FAILURE') {
      return 'Investigate mission runtime failures and recovery posture.';
    }

    if (risk.category === 'QUALITY_BLOCK') {
      return 'Address quality gate blockers before advancement.';
    }

    return `Address ${String(risk.category ?? 'OPERATIONAL_RISK').toLowerCase()} conditions.`;
  }

  resolveBusinessIdForMission(missionCards = [], missionId = null) {
    const match = missionCards.find(card => card.missionId === missionId);

    if (!match) {
      return null;
    }

    return match.businessName;
  }

  resolveExecutiveDecisionItems({ operationsSnapshot = {}, missionCards = [] } = {}) {
    const directApprovals = missionCards
      .filter(card => card.nextAction === 'CEO_APPROVAL')
      .map(card => ({
        missionId: card.missionId,
        businessName: card.businessName,
        priority: RecommendationPriorities.HIGH,
        requiredDecision: 'CEO_APPROVAL'
      }));

    const alertDriven = (Array.isArray(operationsSnapshot.executiveAttentionItems)
      ? operationsSnapshot.executiveAttentionItems
      : [])
      .filter(item => String(item.type ?? '').toUpperCase().trim() === 'CEO_APPROVAL')
      .map(item => ({
        missionId: item.missionId ?? null,
        businessName: this.resolveBusinessNameByMissionId(missionCards, item.missionId),
        priority: String(item.severity ?? RecommendationPriorities.HIGH).toUpperCase().trim(),
        requiredDecision: 'CEO_APPROVAL'
      }));

    const merged = [...directApprovals, ...alertDriven];
    const seen = new Set();

    return merged.filter(item => {
      const key = `${item.missionId}|${item.requiredDecision}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  resolveBusinessNameByMissionId(missionCards = [], missionId = null) {
    const card = missionCards.find(item => item.missionId === missionId);
    return card?.businessName ?? 'Unknown Business';
  }

  countPendingCEOApprovals(operationsSnapshot = {}) {
    const items = Array.isArray(operationsSnapshot.executiveAttentionItems)
      ? operationsSnapshot.executiveAttentionItems
      : [];

    return items.filter(item => String(item.type ?? '').toUpperCase().trim() === 'CEO_APPROVAL').length;
  }

  countPublishingReady(operationsSnapshot = {}) {
    const queue = Array.isArray(operationsSnapshot.publishingQueue)
      ? operationsSnapshot.publishingQueue
      : [];

    return queue.filter(item => {
      const status = String(item.publishingStatus ?? '').toUpperCase().trim();
      return status === 'SCHEDULED' || status.startsWith('PUBLISHED');
    }).length;
  }

  countCriticalAlerts(operationsSnapshot = {}) {
    const attentionCritical = (Array.isArray(operationsSnapshot.executiveAttentionItems)
      ? operationsSnapshot.executiveAttentionItems
      : [])
      .filter(item => String(item.severity ?? '').toUpperCase().trim() === RecommendationPriorities.CRITICAL)
      .length;

    const qualityCritical = (Array.isArray(operationsSnapshot.qualityAlerts)
      ? operationsSnapshot.qualityAlerts
      : [])
      .filter(item => String(item.severity ?? '').toUpperCase().trim() === RecommendationPriorities.CRITICAL)
      .length;

    return attentionCritical + qualityCritical;
  }

  resolveRuntimeVersion(operationsSnapshot = {}) {
    const diagnosticsVersion = operationsSnapshot?.diagnostics?.runtimeVersion;

    if (typeof diagnosticsVersion === 'string' && diagnosticsVersion.trim().length > 0) {
      return diagnosticsVersion;
    }

    return null;
  }

  sortByPriority(items = []) {
    return [...items].sort((left, right) => {
      const leftRank = RecommendationPriorityRank[String(left.priority ?? '').toUpperCase().trim()] ?? 0;
      const rightRank = RecommendationPriorityRank[String(right.priority ?? '').toUpperCase().trim()] ?? 0;

      if (leftRank !== rightRank) {
        return rightRank - leftRank;
      }

      const leftTitle = String(left.title ?? left.message ?? '');
      const rightTitle = String(right.title ?? right.message ?? '');

      return leftTitle.localeCompare(rightTitle);
    });
  }
}

module.exports = {
  CEODashboard
};
