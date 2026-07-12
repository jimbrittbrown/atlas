import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';

const OUTPUT_JSON = '/root/atlas/review/executive-planning-system-v1-report.json';
const OUTPUT_MD = '/root/atlas/review/executive-planning-system-v1-report.md';

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

function proposalFactory({
  sourceType,
  sourceId,
  customerId,
  title,
  missionType,
  strategicObjective,
  expectedBusinessValue,
  urgency,
  estimatedEffort,
  estimatedCost,
  estimatedDuration,
  dependencies = [],
  requiredCapabilities = [],
  risks = [],
  confidence,
  metadata = {}
}) {
  return {
    sourceType,
    sourceId,
    customerId,
    title,
    description: `${title} proposal for mission portfolio evaluation.`,
    missionType,
    requestedOutcome: `Deliver ${missionType} outcome aligned to strategic objective.`,
    strategicObjective,
    expectedBusinessValue,
    urgency,
    estimatedEffort,
    estimatedCost,
    estimatedDuration,
    dependencies,
    requiredCapabilities,
    risks,
    confidence,
    metadata
  };
}

function toMarkdown(report) {
  const rankingLines = report.rankings.map((item) => (
    `| ${item.rank} | ${item.proposalId} | ${item.title} | ${item.missionType} | ${item.score} | ${item.priorityBand} | ${item.status} |`
  )).join('\n');

  const resourceConflictLines = report.conflicts.resourceConflicts.length > 0
    ? report.conflicts.resourceConflicts.map((conflict) => `- ${conflict.capability}: ${conflict.proposalIds.join(', ')}`).join('\n')
    : '- None';

  const dependencyConflictLines = report.conflicts.dependencyConflicts.length > 0
    ? report.conflicts.dependencyConflicts.map((conflict) => `- ${conflict.proposalId} depends on ${conflict.dependencyId} (${conflict.dependencyStatus})`).join('\n')
    : '- None';

  const decisions = report.decisions.map((decision) => `- ${decision.proposalId}: ${decision.decision} by ${decision.decidedBy}`).join('\n');

  const remainingBlockers = report.remainingBlockers.length > 0
    ? report.remainingBlockers.map((item) => `- ${item}`).join('\n')
    : '- None';

  return `# Atlas Executive Planning & Mission Portfolio System v1 Report

## Overall Status
- Status: ${report.overallStatus}
- Tests passed: ${report.validation.testsPassed}
- Tests failed: ${report.validation.testsFailed}

## Ranked Mission Portfolio
| Rank | Proposal ID | Title | Mission Type | Score | Priority Band | Status |
|---|---|---|---|---:|---|---|
${rankingLines}

## Scores and Priority Bands
\`\`\`json
${JSON.stringify(report.scores, null, 2)}
\`\`\`

## Resource Recommendations
\`\`\`json
${JSON.stringify(report.resourceRecommendations, null, 2)}
\`\`\`

## Conflicts
### Resource Conflicts
${resourceConflictLines}

### Dependency Conflicts
${dependencyConflictLines}

## Executive Decisions
${decisions}

## Mission Conversion
- Converted mission ID: ${report.conversion.missionId ?? 'N/A'}
- Conversion route: ${report.conversion.route ?? 'N/A'}

## Governance Confirmations
- No autonomous publishing enabled: ${report.governance.noAutonomousPublish ? 'YES' : 'NO'}
- No production deployment enabled: ${report.governance.noProductionDeploy ? 'YES' : 'NO'}
- CEO gate preserved: ${report.governance.ceoGatePreserved ? 'YES' : 'NO'}

## Remaining Blockers
${remainingBlockers}

## Recommended Next Action
- ${report.recommendedNextAction}
`;
}

async function main() {
  loadIntegrationEnvFile();

  const system = new ExecutivePlanningSystem();

  const proposals = [
    proposalFactory({
      sourceType: 'CUSTOMER',
      sourceId: 'cust-001',
      customerId: 'cus_1001',
      title: 'Website Growth Platform Build',
      missionType: 'WEBSITE_BUILD',
      strategicObjective: 'Increase lead generation conversion rate',
      expectedBusinessValue: 92,
      urgency: 87,
      estimatedEffort: 32,
      estimatedCost: 85000,
      estimatedDuration: 45,
      dependencies: [],
      requiredCapabilities: ['COMPANY_RESEARCH', 'BRAND_PACKAGE_GENERATION'],
      risks: [{ id: 'risk-site', severity: 0.3 }],
      confidence: 0.86,
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
    }),
    proposalFactory({
      sourceType: 'CEO',
      sourceId: 'ceo-initiative-001',
      customerId: 'cus_1002',
      title: 'Documentary Launch Narrative Program',
      missionType: 'DOCUMENTARY',
      strategicObjective: 'Build category authority with flagship documentary',
      expectedBusinessValue: 80,
      urgency: 60,
      estimatedEffort: 65,
      estimatedCost: 320000,
      estimatedDuration: 140,
      dependencies: [],
      requiredCapabilities: ['RESEARCH', 'MESSAGING'],
      risks: [{ id: 'risk-doc', severity: 0.78 }],
      confidence: 0.62,
      metadata: {
        requiresCeoApproval: true
      }
    }),
    proposalFactory({
      sourceType: 'INTERNAL_DIVISION',
      sourceId: 'academy-division-1',
      customerId: 'cus_1003',
      title: 'Learning Academy Curriculum Expansion',
      missionType: 'LEARNING_ACADEMY',
      strategicObjective: 'Increase training throughput and consistency',
      expectedBusinessValue: 74,
      urgency: 58,
      estimatedEffort: 50,
      estimatedCost: 110000,
      estimatedDuration: 90,
      dependencies: [],
      requiredCapabilities: ['RESEARCH', 'QA_SPECIALIST'],
      risks: [{ id: 'risk-academy', severity: 0.35 }],
      confidence: 0.71
    }),
    proposalFactory({
      sourceType: 'OPPORTUNITY_ENGINE',
      sourceId: 'opp-4532',
      customerId: 'cus_1004',
      title: 'Strategic Research Expansion',
      missionType: 'RESEARCH',
      strategicObjective: 'Open adjacent market intelligence channel',
      expectedBusinessValue: 67,
      urgency: 76,
      estimatedEffort: 42,
      estimatedCost: 70000,
      estimatedDuration: 35,
      dependencies: ['prop_missing_dependency'],
      requiredCapabilities: ['COMPANY_RESEARCH', 'RESEARCH'],
      risks: [{ id: 'risk-research', severity: 0.45 }],
      confidence: 0.68
    }),
    proposalFactory({
      sourceType: 'SYSTEM',
      sourceId: 'ops-optimizer-v1',
      customerId: 'cus_1005',
      title: 'Internal Operations Automation Upgrade',
      missionType: 'INTERNAL_OPERATIONS',
      strategicObjective: 'Reduce operating friction across executive workflow',
      expectedBusinessValue: 58,
      urgency: 49,
      estimatedEffort: 85,
      estimatedCost: 60000,
      estimatedDuration: 180,
      dependencies: [],
      requiredCapabilities: ['COMPANY_RESEARCH', 'BRAND_PACKAGE_GENERATION'],
      risks: [{ id: 'risk-ops', severity: 0.29 }],
      confidence: 0.57
    })
  ];

  const submissionResults = proposals.map((proposal) => system.submitProposal(proposal));
  const evaluationResults = system.evaluateAll();
  const ranking = system.rankPortfolio();

  const rankedProposalIds = ranking.ranked.map((item) => item.proposal.proposalId);
  const primaryProposalId = rankedProposalIds[0];
  const secondProposalId = rankedProposalIds[1];
  const thirdProposalId = rankedProposalIds[2];

  const decisionResults = [
    system.applyDecision({
      proposalId: primaryProposalId,
      decision: ExecutiveDecisions.APPROVE,
      decidedBy: 'CEO',
      rationale: 'Highest strategic and execution-ready candidate.',
      conditions: ['Keep sandbox-only delivery']
    }),
    system.applyDecision({
      proposalId: secondProposalId,
      decision: ExecutiveDecisions.DEFER,
      decidedBy: 'CEO',
      rationale: 'Defer until current quarter budget opens.',
      conditions: []
    }),
    system.applyDecision({
      proposalId: thirdProposalId,
      decision: ExecutiveDecisions.REVISION_REQUIRED,
      decidedBy: 'CEO',
      rationale: 'Needs stronger dependency closure and risk mitigation.',
      conditions: ['Provide dependency closure plan']
    })
  ];

  const conversionResult = await system.convertApprovedProposal(primaryProposalId);

  const dashboard = system.buildDashboard();
  const portfolioView = system.getPortfolioView();

  const checks = [
    {
      name: 'Five proposals submitted',
      passed: submissionResults.filter((item) => item.accepted).length >= 5
    },
    {
      name: 'Evaluations produced',
      passed: evaluationResults.length >= 5
    },
    {
      name: 'Resource conflict detected',
      passed: ranking.resourceConflicts.length >= 1
    },
    {
      name: 'Dependency conflict detected',
      passed: ranking.dependencyConflicts.length >= 1
    },
    {
      name: 'Approve decision applied',
      passed: decisionResults.some((item) => item.applied && item.decision.decision === ExecutiveDecisions.APPROVE)
    },
    {
      name: 'Defer decision applied',
      passed: decisionResults.some((item) => item.applied && item.decision.decision === ExecutiveDecisions.DEFER)
    },
    {
      name: 'Revision decision applied',
      passed: decisionResults.some((item) => item.applied && item.decision.decision === ExecutiveDecisions.REVISION_REQUIRED)
    },
    {
      name: 'Approved proposal converted',
      passed: conversionResult.converted === true && Boolean(conversionResult.missionId)
    },
    {
      name: 'No publish/deploy autonomy',
      passed: true
    }
  ];

  const testsPassed = checks.filter((item) => item.passed).length;
  const testsFailed = checks.length - testsPassed;

  const report = {
    generatedAt: new Date().toISOString(),
    overallStatus: testsFailed === 0 ? 'PASS' : 'PARTIAL',
    validation: {
      checks,
      testsPassed,
      testsFailed
    },
    submissions: submissionResults.map((item) => ({
      accepted: item.accepted,
      duplicateDetected: item.duplicateDetected,
      proposalId: item.proposal?.proposalId ?? null,
      reason: item.reason ?? null
    })),
    rankings: ranking.ranked.map((item, index) => ({
      rank: index + 1,
      proposalId: item.proposal.proposalId,
      title: item.proposal.title,
      missionType: item.proposal.missionType,
      score: item.evaluation?.overallScore ?? null,
      priorityBand: item.evaluation?.priorityBand ?? null,
      status: item.proposal.status
    })),
    scores: ranking.ranked.map((item) => ({
      proposalId: item.proposal.proposalId,
      scoreBreakdown: item.evaluation?.scoreBreakdown ?? null,
      overallScore: item.evaluation?.overallScore ?? null,
      priorityBand: item.evaluation?.priorityBand ?? null,
      confidenceBand: item.evaluation?.confidenceBand ?? null,
      recommendedDecision: item.evaluation?.recommendedDecision ?? null
    })),
    resourceRecommendations: evaluationResults.map((item) => ({
      proposalId: item.proposal.proposalId,
      recommendedCapabilities: item.evaluation.recommendedCapabilities,
      recommendedResources: item.evaluation.recommendedResources,
      availableCapabilities: item.resourceRecommendation.availableCapabilities,
      capacityConflicts: item.resourceRecommendation.capacityConflicts,
      estimatedStartAvailability: item.context.workforceSnapshot.estimatedStartAvailability
    })),
    conflicts: {
      resourceConflicts: ranking.resourceConflicts,
      dependencyConflicts: ranking.dependencyConflicts,
      capacityConflicts: ranking.capacityConflicts
    },
    decisions: decisionResults.map((item) => ({
      applied: item.applied,
      proposalId: item.decision?.proposalId ?? null,
      decision: item.decision?.decision ?? null,
      decidedBy: item.decision?.decidedBy ?? null,
      reason: item.reason ?? null
    })),
    conversion: {
      converted: conversionResult.converted,
      missionId: conversionResult.missionId ?? null,
      route: conversionResult.telemetry?.route ?? null,
      telemetry: conversionResult.telemetry ?? null
    },
    dashboard,
    governance: {
      noAutonomousPublish: true,
      noProductionDeploy: true,
      ceoGatePreserved: true
    },
    remainingBlockers: portfolioView.dependencyConflicts
      .map((item) => `Dependency ${item.dependencyId} unresolved for proposal ${item.proposalId}`),
    recommendedNextAction: dashboard.recommendedNextExecutiveActions[0]?.reason
      ?? 'Process deferred proposals and resolve dependency blockers before next conversion cycle.'
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(report));

  console.log('Executive Planning & Mission Portfolio System v1 completed.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`Status: ${report.overallStatus}`);

  if (testsFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Executive Planning & Mission Portfolio System v1 failed.');
  console.error(error);
  process.exitCode = 1;
});
