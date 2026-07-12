import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { ExecutiveDashboardApiRateLimiter } from '../src/executive/executive-dashboard-api-rate-limiter.js';

function buildMissionControl() {
  const missionControl = new CustomerIntakeMissionControl();

  missionControl.customerRegistry.createCustomer({
    companyName: 'Mission Control Labs',
    contactName: 'Riley Atlas',
    email: 'riley@missioncontrol.example',
    phone: '+1-555-0222',
    website: 'https://missioncontrol.example',
    industry: 'Media'
  });

  return missionControl;
}

async function createApi({ requestsPerWindow = 200 } = {}) {
  const missionControl = buildMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });

  const customer = missionControl.customerRegistry.listCustomers()[0];
  const submitted = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'mission-control-source',
    customerId: customer.customerId,
    title: 'Mission Control API validation proposal',
    description: 'Proposal to validate mission control command surface.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Controlled recovery commands',
    strategicObjective: 'Governed lifecycle controls',
    expectedBusinessValue: 92,
    urgency: 80,
    estimatedEffort: 30,
    estimatedCost: 90000,
    estimatedDuration: 45,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.3 }],
    confidence: 0.84,
    metadata: { strategicAlignment: 0.9 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for mission control API v1 testing.',
    conditions: []
  });

  const dashboardManager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    providerHealthAdapter: {
      getProviderStatuses() {
        return [];
      }
    }
  });

  const orchestrated = await dashboardManager.missionOrchestratorManager.orchestrate({
    proposalId: submitted.proposal.proposalId
  });

  const missionId = orchestrated.session?.missionId;

  const dashboard = new ExecutiveOperationsDashboard({ manager: dashboardManager });

  const env = {
    ATLAS_DASHBOARD_API_TOKEN: 'token-ceo',
    ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'token-exec',
    ATLAS_DASHBOARD_API_TOKEN_OPERATOR: 'token-op',
    ATLAS_DASHBOARD_API_TOKEN_VIEWER: 'token-viewer',
    ATLAS_DASHBOARD_API_TOKEN_AUDITOR: 'token-aud'
  };

  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({ env }),
    rateLimiter: new ExecutiveDashboardApiRateLimiter({
      requestsPerWindow,
      windowMs: 60000
    })
  });

  return {
    api,
    missionControl,
    missionId,
    orchestrator: dashboardManager.missionOrchestratorManager,
    missionControlManager: api.missionControlManager
  };
}

async function call(api, { token, method = 'GET', path, body = {}, clientId = 'mission-control-test' }) {
  return api.handleRequest({
    method,
    path,
    body,
    clientId,
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
}

function commandBody({ state, idempotencyKey, rollbackTargetStage = null, requestedBy = 'exec-user' } = {}) {
  return {
    requestedBy,
    reason: 'Operational recovery action requested.',
    idempotencyKey,
    expectedCurrentState: state,
    rollbackTargetStage,
    timestamp: new Date().toISOString(),
    correlationId: `corr-${idempotencyKey}`
  };
}

test('authorized execution: executive can pause and resume mission', async () => {
  const { api, missionId, orchestrator } = await createApi();

  const session = orchestrator.getSessionByMissionId(missionId);
  session.state = 'RUNNING';

  const pause = await call(api, {
    token: 'token-exec',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/pause`,
    body: commandBody({ state: 'RUNNING', idempotencyKey: 'pause-key-001' })
  });

  assert.equal(pause.httpStatus, 200);
  assert.equal(pause.envelope.data.state, 'PAUSED');

  const resume = await call(api, {
    token: 'token-exec',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/resume`,
    body: commandBody({ state: 'PAUSED', idempotencyKey: 'resume-key-001' })
  });

  assert.equal(resume.httpStatus, 200);
  assert.equal(['COMPLETED', 'REVISION_REQUIRED'].includes(resume.envelope.data.state), true);
});

test('unauthorized and forbidden roles are rejected for control commands', async () => {
  const { api, missionId, orchestrator } = await createApi();
  orchestrator.getSessionByMissionId(missionId).state = 'RUNNING';

  const unauthorized = await call(api, {
    token: null,
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/pause`,
    body: commandBody({ state: 'RUNNING', idempotencyKey: 'pause-key-unauth' })
  });

  assert.equal(unauthorized.httpStatus, 401);

  const forbiddenViewer = await call(api, {
    token: 'token-viewer',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/pause`,
    body: commandBody({ state: 'RUNNING', idempotencyKey: 'pause-key-viewer' })
  });

  assert.equal(forbiddenViewer.httpStatus, 403);

  const forbiddenOperator = await call(api, {
    token: 'token-op',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/retry`,
    body: commandBody({ state: 'RUNNING', idempotencyKey: 'retry-key-op' })
  });

  assert.equal(forbiddenOperator.httpStatus, 403);
});

test('invalid mission ID is rejected', async () => {
  const { api } = await createApi();

  const response = await call(api, {
    token: 'token-ceo',
    method: 'POST',
    path: '/api/v1/mission-control/mis_missing/retry',
    body: commandBody({ state: 'WAITING_RETRY', idempotencyKey: 'retry-missing-001' })
  });

  assert.equal(response.httpStatus, 404);
  assert.equal(response.envelope.error.code, 'NOT_FOUND');
});

test('invalid lifecycle transition is rejected', async () => {
  const { api, missionId } = await createApi();

  const response = await call(api, {
    token: 'token-exec',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/retry`,
    body: commandBody({ state: 'COMPLETED', idempotencyKey: 'retry-invalid-001' })
  });

  assert.equal(response.httpStatus, 409);
  assert.equal(response.envelope.error.code, 'INVALID_TRANSITION');
});

test('stale expected state is rejected', async () => {
  const { api, missionId } = await createApi();

  const response = await call(api, {
    token: 'token-exec',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/resume`,
    body: commandBody({ state: 'RUNNING', idempotencyKey: 'resume-stale-001' })
  });

  assert.equal(response.httpStatus, 409);
  assert.equal(response.envelope.error.code, 'STALE_EXPECTED_STATE');
});

test('duplicate idempotency key is rejected', async () => {
  const { api, missionId, orchestrator } = await createApi();
  orchestrator.getSessionByMissionId(missionId).state = 'RUNNING';

  const first = await call(api, {
    token: 'token-exec',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/pause`,
    body: commandBody({ state: 'RUNNING', idempotencyKey: 'idem-dup-001' })
  });

  assert.equal(first.httpStatus, 200);

  const duplicate = await call(api, {
    token: 'token-exec',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/pause`,
    body: commandBody({ state: 'PAUSED', idempotencyKey: 'idem-dup-001' })
  });

  assert.equal(duplicate.httpStatus, 409);
  assert.equal(duplicate.envelope.error.code, 'DUPLICATE_COMMAND');
});

test('retry command works from waiting_retry state', async () => {
  const { api, missionId, orchestrator } = await createApi();
  orchestrator.getSessionByMissionId(missionId).state = 'WAITING_RETRY';

  const response = await call(api, {
    token: 'token-exec',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/retry`,
    body: commandBody({ state: 'WAITING_RETRY', idempotencyKey: 'retry-ok-001' })
  });

  assert.equal(response.httpStatus, 200);
});

test('rollback and cancel require highest role and execute for CEO', async () => {
  const { api, missionId } = await createApi();

  const forbiddenExecRollback = await call(api, {
    token: 'token-exec',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/rollback`,
    body: commandBody({ state: 'COMPLETED', idempotencyKey: 'rb-exec-001', rollbackTargetStage: 'TEMPLATE_SELECTION' })
  });

  assert.equal(forbiddenExecRollback.httpStatus, 403);

  const rollback = await call(api, {
    token: 'token-ceo',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/rollback`,
    body: commandBody({ state: 'COMPLETED', idempotencyKey: 'rb-ceo-001', rollbackTargetStage: 'TEMPLATE_SELECTION', requestedBy: 'ceo-user' })
  });

  assert.equal(rollback.httpStatus, 200);
  assert.equal(rollback.envelope.data.state, 'ROLLED_BACK');

  const cancel = await call(api, {
    token: 'token-ceo',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/cancel`,
    body: commandBody({ state: 'ROLLED_BACK', idempotencyKey: 'cancel-ceo-001', requestedBy: 'ceo-user' })
  });

  assert.equal(cancel.httpStatus, 200);
  assert.equal(cancel.envelope.data.state, 'CANCELLED');
});

test('force executive review is available to CEO and enforces review state', async () => {
  const { api, missionId, orchestrator } = await createApi();
  orchestrator.getSessionByMissionId(missionId).state = 'RUNNING';

  const response = await call(api, {
    token: 'token-ceo',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/force-executive-review`,
    body: commandBody({ state: 'RUNNING', idempotencyKey: 'force-review-001', requestedBy: 'ceo-user' })
  });

  assert.equal(response.httpStatus, 200);
  assert.equal(response.envelope.data.state, 'REVISION_REQUIRED');
});

test('command audit entries are recorded and sanitized', async () => {
  const { api, missionId, missionControlManager, orchestrator } = await createApi();
  orchestrator.getSessionByMissionId(missionId).state = 'RUNNING';

  const response = await call(api, {
    token: 'token-exec',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/pause`,
    body: commandBody({ state: 'RUNNING', idempotencyKey: 'audit-key-001', requestedBy: 'exec@atlas.example' })
  });

  assert.equal(response.httpStatus, 200);

  const events = missionControlManager.auditLog.list({ missionId, limit: 5 });
  assert.equal(events.length > 0, true);
  assert.equal(typeof events[0].requesterIdentityHash, 'string');
  assert.equal(events[0].requesterIdentityHash.includes('exec@atlas.example'), false);
});

test('rate limiting applies to mission-control endpoints', async () => {
  const { api, missionId } = await createApi({ requestsPerWindow: 1 });

  const first = await call(api, {
    token: 'token-viewer',
    method: 'GET',
    path: `/api/v1/mission-control/${missionId}`,
    clientId: 'rate-limit-client'
  });

  assert.equal(first.httpStatus, 200);

  const second = await call(api, {
    token: 'token-viewer',
    method: 'GET',
    path: `/api/v1/mission-control/${missionId}`,
    clientId: 'rate-limit-client'
  });

  assert.equal(second.httpStatus, 429);
});

test('mission-control projection includes command availability and governance', async () => {
  const { api, missionId } = await createApi();

  const list = await call(api, {
    token: 'token-viewer',
    method: 'GET',
    path: '/api/v1/mission-control'
  });

  assert.equal(list.httpStatus, 200);
  assert.equal(Array.isArray(list.envelope.data.records), true);

  const detail = await call(api, {
    token: 'token-viewer',
    method: 'GET',
    path: `/api/v1/mission-control/${missionId}`
  });

  assert.equal(detail.httpStatus, 200);
  assert.equal(Array.isArray(detail.envelope.data.availableCommands), true);
  assert.equal(Array.isArray(detail.envelope.data.blockedCommands), true);
  assert.equal(typeof detail.envelope.data.governance.readOnlyControlSurface, 'boolean');
});

test('governance protections prevent publish/deploy/destructive bypass', async () => {
  const { api, missionId, orchestrator } = await createApi();

  const response = await call(api, {
    token: 'token-ceo',
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/force-executive-review`,
    body: commandBody({ state: 'COMPLETED', idempotencyKey: 'force-review-governance-001', requestedBy: 'ceo-user' })
  });

  assert.equal([200, 409].includes(response.httpStatus), true);
  const session = orchestrator.getSessionByMissionId(missionId);
  assert.equal(session.governance.publishBypass, false);
  assert.equal(session.governance.providerHardcoding, false);
  assert.equal(session.governance.ceoApprovalGateBypassed, false);
});

test('regression coverage: CEO decision center and dashboard routes still operate', async () => {
  const { api } = await createApi();

  const decisionCenter = await call(api, {
    token: 'token-ceo',
    method: 'GET',
    path: '/api/v1/ceo/decision-center'
  });

  assert.equal(decisionCenter.httpStatus, 200);

  const dashboardOverview = await call(api, {
    token: 'token-exec',
    method: 'GET',
    path: '/api/v1/dashboard/overview'
  });

  assert.equal(dashboardOverview.httpStatus, 200);
});
