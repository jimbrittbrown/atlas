import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerRegistry } from '../src/executive/customer-registry.js';
import { MissionRegistry } from '../src/executive/mission-registry.js';
import { WorkforceDirector } from '../src/executive/workforce-director.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { ExecutiveDashboardApiRateLimiter } from '../src/executive/executive-dashboard-api-rate-limiter.js';

function buildMissionControl() {
  const customerRegistry = new CustomerRegistry();
  const missionRegistry = new MissionRegistry();
  const workforceDirector = new WorkforceDirector();
  const activityFeed = [];

  const c1 = customerRegistry.createCustomer({
    companyName: 'North Ridge HVAC',
    contactName: 'Morgan Lee',
    email: 'morgan@northridge.example',
    phone: '+1-303-555-0199',
    website: 'https://northridge.example',
    industry: 'Home Services'
  }).customer;

  const mission = missionRegistry.createMission({
    customerId: c1.customerId,
    missionType: 'WEBSITE_BUILD',
    currentStage: 'SANDBOX_PROJECT_UPSERT',
    progress: 100,
    executiveStatus: 'AWAITING_EXECUTIVE_REVIEW'
  });

  missionRegistry.createMission({
    customerId: c1.customerId,
    missionType: 'RESEARCH',
    currentStage: 'COMPANY_RESEARCH',
    progress: 10,
    executiveStatus: 'BLOCKED'
  });

  workforceDirector.planMissionAssignments({ missionId: mission.missionId, missionType: 'WEBSITE_BUILD' });

  activityFeed.push({
    timestamp: new Date().toISOString(),
    type: 'MISSION_CREATED',
    details: { missionId: mission.missionId, customerId: c1.customerId }
  });

  const calls = {
    approve: 0,
    reject: 0,
    publish: 0,
    deploy: 0,
    delete: 0,
    createMission: 0,
    assign: 0,
    modifyCustomer: 0,
    providerWrite: 0
  };

  return {
    customerRegistry,
    missionRegistry,
    workforceDirector,
    activityFeed,
    calls,
    approve() { calls.approve += 1; },
    reject() { calls.reject += 1; },
    publish() { calls.publish += 1; },
    deploy() { calls.deploy += 1; },
    delete() { calls.delete += 1; },
    createMission() { calls.createMission += 1; },
    assignWorker() { calls.assign += 1; },
    updateCustomer() { calls.modifyCustomer += 1; },
    providerWrite() { calls.providerWrite += 1; }
  };
}

function createApi({ envOverrides = {}, rate = {} } = {}) {
  const missionControl = buildMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });

  const s1 = planning.submitProposal({
    sourceType: 'CUSTOMER',
    sourceId: 'src-1',
    customerId: missionControl.customerRegistry.listCustomers()[0].customerId,
    title: 'Website Expansion',
    description: 'Website expansion proposal',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Lead growth',
    strategicObjective: 'Pipeline',
    expectedBusinessValue: 90,
    urgency: 85,
    estimatedEffort: 30,
    estimatedCost: 50000,
    estimatedDuration: 45,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH', 'BRAND_PACKAGE_GENERATION'],
    risks: [{ id: 'r1', severity: 0.3 }],
    confidence: 0.84,
    metadata: {
      companyName: 'North Ridge HVAC',
      contactName: 'Morgan Lee',
      contactEmail: 'morgan@northridge.example',
      contactPhone: '+1-303-555-0199',
      website: 'https://northridge.example',
      industry: 'Home Services'
    }
  });

  const s2 = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'src-2',
    customerId: missionControl.customerRegistry.listCustomers()[0].customerId,
    title: 'Documentary Initiative',
    description: 'Documentary initiative proposal',
    missionType: 'DOCUMENTARY',
    requestedOutcome: 'Brand authority',
    strategicObjective: 'Positioning',
    expectedBusinessValue: 60,
    urgency: 50,
    estimatedEffort: 75,
    estimatedCost: 350000,
    estimatedDuration: 120,
    dependencies: ['dep_missing'],
    requiredCapabilities: ['RESEARCH'],
    risks: [{ id: 'r2', severity: 0.82 }],
    confidence: 0.45
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: s1.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approve',
    conditions: []
  });
  planning.applyDecision({
    proposalId: s2.proposal.proposalId,
    decision: ExecutiveDecisions.REVISION_REQUIRED,
    decidedBy: 'CEO',
    rationale: 'Revise',
    conditions: []
  });

  const dashboard = new ExecutiveOperationsDashboard({
    manager: new ExecutiveOperationsDashboardManager({
      missionControl,
      executivePlanningSystem: planning,
      providerHealthAdapter: {
        getProviderStatuses() {
          return [
            {
              providerName: 'Framer',
              configuredStatus: 'AVAILABLE',
              authenticationStatus: 'AVAILABLE',
              connectionStatus: 'AVAILABLE',
              readCapabilityStatus: 'AVAILABLE',
              writeCapabilityStatus: 'PARTIAL',
              warnings: [],
              blockingIssues: [],
              capabilityLimitations: ['Write path gated']
            }
          ];
        }
      },
      reportPaths: ['review/executive-operations-dashboard-v1-report.json']
    })
  });

  const env = {
    ATLAS_DASHBOARD_API_TOKEN: 'token-ceo-123',
    ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'token-exec-123',
    ATLAS_DASHBOARD_API_TOKEN_OPERATOR: 'token-op-123',
    ATLAS_DASHBOARD_API_TOKEN_AUDITOR: 'token-aud-123',
    ATLAS_DASHBOARD_API_TOKEN_READ_ONLY_SERVICE: 'token-svc-123',
    ...envOverrides
  };

  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({ env }),
    rateLimiter: new ExecutiveDashboardApiRateLimiter({
      requestsPerWindow: rate.requestsPerWindow ?? 100,
      windowMs: rate.windowMs ?? 60000,
      now: rate.now
    })
  });

  return { api, missionControl, env };
}

async function call(api, { token, path, query = {}, method = 'GET', clientId = 'test-client' }) {
  return api.handleRequest({
    method,
    path,
    query,
    clientId,
    headers: token
      ? { authorization: `Bearer ${token}` }
      : {}
  });
}

test('authenticated CEO access', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard' });
  assert.equal(res.httpStatus, 200);
  assert.equal(res.envelope.success, true);
});

test('authenticated executive access', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-exec-123', path: '/api/v1/dashboard/overview' });
  assert.equal(res.httpStatus, 200);
});

test('authenticated operator access', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-op-123', path: '/api/v1/dashboard/workforce' });
  assert.equal(res.httpStatus, 200);
});

test('authenticated auditor access', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-aud-123', path: '/api/v1/dashboard/snapshots' });
  assert.equal(res.httpStatus, 200);
});

test('authenticated service access', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-svc-123', path: '/api/v1/dashboard' });
  assert.equal(res.httpStatus, 200);
});

test('missing token', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: null, path: '/api/v1/dashboard' });
  assert.equal(res.httpStatus, 401);
  assert.equal(res.envelope.error.code, 'UNAUTHORIZED');
});

test('invalid token', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'invalid', path: '/api/v1/dashboard' });
  assert.equal(res.httpStatus, 401);
});

test('forbidden role access', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-op-123', path: '/api/v1/dashboard/decisions' });
  assert.equal(res.httpStatus, 403);
  assert.equal(res.envelope.error.code, 'FORBIDDEN');
});

test('token redaction in auth helper', async () => {
  const { api } = await createApi();
  const redacted = api.auth.redactToken('token-ceo-123');
  assert.equal(redacted.startsWith('redacted:'), true);
  assert.equal(redacted.includes('token-ceo-123'), false);
});

test('overview endpoint', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-exec-123', path: '/api/v1/dashboard/overview' });
  assert.equal(res.httpStatus, 200);
  assert.equal(typeof res.envelope.data.totalCustomers, 'number');
});

test('decision endpoint with filters', async () => {
  const { api } = await createApi();
  const res = await call(api, {
    token: 'token-ceo-123',
    path: '/api/v1/dashboard/decisions',
    query: { decisionType: 'CEO_GOVERNANCE_APPROVAL' }
  });
  assert.equal(res.httpStatus, 200);
  assert.equal(Array.isArray(res.envelope.data), true);
});

test('mission filters', async () => {
  const { api } = await createApi();
  const res = await call(api, {
    token: 'token-exec-123',
    path: '/api/v1/dashboard/missions',
    query: { blockedStatus: 'true' }
  });
  assert.equal(res.httpStatus, 200);
  assert.equal(res.envelope.data.every((item) => (item.blockingIssues ?? []).length > 0), true);
});

test('workforce endpoint', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-op-123', path: '/api/v1/dashboard/workforce' });
  assert.equal(res.httpStatus, 200);
  assert.equal(Array.isArray(res.envelope.data.workerDetails), true);
});

test('customer endpoint', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-exec-123', path: '/api/v1/dashboard/customers' });
  assert.equal(res.httpStatus, 200);
});

test('portfolio endpoint', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-exec-123', path: '/api/v1/dashboard/opportunities' });
  assert.equal(res.httpStatus, 200);
});

test('provider endpoint', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-op-123', path: '/api/v1/dashboard/providers' });
  assert.equal(res.httpStatus, 200);
});

test('system-health endpoint', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-op-123', path: '/api/v1/dashboard/system-health' });
  assert.equal(res.httpStatus, 200);
});

test('activity filters', async () => {
  const { api } = await createApi();
  const res = await call(api, {
    token: 'token-op-123',
    path: '/api/v1/dashboard/activity',
    query: { category: 'WORKFORCE' }
  });
  assert.equal(res.httpStatus, 200);
});

test('alert filters', async () => {
  const { api } = await createApi();
  const res = await call(api, {
    token: 'token-op-123',
    path: '/api/v1/dashboard/alerts',
    query: { severity: 'HIGH' }
  });
  assert.equal(res.httpStatus, 200);
});

test('pagination and stable sorting', async () => {
  const { api } = await createApi();
  const first = await call(api, {
    token: 'token-ceo-123',
    path: '/api/v1/dashboard/activity',
    query: { page: 1, pageSize: 2, sortBy: 'timestamp', sortDirection: 'desc' }
  });
  const second = await call(api, {
    token: 'token-ceo-123',
    path: '/api/v1/dashboard/activity',
    query: { page: 1, pageSize: 2, sortBy: 'timestamp', sortDirection: 'desc' }
  });

  assert.equal(first.httpStatus, 200);
  assert.equal(second.httpStatus, 200);
  assert.deepEqual(first.envelope.data, second.envelope.data);
});

test('invalid filters rejected', async () => {
  const { api } = await createApi();
  const res = await call(api, {
    token: 'token-ceo-123',
    path: '/api/v1/dashboard/missions',
    query: { evilFilter: '1' }
  });
  assert.equal(res.httpStatus, 400);
  assert.equal(res.envelope.error.code, 'INVALID_REQUEST');
});

test('maximum page size enforcement', async () => {
  const { api } = await createApi();
  const res = await call(api, {
    token: 'token-ceo-123',
    path: '/api/v1/dashboard/activity',
    query: { pageSize: 9999 }
  });
  assert.equal(res.httpStatus, 200);
  assert.equal(res.envelope.pagination.pageSize <= 100, true);
  assert.equal(res.envelope.pagination.maxPageSizeEnforced, true);
});

test('rate limiting', async () => {
  let now = 1000;
  const { api } = await createApi({
    rate: {
      requestsPerWindow: 2,
      windowMs: 10000,
      now: () => now
    }
  });

  const one = await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/overview', clientId: 'rl-client' });
  const two = await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/overview', clientId: 'rl-client' });
  const three = await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/overview', clientId: 'rl-client' });

  assert.equal(one.httpStatus, 200);
  assert.equal(two.httpStatus, 200);
  assert.equal(three.httpStatus, 429);

  now = 20000;
  const four = await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/overview', clientId: 'rl-client' });
  assert.equal(four.httpStatus, 200);
});

test('audit record generation', async () => {
  const { api } = await createApi();
  await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/overview' });

  const events = api.auditLog.listEvents();
  assert.equal(events.length > 0, true);
  assert.equal(Boolean(events[0].auditEventId), true);
});

test('role-aware redaction for auditor', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-aud-123', path: '/api/v1/dashboard/snapshots' });
  assert.equal(res.httpStatus, 200);

  const full = await call(api, { token: 'token-aud-123', path: '/api/v1/dashboard/snapshots/dash_1' });
  assert.equal(full.httpStatus, 200);
  const items = full.envelope.data.snapshot.ceoDecisionCenter?.items ?? [];
  if (items.length > 0) {
    assert.equal(items.every((item) => item.sourceReportPath == null || !String(item.sourceReportPath).startsWith('/root/')), true);
  }
});

test('safe snapshot listing and lookup', async () => {
  const { api } = await createApi();
  const list = await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/snapshots' });
  assert.equal(list.httpStatus, 200);

  const firstId = list.envelope.data[0]?.snapshotId;
  const item = await call(api, { token: 'token-ceo-123', path: `/api/v1/dashboard/snapshots/${firstId}` });
  assert.equal(item.httpStatus, 200);
});

test('invalid snapshot ID', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/snapshots/../../etc/passwd' });
  assert.equal(res.httpStatus, 404);
});

test('retention policy', async () => {
  const { api } = await createApi();
  api.retention.maxCount = 2;

  await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/overview' });
  await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/overview' });
  await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/overview' });

  const list = await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/snapshots' });
  assert.equal(list.envelope.data.length <= 2, true);
});

test('missing dashboard data returns normalized data unavailable', async () => {
  const api = new ExecutiveDashboardApiService({
    dashboard: {
      generateSnapshot() {
        throw new Error('boom internal');
      },
      getLatestSnapshot() {
        return null;
      },
      manager: { snapshotRegistry: { listSnapshots: () => [], snapshots: [] } }
    },
    auth: new ExecutiveDashboardApiAuth({
      env: { ATLAS_DASHBOARD_API_TOKEN: 'token-ceo-123' }
    })
  });

  const res = await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard/overview' });
  assert.equal(res.httpStatus, 503);
  assert.equal(res.envelope.error.code, 'DATA_UNAVAILABLE');
});

test('normalized errors with no stack-trace leakage', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-op-123', path: '/api/v1/dashboard/decisions' });
  assert.equal(res.httpStatus, 403);
  assert.equal(JSON.stringify(res.envelope).includes('stack'), false);
});

test('read-only governance enforcement no write-side operations', async () => {
  const { api, missionControl } = await createApi();

  await call(api, { token: 'token-ceo-123', path: '/api/v1/dashboard' });
  await call(api, { token: 'token-exec-123', path: '/api/v1/dashboard/missions' });
  await call(api, { token: 'token-op-123', path: '/api/v1/dashboard/workforce' });
  await call(api, { token: 'token-aud-123', path: '/api/v1/dashboard/snapshots' });

  assert.equal(missionControl.calls.approve, 0);
  assert.equal(missionControl.calls.reject, 0);
  assert.equal(missionControl.calls.publish, 0);
  assert.equal(missionControl.calls.deploy, 0);
  assert.equal(missionControl.calls.delete, 0);
  assert.equal(missionControl.calls.createMission, 0);
  assert.equal(missionControl.calls.assign, 0);
  assert.equal(missionControl.calls.modifyCustomer, 0);
  assert.equal(missionControl.calls.providerWrite, 0);
});

test('metadata endpoint', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-op-123', path: '/api/v1/dashboard/metadata' });
  assert.equal(res.httpStatus, 200);
  assert.equal(res.envelope.data.apiVersion, 'v1');
});

test('health endpoint', async () => {
  const { api } = await createApi();
  const res = await call(api, { token: 'token-op-123', path: '/api/v1/dashboard/health' });
  assert.equal(res.httpStatus, 200);
  assert.equal(Boolean(res.envelope.data.readinessClassification), true);
});

test('customer API route fails with DATA_UNAVAILABLE when customer portal manager is not injected', async () => {
  const api = new ExecutiveDashboardApiService({
    dashboard: {
      manager: { snapshotRegistry: { listSnapshots: () => [], snapshots: [] } },
      generateSnapshot() {
        return {};
      },
      getLatestSnapshot() {
        return null;
      }
    },
    auth: new ExecutiveDashboardApiAuth({
      env: { ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'token-customer' }
    })
  });

  const res = await api.handleRequest({
    method: 'POST',
    path: '/api/v1/customer/register',
    headers: { authorization: 'Bearer token-customer' },
    body: {
      email: 'missing-manager@example.com',
      password: 'atlas-pass-1234'
    },
    clientId: 'missing-customer-manager-test'
  });

  assert.equal(res.httpStatus, 503);
  assert.equal(res.envelope.error.code, 'DATA_UNAVAILABLE');
});

test('website production route fails with DATA_UNAVAILABLE when website manager is not injected', async () => {
  const api = new ExecutiveDashboardApiService({
    dashboard: {
      manager: { snapshotRegistry: { listSnapshots: () => [], snapshots: [] } },
      generateSnapshot() {
        return {};
      },
      getLatestSnapshot() {
        return null;
      }
    },
    auth: new ExecutiveDashboardApiAuth({
      env: { ATLAS_DASHBOARD_API_TOKEN_VIEWER: 'token-viewer' }
    })
  });

  const res = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/website-production',
    headers: { authorization: 'Bearer token-viewer' },
    body: {},
    clientId: 'missing-website-manager-test'
  });

  assert.equal(res.httpStatus, 503);
  assert.equal(res.envelope.error.code, 'DATA_UNAVAILABLE');
});
