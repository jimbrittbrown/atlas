import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { InMemoryExecutiveOperationsLoopStore } from '../src/executive/executive-operations-loop-store.js';
import { ExecutiveOperationsLoopManager } from '../src/executive/executive-operations-loop-manager.js';
import { ExecutiveOperationsLoopPolicy } from '../src/executive/executive-operations-loop-policy.js';
import { ExecutiveOperationsActionTypes } from '../src/executive/executive-operations-loop-contracts.js';

async function createLoopFixture({
  dryRun = true,
  allowRetry = true,
  allowResume = true,
  allowReassignment = true,
  maxRecoveryAttempts = 2,
  recoveryCooldownMs = 60000,
  intervalMs = 10,
  providerStatuses = null,
  customDashboardProvider = null
} = {}) {
  const missionControl = new CustomerIntakeMissionControl();

  const routedCustomer = missionControl.customerRegistry.createCustomer({
    companyName: 'Loop Primary',
    contactName: 'Atlas Ops',
    email: 'ops@loop-primary.example',
    phone: '+1-555-0444',
    website: 'https://loop-primary.example',
    industry: 'Media'
  }).customer;

  missionControl.customerRegistry.createCustomer({
    companyName: 'Loop Intake Gap',
    contactName: 'Atlas Intake',
    email: 'intake@loop-gap.example',
    phone: '+1-555-0445',
    website: 'https://loop-gap.example',
    industry: 'Media'
  });

  const planning = new ExecutivePlanningSystem({ missionControl });

  const approved = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'ops-loop-approved',
    customerId: routedCustomer.customerId,
    title: 'Loop Approved Website Build',
    description: 'Seed approved proposal for orchestrator session.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Operational recovery and visibility',
    strategicObjective: 'Operational readiness',
    expectedBusinessValue: 90,
    urgency: 80,
    estimatedEffort: 30,
    estimatedCost: 80000,
    estimatedDuration: 45,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.35 }],
    confidence: 0.82,
    metadata: { strategicAlignment: 0.9 }
  });

  planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'ops-loop-under-review',
    customerId: routedCustomer.customerId,
    title: 'Loop Pending Decision',
    description: 'Seed proposal awaiting executive handling.',
    missionType: 'DOCUMENTARY',
    requestedOutcome: 'Executive decision required',
    strategicObjective: 'Governance',
    expectedBusinessValue: 50,
    urgency: 55,
    estimatedEffort: 40,
    estimatedCost: 120000,
    estimatedDuration: 60,
    dependencies: [],
    requiredCapabilities: ['RESEARCH'],
    risks: [{ id: 'risk-2', severity: 0.6 }],
    confidence: 0.5,
    metadata: { strategicAlignment: 0.7 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: approved.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for operations loop coverage.',
    conditions: []
  });

  const dashboardManager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    providerHealthAdapter: {
      getProviderStatuses() {
        return providerStatuses ?? [
          {
            providerName: 'Framer',
            configuredStatus: 'AVAILABLE',
            authenticationStatus: 'AVAILABLE',
            connectionStatus: 'AVAILABLE',
            readCapabilityStatus: 'AVAILABLE',
            writeCapabilityStatus: 'PARTIAL',
            warnings: [],
            blockingIssues: [],
            capabilityLimitations: ['Publish blocked by policy']
          }
        ];
      }
    }
  });

  const orchestrated = await dashboardManager.missionOrchestratorManager.orchestrate({
    proposalId: approved.proposal.proposalId
  });
  const missionId = orchestrated.session.missionId;

  const mission = missionControl.missionRegistry.getMissionById(missionId);
  missionControl.missionRegistry.updateMission(missionId, {
    executiveStatus: 'BLOCKED',
    currentStage: 'COMPANY_RESEARCH',
    progress: 20,
    startedDate: new Date(Date.now() - (36 * 60 * 60 * 1000)).toISOString()
  });

  const blockedMissionId = missionId;
  dashboardManager.missionOrchestratorManager.getSessionByMissionId(missionId).state = 'WAITING_RETRY';

  const store = new InMemoryExecutiveOperationsLoopStore();
  const loopManager = new ExecutiveOperationsLoopManager({
    missionControl,
    executivePlanningSystem: planning,
    missionOrchestratorManager: dashboardManager.missionOrchestratorManager,
    missionControlManager: dashboardManager.missionControlManager,
    workforceDirector: missionControl.workforceDirector,
    providerHealthAdapter: dashboardManager.providerHealthAdapter,
    dashboardSnapshotProvider: customDashboardProvider ?? (() => dashboardManager.buildSnapshot()),
    store,
    config: {
      enabled: true,
      intervalMs,
      maxConsecutiveFailures: 2,
      recoveryEnabled: true,
      maxRecoveryAttempts,
      recoveryCooldownMs,
      dryRun,
      allowIntakeRouting: true,
      allowRetry,
      allowResume,
      allowReassignment,
      staleMissionHours: 24,
      deadlineRiskHours: 48,
      developmentMaxCycles: 2
    }
  });

  dashboardManager.operationsLoopManager = loopManager;

  const dashboard = new ExecutiveOperationsDashboard({ manager: dashboardManager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({
      env: {
        ATLAS_DASHBOARD_API_TOKEN: 'token-ceo',
        ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'token-exec',
        ATLAS_DASHBOARD_API_TOKEN_VIEWER: 'token-viewer'
      }
    })
  });

  return {
    missionControl,
    planning,
    dashboardManager,
    dashboard,
    loopManager,
    api,
    missionId,
    blockedMissionId,
    store
  };
}

test('one complete successful cycle', async () => {
  const { loopManager } = await createLoopFixture({ dryRun: true });
  const result = await loopManager.runCycle();

  assert.equal(['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(result.state), true);
  assert.equal(result.findings.length > 0, true);
  assert.equal(result.durationMs >= 0, true);
});

test('dry-run mode records would-execute without side effects', async () => {
  const { loopManager } = await createLoopFixture({ dryRun: true });
  const result = await loopManager.runCycle();

  assert.equal(result.safeActionsExecuted.every((action) => action.dryRun === true), true);
  assert.equal(result.warnings.includes('Dry-run mode enabled; no side effects were executed.'), true);
});

test('intake detection finds customers without missions', async () => {
  const { loopManager } = await createLoopFixture();
  const result = await loopManager.runCycle();

  assert.equal(result.findings.some((finding) => finding.type === 'CUSTOMER_INTAKE_GAP'), true);
});

test('mission prioritization produces deterministic ordered scores', async () => {
  const { loopManager } = await createLoopFixture();
  const result = await loopManager.runCycle();

  assert.equal(result.priorities.length > 0, true);
  for (let i = 1; i < result.priorities.length; i += 1) {
    assert.equal(result.priorities[i - 1].priorityScore >= result.priorities[i].priorityScore, true);
  }
});

test('blocked mission detection is surfaced', async () => {
  const { loopManager, blockedMissionId } = await createLoopFixture();
  const result = await loopManager.runCycle();

  assert.equal(result.findings.some((finding) => finding.type === 'BLOCKED_MISSION' && finding.missionId === blockedMissionId), true);
});

test('eligible retry delegates through recovery coordinator', async () => {
  const { loopManager, missionId, dashboardManager } = await createLoopFixture({ dryRun: false });
  dashboardManager.missionOrchestratorManager.getSessionByMissionId(missionId).state = 'WAITING_RETRY';

  const result = await loopManager.runCycle({ dryRun: false });
  assert.equal(result.safeActionsExecuted.some((action) => action.actionType === 'RETRY_MISSION'), true);
});

test('ineligible retry is blocked when retry disabled', async () => {
  const { loopManager, missionId, dashboardManager } = await createLoopFixture({ dryRun: false, allowRetry: false });
  dashboardManager.missionOrchestratorManager.getSessionByMissionId(missionId).state = 'WAITING_RETRY';

  const result = await loopManager.runCycle({ dryRun: false });
  assert.equal(result.actionsBlockedByGovernance.some((action) => action.actionType === 'RETRY_MISSION'), true);
});

test('eligible resume delegates through recovery coordinator', async () => {
  const { loopManager, missionId, dashboardManager } = await createLoopFixture({ dryRun: false });
  dashboardManager.missionOrchestratorManager.getSessionByMissionId(missionId).state = 'PAUSED';

  const result = await loopManager.runCycle({ dryRun: false });
  assert.equal(result.safeActionsExecuted.some((action) => action.actionType === 'RESUME_MISSION'), true);
});

test('worker reassignment delegation is attempted for blocked mission', async () => {
  const { loopManager, missionControl } = await createLoopFixture({ dryRun: false });
  let invocations = 0;
  const original = missionControl.workforceDirector.handleStageFailure.bind(missionControl.workforceDirector);
  missionControl.workforceDirector.handleStageFailure = (...args) => {
    invocations += 1;
    return original(...args);
  };

  await loopManager.runCycle({ dryRun: false });
  assert.equal(invocations > 0, true);
});

test('CEO escalation is included for decision-required findings', async () => {
  const { loopManager } = await createLoopFixture();
  const result = await loopManager.runCycle();

  assert.equal(result.ceoDecisionsRequired.length > 0, true);
  assert.equal(result.safeActionsConsidered.some((action) => action.actionType === 'ESCALATE_TO_CEO_DECISION_CENTER'), true);
});

test('provider-health warning is detected', async () => {
  const { loopManager } = await createLoopFixture({
    providerStatuses: [{
      providerName: 'Framer',
      configuredStatus: 'AVAILABLE',
      authenticationStatus: 'AVAILABLE',
      connectionStatus: 'NOT_CONNECTED',
      readCapabilityStatus: 'PARTIAL',
      writeCapabilityStatus: 'PARTIAL',
      warnings: ['Connection unstable'],
      blockingIssues: ['Provider unavailable'],
      capabilityLimitations: []
    }]
  });

  const result = await loopManager.runCycle();
  assert.equal(result.findings.some((finding) => finding.type === 'PROVIDER_HEALTH_WARNING'), true);
});

test('alert deduplication increments occurrence count', async () => {
  const { loopManager, store } = await createLoopFixture();
  await loopManager.runCycle();
  await loopManager.runCycle();

  const alerts = store.listAlerts();
  assert.equal(alerts.length > 0, true);
  assert.equal(alerts.some((alert) => Number(alert.occurrenceCount ?? 0) >= 2), true);
});

test('recovery attempt limits and cooldown are enforced', async () => {
  const { loopManager, missionId, dashboardManager } = await createLoopFixture({
    dryRun: false,
    maxRecoveryAttempts: 1,
    recoveryCooldownMs: 600000
  });
  const session = dashboardManager.missionOrchestratorManager.getSessionByMissionId(missionId);
  session.state = 'WAITING_RETRY';

  const first = await loopManager.recoveryCoordinator.retryMission({ missionId, session });
  session.state = 'WAITING_RETRY';
  const second = await loopManager.recoveryCoordinator.retryMission({ missionId, session });

  assert.equal(first.recovered, true);
  assert.equal(second.recovered, false);
  assert.equal(second.reason.includes('Recovery'), true);
});

test('no overlapping cycles are allowed', async () => {
  const { loopManager, store } = await createLoopFixture();
  store.tryAcquireCycleLock();
  const result = await loopManager.runCycle();
  store.releaseCycleLock();

  assert.equal(result.state, 'FAILED');
  assert.equal(result.errors.includes('OVERLAPPING_CYCLE_BLOCKED'), true);
});

test('graceful shutdown stops continuous loop cleanly', async () => {
  const { loopManager } = await createLoopFixture({ intervalMs: 5 });
  const promise = loopManager.startContinuous({ maxCycles: 5 });
  loopManager.stop();
  const result = await promise;

  assert.equal(result.loopState, 'STOPPED');
});

test('consecutive failure threshold transitions loop to failed', async () => {
  const { loopManager } = await createLoopFixture({
    customDashboardProvider: () => {
      throw new Error('snapshot failure');
    }
  });

  await loopManager.runCycle();
  await loopManager.runCycle();
  assert.equal(loopManager.getDashboardProjection().loopState, 'FAILED');
});

test('governance denial blocks unsupported high-risk automatic actions', async () => {
  const policy = new ExecutiveOperationsLoopPolicy();
  const decision = policy.evaluateAction({ actionType: ExecutiveOperationsActionTypes.REQUEST_EXECUTIVE_REVIEW }, { config: { dryRun: false } });
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiresExecutiveApproval, true);
});

test('no publish, deploy, or destructive operation execution is reported', async () => {
  const { loopManager } = await createLoopFixture({ dryRun: false });
  await loopManager.runCycle({ dryRun: false });
  const projection = loopManager.getDashboardProjection();

  assert.equal(projection.governanceStatus.publishAttempted, false);
  assert.equal(projection.governanceStatus.deployAttempted, false);
  assert.equal(projection.governanceStatus.destructiveOperationAttempted, false);
});

test('audit-log sanitization avoids secret leakage', async () => {
  const { loopManager, store } = await createLoopFixture();
  await loopManager.runCycle();
  const serialized = JSON.stringify(store.listAuditEntries(50));

  assert.equal(serialized.includes('token-'), false);
  assert.equal(serialized.includes('@loop-primary.example'), false);
});

test('dashboard and API projection expose operations-loop status', async () => {
  const { loopManager, dashboard, api } = await createLoopFixture();
  await loopManager.runCycle();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(Boolean(snapshot.operationsLoop), true);

  const response = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/operations-loop',
    headers: { authorization: 'Bearer token-viewer' }
  });

  assert.equal(response.httpStatus, 200);
  assert.equal(typeof response.envelope.data.loopState, 'string');
});

test('storage adapter behavior records cycles, alerts, and heartbeats', async () => {
  const store = new InMemoryExecutiveOperationsLoopStore();
  store.transitionLoopState('RUNNING');
  store.touchHeartbeat();
  store.upsertAlert('a', { alertId: '1', firstDetectedAt: new Date().toISOString(), lastDetectedAt: new Date().toISOString(), occurrenceCount: 1 });
  store.completeCycle({ state: 'COMPLETED', durationMs: 10 });

  const status = store.getStatus();
  assert.equal(status.metrics.totalCycles, 1);
  assert.equal(status.activeAlerts.length, 1);
  assert.equal(typeof status.heartbeat.lastBeatAt, 'string');
});

test('compatibility with existing mission control, dashboard, workforce, and planning surfaces', async () => {
  const { loopManager, missionControl, planning, dashboard } = await createLoopFixture();
  const result = await loopManager.runCycle();

  assert.equal(typeof missionControl.buildDashboard(), 'object');
  assert.equal(typeof planning.buildDashboard(), 'object');
  assert.equal(typeof missionControl.workforceDirector.buildDashboard(), 'object');
  assert.equal(typeof dashboard.generateSnapshot(), 'object');
  assert.equal(result.findings.length > 0, true);
});
