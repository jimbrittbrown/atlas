import { createStorageProvider } from '../storage/storage-provider-factory.js';
import { CustomerIntakeMissionControl } from './customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from './executive-planning-system.js';
import { ExecutiveOperationsDashboardManager } from './executive-operations-dashboard-manager.js';
import { ExecutiveOperationsDashboard } from './executive-operations-dashboard.js';
import { CustomerPortalManager } from './customer-portal-manager.js';
import { WebsiteProductionManager } from './website-production-manager.js';
import { createExecutiveProjectionProviderRegistry } from './executive-projection-provider-bootstrap.js';

export class AtlasPersistentOperationsRuntime {
  constructor({ storageProvider = null, logger = null, now } = {}) {
    this.logger = logger ?? { log: () => {} };
    this.now = now;
    this.storageProvider = storageProvider ?? createStorageProvider({ now });
    this.missionControl = null;
    this.executivePlanningSystem = null;
    this.dashboardManager = null;
    this.dashboard = null;
  }

  initializeSync() {
    if (typeof this.storageProvider.initializeSync === 'function') {
      this.storageProvider.initializeSync();
    }

    this.missionControl = new CustomerIntakeMissionControl({
      logger: this.logger,
      storageProvider: this.storageProvider
    });

    this.executivePlanningSystem = new ExecutivePlanningSystem({
      missionControl: this.missionControl,
      logger: this.logger,
      now: this.now,
      storageProvider: this.storageProvider
    });

    this.dashboardManager = new ExecutiveOperationsDashboardManager({
      missionControl: this.missionControl,
      executivePlanningSystem: this.executivePlanningSystem,
      customerPortalManager: new CustomerPortalManager({
        missionControl: this.missionControl,
        executivePlanningSystem: this.executivePlanningSystem,
        workforceDirector: this.missionControl?.workforceDirector ?? null,
        storageProvider: this.storageProvider,
        logger: this.logger,
        now: this.now
      }),
      websiteProductionManager: new WebsiteProductionManager({
        missionControl: this.missionControl,
        executivePlanningSystem: this.executivePlanningSystem,
        workforceDirector: this.missionControl?.workforceDirector ?? null,
        storageProvider: this.storageProvider,
        logger: this.logger,
        now: this.now
      }),
      logger: this.logger,
      now: this.now,
      storageProvider: this.storageProvider
    });

    this.dashboardManager.projectionProviderRegistry = createExecutiveProjectionProviderRegistry({
      operationsTelemetryAggregator: this.dashboardManager.operationsTelemetryAggregator,
      websiteProductionManager: this.dashboardManager.websiteProductionManager,
      customerPortalManager: this.dashboardManager.customerPortalManager,
      now: this.now,
      logger: this.logger
    });

    this.dashboard = new ExecutiveOperationsDashboard({ manager: this.dashboardManager });

    return {
      storageProvider: this.storageProvider,
      missionControl: this.missionControl,
      executivePlanningSystem: this.executivePlanningSystem,
      dashboardManager: this.dashboardManager,
      dashboard: this.dashboard
    };
  }

  async initialize() {
    if (typeof this.storageProvider.initialize === 'function') {
      await this.storageProvider.initialize();
    }

    return this.initializeSync();
  }

  buildRecoverySummary() {
    return {
      recoveredCustomers: this.missionControl?.customerRegistry?.listCustomers?.().length ?? 0,
      recoveredMissions: this.missionControl?.missionRegistry?.listMissions?.().length ?? 0,
      recoveredWorkers: this.missionControl?.workforceDirector?.listWorkers?.().length ?? 0,
      recoveredProposals: this.executivePlanningSystem?.portfolioManager?.portfolioRegistry?.listProposals?.().length ?? 0,
      recoveredSnapshots: this.dashboardManager?.snapshotRegistry?.listSnapshots?.().length ?? 0,
      recoveredLoopAlerts: this.dashboardManager?.operationsLoopManager?.store?.listAlerts?.().length ?? 0,
      recoveredOrchestratorSessions: this.dashboardManager?.missionOrchestratorManager?.listSessions?.().length ?? 0
    };
  }

  async close() {
    if (typeof this.storageProvider.close === 'function') {
      await this.storageProvider.close();
    } else if (typeof this.storageProvider.closeSync === 'function') {
      this.storageProvider.closeSync();
    }
  }
}
