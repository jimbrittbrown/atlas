import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';

function parseTotals(output) {
  const passMatch = output.match(/(?:ℹ\s+)?pass\s+(\d+)/i);
  const failMatch = output.match(/(?:ℹ\s+)?fail\s+(\d+)/i);
  return {
    pass: Number(passMatch?.[1] ?? 0),
    fail: Number(failMatch?.[1] ?? 0)
  };
}

function runIntegrationTests() {
  const args = [
    '--test',
    'test/customer-portal.test.js',
    'test/customer-intake-api.test.js',
    'test/customer-intake-mission-control.test.js',
    'test/customer-dashboard.test.js',
    'test/mission-routing.test.js',
    'test/executive-dashboard-api-v1.test.js'
  ];
  const result = spawnSync('node', args, { cwd: '/root/atlas/integration', encoding: 'utf8' });
  const output = `${result.stdout}\n${result.stderr}`;
  return {
    command: `node ${args.join(' ')}`,
    status: result.status,
    output,
    ...parseTotals(output)
  };
}

function runFrontendTests() {
  const result = spawnSync('npm', [
    'test',
    '--',
    'src/__tests__/customer-portal.test.tsx',
    'src/__tests__/customer-dashboard.test.tsx'
  ], {
    cwd: '/root/atlas/apps/executive-dashboard',
    encoding: 'utf8'
  });

  const output = `${result.stdout}\n${result.stderr}`;
  const passed = Number(output.match(/Tests\s+(\d+)\s+passed/i)?.[1] ?? 0);
  const failed = Number(output.match(/Tests\s+(\d+)\s+failed/i)?.[1] ?? 0);

  return {
    command: 'npm test -- src/__tests__/customer-portal.test.tsx src/__tests__/customer-dashboard.test.tsx',
    status: result.status,
    output,
    pass: passed,
    fail: failed
  };
}

function markdown(report) {
  return `# Atlas Customer Portal v1 Report\n\n- Status: ${report.overallStatus}\n- Mission routing verified: ${report.missionRoutingVerified ? 'YES' : 'NO'}\n- Persistence verified: ${report.persistenceVerified ? 'YES' : 'NO'}\n- Governance verified: ${report.governanceVerified ? 'YES' : 'NO'}\n\n## Files Created\n${report.filesCreated.map((item) => `- ${item}`).join('\n')}\n\n## Files Modified\n${report.filesModified.map((item) => `- ${item}`).join('\n')}\n\n## Architecture Reused\n${report.architectureReused.map((item) => `- ${item}`).join('\n')}\n\n## API Flow Validation\n${report.apiFlowValidation.map((item) => `- ${item}`).join('\n')}\n\n## Regression Totals\n- Integration pass: ${report.regression.integration.pass}\n- Integration fail: ${report.regression.integration.fail}\n- Frontend pass: ${report.regression.frontend.pass}\n- Frontend fail: ${report.regression.frontend.fail}\n\n## Known Limitations\n${report.knownLimitations.map((item) => `- ${item}`).join('\n')}\n\n## Recommended Next Sprint\n- ${report.recommendedNextSprint}\n`;
}

async function main() {
  const missionControl = new CustomerIntakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning
  });

  const dashboard = new ExecutiveOperationsDashboard({ manager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'portal-customer',
      ATLAS_DASHBOARD_API_TOKEN: 'portal-ceo'
    } })
  });

  const created = await api.handleRequest({
    method: 'POST',
    path: '/api/v1/customer/request',
    headers: {
      authorization: 'Bearer portal-customer'
    },
    body: {
      businessName: 'Customer Portal Validation Co',
      businessType: 'Services',
      websiteUrl: 'https://customer-portal-validation.example',
      contactName: 'Portal Owner',
      email: 'owner@customer-portal-validation.example',
      phone: '+1-555-0788',
      targetAudience: 'buyers',
      businessDescription: 'Validation request for customer portal.',
      goals: ['launch'],
      budget: '$10,000 - $20,000',
      timeline: '8 weeks',
      desiredPages: ['home', 'services', 'contact'],
      preferredColors: ['#114455'],
      specialFeatures: ['booking'],
      competitors: ['competitor.example']
    }
  });

  const customerId = created.envelope.data.customerId;
  const missionId = created.envelope.data.missionId;

  const projects = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/customer/projects',
    headers: {
      authorization: 'Bearer portal-customer',
      'x-customer-id': customerId
    }
  });

  const project = await api.handleRequest({
    method: 'GET',
    path: `/api/v1/customer/project/${missionId}`,
    headers: {
      authorization: 'Bearer portal-customer',
      'x-customer-id': customerId
    }
  });

  const revision = await api.handleRequest({
    method: 'POST',
    path: '/api/v1/customer/revision',
    headers: {
      authorization: 'Bearer portal-customer',
      'x-customer-id': customerId
    },
    body: {
      missionId,
      reason: 'Adjust structure'
    }
  });

  const downloads = await api.handleRequest({
    method: 'GET',
    path: `/api/v1/customer/downloads/${missionId}`,
    headers: {
      authorization: 'Bearer portal-customer',
      'x-customer-id': customerId
    }
  });

  const integrationTests = runIntegrationTests();
  const frontendTests = runFrontendTests();

  const report = {
    generatedAt: new Date().toISOString(),
    overallStatus: integrationTests.status === 0 && frontendTests.status === 0 ? 'PASS' : 'FAIL',
    filesCreated: [
      'integration/src/executive/customer-portal-contracts.js',
      'integration/src/executive/customer-portal-manager.js',
      'integration/src/executive/customer-portal-api.js',
      'integration/test/customer-portal.test.js',
      'integration/test/customer-intake-api.test.js',
      'integration/test/mission-routing.test.js',
      'apps/executive-dashboard/src/pages/CustomerPortalProjectsPage.tsx',
      'apps/executive-dashboard/src/pages/NewWebsiteRequestPage.tsx',
      'apps/executive-dashboard/src/pages/CustomerProjectTrackingPage.tsx',
      'apps/executive-dashboard/src/__tests__/customer-portal.test.tsx',
      'apps/executive-dashboard/src/__tests__/customer-dashboard.test.tsx',
      'integration/docs/customer-portal-v1.md',
      'integration/scripts/run-customer-portal-v1-validation.js'
    ],
    filesModified: [
      'integration/src/executive/executive-dashboard-api-contracts.js',
      'integration/src/executive/executive-dashboard-api-service.js',
      'integration/src/executive/executive-operations-dashboard-manager.js',
      'integration/package.json',
      'integration/README.md',
      'apps/executive-dashboard/src/api/client.ts',
      'apps/executive-dashboard/src/api/types.ts',
      'apps/executive-dashboard/src/config.ts',
      'apps/executive-dashboard/src/App.tsx',
      'apps/executive-dashboard/src/index.css'
    ],
    architectureReused: [
      'Mission Control',
      'Customer Registry',
      'Mission Registry',
      'Executive Planning',
      'Workforce Director',
      'Website Builder Mission',
      'Executive Dashboard APIs',
      'Persistence Layer',
      'Governance Layer'
    ],
    missionRoutingVerified: created.httpStatus === 200
      && created.envelope.data.missionType === 'WEBSITE_BUILD'
      && project.httpStatus === 200,
    persistenceVerified: projects.httpStatus === 200
      && projects.envelope.data.projects.length >= 1,
    governanceVerified: manager.customerPortalManager.getDashboardProjection().totalRequests >= 1,
    apiFlowValidation: [
      `POST /api/v1/customer/request -> ${created.httpStatus}`,
      `GET /api/v1/customer/projects -> ${projects.httpStatus}`,
      `GET /api/v1/customer/project/:id -> ${project.httpStatus}`,
      `POST /api/v1/customer/revision -> ${revision.httpStatus}`,
      `GET /api/v1/customer/downloads/:id -> ${downloads.httpStatus}`
    ],
    regression: {
      integration: {
        command: integrationTests.command,
        pass: integrationTests.pass,
        fail: integrationTests.fail
      },
      frontend: {
        command: frontendTests.command,
        pass: frontendTests.pass,
        fail: frontendTests.fail
      }
    },
    knownLimitations: [
      'Authentication layer is provider-agnostic scaffolding and does not yet integrate external identity providers.',
      'File uploads are currently metadata references; binary storage integration is deferred.',
      'Download references are contract placeholders until artifact packaging service exposes direct file handles.'
    ],
    recommendedNextSprint: 'Integrate customer authentication provider, binary asset storage pipeline, and live artifact package delivery URLs with signed access tokens.'
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/customer-portal-report.json', JSON.stringify(report, null, 2));
  writeFileSync('/root/atlas/review/customer-portal-report.md', markdown(report));

  console.log('Customer Portal v1 validation completed.');
  console.log('/root/atlas/review/customer-portal-report.json');
  console.log('/root/atlas/review/customer-portal-report.md');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
