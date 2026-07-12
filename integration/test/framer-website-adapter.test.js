import test from 'node:test';
import assert from 'node:assert/strict';
import { createFramerAdapterConfigFromEnv, validateFramerAdapterConfig } from '../src/executive/framer-adapter-config.js';
import { FramerAuthClient } from '../src/executive/framer-auth-client.js';
import { FramerServerApiClient } from '../src/executive/framer-server-api-client.js';
import { AtlasFramerWebsiteAdapter } from '../src/executive/framer-website-adapter.js';
import { FramerAdapterError } from '../src/executive/framer-error-normalizer.js';

function createConfig(overrides = {}) {
  return {
    projectUrl: 'https://framer.com/projects/atlas-test',
    apiKey: 'test-api-key',
    apiKeyEnvVarName: 'FRAMER_API_KEY',
    readOnly: true,
    liveMode: false,
    dryRun: true,
    allowPreviewPublish: false,
    allowProductionDeploy: false,
    allowProjectDuplication: false,
    maxRetries: 2,
    retryDelayMs: 1,
    requestTimeoutMs: 1000,
    externalAgentEnabled: true,
    pluginFallbackEnabled: true,
    ...overrides
  };
}

test('config parser reads env booleans and ints', () => {
  const config = createFramerAdapterConfigFromEnv({
    FRAMER_PROJECT_URL: 'https://framer.com/projects/atlas-test',
    FRAMER_API_KEY: 'abc',
    FRAMER_READ_ONLY: 'true',
    FRAMER_LIVE_MODE: 'false',
    FRAMER_DRY_RUN: 'false',
    FRAMER_ALLOW_PREVIEW_PUBLISH: 'false',
    FRAMER_ALLOW_PRODUCTION_DEPLOY: 'false',
    FRAMER_MAX_RETRIES: '4',
    FRAMER_RETRY_DELAY_MS: '50'
  });

  assert.equal(config.readOnly, true);
  assert.equal(config.liveMode, false);
  assert.equal(config.dryRun, false);
  assert.equal(config.allowPreviewPublish, false);
  assert.equal(config.allowProductionDeploy, false);
  assert.equal(config.maxRetries, 4);
  assert.equal(config.retryDelayMs, 50);
});

test('config validator flags missing URL/key', () => {
  const validation = validateFramerAdapterConfig(createConfig({ projectUrl: '', apiKey: '' }));

  assert.equal(validation.isValid, false);
  assert.equal(validation.issues.length >= 2, true);
});

test('auth client fails cleanly on missing api key', () => {
  const auth = new FramerAuthClient({ config: createConfig({ apiKey: '' }) });

  assert.throws(() => auth.getApiKey(), (error) => {
    assert.equal(error instanceof FramerAdapterError, true);
    assert.equal(error.code, 'FRAMER_AUTH_ERROR');
    return true;
  });
});

test('server api client retries transient failures', async () => {
  let attempts = 0;
  const client = new FramerServerApiClient({
    config: createConfig({ dryRun: false, maxRetries: 2, retryDelayMs: 1 }),
    connectFn: async () => ({
      getProjectInfo: async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error('temporary network timeout');
        }

        return { id: 'proj', name: 'Atlas Test Project' };
      },
      disconnect: async () => {}
    })
  });

  const snapshot = await client.getProjectSnapshot({
    projectUrl: 'https://framer.com/projects/atlas-test',
    apiKey: 'test-key'
  });

  assert.equal(snapshot.projectInfo.name, 'Atlas Test Project');
  assert.equal(attempts, 2);
});

test('server api client discovers read-only capability surface', async () => {
  const client = new FramerServerApiClient({
    config: createConfig({ dryRun: false }),
    connectFn: async () => ({
      getProjectInfo: async () => ({ id: 'proj-1', name: 'Atlas Sandbox' }),
      getPublishInfo: async () => ({ production: null, staging: null }),
      getCollections: async () => ([{ id: 'col-1', name: 'Articles' }]),
      getFonts: async () => ([{ family: 'Atlas Sans' }]),
      getColorStyles: async () => ([{ id: 'style-1' }]),
      getTextStyles: async () => ([{ id: 'text-1' }]),
      getVariables: async () => ([{ name: 'BrandPrimary' }]),
      getRedirects: async () => ([]),
      disconnect: async () => {}
    })
  });

  const report = await client.discoverReadOnlyCapabilities({
    projectUrl: 'https://framer.com/projects/atlas-test',
    apiKey: 'test-key'
  });

  assert.equal(report.connected, true);
  assert.equal(Array.isArray(report.supportedEndpoints), true);
  assert.equal(report.supportedEndpoints.some((entry) => entry.operationId === 'projectInfo'), true);
  assert.equal(report.categories.projectMetadata.supportedEndpoints.length >= 1, true);
  assert.equal(Array.isArray(report.recommendedFutureWriteOperations), true);
});

test('adapter enforces CEO gate on publish', async () => {
  const adapter = new AtlasFramerWebsiteAdapter({ config: createConfig() });

  await assert.rejects(
    () => adapter.publishWebsite({ generatedWebsite: { websiteId: 'site-1' }, ceoApproved: false }),
    (error) => {
      assert.equal(error.code, 'FRAMER_READ_ONLY_BLOCK');
      return true;
    }
  );
});

test('adapter supports dry-run preview and idempotent replay', async () => {
  const adapter = new AtlasFramerWebsiteAdapter({
    config: createConfig({ dryRun: true, readOnly: false, allowPreviewPublish: true })
  });

  const first = await adapter.createPreview({ generatedWebsite: { websiteId: 'site-1' } });
  const second = await adapter.createPreview({ generatedWebsite: { websiteId: 'site-1' } });

  assert.equal(first.deployment.id, 'dry-run-preview');
  assert.equal(second.idempotentReplay, true);
});

test('adapter blocks preview in read-only mode', async () => {
  const adapter = new AtlasFramerWebsiteAdapter({
    config: createConfig({ readOnly: true, dryRun: false, allowPreviewPublish: true })
  });

  await assert.rejects(
    () => adapter.createPreview({ generatedWebsite: { websiteId: 'site-1' } }),
    (error) => {
      assert.equal(error.code, 'FRAMER_READ_ONLY_BLOCK');
      return true;
    }
  );
});

test('adapter verifyConnection returns dry-run capability report', async () => {
  const adapter = new AtlasFramerWebsiteAdapter({ config: createConfig({ dryRun: true }) });
  const report = await adapter.verifyConnection();

  assert.equal(report.connected, true);
  assert.equal(report.mode, 'DRY_RUN');
  assert.equal(Array.isArray(report.limitations), true);
});

test('adapter readAllProjectDetails returns dry-run response safely', async () => {
  const adapter = new AtlasFramerWebsiteAdapter({ config: createConfig({ dryRun: true }) });
  const details = await adapter.readAllProjectDetails();

  assert.equal(details.mode, 'DRY_RUN');
  assert.equal(details.connected, true);
  assert.equal(Array.isArray(details.limitations), true);
});

test('adapter prepares duplicate workflow without execution', async () => {
  const adapter = new AtlasFramerWebsiteAdapter({ config: createConfig() });
  const plan = await adapter.prepareDuplicateWorkflow({
    sourceProjectId: 'proj-source-1',
    duplicateName: 'RidgeLine Roofing Copy'
  });

  assert.equal(plan.executable, false);
  assert.equal(plan.requested.sourceProjectId, 'proj-source-1');
  assert.equal(Array.isArray(plan.plannedSteps), true);
});

test('adapter contract methods are available and return expected shape', async () => {
  const adapter = new AtlasFramerWebsiteAdapter({ config: createConfig() });

  const research = await adapter.researchCompany({ prospect: { companyName: 'Atlas Co' } });
  const brand = await adapter.generateBrandPackage({ existingBranding: { palette: 'amber' }, companyResearch: research });
  const template = await adapter.selectTemplate({ brandPackage: brand });
  const website = await adapter.generateWebsite({ templateSelection: template, brandPackage: brand });
  const delivery = await adapter.buildDeliveryPackage({ mission: { missionId: 'm-1' }, artifacts: { generatedWebsite: website } });

  assert.equal(typeof adapter.researchCompany, 'function');
  assert.equal(typeof adapter.generateBrandPackage, 'function');
  assert.equal(typeof adapter.selectTemplate, 'function');
  assert.equal(typeof adapter.generateWebsite, 'function');
  assert.equal(typeof adapter.publishWebsite, 'function');
  assert.equal(typeof adapter.buildDeliveryPackage, 'function');

  assert.equal(typeof research.summary, 'string');
  assert.equal(typeof brand.brandNarrative, 'string');
  assert.equal(typeof template.templateId, 'string');
  assert.equal(typeof website.provider, 'string');
  assert.equal(Array.isArray(delivery.handoffChecklist), true);
});
