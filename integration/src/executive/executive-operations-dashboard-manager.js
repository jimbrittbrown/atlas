import { ExecutivePlanningSystem } from './executive-planning-system.js';
import { ExecutiveOverviewModel } from './executive-overview-model.js';
import { CEDecisionCenterModel } from './ceo-decision-center-model.js';
import { MissionControlDashboardViewModel } from './mission-control-dashboard-view-model.js';
import { ExecutiveWorkforceViewModel } from './executive-workforce-view-model.js';
import { CustomerPipelineDashboardModel } from './customer-pipeline-dashboard-model.js';
import { OpportunityPortfolioDashboardModel } from './opportunity-portfolio-dashboard-model.js';
import { ProviderHealthDashboardModel } from './provider-health-dashboard-model.js';
import { AtlasSystemHealthModel } from './atlas-system-health-model.js';
import { ExecutiveActivityFeedModel } from './executive-activity-feed-model.js';
import { ExecutiveAlertsModel } from './executive-alerts-model.js';
import { ExecutiveMissionOrchestratorManager } from './executive-mission-orchestrator-manager.js';
import { ExecutiveMissionOrchestratorDashboardModel } from './executive-mission-orchestrator-dashboard-model.js';
import { ExecutiveMissionControlManager } from './executive-mission-control-manager.js';
import { ExecutiveOperationsLoopManager } from './executive-operations-loop-manager.js';
import { ExecutiveOperationsTelemetryAggregator } from './executive-operations-telemetry-aggregator.js';
import { createExecutiveProjectionProviderRegistry } from './executive-projection-provider-bootstrap.js';
import { DashboardSnapshotRegistry } from './dashboard-snapshot-registry.js';
import { ExecutiveOperationsDashboardResponseModel } from './executive-operations-dashboard-response-model.js';
import {
  createDataFreshnessRecord,
  DataAvailabilityStatuses,
  validateExecutiveOperationsSnapshot
} from './executive-operations-dashboard-contracts.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toMapById(items = [], idKey = 'id') {
  return asArray(items).reduce((acc, item) => {
    const key = item?.[idKey];
    if (key) acc[key] = item;
    return acc;
  }, {});
}

function readMethod(target, methodName, fallback) {
  if (typeof target?.[methodName] === 'function') {
    return target[methodName]();
  }

  return fallback;
}

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class ExecutiveOperationsDashboardManager {
  constructor({
    missionControl,
    executivePlanningSystem,
    websiteProductionManager = null,
    customerPortalManager = null,
    operationsTelemetryAggregator = null,
    projectionProviderRegistry = null,
    projectionProviders = {},
    snapshotRegistry,
    storageProvider,
    providerHealthAdapter,
    reportPaths = [],
    logger,
    now,
    models = {}
  } = {}) {
    this.logger = logger ?? { log: () => {} };
    this.now = now;
    this.reportPaths = reportPaths;
    this.storageProvider = storageProvider ?? null;

    this.missionControl = missionControl ?? null;
    this.executivePlanningSystem = executivePlanningSystem
      ?? (missionControl ? new ExecutivePlanningSystem({ missionControl, logger: this.logger, storageProvider: this.storageProvider }) : null);

    this.snapshotRegistry = snapshotRegistry ?? new DashboardSnapshotRegistry({ now, storageProvider: this.storageProvider });
    this.providerHealthAdapter = providerHealthAdapter ?? {
      getProviderStatuses: () => []
    };
    this.websiteProductionManager = websiteProductionManager;
    this.customerPortalManager = customerPortalManager;

    this.missionOrchestratorManager = new ExecutiveMissionOrchestratorManager({
      missionControl: this.missionControl,
      executivePlanningSystem: this.executivePlanningSystem,
      workforceDirector: this.missionControl?.workforceDirector ?? null,
      websiteBuilderMissionManager: this.missionControl?.websiteBuilderMissionManager ?? null,
      storageProvider: this.storageProvider,
      logger: this.logger,
      now: this.now
    });

    this.missionControlManager = new ExecutiveMissionControlManager({
      orchestratorManager: this.missionOrchestratorManager,
      storageProvider: this.storageProvider,
      now: this.now
    });

    this.operationsLoopManager = new ExecutiveOperationsLoopManager({
      missionControl: this.missionControl,
      executivePlanningSystem: this.executivePlanningSystem,
      missionOrchestratorManager: this.missionOrchestratorManager,
      missionControlManager: this.missionControlManager,
      workforceDirector: this.missionControl?.workforceDirector ?? null,
      providerHealthAdapter: this.providerHealthAdapter,
      store: models.operationsLoopStore,
      storageProvider: this.storageProvider,
      logger: this.logger,
      now: this.now
    });

    this.operationsTelemetryAggregator = operationsTelemetryAggregator
      ?? new ExecutiveOperationsTelemetryAggregator({
        operationsLoopManager: this.operationsLoopManager,
        providerHealthAdapter: this.providerHealthAdapter,
        now: this.now,
        logger: this.logger
      });

    this.projectionProviderRegistry = projectionProviderRegistry
      ?? createExecutiveProjectionProviderRegistry({
        operationsTelemetryAggregator: this.operationsTelemetryAggregator,
        websiteProductionManager: this.websiteProductionManager,
        customerPortalManager: this.customerPortalManager,
        now: this.now,
        logger: this.logger
      });

    this.models = {
      executiveOverview: models.executiveOverview ?? new ExecutiveOverviewModel(),
      ceoDecisionCenter: models.ceoDecisionCenter ?? new CEDecisionCenterModel(),
      missionOrchestrator: models.missionOrchestrator ?? new ExecutiveMissionOrchestratorDashboardModel(),
      operationsLoop: models.operationsLoop ?? { project: ({ manager }) => manager.getDashboardProjection() },
      websiteProduction: models.websiteProduction ?? { project: ({ manager }) => manager.getDashboardProjection() },
      missionControl: models.missionControl ?? new MissionControlDashboardViewModel(),
      workforce: models.workforce ?? new ExecutiveWorkforceViewModel(),
      customerPipeline: models.customerPipeline ?? new CustomerPipelineDashboardModel(),
      opportunityPortfolio: models.opportunityPortfolio ?? new OpportunityPortfolioDashboardModel(),
      providerHealth: models.providerHealth ?? new ProviderHealthDashboardModel(),
      systemHealth: models.systemHealth ?? new AtlasSystemHealthModel(),
      activityFeed: models.activityFeed ?? new ExecutiveActivityFeedModel(),
      alerts: models.alerts ?? new ExecutiveAlertsModel(),
      response: models.response ?? new ExecutiveOperationsDashboardResponseModel()
    };

    this.projectionProviders = {
      ...projectionProviders
    };
  }

  validateProjectionEnvelope(projection = {}, { providerId = 'unknown' } = {}) {
    const issues = [];

    if (!isObject(projection)) {
      return { isValid: false, issues: [`Projection ${providerId} must return an object.`] };
    }

    if (!projection.projectionId || typeof projection.projectionId !== 'string') {
      issues.push(`Projection ${providerId} must include projectionId.`);
    }

    if (!projection.projectionType || typeof projection.projectionType !== 'string') {
      issues.push(`Projection ${providerId} must include projectionType.`);
    }

    if (!projection.providerId || typeof projection.providerId !== 'string') {
      issues.push(`Projection ${providerId} must include providerId.`);
    }

    if (!projection.status || typeof projection.status !== 'string') {
      issues.push(`Projection ${providerId} must include status.`);
    }

    if (!projection.timestamp || typeof projection.timestamp !== 'string') {
      issues.push(`Projection ${providerId} must include timestamp.`);
    }

    if (!projection.contractVersion || typeof projection.contractVersion !== 'string') {
      issues.push(`Projection ${providerId} must include contractVersion.`);
    }

    if (!isObject(projection.aggregateMetrics)) {
      issues.push(`Projection ${providerId} must include aggregateMetrics object.`);
    }

    if (!Array.isArray(projection.warnings)) {
      issues.push(`Projection ${providerId} must include warnings array.`);
    }

    if (!Array.isArray(projection.incidents)) {
      issues.push(`Projection ${providerId} must include incidents array.`);
    }

    if (!projection.source || typeof projection.source !== 'string') {
      issues.push(`Projection ${providerId} must include source identifier.`);
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  isProjectionStale(projection = {}, { maxAgeMs = 15 * 60 * 1000 } = {}) {
    const timestampMs = Date.parse(String(projection?.timestamp ?? ''));
    if (!Number.isFinite(timestampMs)) return true;
    return Date.now() - timestampMs > Number(maxAgeMs ?? 0);
  }

  readProjection({ providerId, required = false, missingData = [] } = {}) {
    const providerOverride = this.projectionProviders?.[providerId];

    if (providerOverride) {
      try {
        const result = typeof providerOverride === 'function'
          ? providerOverride()
          : providerOverride;
        const validation = this.validateProjectionEnvelope(result, { providerId });
        if (!validation.isValid) {
          const message = `Projection provider ${providerId} returned malformed payload: ${validation.issues.join(' | ')}`;
          if (required) throw new Error(message);
          missingData.push(message);
          return null;
        }

        if (this.isProjectionStale(result, { maxAgeMs: Number(providerOverride.maxAgeMs ?? 15 * 60 * 1000) })) {
          const message = `Projection provider ${providerId} returned stale projection timestamp ${result.timestamp}.`;
          if (required) throw new Error(message);
          missingData.push(message);
        }

        return result;
      } catch (error) {
        const message = `Projection provider ${providerId} failed: ${error instanceof Error ? error.message : String(error)}`;
        if (required) {
          throw new Error(message);
        }
        missingData.push(message);
        return null;
      }
    }

    if (!this.projectionProviderRegistry || typeof this.projectionProviderRegistry.invokeProvider !== 'function') {
      const message = `Projection provider registry is unavailable while resolving ${providerId}.`;
      if (required) {
        throw new Error(message);
      }
      missingData.push(message);
      return null;
    }

    try {
      const invocation = this.projectionProviderRegistry.invokeProvider(providerId);

      if (!invocation.ok) {
        const message = `Projection provider ${providerId} failed: ${invocation.reason}`;
        if (required) {
          throw new Error(message);
        }
        missingData.push(message);
        return null;
      }

      const projection = invocation.projection;
      projection.timestamp = projection.timestamp ?? projection.generatedAt ?? isoNow(this.now);
      const validation = this.validateProjectionEnvelope(projection, { providerId });
      if (!validation.isValid) {
        const message = `Projection provider ${providerId} returned malformed payload: ${validation.issues.join(' | ')}`;
        if (required) {
          throw new Error(message);
        }
        missingData.push(message);
        return null;
      }

      if (invocation.status === 'STALE') {
        const staleness = invocation.freshness?.ageMs != null
          ? `${invocation.freshness.ageMs}ms > ${invocation.freshness.maxAgeMs}ms`
          : 'stale freshness policy';
        const message = `Projection provider ${providerId} returned stale projection (${staleness}).`;
        if (required) {
          throw new Error(message);
        }
        missingData.push(message);
      }

      return projection;
    } catch (error) {
      const message = `Projection provider ${providerId} failed: ${error instanceof Error ? error.message : String(error)}`;
      if (required) {
        throw new Error(message);
      }
      missingData.push(message);
      return null;
    }
  }

  gatherContext() {
    const customerRegistry = this.missionControl?.customerRegistry ?? null;
    const missionRegistry = this.missionControl?.missionRegistry ?? null;
    const workforceDirector = this.missionControl?.workforceDirector ?? this.executivePlanningSystem?.missionControl?.workforceDirector ?? null;
    const websiteBuilderMissionManager = this.missionControl?.websiteBuilderMissionManager ?? null;
    const missionOrchestratorManager = this.missionOrchestratorManager;
    const operationsLoopManager = this.operationsLoopManager;

    const customers = readMethod(customerRegistry, 'listCustomers', []);
    const missions = readMethod(missionRegistry, 'listMissions', []);
    const intakeActivityFeed = asArray(this.missionControl?.activityFeed);

    const portfolioRegistry = this.executivePlanningSystem?.portfolioManager?.portfolioRegistry ?? null;
    const proposals = readMethod(portfolioRegistry, 'listProposals', []);

    const evaluationsByProposalId = proposals.reduce((acc, proposal) => {
      const latest = proposal.evaluationHistory?.[proposal.evaluationHistory.length - 1] ?? null;
      if (latest) acc[proposal.proposalId] = latest;
      return acc;
    }, {});

    const ceoGateByProposalId = proposals.reduce((acc, proposal) => {
      const latestEvaluation = evaluationsByProposalId[proposal.proposalId] ?? null;
      const workforceSnapshot = this.executivePlanningSystem?.portfolioManager?.getWorkforceSnapshot?.() ?? { dashboard: {} };
      if (this.executivePlanningSystem?.portfolioManager?.requiresCeoApproval) {
        acc[proposal.proposalId] = this.executivePlanningSystem.portfolioManager.requiresCeoApproval({
          proposal,
          evaluation: latestEvaluation,
          workforceSnapshot
        });
      }
      return acc;
    }, {});

    const discoveredProviders = [];
    const adapterRegistry = websiteBuilderMissionManager?.adapterRegistry;
    if (adapterRegistry?.adapters && adapterRegistry.adapters instanceof Map) {
      adapterRegistry.adapters.forEach((adapter, adapterType) => {
        discoveredProviders.push(adapter?.name ?? adapterType);
      });
    }

    let providerStatuses = [];
    let providerHealthFailure = null;
    try {
      providerStatuses = readMethod(this.providerHealthAdapter, 'getProviderStatuses', []);
    } catch (error) {
      providerHealthFailure = error instanceof Error ? error.message : String(error);
      providerStatuses = [];
    }

    return {
      customerRegistry,
      missionRegistry,
      workforceDirector,
      websiteBuilderMissionManager,
      missionOrchestratorManager,
      operationsLoopManager,
      customers,
      missions,
      intakeActivityFeed,
      proposals,
      evaluationsByProposalId,
      ceoGateByProposalId,
      providerStatuses,
      discoveredProviders,
      providerHealthFailure
    };
  }

  buildSnapshot({ filters = {} } = {}) {
    const context = this.gatherContext();
    const missingData = [];
    const projectionIds = new Set();

    const operationsTelemetryProjection = this.readProjection({
      providerId: 'operations.telemetry.provider',
      required: true,
      missingData
    });

    if (projectionIds.has(operationsTelemetryProjection.projectionId)) {
      throw new Error(`Duplicate projection identifier detected: ${operationsTelemetryProjection.projectionId}`);
    }
    projectionIds.add(operationsTelemetryProjection.projectionId);

    const websiteProductionProjection = this.readProjection({
      providerId: 'website.production.provider',
      required: false,
      missingData
    });

    if (websiteProductionProjection?.projectionId) {
      if (projectionIds.has(websiteProductionProjection.projectionId)) {
        throw new Error(`Duplicate projection identifier detected: ${websiteProductionProjection.projectionId}`);
      }
      projectionIds.add(websiteProductionProjection.projectionId);
    }

    const notificationObservabilityProjectionEnvelope = this.readProjection({
      providerId: 'notification.observability.provider',
      required: false,
      missingData
    });

    if (notificationObservabilityProjectionEnvelope?.projectionId) {
      if (projectionIds.has(notificationObservabilityProjectionEnvelope.projectionId)) {
        throw new Error(`Duplicate projection identifier detected: ${notificationObservabilityProjectionEnvelope.projectionId}`);
      }
      projectionIds.add(notificationObservabilityProjectionEnvelope.projectionId);
    }

    const customerPortalProjectionEnvelope = this.readProjection({
      providerId: 'customer.portal.provider',
      required: false,
      missingData
    });

    if (customerPortalProjectionEnvelope?.projectionId) {
      if (projectionIds.has(customerPortalProjectionEnvelope.projectionId)) {
        throw new Error(`Duplicate projection identifier detected: ${customerPortalProjectionEnvelope.projectionId}`);
      }
      projectionIds.add(customerPortalProjectionEnvelope.projectionId);
    }

    const customersById = toMapById(context.customers, 'customerId');
    const proposalsByMissionId = context.proposals
      .filter((proposal) => proposal.linkedMissionId)
      .reduce((acc, proposal) => {
        const latestEvaluation = proposal.evaluationHistory?.[proposal.evaluationHistory.length - 1] ?? null;
        acc[proposal.linkedMissionId] = {
          proposalId: proposal.proposalId,
          confidence: proposal.confidence,
          risk: latestEvaluation?.scoreBreakdown?.risk != null
            ? Number((1 - Number(latestEvaluation.scoreBreakdown.risk)).toFixed(4))
            : null,
          priorityBand: latestEvaluation?.priorityBand ?? null,
          linkedExecutiveReviewPackage: proposal.metadata?.linkedExecutiveReviewPackage ?? null,
          estimatedCompletion: proposal.metadata?.estimatedCompletion ?? null
        };
        return acc;
      }, {});

    const executiveOverview = this.models.executiveOverview.project({
      customers: context.customers,
      missions: context.missions,
      proposals: context.proposals,
      evaluations: Object.values(context.evaluationsByProposalId)
    });

    const ceoDecisionCenter = this.models.ceoDecisionCenter.project({
      proposals: context.proposals,
      evaluationsByProposalId: context.evaluationsByProposalId,
      ceoGateByProposalId: context.ceoGateByProposalId,
      missions: context.missions
    });

    const missionControlView = this.models.missionControl.project({
      missions: context.missions,
      customersById,
      proposalsByMissionId
    });

    const missionOrchestrator = this.models.missionOrchestrator.project({
      sessions: context.missionOrchestratorManager?.listSessions?.() ?? [],
      workforceDirector: context.workforceDirector
    });

    const operationsLoop = operationsTelemetryProjection.payload;

    const websiteProduction = websiteProductionProjection?.payload ?? {
      status: DataAvailabilityStatuses.PARTIAL,
      totalReviews: 0,
      awaitingCeoApproval: 0,
      records: []
    };

    const notificationObservability = notificationObservabilityProjectionEnvelope?.payload ?? {
      status: DataAvailabilityStatuses.PARTIAL,
      readOnly: true,
      projectionInventory: [],
      freshness: {},
      deliveryHealth: null,
      providerHealth: null,
      queueHealth: null,
      reliability: null,
      governance: null,
      templateHealth: null,
      operationalIncidents: { total: 0, records: [] },
      customerHealthFoundation: {
        internalOnly: true,
        websiteNotificationHistory: [],
        deliverySuccess: { total: 0, delivered: 0, failures: 0, successRate: 0 },
        customerCommunicationHealth: { status: 'UNKNOWN', governanceRiskSignals: 0 },
        recentRecommendations: [],
        unresolvedIncidents: 0,
        notificationTrends: [],
        futureUseCases: [
          'Atlas Website Care Reports',
          'Atlas Business Health Reports'
        ]
      }
    };

    const customerPortalProjection = customerPortalProjectionEnvelope?.payload ?? {
      status: DataAvailabilityStatuses.PARTIAL,
      totalRequests: 0,
      totalRevisionRequests: 0,
      auth: null,
      payments: null
    };
    const websiteProjects = context.missions.filter((mission) => String(mission.missionType ?? '').toUpperCase() === 'WEBSITE_BUILD');
    const activeCustomerIds = new Set(websiteProjects
      .filter((mission) => ['ACTIVE', 'AWAITING_EXECUTIVE_REVIEW'].includes(String(mission.executiveStatus ?? '').toUpperCase()))
      .map((mission) => mission.customerId));
    const projectsAwaitingApproval = websiteProjects.filter((mission) => String(mission.executiveStatus ?? '').toUpperCase() === 'AWAITING_EXECUTIVE_REVIEW').length
      + Number(websiteProduction.awaitingCeoApproval ?? 0);

    const websiteBusinessLaunch = {
      status: customerPortalProjection.status ?? DataAvailabilityStatuses.PARTIAL,
      newLeads: Number(customerPortalProjection.totalRequests ?? 0),
      activeCustomers: activeCustomerIds.size,
      websiteProjects: websiteProjects.length,
      revenuePipelineEstimated: Number(executiveOverview.currentPortfolioValue ?? 0),
      projectsAwaitingApproval,
      revisionQueue: Number(customerPortalProjection.totalRevisionRequests ?? 0),
      authentication: customerPortalProjection.auth ?? null,
      payments: customerPortalProjection.payments ?? null,
      customerSatisfaction: {
        status: 'PLACEHOLDER',
        score: null,
        note: 'Customer satisfaction model is planned and not yet instrumented.'
      }
    };

    const filteredMissionControl = {
      ...missionControlView,
      filteredRecords: this.models.missionControl.filter(missionControlView, filters.missionControl ?? {})
    };

    const workforce = this.models.workforce.project({
      workforceDirector: context.workforceDirector,
      missions: context.missions
    });

    const customerPipeline = this.models.customerPipeline.project({
      customers: context.customers,
      missions: context.missions,
      proposals: context.proposals,
      intakeActivityFeed: context.intakeActivityFeed
    });

    const opportunityPortfolio = this.models.opportunityPortfolio.project({
      proposals: context.proposals
    });

    const providerHealth = this.models.providerHealth.project({
      providerStatuses: context.providerStatuses,
      discoveredProviders: context.discoveredProviders
    });

    const systemHealth = this.models.systemHealth.project({
      context: {
        missionControl: this.missionControl,
        missionRegistry: context.missionRegistry,
        workforceDirector: context.workforceDirector,
        executivePlanningSystem: this.executivePlanningSystem,
        websiteBuilderMissionManager: context.websiteBuilderMissionManager,
        providerHealth,
        reportPaths: this.reportPaths
      }
    });

    const activityFeed = this.models.activityFeed.project({
      intakeActivityFeed: context.intakeActivityFeed,
      proposals: context.proposals,
      missions: context.missions,
      workforceDirector: context.workforceDirector,
      providerHealth
    });

    const alerts = this.models.alerts.project({
      missions: context.missions,
      proposals: context.proposals,
      activityFeed,
      workforce,
      providerHealth
    });

    const dataFreshness = [
      createDataFreshnessRecord({ section: 'executiveOverview', status: DataAvailabilityStatuses.AVAILABLE }, { now: this.now }),
      createDataFreshnessRecord({ section: 'ceoDecisionCenter', status: DataAvailabilityStatuses.AVAILABLE }, { now: this.now }),
      createDataFreshnessRecord({ section: 'missionOrchestrator', status: missionOrchestrator.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'operationsLoop', status: operationsTelemetryProjection.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'websiteProduction', status: websiteProductionProjection?.status ?? websiteProduction?.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'notificationObservability', status: notificationObservabilityProjectionEnvelope?.status ?? notificationObservability?.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'websiteBusinessLaunch', status: websiteBusinessLaunch?.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'missionControl', status: context.missions.length > 0 ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'workforce', status: workforce.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'customerPipeline', status: customerPipeline.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'opportunityPortfolio', status: opportunityPortfolio.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'providerHealth', status: providerHealth.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'systemHealth', status: systemHealth.status ?? DataAvailabilityStatuses.PARTIAL }, { now: this.now }),
      createDataFreshnessRecord({ section: 'activityFeed', status: DataAvailabilityStatuses.AVAILABLE }, { now: this.now }),
      createDataFreshnessRecord({ section: 'alerts', status: DataAvailabilityStatuses.AVAILABLE }, { now: this.now })
    ];

    if (!this.missionControl) missingData.push('Mission Control adapter is not connected.');
    if (!this.executivePlanningSystem) missingData.push('Executive Planning System adapter is not connected.');
    if (context.providerStatuses.length === 0) missingData.push('Provider health adapter returned no live statuses.');
    if (context.providerHealthFailure) missingData.push(`Provider health projection failed: ${context.providerHealthFailure}`);
    if (context.customers.length === 0) missingData.push('No customer records available.');
    if (context.missions.length === 0) missingData.push('No mission records available.');

    const limitations = [
      'Dashboard is read-only and does not execute approvals, publishing, deployment, or writes.',
      'Provider health uses adapter-fed telemetry and honest NOT_CONFIGURED/NOT_CONNECTED states when unavailable.',
      'Financial metrics represent estimated proposal value, not recognized revenue.',
      'Optional domain projections degrade to PARTIAL status while required operations telemetry fails closed.'
    ];

    const recommendedExecutiveActions = [
      ...ceoDecisionCenter.items.slice(0, 10).map((item) => ({
        action: item.requiredCeoAction,
        reason: item.recommendation,
        decisionId: item.decisionId
      })),
      ...(alerts.alerts ?? []).slice(0, 10).map((alert) => ({
        action: alert.recommendedAction,
        reason: alert.title,
        alertId: alert.alertId
      }))
    ].slice(0, 20);

    const generatedAt = new Date().toISOString();

    const response = this.models.response.build({
      executiveOverview,
      ceoDecisionCenter,
      missionOrchestrator,
      operationsLoop,
      websiteProduction,
      notificationObservability,
      websiteBusinessLaunch,
      missionControl: filteredMissionControl,
      workforce,
      customerPipeline,
      opportunityPortfolio,
      providerHealth,
      systemHealth,
      activityFeed,
      alerts,
      generatedAt,
      dataFreshness,
      missingData,
      limitations,
      recommendedExecutiveActions
    });

    const validation = validateExecutiveOperationsSnapshot(response);
    if (!validation.isValid) {
      throw new Error(`Executive dashboard snapshot invalid: ${validation.issues.join(' | ')}`);
    }

    this.snapshotRegistry.saveSnapshot(response);

    this.logger.log({
      event: 'executive_operations_dashboard_snapshot_generated',
      generatedAt,
      sectionCount: Object.keys(response).length,
      missingDataCount: missingData.length
    });

    return response;
  }
}
