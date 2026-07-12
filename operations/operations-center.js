const {
  HealthStatuses,
  AlertSeverities,
  AttentionTypes,
  normalizeHealthStatus,
  createOperationsMissionView,
  createOperationsDashboard
} = require('./operations-center-contracts.js');
const { ProductionConfigurationManager } = require('../production/production-configuration-manager.js');

const SEVERITY_RANK = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

const HEALTH_RANK = {
  FAILED: 4,
  DEGRADED: 3,
  WARNING: 2,
  HEALTHY: 1
};

class OperationsCenter {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
  }

  snapshot({
    runtimeMissions = [],
    queuedMissions = [],
    businessRegistry = {},
    qualityIntelligence = {},
    executiveCouncil = {},
    knowledgeRegistry = {},
    businessAdmission = {},
    publishing = {},
    providerRegistry = {},
    credentialRegistry = {},
    assetRegistry = {},
    mediaEngine = {},
    missionRuntime = {},
    operationsCenter = {}
  } = {}) {
    const snapshotTimestamp = new Date(this.now()).toISOString();
    const missionViews = this.normalizeMissionViews(runtimeMissions);
    const missionBuckets = this.partitionMissions(missionViews);
    const systemComponents = this.buildSystemComponents({
      missionRuntime,
      mediaEngine,
      qualityIntelligence,
      publishing,
      knowledgeRegistry,
      assetRegistry,
      providerRegistry,
      credentialRegistry,
      operationsCenter
    });
    const systemHealth = this.aggregateSystemHealth(systemComponents);
    const executiveAttentionItems = this.buildExecutiveAttentionQueue({
      missionViews,
      qualityIntelligence,
      executiveCouncil,
      knowledgeRegistry,
      assetRegistry,
      providerRegistry,
      credentialRegistry,
      operationsCenter
    });
    const qualityAlerts = this.buildQualityAlerts({ missionViews, qualityIntelligence });
    const publishingQueue = this.buildPublishingQueue(missionViews);
    const businessSummary = this.buildBusinessSummary({
      missionViews,
      queuedMissions,
      businessAdmission,
      businessRegistry
    });
    const productionConfigurationReport = this.resolveProductionConfigurationReport({
      businessRegistry,
      providerRegistry,
      credentialRegistry,
      productionConfiguration: operationsCenter.productionConfiguration ?? null,
      productionConfigurationManager: operationsCenter.productionConfigurationManager ?? null
    });
    const providerCredentialIntegration = this.buildProviderCredentialIntegration({
      providerRegistry,
      credentialRegistry
    });
    const assetIntegration = this.buildAssetIntegration({ assetRegistry });
    const knowledgeUpdates = this.buildKnowledgeUpdates({ missionViews, knowledgeRegistry });
    const recentLessonsLearned = this.collectRecentLessons(missionViews);

    const dashboard = createOperationsDashboard({
      systemHealth,
      runtimeStatus: {
        status: this.computeRuntimeStatus(missionBuckets),
        totalMissions: missionViews.length,
        activeMissionCount: missionBuckets.activeMissions.length,
        queuedMissionCount: queuedMissions.length,
        completedMissionCount: missionBuckets.completedMissions.length,
        failedMissionCount: missionBuckets.failedMissions.length
      },
      activeMissions: missionBuckets.activeMissions,
      queuedMissions: Array.isArray(queuedMissions) ? [...queuedMissions] : [],
      completedMissions: missionBuckets.completedMissions,
      failedMissions: missionBuckets.failedMissions,
      executiveAttentionItems,
      qualityAlerts,
      publishingQueue,
      businessSummary,
      knowledgeUpdates,
      recentLessonsLearned,
      configurationSummary: productionConfigurationReport.configurationSummary,
      configurationDrift: productionConfigurationReport.configurationDrift,
      missingProductionItems: productionConfigurationReport.missingConfiguration,
      assetCount: assetIntegration.assetCount,
      releaseCandidateCount: assetIntegration.assetSummary.releaseCandidateCount,
      approvedAssets: assetIntegration.assetSummary.approvedAssets,
      assetsAwaitingReview: assetIntegration.assetSummary.assetsAwaitingReview,
      assetIntegrityWarnings: assetIntegration.assetSummary.assetIntegrityWarnings,
      assetHealth: assetIntegration.assetHealth,
      recentAssets: assetIntegration.recentAssets,
      orphanAssets: assetIntegration.orphanAssets,
      failedAssets: assetIntegration.failedAssets,
      assetGrowth: assetIntegration.assetGrowth,
      assetStorageSummary: assetIntegration.assetStorageSummary,
      assetsCreatedToday: assetIntegration.assetsCreatedToday,
      assetSummary: assetIntegration.assetSummary,
      assetStatus: assetIntegration.assetStatus,
      providerHealth: this.buildRegistryHealth(providerRegistry),
      credentialHealth: this.buildRegistryHealth(credentialRegistry),
      providerSummary: providerCredentialIntegration.providerSummary,
      credentialSummary: providerCredentialIntegration.credentialSummary,
      missingCredentials: providerCredentialIntegration.missingCredentials,
      failedProviders: providerCredentialIntegration.failedProviders,
      quotaWarnings: providerCredentialIntegration.quotaWarnings,
      verificationFailures: providerCredentialIntegration.verificationFailures,
      diagnostics: {
        snapshotTimestamp,
        runtimeSummary: {
          totalMissions: missionViews.length,
          activeMissionCount: missionBuckets.activeMissions.length,
          queuedMissionCount: queuedMissions.length,
          completedMissionCount: missionBuckets.completedMissions.length,
          failedMissionCount: missionBuckets.failedMissions.length
        },
        healthSummary: {
          systemHealth,
          components: systemComponents
        },
        businessSummary,
        missionSummary: {
          activeMissionIds: missionBuckets.activeMissions.map(mission => mission.missionId),
          completedMissionIds: missionBuckets.completedMissions.map(mission => mission.missionId),
          failedMissionIds: missionBuckets.failedMissions.map(mission => mission.missionId)
        },
        assetSummary: assetIntegration.assetSummary,
        releaseCandidateCount: assetIntegration.assetSummary.releaseCandidateCount,
        approvedAssets: assetIntegration.assetSummary.approvedAssets,
        assetsAwaitingReview: assetIntegration.assetSummary.assetsAwaitingReview,
        assetIntegrityWarnings: assetIntegration.assetSummary.assetIntegrityWarnings,
        alertSummary: {
          totalAlerts: executiveAttentionItems.length,
          criticalAlerts: executiveAttentionItems.filter(alert => alert.severity === AlertSeverities.CRITICAL).length,
          highAlerts: executiveAttentionItems.filter(alert => alert.severity === AlertSeverities.HIGH).length
        },
        providerCredentialSummary: {
          providerSummary: providerCredentialIntegration.providerSummary,
          credentialSummary: providerCredentialIntegration.credentialSummary,
          missingCredentials: providerCredentialIntegration.missingCredentials,
          failedProviders: providerCredentialIntegration.failedProviders,
          quotaWarnings: providerCredentialIntegration.quotaWarnings,
          verificationFailures: providerCredentialIntegration.verificationFailures
        },
        productionConfigurationSummary: {
          productionConfigurationHealth: productionConfigurationReport.productionConfigurationHealth,
          launchReadiness: productionConfigurationReport.launchReadiness,
          configurationWarnings: productionConfigurationReport.configurationWarnings,
          missingConfiguration: productionConfigurationReport.missingConfiguration,
          configurationDrift: productionConfigurationReport.configurationDrift,
          configurationSummary: productionConfigurationReport.configurationSummary
        }
      }
    });

    return dashboard;
  }

  normalizeMissionViews(runtimeMissions = []) {
    return runtimeMissions.map(mission => {
      const runtimeContext = mission.runtimeContext ?? {};
      const artifacts = runtimeContext.artifacts ?? {};
      const qualityReview = artifacts.qualityReview ?? null;
      const executiveCouncilRuntime = artifacts.executiveCouncilRuntime ?? null;
      const publishingArtifact = artifacts.publishing ?? {};
      const lessonsLearned = Array.isArray(artifacts.lessonsLearned) ? artifacts.lessonsLearned : [];
      const risks = Array.isArray(runtimeContext.riskRegister) ? runtimeContext.riskRegister : [];

      return createOperationsMissionView({
        missionId: mission.missionId ?? runtimeContext.missionId ?? null,
        businessId: runtimeContext.businessId ?? runtimeContext.runtimeBusinessContext?.businessId ?? mission.businessId ?? null,
        currentStage: runtimeContext.currentStage ?? null,
        currentState: mission.state ?? runtimeContext.state ?? null,
        qualityStatus: this.resolveQualityStatus(qualityReview),
        executiveStatus: this.resolveExecutiveStatus({ runtimeContext, executiveCouncilRuntime }),
        publishingStatus: this.resolvePublishingStatus(publishingArtifact),
        runtimeDuration: this.resolveRuntimeDuration(runtimeContext),
        activeRisks: risks,
        nextRequiredDecision: this.resolveNextRequiredDecision({ runtimeContext, qualityReview }),
        recentLessonsLearned: lessonsLearned,
        executiveConflicts: Array.isArray(executiveCouncilRuntime?.conflicts) ? executiveCouncilRuntime.conflicts : []
      });
    });
  }

  resolveQualityStatus(qualityReview) {
    if (!qualityReview || typeof qualityReview !== 'object') {
      return 'UNKNOWN';
    }

    if (qualityReview.passed === true) {
      return 'PASS';
    }

    if (qualityReview.passed === false) {
      return 'BLOCK';
    }

    return 'UNKNOWN';
  }

  resolveExecutiveStatus({ runtimeContext, executiveCouncilRuntime }) {
    const state = String(runtimeContext.state ?? '').toUpperCase().trim();

    if (state === 'CEO_DECISION_PENDING') {
      return 'CEO_DECISION_PENDING';
    }

    if (state === 'CEO_APPROVED' || state === 'CEO_APPROVED_WITH_WAIVERS') {
      return 'APPROVED';
    }

    if (state === 'CEO_REVISION') {
      return 'REVISION_REQUIRED';
    }

    if (state === 'CEO_REJECTED') {
      return 'REJECTED';
    }

    if (executiveCouncilRuntime && typeof executiveCouncilRuntime.outcome === 'string') {
      return executiveCouncilRuntime.outcome;
    }

    return 'IN_PROGRESS';
  }

  resolvePublishingStatus(publishingArtifact = {}) {
    return String(
      publishingArtifact.publishStatus
      ?? publishingArtifact.status
      ?? 'NOT_REQUESTED'
    ).toUpperCase().trim();
  }

  resolveRuntimeDuration(runtimeContext = {}) {
    const initiatedAt = runtimeContext.initiatedAt;

    if (typeof initiatedAt !== 'string') {
      return 0;
    }

    const started = Date.parse(initiatedAt);
    if (Number.isNaN(started)) {
      return 0;
    }

    return Math.max(0, this.now() - started);
  }

  resolveNextRequiredDecision({ runtimeContext = {}, qualityReview = null }) {
    const state = String(runtimeContext.state ?? '').toUpperCase().trim();

    if (state === 'CEO_DECISION_PENDING') {
      return 'CEO_APPROVAL';
    }

    if (state === 'BLOCKED' && qualityReview && qualityReview.passed === false) {
      return 'QUALITY_REMEDIATION';
    }

    if (state === 'EXECUTIVE_REVIEW') {
      return 'EXECUTIVE_COUNCIL_REVIEW';
    }

    if (state === 'FAILED') {
      return 'EXECUTIVE_INTERVENTION';
    }

    return 'NONE';
  }

  partitionMissions(missionViews = []) {
    const completedMissions = missionViews.filter(mission => mission.currentState === 'COMPLETED');
    const failedMissions = missionViews.filter(mission => (
      mission.currentState === 'FAILED'
      || mission.currentState === 'BLOCKED'
      || mission.currentState === 'CEO_REJECTED'
      || mission.currentState === 'CEO_REVISION'
    ));
    const activeMissions = missionViews.filter(mission => (
      !completedMissions.includes(mission) && !failedMissions.includes(mission)
    ));

    return {
      activeMissions,
      completedMissions,
      failedMissions
    };
  }

  computeRuntimeStatus({ failedMissions = [] } = {}) {
    if (failedMissions.length > 0) {
      return HealthStatuses.WARNING;
    }

    return HealthStatuses.HEALTHY;
  }

  buildSystemComponents({
    missionRuntime = {},
    mediaEngine = {},
    qualityIntelligence = {},
    publishing = {},
    knowledgeRegistry = {},
    providerRegistry = {},
    credentialRegistry = {},
    operationsCenter = {}
  } = {}) {
    return {
      missionRuntime: normalizeHealthStatus(missionRuntime.status ?? HealthStatuses.HEALTHY),
      mediaEngine: normalizeHealthStatus(mediaEngine.status ?? HealthStatuses.HEALTHY),
      qualityIntelligence: normalizeHealthStatus(qualityIntelligence.status ?? HealthStatuses.HEALTHY),
      publishing: normalizeHealthStatus(publishing.status ?? HealthStatuses.HEALTHY),
      knowledgeRegistry: normalizeHealthStatus(knowledgeRegistry.status ?? HealthStatuses.HEALTHY),
      providerRegistry: normalizeHealthStatus(providerRegistry.status ?? HealthStatuses.HEALTHY),
      credentialRegistry: normalizeHealthStatus(credentialRegistry.status ?? HealthStatuses.HEALTHY),
      operationsCenter: normalizeHealthStatus(operationsCenter.status ?? HealthStatuses.HEALTHY)
    };
  }

  aggregateSystemHealth(components = {}) {
    const statuses = Object.values(components);

    if (statuses.length === 0) {
      return HealthStatuses.HEALTHY;
    }

    let highest = HealthStatuses.HEALTHY;

    statuses.forEach(status => {
      if (HEALTH_RANK[status] > HEALTH_RANK[highest]) {
        highest = status;
      }
    });

    return highest;
  }

  buildExecutiveAttentionQueue({
    missionViews = [],
    qualityIntelligence = {},
    executiveCouncil = {},
    knowledgeRegistry = {},
    assetRegistry = {},
    providerRegistry = {},
    credentialRegistry = {},
    operationsCenter = {}
  } = {}) {
    const items = [];

    missionViews.forEach(mission => {
      if (mission.nextRequiredDecision === 'CEO_APPROVAL') {
        items.push(this.createAttentionItem({
          type: AttentionTypes.CEO_APPROVAL,
          severity: AlertSeverities.HIGH,
          mission,
          message: `Mission ${mission.missionId} is pending CEO approval.`
        }));
      }

      if (mission.qualityStatus === 'BLOCK') {
        items.push(this.createAttentionItem({
          type: AttentionTypes.QUALITY_BLOCK,
          severity: AlertSeverities.HIGH,
          mission,
          message: `Mission ${mission.missionId} is blocked by quality gate.`
        }));
      }

      if (mission.currentState === 'FAILED') {
        items.push(this.createAttentionItem({
          type: AttentionTypes.RUNTIME_FAILURE,
          severity: AlertSeverities.CRITICAL,
          mission,
          message: `Mission ${mission.missionId} failed during runtime execution.`
        }));
      }

      if (Array.isArray(mission.executiveConflicts) && mission.executiveConflicts.length > 0) {
        items.push(this.createAttentionItem({
          type: AttentionTypes.KNOWLEDGE_CONFLICT,
          severity: AlertSeverities.HIGH,
          mission,
          message: `Mission ${mission.missionId} has executive conflict recommendations.`,
          details: {
            conflicts: mission.executiveConflicts
          }
        }));
      }
    });

    if (normalizeHealthStatus(credentialRegistry.status) === HealthStatuses.FAILED) {
      items.push(this.createAttentionItem({
        type: AttentionTypes.CREDENTIAL_FAILURE,
        severity: AlertSeverities.CRITICAL,
        mission: null,
        message: 'Credential registry is in FAILED state.'
      }));
    }

    if (normalizeHealthStatus(providerRegistry.status) === HealthStatuses.FAILED) {
      items.push(this.createAttentionItem({
        type: AttentionTypes.PROVIDER_OUTAGE,
        severity: AlertSeverities.CRITICAL,
        mission: null,
        message: 'Provider registry indicates outage state.'
      }));
    }

    const knowledgeConflicts = Array.isArray(knowledgeRegistry.conflicts) ? knowledgeRegistry.conflicts : [];
    knowledgeConflicts.forEach(conflict => {
      items.push(this.createAttentionItem({
        type: AttentionTypes.KNOWLEDGE_CONFLICT,
        severity: AlertSeverities.HIGH,
        mission: null,
        message: conflict.message ?? 'Knowledge conflict detected.',
        details: conflict
      }));
    });

    const waivers = Array.isArray(executiveCouncil.expiredWaivers) ? executiveCouncil.expiredWaivers : [];
    waivers.forEach(waiver => {
      items.push(this.createAttentionItem({
        type: AttentionTypes.EXPIRED_WAIVER,
        severity: AlertSeverities.MEDIUM,
        mission: null,
        message: waiver.message ?? 'Executive waiver has expired.',
        details: waiver
      }));
    });

    const criticalAlerts = Array.isArray(operationsCenter.criticalOperationalAlerts)
      ? operationsCenter.criticalOperationalAlerts
      : [];
    criticalAlerts.forEach(alert => {
      items.push(this.createAttentionItem({
        type: AttentionTypes.CRITICAL_OPERATIONAL_ALERT,
        severity: AlertSeverities.CRITICAL,
        mission: null,
        message: alert.message ?? 'Critical operational alert detected.',
        details: alert
      }));
    });

    const qualityIssues = Array.isArray(qualityIntelligence.alerts) ? qualityIntelligence.alerts : [];
    qualityIssues
      .filter(alert => String(alert.severity ?? '').toUpperCase() === AlertSeverities.CRITICAL)
      .forEach(alert => {
        items.push(this.createAttentionItem({
          type: AttentionTypes.QUALITY_BLOCK,
          severity: AlertSeverities.CRITICAL,
          mission: null,
          message: alert.message ?? 'Critical quality alert detected.',
          details: alert
        }));
      });

      const assetHealth = this.buildAssetHealth(assetRegistry);
      if (assetHealth.status === HealthStatuses.FAILED || assetHealth.status === HealthStatuses.DEGRADED) {
        items.push(this.createAttentionItem({
          type: AttentionTypes.CRITICAL_OPERATIONAL_ALERT,
          severity: assetHealth.status === HealthStatuses.FAILED ? AlertSeverities.CRITICAL : AlertSeverities.HIGH,
          mission: null,
          message: 'Asset registry integrity requires attention.',
          details: assetHealth
        }));
      }

    return items.sort((left, right) => {
      const leftRank = SEVERITY_RANK[left.severity] ?? 0;
      const rightRank = SEVERITY_RANK[right.severity] ?? 0;
      return rightRank - leftRank;
    });
  }

  createAttentionItem({ type, severity, mission, message, details = null }) {
    return {
      type,
      severity,
      missionId: mission?.missionId ?? null,
      businessId: mission?.businessId ?? null,
      message,
      details,
      createdAt: new Date(this.now()).toISOString()
    };
  }

  buildQualityAlerts({ missionViews = [], qualityIntelligence = {} } = {}) {
    const alerts = [];

    missionViews.forEach(mission => {
      if (mission.qualityStatus === 'BLOCK') {
        alerts.push({
          missionId: mission.missionId,
          businessId: mission.businessId,
          severity: AlertSeverities.HIGH,
          message: 'Mission quality status is BLOCK.'
        });
      }
    });

    const globalAlerts = Array.isArray(qualityIntelligence.alerts) ? qualityIntelligence.alerts : [];
    globalAlerts.forEach(alert => {
      alerts.push({
        missionId: alert.missionId ?? null,
        businessId: alert.businessId ?? null,
        severity: String(alert.severity ?? AlertSeverities.MEDIUM).toUpperCase(),
        message: alert.message ?? 'Quality intelligence alert.'
      });
    });

    return alerts;
  }

  buildPublishingQueue(missionViews = []) {
    return missionViews
      .filter(mission => (
        mission.publishingStatus === 'SCHEDULED'
        || mission.publishingStatus === 'QUEUED'
        || mission.publishingStatus.startsWith('PUBLISHED')
      ))
      .map(mission => ({
        missionId: mission.missionId,
        businessId: mission.businessId,
        publishingStatus: mission.publishingStatus
      }));
  }

  buildBusinessSummary({ missionViews = [], queuedMissions = [], businessAdmission = {}, businessRegistry = {} } = {}) {
    const summaryByBusiness = {};
    const missionCountByBusiness = {};

    missionViews.forEach(mission => {
      const businessId = mission.businessId ?? 'UNKNOWN';
      missionCountByBusiness[businessId] = Number(missionCountByBusiness[businessId] ?? 0) + 1;

      if (!summaryByBusiness[businessId]) {
        summaryByBusiness[businessId] = {
          businessId,
          activeMissions: 0,
          completedMissions: 0,
          failedMissions: 0,
          queuedMissions: 0
        };
      }

      if (mission.currentState === 'COMPLETED') {
        summaryByBusiness[businessId].completedMissions += 1;
      } else if (
        mission.currentState === 'FAILED'
        || mission.currentState === 'BLOCKED'
        || mission.currentState === 'CEO_REJECTED'
        || mission.currentState === 'CEO_REVISION'
      ) {
        summaryByBusiness[businessId].failedMissions += 1;
      } else {
        summaryByBusiness[businessId].activeMissions += 1;
      }
    });

    queuedMissions.forEach(queuedMission => {
      const businessId = queuedMission.businessId ?? 'UNKNOWN';
      missionCountByBusiness[businessId] = Number(missionCountByBusiness[businessId] ?? 0) + 1;

      if (!summaryByBusiness[businessId]) {
        summaryByBusiness[businessId] = {
          businessId,
          activeMissions: 0,
          completedMissions: 0,
          failedMissions: 0,
          queuedMissions: 0
        };
      }

      summaryByBusiness[businessId].queuedMissions += 1;
    });

    const businessCount = Number(
      businessRegistry.businessCount
      ?? businessRegistry.registeredBusinesses?.length
      ?? Object.keys(summaryByBusiness).length
    );
    const registeredBusinesses = Array.isArray(businessRegistry.registeredBusinesses)
      ? [...businessRegistry.registeredBusinesses]
      : Object.keys(summaryByBusiness);
    const businessHealth = businessRegistry.businessHealth && typeof businessRegistry.businessHealth === 'object'
      ? { ...businessRegistry.businessHealth }
      : {};
    const businessProfiles = Array.isArray(businessRegistry.businessProfiles)
      ? [...businessRegistry.businessProfiles]
      : [];

    return {
      businessCount,
      registeredBusinesses,
      businessHealth,
      businessProfiles,
      missionCountByBusiness,
      businesses: Object.values(summaryByBusiness),
      admissionSummary: {
        admittedCount: Number(businessAdmission.admittedCount ?? 0),
        rejectedCount: Number(businessAdmission.rejectedCount ?? 0)
      }
    };
  }

  buildKnowledgeUpdates({ missionViews = [], knowledgeRegistry = {} } = {}) {
    const updates = Array.isArray(knowledgeRegistry.updates) ? [...knowledgeRegistry.updates] : [];

    missionViews.forEach(mission => {
      if (Array.isArray(mission.activeRisks) && mission.activeRisks.length > 0) {
        updates.push({
          missionId: mission.missionId,
          businessId: mission.businessId,
          message: 'Mission has active risks that may require knowledge updates.'
        });
      }
    });

    return updates;
  }

  buildAssetIntegration({ assetRegistry = {} } = {}) {
    const assetSummary = this.resolveAssetSummary(assetRegistry);
    const assetHealth = this.buildAssetHealth(assetRegistry);
    const recentAssets = this.resolveAssetMethod(assetRegistry, 'getRecentAssets', 5);
    const orphanAssets = this.resolveAssetMethod(assetRegistry, 'getOrphanAssets', []);
    const failedAssets = this.resolveAssetMethod(assetRegistry, 'getFailedAssets', []);
    const assetGrowth = this.resolveAssetMethod(assetRegistry, 'getAssetGrowth', {});
    const assetStorageSummary = this.resolveAssetMethod(assetRegistry, 'getAssetStorageSummary', {});
    const assetsCreatedToday = this.resolveAssetMethod(assetRegistry, 'getAssetsCreatedToday', 0);

    return {
      assetCount: Number(assetSummary.assetCount ?? 0),
      assetHealth,
      recentAssets: Array.isArray(recentAssets) ? [...recentAssets] : [],
      orphanAssets: Array.isArray(orphanAssets) ? [...orphanAssets] : [],
      failedAssets: Array.isArray(failedAssets) ? [...failedAssets] : [],
      assetGrowth: {
        ...(assetGrowth ?? {})
      },
      assetStorageSummary: {
        ...(assetStorageSummary ?? {})
      },
      assetsCreatedToday: Number(assetsCreatedToday ?? 0),
      assetSummary,
      assetStatus: {
        status: assetHealth.status,
        warnings: Array.isArray(assetHealth.issues) ? [...assetHealth.issues] : []
      }
    };
  }

  resolveAssetSummary(assetRegistry = {}) {
    if (assetRegistry && typeof assetRegistry.getAssetSummary === 'function') {
      return assetRegistry.getAssetSummary();
    }

    return {
      assetCount: Number(assetRegistry.assetCount ?? 0),
      releaseCandidateCount: Number(assetRegistry.releaseCandidateCount ?? 0),
      approvedAssets: Number(assetRegistry.approvedAssets ?? 0),
      assetsAwaitingReview: Number(assetRegistry.assetsAwaitingReview ?? 0),
      assetIntegrityWarnings: Number(assetRegistry.assetIntegrityWarnings ?? 0),
      assetHealth: this.buildAssetHealth(assetRegistry),
      recentAssets: Array.isArray(assetRegistry.recentAssets) ? [...assetRegistry.recentAssets] : [],
      orphanAssets: Array.isArray(assetRegistry.orphanAssets) ? [...assetRegistry.orphanAssets] : [],
      failedAssets: Array.isArray(assetRegistry.failedAssets) ? [...assetRegistry.failedAssets] : [],
      assetGrowth: {
        ...(assetRegistry.assetGrowth ?? {})
      },
      assetStorageSummary: {
        ...(assetRegistry.assetStorageSummary ?? {})
      },
      assetsCreatedToday: Number(assetRegistry.assetsCreatedToday ?? 0)
    };
  }

  buildAssetHealth(assetRegistry = {}) {
    if (assetRegistry && typeof assetRegistry.getAssetHealth === 'function') {
      return assetRegistry.getAssetHealth();
    }

    return {
      status: normalizeHealthStatus(assetRegistry.assetHealth?.status ?? assetRegistry.status ?? 'UNKNOWN'),
      issues: Array.isArray(assetRegistry.assetHealth?.issues)
        ? [...assetRegistry.assetHealth.issues]
        : []
    };
  }

  resolveAssetMethod(assetRegistry = {}, methodName, fallbackValue) {
    if (assetRegistry && typeof assetRegistry[methodName] === 'function') {
      return assetRegistry[methodName]();
    }

    return fallbackValue;
  }

  collectRecentLessons(missionViews = []) {
    const lessons = [];

    missionViews.forEach(mission => {
      if (Array.isArray(mission.recentLessonsLearned)) {
        mission.recentLessonsLearned.forEach(lesson => {
          lessons.push({
            missionId: mission.missionId,
            businessId: mission.businessId,
            ...lesson
          });
        });
      }
    });

    return lessons;
  }

  buildRegistryHealth(registry = {}) {
    return {
      status: normalizeHealthStatus(registry.status ?? HealthStatuses.HEALTHY),
      issues: Array.isArray(registry.issues) ? [...registry.issues] : []
    };
  }

  buildProviderCredentialIntegration({ providerRegistry = {}, credentialRegistry = {} } = {}) {
    const providerSummary = {
      providerCount: Number(providerRegistry.providerCount ?? 0),
      configuredProviders: Number(providerRegistry.configuredProviders ?? 0),
      healthyProviders: Number(providerRegistry.healthyProviders ?? 0),
      productionReadyProviders: Number(providerRegistry.productionReadyProviders ?? 0)
    };
    const credentialSummary = {
      credentialCount: Number(credentialRegistry.credentialCount ?? 0),
      configuredCredentials: Number(credentialRegistry.configuredCredentials ?? 0),
      verifiedCredentials: Number(credentialRegistry.verifiedCredentials ?? 0),
      warningCredentials: Number(credentialRegistry.warningCredentials ?? 0)
    };

    return {
      providerSummary,
      credentialSummary,
      missingCredentials: Array.isArray(providerRegistry.missingCredentials)
        ? [...providerRegistry.missingCredentials]
        : [],
      failedProviders: Array.isArray(providerRegistry.failedProviders)
        ? [...providerRegistry.failedProviders]
        : [],
      quotaWarnings: Array.isArray(providerRegistry.quotaWarnings)
        ? [...providerRegistry.quotaWarnings]
        : [],
      verificationFailures: Array.isArray(credentialRegistry.verificationFailures)
        ? [...credentialRegistry.verificationFailures]
        : []
    };
  }

  resolveProductionConfigurationReport({ businessRegistry, providerRegistry, credentialRegistry, productionConfiguration = null, productionConfigurationManager = null } = {}) {
    const manager = productionConfigurationManager ?? new ProductionConfigurationManager({
      businessRegistry,
      providerRegistry,
      credentialRegistry,
      now: this.now
    });

    return manager.generatePortfolioReport({
      businessRegistry,
      providerRegistry,
      credentialRegistry,
      configurations: productionConfiguration ?? {}
    });
  }
}

module.exports = {
  OperationsCenter
};
