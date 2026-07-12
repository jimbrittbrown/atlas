const test = require('node:test');
const assert = require('node:assert/strict');
const { BusinessRegistry } = require('../business/business-registry.js');
const { ProviderRegistry } = require('../providers/provider-registry.js');
const { CredentialRegistry } = require('../providers/credential-registry.js');
const { createMidnightArchivesProductionChecklist, ReadinessStates } = require('./midnight-archives-production-checklist.js');

function createReadyRegistries({ omitCredentials = [] } = {}) {
  const businessRegistry = new BusinessRegistry();
  const providerRegistry = new ProviderRegistry();
  const allCredentials = [
    ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD'],
    ['GOOGLE_APPLICATION_CREDENTIALS_JSON', 'GOOGLE_CLOUD'],
    ['GOOGLE_VERTEX_API_KEY', 'VERTEX_AI'],
    ['YOUTUBE_API_KEY', 'YOUTUBE'],
    ['YOUTUBE_CLIENT_ID', 'YOUTUBE'],
    ['YOUTUBE_CLIENT_SECRET', 'YOUTUBE'],
    ['YOUTUBE_REFRESH_TOKEN', 'YOUTUBE'],
    ['ELEVENLABS_API_KEY', 'ELEVENLABS']
  ]
    .filter(([credentialId]) => !omitCredentials.includes(credentialId))
    .map(([credentialId, providerId]) => ({
      credentialId,
      providerId,
      environment: 'production',
      configured: true,
      verified: true,
      requiredScopes: [],
      status: 'VERIFIED'
    }));

  const credentialRegistry = new CredentialRegistry({
    environment: 'production',
    initialCredentials: allCredentials
  });

  return {
    businessRegistry,
    providerRegistry,
    credentialRegistry
  };
}

test('all required checks passing returns READY', () => {
  const registries = createReadyRegistries();

  const checklist = createMidnightArchivesProductionChecklist({
    ...registries,
    brandPackage: { status: 'READY', packageId: 'BRAND-001' },
    youtubeChannel: { status: 'READY', channelId: 'CHANNEL-001' },
    publishingPolicy: {
      publishingMode: 'NONE',
      defaultVisibility: 'PRIVATE',
      ceoApprovalRequired: true
    },
    ceoApprovalGranted: true,
    publishRequested: false
  });

  assert.equal(checklist.readinessState, ReadinessStates.READY);
  assert.equal(checklist.categories.business.status, 'READY');
  assert.equal(checklist.categories.brand.status, 'READY');
  assert.equal(checklist.categories.providers.status, 'READY');
  assert.equal(checklist.categories.credentials.status, 'READY');
  assert.equal(checklist.categories['publishing safety'].status, 'READY');
  assert.equal(checklist.categories.assets.status, 'READY');
  assert.equal(checklist.categories.knowledge.status, 'READY');
  assert.equal(checklist.categories.dashboard.status, 'READY');
  assert.equal(checklist.categories['executive approval'].status, 'READY');
  assert.equal(checklist.categories['publishing safety'].defaultVisibility, 'PRIVATE');
});

test('missing channel returns READY_WITH_WARNINGS, not failure', () => {
  const registries = createReadyRegistries();

  const checklist = createMidnightArchivesProductionChecklist({
    ...registries,
    brandPackage: { status: 'READY', packageId: 'BRAND-002' },
    youtubeChannel: null,
    publishingPolicy: {
      publishingMode: 'NONE',
      defaultVisibility: 'PRIVATE',
      ceoApprovalRequired: true
    },
    ceoApprovalGranted: true,
    publishRequested: false
  });

  assert.equal(checklist.readinessState, ReadinessStates.READY_WITH_WARNINGS);
  assert.equal(checklist.categories.brand.status, 'READY_WITH_WARNINGS');
  assert.equal(checklist.categories['publishing safety'].status, 'READY');
  assert.equal(Array.isArray(checklist.warnings), true);
});

test('missing required credentials returns BLOCKED', () => {
  const registries = createReadyRegistries({
    omitCredentials: ['YOUTUBE_REFRESH_TOKEN']
  });

  const checklist = createMidnightArchivesProductionChecklist({
    ...registries,
    brandPackage: { status: 'READY', packageId: 'BRAND-003' },
    youtubeChannel: { status: 'READY', channelId: 'CHANNEL-003' },
    publishingPolicy: {
      publishingMode: 'NONE',
      defaultVisibility: 'PRIVATE',
      ceoApprovalRequired: true
    },
    ceoApprovalGranted: true,
    publishRequested: false
  });

  assert.equal(checklist.readinessState, ReadinessStates.BLOCKED);
  assert.equal(checklist.categories.credentials.status, 'BLOCKED');
  assert.equal(checklist.categories.credentials.missingCredentialIds.includes('YOUTUBE_REFRESH_TOKEN'), true);
});

test('publishing enabled without CEO approval returns BLOCKED', () => {
  const registries = createReadyRegistries();

  const checklist = createMidnightArchivesProductionChecklist({
    ...registries,
    brandPackage: { status: 'READY', packageId: 'BRAND-004' },
    youtubeChannel: { status: 'READY', channelId: 'CHANNEL-004' },
    publishingPolicy: {
      publishingMode: 'PRIVATE',
      defaultVisibility: 'PRIVATE',
      ceoApprovalRequired: true
    },
    ceoApprovalGranted: false,
    publishRequested: true
  });

  assert.equal(checklist.readinessState, ReadinessStates.BLOCKED);
  assert.equal(checklist.categories['publishing safety'].status, 'BLOCKED');
  assert.equal(checklist.categories['executive approval'].status, 'BLOCKED');
});

test('no secret values are exposed', () => {
  const businessRegistry = new BusinessRegistry();
  const providerRegistry = new ProviderRegistry();
  const credentialRegistry = new CredentialRegistry({
    environment: 'production',
    initialCredentials: [
      {
        credentialId: 'YOUTUBE_API_KEY',
        providerId: 'YOUTUBE',
        environment: 'production',
        configured: true,
        verified: true,
        requiredScopes: [],
        status: 'VERIFIED',
        secretValue: 'super-secret-value'
      }
    ]
  });

  const checklist = createMidnightArchivesProductionChecklist({
    businessRegistry,
    providerRegistry,
    credentialRegistry,
    brandPackage: { status: 'READY', packageId: 'BRAND-005' },
    youtubeChannel: { status: 'READY', channelId: 'CHANNEL-005' },
    publishingPolicy: {
      publishingMode: 'NONE',
      defaultVisibility: 'PRIVATE',
      ceoApprovalRequired: true
    },
    ceoApprovalGranted: true,
    publishRequested: false
  });

  const serialized = JSON.stringify(checklist);
  assert.equal(serialized.includes('super-secret-value'), false);
  assert.equal(JSON.stringify(checklist.categories.credentials).includes('secretValue'), false);
  assert.equal(JSON.stringify(checklist.categories.credentials).includes('token'), false);
});

test('regression remains green', () => {
  const registries = createReadyRegistries();

  const checklist = createMidnightArchivesProductionChecklist({
    ...registries,
    brandPackage: { status: 'READY', packageId: 'BRAND-006' },
    youtubeChannel: { status: 'READY', channelId: 'CHANNEL-006' },
    publishingPolicy: {
      publishingMode: 'NONE',
      defaultVisibility: 'PRIVATE',
      ceoApprovalRequired: true
    },
    ceoApprovalGranted: true,
    publishRequested: false
  });

  assert.equal(checklist.readinessState, ReadinessStates.READY);
  assert.equal(checklist.categories.business.profileExists, true);
  assert.equal(typeof checklist.categories.assets.assetRoot, 'string');
  assert.equal(typeof checklist.categories.knowledge.knowledgePartition, 'string');
});