export class SimpleRequestRouter {
  constructor(researchService, approvalService, memoryService, metricsService, performanceIntelligenceService, atlasInstituteService, standardsRepositoryService, openClawIntegration) {
    this.researchService = researchService;
    this.approvalService = approvalService;
    this.memoryService = memoryService;
    this.metricsService = metricsService;
    this.performanceIntelligenceService = performanceIntelligenceService;
    this.atlasInstituteService = atlasInstituteService;
    this.standardsRepositoryService = standardsRepositoryService;
    this.openClawIntegration = openClawIntegration;
  }

  async route(request, workflow) {
    if (workflow.state.value === 'AWAITING_RESEARCH') {
      await this.researchService?.execute(request);
    }

    if (workflow.state.value === 'AWAITING_CEO_APPROVAL') {
      await this.approvalService?.approve(request);
    }

    if (workflow.state.value === 'MEMORY_UPDATE') {
      await this.memoryService?.persist(workflow.id, workflow.context);
    }

    if (workflow.state.value === 'METRICS_COLLECTION') {
      await this.metricsService?.collect(workflow.id);
    }

    if (workflow.state.value === 'PERFORMANCE_ANALYSIS') {
      await this.performanceIntelligenceService?.analyze(workflow.id);
    }

    if (workflow.state.value === 'STANDARDS_REVIEW') {
      await this.standardsRepositoryService?.review(workflow.id);
    }

    if (workflow.state.value === 'EXECUTION_QUEUED') {
      await this.openClawIntegration?.route(workflow.id, request);
    }
  }
}
