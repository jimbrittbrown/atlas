import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WebsiteMissionStates,
  WebsiteWorkflowStages,
  createWebsiteMissionStateMachine
} from '../src/executive/website-orchestrator-contracts.js';
import {
  SpecialistWebsiteProviderAdapter,
  WebsiteProviderAdapterRegistry,
  validateWebsiteProviderAdapter
} from '../src/executive/website-provider-adapters.js';
import { AtlasWebsiteOrchestrator } from '../src/executive/website-orchestrator.js';
import { WebsiteOrchestratorDashboard } from '../src/executive/website-orchestrator-dashboard.js';

function createMissionRequest(overrides = {}) {
  return {
    missionId: 'website-mission-001',
    prospect: {
      approved: true,
      approvedBy: 'CEO',
      companyName: 'Atlas Prospect Co'
    },
    existingBranding: {
      palette: 'amber-black',
      tone: 'authoritative'
    },
    ceoDecision: 'APPROVED',
    adapterType: 'OTHER',
    ...overrides
  };
}

test('website orchestrator executes full mission pipeline and delivers package', async () => {
  const orchestrator = new AtlasWebsiteOrchestrator();

  const result = await orchestrator.runMission(createMissionRequest());

  assert.equal(result.mission.state, WebsiteMissionStates.DELIVERED);
  assert.equal(result.mission.completedStageIds.length, WebsiteWorkflowStages.length);
  assert.equal(result.dashboard.currentStage, 'Delivery Package');
  assert.equal(result.dashboard.completionPercentage, 100);
  assert.equal(typeof result.dashboard.estimatedCompletion, 'string');
  assert.equal(result.architecture.governance.publishRequiresCeoApproval, true);
});

test('state machine supports required mission states and key transitions', () => {
  const machine = createWebsiteMissionStateMachine();

  assert.equal(machine.canTransition(WebsiteMissionStates.WAITING, WebsiteMissionStates.RUNNING), true);
  assert.equal(machine.canTransition(WebsiteMissionStates.RUNNING, WebsiteMissionStates.READY_FOR_APPROVAL), true);
  assert.equal(machine.canTransition(WebsiteMissionStates.APPROVED, WebsiteMissionStates.PUBLISHED), true);
  assert.equal(machine.canTransition(WebsiteMissionStates.PUBLISHED, WebsiteMissionStates.DELIVERED), true);
  assert.equal(machine.canTransition(WebsiteMissionStates.FAILED, WebsiteMissionStates.RUNNING), false);
});

test('orchestrator returns revision required when QA reports blocking issues', async () => {
  const orchestrator = new AtlasWebsiteOrchestrator({
    qaEngine: {
      review: async () => ({
        passed: false,
        warnings: ['contrast issue'],
        blockingIssues: ['checkout form broken']
      })
    }
  });

  const result = await orchestrator.runMission(createMissionRequest());

  assert.equal(result.mission.state, WebsiteMissionStates.REVISION_REQUIRED);
  assert.equal(result.mission.currentStageId, 'QA');
  assert.deepEqual(result.dashboard.blockingIssues, ['checkout form broken']);
});

test('publishing remains gated when CEO approval is missing', async () => {
  const orchestrator = new AtlasWebsiteOrchestrator();
  const result = await orchestrator.runMission(createMissionRequest({ ceoDecision: 'PENDING' }));

  assert.equal(result.mission.state, WebsiteMissionStates.REVISION_REQUIRED);
  assert.equal(result.mission.currentStageId, 'CEO_APPROVAL_GATE');
  assert.equal(result.dashboard.blockingIssues.includes('CEO approval is required before publish.'), true);
  assert.equal(result.mission.completedStageIds.includes('PUBLISH'), false);
});

test('orchestrator enforces branding preservation unless explicitly approved', async () => {
  const orchestrator = new AtlasWebsiteOrchestrator({
    websiteIntelligenceEngine: {
      researchCompany: async () => ({ summary: 'research', confidence: 0.8 }),
      generateBrandPackage: async () => ({
        preservedBranding: { palette: 'new-palette' },
        brandNarrative: 'changed',
        confidence: 0.8
      })
    }
  });

  const result = await orchestrator.runMission(createMissionRequest());

  assert.equal(result.mission.state, WebsiteMissionStates.FAILED);
  assert.equal(result.mission.failureLog.length > 0, true);
  assert.equal(
    result.mission.failureLog[0].errorMessage.includes('preserve existing branding unless explicitly approved'),
    true
  );
});

test('orchestrator supports rollback and retry semantics for recovery', async () => {
  const orchestrator = new AtlasWebsiteOrchestrator();
  const initialResult = await orchestrator.runMission(createMissionRequest());

  orchestrator.rollbackMission({
    mission: initialResult.mission,
    stageId: 'TEMPLATE_SELECTION',
    reason: 'Validate rollback behavior'
  });

  assert.equal(initialResult.mission.currentStageId, 'TEMPLATE_SELECTION');
  assert.equal(initialResult.mission.artifacts.generatedWebsite, undefined);

  const resumed = await orchestrator.runMission({}, {
    mission: initialResult.mission,
    resumeFromStageId: 'TEMPLATE_SELECTION',
    retryStageId: 'TEMPLATE_SELECTION'
  });

  assert.equal(resumed.mission.state, WebsiteMissionStates.DELIVERED);
});

test('adapter registry remains provider agnostic and validates adapter contracts', () => {
  const registry = new WebsiteProviderAdapterRegistry();
  const adapter = new SpecialistWebsiteProviderAdapter({ name: 'Specialist Group', type: 'OTHER' });

  const validation = validateWebsiteProviderAdapter(adapter);
  assert.equal(validation.isValid, true);

  registry.register({ adapterType: 'OTHER', adapter });

  assert.equal(registry.getAdapter('OTHER').name, 'Specialist Group');
  assert.equal(registry.listAdapters().length, 1);
});

test('dashboard model projects executive fields from orchestrator result', async () => {
  const orchestrator = new AtlasWebsiteOrchestrator();
  const dashboardModel = new WebsiteOrchestratorDashboard();

  const result = await orchestrator.runMission(createMissionRequest());
  const dashboard = dashboardModel.project({ orchestratorResult: result });

  assert.equal(typeof dashboard.currentStage, 'string');
  assert.equal(typeof dashboard.completionPercentage, 'number');
  assert.equal(Array.isArray(dashboard.warnings), true);
  assert.equal(typeof dashboard.confidence, 'number');
  assert.equal(Array.isArray(dashboard.blockingIssues), true);
  assert.equal(typeof dashboard.estimatedCompletion, 'string');
});

test('orchestrator auto-gathers provider project details during company research', async () => {
  const adapter = new SpecialistWebsiteProviderAdapter({ name: 'Framer-like Adapter', type: 'FRAMER' });
  adapter.readAllProjectDetails = async () => ({
    mode: 'LIVE',
    connected: true,
    supportedEndpoints: [{ category: 'projectMetadata', operationId: 'projectInfo', methodName: 'getProjectInfo' }],
    unsupportedEndpoints: []
  });

  const registry = new WebsiteProviderAdapterRegistry().register({
    adapterType: 'FRAMER',
    adapter
  });

  const orchestrator = new AtlasWebsiteOrchestrator({ adapterRegistry: registry });
  const result = await orchestrator.runMission(createMissionRequest({ adapterType: 'FRAMER' }));

  assert.equal(result.mission.state, WebsiteMissionStates.DELIVERED);
  assert.equal(result.mission.artifacts.projectDetails?.connected, true);
  assert.equal(result.mission.artifacts.companyResearch?.projectDetails?.mode, 'LIVE');
});
