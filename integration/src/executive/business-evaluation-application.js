export class BusinessEvaluationApplication {
  constructor({ executiveWorkflowCoordinator }) {
    this.executiveWorkflowCoordinator = executiveWorkflowCoordinator;
  }

  async evaluateBusinessOpportunity(request) {
    const missionRequest = this.buildExecutiveMissionRequest(request);
    const result = await this.executiveWorkflowCoordinator.runExecutiveMission(missionRequest);

    return result.decisionPackage;
  }

  buildExecutiveMissionRequest(request) {
    return {
      id: request.id ?? 'BUSINESS-EVAL-REQUEST',
      objective: request.objective ?? request.businessOpportunity ?? request.title ?? 'Evaluate business opportunity',
      ceoQuestions: request.ceoQuestions ?? []
    };
  }
}
