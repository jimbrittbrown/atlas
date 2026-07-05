export class ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterInstituteBridge {
  constructor({
    controlCenterBridge,
    atlasInstituteAdapter,
    logger,
  }) {
    this.controlCenterBridge = controlCenterBridge;
    this.atlasInstituteAdapter = atlasInstituteAdapter;
    this.logger = logger;
  }

  async execute(request) {
    const result = await this.controlCenterBridge.execute(request);

    const capturedKnowledge = this.atlasInstituteAdapter.captureLearningFromWorkflow({
      request,
      result,
    });

    const learning = this.atlasInstituteAdapter.generateOrganizationalLearning({
      request,
      result,
    });

    this.logger.log({
      workflowId: result.workflowId,
      message: 'Atlas Institute organizational learning generated',
      capturedKnowledge: capturedKnowledge.length,
    });

    return {
      ...result,
      atlasInstitute: {
        capturedKnowledge,
        learning,
      },
    };
  }
}
