export class ExecutiveResearchMemoryMetricsBridge {
  constructor({
    executiveService,
    researchService,
    memoryServiceAdapter,
    metricsServiceAdapter,
    requestTranslator,
    responseTranslator,
    logger,
  }) {
    this.executiveService = executiveService;
    this.researchService = researchService;
    this.memoryServiceAdapter = memoryServiceAdapter;
    this.metricsServiceAdapter = metricsServiceAdapter;
    this.requestTranslator = requestTranslator;
    this.responseTranslator = responseTranslator;
    this.logger = logger;
  }

  async execute(request) {
    const startedAt = new Date().toISOString();
    const translatedRequest = this.requestTranslator.translate(request);
    let workflowId = null;

    try {
      const executiveResponse = await this.executiveService.handleRequest(request);
      workflowId = executiveResponse.workflowId;

      const job = await this.researchService.createResearchJob(
        translatedRequest.id,
        translatedRequest.objective,
        translatedRequest.context
      );

      const result = await this.researchService.executeResearch(job.id, translatedRequest);

      await this.memoryServiceAdapter.storeResearchCompletion({
        workflowId,
        requestId: translatedRequest.id,
        report: result.report,
        evidence: result.evidence,
        findings: result.findings,
      });

      await this.memoryServiceAdapter.storeWorkflowHistory({
        workflowId,
        requestId: translatedRequest.id,
        summary: 'Workflow progressed through research, memory storage, and metrics recording',
        details: JSON.stringify({
          workflowId,
          researchJobId: result.jobId,
          researchStatus: result.status?.value ?? result.status,
        }),
      });

      this.metricsServiceAdapter.recordWorkflowOutcome({
        workflowId,
        requestId: translatedRequest.id,
        startedAt,
        completedAt: new Date().toISOString(),
        researchStatus: result.status?.value ?? result.status,
        memoryStored: true,
      });

      const translatedResponse = this.responseTranslator.translate(result, workflowId);
      this.logger.log({ workflowId, message: 'Research and memory outcomes measured and recorded' });
      return translatedResponse;
    } catch (error) {
      this.metricsServiceAdapter.recordIntegrationFailure({
        workflowId,
        requestId: translatedRequest.id,
        service: 'integration-bridge',
        operation: 'execute',
      });
      throw error;
    }
  }
}
