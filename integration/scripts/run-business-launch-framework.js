import { mkdirSync, writeFileSync } from 'node:fs';
import { BusinessLaunchFramework } from '../src/executive/business-launch-framework.js';
import { BusinessLaunchFrameworkDashboard } from '../src/executive/business-launch-framework-dashboard.js';

function sampleInput() {
  return {
    approvedBusinessRecommendation: {
      businessName: 'Approved Business Placeholder',
      businessDescription: 'Approved opportunity to be converted into a governed launch plan.',
      businessMission: 'Execute a disciplined launch that creates reliable cash flow and reusable strategic assets.',
      targetCustomer: 'Primary customer profile determined by approved recommendation.',
      valueProposition: 'Deliver measurable outcome with lower friction and higher reliability.',
      revenueModel: 'Hybrid recurring + implementation model',
      pricingStrategy: 'Tiered value pricing with guarded discount authority'
    },
    ceoObjectives: [
      'Generate reliable cash flow quickly.',
      'Strengthen reusable Atlas capabilities.',
      'Maintain executive governance discipline during launch.'
    ],
    availableWorkforce: [
      { workerId: 'WF-001', name: 'Research Lead', role: 'Market Research Specialist', standingScore: 9.2 },
      { workerId: 'WF-002', name: 'Offer Lead', role: 'Offer Strategy Specialist', standingScore: 8.9 },
      { workerId: 'WF-003', name: 'Automation Lead', role: 'Automation Architect', standingScore: 9.4 },
      { workerId: 'WF-004', name: 'Growth Lead', role: 'Growth Marketing Specialist', standingScore: 8.6 },
      { workerId: 'WF-005', name: 'Sales Lead', role: 'Sales Systems Specialist', standingScore: 8.7 },
      { workerId: 'WF-006', name: 'Analytics Lead', role: 'Analytics Specialist', standingScore: 9.1 }
    ],
    availableBudget: {
      allocatedBudget: 25000,
      maxBudget: 40000,
      budgetStatus: 'APPROVED'
    },
    currentAtlasAssets: [
      'Workforce Registry',
      'Opportunity Engine',
      'Executive Review System',
      'Performance Intelligence'
    ]
  };
}

function toMarkdown(result, dashboard) {
  const architecture = result.frameworkArchitecture;

  const pipelineRows = (result.pipeline ?? [])
    .map(item => `| ${item.order} | ${item.stage} | ${item.primaryDecisionOwner} | ${item.gate} |`)
    .join('\n');

  const sections = (result.launchPackageSchema?.requiredSections ?? [])
    .map((name, index) => `${index + 1}. ${name}`)
    .join('\n');

  const artifacts = (result.requiredArtifacts ?? [])
    .map(item => `- ${item.artifactId}: ${item.name} (${item.stage})`)
    .join('\n');

  const workflow = (result.executiveWorkflow ?? [])
    .map(item => `${item.step}. ${item.action} | Owner: ${item.decisionOwner} | Output: ${item.output}`)
    .join('\n');

  return [
    '# Atlas Business Launch Framework (Permanent Blueprint)',
    '',
    `Generated At: ${result.generatedAt}`,
    '',
    '## Architecture',
    '',
    `- Name: ${architecture.name}`,
    `- Classification: ${architecture.classification}`,
    `- Purpose: ${architecture.purpose}`,
    '',
    '## Launch Package Schema',
    '',
    `Version: ${result.launchPackageSchema.version}`,
    `Section Count: ${result.launchPackageSchema.sectionCount}`,
    '',
    sections,
    '',
    '## Pipeline',
    '',
    '| Order | Stage | Owner | Gate |',
    '|---:|---|---|---|',
    pipelineRows,
    '',
    '## Required Artifacts',
    '',
    artifacts,
    '',
    '## Executive Workflow',
    '',
    workflow,
    '',
    '## Dashboard Projection',
    '',
    `- Executive Health: ${dashboard.executiveHealth}`,
    `- Launch Status: ${dashboard.launchStatus}`,
    `- Objective Count: ${dashboard.objectiveCount}`,
    `- Workforce Assigned: ${dashboard.workforceReadiness.assignedRoles}/${dashboard.workforceReadiness.requiredRoles}`,
    `- Budget Status: ${dashboard.budgetSnapshot.budgetStatus}`,
    `- Next Executive Action: ${dashboard.nextExecutiveAction}`,
    `- Decision Signal: ${dashboard.executiveDecisionSignal}`,
    ''
  ].join('\n');
}

function run() {
  const framework = new BusinessLaunchFramework();
  const result = framework.generate(sampleInput());

  const dashboardModel = new BusinessLaunchFrameworkDashboard();
  const dashboard = dashboardModel.project({ frameworkResult: result });

  mkdirSync('/root/atlas/review', { recursive: true });

  writeFileSync('/root/atlas/review/business-launch-framework-result.json', `${JSON.stringify({ result, dashboard }, null, 2)}\n`);
  writeFileSync('/root/atlas/review/business-launch-framework.md', `${toMarkdown(result, dashboard)}\n`);

  console.log('WROTE=/root/atlas/review/business-launch-framework-result.json');
  console.log('WROTE=/root/atlas/review/business-launch-framework.md');
  console.log(`PIPELINE_STAGES=${result.pipeline.length}`);
  console.log(`LAUNCH_PACKAGE_SECTIONS=${result.launchPackageSchema.sectionCount}`);
}

run();
