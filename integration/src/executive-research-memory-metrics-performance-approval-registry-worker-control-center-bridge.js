export class ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterBridge {
  constructor({
    workerBridge,
    controlCenterAdapter,
    logger,
  }) {
    this.workerBridge = workerBridge;
    this.controlCenterAdapter = controlCenterAdapter;
    this.logger = logger;
  }

  async execute(request) {
    const result = await this.workerBridge.execute(request);

    const workflowExecutionId = result.execution?.id ?? result.execution?.workflowExecutionId ?? null;
    const controlCenter = this.controlCenterAdapter.buildOperationalView({
      workflowId: result.workflowId,
      workflowExecutionId,
      requestId: request.id,
    });

    this.logger.log({
      workflowId: result.workflowId,
      message: 'Control Center operational view generated',
    });

    return {
      ...result,
      controlCenter,
    };
  }
}
