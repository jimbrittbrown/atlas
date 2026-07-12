import {
  createCustomerIntakeRequest,
  MissionExecutiveStatuses,
  MissionTypes
} from './customer-intake-mission-control-contracts.js';
import { CustomerRegistry } from './customer-registry.js';
import { MissionRegistry } from './mission-registry.js';
import { CustomerIntakeEngine } from './customer-intake-engine.js';
import { CustomerIntakeExecutiveDashboardModel } from './customer-intake-dashboard-model.js';
import { WebsiteBuilderMissionManager } from './website-builder-mission-manager.js';
import { WorkforceDirector } from './workforce-director.js';
import { appendEvent, loadEventList } from '../storage/provider-backed-state.js';

function isoNow() {
  return new Date().toISOString();
}

export class CustomerIntakeMissionControl {
  constructor({
    customerRegistry,
    missionRegistry,
    intakeEngine,
    dashboardModel,
    workforceDirector,
    websiteBuilderMissionManager,
    logger,
    storageProvider,
    namespace = 'executive.customer-intake-mission-control'
  } = {}) {
    this.logger = logger ?? { log: () => {} };
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;
    this.customerRegistry = customerRegistry ?? new CustomerRegistry({ storageProvider: this.storageProvider });
    this.missionRegistry = missionRegistry ?? new MissionRegistry({ storageProvider: this.storageProvider });
    this.workforceDirector = workforceDirector ?? new WorkforceDirector({ logger: this.logger, storageProvider: this.storageProvider });
    this.websiteBuilderMissionManager = websiteBuilderMissionManager ?? new WebsiteBuilderMissionManager({
      workforceDirector: this.workforceDirector,
      logger: this.logger
    });
    this.dashboardModel = dashboardModel ?? new CustomerIntakeExecutiveDashboardModel();
    this.activityFeed = loadEventList({ provider: this.storageProvider, namespace: `${this.namespace}.activity-feed` });

    this.intakeEngine = intakeEngine ?? new CustomerIntakeEngine({
      customerRegistry: this.customerRegistry,
      missionRegistry: this.missionRegistry,
      missionLaunchers: {
        [MissionTypes.WEBSITE_BUILD]: async ({ request }) => {
          return this.websiteBuilderMissionManager.runMission({
            missionId: `website-builder-${Date.now()}`,
            prospectUrl: request.website,
            prospect: {
              approved: true,
              approvedBy: 'ATLAS_CUSTOMER_INTAKE_MISSION_CONTROL_V1',
              companyName: request.companyName,
              segment: request.industry
            },
            existingBranding: request.existingBranding ?? {},
            adapterType: request.adapterType,
            providerHint: request.providerHint,
            stopAfterSandboxUpdate: true
          });
        }
      },
      logger: this.logger
    });
  }

  async intake(payload = {}) {
    const request = createCustomerIntakeRequest(payload);
    const result = await this.intakeEngine.processIntake(request);

    if (!result.accepted) {
      this.recordActivity({
        type: 'INTAKE_REJECTED',
        details: {
          issues: result.issues
        }
      });

      return {
        accepted: false,
        issues: result.issues,
        customer: null,
        mission: null,
        dashboard: this.buildDashboard(),
        downstreamResult: null
      };
    }

    this.recordActivity({
      type: result.duplicateDetected ? 'CUSTOMER_DUPLICATE_REUSED' : 'CUSTOMER_CREATED',
      details: {
        customerId: result.customer.customerId,
        companyName: result.customer.companyName
      }
    });

    this.recordActivity({
      type: 'MISSION_CREATED',
      details: {
        missionId: result.mission.missionId,
        customerId: result.customer.customerId,
        missionType: result.mission.missionType,
        executiveStatus: result.mission.executiveStatus
      }
    });

    if (result.mission.executiveStatus === MissionExecutiveStatuses.AWAITING_EXECUTIVE_REVIEW) {
      this.recordActivity({
        type: 'MISSION_AWAITING_EXECUTIVE_REVIEW',
        details: {
          missionId: result.mission.missionId,
          currentStage: result.mission.currentStage
        }
      });
    }

    if (result.mission.executiveStatus === MissionExecutiveStatuses.BLOCKED) {
      this.recordActivity({
        type: 'MISSION_BLOCKED',
        details: {
          missionId: result.mission.missionId,
          currentStage: result.mission.currentStage
        }
      });
    }

    return {
      accepted: true,
      issues: [],
      duplicateDetected: result.duplicateDetected,
      customer: result.customer,
      mission: result.mission,
      dashboard: this.buildDashboard(),
      downstreamResult: result.downstreamResult
    };
  }

  listCustomers() {
    return this.customerRegistry.listCustomers();
  }

  listMissions() {
    return this.missionRegistry.listMissions();
  }

  buildDashboard() {
    return this.dashboardModel.build({
      customers: this.listCustomers(),
      missions: this.listMissions(),
      activityFeed: this.activityFeed
    });
  }

  recordActivity({ type, details = {} }) {
    const event = {
      timestamp: isoNow(),
      type,
      details
    };
    this.activityFeed.push(event);
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.activity-feed`, key: `${event.timestamp}:${type}:${this.activityFeed.length}`, value: event });
  }
}
