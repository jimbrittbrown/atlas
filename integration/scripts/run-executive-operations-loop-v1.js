import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';

async function main() {
  const missionControl = new CustomerIntakeMissionControl();
  const customer = missionControl.customerRegistry.createCustomer({
    companyName: 'Operations Loop Demo',
    contactName: 'Atlas Ops',
    email: 'ops@operations-loop-demo.example',
    phone: '+1-555-0666',
    website: 'https://operations-loop-demo.example',
    industry: 'Media'
  }).customer;

  const planning = new ExecutivePlanningSystem({ missionControl });
  const approved = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'ops-loop-demo',
    customerId: customer.customerId,
    title: 'Operations loop website build',
    description: 'Continuous loop validation proposal.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Continuous operational heartbeat',
    strategicObjective: 'Operations readiness',
    expectedBusinessValue: 86,
    urgency: 79,
    estimatedEffort: 28,
    estimatedCost: 72000,
    estimatedDuration: 40,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.32 }],
    confidence: 0.8,
    metadata: { strategicAlignment: 0.9 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: approved.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for continuous loop validation.',
    conditions: []
  });

  const dashboardManager = new ExecutiveOperationsDashboardManager({ missionControl, executivePlanningSystem: planning });
  await dashboardManager.missionOrchestratorManager.orchestrate({ proposalId: approved.proposal.proposalId });

  const loopManager = dashboardManager.operationsLoopManager;
  process.on('SIGINT', () => loopManager.stop());
  process.on('SIGTERM', () => loopManager.stop());

  const status = await loopManager.startContinuous({ maxCycles: Number(process.env.ATLAS_OPERATIONS_LOOP_DEV_MAX_CYCLES ?? 2) });
  console.log(JSON.stringify({ loopState: status.loopState, metrics: status.metrics }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
