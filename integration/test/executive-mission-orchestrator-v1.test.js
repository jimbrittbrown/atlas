import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { RecoveryActions } from '../src/executive/executive-mission-orchestrator-contracts.js';

async function createOrchestratorFixture() {
  const missionControl = new CustomerIntakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });

  const customer = missionControl.customerRegistry.createCustomer({
    companyName: 'Orchestrator Labs',
    contactName: 'Atlas CEO',
    email: 'ceo@orchestratorlabs.example',
    phone: '+1-555-0100',
    website: 'https://orchestratorlabs.example',
    industry: 'Media'
  }).customer;

  const submitted = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'source-orchestrator-1',
    customerId: customer.customerId,
    title: 'Executive Mission Orchestrator Candidate',
    description: 'Route approved website build through orchestrator pipeline.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Launch a sandbox-ready website draft',
    strategicObjective: 'Executive orchestration',
    expectedBusinessValue: 90,
    urgency: 85,
    estimatedEffort: 30,
    estimatedCost: 120000,
    estimatedDuration: 45,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH', 'WEBSITE_GENERATION'],
    risks: [{ id: 'risk-1', severity: 0.35 }],
    confidence: 0.82,
    metadata: { strategicAlignment: 0.9 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approve for orchestration.',
    conditions: []
  });

  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    providerHealthAdapter: { getProviderStatuses: () => [] }
  });

  return {
    proposalId: submitted.proposal.proposalId,
    missionControl,
    planning,
    dashboardManager: manager,
    orchestrator: manager.missionOrchestratorManager
  };
}

test('executive mission orchestrator can route approved proposal into pipeline', async () => {
  const fixture = await createOrchestratorFixture();

  const result = await fixture.orchestrator.orchestrate({ proposalId: fixture.proposalId });

  assert.equal(result.orchestrated, true);
  assert.equal(Boolean(result.session?.orchestrationId), true);
  assert.equal(result.session?.proposalId, fixture.proposalId);
  assert.equal(result.session?.governance?.readOnlyControlSurface, true);
  assert.equal(result.session?.governance?.publishBypass, false);
  assert.equal(result.session?.governance?.providerHardcoding, false);
  assert.equal(result.session?.governance?.ceoApprovalGateBypassed, false);
  assert.equal(result.session?.completionPercentage >= 0, true);
  assert.equal(Array.isArray(result.session?.assignedWorkers), true);
});

test('orchestrator recovery supports rollback and resume operations', async () => {
  const fixture = await createOrchestratorFixture();
  const firstRun = await fixture.orchestrator.orchestrate({ proposalId: fixture.proposalId });

  assert.equal(firstRun.orchestrated, true);

  const rolledBack = await fixture.orchestrator.rollback({
    orchestrationId: firstRun.session.orchestrationId,
    stageId: 'TEMPLATE_SELECTION'
  });

  assert.equal(rolledBack.rolledBack, true);
  assert.equal(rolledBack.session.state, 'ROLLED_BACK');

  const resumed = await fixture.orchestrator.resume({ orchestrationId: firstRun.session.orchestrationId });

  assert.equal(resumed.resumed, true);
  assert.equal(
    ['COMPLETED', 'REVISION_REQUIRED'].includes(resumed.session.state),
    true
  );
  assert.equal(
    resumed.session.recoveryLog.some((entry) => entry.action === RecoveryActions.ROLLBACK),
    true
  );
  assert.equal(
    resumed.session.recoveryLog.some((entry) => entry.action === RecoveryActions.RESUME),
    true
  );
});

test('mission orchestrator endpoint is available to executive role and denies operator', async () => {
  const fixture = await createOrchestratorFixture();
  await fixture.orchestrator.orchestrate({ proposalId: fixture.proposalId });

  const dashboard = new ExecutiveOperationsDashboard({ manager: fixture.dashboardManager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({
      env: {
        ATLAS_DASHBOARD_API_TOKEN: 'token-ceo',
        ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'token-exec',
        ATLAS_DASHBOARD_API_TOKEN_OPERATOR: 'token-op'
      }
    })
  });

  const allowed = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/mission-orchestrator',
    headers: { authorization: 'Bearer token-exec' }
  });

  assert.equal(allowed.httpStatus, 200);
  assert.equal(Array.isArray(allowed.envelope.data.records), true);
  assert.equal(allowed.envelope.data.governance.readOnly, true);
  assert.equal(allowed.envelope.data.governance.missionExecutionEnabled, false);

  const denied = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/mission-orchestrator',
    headers: { authorization: 'Bearer token-op' }
  });

  assert.equal(denied.httpStatus, 403);
  assert.equal(denied.envelope.error.code, 'FORBIDDEN');
});
