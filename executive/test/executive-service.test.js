import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveService } from '../src/executive-service.js';
import { DefaultEventLogger } from '../src/event-logger.js';
import { DefaultNotificationManager } from '../src/notification-manager.js';
import { SimpleRequestRouter } from '../src/request-router.js';
import { DefaultWorkflowStateMachine } from '../src/workflow-state-machine.js';
import { InMemoryWorkflowManager } from '../src/workflow-manager.js';
import { ExecutiveRequest, WorkflowState } from '../src/models.js';

function createRequest() {
  return new ExecutiveRequest('req-1', 'EXECUTE', { objective: 'Launch service' }, '2026-07-05T00:00:00.000Z');
}

test('creates a workflow and assigns a workflow id', async () => {
  const service = new ExecutiveService();
  const response = await service.handleRequest(createRequest());
  assert.equal(response.workflowId, 'wf-req-1');
  assert.equal(response.state.value, 'AWAITING_RESEARCH');
});

test('allows valid state transitions', () => {
  const stateMachine = new DefaultWorkflowStateMachine();
  assert.equal(stateMachine.transitionState(WorkflowState.NEW, WorkflowState.INTENT_ANALYSIS).value, 'INTENT_ANALYSIS');
  assert.equal(stateMachine.transitionState(WorkflowState.INTENT_ANALYSIS, WorkflowState.WORKFLOW_PLANNING).value, 'WORKFLOW_PLANNING');
});

test('rejects invalid state transitions', () => {
  const stateMachine = new DefaultWorkflowStateMachine();
  assert.throws(() => stateMachine.transitionState(WorkflowState.COMPLETED, WorkflowState.NEW), /Invalid state transition/);
});

test('routes workflow states to services', async () => {
  const workflowManager = new InMemoryWorkflowManager(new DefaultWorkflowStateMachine());
  const router = new SimpleRequestRouter({ execute: async () => {} });
  const workflow = workflowManager.createWorkflow(createRequest());
  workflowManager.transition(workflow.id, WorkflowState.INTENT_ANALYSIS);
  workflowManager.transition(workflow.id, WorkflowState.WORKFLOW_PLANNING);
  workflowManager.transition(workflow.id, WorkflowState.AWAITING_RESEARCH);
  await router.route(createRequest(), workflow);
});

test('logs workflow events', () => {
  const eventLogger = new DefaultEventLogger();
  eventLogger.log({ workflowId: 'wf-1', state: WorkflowState.NEW, message: 'created', timestamp: '2026-07-05T00:00:00.000Z' });
  assert.equal(eventLogger.getEvents().length, 1);
});

test('notifies workflow creation', () => {
  const notificationManager = new DefaultNotificationManager();
  notificationManager.notify('wf-1', 'created');
});
