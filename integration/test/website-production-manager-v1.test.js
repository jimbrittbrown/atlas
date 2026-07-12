import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasWebsiteOrchestrator } from '../src/executive/website-orchestrator.js';
import { WebsiteBuilderMissionManager } from '../src/executive/website-builder-mission-manager.js';
import { WebsiteProviderAdapterRegistry, SpecialistWebsiteProviderAdapter } from '../src/executive/website-provider-adapters.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { WebsiteProductionManager } from '../src/executive/website-production-manager.js';

class QaReadyFramerAdapter extends SpecialistWebsiteProviderAdapter {
  constructor() {
    super({ name: 'QA Ready Framer Adapter', type: 'FRAMER' });
  }

  async researchCompany({ prospect }) {
    return {
      summary: `Research complete for ${prospect?.companyName ?? 'Unknown'}.`,
      confidence: 0.84,
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
            assetInventory: [{ id: 'asset-logo' }, { id: 'asset-hero' }, { id: 'asset-proof' }]
          },
          images: {
            imageInventory: [{ id: 'img-1' }, { id: 'img-2' }]
          },
          components: {
            componentNodes: [{ id: 'cmp-nav' }, { id: 'cmp-hero' }, { id: 'cmp-footer' }]
          },
          styles: {
            colorStyles: [{ id: 'color-primary' }],
            textStyles: [{ id: 'text-body' }]
          },
          variables: {
            responsiveBreakpoints: ['mobile', 'tablet', 'desktop']
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
        id: 'sandbox-qa-project',
        name: 'Sandbox QA Project',
        projectUrl: 'https://sandbox.qa.example'
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

class QaDegradedFramerAdapter extends SpecialistWebsiteProviderAdapter {
  constructor() {
    super({ name: 'QA Degraded Framer Adapter', type: 'FRAMER' });
  }

  async researchCompany({ prospect }) {
    return {
      summary: `Research complete for ${prospect?.companyName ?? 'Unknown'}.`,
      confidence: 0.7,
      projectDetails: {
        details: {
          pageMetadata: {
            pages: [
              { name: 'Home', slug: 'home' }
            ]
          },
          navigation: {
            redirects: []
          },
          assets: {
            assetInventory: []
          },
          images: {
            imageInventory: []
          },
          components: {
            componentNodes: [{ id: 'cmp-nav', state: 'broken' }]
          },
          styles: {
            colorStyles: []
          },
          variables: {}
        }
      }
    };
  }

  async applySandboxBuildInstructions() {
    return {
      status: 'SANDBOX_UPSERT_PREPARED',
      sandboxOnly: true,
      publishExecuted: false,
      deployExecuted: false,
      writeExecuted: false,
      productionOverwriteExecuted: false,
      destructiveOperationExecuted: false,
      sandboxProject: {
        id: 'sandbox-degraded-project',
        name: 'Sandbox Degraded Project',
        projectUrl: 'https://sandbox.degraded.example'
      },
      accepted: {
        buildInstructions: true,
        customizationPackage: true,
        productionCustomization: true
      },
      limitations: []
    };
  }
}

function createSystem({ adapterType = 'FRAMER' } = {}) {
  const registry = new WebsiteProviderAdapterRegistry()
    .register({ adapterType: 'FRAMER', adapter: new QaReadyFramerAdapter() })
    .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });

  const orchestrator = new AtlasWebsiteOrchestrator({ adapterRegistry: registry });
  const websiteBuilderMissionManager = new WebsiteBuilderMissionManager({ orchestrator });
  const missionControl = new CustomerIntakeMissionControl({ websiteBuilderMissionManager });

  const customer = missionControl.customerRegistry.createCustomer({
    companyName: 'Website Production Test',
    contactName: 'Atlas Ops',
    email: 'ops@website-production.example',
    phone: '+1-555-0999',
    website: 'https://website-production.example',
    industry: 'Media',
    adapterType,
    providerHint: 'FRAMER_SANDBOX'
  }).customer;

  const planning = new ExecutivePlanningSystem({ missionControl });
  const proposal = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'website-production-test',
    customerId: customer.customerId,
    title: 'Website Production QA Validation',
    description: 'Validate production readiness for sandbox project.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Customer delivery package',
    strategicObjective: 'Production readiness',
    expectedBusinessValue: 88,
    urgency: 81,
    estimatedEffort: 25,
    estimatedCost: 50000,
    estimatedDuration: 35,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.28 }],
    confidence: 0.86,
    metadata: { strategicAlignment: 0.92 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: proposal.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for production manager validation.',
    conditions: []
  });

  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning
  });

  manager.websiteProductionManager = new WebsiteProductionManager({
    missionControl,
    missionOrchestratorManager: manager.missionOrchestratorManager,
    qualityScoringEngine: missionControl.qualityScoringEngine,
    sandboxPolicy: missionControl.sandboxPolicy
  });

  return {
    manager,
    proposalId: proposal.proposal.proposalId
  };
}

function createDegradedSystem() {
  const registry = new WebsiteProviderAdapterRegistry()
    .register({ adapterType: 'FRAMER', adapter: new QaDegradedFramerAdapter() })
    .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });

  const orchestrator = new AtlasWebsiteOrchestrator({ adapterRegistry: registry });
  const websiteBuilderMissionManager = new WebsiteBuilderMissionManager({ orchestrator });
  const missionControl = new CustomerIntakeMissionControl({ websiteBuilderMissionManager });

  const customer = missionControl.customerRegistry.createCustomer({
    companyName: 'Website Production Degraded Test',
    contactName: 'Atlas Ops',
    email: 'ops@website-production-degraded.example',
    phone: '+1-555-1888',
    website: 'https://website-production-degraded.example',
    industry: 'Media',
    adapterType: 'FRAMER',
    providerHint: 'FRAMER_SANDBOX'
  }).customer;

  const planning = new ExecutivePlanningSystem({ missionControl });
  const proposal = planning.submitProposal({
    sourceType: 'CEO',
    sourceId: 'website-production-degraded-test',
    customerId: customer.customerId,
    title: 'Website Production QA Revision Loop Validation',
    description: 'Validate revision loop behavior for low QA score mission.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Customer delivery package',
    strategicObjective: 'Production readiness',
    expectedBusinessValue: 81,
    urgency: 78,
    estimatedEffort: 28,
    estimatedCost: 42000,
    estimatedDuration: 21,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH'],
    risks: [{ id: 'risk-1', severity: 0.41 }],
    confidence: 0.76,
    metadata: { strategicAlignment: 0.88 }
  });

  planning.evaluateAll();
  planning.rankPortfolio();
  planning.applyDecision({
    proposalId: proposal.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for degraded pipeline validation.',
    conditions: []
  });

  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning
  });

  manager.websiteProductionManager = new WebsiteProductionManager({
    missionControl,
    missionOrchestratorManager: manager.missionOrchestratorManager,
    qualityScoringEngine: missionControl.qualityScoringEngine,
    sandboxPolicy: missionControl.sandboxPolicy
  });

  return {
    manager,
    proposalId: proposal.proposal.proposalId
  };
}

test('website production manager performs QA and stops at awaiting CEO approval', async () => {
  const { manager, proposalId } = createSystem();
  const orchestrated = await manager.missionOrchestratorManager.orchestrate({ proposalId });

  const result = manager.websiteProductionManager.evaluateProductionReadiness({
    missionId: orchestrated.session.missionId,
    requiredPages: ['home', 'services', 'contact']
  });

  assert.equal(result.accepted, true);
  assert.equal(result.review.state, 'AWAITING_CEO_APPROVAL');
  assert.equal(result.review.qa.checks.length, 8);
  assert.equal(result.review.deliveryPackage.qaResults.score >= 70, true);
  assert.equal(result.review.deliveryPackage.screenshotReferences.length, 3);
  assert.equal(result.review.deliveryPackage.productionExecution.qaStatus, 'PASS');
  assert.equal(result.review.deliveryPackage.productionExecution.deliveryReadiness, 'READY_FOR_CEO_APPROVAL');
  assert.equal(result.review.governance.publishAttempted, false);
  assert.equal(result.review.governance.deployAttempted, false);
  assert.equal(result.review.governance.destructiveOperationAttempted, false);
});

test('website production manager runs revision cycle when QA fails and reports telemetry', async () => {
  const { manager, proposalId } = createDegradedSystem();
  const orchestrated = await manager.missionOrchestratorManager.orchestrate({ proposalId });

  const result = manager.websiteProductionManager.evaluateProductionReadiness({
    missionId: orchestrated.session.missionId,
    requiredPages: ['home', 'services', 'contact']
  });

  assert.equal(result.accepted, true);
  assert.equal(result.review.state, 'AWAITING_CEO_APPROVAL');
  assert.equal(result.review.revisionHistory.length >= 1, true);
  assert.equal(result.review.deliveryPackage.qaResults.issuesRemaining > 0, true);
  assert.equal(result.review.deliveryPackage.productionExecution.revisionRetries >= 1, true);
  assert.equal(result.review.deliveryPackage.productionExecution.deliveryReadiness, 'REVISIONS_PENDING_CEO_DECISION');

  const projection = manager.websiteProductionManager.getDashboardProjection();
  assert.equal(projection.records[0].issuesRemaining > 0, true);
  assert.equal(projection.records[0].qaStatus, 'REVISION_REQUIRED');
});

test('website production manager rejects unsupported adapter type', async () => {
  const { manager, proposalId } = createSystem({ adapterType: 'OTHER' });
  const orchestrated = await manager.missionOrchestratorManager.orchestrate({ proposalId });
  orchestrated.session.pipelineMission.adapterType = 'OTHER';

  const result = manager.websiteProductionManager.evaluateProductionReadiness({
    missionId: orchestrated.session.missionId
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, 'INVALID_STATE');
});

test('website production manager API route is available through dashboard API', async () => {
  const { manager, proposalId } = createSystem();
  const orchestrated = await manager.missionOrchestratorManager.orchestrate({ proposalId });
  manager.websiteProductionManager.evaluateProductionReadiness({ missionId: orchestrated.session.missionId });

  const dashboard = new ExecutiveOperationsDashboard({ manager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN: 'token-ceo',
      ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE: 'token-exec',
      ATLAS_DASHBOARD_API_TOKEN_VIEWER: 'token-viewer'
    } })
  });

  const response = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/website-production',
    headers: { authorization: 'Bearer token-viewer' }
  });

  assert.equal(response.httpStatus, 200);
  assert.equal(response.envelope.data.totalReviews >= 1, true);
});
