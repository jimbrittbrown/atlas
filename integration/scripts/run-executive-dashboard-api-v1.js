import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerRegistry } from '../src/executive/customer-registry.js';
import { MissionRegistry } from '../src/executive/mission-registry.js';
import { WorkforceDirector } from '../src/executive/workforce-director.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';

const OUTPUT_JSON = '/root/atlas/review/executive-dashboard-api-v1-report.json';
const OUTPUT_MD = '/root/atlas/review/executive-dashboard-api-v1-report.md';

function loadIntegrationEnvFile() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const integrationRoot = resolve(scriptDir, '..');
  const envPath = resolve(integrationRoot, '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  const lines = String(content).split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (key.length === 0 || typeof process.env[key] === 'string') continue;

    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"'))
      || (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      process.env[key] = rawValue.slice(1, -1);
      continue;
    }

    process.env[key] = rawValue;
  }
}

function toMarkdown(report) {
  const endpointLines = report.endpointResults.map((item) => `| ${item.endpoint} | ${item.role} | ${item.httpStatus} | ${item.success ? 'YES' : 'NO'} |`).join('\n');
  const checkLines = report.validation.checks.map((item) => `- ${item.name}: ${item.passed ? 'PASS' : 'FAIL'}`).join('\n');

  return `# Atlas Executive Dashboard API v1 Report

## Overall Status
- Status: ${report.overallStatus}
- Checks passed: ${report.validation.testsPassed}
- Checks failed: ${report.validation.testsFailed}

## Endpoint Results
| Endpoint | Role | HTTP | Success |
|---|---|---:|---|
${endpointLines}

## Validation Checks
${checkLines}

## Governance
- Read-only API: ${report.governance.readOnly ? 'YES' : 'NO'}
- Publish executed: ${report.governance.publishExecuted ? 'YES' : 'NO'}
- Deploy executed: ${report.governance.deployExecuted ? 'YES' : 'NO'}
- Approve/reject executed: ${report.governance.approvalExecuted ? 'YES' : 'NO'}
- Delete executed: ${report.governance.deleteExecuted ? 'YES' : 'NO'}
- Provider write executed: ${report.governance.providerWriteExecuted ? 'YES' : 'NO'}

## Required Environment Variables
${report.requiredEnvironmentVariables.map((item) => `- ${item}`).join('\n')}

## Files Created
${report.filesCreated.map((item) => `- ${item}`).join('\n')}

## Files Modified
${report.filesModified.map((item) => `- ${item}`).join('\n')}

## Limitations
${report.limitations.map((item) => `- ${item}`).join('\n')}

## Recommended Next Stage
- ${report.recommendedNextAction}
`;
}

function createMissionControlSeed() {
  const customerRegistry = new CustomerRegistry();
  const missionRegistry = new MissionRegistry();
  const workforceDirector = new WorkforceDirector();
  const activityFeed = [];

  const calls = {
    approve: 0,
    reject: 0,
    publish: 0,
    deploy: 0,
    delete: 0,
    providerWrite: 0
  };

  const customer = customerRegistry.createCustomer({
    companyName: 'North Ridge HVAC',
    contactName: 'Morgan Lee',
    email: 'morgan@northridge.example',
    phone: '+1-303-555-0199',
    website: 'https://northridge.example',
    industry: 'Home Services'
  }).customer;

  const mission = missionRegistry.createMission({
    customerId: customer.customerId,
    missionType: 'WEBSITE_BUILD',
    currentStage: 'SANDBOX_PROJECT_UPSERT',
    progress: 100,
    executiveStatus: 'AWAITING_EXECUTIVE_REVIEW'
  });

  workforceDirector.planMissionAssignments({ missionId: mission.missionId, missionType: 'WEBSITE_BUILD' });

  activityFeed.push({
    timestamp: new Date().toISOString(),
    type: 'MISSION_CREATED',
    details: { missionId: mission.missionId, customerId: customer.customerId }
  });

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
    providerWrite() { calls.providerWrite += 1; }
  };
}

function createApi(env) {
  const missionControl = createMissionControlSeed();
  const planning = new ExecutivePlanningSystem({ missionControl });

  const proposal = planning.submitProposal({
    sourceType: 'CUSTOMER',
    sourceId: 'src-1',
    customerId: missionControl.customerRegistry.listCustomers()[0].customerId,
    title: 'Website Build',
    description: 'Build website',
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
    confidence: 0.83,
    metadata: {
      companyName: 'North Ridge HVAC',
      contactName: 'Morgan Lee',
      contactEmail: 'morgan@northridge.example',
      contactPhone: '+1-303-555-0199',
      website: 'https://northridge.example',
      industry: 'Home Services'
    }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: proposal.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approve',
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
              capabilityLimitations: ['No publish/deploy from API']
            }
          ];
        }
      }
    })
  });

  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({ env })
  });

  return { api, missionControl };
}

async function invoke(api, { endpoint, token, role, query = {} }) {
  const result = await api.handleRequest({
    method: 'GET',
    path: endpoint,
    query,
    clientId: `demo-${role.toLowerCase()}`,
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  return {
    endpoint,
    role,
    httpStatus: result.httpStatus,
    success: result.envelope.success,
    errorCode: result.envelope.error?.code ?? null
  };
}

async function main() {
  loadIntegrationEnvFile();

  const env = {
    ATLAS_DASHBOARD_API_TOKEN: 'demo-ceo-token',
    ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'demo-exec-token',
    ATLAS_DASHBOARD_API_TOKEN_OPERATOR: 'demo-op-token',
    ATLAS_DASHBOARD_API_TOKEN_AUDITOR: 'demo-aud-token',
    ATLAS_DASHBOARD_API_TOKEN_READ_ONLY_SERVICE: 'demo-svc-token',
    ATLAS_DASHBOARD_SNAPSHOT_MAX_COUNT: process.env.ATLAS_DASHBOARD_SNAPSHOT_MAX_COUNT ?? '50',
    ATLAS_DASHBOARD_SNAPSHOT_RETENTION_DAYS: process.env.ATLAS_DASHBOARD_SNAPSHOT_RETENTION_DAYS ?? '30'
  };

  const { api, missionControl } = createApi(env);

  const endpointResults = [];

  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard', token: env.ATLAS_DASHBOARD_API_TOKEN, role: 'CEO' }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/overview', token: env.ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE, role: 'EXECUTIVE' }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/decisions', token: env.ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE, role: 'EXECUTIVE', query: { risk: 0.5 } }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/missions', token: env.ATLAS_DASHBOARD_API_TOKEN_OPERATOR, role: 'OPERATOR', query: { blockedStatus: 'true', pageSize: 10 } }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/workforce', token: env.ATLAS_DASHBOARD_API_TOKEN_OPERATOR, role: 'OPERATOR' }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/customers', token: env.ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE, role: 'EXECUTIVE' }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/opportunities', token: env.ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE, role: 'EXECUTIVE' }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/providers', token: env.ATLAS_DASHBOARD_API_TOKEN_OPERATOR, role: 'OPERATOR' }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/system-health', token: env.ATLAS_DASHBOARD_API_TOKEN_OPERATOR, role: 'OPERATOR' }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/activity', token: env.ATLAS_DASHBOARD_API_TOKEN_OPERATOR, role: 'OPERATOR', query: { category: 'MISSION_CONTROL' } }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/alerts', token: env.ATLAS_DASHBOARD_API_TOKEN_OPERATOR, role: 'OPERATOR', query: { severity: 'WARNING' } }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/snapshots', token: env.ATLAS_DASHBOARD_API_TOKEN_AUDITOR, role: 'AUDITOR' }));

  const snapshotsList = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/dashboard/snapshots',
    clientId: 'demo-aud',
    headers: { authorization: `Bearer ${env.ATLAS_DASHBOARD_API_TOKEN_AUDITOR}` }
  });
  const firstSnapshotId = snapshotsList.envelope.data[0]?.snapshotId;

  endpointResults.push(await invoke(api, { endpoint: `/api/v1/dashboard/snapshots/${firstSnapshotId}`, token: env.ATLAS_DASHBOARD_API_TOKEN_AUDITOR, role: 'AUDITOR' }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/health', token: env.ATLAS_DASHBOARD_API_TOKEN_READ_ONLY_SERVICE, role: 'READ_ONLY_SERVICE' }));
  endpointResults.push(await invoke(api, { endpoint: '/api/v1/dashboard/metadata', token: env.ATLAS_DASHBOARD_API_TOKEN_READ_ONLY_SERVICE, role: 'READ_ONLY_SERVICE' }));

  const unauthorized = await api.handleRequest({ method: 'GET', path: '/api/v1/dashboard', headers: {} });
  const forbidden = await api.handleRequest({ method: 'GET', path: '/api/v1/dashboard/decisions', headers: { authorization: `Bearer ${env.ATLAS_DASHBOARD_API_TOKEN_OPERATOR}` } });

  const checks = [
    { name: 'all endpoint calls succeeded', passed: endpointResults.every((item) => item.httpStatus === 200) },
    { name: 'unauthorized request rejected', passed: unauthorized.httpStatus === 401 },
    { name: 'forbidden request rejected', passed: forbidden.httpStatus === 403 },
    { name: 'audit records generated', passed: api.auditLog.listEvents().length >= endpointResults.length },
    { name: 'snapshot retention active', passed: api.retention.listSnapshotMetadata().length <= api.retention.maxCount },
    { name: 'read-only no publish', passed: missionControl.calls.publish === 0 },
    { name: 'read-only no deploy', passed: missionControl.calls.deploy === 0 },
    { name: 'read-only no approve/reject', passed: missionControl.calls.approve === 0 && missionControl.calls.reject === 0 },
    { name: 'read-only no delete', passed: missionControl.calls.delete === 0 },
    { name: 'read-only no provider write', passed: missionControl.calls.providerWrite === 0 }
  ];

  const testsPassed = checks.filter((item) => item.passed).length;
  const testsFailed = checks.length - testsPassed;

  const filesCreated = [
    'integration/src/executive/executive-dashboard-api-contracts.js',
    'integration/src/executive/executive-dashboard-api-response.js',
    'integration/src/executive/executive-dashboard-api-auth.js',
    'integration/src/executive/executive-dashboard-api-authorizer.js',
    'integration/src/executive/executive-dashboard-api-rate-limiter.js',
    'integration/src/executive/executive-dashboard-api-audit-log.js',
    'integration/src/executive/executive-dashboard-api-snapshot-retention.js',
    'integration/src/executive/executive-dashboard-api-health.js',
    'integration/src/executive/executive-dashboard-api-router.js',
    'integration/src/executive/executive-dashboard-api-service.js',
    'integration/test/executive-dashboard-api-v1.test.js',
    'integration/scripts/run-executive-dashboard-api-v1.js',
    'integration/docs/executive-dashboard-api-v1.md'
  ];

  const filesModified = [
    'integration/package.json',
    'integration/README.md'
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    overallStatus: testsFailed === 0 ? 'PASS' : 'PARTIAL',
    validation: {
      checks,
      testsPassed,
      testsFailed
    },
    endpointResults,
    governance: {
      readOnly: true,
      publishExecuted: missionControl.calls.publish > 0,
      deployExecuted: missionControl.calls.deploy > 0,
      approvalExecuted: missionControl.calls.approve > 0 || missionControl.calls.reject > 0,
      deleteExecuted: missionControl.calls.delete > 0,
      providerWriteExecuted: missionControl.calls.providerWrite > 0
    },
    requiredEnvironmentVariables: [
      'ATLAS_DASHBOARD_API_TOKEN (or role-specific token env vars)',
      'ATLAS_DASHBOARD_API_TOKEN_CEO (optional role override)',
      'ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE (optional)',
      'ATLAS_DASHBOARD_API_TOKEN_OPERATOR (optional)',
      'ATLAS_DASHBOARD_API_TOKEN_AUDITOR (optional)',
      'ATLAS_DASHBOARD_API_TOKEN_READ_ONLY_SERVICE (optional)',
      'ATLAS_DASHBOARD_SNAPSHOT_MAX_COUNT',
      'ATLAS_DASHBOARD_SNAPSHOT_RETENTION_DAYS',
      'ATLAS_DASHBOARD_API_RATE_LIMIT_REQUESTS',
      'ATLAS_DASHBOARD_API_RATE_LIMIT_WINDOW_MS'
    ],
    filesCreated,
    filesModified,
    limitations: [
      'v1 API transport is in-process and framework-agnostic; external server mounting is future work.',
      'Rate limiting and snapshot retention are in-memory and adapter-ready, not distributed.',
      'Token auth is env-var based and should be migrated to managed secret storage for production.'
    ],
    recommendedNextAction: 'Mount API service into Atlas HTTP adapter with TLS, managed secret source, and persistent distributed rate-limit/audit backends.'
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(report));

  console.log('Atlas Executive Dashboard API v1 validation completed.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`Status: ${report.overallStatus}`);

  if (testsFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Atlas Executive Dashboard API v1 validation failed.');
  console.error(error);
  process.exitCode = 1;
});
