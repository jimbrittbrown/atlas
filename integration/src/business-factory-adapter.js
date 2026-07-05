import { BusinessFactoryService } from '../../business-factory/src/business-factory-service.js';

export class BusinessFactoryAdapter {
  constructor({
    executiveService,
    researchService,
    memoryService,
    metricsService,
    performanceService,
    approvalService,
    capabilityRegistryService,
    workerOrchestrationService,
    controlCenterService,
    atlasInstituteService,
    service = null,
  }) {
    this.service = service ?? new BusinessFactoryService({
      executiveService,
      researchService,
      memoryService,
      metricsService,
      performanceService,
      approvalService,
      capabilityRegistryService,
      workerOrchestrationService,
      controlCenterService,
      atlasInstituteService,
    });
  }

  async runProductionPipeline({ opportunity, requestId, context = {} }) {
    const business = this.service.createBusiness({
      approvedOpportunity: opportunity,
      name: opportunity.name,
      objective: opportunity.objective,
      metadata: { source: 'integration', requestId },
    });

    this.service.buildPipeline({ businessId: business.id });

    const launch = await this.service.launchBusiness({
      businessId: business.id,
      requestId,
      context,
    });

    return {
      business: launch.business,
      assignment: launch.assignment,
      research: launch.research,
      visibility: launch.visibility,
      factoryMetrics: this.service.getFactoryMetrics(),
    };
  }

  getBusinessStatus(businessId) {
    return this.service.getBusinessStatus(businessId);
  }
}
