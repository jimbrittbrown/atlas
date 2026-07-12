import { mkdirSync, writeFileSync } from 'node:fs';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';

function buildMissionControl() {
  const missionControl = new CustomerIntakeMissionControl();

  missionControl.customerRegistry.createCustomer({
    companyName: 'Mission Control Report Demo',
    contactName: 'Atlas CEO',
    email: 'ceo@mission-control-report.example',
    phone: '+1-555-0333',
    website: 'https://mission-control-report.example',
    industry: 'Media'
  });

  return missionControl;
}

function commandBody({ state, key, rollbackTargetStage = null, requestedBy = 'exec-runner' } = {}) {
  return {
    requestedBy,
    reason: 'Validation command from mission-control API runner.',
    idempotencyKey: key,
    expectedCurrentState: state,
    rollbackTargetStage,
    timestamp: new Date().toISOString(),
    correlationId: `corr-${key}`
  };
}

async function main() {
  const missionControl = buildMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });

  const customer = missionControl.customerRegistry.listCustomers()[0];
  const submitted = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'mc-api-runner',
    customerId: customer.customerId,
    title: 'Mission Control API runner proposal',
    description: 'Validation proposal for mission control API.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Governed mission controls',
    strategicObjective: 'Operational safety',
    expectedBusinessValue: 88,
    urgency: 79,
    estimatedEffort: 28,
    estimatedCost: 85000,
    estimatedDuration: 40,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.32 }],
    confidence: 0.83,
    metadata: { strategicAlignment: 0.9 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for API validation.',
    conditions: []
  });

  const dashboardManager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning
  });

  const orchestrated = await dashboardManager.missionOrchestratorManager.orchestrate({
    proposalId: submitted.proposal.proposalId
  });

  const missionId = orchestrated.session?.missionId;

  const dashboard = new ExecutiveOperationsDashboard({ manager: dashboardManager });

  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({
      env: {
        ATLAS_DASHBOARD_API_TOKEN: process.env.ATLAS_DASHBOARD_API_TOKEN || 'runner-token-ceo',
        ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: process.env.ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE || 'runner-token-exec',
        ATLAS_DASHBOARD_API_TOKEN_OPERATOR: process.env.ATLAS_DASHBOARD_API_TOKEN_OPERATOR || 'runner-token-op',
        ATLAS_DASHBOARD_API_TOKEN_VIEWER: process.env.ATLAS_DASHBOARD_API_TOKEN_VIEWER || 'runner-token-viewer'
      }
    })
  });

  const invoke = async ({ method, path, token, body = {}, clientId = 'mc-api-runner-client' }) => {
    return api.handleRequest({
      method,
      path,
      body,
      clientId,
      headers: { authorization: `Bearer ${token}` }
    });
  };

  const checks = [];

  const list = await invoke({ method: 'GET', path: '/api/v1/mission-control', token: 'runner-token-viewer' });
  checks.push({ name: 'viewer can list mission control projection', passed: list.httpStatus === 200 });

  const detail = await invoke({ method: 'GET', path: `/api/v1/mission-control/${missionId}`, token: 'runner-token-viewer' });
  checks.push({ name: 'viewer can read mission detail', passed: detail.httpStatus === 200 });

  orchestrated.session.state = 'RUNNING';
  const pause = await invoke({
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/pause`,
    token: 'runner-token-exec',
    body: commandBody({ state: 'RUNNING', key: 'runner-pause-001' })
  });
  checks.push({ name: 'executive pause command accepted', passed: pause.httpStatus === 200 });

  const resume = await invoke({
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/resume`,
    token: 'runner-token-exec',
    body: commandBody({ state: 'PAUSED', key: 'runner-resume-001' })
  });
  checks.push({ name: 'executive resume command accepted', passed: resume.httpStatus === 200 });

  const rollbackForbidden = await invoke({
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/rollback`,
    token: 'runner-token-exec',
    body: commandBody({ state: 'COMPLETED', key: 'runner-rb-exec-001', rollbackTargetStage: 'TEMPLATE_SELECTION' })
  });
  checks.push({ name: 'executive rollback is forbidden', passed: rollbackForbidden.httpStatus === 403 });

  const rollback = await invoke({
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/rollback`,
    token: 'runner-token-ceo',
    body: commandBody({ state: 'COMPLETED', key: 'runner-rb-ceo-001', rollbackTargetStage: 'TEMPLATE_SELECTION', requestedBy: 'ceo-runner' })
  });
  checks.push({ name: 'ceo rollback command accepted', passed: rollback.httpStatus === 200 });

  const cancel = await invoke({
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/cancel`,
    token: 'runner-token-ceo',
    body: commandBody({ state: 'ROLLED_BACK', key: 'runner-cancel-ceo-001', requestedBy: 'ceo-runner' })
  });
  checks.push({ name: 'ceo cancel command accepted', passed: cancel.httpStatus === 200 });

  const duplicate = await invoke({
    method: 'POST',
    path: `/api/v1/mission-control/${missionId}/cancel`,
    token: 'runner-token-ceo',
    body: commandBody({ state: 'CANCELLED', key: 'runner-cancel-ceo-001', requestedBy: 'ceo-runner' })
  });
  checks.push({ name: 'duplicate idempotency key rejected', passed: duplicate.httpStatus === 409 });

  const report = {
    generatedAt: new Date().toISOString(),
    mission: 'executive-mission-control-api-v1',
    overallStatus: checks.every((check) => check.passed) ? 'PASS' : 'PARTIAL',
    checks,
    missionId,
    finalMissionState: api.missionControlManager.getSessionByMissionId(missionId)?.state ?? null,
    auditEventCount: api.missionControlManager.auditLog.list({ missionId, limit: 1000 }).length,
    routesValidated: [
      'GET /api/v1/mission-control',
      'GET /api/v1/mission-control/:missionId',
      'POST /api/v1/mission-control/:missionId/pause',
      'POST /api/v1/mission-control/:missionId/resume',
      'POST /api/v1/mission-control/:missionId/rollback',
      'POST /api/v1/mission-control/:missionId/cancel'
    ],
    filesCreated: [
      'integration/src/executive/executive-mission-control-contracts.js',
      'integration/src/executive/executive-mission-control-audit-log.js',
      'integration/src/executive/executive-mission-control-manager.js',
      'integration/src/executive/executive-mission-control-api.js',
      'integration/test/executive-mission-control-api-v1.test.js',
      'integration/scripts/run-executive-mission-control-api-v1.js',
      'integration/docs/executive-mission-control-api-v1.md'
    ]
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/executive-mission-control-api-v1-report.json', JSON.stringify(report, null, 2));

  const markdown = `# Executive Mission Control API v1 Report\n\n- Status: ${report.overallStatus}\n- Generated: ${report.generatedAt}\n- missionId: ${report.missionId}\n- finalMissionState: ${report.finalMissionState}\n- auditEventCount: ${report.auditEventCount}\n\n## Checks\n${checks.map((check) => `- ${check.name}: ${check.passed ? 'PASS' : 'FAIL'}`).join('\n')}\n\n## Routes Validated\n${report.routesValidated.map((route) => `- ${route}`).join('\n')}\n`;

  writeFileSync('/root/atlas/review/executive-mission-control-api-v1-report.md', markdown);

  console.log('Executive Mission Control API v1 validation completed.');
  console.log('/root/atlas/review/executive-mission-control-api-v1-report.json');
  console.log('/root/atlas/review/executive-mission-control-api-v1-report.md');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
