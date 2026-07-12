import { mkdirSync, writeFileSync } from 'node:fs';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';

async function createManager({ dryRun = true } = {}) {
  const missionControl = new CustomerIntakeMissionControl();
  const customer = missionControl.customerRegistry.createCustomer({
    companyName: 'Operations Cycle Demo',
    contactName: 'Atlas Ops',
    email: 'ops@operations-cycle-demo.example',
    phone: '+1-555-0555',
    website: 'https://operations-cycle-demo.example',
    industry: 'Media'
  }).customer;

  const planning = new ExecutivePlanningSystem({ missionControl });
  const approved = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'ops-cycle-demo',
    customerId: customer.customerId,
    title: 'Operations cycle website build',
    description: 'Validation proposal for operations cycle runner.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Operational visibility',
    strategicObjective: 'Operations readiness',
    expectedBusinessValue: 85,
    urgency: 78,
    estimatedEffort: 28,
    estimatedCost: 70000,
    estimatedDuration: 40,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.3 }],
    confidence: 0.81,
    metadata: { strategicAlignment: 0.9 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: approved.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for operations cycle validation.',
    conditions: []
  });

  const dashboardManager = new ExecutiveOperationsDashboardManager({ missionControl, executivePlanningSystem: planning });
  await dashboardManager.missionOrchestratorManager.orchestrate({ proposalId: approved.proposal.proposalId });
  dashboardManager.operationsLoopManager.config.dryRun = dryRun;
  return dashboardManager.operationsLoopManager;
}

async function main() {
  const dryRun = String(process.env.ATLAS_OPERATIONS_LOOP_DRY_RUN ?? 'true') !== 'false';
  const manager = await createManager({ dryRun });
  const result = await manager.runCycle({ dryRun });

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/executive-operations-cycle-v1-last.json', JSON.stringify(result, null, 2));

  console.log(`Executive operations cycle completed: ${result.state}`);
  console.log('/root/atlas/review/executive-operations-cycle-v1-last.json');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
