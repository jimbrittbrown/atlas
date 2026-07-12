import { mkdirSync, writeFileSync } from 'node:fs';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';

async function main() {
  const missionControl = new CustomerIntakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });

  const customer = missionControl.customerRegistry.createCustomer({
    companyName: 'Mission Orchestrator Demo',
    contactName: 'Atlas CEO',
    email: 'ceo@mission-orchestrator-demo.example',
    phone: '+1-555-0110',
    website: 'https://mission-orchestrator-demo.example',
    industry: 'Media'
  }).customer;

  const submitted = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'source-orchestrator-report-1',
    customerId: customer.customerId,
    title: 'Executive Mission Orchestrator v1 validation',
    description: 'Validate orchestration flow, recovery controls, and read-only projection.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Sandbox website draft with governance-safe orchestration',
    strategicObjective: 'Operational readiness',
    expectedBusinessValue: 88,
    urgency: 82,
    estimatedEffort: 28,
    estimatedCost: 110000,
    estimatedDuration: 40,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH', 'WEBSITE_GENERATION'],
    risks: [{ id: 'risk-1', severity: 0.3 }],
    confidence: 0.81,
    metadata: { strategicAlignment: 0.91 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for orchestrator validation run.',
    conditions: []
  });

  const dashboardManager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning
  });

  const orchestrator = dashboardManager.missionOrchestratorManager;

  const runResult = await orchestrator.orchestrate({ proposalId: submitted.proposal.proposalId });

  const checks = [
    { name: 'orchestrate succeeded', passed: runResult.orchestrated === true },
    { name: 'session created', passed: Boolean(runResult.session?.orchestrationId) },
    { name: 'pipeline key assigned', passed: runResult.session?.pipelineKey === 'WEBSITE_BUILDER' },
    { name: 'read-only governance enforced', passed: runResult.session?.governance?.readOnlyControlSurface === true },
    { name: 'publish bypass prevented', passed: runResult.session?.governance?.publishBypass === false },
    { name: 'projection available', passed: Array.isArray(orchestrator.buildDashboardProjection().records) }
  ];

  const projection = orchestrator.buildDashboardProjection();

  const report = {
    generatedAt: new Date().toISOString(),
    mission: 'executive-mission-orchestrator-v1',
    overallStatus: checks.every((check) => check.passed) ? 'PASS' : 'PARTIAL',
    checks,
    summary: {
      orchestrationState: runResult.session?.state ?? null,
      completionPercentage: runResult.session?.completionPercentage ?? 0,
      blockers: runResult.session?.blockers ?? [],
      activeSessions: projection.runningSessions,
      totalSessions: projection.totalSessions
    },
    filesCreated: [
      'integration/src/executive/executive-mission-orchestrator-contracts.js',
      'integration/src/executive/executive-mission-orchestrator-pipeline-registry.js',
      'integration/src/executive/executive-mission-orchestrator-manager.js',
      'integration/src/executive/executive-mission-orchestrator-dashboard-model.js',
      'integration/src/executive/executive-mission-orchestrator-api.js',
      'integration/test/executive-mission-orchestrator-v1.test.js',
      'integration/scripts/run-executive-mission-orchestrator-v1.js',
      'integration/docs/executive-mission-orchestrator-v1.md'
    ]
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/executive-mission-orchestrator-v1-report.json', JSON.stringify(report, null, 2));

  const markdown = `# Executive Mission Orchestrator v1 Report\n\n- Status: ${report.overallStatus}\n- Generated: ${report.generatedAt}\n\n## Checks\n${checks.map((check) => `- ${check.name}: ${check.passed ? 'PASS' : 'FAIL'}`).join('\n')}\n\n## Summary\n- orchestrationState: ${report.summary.orchestrationState}\n- completionPercentage: ${report.summary.completionPercentage}\n- blockers: ${report.summary.blockers.join(', ') || 'none'}\n- activeSessions: ${report.summary.activeSessions}\n- totalSessions: ${report.summary.totalSessions}\n`;

  writeFileSync('/root/atlas/review/executive-mission-orchestrator-v1-report.md', markdown);

  console.log('Executive Mission Orchestrator v1 validation completed.');
  console.log('/root/atlas/review/executive-mission-orchestrator-v1-report.json');
  console.log('/root/atlas/review/executive-mission-orchestrator-v1-report.md');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
