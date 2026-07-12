import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { AtlasWebsiteOrchestrator } from '../src/executive/website-orchestrator.js';
import { WebsiteProviderAdapterRegistry, SpecialistWebsiteProviderAdapter } from '../src/executive/website-provider-adapters.js';
import { WebsiteBuilderMissionManager } from '../src/executive/website-builder-mission-manager.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';

class ValidationFramerAdapter extends SpecialistWebsiteProviderAdapter {
  constructor() {
    super({ name: 'Validation Framer Adapter', type: 'FRAMER' });
  }

  async researchCompany({ prospect }) {
    return {
      summary: `Validation research for ${prospect?.companyName ?? 'unknown company'}.`,
      confidence: 0.83,
      projectDetails: {
        details: {
          pageMetadata: {
            pages: [
              { name: 'Home', slug: 'home' },
              { name: 'Services', slug: 'services' },
              { name: 'Contact', slug: 'contact' }
            ]
          },
          navigation: {
            redirects: [{ source: '/index', target: '/home' }]
          },
          assets: {
            assetInventory: [{ id: 'asset-1' }, { id: 'asset-2' }, { id: 'asset-3' }]
          },
          images: {
            imageInventory: [{ id: 'image-1' }]
          },
          components: {
            componentNodes: [{ id: 'cmp-hero' }, { id: 'cmp-nav' }]
          },
          styles: {
            colorStyles: [{ id: 'style-color-primary' }],
            textStyles: [{ id: 'style-text-body' }]
          },
          variables: {
            responsiveBreakpoints: ['mobile', 'desktop']
          }
        }
      }
    };
  }

  async applySandboxBuildInstructions({ buildInstructions = {}, customizationPackage = {}, productionCustomization = {} } = {}) {
    return {
      status: 'SANDBOX_UPSERT_PREPARED',
      sandboxOnly: true,
      publishExecuted: false,
      deployExecuted: false,
      writeExecuted: false,
      productionOverwriteExecuted: false,
      destructiveOperationExecuted: false,
      sandboxProject: {
        id: 'validation-sandbox-project',
        name: 'Validation Sandbox Project',
        projectUrl: 'https://validation-sandbox.example'
      },
      accepted: {
        buildInstructions: Boolean(buildInstructions),
        customizationPackage: Boolean(customizationPackage),
        productionCustomization: Boolean(productionCustomization)
      },
      limitations: []
    };
  }
}

function runTests() {
  const args = [
    '--test',
    'test/website-production-manager-v1.test.js',
    'test/website-production-execution-pipeline-v1.test.js',
    'test/executive-dashboard-api-v1.test.js',
    'test/executive-operations-dashboard-v1.test.js',
    'test/executive-mission-orchestrator-v1.test.js',
    'test/executive-operations-loop-v1.test.js',
    'test/executive-mission-control-api-v1.test.js'
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
  const registry = new WebsiteProviderAdapterRegistry()
    .register({ adapterType: 'FRAMER', adapter: new ValidationFramerAdapter() })
    .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });

  const orchestrator = new AtlasWebsiteOrchestrator({ adapterRegistry: registry });
  const websiteBuilderMissionManager = new WebsiteBuilderMissionManager({ orchestrator });
  const missionControl = new CustomerIntakeMissionControl({ websiteBuilderMissionManager });

  const customer = missionControl.customerRegistry.createCustomer({
    companyName: 'Website Production Execution Pipeline Validation',
    contactName: 'Atlas Ops',
    email: 'ops@website-production-pipeline-validation.example',
    phone: '+1-555-0123',
    website: 'https://website-production-pipeline-validation.example',
    industry: 'Media',
    adapterType: 'FRAMER',
    providerHint: 'FRAMER_SANDBOX'
  }).customer;

  const planning = new ExecutivePlanningSystem({ missionControl });
  const proposal = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'website-production-pipeline-validation',
    customerId: customer.customerId,
    title: 'Website Production Pipeline Validation Proposal',
    description: 'Validate staged production execution with governance gate.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Delivery package ready for CEO approval',
    strategicObjective: 'Production governance',
    expectedBusinessValue: 91,
    urgency: 82,
    estimatedEffort: 28,
    estimatedCost: 64000,
    estimatedDuration: 42,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.27 }],
    confidence: 0.87,
    metadata: { strategicAlignment: 0.93 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: proposal.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for website production execution pipeline validation.',
    conditions: []
  });

  const dashboardManager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning
  });

  const orchestrated = await dashboardManager.missionOrchestratorManager.orchestrate({
    proposalId: proposal.proposal.proposalId
  });

  return {
    dashboardManager,
    missionId: orchestrated.session.missionId
  };
}

function toMarkdown(report) {
  return `# Atlas Website Production Execution Pipeline v1 Report\n\n- Status: ${report.overallStatus}\n- Stage: ${report.pipelineSummary.stage}\n- QA status: ${report.pipelineSummary.qaStatus}\n- Quality score: ${report.pipelineSummary.qualityScore}\n- Confidence score: ${report.pipelineSummary.confidenceScore}\n- Reviews awaiting CEO approval: ${report.dashboardSummary.awaitingCeoApproval}\n\n## Files Created\n${report.filesCreated.map((item) => `- ${item}`).join('\n')}\n\n## Files Modified\n${report.filesModified.map((item) => `- ${item}`).join('\n')}\n\n## Integrations Reused\n${report.integrationsReused.map((item) => `- ${item}`).join('\n')}\n\n## Governance\n- Publish attempted: ${report.governance.publishAttempted ? 'YES' : 'NO'}\n- Deploy attempted: ${report.governance.deployAttempted ? 'YES' : 'NO'}\n- Destructive action attempted: ${report.governance.destructiveOperationAttempted ? 'YES' : 'NO'}\n- Final state: ${report.governance.finalState}\n\n## Validation\n- ${report.testsRun}\n- Pass: ${report.testTotals.pass}\n- Fail: ${report.testTotals.fail}\n`;
}

async function main() {
  const { dashboardManager, missionId } = await createValidationSystem();

  const evaluation = dashboardManager.websiteProductionManager.evaluateProductionReadiness({
    missionId,
    requiredPages: ['home', 'services', 'contact']
  });

  const dashboard = new ExecutiveOperationsDashboard({ manager: dashboardManager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN: 'validate-ceo',
      ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'validate-exec',
      ATLAS_DASHBOARD_API_TOKEN_VIEWER: 'validate-viewer'
    } })
  });

  const apiResponse = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/website-production',
    headers: { authorization: 'Bearer validate-viewer' }
  });

  const projectionRecord = apiResponse.envelope?.data?.records?.[0] ?? {};
  const testRun = runTests();

  const report = {
    generatedAt: new Date().toISOString(),
    overallStatus: testRun.status === 0 && evaluation.accepted ? 'PASS' : 'FAIL',
    filesCreated: [
      'integration/src/executive/website-production-qa-engine.js',
      'integration/src/executive/website-production-revision-engine.js',
      'integration/src/executive/website-production-delivery-package-generator.js',
      'integration/src/executive/website-production-execution-orchestrator.js',
      'integration/test/website-production-execution-pipeline-v1.test.js',
      'integration/scripts/run-website-production-execution-pipeline-v1-validation.js',
      'integration/docs/website-production-execution-pipeline-v1.md'
    ],
    filesModified: [
      'integration/src/executive/website-production-manager.js',
      'integration/src/executive/website-production-manager-contracts.js',
      'integration/src/executive/executive-operations-loop-manager.js',
      'integration/test/website-production-manager-v1.test.js',
      'integration/package.json',
      'integration/README.md'
    ],
    integrationsReused: [
      'Mission Control',
      'Executive Planning',
      'Mission Orchestrator',
      'Executive Dashboard API',
      'Operations Loop Manager',
      'Workforce Director',
      'Executive Review Package Generator',
      'Provider-backed persistence'
    ],
    pipelineSummary: {
      stage: projectionRecord.stage ?? null,
      qaStatus: projectionRecord.qaStatus ?? null,
      issuesRemaining: projectionRecord.issuesRemaining ?? 0,
      workerAssignments: projectionRecord.workerAssignments ?? [],
      estimatedCompletion: projectionRecord.estimatedCompletion ?? null,
      qualityScore: projectionRecord.qualityScore ?? 0,
      deliveryReadiness: projectionRecord.deliveryReadiness ?? null,
      confidenceScore: evaluation.review?.deliveryPackage?.confidenceScore ?? 0
    },
    dashboardSummary: {
      endpointStatus: apiResponse.httpStatus,
      awaitingCeoApproval: apiResponse.envelope?.data?.awaitingCeoApproval ?? 0
    },
    governance: {
      publishAttempted: evaluation.review?.governance?.publishAttempted ?? false,
      deployAttempted: evaluation.review?.governance?.deployAttempted ?? false,
      destructiveOperationAttempted: evaluation.review?.governance?.destructiveOperationAttempted ?? false,
      finalState: evaluation.review?.governance?.finalState ?? 'FAILED'
    },
    testsRun: testRun.command,
    testTotals: {
      pass: testRun.pass,
      fail: testRun.fail
    },
    remainingLimitations: [
      'Screenshot capture remains task/reference generation only in v1.',
      'Automated revision retries route recommendations and rerun QA but do not apply visual edits directly.'
    ]
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/website-production-execution-pipeline-v1-report.json', JSON.stringify(report, null, 2));
  writeFileSync('/root/atlas/review/website-production-execution-pipeline-v1-report.md', toMarkdown(report));

  console.log('Website Production Execution Pipeline v1 validation completed.');
  console.log('/root/atlas/review/website-production-execution-pipeline-v1-report.json');
  console.log('/root/atlas/review/website-production-execution-pipeline-v1-report.md');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
