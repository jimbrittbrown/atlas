import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasWebsiteOrchestrator } from '../src/executive/website-orchestrator.js';
import { WebsiteProviderAdapterRegistry, SpecialistWebsiteProviderAdapter } from '../src/executive/website-provider-adapters.js';
import { WebsiteBuilderMissionManager } from '../src/executive/website-builder-mission-manager.js';
import { WebsiteBuilderMissionStates } from '../src/executive/website-builder-mission-contracts.js';
import { WorkforceDirector } from '../src/executive/workforce-director.js';
import { WorkforceRegistry } from '../src/executive/workforce-registry.js';

class SandboxCapableAdapter extends SpecialistWebsiteProviderAdapter {
  constructor({ publishExecuted = false } = {}) {
    super({ name: 'Sandbox Capable Adapter', type: 'FRAMER' });
    this.publishExecuted = publishExecuted;
  }

  async applySandboxBuildInstructions({ buildInstructions = {}, customizationPackage = {}, productionCustomization = {} } = {}) {
    return {
      status: 'SANDBOX_UPSERT_PREPARED',
      sandboxOnly: true,
      publishExecuted: this.publishExecuted,
      deployExecuted: false,
      writeExecuted: false,
      productionOverwriteExecuted: false,
      destructiveOperationExecuted: false,
      accepted: {
        buildInstructions: Boolean(buildInstructions),
        customizationPackage: Boolean(customizationPackage),
        productionCustomization: Boolean(productionCustomization)
      },
      limitations: []
    };
  }
}

function createManager({ publishExecuted = false, workforceDirector } = {}) {
  const adapter = new SandboxCapableAdapter({ publishExecuted });
  const registry = new WebsiteProviderAdapterRegistry()
    .register({ adapterType: 'FRAMER', adapter })
    .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });

  const orchestrator = new AtlasWebsiteOrchestrator({ adapterRegistry: registry });

  return new WebsiteBuilderMissionManager({ orchestrator, workforceDirector });
}

function createRequest() {
  return {
    missionId: 'website-builder-v1-test',
    prospectUrl: 'https://prospect-example.com',
    prospect: {
      approved: true,
      approvedBy: 'CEO',
      companyName: 'Prospect Example'
    },
    existingBranding: {
      palette: 'amber-black'
    },
    adapterType: 'FRAMER',
    websiteRequirements: {
      pages: ['home', 'services', 'contact']
    }
  };
}

test('website builder mission runs full sandbox workflow and stops before publish', async () => {
  const manager = createManager();
  const result = await manager.runMission(createRequest());

  assert.equal(result.mission.state, WebsiteBuilderMissionStates.COMPLETED);
  assert.equal(result.mission.completedStageIds.length, 8);
  assert.equal(result.governance.publishAttempted, false);
  assert.equal(result.governance.deployAttempted, false);
  assert.equal(result.progress.completionPercentage, 100);
  assert.equal(result.mission.artifacts.sandboxBuildResult.status, 'SANDBOX_UPSERT_PREPARED');
  assert.equal(result.workforce.assignments.assignmentPlan.ready, true);
  assert.equal(result.workforce.dashboard.idleWorkers >= 1, true);
});

test('website builder mission fails if sandbox stage attempts publish', async () => {
  const manager = createManager({ publishExecuted: true });
  const result = await manager.runMission(createRequest());

  assert.equal(result.mission.state, WebsiteBuilderMissionStates.FAILED);
  assert.equal(result.mission.failureLog.length > 0, true);
  assert.equal(
    result.mission.failureLog.some((entry) => entry.errorMessage.includes('Publishing is not allowed in Website Builder Mission v1.')),
    true
  );
});

test('website builder mission supports rollback and resume recovery', async () => {
  const manager = createManager();
  const initial = await manager.runMission(createRequest());

  manager.rollbackMission({
    mission: initial.mission,
    stageId: 'TEMPLATE_SELECTION',
    reason: 'Recovery verification'
  });

  assert.equal(initial.mission.currentStageId, 'TEMPLATE_SELECTION');
  assert.equal(initial.mission.artifacts.customizationPackage, null);

  const resumed = await manager.runMission({}, {
    mission: initial.mission,
    resumeFromStageId: 'TEMPLATE_SELECTION',
    retryStageId: 'TEMPLATE_SELECTION'
  });

  assert.equal(resumed.mission.state, WebsiteBuilderMissionStates.COMPLETED);
});

test('website builder mission retries with workforce reassignment after transient stage failure', async () => {
  const workforceDirector = new WorkforceDirector({
    workforceRegistry: new WorkforceRegistry({
      initialWorkers: [
        {
          workerName: 'Company Research Specialist',
          division: 'WEBSITE_DIVISION',
          specialty: 'COMPANY_RESEARCH_SPECIALIST',
          capabilities: ['COMPANY_RESEARCH'],
          status: 'IDLE'
        },
        {
          workerName: 'Brand Strategy Specialist',
          division: 'WEBSITE_DIVISION',
          specialty: 'BRAND_STRATEGY_SPECIALIST',
          capabilities: ['BRAND_PACKAGE_GENERATION'],
          status: 'IDLE'
        },
        {
          workerName: 'Messaging Specialist',
          division: 'WEBSITE_DIVISION',
          specialty: 'MESSAGING_SPECIALIST',
          capabilities: ['BRAND_PACKAGE_GENERATION'],
          status: 'IDLE'
        },
        {
          workerName: 'Website Architect',
          division: 'WEBSITE_DIVISION',
          specialty: 'WEBSITE_ARCHITECT',
          capabilities: ['TEMPLATE_SELECTION', 'CUSTOMIZATION_PACKAGE_GENERATION'],
          status: 'IDLE'
        },
        {
          workerName: 'Framer Production Specialist A',
          division: 'WEBSITE_DIVISION',
          specialty: 'FRAMER_PRODUCTION_SPECIALIST',
          capabilities: ['WEBSITE_PRODUCTION_CUSTOMIZATION', 'FRAMER_BUILD_INSTRUCTION_GENERATION', 'SANDBOX_PROJECT_UPSERT'],
          status: 'IDLE'
        },
        {
          workerName: 'Framer Production Specialist B',
          division: 'WEBSITE_DIVISION',
          specialty: 'FRAMER_PRODUCTION_SPECIALIST',
          capabilities: ['WEBSITE_PRODUCTION_CUSTOMIZATION', 'FRAMER_BUILD_INSTRUCTION_GENERATION', 'SANDBOX_PROJECT_UPSERT'],
          status: 'IDLE'
        },
        {
          workerName: 'QA Specialist',
          division: 'WEBSITE_DIVISION',
          specialty: 'QA_SPECIALIST',
          capabilities: ['SANDBOX_PROJECT_UPSERT'],
          status: 'IDLE'
        }
      ]
    })
  });

  const manager = createManager({ workforceDirector });
  const originalGenerateWebsite = manager.websiteProductionSystem.generateWebsite.bind(manager.websiteProductionSystem);
  let hasFailedOnce = false;

  manager.websiteProductionSystem.generateWebsite = async (payload) => {
    if (!hasFailedOnce) {
      hasFailedOnce = true;
      throw new Error('Transient production generation timeout');
    }

    return originalGenerateWebsite(payload);
  };

  const result = await manager.runMission(createRequest());

  assert.equal(result.mission.state, WebsiteBuilderMissionStates.COMPLETED);
  assert.equal(result.mission.workforce.retryByStage.WEBSITE_PRODUCTION_CUSTOMIZATION, 1);
  assert.equal(
    result.mission.workforce.activity.some((entry) => entry.type === 'STAGE_RETRY_REQUESTED' && entry.recovered === true),
    true
  );
});
