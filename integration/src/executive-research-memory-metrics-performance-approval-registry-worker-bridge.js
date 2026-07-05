export class ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerBridge {
  constructor({
    registryBridge,
    workerOrchestrationAdapter,
    logger,
  }) {
    this.registryBridge = registryBridge;
    this.workerOrchestrationAdapter = workerOrchestrationAdapter;
    this.logger = logger;
  }

  async execute(request) {
    const result = await this.registryBridge.execute(request);

    const authorization = result.authorization;
    if (!authorization?.authorized) {
      this.logger.log({ workflowId: result.workflowId, message: 'Execution skipped because authorization was not granted' });
      return {
        ...result,
        execution: {
          executed: false,
          reason: 'Authorization not granted',
        },
      };
    }

    const executionPlan = request.context?.executionPlan ?? [
      {
        id: `work-item-${request.id}`,
        workflowId: result.workflowId,
        requestId: request.id,
        capability: request.context?.requiredCapability ?? 'Approval Service',
        payload: { objective: request.objective, context: request.context ?? {} },
        dependencies: [],
        maxRetries: 2,
        timeoutMs: 120000,
        stage: 0,
      },
    ];

    const execution = await this.workerOrchestrationAdapter.executeApprovedWorkflow({
      workflowId: result.workflowId,
      requestId: request.id,
      authorization,
      executionPlan,
    });

    this.logger.log({
      workflowId: result.workflowId,
      message: 'Worker orchestration execution completed',
      executionState: execution.state?.value ?? 'UNKNOWN',
    });

    return {
      ...result,
      execution,
    };
  }
}
