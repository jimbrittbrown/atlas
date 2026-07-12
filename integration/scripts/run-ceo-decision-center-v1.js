import { mkdirSync, writeFileSync } from 'node:fs';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';

async function main() {
  const missionControl = new CustomerIntakeMissionControl();
  const executivePlanningSystem = new ExecutivePlanningSystem({ missionControl });
  const dashboardManager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem
  });
  const dashboard = new ExecutiveOperationsDashboard({ manager: dashboardManager });

  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({
      env: {
        ATLAS_DASHBOARD_API_TOKEN: process.env.ATLAS_DASHBOARD_API_TOKEN || 'atlas-dev-token',
        ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: process.env.ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE || 'atlas-dev-exec-token'
      }
    })
  });

  const response = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/ceo/decision-center',
    headers: { authorization: `Bearer ${process.env.ATLAS_DASHBOARD_API_TOKEN || 'atlas-dev-token'}` },
    clientId: 'ceo-decision-center-v1-runner'
  });

  const checks = [
    { name: 'http status is 200', passed: response.httpStatus === 200 },
    { name: 'envelope success', passed: response.envelope.success === true },
    { name: 'has executiveReviews', passed: Array.isArray(response.envelope.data?.executiveReviews) },
    { name: 'has blockedMissions', passed: Array.isArray(response.envelope.data?.blockedMissions) },
    { name: 'has opportunities', passed: Array.isArray(response.envelope.data?.opportunities) },
    { name: 'has risks', passed: Array.isArray(response.envelope.data?.risks) },
    { name: 'has decisionHistory', passed: Array.isArray(response.envelope.data?.decisionHistory) },
    { name: 'governance read-only', passed: response.envelope.data?.governance?.readOnly === true }
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    mission: 'ceo-decision-center-v1',
    overallStatus: checks.every((check) => check.passed) ? 'PASS' : 'PARTIAL',
    checks,
    executiveSummary: {
      approvalsNeeded: response.envelope.data?.executiveReviews?.length ?? 0,
      blockedMissions: response.envelope.data?.blockedMissions?.length ?? 0,
      rankedOpportunities: response.envelope.data?.opportunities?.length ?? 0,
      activeRisks: response.envelope.data?.risks?.length ?? 0,
      recentDecisions: response.envelope.data?.decisionHistory?.length ?? 0
    },
    filesCreated: [
      'integration/src/executive/ceo-decision-center-contracts.js',
      'integration/src/executive/ceo-decision-center-manager.js',
      'integration/src/executive/ceo-decision-center-dashboard-model.js',
      'integration/src/executive/ceo-decision-center-api.js',
      'integration/test/ceo-decision-center-v1.test.js',
      'integration/scripts/run-ceo-decision-center-v1.js',
      'integration/docs/ceo-decision-center-v1.md'
    ]
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/ceo-decision-center-v1-report.json', JSON.stringify(report, null, 2));

  const markdown = `# CEO Decision Center v1 Report\n\n- Status: ${report.overallStatus}\n- Generated: ${report.generatedAt}\n\n## Checks\n${checks.map((check) => `- ${check.name}: ${check.passed ? 'PASS' : 'FAIL'}`).join('\n')}\n\n## Executive Summary\n- approvalsNeeded: ${report.executiveSummary.approvalsNeeded}\n- blockedMissions: ${report.executiveSummary.blockedMissions}\n- rankedOpportunities: ${report.executiveSummary.rankedOpportunities}\n- activeRisks: ${report.executiveSummary.activeRisks}\n- recentDecisions: ${report.executiveSummary.recentDecisions}\n`;

  writeFileSync('/root/atlas/review/ceo-decision-center-v1-report.md', markdown);

  console.log('CEO Decision Center v1 validation completed.');
  console.log('/root/atlas/review/ceo-decision-center-v1-report.json');
  console.log('/root/atlas/review/ceo-decision-center-v1-report.md');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
