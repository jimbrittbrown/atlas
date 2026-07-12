import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasWebsiteOrchestrator } from '../src/executive/website-orchestrator.js';
import { WebsiteProviderAdapterRegistry, SpecialistWebsiteProviderAdapter } from '../src/executive/website-provider-adapters.js';
import { WebsiteExecutiveReviewMissionManager } from '../src/executive/website-executive-review-mission-manager.js';
import { WebsiteExecutiveReviewMissionStates } from '../src/executive/website-executive-review-package-contracts.js';

function createManager() {
  const registry = new WebsiteProviderAdapterRegistry()
    .register({ adapterType: 'FRAMER', adapter: new SpecialistWebsiteProviderAdapter({ name: 'Framer-like', type: 'FRAMER' }) })
    .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });

  const orchestrator = new AtlasWebsiteOrchestrator({ adapterRegistry: registry });
  return new WebsiteExecutiveReviewMissionManager({ orchestrator });
}

function createRequest() {
  return {
    missionId: 'website-executive-review-v1-test',
    prospectUrl: 'https://example.com',
    prospect: {
      approved: true,
      approvedBy: 'CEO',
      companyName: 'Example Co',
      segment: 'B2B Services'
    },
    existingBranding: {
      colors: {
        primary: '#123456'
      }
    },
    adapterType: 'FRAMER'
  };
}

test('executive review mission generates package and stops awaiting CEO approval', async () => {
  const manager = createManager();
  const result = await manager.runMission(createRequest());

  assert.equal(result.mission.state, WebsiteExecutiveReviewMissionStates.AWAITING_CEO_APPROVAL);
  assert.equal(result.mission.completedStageIds.length, 7);
  assert.equal(result.governance.publishAttempted, false);
  assert.equal(result.governance.deployAttempted, false);
  assert.equal(typeof result.executiveReviewPackage.executiveSummary, 'string');
  assert.equal(typeof result.executiveReviewPackage.executiveRecommendation, 'string');
});

test('executive review package includes required decision values', async () => {
  const manager = createManager();
  const result = await manager.runMission(createRequest());

  const recommendation = result.executiveReviewPackage.executiveRecommendation;
  assert.equal(['APPROVE', 'REVISION_REQUIRED', 'REJECT'].includes(recommendation), true);
  assert.equal(typeof result.executiveReviewPackage.websiteHealthScores, 'object');
  assert.equal(Array.isArray(result.executiveReviewPackage.risks), true);
  assert.equal(Array.isArray(result.executiveReviewPackage.missingAssets), true);
});

test('executive review mission supports rollback and resume', async () => {
  const manager = createManager();
  const initial = await manager.runMission(createRequest());

  manager.rollbackMission({
    mission: initial.mission,
    stageId: 'TEMPLATE_RECOMMENDATION',
    reason: 'Recovery validation'
  });

  assert.equal(initial.mission.currentStageId, 'TEMPLATE_RECOMMENDATION');

  const resumed = await manager.runMission({}, {
    mission: initial.mission,
    resumeFromStageId: 'TEMPLATE_RECOMMENDATION',
    retryStageId: 'TEMPLATE_RECOMMENDATION'
  });

  assert.equal(resumed.mission.state, WebsiteExecutiveReviewMissionStates.AWAITING_CEO_APPROVAL);
});
