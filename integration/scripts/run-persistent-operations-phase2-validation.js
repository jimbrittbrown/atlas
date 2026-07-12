import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { AtlasPersistentOperationsRuntime } from '../src/executive/atlas-persistent-operations-runtime.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';

function parseTotals(output) {
  const passMatch = output.match(/(?:ℹ\s+)?pass\s+(\d+)/i);
  const failMatch = output.match(/(?:ℹ\s+)?fail\s+(\d+)/i);
  return {
    pass: Number(passMatch?.[1] ?? 0),
    fail: Number(failMatch?.[1] ?? 0)
  };
}

function runTests() {
  const args = [
    '--test',
    'test/persistent-operations-storage-v1.test.js',
    'test/executive-operations-loop-v1.test.js',
    'test/executive-mission-control-api-v1.test.js',
    'test/executive-mission-orchestrator-v1.test.js',
    'test/ceo-decision-center-v1.test.js',
    'test/executive-dashboard-api-v1.test.js',
    'test/executive-operations-dashboard-v1.test.js',
    'test/customer-intake-mission-control.test.js',
    'test/workforce-director.test.js',
    'test/executive-planning-system-v1.test.js'
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

function toMarkdown(report) {
  return `# Atlas Persistent Operations Phase II Report\n\n- Status: ${report.overallStatus}\n- Tests passed: ${report.testTotals.pass}\n- Tests failed: ${report.testTotals.fail}\n- Recovery summary: customers=${report.recoverySummary.recoveredCustomers}, missions=${report.recoverySummary.recoveredMissions}, workers=${report.recoverySummary.recoveredWorkers}, proposals=${report.recoverySummary.recoveredProposals}, snapshots=${report.recoverySummary.recoveredSnapshots}, loopAlerts=${report.recoverySummary.recoveredLoopAlerts}, orchestratorSessions=${report.recoverySummary.recoveredOrchestratorSessions}\n\n## Files Created\n${report.filesCreated.map((item) => `- ${item}`).join('\n')}\n\n## Files Modified\n${report.filesModified.map((item) => `- ${item}`).join('\n')}\n\n## Existing Architecture Reused\n${report.existingArchitectureReused.map((item) => `- ${item}`).join('\n')}\n\n## Validation\n- ${report.testsRun}\n- Publish attempted: ${report.governance.publishAttempted ? 'YES' : 'NO'}\n- Deploy attempted: ${report.governance.deployAttempted ? 'YES' : 'NO'}\n- Destructive action attempted: ${report.governance.destructiveOperationAttempted ? 'YES' : 'NO'}\n- Credentials exposed: ${report.governance.credentialsExposed ? 'YES' : 'NO'}\n\n## Remaining Limitations\n${report.remainingLimitations.map((item) => `- ${item}`).join('\n')}\n\n## Recommended Next Action\n- ${report.recommendedNextAction}\n`;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-phase2-'));
  const databasePath = join(dir, 'atlas-phase2.sqlite');
  const provider = new SQLiteStorageProvider({ databasePath });
  provider.initializeSync();

  try {
    const runtimeA = new AtlasPersistentOperationsRuntime({ storageProvider: provider });
    const envA = runtimeA.initializeSync();

    const customer = envA.missionControl.customerRegistry.createCustomer({
      companyName: 'Phase II Validation Customer',
      contactName: 'Atlas Ops',
      email: 'ops@phase2.example',
      phone: '+1-555-0888',
      website: 'https://phase2.example',
      industry: 'Media'
    }).customer;

    const proposal = envA.executivePlanningSystem.submitProposal({
      sourceType: 'CEO',
      sourceId: 'phase2-source',
      customerId: customer.customerId,
      title: 'Phase II persistent proposal',
      description: 'Persistent operational validation',
      missionType: 'WEBSITE_BUILD',
      requestedOutcome: 'State recovery',
      strategicObjective: 'Persistence',
      expectedBusinessValue: 90,
      urgency: 80,
      estimatedEffort: 30,
      estimatedCost: 75000,
      estimatedDuration: 40,
      dependencies: [],
      requiredCapabilities: ['COMPANY_RESEARCH'],
      risks: [{ id: 'risk-1', severity: 0.25 }],
      confidence: 0.82,
      metadata: { strategicAlignment: 0.9 }
    });

    envA.executivePlanningSystem.evaluateAll();
    envA.executivePlanningSystem.rankPortfolio();
    envA.executivePlanningSystem.applyDecision({
      proposalId: proposal.proposal.proposalId,
      decision: ExecutiveDecisions.APPROVE,
      decidedBy: 'CEO',
      rationale: 'Validate persistence',
      conditions: []
    });

    await envA.dashboardManager.missionOrchestratorManager.orchestrate({ proposalId: proposal.proposal.proposalId });
    await envA.dashboardManager.operationsLoopManager.runCycle({ dryRun: false });
    envA.dashboardManager.snapshotRegistry.saveSnapshot(envA.dashboard.generateSnapshot());

    const api = new ExecutiveDashboardApiService({
      dashboard: envA.dashboard,
      auth: new ExecutiveDashboardApiAuth({ env: {
        ATLAS_DASHBOARD_API_TOKEN: 'phase2-ceo',
        ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'phase2-exec',
        ATLAS_DASHBOARD_API_TOKEN_VIEWER: 'phase2-viewer'
      } })
    });

    await api.handleRequest({
      method: 'GET',
      path: '/api/v1/operations-loop',
      headers: { authorization: 'Bearer phase2-viewer' }
    });

    await runtimeA.close();

    const runtimeB = new AtlasPersistentOperationsRuntime({ storageProvider: provider });
    runtimeB.initializeSync();
    const recoverySummary = runtimeB.buildRecoverySummary();
    await runtimeB.close();

    const testRun = runTests();

    const report = {
      generatedAt: new Date().toISOString(),
      overallStatus: testRun.status === 0 ? 'PASS' : 'FAIL',
      filesCreated: [
        'integration/src/storage/storage-provider.js',
        'integration/src/storage/storage-migrations.js',
        'integration/src/storage/sqlite-storage-provider.js',
        'integration/src/storage/postgresql-storage-provider.js',
        'integration/src/storage/storage-provider-factory.js',
        'integration/src/storage/provider-backed-state.js',
        'integration/src/executive/atlas-persistent-operations-runtime.js',
        'integration/test/persistent-operations-storage-v1.test.js',
        'integration/scripts/run-persistent-operations-phase2-validation.js',
        'integration/docs/persistent-operations-phase2.md'
      ],
      filesModified: [
        'integration/src/executive/customer-registry.js',
        'integration/src/executive/mission-registry.js',
        'integration/src/executive/workforce-registry.js',
        'integration/src/executive/workforce-director.js',
        'integration/src/executive/customer-intake-mission-control.js',
        'integration/src/executive/mission-portfolio-registry.js',
        'integration/src/executive/mission-portfolio-manager.js',
        'integration/src/executive/executive-planning-system.js',
        'integration/src/executive/dashboard-snapshot-registry.js',
        'integration/src/executive/executive-dashboard-api-audit-log.js',
        'integration/src/executive/executive-mission-control-audit-log.js',
        'integration/src/executive/executive-mission-control-manager.js',
        'integration/src/executive/executive-mission-orchestrator-manager.js',
        'integration/src/executive/executive-operations-loop-store.js',
        'integration/src/executive/executive-operations-loop-manager.js',
        'integration/src/executive/executive-operations-dashboard-manager.js',
        'integration/src/executive/executive-dashboard-api-service.js',
        'integration/package.json',
        'integration/package-lock.json',
        'integration/README.md'
      ],
      existingArchitectureReused: [
        'Customer Intake and Mission Control',
        'Customer Registry',
        'Mission Registry',
        'Executive Planning System',
        'Mission Portfolio Registry',
        'Workforce Director',
        'Website Builder Mission Manager',
        'Executive Operations Dashboard',
        'CEO Decision Center',
        'Executive Mission Orchestrator',
        'Executive Mission Control API',
        'Existing dashboard API auth, RBAC, and governance model'
      ],
      recoverySummary,
      testsRun: testRun.command,
      testTotals: {
        pass: testRun.pass,
        fail: testRun.fail
      },
      governance: {
        publishAttempted: false,
        deployAttempted: false,
        destructiveOperationAttempted: false,
        credentialsExposed: false
      },
      remainingLimitations: [
        'PostgreSQL provider is implemented and requires a live database connection plus production migration/runtime configuration when activated.',
        'SQLite provider uses the experimental node:sqlite runtime surface available in the current Node version.',
        'Website builder mission internal artifacts remain persisted through orchestrator session snapshots rather than a separate normalized artifact schema.'
      ],
      recommendedNextAction: 'Add a dedicated PostgreSQL-backed startup profile and migration command path for production deployment, then expand persistence to additional artifact-heavy subsystems as a separate phase.'
    };

    mkdirSync('/root/atlas/review', { recursive: true });
    writeFileSync('/root/atlas/review/persistent-operations-phase2-report.json', JSON.stringify(report, null, 2));
    writeFileSync('/root/atlas/review/persistent-operations-phase2-report.md', toMarkdown(report));

    console.log('Persistent Operations Phase II validation completed.');
    console.log('/root/atlas/review/persistent-operations-phase2-report.json');
    console.log('/root/atlas/review/persistent-operations-phase2-report.md');
  } finally {
    provider.closeSync();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
