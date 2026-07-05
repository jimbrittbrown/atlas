import test from 'node:test';
import assert from 'node:assert/strict';
import { ControlCenterService } from '../src/control-center-service.js';

test('builds system overview from authoritative services without storing state', () => {
  const service = new ControlCenterService({
    capabilityRegistry: {
      searchCapabilities: () => ({ records: [{ metadata: { name: 'Approval Service' } }], total: 1 }),
    },
    workerOrchestration: {
      getWorkflowStatus: () => ({ id: 'exec-1', state: { value: 'COMPLETED' } }),
      getHistory: () => [],
    },
    approvalService: {
      getApprovalHistory: () => [{ status: 'APPROVED' }, { status: 'PENDING' }],
    },
  });

  const overview = service.getSystemOverview({ workflowId: 'wf-1500', workflowExecutionId: 'exec-1', requestId: 'req-1500' });
  assert.equal(overview.workflowState, 'COMPLETED');
  assert.equal(overview.capabilitiesTotal, 1);
  assert.equal(overview.approvals.approved, 1);
  assert.equal(overview.approvals.pending, 1);
  assert.equal(service.getHistory().length > 0, true);
});

test('builds capability health snapshot from registry and performance service', () => {
  const service = new ControlCenterService({
    capabilityRegistry: {
      searchCapabilities: () => ({
        records: [
          { status: 'ACTIVE', metadata: { name: 'Worker Orchestration', owner: 'Atlas', version: '1.0.0' } },
        ],
        total: 1,
      }),
    },
    performanceService: {
      getCapabilityHealth: () => ({ score: 0.98, trend: 'stable' }),
    },
  });

  const snapshot = service.getCapabilityHealthSnapshot();
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.records[0].capability, 'Worker Orchestration');
  assert.equal(snapshot.records[0].health.score, 0.98);
});

test('builds execution alerts from failed execution and rejected approvals', () => {
  const service = new ControlCenterService({
    workerOrchestration: {
      getWorkflowStatus: () => null,
      getHistory: () => [{ id: 'a1', workerId: 'w1', state: { value: 'FAILED' } }],
    },
    approvalService: {
      getApprovalHistory: () => [{ id: 'ap1', status: 'REJECTED', workflowId: 'wf-1501' }],
    },
  });

  const alerts = service.getExecutionAlerts({ workflowId: 'wf-1501' });
  assert.equal(alerts.alerts.length, 2);
  assert.equal(alerts.alerts.some((x) => x.source === 'worker-orchestration'), true);
  assert.equal(alerts.alerts.some((x) => x.source === 'approval-service'), true);
});

test('provides release and traceability view from authoritative providers', () => {
  const service = new ControlCenterService({
    traceabilityProvider: {
      getTraceabilitySnapshot: () => ({ workOrder: '010', status: 'IN REVIEW' }),
    },
    changelogProvider: {
      getLatestReleaseNotes: () => ({ title: 'Worker Orchestration Service v1.0' }),
    },
  });

  const view = service.getReleaseAndTraceabilityView();
  assert.equal(view.traceability.workOrder, '010');
  assert.equal(view.changelog.title, 'Worker Orchestration Service v1.0');
});

test('rejects operational actions because control center is observational only', () => {
  const service = new ControlCenterService({});
  assert.throws(
    () => service.requestOperationalAction({ type: 'retry-assignment' }),
    /observational only/
  );
});
