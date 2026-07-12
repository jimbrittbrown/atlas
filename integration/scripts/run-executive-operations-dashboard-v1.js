import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { CustomerRegistry } from '../src/executive/customer-registry.js';
import { MissionRegistry } from '../src/executive/mission-registry.js';
import { WorkforceDirector } from '../src/executive/workforce-director.js';

const OUTPUT_JSON = '/root/atlas/review/executive-operations-dashboard-v1-report.json';
const OUTPUT_MD = '/root/atlas/review/executive-operations-dashboard-v1-report.md';

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

    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (key.length === 0 || typeof process.env[key] === 'string') {
      continue;
    }

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
  const topMissions = report.snapshot.missionControl.filteredRecords
    .slice(0, 10)
    .map((mission) => `| ${mission.missionId} | ${mission.missionType} | ${mission.currentState} | ${mission.completionPercentage}% | ${mission.priority} |`)
    .join('\n');

  const topProposals = report.snapshot.opportunityPortfolio.rows
    .slice(0, 10)
    .map((proposal, index) => `| ${index + 1} | ${proposal.proposalId} | ${proposal.title} | ${proposal.priorityBand ?? 'N/A'} | ${proposal.overallScore ?? 'N/A'} | ${proposal.executiveDecisionStatus} |`)
    .join('\n');

  const missingData = report.snapshot.missingData.length > 0
    ? report.snapshot.missingData.map((item) => `- ${item}`).join('\n')
    : '- None';

  const limitations = report.snapshot.limitations.map((item) => `- ${item}`).join('\n');

  const actions = report.snapshot.recommendedExecutiveActions
    .slice(0, 10)
    .map((item) => `- ${item.action}: ${item.reason}`)
    .join('\n');

  return `# Atlas Executive Operations Dashboard v1 Report

## Overall Status
- Status: ${report.overallStatus}
- Validation checks passed: ${report.validation.testsPassed}
- Validation checks failed: ${report.validation.testsFailed}

## Executive Overview
\`\`\`json
${JSON.stringify(report.snapshot.executiveOverview, null, 2)}
\`\`\`

## CEO Decision Center
- Total items: ${report.snapshot.ceoDecisionCenter.totalItems}

## Mission Control View
| Mission ID | Type | State | Completion | Priority |
|---|---|---|---:|---|
${topMissions}

## Opportunity Portfolio
| Rank | Proposal ID | Title | Priority | Score | Decision |
|---|---|---|---|---:|---|
${topProposals}

## Provider Health
\`\`\`json
${JSON.stringify(report.snapshot.providerHealth.providers, null, 2)}
\`\`\`

## Alerts Summary
\`\`\`json
${JSON.stringify(report.snapshot.alerts.bySeverity, null, 2)}
\`\`\`

## Governance Confirmations
- Read-only mode: ${report.governance.readOnly ? 'YES' : 'NO'}
- Publish operations executed: ${report.governance.publishOperationsExecuted ? 'YES' : 'NO'}
- Deploy operations executed: ${report.governance.deploymentOperationsExecuted ? 'YES' : 'NO'}
- Approval commands executed by dashboard: ${report.governance.approvalCommandsExecuted ? 'YES' : 'NO'}
- Destructive operations executed: ${report.governance.destructiveOperationsExecuted ? 'YES' : 'NO'}

## Missing Data
${missingData}

## Limitations
${limitations}

## Files Created (Mission)
${report.filesCreated.map((item) => `- ${item}`).join('\n')}

## Files Modified (Mission)
${report.filesModified.map((item) => `- ${item}`).join('\n')}

## Remaining Limitations
${report.remainingLimitations.map((item) => `- ${item}`).join('\n')}

## Recommended Next Stage
- ${report.recommendedNextAction}

## Recommended Executive Actions
${actions}
`;
}

function seedMissionControl() {
  const customerRegistry = new CustomerRegistry();
  const missionRegistry = new MissionRegistry();
  const workforceDirector = new WorkforceDirector();

  const c1 = customerRegistry.createCustomer({
    companyName: 'North Ridge HVAC',
    contactName: 'Morgan Lee',
    email: 'morgan@northridge.example',
    phone: '+1-303-555-0199',
    website: 'https://northridge.example',
    industry: 'Home Services'
  }).customer;

  const c2 = customerRegistry.createCustomer({
    companyName: 'Atlas Academy',
    contactName: 'Jamie Parker',
    email: 'jamie@atlasacademy.example',
    phone: '+1-303-555-0200',
    website: 'https://atlasacademy.example',
    industry: 'Education'
  }).customer;

  const m1 = missionRegistry.createMission({
    customerId: c1.customerId,
    missionType: 'WEBSITE_BUILD',
    currentStage: 'SANDBOX_PROJECT_UPSERT',
    progress: 100,
    executiveStatus: 'AWAITING_EXECUTIVE_REVIEW'
  });

  const m2 = missionRegistry.createMission({
    customerId: c2.customerId,
    missionType: 'LEARNING_ACADEMY',
    currentStage: 'COMPANY_RESEARCH',
    progress: 20,
    executiveStatus: 'ACTIVE'
  });

  missionRegistry.updateMission(m2.missionId, {
    startedDate: new Date(Date.now() - (36 * 24 * 60 * 60 * 1000)).toISOString(),
    executiveStatus: 'BLOCKED',
    blockingIssues: ['Missing research capability specialist.']
  });

  workforceDirector.planMissionAssignments({ missionId: m2.missionId, missionType: 'WEBSITE_BUILD' });
  workforceDirector.markStageStarted({ missionId: m2.missionId, stageId: 'COMPANY_RESEARCH' });

  const activityFeed = [
    {
      timestamp: new Date().toISOString(),
      type: 'CUSTOMER_CREATED',
      details: { customerId: c1.customerId, companyName: c1.companyName }
    },
    {
      timestamp: new Date().toISOString(),
      type: 'MISSION_CREATED',
      details: { missionId: m1.missionId, customerId: c1.customerId }
    },
    {
      timestamp: new Date().toISOString(),
      type: 'MISSION_BLOCKED',
      details: { missionId: m2.missionId, customerId: c2.customerId }
    }
  ];

  return {
    customerRegistry,
    missionRegistry,
    workforceDirector,
    activityFeed
  };
}

function createExecutivePlanning(missionControl) {
  const planning = new ExecutivePlanningSystem({ missionControl });

  const p1 = planning.submitProposal({
    sourceType: 'CUSTOMER',
    sourceId: 'cust-001',
    customerId: missionControl.customerRegistry.listCustomers()[0].customerId,
    title: 'Website Build Q3',
    description: 'Full website build for conversion growth.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Increase lead conversion.',
    strategicObjective: 'Pipeline growth',
    expectedBusinessValue: 90,
    urgency: 85,
    estimatedEffort: 30,
    estimatedCost: 80000,
    estimatedDuration: 45,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH', 'BRAND_PACKAGE_GENERATION'],
    risks: [{ id: 'r1', severity: 0.3 }],
    confidence: 0.85,
    metadata: {
      companyName: 'North Ridge HVAC',
      contactName: 'Morgan Lee',
      contactEmail: 'morgan@northridge.example',
      contactPhone: '+1-303-555-0199',
      website: 'https://northridge.example',
      industry: 'Home Services',
      adapterType: 'FRAMER',
      providerHint: 'FRAMER_SANDBOX'
    }
  });

  const p2 = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'ceo-001',
    customerId: missionControl.customerRegistry.listCustomers()[1].customerId,
    title: 'Atlas Documentary Launch',
    description: 'Narrative flagship documentary mission.',
    missionType: 'DOCUMENTARY',
    requestedOutcome: 'Authority building',
    strategicObjective: 'Brand leadership',
    expectedBusinessValue: 70,
    urgency: 60,
    estimatedEffort: 65,
    estimatedCost: 350000,
    estimatedDuration: 120,
    dependencies: [],
    requiredCapabilities: ['RESEARCH', 'MESSAGING'],
    risks: [{ id: 'r2', severity: 0.82 }],
    confidence: 0.58
  });

  planning.evaluateAll();
  planning.rankPortfolio();

  planning.applyDecision({
    proposalId: p1.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Strategic priority and execution readiness.',
    conditions: ['Sandbox-only execution']
  });

  planning.applyDecision({
    proposalId: p2.proposal.proposalId,
    decision: ExecutiveDecisions.REVISION_REQUIRED,
    decidedBy: 'CEO',
    rationale: 'High cost and risk requires mitigation.',
    conditions: ['Add risk mitigation and budget controls']
  });

  return planning;
}

async function main() {
  loadIntegrationEnvFile();

  const commandCounters = {
    publish: 0,
    deploy: 0,
    approve: 0,
    reject: 0,
    delete: 0
  };

  const missionControl = seedMissionControl();
  missionControl.publish = () => { commandCounters.publish += 1; };
  missionControl.deploy = () => { commandCounters.deploy += 1; };
  missionControl.approve = () => { commandCounters.approve += 1; };
  missionControl.reject = () => { commandCounters.reject += 1; };
  missionControl.delete = () => { commandCounters.delete += 1; };

  const executivePlanningSystem = createExecutivePlanning(missionControl);

  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem,
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
            lastSuccessfulCheck: new Date().toISOString(),
            lastFailure: null,
            warnings: ['Write operations remain governance-gated and disabled from dashboard.'],
            blockingIssues: [],
            capabilityLimitations: ['No publish/deploy from dashboard read model.']
          },
          {
            providerName: 'YouTube',
            configuredStatus: 'NOT_CONFIGURED',
            authenticationStatus: 'NOT_CONFIGURED',
            connectionStatus: 'NOT_CONFIGURED',
            readCapabilityStatus: 'NOT_CONFIGURED',
            writeCapabilityStatus: 'NOT_CONFIGURED',
            lastSuccessfulCheck: null,
            lastFailure: null,
            warnings: ['Provider not configured in this environment.'],
            blockingIssues: [],
            capabilityLimitations: []
          }
        ];
      }
    },
    reportPaths: [
      'review/customer-intake-mission-control-v1-report.json',
      'review/executive-planning-system-v1-report.json',
      'review/workforce-director-v1-report.json'
    ]
  });

  const dashboard = new ExecutiveOperationsDashboard({ manager });
  const snapshot = dashboard.generateSnapshot({
    filters: {
      missionControl: {
        ceoReviewStatus: 'REQUIRES_CEO_REVIEW'
      }
    }
  });

  const checks = [
    { name: 'snapshot generated', passed: Boolean(snapshot.generatedAt) },
    { name: 'all sections present', passed: Boolean(snapshot.executiveOverview && snapshot.ceoDecisionCenter && snapshot.missionControl) },
    { name: 'decision center populated', passed: snapshot.ceoDecisionCenter.totalItems >= 1 },
    { name: 'provider health populated', passed: snapshot.providerHealth.providers.length >= 5 },
    { name: 'alerts generated', passed: snapshot.alerts.totalAlerts >= 1 },
    { name: 'read-only governance flag', passed: snapshot.governance.readOnly === true },
    { name: 'no publish executed', passed: commandCounters.publish === 0 },
    { name: 'no deploy executed', passed: commandCounters.deploy === 0 },
    { name: 'no approve/reject executed', passed: commandCounters.approve === 0 && commandCounters.reject === 0 },
    { name: 'no destructive delete executed', passed: commandCounters.delete === 0 }
  ];

  const testsPassed = checks.filter((check) => check.passed).length;
  const testsFailed = checks.length - testsPassed;

  const filesCreated = [
    'integration/src/executive/executive-operations-dashboard-contracts.js',
    'integration/src/executive/executive-overview-model.js',
    'integration/src/executive/ceo-decision-center-model.js',
    'integration/src/executive/mission-control-dashboard-view-model.js',
    'integration/src/executive/executive-workforce-view-model.js',
    'integration/src/executive/customer-pipeline-dashboard-model.js',
    'integration/src/executive/opportunity-portfolio-dashboard-model.js',
    'integration/src/executive/provider-health-dashboard-model.js',
    'integration/src/executive/atlas-system-health-model.js',
    'integration/src/executive/executive-activity-feed-model.js',
    'integration/src/executive/executive-alerts-model.js',
    'integration/src/executive/dashboard-snapshot-registry.js',
    'integration/src/executive/executive-operations-dashboard-response-model.js',
    'integration/src/executive/executive-operations-dashboard-manager.js',
    'integration/src/executive/executive-operations-dashboard.js',
    'integration/test/executive-operations-dashboard-v1.test.js',
    'integration/scripts/run-executive-operations-dashboard-v1.js',
    'integration/docs/executive-operations-dashboard-v1.md'
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
    snapshot,
    governance: {
      readOnly: snapshot.governance.readOnly,
      publishOperationsExecuted: commandCounters.publish > 0,
      deploymentOperationsExecuted: commandCounters.deploy > 0,
      approvalCommandsExecuted: commandCounters.approve > 0 || commandCounters.reject > 0,
      destructiveOperationsExecuted: commandCounters.delete > 0
    },
    filesCreated,
    filesModified,
    remainingLimitations: [
      'Provider health for non-Framer providers remains adapter-driven and may be NOT_CONFIGURED in environments without credentials.',
      'Revenue values are proposal-value estimates and are not accounting-ledger integrated.',
      'Some mission-level risk/confidence fields are inferred from linked proposal evaluations where direct mission telemetry is unavailable.'
    ],
    recommendedNextAction: 'Implement authenticated read-only API endpoints and role-scoped access controls for dashboard snapshot retrieval.'
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(report));

  console.log('Atlas Executive Operations Dashboard v1 validation completed.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`Status: ${report.overallStatus}`);
  console.log(`Checks Passed: ${testsPassed}`);
  console.log(`Checks Failed: ${testsFailed}`);

  if (testsFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Atlas Executive Operations Dashboard v1 validation failed.');
  console.error(error);
  process.exitCode = 1;
});
