import {
  MissionExecutiveStatuses,
  MissionTypes,
  validateCustomerIntakeRequest
} from './customer-intake-mission-control-contracts.js';

function mapWebsiteBuilderStatusToExecutiveStatus(builderResult = {}) {
  const state = String(builderResult?.mission?.state ?? '').toUpperCase();

  if (state === 'COMPLETED') {
    return MissionExecutiveStatuses.AWAITING_EXECUTIVE_REVIEW;
  }

  if (state === 'FAILED' || state === 'REVISION_REQUIRED') {
    return MissionExecutiveStatuses.BLOCKED;
  }

  return MissionExecutiveStatuses.ACTIVE;
}

export class CustomerIntakeEngine {
  constructor({ customerRegistry, missionRegistry, missionLaunchers = {}, logger } = {}) {
    this.customerRegistry = customerRegistry;
    this.missionRegistry = missionRegistry;
    this.missionLaunchers = missionLaunchers;
    this.logger = logger ?? { log: () => {} };
  }

  validateRequest(request = {}) {
    return validateCustomerIntakeRequest(request);
  }

  async processIntake(request = {}) {
    const validation = this.validateRequest(request);
    if (!validation.isValid) {
      return {
        accepted: false,
        issues: validation.issues,
        duplicateDetected: false,
        customer: null,
        mission: null,
        downstreamResult: null
      };
    }

    const customerCreation = this.customerRegistry.createCustomer({
      companyName: request.companyName,
      contactName: request.contactName,
      email: request.email,
      phone: request.phone,
      website: request.website,
      industry: request.industry
    });

    const customer = customerCreation.customer;
    const duplicateDetected = customerCreation.duplicateDetected;

    const mission = this.missionRegistry.createMission({
      customerId: customer.customerId,
      missionType: request.missionType,
      assignedWorkforce: ['WEBSITE_DIVISION'],
      currentStage: 'MISSION_CREATED',
      progress: 5,
      executiveStatus: MissionExecutiveStatuses.ACTIVE
    });

    const downstreamResult = await this.launchMission({ request, customer, mission });

    const mappedStatus = mapWebsiteBuilderStatusToExecutiveStatus(downstreamResult);
    const completedDate = mappedStatus === MissionExecutiveStatuses.ACTIVE ? null : new Date().toISOString();

    const updatedMission = this.missionRegistry.updateMission(mission.missionId, {
      currentStage: downstreamResult?.mission?.currentStageId ?? mission.currentStage,
      progress: Number(downstreamResult?.progress?.completionPercentage ?? mission.progress),
      executiveStatus: mappedStatus,
      completedDate
    });

    this.logger.log({
      event: 'customer_intake_processed',
      customerId: customer.customerId,
      missionId: mission.missionId,
      duplicateDetected,
      missionType: request.missionType,
      executiveStatus: updatedMission?.executiveStatus
    });

    return {
      accepted: true,
      issues: [],
      duplicateDetected,
      customer,
      mission: updatedMission,
      downstreamResult
    };
  }

  async launchMission({ request, customer, mission }) {
    const missionType = String(request.missionType ?? '').toUpperCase();

    if (missionType === MissionTypes.WEBSITE_BUILD) {
      const launcher = this.missionLaunchers[MissionTypes.WEBSITE_BUILD];
      if (typeof launcher !== 'function') {
        throw new Error('WEBSITE_BUILD launcher is not configured.');
      }

      return launcher({ request, customer, mission });
    }

    return {
      mission: {
        state: 'UNKNOWN',
        currentStageId: 'UNKNOWN'
      },
      progress: {
        completionPercentage: 0
      }
    };
  }
}
