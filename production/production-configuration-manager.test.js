const test = require('node:test');
const assert = require('node:assert/strict');
const { BusinessRegistry } = require('../business/business-registry.js');
const { ProviderRegistry } = require('../providers/provider-registry.js');
const { CredentialRegistry } = require('../providers/credential-registry.js');
const { CEODashboardService } = require('../dashboard/ceo-dashboard-service.js');
const { OperationsCenter } = require('../operations/operations-center.js');
const {
  createProductionConfiguration,
  validateProductionConfiguration,
  ProductionConfigurationHealthStates
} = require('./production-configuration-contracts.js');
const { ProductionConfigurationManager } = require('./production-configuration-manager.js');

function createCredentialRegistry() {
  return new CredentialRegistry({
    environment: 'production',
    initialCredentials: [
      { credentialId: 'GOOGLE_CLOUD_PROJECT', providerId: 'GOOGLE_CLOUD', environment: 'production', configured: true, verified: true, requiredScopes: [], status: 'VERIFIED' },
      { credentialId: 'GOOGLE_APPLICATION_CREDENTIALS_JSON', providerId: 'GOOGLE_CLOUD', environment: 'production', configured: true, verified: true, requiredScopes: [], status: 'VERIFIED' },
      { credentialId: 'GOOGLE_VERTEX_API_KEY', providerId: 'VERTEX_AI', environment: 'production', configured: true, verified: true, requiredScopes: [], status: 'VERIFIED' },
      { credentialId: 'YOUTUBE_API_KEY', providerId: 'YOUTUBE', environment: 'production', configured: true, verified: true, requiredScopes: [], status: 'VERIFIED' },
      { credentialId: 'YOUTUBE_CLIENT_ID', providerId: 'YOUTUBE', environment: 'production', configured: true, verified: true, requiredScopes: [], status: 'VERIFIED' },
      { credentialId: 'YOUTUBE_CLIENT_SECRET', providerId: 'YOUTUBE', environment: 'production', configured: true, verified: true, requiredScopes: [], status: 'VERIFIED' },
      { credentialId: 'YOUTUBE_REFRESH_TOKEN', providerId: 'YOUTUBE', environment: 'production', configured: true, verified: true, requiredScopes: [], status: 'VERIFIED' },
      { credentialId: 'ELEVENLABS_API_KEY', providerId: 'ELEVENLABS', environment: 'production', configured: true, verified: true, requiredScopes: [], status: 'VERIFIED' }
    ]
  });
}

function createCompleteConfig() {
  return createProductionConfiguration({
    business: {
      businessId: 'SYSTEM_INTERNAL',
      displayName: 'Atlas System Internal',
      productionReady: true,
      brandConfigured: true,
      channelConfigured: true,
      assetRootConfigured: true,
      knowledgePartitionConfigured: true
    },
    brand: {
      avatar: 'assets/system-internal/brand/avatar.png',
      banner: 'assets/system-internal/brand/banner.png',
      description: 'Internal Atlas system brand.',
      defaultTags: ['atlas', 'internal'],
      thumbnailStyle: 'clean-contrasty',
      intro: 'atlas-intro',
      outro: 'atlas-outro',
      voiceProfile: 'atlas-voice',
      metadataTemplate: 'atlas-metadata-v1'
    },
    providers: {
      requiredProviderIds: ['GOOGLE_CLOUD', 'VERTEX_AI', 'GEMINI', 'YOUTUBE', 'ELEVENLABS'],
      configuredProviderIds: ['GOOGLE_CLOUD', 'VERTEX_AI', 'GEMINI', 'YOUTUBE', 'ELEVENLABS']
    },
    credentials: {
      requiredCredentialIds: [
        'GOOGLE_CLOUD_PROJECT',
        'GOOGLE_APPLICATION_CREDENTIALS_JSON',
        'GOOGLE_VERTEX_API_KEY',
        'YOUTUBE_API_KEY',
        'YOUTUBE_CLIENT_ID',
        'YOUTUBE_CLIENT_SECRET',
        'YOUTUBE_REFRESH_TOKEN',
        'ELEVENLABS_API_KEY'
      ],
      configuredCredentialIds: [
        'GOOGLE_CLOUD_PROJECT',
        'GOOGLE_APPLICATION_CREDENTIALS_JSON',
        'GOOGLE_VERTEX_API_KEY',
        'YOUTUBE_API_KEY',
        'YOUTUBE_CLIENT_ID',
        'YOUTUBE_CLIENT_SECRET',
        'YOUTUBE_REFRESH_TOKEN',
        'ELEVENLABS_API_KEY'
      ]
    },
    publishing: {
      platform: 'YouTube',
      visibilityDefault: 'PRIVATE',
      publishMode: 'NONE',
      approvalRequired: true,
      rollbackEnabled: true,
      channelConfigured: true,
      channelId: 'CHANNEL-001'
    },
    storage: {
      assetStorage: 'assets/system-internal/',
      reportStorage: 'assets/system-internal/reports/',
      knowledgeStorage: 'knowledge/system-internal/',
      backupPolicy: 'daily-snapshot'
    },
    knowledge: {
      knowledgePartition: 'knowledge/system-internal/',
      learningEnabled: true,
      promotionPolicy: 'governed-candidate-only',
      retentionPolicy: 'retain-candidates'
    },
    metrics: {
      youtubeMetrics: true,
      qualityMetrics: true,
      businessMetrics: true,
      learningMetrics: true
    }
  });
}

test('empty configuration reports missing business profile and launch blockers', () => {
  const report = validateProductionConfiguration(createProductionConfiguration({}), {});

  assert.equal(report.productionConfigurationHealth, ProductionConfigurationHealthStates.BLOCKED);
  assert.equal(report.missingConfiguration.some(issue => issue.code === 'MISSING_BUSINESS_PROFILE'), true);
  assert.equal(report.missingConfiguration.some(issue => issue.code === 'MISSING_BRANDING'), true);
  assert.equal(report.missingConfiguration.some(issue => issue.code === 'MISSING_PUBLISHING_DEFAULTS'), true);
  assert.equal(report.missingConfiguration.some(issue => issue.code === 'MISSING_ASSET_ROOT'), true);
  assert.equal(report.missingConfiguration.some(issue => issue.code === 'MISSING_KNOWLEDGE_PARTITION'), true);
});

test('complete configuration is launch ready', () => {
  const businessRegistry = new BusinessRegistry();
  const providerRegistry = new ProviderRegistry();
  const credentialRegistry = createCredentialRegistry();
  const config = createCompleteConfig();

  const report = validateProductionConfiguration(config, {
    businessProfile: businessRegistry.getRuntimeBusinessProfile('SYSTEM_INTERNAL'),
    providerRegistry,
    credentialRegistry
  });

  assert.equal(report.productionConfigurationHealth, ProductionConfigurationHealthStates.READY);
  assert.equal(report.launchReadiness, ProductionConfigurationHealthStates.READY);
  assert.equal(report.missingConfiguration.length, 0);
  assert.equal(report.configurationDrift.length, 0);
  assert.equal(report.business.productionReady, true);
});

test('missing configuration is reported', () => {
  const businessRegistry = new BusinessRegistry();
  const providerRegistry = new ProviderRegistry();
  const credentialRegistry = createCredentialRegistry();

  const report = validateProductionConfiguration(createProductionConfiguration({
    business: {
      businessId: 'SYSTEM_INTERNAL',
      displayName: 'Atlas System Internal'
    },
    brand: {
      avatar: 'assets/system-internal/brand/avatar.png'
    },
    publishing: {
      platform: 'YouTube',
      visibilityDefault: 'PRIVATE',
      publishMode: 'NONE',
      approvalRequired: true,
      rollbackEnabled: true
    },
    storage: {
      assetStorage: 'assets/system-internal/',
      reportStorage: 'assets/system-internal/reports/',
      knowledgeStorage: 'knowledge/system-internal/',
      backupPolicy: 'daily-snapshot'
    },
    knowledge: {
      knowledgePartition: 'knowledge/system-internal/',
      learningEnabled: true,
      promotionPolicy: 'governed-candidate-only',
      retentionPolicy: 'retain-candidates'
    },
    metrics: {
      youtubeMetrics: true,
      qualityMetrics: true,
      businessMetrics: true,
      learningMetrics: true
    }
  }), {
    businessProfile: businessRegistry.getRuntimeBusinessProfile('SYSTEM_INTERNAL'),
    providerRegistry,
    credentialRegistry
  });

  assert.equal(report.productionConfigurationHealth, ProductionConfigurationHealthStates.BLOCKED);
  assert.equal(report.missingConfiguration.some(issue => issue.code === 'MISSING_BRANDING'), true);
});

test('drift detection identifies mismatched launch defaults', () => {
  const businessRegistry = new BusinessRegistry();
  const providerRegistry = new ProviderRegistry();
  const credentialRegistry = createCredentialRegistry();

  const report = validateProductionConfiguration(createProductionConfiguration({
    business: {
      businessId: 'SYSTEM_INTERNAL',
      displayName: 'Atlas System Internal',
      productionReady: true,
      brandConfigured: true,
      channelConfigured: true,
      assetRootConfigured: true,
      knowledgePartitionConfigured: true
    },
    brand: {
      avatar: 'assets/system-internal/brand/avatar.png',
      banner: 'assets/system-internal/brand/banner.png',
      description: 'Internal Atlas system brand.',
      defaultTags: ['atlas'],
      thumbnailStyle: 'clean',
      intro: 'atlas-intro',
      outro: 'atlas-outro',
      voiceProfile: 'atlas-voice',
      metadataTemplate: 'atlas-metadata-v1'
    },
    providers: {
      requiredProviderIds: ['GOOGLE_CLOUD', 'VERTEX_AI', 'GEMINI', 'YOUTUBE', 'ELEVENLABS'],
      configuredProviderIds: ['GOOGLE_CLOUD', 'VERTEX_AI', 'GEMINI', 'YOUTUBE', 'ELEVENLABS']
    },
    credentials: {
      requiredCredentialIds: [
        'GOOGLE_CLOUD_PROJECT',
        'GOOGLE_APPLICATION_CREDENTIALS_JSON',
        'GOOGLE_VERTEX_API_KEY',
        'YOUTUBE_API_KEY',
        'YOUTUBE_CLIENT_ID',
        'YOUTUBE_CLIENT_SECRET',
        'YOUTUBE_REFRESH_TOKEN',
        'ELEVENLABS_API_KEY'
      ],
      configuredCredentialIds: [
        'GOOGLE_CLOUD_PROJECT',
        'GOOGLE_APPLICATION_CREDENTIALS_JSON',
        'GOOGLE_VERTEX_API_KEY',
        'YOUTUBE_API_KEY',
        'YOUTUBE_CLIENT_ID',
        'YOUTUBE_CLIENT_SECRET',
        'YOUTUBE_REFRESH_TOKEN',
        'ELEVENLABS_API_KEY'
      ]
    },
    publishing: {
      platform: 'YouTube',
      visibilityDefault: 'PUBLIC',
      publishMode: 'PRIVATE',
      approvalRequired: true,
      rollbackEnabled: true,
      channelConfigured: true,
      channelId: 'CHANNEL-DRIFT'
    },
    storage: {
      assetStorage: 'assets/system-internal-wrong/',
      reportStorage: 'assets/system-internal/reports/',
      knowledgeStorage: 'knowledge/system-internal/',
      backupPolicy: 'daily-snapshot'
    },
    knowledge: {
      knowledgePartition: 'knowledge/system-internal/',
      learningEnabled: true,
      promotionPolicy: 'governed-candidate-only',
      retentionPolicy: 'retain-candidates'
    },
    metrics: {
      youtubeMetrics: true,
      qualityMetrics: true,
      businessMetrics: true,
      learningMetrics: true
    }
  }), {
    businessProfile: businessRegistry.getRuntimeBusinessProfile('SYSTEM_INTERNAL'),
    providerRegistry,
    credentialRegistry
  });

  assert.equal(report.configurationDrift.some(issue => issue.code === 'PUBLISH_MODE_DRIFT'), true);
  assert.equal(report.configurationDrift.some(issue => issue.code === 'ASSET_ROOT_DRIFT'), true);
});

test('dashboard integration exposes production configuration readiness', () => {
  const businessRegistry = new BusinessRegistry();
  const providerRegistry = new ProviderRegistry();
  const credentialRegistry = createCredentialRegistry();
  const manager = new ProductionConfigurationManager({ businessRegistry, providerRegistry, credentialRegistry });
  const dashboard = new CEODashboardService({
    businessRegistry,
    providerRegistry,
    credentialRegistry,
    productionConfigurationManager: manager
  });

  const snapshot = dashboard.generateDashboardSnapshot({
    productionConfiguration: {
      SYSTEM_INTERNAL: createCompleteConfig()
    }
  });

  assert.equal(typeof snapshot.productionConfigurationHealth, 'string');
  assert.equal(Array.isArray(snapshot.configurationWarnings), true);
  assert.equal(Array.isArray(snapshot.missingConfiguration), true);
  assert.equal(typeof snapshot.launchReadiness, 'string');
});

test('operations integration exposes configuration summary and drift', () => {
  const businessRegistry = new BusinessRegistry();
  const providerRegistry = new ProviderRegistry();
  const credentialRegistry = createCredentialRegistry();
  const manager = new ProductionConfigurationManager({ businessRegistry, providerRegistry, credentialRegistry });
  const operationsCenter = new OperationsCenter();

  const snapshot = operationsCenter.snapshot({
    businessRegistry,
    providerRegistry,
    credentialRegistry,
    productionConfigurationManager: manager,
    productionConfiguration: {
      SYSTEM_INTERNAL: createCompleteConfig()
    }
  });

  assert.equal(typeof snapshot.configurationSummary, 'object');
  assert.equal(Array.isArray(snapshot.configurationDrift), true);
  assert.equal(Array.isArray(snapshot.missingProductionItems), true);
});
