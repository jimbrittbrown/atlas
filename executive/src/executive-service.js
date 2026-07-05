import { ExecutiveRequest, ExecutiveResponse, WorkflowState } from './models.js';
import { DefaultEventLogger } from './event-logger.js';
import { DefaultNotificationManager } from './notification-manager.js';
import { SimpleRequestRouter } from './request-router.js';
import { DefaultWorkflowStateMachine } from './workflow-state-machine.js';
import { InMemoryWorkflowManager } from './workflow-manager.js';

export class ExecutiveService {
  constructor({
    workflowManager = new InMemoryWorkflowManager(new DefaultWorkflowStateMachine()),
    stateMachine = new DefaultWorkflowStateMachine(),
    requestRouter = new SimpleRequestRouter(),
    eventLogger = new DefaultEventLogger(),
    notificationManager = new DefaultNotificationManager(),
  } = {}) {
    this.workflowManager = workflowManager;
    this.stateMachine = stateMachine;
    this.requestRouter = requestRouter;
    this.eventLogger = eventLogger;
    this.notificationManager = notificationManager;
  }

  async receiveRequest(request) {
    const workflow = this.workflowManager.createWorkflow(request);
    this.eventLogger.log({
      workflowId: workflow.id,
      state: workflow.state,
      message: 'Workflow created',
      timestamp: new Date().toISOString(),
    });

    this.notificationManager.notify(workflow.id, 'Workflow created');
    return new ExecutiveResponse(workflow.id, workflow.state, 'Executive request accepted');
  }

  async createWorkflow(request) {
    return this.workflowManager.createWorkflow(request);
  }

  async delegate(request, workflow) {
    this.workflowManager.transition(workflow.id, WorkflowState.INTENT_ANALYSIS);
    this.workflowManager.transition(workflow.id, WorkflowState.WORKFLOW_PLANNING);
    this.workflowManager.transition(workflow.id, WorkflowState.AWAITING_RESEARCH);
    await this.requestRouter.route(request, workflow);
  }

  async monitor(workflowId) {
    const workflow = this.workflowManager.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow: ${workflowId}`);
    }

    this.eventLogger.log({
      workflowId: workflow.id,
      state: workflow.state,
      message: 'Workflow monitored',
      timestamp: new Date().toISOString(),
    });

    return new ExecutiveResponse(workflow.id, workflow.state, 'Workflow monitored');
  }

  async handleRequest(request) {
    const created = await this.receiveRequest(request);
    const workflow = this.workflowManager.getWorkflow(created.workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow: ${created.workflowId}`);
    }

    await this.delegate(request, workflow);
    return this.monitor(created.workflowId);
  }
}
