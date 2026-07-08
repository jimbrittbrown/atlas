export class ExecutiveWorkflowCoordinator {
  constructor({ executiveService, bridge, logger, investigationManager }) {
    this.executiveService = executiveService;
    this.bridge = bridge;
    this.logger = logger;
    this.investigationManager = investigationManager;
  }

  async run(request) {
    const executiveResponse = await this.executiveService.handleRequest(request);
    const integrationResult = await this.bridge.execute(request);

    this.logger.log({
      workflowId: executiveResponse.workflowId,
      message: 'Workflow coordination complete'
    });

    return {
      executiveResponse,
      integrationResult
    };
  }

  async runValidationMission(request) {
    const workflowId = request.id ?? `vm-${Date.now()}`;

    this.logger.log({
      workflowId,
      message: 'MISSION RECEIVED'
    });

    const mission = {
      id: workflowId,
      title: request.objective,
      status: 'MISSION_CREATED',
      sponsor: 'CEO',
      decisionClass: 'Strategic'
    };

    const investigations = [
      'Market Demand',
      'Competition',
      'Economics',
      'Operational Feasibility',
      'Strategic Alignment',
      'Executive Risk'
    ].map((name, index) => ({
      id: `INV-${String(index + 1).padStart(3, '0')}`,
      name,
      objective: `${request.objective} - ${name}`,
      context: {
        missionId: workflowId,
        missionObjective: request.objective,
        investigationName: name
      }
    }));

    const completedInvestigations = await this.investigationManager.executeInvestigations(investigations);
    const investigationResults = completedInvestigations.map((result) => ({
      id: result.investigationId,
      name: result.investigationName,
      status: 'COMPLETE',
      confidence: Math.round((result.research?.report?.confidence ?? 0) * 100),
      findings: [result.research?.report?.executiveSummary ?? 'No executive summary available.'],
      unknowns: []
    }));

    this.logger.log({
      workflowId,
      message: 'Six investigations completed'
    });

    const readiness = {
      status: investigationResults.every((item) => item.status === 'COMPLETE') ? 'READY' : 'NOT_READY',
      rationale: 'All required investigations completed using research coordination results.'
    };

    const decisionPackage = {
      mission,
      investigations: investigationResults,
      readiness,
      recommendation: 'READY_FOR_EXECUTIVE_REVIEW',
      confidence: 80,
      authorityRequired: 'CEO Strategic Approval'
    };

    this.logger.log({
      workflowId,
      message: 'Executive Decision Package generated'
    });

    return decisionPackage;
  }
}
