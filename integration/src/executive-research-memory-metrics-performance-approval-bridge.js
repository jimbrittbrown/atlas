export class ExecutiveResearchMemoryMetricsPerformanceApprovalBridge {
  constructor({
    executiveService,
    researchService,
    memoryServiceAdapter,
    metricsServiceAdapter,
    performanceIntelligenceAdapter,
    approvalServiceAdapter,
    requestTranslator,
    responseTranslator,
    logger,
  }) {
    this.executiveService = executiveService;
    this.researchService = researchService;
    this.memoryServiceAdapter = memoryServiceAdapter;
    this.metricsServiceAdapter = metricsServiceAdapter;
    this.performanceIntelligenceAdapter = performanceIntelligenceAdapter;
    this.approvalServiceAdapter = approvalServiceAdapter;
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
        summary: 'Workflow progressed through governance-ready orchestration stack',
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

      this.performanceIntelligenceAdapter.generateFromWorkflowOutcome({
        workflowId,
        requestId: translatedRequest.id,
        executiveState: executiveResponse.state?.value ?? executiveResponse.state ?? 'AWAITING_RESEARCH',
        researchStatus: result.status?.value ?? result.status,
      });

      const approvalRecord = this.approvalServiceAdapter.requestAuthorization({
        workflowId,
        requestId: translatedRequest.id,
        context: translatedRequest.context,
        policy: translatedRequest.context?.approvalPolicy ?? {},
      });

      const shouldReject = translatedRequest.context?.approvalDecision === 'reject';
      if (shouldReject) {
        this.approvalServiceAdapter.deny({
          approvalId: approvalRecord.id,
          decidedBy: translatedRequest.context?.approvedBy ?? 'CEO',
          reason: translatedRequest.context?.rejectionReason ?? 'Rejected by policy gate',
        });
      } else {
        this.approvalServiceAdapter.authorize({
          approvalId: approvalRecord.id,
          approvedBy: translatedRequest.context?.approvedBy ?? 'CEO',
          reason: translatedRequest.context?.approvalReason ?? 'Authorized to proceed',
        });
      }

      const authorization = this.approvalServiceAdapter.getAuthorizationStatus(approvalRecord.id);
      const translatedResponse = this.responseTranslator.translate(result, workflowId);
      this.logger.log({ workflowId, message: 'Governance authorization completed', authorizationStatus: authorization.status });

      return {
        ...translatedResponse,
        authorization,
      };
    } catch (error) {
      this.metricsServiceAdapter.recordIntegrationFailure({
        workflowId,
        requestId: translatedRequest.id,
        service: 'integration-bridge',
        operation: 'execute',
      });
      this.performanceIntelligenceAdapter.recordIntegrationFailure({
        workflowId,
        requestId: translatedRequest.id,
        reason: 'integration-execute-failure',
      });
      throw error;
    }
  }
}
