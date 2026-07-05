export class ExecutiveResearchMemoryBridge {
  constructor({ executiveService, researchService, memoryServiceAdapter, requestTranslator, responseTranslator, logger }) {
    this.executiveService = executiveService;
    this.researchService = researchService;
    this.memoryServiceAdapter = memoryServiceAdapter;
    this.requestTranslator = requestTranslator;
    this.responseTranslator = responseTranslator;
    this.logger = logger;
  }

  async execute(request) {
    const executiveResponse = await this.executiveService.handleRequest(request);
    const translatedRequest = this.requestTranslator.translate(request);
    const job = await this.researchService.createResearchJob(translatedRequest.id, translatedRequest.objective, translatedRequest.context);
    const result = await this.researchService.executeResearch(job.id, translatedRequest);

    await this.memoryServiceAdapter.storeResearchCompletion({
      workflowId: executiveResponse.workflowId,
      requestId: translatedRequest.id,
      report: result.report,
      evidence: result.evidence,
      findings: result.findings,
    });

    await this.memoryServiceAdapter.storeWorkflowHistory({
      workflowId: executiveResponse.workflowId,
      requestId: translatedRequest.id,
      summary: 'Workflow progressed through research and memory storage',
      details: JSON.stringify({
        workflowId: executiveResponse.workflowId,
        researchJobId: result.jobId,
        researchStatus: result.status?.value ?? result.status,
      }),
    });

    const translatedResponse = this.responseTranslator.translate(result, executiveResponse.workflowId);
    this.logger.log({ workflowId: executiveResponse.workflowId, message: 'Research report stored in memory and returned to executive workflow' });
    return translatedResponse;
  }
}
