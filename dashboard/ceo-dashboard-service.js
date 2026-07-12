const { HealthStatuses, AlertSeverities, normalizeHealthStatus } = require('../operations/operations-center-contracts.js');
const { ProductionConfigurationManager } = require('../production/production-configuration-manager.js');

const MissionStateRanks = Object.freeze({
  ACTIVE: 4,
  COMPLETED: 3,
  FAILED: 2,
  UNKNOWN: 1
});

const SeverityRanks = Object.freeze({
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
});

class CEODashboardService {
  constructor({
    operationsCenter = null,
    missionRuntime = null,
    businessRegistry = null,
    providerRegistry = null,
    credentialRegistry = null,
    assetRegistry = null,
    knowledgeRegistry = null,
    qualityIntelligence = null,
    executiveCouncil = null,
    productionConfigurationManager = null,
    now = () => Date.now(),
    runtimeVersion = '1.0.0'
  } = {}) {
    this.operationsCenter = operationsCenter;
    this.missionRuntime = missionRuntime;
    this.businessRegistry = businessRegistry;
    this.providerRegistry = providerRegistry;
    this.credentialRegistry = credentialRegistry;
    this.assetRegistry = assetRegistry;
    this.knowledgeRegistry = knowledgeRegistry;
    this.qualityIntelligence = qualityIntelligence;
    this.executiveCouncil = executiveCouncil;
    this.productionConfigurationManager = productionConfigurationManager;
    this.now = now;
    this.runtimeVersion = runtimeVersion;
  }

  generateDashboardSnapshot(input = {}) {
    const startedAt = this.now();
    const sourcesQueried = [];

    const runtimeMissions = this.normalizeMissionInputs(input);
    const businessRegistrySnapshot = this.normalizeBusinessRegistry(input.businessRegistry ?? this.businessRegistry, sourcesQueried);
    const providerRegistrySnapshot = this.normalizeProviderRegistry(input.providerRegistry ?? this.providerRegistry, sourcesQueried);
    const credentialRegistrySnapshot = this.normalizeCredentialRegistry(input.credentialRegistry ?? this.credentialRegistry, sourcesQueried);
    const assetRegistrySnapshot = this.normalizeAssetRegistry(input.assetRegistry ?? this.assetRegistry, sourcesQueried);
    const knowledgeRegistrySnapshot = this.normalizeKnowledgeRegistry(input.knowledgeRegistry ?? this.knowledgeRegistry, sourcesQueried);
    const qualityIntelligenceSnapshot = this.normalizeQualityIntelligence(input.qualityIntelligence ?? this.qualityIntelligence, sourcesQueried);
    const executiveCouncilSnapshot = this.normalizeExecutiveCouncil(input.executiveCouncil ?? this.executiveCouncil, sourcesQueried);

    const operationsSnapshot = this.buildOperationsSnapshot({
      input,
      runtimeMissions,
      businessRegistrySnapshot,
      providerRegistrySnapshot,
      credentialRegistrySnapshot,
      assetRegistrySnapshot,
      knowledgeRegistrySnapshot,
      qualityIntelligenceSnapshot,
      executiveCouncilSnapshot,
      sourcesQueried
    });

    const businessSection = this.buildBusinessSection({
      businessRegistrySnapshot,
      runtimeMissions,
      providerRegistrySnapshot,
      credentialRegistrySnapshot,
      assetRegistrySnapshot,
      knowledgeRegistrySnapshot
    });

    const missionSection = this.buildMissionSection(runtimeMissions);
    const executiveQueue = this.buildExecutiveQueue({
      operationsSnapshot,
      runtimeMissions,
      qualityIntelligenceSnapshot,
      executiveCouncilSnapshot,
      providerRegistrySnapshot,
      credentialRegistrySnapshot,
      assetRegistrySnapshot,
      knowledgeRegistrySnapshot
    });

    const executiveSummary = this.buildExecutiveSummary({
      operationsSnapshot,
      businessSection,
      missionSection,
      executiveQueue,
      input
    });

    const productionConfigurationReport = this.resolveProductionConfigurationReport(input, {
      businessRegistrySnapshot,
      providerRegistrySnapshot,
      credentialRegistrySnapshot
    });

    const diagnostics = this.buildDiagnostics({
      startedAt,
      runtimeVersion: input.runtimeVersion ?? this.runtimeVersion,
      sourcesQueried
    });

    return this.deepFreeze({
      executiveSummary,
      business: businessSection,
      missions: missionSection,
      operations: this.buildOperationsSection({ operationsSnapshot, executiveQueue }),
      executiveQueue,
      productionConfigurationHealth: productionConfigurationReport.productionConfigurationHealth,
      configurationWarnings: productionConfigurationReport.configurationWarnings,
      missingConfiguration: productionConfigurationReport.missingConfiguration,
      launchReadiness: productionConfigurationReport.launchReadiness,
      diagnostics
    });
  }

  resolveProductionConfigurationReport(input = {}, { businessRegistrySnapshot, providerRegistrySnapshot, credentialRegistrySnapshot } = {}) {
    const manager = this.productionConfigurationManager ?? new ProductionConfigurationManager({
      businessRegistry: input.businessRegistry ?? this.businessRegistry,
      providerRegistry: input.providerRegistry ?? this.providerRegistry,
      credentialRegistry: input.credentialRegistry ?? this.credentialRegistry,
      now: this.now
    });

    return manager.generatePortfolioReport({
      businessRegistry: input.businessRegistry ?? this.businessRegistry,
      providerRegistry: input.providerRegistry ?? this.providerRegistry,
      credentialRegistry: input.credentialRegistry ?? this.credentialRegistry,
      configurations: input.productionConfiguration ?? {}
    });
  }

  buildOperationsSnapshot({
    input,
    runtimeMissions,
    businessRegistrySnapshot,
    providerRegistrySnapshot,
    credentialRegistrySnapshot,
    assetRegistrySnapshot,
    knowledgeRegistrySnapshot,
    qualityIntelligenceSnapshot,
    executiveCouncilSnapshot,
    sourcesQueried
  }) {
    if (this.operationsCenter && typeof this.operationsCenter.snapshot === 'function') {
      sourcesQueried.push('operationsCenter');
      return this.operationsCenter.snapshot({
        runtimeMissions,
        queuedMissions: Array.isArray(input.queuedMissions) ? input.queuedMissions : [],
        businessRegistry: businessRegistrySnapshot,
        qualityIntelligence: qualityIntelligenceSnapshot,
        executiveCouncil: executiveCouncilSnapshot,
        knowledgeRegistry: knowledgeRegistrySnapshot,
        providerRegistry: providerRegistrySnapshot,
        credentialRegistry: credentialRegistrySnapshot,
        assetRegistry: assetRegistrySnapshot,
        missionRuntime: this.missionRuntime ?? {}
      });
    }

    return {
      systemHealth: normalizeHealthStatus(input.systemHealth ?? HealthStatuses.HEALTHY),
      runtimeStatus: {
        status: 'HEALTHY',
        totalMissions: runtimeMissions.length,
        activeMissionCount: runtimeMissions.filter(mission => this.isActiveMission(mission)).length,
        queuedMissionCount: Array.isArray(input.queuedMissions) ? input.queuedMissions.length : 0,
        completedMissionCount: runtimeMissions.filter(mission => this.isCompletedMission(mission)).length,
        failedMissionCount: runtimeMissions.filter(mission => this.isFailedMission(mission)).length
      },
      activeMissions: runtimeMissions.filter(mission => this.isActiveMission(mission)),
      queuedMissions: Array.isArray(input.queuedMissions) ? [...input.queuedMissions] : [],
      completedMissions: runtimeMissions.filter(mission => this.isCompletedMission(mission)),
      failedMissions: runtimeMissions.filter(mission => this.isFailedMission(mission)),
      executiveAttentionItems: [],
      qualityAlerts: [],
      publishingQueue: [],
      businessSummary: {
        businessCount: businessRegistrySnapshot.businessCount,
        registeredBusinesses: businessRegistrySnapshot.registeredBusinesses,
        businessHealth: businessRegistrySnapshot.businessHealth,
        businessProfiles: businessRegistrySnapshot.businessProfiles,
        missionCountByBusiness: businessRegistrySnapshot.missionCountByBusiness,
        businesses: businessRegistrySnapshot.businesses
      },
      knowledgeUpdates: knowledgeRegistrySnapshot.updates,
      recentLessonsLearned: [],
      providerHealth: providerRegistrySnapshot.providerHealth,
      credentialHealth: credentialRegistrySnapshot.credentialHealth,
      providerSummary: providerRegistrySnapshot.providerSummary,
      credentialSummary: credentialRegistrySnapshot.credentialSummary,
      missingCredentials: providerRegistrySnapshot.missingCredentials,
      failedProviders: providerRegistrySnapshot.failedProviders,
      quotaWarnings: providerRegistrySnapshot.quotaWarnings,
      verificationFailures: credentialRegistrySnapshot.verificationFailures,
      assetCount: assetRegistrySnapshot.assetSummary.assetCount,
      releaseCandidateCount: assetRegistrySnapshot.assetSummary.releaseCandidateCount,
      approvedAssets: assetRegistrySnapshot.assetSummary.approvedAssets,
      assetsAwaitingReview: assetRegistrySnapshot.assetSummary.assetsAwaitingReview,
      assetIntegrityWarnings: assetRegistrySnapshot.assetSummary.assetIntegrityWarnings,
      assetHealth: assetRegistrySnapshot.assetHealth,
      recentAssets: assetRegistrySnapshot.recentAssets,
      orphanAssets: assetRegistrySnapshot.orphanAssets,
      failedAssets: assetRegistrySnapshot.failedAssets,
      assetGrowth: assetRegistrySnapshot.assetGrowth,
      assetStorageSummary: assetRegistrySnapshot.assetStorageSummary,
      assetsCreatedToday: assetRegistrySnapshot.assetsCreatedToday,
      assetSummary: assetRegistrySnapshot.assetSummary,
      assetStatus: assetRegistrySnapshot.assetStatus,
      diagnostics: {
        snapshotTimestamp: new Date(this.now()).toISOString(),
        runtimeSummary: {
          totalMissions: runtimeMissions.length,
          activeMissionCount: runtimeMissions.filter(mission => this.isActiveMission(mission)).length,
          queuedMissionCount: Array.isArray(input.queuedMissions) ? input.queuedMissions.length : 0,
          completedMissionCount: runtimeMissions.filter(mission => this.isCompletedMission(mission)).length,
          failedMissionCount: runtimeMissions.filter(mission => this.isFailedMission(mission)).length
        },
        healthSummary: {
          systemHealth: normalizeHealthStatus(input.systemHealth ?? HealthStatuses.HEALTHY)
        }
      }
    };
  }

  normalizeMissionInputs(input = {}) {
    const runtimeMissions = [];

    if (Array.isArray(input.runtimeMissions)) {
      runtimeMissions.push(...input.runtimeMissions);
    }

    const missionRuntime = input.missionRuntime ?? this.missionRuntime;
    if (Array.isArray(missionRuntime)) {
      runtimeMissions.push(...missionRuntime);
    } else if (missionRuntime && typeof missionRuntime === 'object') {
      if (Array.isArray(missionRuntime.runtimeMissions)) {
        runtimeMissions.push(...missionRuntime.runtimeMissions);
      } else if (missionRuntime.runtimeContext || missionRuntime.state || missionRuntime.missionId) {
        runtimeMissions.push(missionRuntime);
      }
    }

    const operationsMissions = [
      ...(Array.isArray(input.activeMissions) ? input.activeMissions : []),
      ...(Array.isArray(input.completedMissions) ? input.completedMissions : []),
      ...(Array.isArray(input.failedMissions) ? input.failedMissions : [])
    ];

    if (operationsMissions.length > 0) {
      runtimeMissions.push(...operationsMissions);
    }

    const byMissionId = new Map();

    runtimeMissions.forEach(mission => {
      const normalized = this.normalizeMissionRecord(mission);
      if (!normalized.missionId) {
        return;
      }

      byMissionId.set(normalized.missionId, normalized);
    });

    return [...byMissionId.values()].sort((left, right) => {
      const leftRank = this.resolveMissionRank(left);
      const rightRank = this.resolveMissionRank(right);

      if (leftRank !== rightRank) {
        return rightRank - leftRank;
      }

      return String(left.missionId).localeCompare(String(right.missionId));
    });
  }

  normalizeMissionRecord(mission = {}) {
    const runtimeContext = mission.runtimeContext ?? {};
    const artifacts = runtimeContext.artifacts ?? mission.artifacts ?? {};
    const qualityReview = artifacts.qualityReview ?? mission.qualityReview ?? {};
    const executiveCouncilRuntime = artifacts.executiveCouncilRuntime ?? mission.executiveCouncilRuntime ?? {};
    const publishing = artifacts.publishing ?? mission.publishing ?? {};
    const missionId = mission.missionId ?? runtimeContext.missionId ?? null;
    const businessId = mission.businessId ?? runtimeContext.businessId ?? runtimeContext.runtimeBusinessContext?.businessId ?? null;

    return {
      missionId,
      businessId,
      stage: mission.stage ?? runtimeContext.currentStage ?? mission.currentStage ?? runtimeContext.state ?? mission.state ?? 'UNKNOWN',
      runtimeState: mission.runtimeState ?? mission.state ?? runtimeContext.state ?? 'UNKNOWN',
      qualityDecision: mission.qualityDecision ?? this.resolveQualityDecision(qualityReview),
      executiveDecision: mission.executiveDecision ?? this.resolveExecutiveDecision(executiveCouncilRuntime),
      publishDecision: mission.publishDecision ?? this.resolvePublishDecision(publishing),
      riskLevel: mission.riskLevel ?? this.resolveRiskLevel(mission),
      runtimeDuration: Number(mission.runtimeDuration ?? this.resolveRuntimeDuration(runtimeContext) ?? 0),
      nextRequiredAction: mission.nextRequiredAction ?? mission.nextRequiredDecision ?? this.resolveNextRequiredAction(mission, runtimeContext),
      activeRisks: Array.isArray(mission.activeRisks) ? [...mission.activeRisks] : [],
      completedAt: mission.completedAt ?? runtimeContext.completedAt ?? runtimeContext.endedAt ?? null,
      createdAt: mission.createdAt ?? runtimeContext.initiatedAt ?? null,
      qualityScore: this.resolveQualityScore(qualityReview),
      recentLessonsLearned: Array.isArray(mission.recentLessonsLearned) ? [...mission.recentLessonsLearned] : []
    };
  }

  buildBusinessSection({
    businessRegistrySnapshot,
    runtimeMissions,
    providerRegistrySnapshot,
    credentialRegistrySnapshot,
    assetRegistrySnapshot,
    knowledgeRegistrySnapshot
  }) {
    const missionByBusiness = new Map();
    runtimeMissions.forEach(mission => {
      const businessId = String(mission.businessId ?? '').trim().toUpperCase();
      if (!businessId) {
        return;
      }

      const current = missionByBusiness.get(businessId) ?? [];
      current.push(mission);
      missionByBusiness.set(businessId, current);
    });

    const profiles = Array.isArray(businessRegistrySnapshot.businessProfiles) && businessRegistrySnapshot.businessProfiles.length > 0
      ? businessRegistrySnapshot.businessProfiles
      : businessRegistrySnapshot.registeredBusinesses.map(businessId => ({ businessId, displayName: businessId, status: 'ACTIVE' }));

    return profiles.map(profile => {
      const businessId = String(profile.businessId ?? '').toUpperCase().trim();
      const missions = missionByBusiness.get(businessId) ?? [];

      return this.freezeBusinessItem({
        businessId,
        displayName: profile.displayName ?? profile.businessName ?? businessId,
        status: profile.status ?? 'UNKNOWN',
        activeMissions: missions.filter(mission => this.isActiveMission(mission)).length,
        completedToday: missions.filter(mission => this.isCompletedToday(mission)).length,
        qualityAverage: this.computeQualityAverage(missions),
        providerHealth: this.buildBusinessProviderHealth(providerRegistrySnapshot, profile),
        credentialHealth: this.buildBusinessCredentialHealth(credentialRegistrySnapshot, profile),
        knowledgeItems: this.countKnowledgeItems(knowledgeRegistrySnapshot, businessId),
        assetCount: this.countBusinessAssets(assetRegistrySnapshot, businessId)
      });
    }).sort((left, right) => String(left.businessId).localeCompare(String(right.businessId)));
  }

  buildMissionSection(runtimeMissions = []) {
    return runtimeMissions.map(mission => this.freezeMissionItem({
      missionId: mission.missionId,
      businessId: mission.businessId,
      stage: mission.stage,
      runtimeState: mission.runtimeState,
      qualityDecision: mission.qualityDecision,
      executiveDecision: mission.executiveDecision,
      publishDecision: mission.publishDecision,
      riskLevel: mission.riskLevel,
      runtimeDuration: mission.runtimeDuration,
      nextRequiredAction: mission.nextRequiredAction
    }));
  }

  buildOperationsSection({ operationsSnapshot, executiveQueue }) {
    return this.deepFreeze({
      queueDepth: Number(operationsSnapshot.runtimeStatus?.queuedMissionCount ?? 0),
      systemHealth: operationsSnapshot.systemHealth ?? 'UNKNOWN',
      providerHealth: this.cloneValue(operationsSnapshot.providerHealth ?? {}),
      credentialWarnings: Number(operationsSnapshot.credentialSummary?.warningCredentials ?? 0),
      qualityAlerts: this.cloneValue(operationsSnapshot.qualityAlerts ?? []),
      knowledgeUpdates: this.cloneValue(operationsSnapshot.knowledgeUpdates ?? []),
      recentLessons: this.cloneValue(operationsSnapshot.recentLessonsLearned ?? []),
      executiveQueueDepth: Number(executiveQueue.items.length)
    });
  }

  buildExecutiveQueue({
    operationsSnapshot,
    qualityIntelligenceSnapshot,
    executiveCouncilSnapshot,
    providerRegistrySnapshot,
    credentialRegistrySnapshot,
    assetRegistrySnapshot,
    knowledgeRegistrySnapshot
  }) {
    const items = [];

    this.collectQueueItemsFromMissions(operationsSnapshot, items);
    this.collectQueueItemsFromQuality(qualityIntelligenceSnapshot, items);
    this.collectQueueItemsFromExecutiveCouncil(executiveCouncilSnapshot, items);
    this.collectQueueItemsFromRegistryHealth(providerRegistrySnapshot, credentialRegistrySnapshot, assetRegistrySnapshot, knowledgeRegistrySnapshot, items);

    const sorted = items
      .map(item => this.normalizeQueueItem(item))
      .sort((left, right) => {
        const leftRank = SeverityRanks[left.severity] ?? 0;
        const rightRank = SeverityRanks[right.severity] ?? 0;

        if (leftRank !== rightRank) {
          return rightRank - leftRank;
        }

        return String(left.missionId ?? left.message ?? '').localeCompare(String(right.missionId ?? right.message ?? ''));
      });

    return this.deepFreeze({
      items: sorted,
      counts: {
        critical: sorted.filter(item => item.severity === AlertSeverities.CRITICAL).length,
        high: sorted.filter(item => item.severity === AlertSeverities.HIGH).length,
        medium: sorted.filter(item => item.severity === AlertSeverities.MEDIUM).length,
        low: sorted.filter(item => item.severity === AlertSeverities.LOW).length
      },
      total: sorted.length
    });
  }

  buildExecutiveSummary({ operationsSnapshot, businessSection, missionSection, executiveQueue, input }) {
    const overallHealth = operationsSnapshot.systemHealth ?? 'UNKNOWN';

    return this.deepFreeze({
      overallHealth,
      businessCount: businessSection.length,
      activeMissionCount: missionSection.filter(mission => this.isActiveMission(mission)).length,
      completedMissionCount: missionSection.filter(mission => this.isCompletedMission(mission)).length,
      failedMissionCount: missionSection.filter(mission => this.isFailedMission(mission)).length,
      criticalAlerts: executiveQueue.counts.critical,
      pendingCEOApprovals: executiveQueue.items.filter(item => item.type === 'CEO_APPROVAL').length,
      publishingReady: Number(operationsSnapshot.publishingQueue?.length ?? 0),
      highestPriorityRecommendation: executiveQueue.items[0]?.message ?? null,
      systemVersion: input.systemVersion ?? this.runtimeVersion,
      snapshotTimestamp: operationsSnapshot.diagnostics?.snapshotTimestamp ?? new Date(this.now()).toISOString()
    });
  }

  buildDiagnostics({ startedAt, runtimeVersion, sourcesQueried }) {
    return this.deepFreeze({
      snapshotGenerationTime: new Date(startedAt).toISOString(),
      sourcesQueried: [...new Set(sourcesQueried)],
      generationDuration: Math.max(0, this.now() - startedAt),
      runtimeVersion: runtimeVersion ?? this.runtimeVersion
    });
  }

  normalizeBusinessRegistry(registry, sourcesQueried) {
    sourcesQueried.push('businessRegistry');

    if (registry && typeof registry.listBusinesses === 'function') {
      const businessProfiles = registry.listBusinesses().map(profile => this.cloneValue(profile));
      const businessIds = businessProfiles.map(profile => String(profile.businessId ?? '').toUpperCase().trim()).filter(Boolean);

      return {
        businessCount: typeof registry.getBusinessCount === 'function' ? registry.getBusinessCount() : businessProfiles.length,
        registeredBusinesses: businessIds,
        businessHealth: typeof registry.getBusinessHealth === 'function' ? this.cloneValue(registry.getBusinessHealth()) : {},
        businessProfiles,
        missionCountByBusiness: {},
        businesses: businessProfiles.map(profile => ({
          businessId: String(profile.businessId ?? '').toUpperCase().trim(),
          displayName: profile.displayName ?? profile.businessName ?? String(profile.businessId ?? '').toUpperCase().trim(),
          status: profile.status ?? 'UNKNOWN'
        }))
      };
    }

    const fallbackProfiles = Array.isArray(registry?.businessProfiles) ? registry.businessProfiles : [];

    return {
      businessCount: Number(registry?.businessCount ?? fallbackProfiles.length ?? 0),
      registeredBusinesses: Array.isArray(registry?.registeredBusinesses) ? [...registry.registeredBusinesses] : [],
      businessHealth: this.cloneValue(registry?.businessHealth ?? {}),
      businessProfiles: fallbackProfiles.map(profile => this.cloneValue(profile)),
      missionCountByBusiness: this.cloneValue(registry?.missionCountByBusiness ?? {}),
      businesses: Array.isArray(registry?.businesses) ? registry.businesses.map(item => this.cloneValue(item)) : []
    };
  }

  normalizeProviderRegistry(registry, sourcesQueried) {
    sourcesQueried.push('providerRegistry');

    if (registry && typeof registry.getProviderSummary === 'function') {
      const summary = registry.getProviderSummary({ credentialRegistry: this.credentialRegistry ?? null });
      return {
        status: typeof registry.getHealth === 'function' ? registry.getHealth() : summary.failedProviders.length > 0 ? 'FAILED' : 'HEALTHY',
        providerSummary: summary,
        providerHealth: {
          status: typeof registry.getHealth === 'function' ? registry.getHealth() : 'HEALTHY',
          issues: summary.failedProviders.map(providerId => ({ providerId, issue: 'FAILED_PROVIDER' }))
        },
        missingCredentials: summary.missingCredentials ?? [],
        failedProviders: summary.failedProviders ?? [],
        quotaWarnings: summary.quotaWarnings ?? []
      };
    }

    return {
      status: normalizeHealthStatus(registry?.status ?? HealthStatuses.HEALTHY),
      providerSummary: this.cloneValue(registry?.providerSummary ?? {
        providerCount: Number(registry?.providerCount ?? 0),
        configuredProviders: Number(registry?.configuredProviders ?? 0),
        healthyProviders: Number(registry?.healthyProviders ?? 0),
        productionReadyProviders: Number(registry?.productionReadyProviders ?? 0)
      }),
      providerHealth: this.cloneValue(registry?.providerHealth ?? { status: normalizeHealthStatus(registry?.status ?? HealthStatuses.HEALTHY), issues: [] }),
      missingCredentials: Array.isArray(registry?.missingCredentials) ? [...registry.missingCredentials] : [],
      failedProviders: Array.isArray(registry?.failedProviders) ? [...registry.failedProviders] : [],
      quotaWarnings: Array.isArray(registry?.quotaWarnings) ? [...registry.quotaWarnings] : []
    };
  }

  normalizeCredentialRegistry(registry, sourcesQueried) {
    sourcesQueried.push('credentialRegistry');

    if (registry && typeof registry.getCredentialSummary === 'function') {
      const summary = registry.getCredentialSummary();
      return {
        status: summary.warningCredentials > 0 ? 'WARNING' : 'HEALTHY',
        credentialSummary: summary,
        credentialHealth: {
          status: summary.warningCredentials > 0 ? 'WARNING' : 'HEALTHY',
          issues: []
        },
        verificationFailures: []
      };
    }

    return {
      status: normalizeHealthStatus(registry?.status ?? HealthStatuses.HEALTHY),
      credentialSummary: this.cloneValue(registry?.credentialSummary ?? {
        credentialCount: Number(registry?.credentialCount ?? 0),
        configuredCredentials: Number(registry?.configuredCredentials ?? 0),
        verifiedCredentials: Number(registry?.verifiedCredentials ?? 0),
        warningCredentials: Number(registry?.warningCredentials ?? 0)
      }),
      credentialHealth: this.cloneValue(registry?.credentialHealth ?? { status: normalizeHealthStatus(registry?.status ?? HealthStatuses.HEALTHY), issues: [] }),
      verificationFailures: Array.isArray(registry?.verificationFailures) ? [...registry.verificationFailures] : []
    };
  }

  normalizeAssetRegistry(registry, sourcesQueried) {
    sourcesQueried.push('assetRegistry');

    if (registry && typeof registry.getAssetSummary === 'function') {
      const summary = registry.getAssetSummary();
      return {
        assetSummary: this.cloneValue(summary),
        assetHealth: this.cloneValue(summary.assetHealth ?? { status: 'UNKNOWN', issues: [] }),
        assetGrowth: this.cloneValue(summary.assetGrowth ?? {}),
        assetStorageSummary: this.cloneValue(summary.assetStorageSummary ?? {}),
        assetsCreatedToday: Number(summary.assetsCreatedToday ?? 0),
        recentAssets: this.cloneValue(summary.recentAssets ?? []),
        orphanAssets: this.cloneValue(summary.orphanAssets ?? []),
        failedAssets: this.cloneValue(summary.failedAssets ?? []),
        assetCount: Number(summary.assetCount ?? 0),
        releaseCandidateCount: Number(summary.releaseCandidateCount ?? 0),
        approvedAssets: Number(summary.approvedAssets ?? 0),
        assetsAwaitingReview: Number(summary.assetsAwaitingReview ?? 0),
        assetIntegrityWarnings: Number(summary.assetIntegrityWarnings ?? 0),
        status: summary.assetHealth?.status ?? 'UNKNOWN'
      };
    }

    return {
      assetSummary: this.cloneValue(registry?.assetSummary ?? {
        assetCount: Number(registry?.assetCount ?? 0),
        releaseCandidateCount: Number(registry?.releaseCandidateCount ?? 0),
        approvedAssets: Number(registry?.approvedAssets ?? 0),
        assetsAwaitingReview: Number(registry?.assetsAwaitingReview ?? 0),
        assetIntegrityWarnings: Number(registry?.assetIntegrityWarnings ?? 0)
      }),
      assetHealth: this.cloneValue(registry?.assetHealth ?? { status: normalizeHealthStatus(registry?.status ?? HealthStatuses.HEALTHY), issues: [] }),
      assetGrowth: this.cloneValue(registry?.assetGrowth ?? {}),
      assetStorageSummary: this.cloneValue(registry?.assetStorageSummary ?? {}),
      assetsCreatedToday: Number(registry?.assetsCreatedToday ?? 0),
      recentAssets: Array.isArray(registry?.recentAssets) ? [...registry.recentAssets] : [],
      orphanAssets: Array.isArray(registry?.orphanAssets) ? [...registry.orphanAssets] : [],
      failedAssets: Array.isArray(registry?.failedAssets) ? [...registry.failedAssets] : [],
      assetCount: Number(registry?.assetCount ?? 0),
      releaseCandidateCount: Number(registry?.releaseCandidateCount ?? 0),
      approvedAssets: Number(registry?.approvedAssets ?? 0),
      assetsAwaitingReview: Number(registry?.assetsAwaitingReview ?? 0),
      assetIntegrityWarnings: Number(registry?.assetIntegrityWarnings ?? 0),
      status: normalizeHealthStatus(registry?.status ?? HealthStatuses.HEALTHY)
    };
  }

  normalizeKnowledgeRegistry(registry, sourcesQueried) {
    sourcesQueried.push('knowledgeRegistry');

    const items = this.extractKnowledgeItems(registry);

    return {
      items,
      updates: Array.isArray(registry?.updates) ? registry.updates.map(item => this.cloneValue(item)) : items,
      conflicts: Array.isArray(registry?.conflicts) ? registry.conflicts.map(item => this.cloneValue(item)) : [],
      status: normalizeHealthStatus(registry?.status ?? HealthStatuses.HEALTHY)
    };
  }

  normalizeQualityIntelligence(qualityIntelligence, sourcesQueried) {
    sourcesQueried.push('qualityIntelligence');

    return {
      status: normalizeHealthStatus(qualityIntelligence?.status ?? HealthStatuses.HEALTHY),
      alerts: Array.isArray(qualityIntelligence?.alerts) ? qualityIntelligence.alerts.map(item => this.cloneValue(item)) : []
    };
  }

  normalizeExecutiveCouncil(executiveCouncil, sourcesQueried) {
    sourcesQueried.push('executiveCouncil');

    if (executiveCouncil && typeof executiveCouncil.evaluate === 'function') {
      return {
        status: normalizeHealthStatus(executiveCouncil.status ?? HealthStatuses.HEALTHY),
        conflicts: Array.isArray(executiveCouncil.conflicts) ? executiveCouncil.conflicts.map(item => this.cloneValue(item)) : [],
        expiredWaivers: Array.isArray(executiveCouncil.expiredWaivers) ? executiveCouncil.expiredWaivers.map(item => this.cloneValue(item)) : [],
        recommendations: Array.isArray(executiveCouncil.recommendations) ? executiveCouncil.recommendations.map(item => this.cloneValue(item)) : []
      };
    }

    return {
      status: normalizeHealthStatus(executiveCouncil?.status ?? HealthStatuses.HEALTHY),
      conflicts: Array.isArray(executiveCouncil?.conflicts) ? executiveCouncil.conflicts.map(item => this.cloneValue(item)) : [],
      expiredWaivers: Array.isArray(executiveCouncil?.expiredWaivers) ? executiveCouncil.expiredWaivers.map(item => this.cloneValue(item)) : [],
      recommendations: Array.isArray(executiveCouncil?.recommendations) ? executiveCouncil.recommendations.map(item => this.cloneValue(item)) : []
    };
  }

  collectQueueItemsFromMissions(operationsSnapshot, items) {
    const missions = [
      ...(Array.isArray(operationsSnapshot.activeMissions) ? operationsSnapshot.activeMissions : []),
      ...(Array.isArray(operationsSnapshot.completedMissions) ? operationsSnapshot.completedMissions : []),
      ...(Array.isArray(operationsSnapshot.failedMissions) ? operationsSnapshot.failedMissions : [])
    ];

    missions.forEach(mission => {
      if (mission.nextRequiredDecision === 'CEO_APPROVAL') {
        items.push({
          type: 'CEO_APPROVAL',
          severity: AlertSeverities.HIGH,
          missionId: mission.missionId,
          businessId: mission.businessId,
          message: `Mission ${mission.missionId} is pending CEO approval.`
        });
      }

      if (mission.qualityStatus === 'BLOCK') {
        items.push({
          type: 'QUALITY_BLOCK',
          severity: AlertSeverities.HIGH,
          missionId: mission.missionId,
          businessId: mission.businessId,
          message: `Mission ${mission.missionId} is blocked by quality gate.`
        });
      }

      if (mission.currentState === 'FAILED') {
        items.push({
          type: 'RUNTIME_FAILURE',
          severity: AlertSeverities.CRITICAL,
          missionId: mission.missionId,
          businessId: mission.businessId,
          message: `Mission ${mission.missionId} failed during runtime execution.`
        });
      }

      if (mission.riskLevel === 'MEDIUM' || mission.riskLevel === 'HIGH' || mission.riskLevel === 'CRITICAL') {
        items.push({
          type: 'KNOWLEDGE_CONFLICT',
          severity: mission.riskLevel,
          missionId: mission.missionId,
          businessId: mission.businessId,
          message: `Mission ${mission.missionId} carries ${mission.riskLevel} risk.`
        });
      }
    });
  }

  collectQueueItemsFromQuality(qualityIntelligenceSnapshot, items) {
    (Array.isArray(qualityIntelligenceSnapshot.alerts) ? qualityIntelligenceSnapshot.alerts : [])
      .forEach(alert => {
        items.push({
          type: String(alert.type ?? 'QUALITY_ALERT').toUpperCase(),
          severity: this.normalizeSeverity(alert.severity),
          missionId: alert.missionId ?? null,
          businessId: alert.businessId ?? null,
          message: alert.message ?? 'Quality alert.'
        });
      });
  }

  collectQueueItemsFromExecutiveCouncil(executiveCouncilSnapshot, items) {
    (Array.isArray(executiveCouncilSnapshot.expiredWaivers) ? executiveCouncilSnapshot.expiredWaivers : [])
      .forEach(waiver => {
        items.push({
          type: 'EXPIRED_WAIVER',
          severity: AlertSeverities.MEDIUM,
          missionId: waiver.missionId ?? null,
          businessId: waiver.businessId ?? null,
          message: waiver.message ?? 'Executive waiver has expired.'
        });
      });

    (Array.isArray(executiveCouncilSnapshot.conflicts) ? executiveCouncilSnapshot.conflicts : [])
      .forEach(conflict => {
        items.push({
          type: 'KNOWLEDGE_CONFLICT',
          severity: this.normalizeSeverity(conflict.severity ?? AlertSeverities.HIGH),
          missionId: conflict.missionId ?? null,
          businessId: conflict.businessId ?? null,
          message: conflict.message ?? 'Executive conflict detected.'
        });
      });
  }

  collectQueueItemsFromRegistryHealth(providerRegistrySnapshot, credentialRegistrySnapshot, assetRegistrySnapshot, knowledgeRegistrySnapshot, items) {
    if (normalizeHealthStatus(providerRegistrySnapshot.status ?? HealthStatuses.HEALTHY) === HealthStatuses.FAILED) {
      items.push({
        type: 'PROVIDER_OUTAGE',
        severity: AlertSeverities.CRITICAL,
        message: 'Provider registry indicates outage state.'
      });
    }

    if (normalizeHealthStatus(credentialRegistrySnapshot.status ?? HealthStatuses.HEALTHY) === HealthStatuses.FAILED) {
      items.push({
        type: 'CREDENTIAL_FAILURE',
        severity: AlertSeverities.CRITICAL,
        message: 'Credential registry indicates failure state.'
      });
    }

    if (normalizeHealthStatus(assetRegistrySnapshot.status ?? HealthStatuses.HEALTHY) !== HealthStatuses.HEALTHY) {
      items.push({
        type: 'CRITICAL_OPERATIONAL_ALERT',
        severity: assetRegistrySnapshot.status === HealthStatuses.FAILED ? AlertSeverities.CRITICAL : AlertSeverities.HIGH,
        message: 'Asset registry integrity requires attention.'
      });
    }

    if ((Array.isArray(knowledgeRegistrySnapshot.conflicts) ? knowledgeRegistrySnapshot.conflicts.length : 0) > 0) {
      items.push({
        type: 'KNOWLEDGE_CONFLICT',
        severity: AlertSeverities.HIGH,
        message: 'Knowledge registry contains conflicts.'
      });
    }
  }

  buildBusinessProviderHealth(providerRegistrySnapshot, profile) {
    return this.deepFreeze({
      status: providerRegistrySnapshot.status ?? 'UNKNOWN',
      summary: this.cloneValue(providerRegistrySnapshot.providerSummary ?? {}),
      profile: String(profile.productionProfile ?? profile.defaultProductionProfile ?? '').trim() || null
    });
  }

  buildBusinessCredentialHealth(credentialRegistrySnapshot, profile) {
    return this.deepFreeze({
      status: credentialRegistrySnapshot.status ?? 'UNKNOWN',
      summary: this.cloneValue(credentialRegistrySnapshot.credentialSummary ?? {}),
      profile: String(profile.credentialProfile ?? '').trim() || null
    });
  }

  computeQualityAverage(missions = []) {
    const scores = missions
      .map(mission => Number(mission.qualityScore ?? this.resolveQualityScore(mission.qualityDecision)))
      .filter(score => Number.isFinite(score));

    if (scores.length === 0) {
      return 0;
    }

    const total = scores.reduce((sum, score) => sum + score, 0);
    return Math.round((total / scores.length) * 100) / 100;
  }

  countKnowledgeItems(knowledgeRegistrySnapshot, businessId) {
    return this.extractKnowledgeItems(knowledgeRegistrySnapshot)
      .filter(item => String(item.businessId ?? '').toUpperCase().trim() === businessId)
      .length;
  }

  countBusinessAssets(assetRegistrySnapshot, businessId) {
    const assets = Array.isArray(assetRegistrySnapshot.assetSummary?.recentAssets)
      ? assetRegistrySnapshot.assetSummary.recentAssets
      : Array.isArray(assetRegistrySnapshot.recentAssets)
        ? assetRegistrySnapshot.recentAssets
        : [];

    const assetCount = assets.filter(asset => String(asset.businessId ?? '').toUpperCase().trim() === businessId).length;

    if (assetCount > 0) {
      return assetCount;
    }

    return Number(assetRegistrySnapshot.assetSummary?.assetCount ?? 0);
  }

  extractKnowledgeItems(registry) {
    if (!registry || typeof registry !== 'object') {
      return [];
    }

    if (typeof registry.listKnowledgeItems === 'function') {
      return registry.listKnowledgeItems().map(item => this.cloneValue(item));
    }

    if (typeof registry.listItems === 'function') {
      return registry.listItems().map(item => this.cloneValue(item));
    }

    if (typeof registry.getKnowledgeItems === 'function') {
      return registry.getKnowledgeItems().map(item => this.cloneValue(item));
    }

    if (Array.isArray(registry.items)) {
      return registry.items.map(item => this.cloneValue(item));
    }

    if (Array.isArray(registry.knowledgeItems)) {
      return registry.knowledgeItems.map(item => this.cloneValue(item));
    }

    if (Array.isArray(registry.updates)) {
      return registry.updates.map(item => this.cloneValue(item));
    }

    return [];
  }

  normalizeSeverity(value) {
    const normalized = String(value ?? '').toUpperCase().trim();
    if (normalized === AlertSeverities.CRITICAL || normalized === AlertSeverities.HIGH || normalized === AlertSeverities.MEDIUM || normalized === AlertSeverities.LOW) {
      return normalized;
    }

    return AlertSeverities.LOW;
  }

  normalizeMissionRank(mission) {
    if (this.isFailedMission(mission)) {
      return MissionStateRanks.FAILED;
    }

    if (this.isCompletedMission(mission)) {
      return MissionStateRanks.COMPLETED;
    }

    if (this.isActiveMission(mission)) {
      return MissionStateRanks.ACTIVE;
    }

    return MissionStateRanks.UNKNOWN;
  }

  resolveMissionRank(mission) {
    return this.normalizeMissionRank(mission);
  }

  resolveQualityDecision(qualityReview = {}) {
    if (qualityReview.passed === true) {
      return 'PASS';
    }

    if (qualityReview.passed === false) {
      return 'BLOCK';
    }

    return String(qualityReview.reviewDecision ?? 'UNKNOWN').toUpperCase().trim() || 'UNKNOWN';
  }

  resolveExecutiveDecision(executiveCouncilRuntime = {}) {
    return String(executiveCouncilRuntime.recommendedCEOAction ?? executiveCouncilRuntime.outcome ?? 'IN_PROGRESS').toUpperCase().trim() || 'IN_PROGRESS';
  }

  resolvePublishDecision(publishing = {}) {
    return String(publishing.publishStatus ?? publishing.status ?? 'NOT_REQUESTED').toUpperCase().trim() || 'NOT_REQUESTED';
  }

  resolveRiskLevel(mission = {}) {
    return String(mission.riskLevel ?? 'LOW').toUpperCase().trim() || 'LOW';
  }

  resolveRuntimeDuration(runtimeContext = {}) {
    const initiatedAt = runtimeContext.initiatedAt ?? runtimeContext.startedAt ?? null;
    if (typeof initiatedAt !== 'string' || initiatedAt.trim().length === 0) {
      return 0;
    }

    const started = Date.parse(initiatedAt);
    if (!Number.isFinite(started)) {
      return 0;
    }

    return Math.max(0, this.now() - started);
  }

  resolveNextRequiredAction(mission = {}, runtimeContext = {}) {
    return String(mission.nextRequiredAction ?? mission.nextRequiredDecision ?? runtimeContext.nextRequiredDecision ?? 'NONE').toUpperCase().trim() || 'NONE';
  }

  resolveQualityScore(qualityDecision) {
    if (typeof qualityDecision === 'number') {
      return qualityDecision;
    }

    const normalized = String(qualityDecision ?? '').toUpperCase().trim();
    if (normalized === 'PASS') {
      return 100;
    }

    if (normalized === 'BLOCK') {
      return 0;
    }

    if (normalized === 'REVISE') {
      return 60;
    }

    return 50;
  }

  isActiveMission(mission = {}) {
    const state = String(mission.runtimeState ?? mission.state ?? mission.currentState ?? '').toUpperCase().trim();
    return !['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'CEO_REJECTED', 'CEO_REVISION'].includes(state);
  }

  isCompletedMission(mission = {}) {
    const state = String(mission.runtimeState ?? mission.state ?? mission.currentState ?? '').toUpperCase().trim();
    return state === 'COMPLETED';
  }

  isFailedMission(mission = {}) {
    const state = String(mission.runtimeState ?? mission.state ?? mission.currentState ?? '').toUpperCase().trim();
    return ['FAILED', 'BLOCKED', 'CEO_REJECTED', 'CEO_REVISION'].includes(state);
  }

  isCompletedToday(mission = {}) {
    const completedAt = mission.completedAt ?? mission.endedAt ?? null;

    if (typeof completedAt !== 'string' || completedAt.trim().length === 0) {
      return false;
    }

    const completedTime = Date.parse(completedAt);
    if (!Number.isFinite(completedTime)) {
      return false;
    }

    const nowDate = new Date(this.now());
    const startOfToday = new Date(nowDate);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(nowDate);
    endOfToday.setHours(23, 59, 59, 999);

    return completedTime >= startOfToday.getTime() && completedTime <= endOfToday.getTime();
  }

  normalizeQueueItem(item = {}) {
    return this.freezeQueueItem({
      type: String(item.type ?? 'GENERAL').toUpperCase().trim() || 'GENERAL',
      severity: this.normalizeSeverity(item.severity),
      missionId: item.missionId ?? null,
      businessId: item.businessId ?? null,
      message: item.message ?? 'Executive attention required.',
      details: this.cloneValue(item.details ?? null),
      createdAt: item.createdAt ?? new Date(this.now()).toISOString()
    });
  }

  freezeBusinessItem(item) {
    return this.deepFreeze(item);
  }

  freezeMissionItem(item) {
    return this.deepFreeze(item);
  }

  freezeQueueItem(item) {
    return this.deepFreeze(item);
  }

  cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map(item => this.cloneValue(item));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const cloned = {};
    Object.keys(value).forEach(key => {
      cloned[key] = this.cloneValue(value[key]);
    });

    return cloned;
  }

  deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }

    Object.getOwnPropertyNames(value).forEach(name => {
      this.deepFreeze(value[name]);
    });

    return Object.freeze(value);
  }
}

module.exports = {
  CEODashboardService
};