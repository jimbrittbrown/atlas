import { ExecutiveRequest, WorkflowState } from '../../executive/src/models.js';

export class ExecutiveWorkflowCoordinator {
  constructor({ executiveService, bridge, logger }) {
    this.executiveService = executiveService;
    this.bridge = bridge;
    this.logger = logger;
  }

  async run(request) {
    const executiveResponse = await this.executiveService.handleRequest(request);
    const integrationResult = await this.bridge.execute(request);
    this.logger.log({ workflowId: executiveResponse.workflowId, message: 'Workflow coordination complete' });
    return { executiveResponse, integrationResult };
  }
}
