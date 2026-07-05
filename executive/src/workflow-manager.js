import { WorkflowContext, WorkflowInstance, WorkflowState } from './models.js';

export class InMemoryWorkflowManager {
  constructor(stateMachine) {
    this.stateMachine = stateMachine;
    this.workflows = new Map();
  }

  createWorkflow(request) {
    const workflowId = `wf-${request.id}`;
    const now = new Date().toISOString();
    const context = new WorkflowContext(workflowId, request.id, WorkflowState.NEW, now, now, {});
    const workflow = new WorkflowInstance(workflowId, request.id, context);
    this.workflows.set(workflowId, workflow);
    return workflow;
  }

  transition(workflowId, nextState) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow: ${workflowId}`);
    }

    const currentState = workflow.state;
    workflow.state = this.stateMachine.transitionState(currentState, nextState);
    workflow.context.updatedAt = new Date().toISOString();
    return workflow;
  }

  getWorkflow(workflowId) {
    return this.workflows.get(workflowId);
  }
}
