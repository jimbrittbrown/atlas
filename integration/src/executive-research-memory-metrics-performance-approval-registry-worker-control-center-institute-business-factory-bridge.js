export class ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterInstituteBusinessFactoryBridge {
  constructor({
    instituteBridge,
    businessFactoryAdapter,
    logger,
  }) {
    this.instituteBridge = instituteBridge;
    this.businessFactoryAdapter = businessFactoryAdapter;
    this.logger = logger;
  }

  async execute(request) {
    const result = await this.instituteBridge.execute(request);

    const opportunity = {
      id: `opportunity-${request.id}`,
      approved: true,
      name: request.context?.businessName ?? `Business ${request.id}`,
      objective: request.objective,
    };

    const production = await this.businessFactoryAdapter.runProductionPipeline({
      opportunity,
      requestId: request.id,
      context: request.context ?? {},
    });

    this.logger.log({
      workflowId: result.workflowId,
      message: 'Business Factory production pipeline completed',
      businessId: production.business.id,
    });

    return {
      ...result,
      businessFactory: production,
    };
  }
}
