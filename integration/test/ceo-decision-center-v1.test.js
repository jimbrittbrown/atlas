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

function createApi() {
  const customerRegistry = new CustomerRegistry();
  const missionRegistry = new MissionRegistry();
  const workforceDirector = new WorkforceDirector();
  const activityFeed = [];

  const customer = customerRegistry.createCustomer({
    companyName: 'Atlas Films',
    contactName: 'Ceo User',
    email: 'ceo@atlas.example',
    phone: '+1-555-0000',
    website: 'https://atlas.example',
    industry: 'Media'
  }).customer;

  missionRegistry.createMission({
    customerId: customer.customerId,
    missionType: 'WEBSITE_BUILD',
    currentStage: 'EXECUTIVE_REVIEW_PENDING',
    progress: 85,
    executiveStatus: 'AWAITING_EXECUTIVE_REVIEW'
  });

  missionRegistry.createMission({
    customerId: customer.customerId,
    missionType: 'DOCUMENTARY',
    currentStage: 'PRODUCTION_BLOCKED',
    progress: 20,
    executiveStatus: 'BLOCKED'
  });

  const missionControl = { customerRegistry, missionRegistry, workforceDirector, activityFeed };
  const planning = new ExecutivePlanningSystem({ missionControl });

  const submitted = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'source-1',
    customerId: customer.customerId,
    title: 'Growth Opportunity',
    description: 'Scale content operations',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Scale',
    strategicObjective: 'Growth',
    expectedBusinessValue: 95,
    urgency: 80,
    estimatedEffort: 40,
    estimatedCost: 180000,
    estimatedDuration: 60,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.4 }],
    confidence: 0.82,
    metadata: { strategicAlignment: 0.9 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE_WITH_CONDITIONS,
    decidedBy: 'CEO',
    rationale: 'Approved with condition.',
    conditions: ['Confirm staffing']
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
              capabilityLimitations: ['Write disabled']
            }
          ];
        }
      }
    })
  });

  return new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({
      env: {
        ATLAS_DASHBOARD_API_TOKEN: 'token-ceo',
        ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'token-exec',
        ATLAS_DASHBOARD_API_TOKEN_OPERATOR: 'token-op'
      }
    })
  });
}

test('CEO decision center endpoint returns required sections', async () => {
  const api = createApi();
  const result = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/ceo/decision-center',
    headers: { authorization: 'Bearer token-ceo' }
  });

  assert.equal(result.httpStatus, 200);
  assert.equal(result.envelope.success, true);

  const data = result.envelope.data;
  assert.equal(Array.isArray(data.executiveReviews), true);
  assert.equal(Array.isArray(data.blockedMissions), true);
  assert.equal(Array.isArray(data.opportunities), true);
  assert.equal(Array.isArray(data.risks), true);
  assert.equal(Array.isArray(data.decisionHistory), true);
  assert.equal(typeof data.dashboardHealth, 'object');
});

test('endpoint is read-only governance safe', async () => {
  const api = createApi();
  const result = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/ceo/decision-center',
    headers: { authorization: 'Bearer token-ceo' }
  });

  assert.equal(result.envelope.data.governance.readOnly, true);
  assert.equal(result.envelope.data.governance.missionExecutionEnabled, false);
  assert.equal(result.envelope.data.governance.publishEnabled, false);
  assert.equal(result.envelope.data.governance.deployEnabled, false);
  assert.equal(result.envelope.data.governance.destructiveActionsEnabled, false);
});

test('operator is forbidden from CEO decision center endpoint', async () => {
  const api = createApi();
  const result = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/ceo/decision-center',
    headers: { authorization: 'Bearer token-op' }
  });

  assert.equal(result.httpStatus, 403);
  assert.equal(result.envelope.error.code, 'FORBIDDEN');
});

test('executive role can read CEO decision center', async () => {
  const api = createApi();
  const result = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/ceo/decision-center',
    headers: { authorization: 'Bearer token-exec' }
  });

  assert.equal(result.httpStatus, 200);
});
