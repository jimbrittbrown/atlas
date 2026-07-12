import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasWebsiteOrchestrator } from '../src/executive/website-orchestrator.js';
import { WebsiteProviderAdapterRegistry, SpecialistWebsiteProviderAdapter } from '../src/executive/website-provider-adapters.js';
import { WebsiteBuilderMissionManager } from '../src/executive/website-builder-mission-manager.js';
import { WebsiteDemonstrationMissionManager } from '../src/executive/website-demonstration-mission-manager.js';
import { WebsiteDemonstrationMissionStates } from '../src/executive/website-demonstration-mission-contracts.js';

class SandboxAdapter extends SpecialistWebsiteProviderAdapter {
  constructor({ publishExecuted = false } = {}) {
    super({ name: 'Sandbox Adapter', type: 'FRAMER' });
    this.publishExecuted = publishExecuted;
  }

  async applySandboxBuildInstructions() {
    return {
      status: 'SANDBOX_UPSERT_PREPARED',
      sandboxOnly: true,
      publishExecuted: this.publishExecuted,
      deployExecuted: false,
      destructiveOperationExecuted: false,
      productionOverwriteExecuted: false,
      writeExecuted: false,
      sandboxProject: {
        id: 'sandbox-1',
        name: 'Atlas Sandbox',
        projectUrl: 'https://framer.com/projects/atlas-sandbox'
      }
    };
  }
}

function createManager({ publishExecuted = false } = {}) {
  const adapter = new SandboxAdapter({ publishExecuted });
  const registry = new WebsiteProviderAdapterRegistry()
    .register({ adapterType: 'FRAMER', adapter })
    .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });

  const orchestrator = new AtlasWebsiteOrchestrator({ adapterRegistry: registry });
  const builderManager = new WebsiteBuilderMissionManager({ orchestrator, adapterRegistry: registry });

  return new WebsiteDemonstrationMissionManager({
    orchestrator,
    websiteBuilderMissionManager: builderManager
  });
}

function createRequest() {
  return {
    missionId: 'website-demo-v1-test',
    websiteUrl: 'https://example.com',
    prospect: {
      approved: true,
      approvedBy: 'CEO',
      companyName: 'Example Co'
    },
    adapterType: 'FRAMER'
  };
}

test('website demonstration mission runs full workflow and emits executive review package', async () => {
  const manager = createManager();
  const result = await manager.runMission(createRequest());

  assert.equal(result.mission.state, WebsiteDemonstrationMissionStates.COMPLETED);
  assert.equal(result.mission.completedStageIds.length, 10);
  assert.equal(result.governance.publishAttempted, false);
  assert.equal(result.governance.deployAttempted, false);
  assert.equal(typeof result.executiveReviewPackage.businessSummary, 'object');
  assert.equal(Array.isArray(result.executiveReviewPackage.screenshotReferences), true);
  assert.equal(result.executiveReviewPackage.sandboxExecutionSummary.status, 'COMPLETED');
});

test('website demonstration mission fails on governance violation from builder mission', async () => {
  const manager = createManager({ publishExecuted: true });
  const result = await manager.runMission(createRequest());

  assert.equal(result.mission.state, WebsiteDemonstrationMissionStates.FAILED);
  assert.equal(
    result.mission.failureLog.some((entry) => entry.errorMessage.includes('Publishing is forbidden')),
    true
  );
});

test('website demonstration mission supports rollback and resume', async () => {
  const manager = createManager();
  const initial = await manager.runMission(createRequest());

  manager.rollbackMission({
    mission: initial.mission,
    stageId: 'TEMPLATE_SELECTION',
    reason: 'Resume validation'
  });

  assert.equal(initial.mission.currentStageId, 'TEMPLATE_SELECTION');

  const resumed = await manager.runMission({}, {
    mission: initial.mission,
    resumeFromStageId: 'TEMPLATE_SELECTION',
    retryStageId: 'TEMPLATE_SELECTION'
  });

  assert.equal(resumed.mission.state, WebsiteDemonstrationMissionStates.COMPLETED);
});
