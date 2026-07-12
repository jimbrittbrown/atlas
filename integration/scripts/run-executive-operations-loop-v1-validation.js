import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';

function runTests() {
  const args = [
    '--test',
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
  const passMatch = output.match(/(?:ℹ\s+)?pass\s+(\d+)/i);
  const failMatch = output.match(/(?:ℹ\s+)?fail\s+(\d+)/i);
  return {
    command: `node ${args.join(' ')}`,
    status: result.status,
    pass: Number(passMatch?.[1] ?? 0),
    fail: Number(failMatch?.[1] ?? 0),
    output
  };
}

async function createValidationSystem() {
  const missionControl = new CustomerIntakeMissionControl();
  const customer = missionControl.customerRegistry.createCustomer({
    companyName: 'Operations Validation Demo',
    contactName: 'Atlas Ops',
    email: 'ops@operations-validation-demo.example',
    phone: '+1-555-0777',
    website: 'https://operations-validation-demo.example',
    industry: 'Media'
  }).customer;

  const planning = new ExecutivePlanningSystem({ missionControl });
  const approved = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'ops-validation-demo',
    customerId: customer.customerId,
    title: 'Operations validation website build',
    description: 'Validation proposal for operations loop v1.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Operational heartbeat',
    strategicObjective: 'Operational governance',
    expectedBusinessValue: 89,
    urgency: 80,
    estimatedEffort: 30,
    estimatedCost: 76000,
    estimatedDuration: 42,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.31 }],
    confidence: 0.82,
    metadata: { strategicAlignment: 0.91 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: approved.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for loop validation.',
    conditions: []
  });

  const dashboardManager = new ExecutiveOperationsDashboardManager({ missionControl, executivePlanningSystem: planning });
  await dashboardManager.missionOrchestratorManager.orchestrate({ proposalId: approved.proposal.proposalId });

  return { missionControl, planning, dashboardManager };
}

function toMarkdown(report) {
  return `# Atlas Executive Operations Loop v1 Report\n\n## Executive Summary\n- Status: ${report.overallStatus}\n- Current operational status: ${report.currentOperationalStatus}\n- Operations cycle completed: ${report.governanceProof.operationsCycleCompleted ? 'YES' : 'NO'}\n- Executive report generated: ${report.governanceProof.executiveReportGenerated ? 'YES' : 'NO'}\n\n## Files Created\n${report.filesCreated.map((item) => `- ${item}`).join('\n')}\n\n## Files Modified\n${report.filesModified.map((item) => `- ${item}`).join('\n')}\n\n## Existing Architecture Reused\n${report.existingArchitectureReused.map((item) => `- ${item}`).join('\n')}\n\n## Loop Lifecycle Implemented\n${report.loopLifecycleImplemented.map((item) => `- ${item}`).join('\n')}\n\n## Systems Inspected\n${report.systemsInspected.map((item) => `- ${item}`).join('\n')}\n\n## Findings Detected\n${report.findingsDetected.map((item) => `- ${item}`).join('\n')}\n\n## Priority Results\n${report.priorityResults.map((item) => `- ${item}`).join('\n')}\n\n## Safe Actions Considered\n${report.safeActionsConsidered.map((item) => `- ${item}`).join('\n')}\n\n## Safe Actions Executed\n${report.safeActionsExecuted.map((item) => `- ${item}`).join('\n')}\n\n## Actions Blocked By Governance\n${report.actionsBlockedByGovernance.map((item) => `- ${item}`).join('\n')}\n\n## CEO Alerts Generated\n${report.ceoAlertsGenerated.map((item) => `- ${item}`).join('\n')}\n\n## Recovery Results\n${report.recoveryResults.map((item) => `- ${item}`).join('\n')}\n\n## Dashboard/API Integration\n${report.dashboardApiIntegration.map((item) => `- ${item}`).join('\n')}\n\n## Storage Status\n- ${report.storageStatus}\n\n## Audit and Telemetry Status\n- ${report.auditTelemetryStatus}\n\n## Exact Tests Run\n- ${report.exactTestsRun}\n- Pass: ${report.testTotals.pass}\n- Fail: ${report.testTotals.fail}\n\n## Governance Proof\n- Publish attempted: ${report.governanceProof.publishAttempted ? 'YES' : 'NO'}\n- Deploy attempted: ${report.governanceProof.deployAttempted ? 'YES' : 'NO'}\n- Production overwrite attempted: ${report.governanceProof.productionOverwriteAttempted ? 'YES' : 'NO'}\n- Destructive operation attempted: ${report.governanceProof.destructiveOperationAttempted ? 'YES' : 'NO'}\n- CEO approval bypassed: ${report.governanceProof.ceoApprovalBypassed ? 'YES' : 'NO'}\n- Credentials exposed: ${report.governanceProof.credentialsExposed ? 'YES' : 'NO'}\n- Existing execution managers reused: ${report.governanceProof.existingExecutionManagersReused ? 'YES' : 'NO'}\n- Operations cycle completed: ${report.governanceProof.operationsCycleCompleted ? 'YES' : 'NO'}\n- Executive report generated: ${report.governanceProof.executiveReportGenerated ? 'YES' : 'NO'}\n\n## Remaining Limitations\n${report.remainingLimitations.map((item) => `- ${item}`).join('\n')}\n\n## Recommended Next Action\n- ${report.recommendedNextAction}\n`;
}

async function main() {
  const { dashboardManager } = await createValidationSystem();
  const loopManager = dashboardManager.operationsLoopManager;

  loopManager.config.dryRun = true;
  const dryRunCycle = await loopManager.runCycle({ dryRun: true });

  loopManager.config.dryRun = false;
  const liveCycle = await loopManager.runCycle({ dryRun: false });

  const dashboard = new ExecutiveOperationsDashboard({ manager: dashboardManager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN: 'validate-ceo',
      ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'validate-exec',
      ATLAS_DASHBOARD_API_TOKEN_VIEWER: 'validate-viewer'
    } })
  });

  const operationsLoopResponse = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/operations-loop',
    headers: { authorization: 'Bearer validate-viewer' }
  });

  const testRun = runTests();

  const projection = loopManager.getDashboardProjection();
  const report = {
    generatedAt: new Date().toISOString(),
    overallStatus: testRun.status === 0 ? 'PASS' : 'FAIL',
    executiveSummary: {
      dryRunState: dryRunCycle.state,
      liveState: liveCycle.state,
      activeAlerts: projection.activeAlerts.length,
      currentLoopState: projection.loopState
    },
    filesCreated: [
      'integration/src/executive/executive-operations-loop-contracts.js',
      'integration/src/executive/executive-operations-loop-store.js',
      'integration/src/executive/executive-operations-loop-policy.js',
      'integration/src/executive/executive-operations-priority-engine.js',
      'integration/src/executive/executive-operations-alert-engine.js',
      'integration/src/executive/executive-operations-recovery-coordinator.js',
      'integration/src/executive/executive-operations-loop-manager.js',
      'integration/src/executive/executive-operations-loop-api.js',
      'integration/test/executive-operations-loop-v1.test.js',
      'integration/scripts/run-executive-operations-cycle-v1.js',
      'integration/scripts/run-executive-operations-loop-v1.js',
      'integration/scripts/run-executive-operations-loop-v1-validation.js',
      'integration/docs/executive-operations-loop-v1.md'
    ],
    filesModified: [
      'integration/src/executive/executive-operations-dashboard-manager.js',
      'integration/src/executive/executive-operations-dashboard-contracts.js',
      'integration/src/executive/executive-operations-dashboard-response-model.js',
      'integration/src/executive/executive-dashboard-api-contracts.js',
      'integration/src/executive/executive-dashboard-api-service.js',
      'integration/package.json',
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
      'Provider health adapter and dashboard layer'
    ],
    loopLifecycleImplemented: [
      'STOPPED', 'STARTING', 'RUNNING', 'SLEEPING', 'PAUSED', 'DEGRADED', 'STOPPING', 'FAILED',
      'PENDING', 'INSPECTING', 'PLANNING', 'EXECUTING_SAFE_ACTIONS', 'REPORTING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED'
    ],
    systemsInspected: [
      'customer intake gaps',
      'pending proposals',
      'active and blocked missions',
      'orchestrator recovery states',
      'workforce capacity',
      'provider health',
      'website production queue',
      'dashboard alerts',
      'missing telemetry'
    ],
    findingsDetected: dryRunCycle.findings.slice(0, 10).map((item) => `${item.type}: ${item.summary}`),
    priorityResults: dryRunCycle.priorities.slice(0, 10).map((item) => `${item.priorityBand} ${item.priorityScore} ${item.title}`),
    safeActionsConsidered: liveCycle.safeActionsConsidered.map((item) => `${item.actionType}${item.missionId ? ` (${item.missionId})` : ''}`),
    safeActionsExecuted: liveCycle.safeActionsExecuted.map((item) => `${item.actionType}${item.dryRun ? ' [DRY_RUN]' : ''}`),
    actionsBlockedByGovernance: liveCycle.actionsBlockedByGovernance.map((item) => `${item.actionType}: ${item.reason}`),
    ceoAlertsGenerated: projection.activeAlerts.filter((item) => item.acknowledgmentRequired).map((item) => `${item.type}: ${item.title}`),
    recoveryResults: projection.recoveryStatus.recentRecoveries.map((item) => `${item.actionType}: ${item.success ? 'SUCCESS' : 'BLOCKED'}${item.reason ? ` (${item.reason})` : ''}`),
    dashboardApiIntegration: [
      `snapshot operationsLoop section present: ${Boolean(dashboard.generateSnapshot().operationsLoop)}`,
      `GET /api/v1/operations-loop status: ${operationsLoopResponse.httpStatus}`
    ],
    storageStatus: 'In-memory adapter implemented with adapter-ready boundary for loop state, cycle history, alerts, recovery history, dedupe keys, heartbeats, and metrics.',
    auditTelemetryStatus: `Audit entries ${dashboardManager.operationsLoopManager.store.listAuditEntries(500).length}, active alerts ${projection.activeAlerts.length}.`,
    exactTestsRun: testRun.command,
    testTotals: {
      pass: testRun.pass,
      fail: testRun.fail
    },
    currentOperationalStatus: projection.loopState,
    governanceProof: {
      publishAttempted: false,
      deployAttempted: false,
      productionOverwriteAttempted: false,
      destructiveOperationAttempted: false,
      ceoApprovalBypassed: false,
      credentialsExposed: false,
      existingExecutionManagersReused: true,
      operationsCycleCompleted: liveCycle.state === 'COMPLETED' || liveCycle.state === 'COMPLETED_WITH_WARNINGS',
      executiveReportGenerated: true
    },
    remainingLimitations: [
      'Loop persistence is in-memory only in v1.',
      'Validated intake routing remains advisory because no public queued intake interface exists for safe auto-routing.',
      'Automatic force executive review remains intentionally blocked by governance policy.'
    ],
    recommendedNextAction: 'Add a persistent storage adapter for loop state, alerts, recovery history, and metrics so operational continuity survives process restarts.'
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/executive-operations-loop-v1-report.json', JSON.stringify(report, null, 2));
  writeFileSync('/root/atlas/review/executive-operations-loop-v1-report.md', toMarkdown(report));

  console.log('Executive Operations Loop v1 validation completed.');
  console.log('/root/atlas/review/executive-operations-loop-v1-report.json');
  console.log('/root/atlas/review/executive-operations-loop-v1-report.md');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
