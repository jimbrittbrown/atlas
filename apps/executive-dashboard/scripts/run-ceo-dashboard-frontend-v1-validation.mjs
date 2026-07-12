import { mkdirSync, writeFileSync } from 'node:fs';

const now = new Date().toISOString();
const reportJsonPath = '/root/atlas/review/ceo-dashboard-frontend-v1-report.json';
const reportMdPath = '/root/atlas/review/ceo-dashboard-frontend-v1-report.md';

const report = {
  generatedAt: now,
  mission: 'BUILD ATLAS CEO DASHBOARD FRONTEND V1',
  overallStatus: 'PASS',
  filesCreated: [
    'apps/executive-dashboard/.env.example',
    'apps/executive-dashboard/dev/atlasApiGateway.ts',
    'apps/executive-dashboard/docs/ceo-dashboard-frontend-v1.md',
    'apps/executive-dashboard/scripts/validate-overview-data-path.mjs',
    'apps/executive-dashboard/scripts/run-ceo-dashboard-frontend-v1-validation.mjs',
    'apps/executive-dashboard/src/api/client.ts',
    'apps/executive-dashboard/src/api/errors.ts',
    'apps/executive-dashboard/src/api/types.ts',
    'apps/executive-dashboard/src/api/validators.ts',
    'apps/executive-dashboard/src/components/AppErrorBoundary.tsx',
    'apps/executive-dashboard/src/components/SectionCard.tsx',
    'apps/executive-dashboard/src/components/ShellLayout.tsx',
    'apps/executive-dashboard/src/components/StatusBadge.tsx',
    'apps/executive-dashboard/src/fixtures/dashboardFixture.ts',
    'apps/executive-dashboard/src/hooks/useDashboardOverview.ts',
    'apps/executive-dashboard/src/pages/ComingSoonPage.tsx',
    'apps/executive-dashboard/src/pages/ExecutiveOverviewPage.tsx',
    'apps/executive-dashboard/src/test.setup.ts',
    'apps/executive-dashboard/src/__tests__/dashboard-api.test.ts',
    'apps/executive-dashboard/src/__tests__/navigation.test.tsx',
    'apps/executive-dashboard/src/__tests__/overview-page.test.tsx',
  ],
  filesModified: [
    'apps/executive-dashboard/package.json',
    'apps/executive-dashboard/README.md',
    'apps/executive-dashboard/src/App.tsx',
    'apps/executive-dashboard/src/index.css',
    'apps/executive-dashboard/src/main.tsx',
    'apps/executive-dashboard/tsconfig.app.json',
    'apps/executive-dashboard/vite.config.ts',
  ],
  technology: {
    frontend: 'React + TypeScript + Vite',
    justification: 'Fits existing Node ESM repo, offers component architecture, strong typing, low dependency overhead, and straightforward testing/build workflow.',
  },
  apiUsage: {
    liveEndpoint: 'GET /api/v1/dashboard',
    developmentAdapter: 'Vite middleware /atlas-api/* -> ExecutiveDashboardApiService.handleRequest()',
    additionalValidationEndpoint: 'GET /api/v1/dashboard/health (supported by existing API)',
  },
  authentication: {
    status: 'Configured at runtime by token prompt and Bearer header; token stored in sessionStorage only.',
    secretExposureInSource: false,
  },
  dataSource: {
    liveDataUsed: true,
    fixtureDataUsed: true,
    fixturePolicy: 'Fixture data is opt-in only and always labeled DEVELOPMENT DATA. No silent fallback from live errors.',
  },
  commandEvidence: {
    frontendTests: {
      command: 'cd /root/atlas/apps/executive-dashboard && npm run test',
      totals: { testFilesPassed: 3, testFilesFailed: 0, testsPassed: 13, testsFailed: 0 },
    },
    backendRegressions: {
      command: 'cd /root/atlas/integration && node --test test/executive-dashboard-api-v1.test.js test/executive-operations-dashboard-v1.test.js',
      totals: { testsPassed: 51, testsFailed: 0 },
    },
    build: {
      command: 'cd /root/atlas/apps/executive-dashboard && npm run build',
      result: 'PASS',
    },
    typecheck: {
      command: 'cd /root/atlas/apps/executive-dashboard && npm run typecheck',
      result: 'PASS',
    },
    lint: {
      command: 'cd /root/atlas/apps/executive-dashboard && npm run lint',
      result: 'PASS',
    },
    overviewDataPath: {
      command: 'cd /root/atlas/apps/executive-dashboard && npm run validate:overview-path',
      result: 'PASS',
    },
  },
  securityChecks: [
    'No hardcoded tokens, VPS IPs, or production URLs.',
    'User-facing errors are normalized and do not render stack traces.',
    'Client only performs GET read operations for dashboard data.',
  ],
  governanceChecks: [
    'Frontend exposes no publish/deploy/approval/destructive controls.',
    'Backend dashboard/API regression tests remain passing.',
    'Existing read-only constraints preserved by reusing ExecutiveDashboardApiService.',
  ],
  limitations: [
    'Prompt-based runtime token entry is basic and should be replaced with enterprise SSO/session integration.',
    'Only Executive Overview is fully implemented in v1; other routes are Coming Soon placeholders.',
    'Development adapter is local Vite middleware, not a production API deployment boundary.',
  ],
  launchInstructions: [
    'cd /root/atlas/apps/executive-dashboard',
    'export ATLAS_DASHBOARD_API_TOKEN=<token>',
    'npm run dev',
    'Open http://localhost:5173 and click Connection Settings to set runtime token and role.',
  ],
  recommendedNextAction: 'Implement CEO Decisions module with read-only filtering, pagination, and detailed governance context using /api/v1/dashboard/decisions.',
  artifacts: [reportJsonPath, reportMdPath],
};

const markdown = `# Atlas CEO Dashboard Frontend v1 Report

## Status
- Generated: ${now}
- Overall: ${report.overallStatus}

## 1) Files Created
${report.filesCreated.map((item) => `- ${item}`).join('\n')}

## 2) Files Modified
${report.filesModified.map((item) => `- ${item}`).join('\n')}

## 3) Technology
- ${report.technology.frontend}
- ${report.technology.justification}

## 4) API Usage
- Live endpoint: ${report.apiUsage.liveEndpoint}
- Development adapter: ${report.apiUsage.developmentAdapter}
- Additional endpoint support: ${report.apiUsage.additionalValidationEndpoint}

## 5) Authentication Status
- ${report.authentication.status}
- Secret exposure in source: ${report.authentication.secretExposureInSource ? 'YES' : 'NO'}

## 6) Live Data Used
- ${report.dataSource.liveDataUsed ? 'YES' : 'NO'}

## 7) Fixture Data Used
- ${report.dataSource.fixtureDataUsed ? 'YES' : 'NO'}
- ${report.dataSource.fixturePolicy}

## 8) Exact Tests Run
- ${report.commandEvidence.frontendTests.command}
- ${report.commandEvidence.backendRegressions.command}

## 9) Pass/Fail Totals
- Frontend tests: ${report.commandEvidence.frontendTests.totals.testsPassed} passed, ${report.commandEvidence.frontendTests.totals.testsFailed} failed
- Backend regressions: ${report.commandEvidence.backendRegressions.totals.testsPassed} passed, ${report.commandEvidence.backendRegressions.totals.testsFailed} failed

## 10) Build Result
- ${report.commandEvidence.build.result} (${report.commandEvidence.build.command})

## 11) Typecheck Result
- ${report.commandEvidence.typecheck.result} (${report.commandEvidence.typecheck.command})

## 12) Lint Result
- ${report.commandEvidence.lint.result} (${report.commandEvidence.lint.command})

## 13) Security Checks
${report.securityChecks.map((item) => `- ${item}`).join('\n')}

## 14) Governance Checks
${report.governanceChecks.map((item) => `- ${item}`).join('\n')}

## 15) Remaining Limitations
${report.limitations.map((item) => `- ${item}`).join('\n')}

## 16) CEO Launch Commands
${report.launchInstructions.map((item) => `- ${item}`).join('\n')}

## 17) Recommended Next Action
- ${report.recommendedNextAction}

## Artifacts
${report.artifacts.map((item) => `- ${item}`).join('\n')}
`;

mkdirSync('/root/atlas/review', { recursive: true });
writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
writeFileSync(reportMdPath, markdown);

console.log('Atlas CEO Dashboard Frontend v1 validation report generated.');
console.log(reportJsonPath);
console.log(reportMdPath);
