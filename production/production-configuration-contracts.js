const ProductionConfigurationHealthStates = Object.freeze({
  READY: 'READY',
  READY_WITH_WARNINGS: 'READY_WITH_WARNINGS',
  BLOCKED: 'BLOCKED'
});

const SupportedConfigurationDomains = Object.freeze([
  'business',
  'brand',
  'providers',
  'credentials',
  'publishing',
  'storage',
  'knowledge',
  'metrics'
]);

const RequiredProviderDefinitions = Object.freeze({
  GOOGLE_CLOUD: Object.freeze(['GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS_JSON']),
  VERTEX_AI: Object.freeze(['GOOGLE_VERTEX_API_KEY', 'GOOGLE_CLOUD_PROJECT']),
  GEMINI: Object.freeze(['GOOGLE_VERTEX_API_KEY']),
  YOUTUBE: Object.freeze(['YOUTUBE_API_KEY', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN']),
  ELEVENLABS: Object.freeze(['ELEVENLABS_API_KEY'])
});

const CanonicalBrandFields = Object.freeze([
  'avatar',
  'banner',
  'description',
  'defaultTags',
  'thumbnailStyle',
  'intro',
  'outro',
  'voiceProfile',
  'metadataTemplate'
]);

const CanonicalPublishingFields = Object.freeze([
  'platform',
  'visibilityDefault',
  'publishMode',
  'approvalRequired',
  'rollbackEnabled'
]);

const CanonicalStorageFields = Object.freeze([
  'assetStorage',
  'reportStorage',
  'knowledgeStorage',
  'backupPolicy'
]);

const CanonicalKnowledgeFields = Object.freeze([
  'knowledgePartition',
  'learningEnabled',
  'promotionPolicy',
  'retentionPolicy'
]);

const CanonicalMetricsFields = Object.freeze([
  'youtubeMetrics',
  'qualityMetrics',
  'businessMetrics',
  'learningMetrics'
]);

const CanonicalBusinessFields = Object.freeze([
  'businessId',
  'displayName',
  'productionReady',
  'brandConfigured',
  'channelConfigured',
  'assetRootConfigured',
  'knowledgePartitionConfigured'
]);

function createBusinessConfiguration(input = {}) {
  return {
    businessId: normalizeString(input.businessId),
    displayName: normalizeString(input.displayName),
    productionReady: Boolean(input.productionReady),
    brandConfigured: Boolean(input.brandConfigured),
    channelConfigured: Boolean(input.channelConfigured),
    assetRootConfigured: Boolean(input.assetRootConfigured),
    knowledgePartitionConfigured: Boolean(input.knowledgePartitionConfigured)
  };
}

function createBrandConfiguration(input = {}) {
  return {
    avatar: normalizeString(input.avatar),
    banner: normalizeString(input.banner),
    description: normalizeString(input.description),
    defaultTags: normalizeStringArray(input.defaultTags),
    thumbnailStyle: normalizeString(input.thumbnailStyle),
    intro: normalizeString(input.intro),
    outro: normalizeString(input.outro),
    voiceProfile: normalizeString(input.voiceProfile),
    metadataTemplate: normalizeString(input.metadataTemplate)
  };
}

function createProviderConfiguration(input = {}) {
  return {
    requiredProviderIds: normalizeStringArray(input.requiredProviderIds),
    configuredProviderIds: normalizeStringArray(input.configuredProviderIds),
    providerHealth: normalizeString(input.providerHealth, 'UNKNOWN'),
    providerSummary: cloneValue(input.providerSummary ?? {})
  };
}

function createCredentialConfiguration(input = {}) {
  return {
    requiredCredentialIds: normalizeStringArray(input.requiredCredentialIds),
    configuredCredentialIds: normalizeStringArray(input.configuredCredentialIds),
    credentialHealth: normalizeString(input.credentialHealth, 'UNKNOWN'),
    credentialSummary: cloneValue(input.credentialSummary ?? {})
  };
}

function createPublishingConfiguration(input = {}) {
  return {
    platform: normalizeString(input.platform),
    visibilityDefault: normalizeString(input.visibilityDefault),
    publishMode: normalizeString(input.publishMode, 'NONE'),
    approvalRequired: Boolean(input.approvalRequired),
    rollbackEnabled: Boolean(input.rollbackEnabled),
    channelConfigured: Boolean(input.channelConfigured),
    channelId: normalizeString(input.channelId)
  };
}

function createStorageConfiguration(input = {}) {
  return {
    assetStorage: normalizeString(input.assetStorage),
    reportStorage: normalizeString(input.reportStorage),
    knowledgeStorage: normalizeString(input.knowledgeStorage),
    backupPolicy: normalizeString(input.backupPolicy)
  };
}

function createKnowledgeConfiguration(input = {}) {
  return {
    knowledgePartition: normalizeString(input.knowledgePartition),
    learningEnabled: Boolean(input.learningEnabled),
    promotionPolicy: normalizeString(input.promotionPolicy),
    retentionPolicy: normalizeString(input.retentionPolicy)
  };
}

function createMetricsConfiguration(input = {}) {
  return {
    youtubeMetrics: Boolean(input.youtubeMetrics),
    qualityMetrics: Boolean(input.qualityMetrics),
    businessMetrics: Boolean(input.businessMetrics),
    learningMetrics: Boolean(input.learningMetrics)
  };
}

function createProductionConfiguration(input = {}) {
  return {
    business: createBusinessConfiguration(input.business ?? input),
    brand: createBrandConfiguration(input.brand ?? input),
    providers: createProviderConfiguration(input.providers ?? input),
    credentials: createCredentialConfiguration(input.credentials ?? input),
    publishing: createPublishingConfiguration(input.publishing ?? input),
    storage: createStorageConfiguration(input.storage ?? input),
    knowledge: createKnowledgeConfiguration(input.knowledge ?? input),
    metrics: createMetricsConfiguration(input.metrics ?? input)
  };
}

function validateProductionConfiguration(configuration = {}, context = {}) {
  const normalized = createProductionConfiguration(configuration);
  const issues = [];
  const businessProfile = context.businessProfile ?? null;
  const providerRegistry = context.providerRegistry ?? null;
  const credentialRegistry = context.credentialRegistry ?? null;

  validateBusinessDomain(normalized, businessProfile, issues);
  validateBrandDomain(normalized, businessProfile, issues);
  validateProvidersDomain(normalized, providerRegistry, credentialRegistry, issues);
  validateCredentialsDomain(normalized, providerRegistry, credentialRegistry, issues);
  validatePublishingDomain(normalized, businessProfile, issues);
  validateStorageDomain(normalized, businessProfile, issues);
  validateKnowledgeDomain(normalized, businessProfile, issues);
  validateMetricsDomain(normalized, businessProfile, issues);

  const missingConfiguration = issues.filter(issue => issue.severity === 'BLOCKED');
  const configurationWarnings = issues.filter(issue => issue.severity === 'WARNING');
  const configurationDrift = issues.filter(issue => issue.category === 'drift');
  const productionConfigurationHealth = resolveHealth(issues);

  return {
    isValid: productionConfigurationHealth === ProductionConfigurationHealthStates.READY,
    productionConfigurationHealth,
    launchReadiness: productionConfigurationHealth,
    configurationWarnings,
    missingConfiguration,
    configurationDrift,
    issues,
    summary: {
      configuredDomainCount: SupportedConfigurationDomains.filter(domain => isDomainConfigured(normalized, domain)).length,
      missingDomainCount: missingConfiguration.length,
      warningCount: configurationWarnings.length,
      driftCount: configurationDrift.length,
      requiredProviderCount: Object.keys(RequiredProviderDefinitions).length,
      requiredCredentialCount: aggregateRequiredCredentialIds().length
    },
    business: normalized.business,
    brand: normalized.brand,
    providers: normalized.providers,
    credentials: normalized.credentials,
    publishing: normalized.publishing,
    storage: normalized.storage,
    knowledge: normalized.knowledge,
    metrics: normalized.metrics
  };
}

function validateBusinessDomain(configuration, businessProfile, issues) {
  const business = configuration.business;

  if (!businessProfile) {
    issues.push(buildIssue('business', 'businessId', 'MISSING_BUSINESS_PROFILE', 'Missing business profile.', 'BLOCKED'));
    return;
  }

  if (!business.businessId) {
    issues.push(buildIssue('business', 'businessId', 'MISSING_BUSINESS_ID', 'Missing business ID.', 'BLOCKED'));
  }

  if (!business.displayName) {
    issues.push(buildIssue('business', 'displayName', 'MISSING_DISPLAY_NAME', 'Missing business display name.', 'BLOCKED'));
  }

  if (businessProfile.businessId && business.businessId && business.businessId !== businessProfile.businessId) {
    issues.push(buildDriftIssue('business', 'businessId', businessProfile.businessId, business.businessId, 'BUSINESS_ID_MISMATCH', 'Business ID differs from registry profile.'));
  }

  if (businessProfile.displayName && business.displayName && business.displayName !== businessProfile.displayName) {
    issues.push(buildDriftIssue('business', 'displayName', businessProfile.displayName, business.displayName, 'DISPLAY_NAME_MISMATCH', 'Business display name differs from registry profile.'));
  }

  if (businessProfile.assetRoot && !business.assetRootConfigured) {
    issues.push(buildIssue('business', 'assetRootConfigured', 'MISSING_ASSET_ROOT', 'Missing asset root configuration.', 'BLOCKED'));
  }

  if (businessProfile.knowledgePartition && !business.knowledgePartitionConfigured) {
    issues.push(buildIssue('business', 'knowledgePartitionConfigured', 'MISSING_KNOWLEDGE_PARTITION', 'Missing knowledge partition configuration.', 'BLOCKED'));
  }
}

function validateBrandDomain(configuration, businessProfile, issues) {
  const brand = configuration.brand;
  const missingFields = CanonicalBrandFields.filter(field => !hasMeaningfulValue(brand[field]));

  if (missingFields.length > 0) {
    issues.push(buildIssue('brand', missingFields.join(','), 'MISSING_BRANDING', 'Missing branding configuration.', 'BLOCKED'));
  }

  if (businessProfile && businessProfile.brandingProfile && !hasMeaningfulValue(brand.metadataTemplate)) {
    issues.push(buildIssue('brand', 'metadataTemplate', 'MISSING_BRAND_TEMPLATE', 'Missing metadata template for branding.', 'BLOCKED'));
  }
}

function validateProvidersDomain(configuration, providerRegistry, credentialRegistry, issues) {
  const requiredProviderIds = Object.keys(RequiredProviderDefinitions);
  const configuredProviderIds = new Set(configuration.providers.configuredProviderIds);
  const configuredCredentialIdsFromRegistry = resolveConfiguredCredentialIdsFromRegistry(credentialRegistry);

  requiredProviderIds.forEach(providerId => {
    const provider = resolveProvider(providerRegistry, providerId);

    if (!provider) {
      issues.push(buildIssue('providers', providerId, 'MISSING_PROVIDER', `Missing provider ${providerId}.`, 'BLOCKED'));
      return;
    }

    if (provider.status && String(provider.status).toUpperCase() === 'DISABLED') {
      issues.push(buildIssue('providers', providerId, 'DISABLED_PROVIDER', `Provider ${providerId} is disabled.`, 'BLOCKED'));
      return;
    }

    if (provider.health && String(provider.health).toUpperCase() === 'FAILED') {
      issues.push(buildIssue('providers', providerId, 'PROVIDER_HEALTH_FAILED', `Provider ${providerId} health is failed.`, 'BLOCKED'));
      return;
    }

    if (configuredProviderIds.size > 0 && !configuredProviderIds.has(providerId)) {
      issues.push(buildIssue('providers', providerId, 'PROVIDER_NOT_CONFIGURED', `Provider ${providerId} is not configured.`, 'BLOCKED'));
    }

    const missingCredentialIds = RequiredProviderDefinitions[providerId]
      .filter(credentialId => !configuredCredentialIdsFromRegistry.has(credentialId));

    if (missingCredentialIds.length > 0) {
      issues.push(buildIssue('providers', providerId, 'MISSING_CREDENTIALS', `Missing configured credentials for provider ${providerId}.`, 'BLOCKED'));
    }
  });
}

function validateCredentialsDomain(configuration, providerRegistry, credentialRegistry, issues) {
  const requiredCredentialIds = aggregateRequiredCredentialIds();
  const configuredCredentialIds = new Set(configuration.credentials.configuredCredentialIds);
  const configuredCredentialIdsFromRegistry = resolveConfiguredCredentialIdsFromRegistry(credentialRegistry);

  if (!credentialRegistry || typeof credentialRegistry.validateProviderCredentials !== 'function') {
    issues.push(buildIssue('credentials', 'credentialRegistry', 'MISSING_CREDENTIAL_REGISTRY', 'Credential registry is unavailable.', 'BLOCKED'));
    return;
  }

  requiredCredentialIds.forEach(credentialId => {
    if (configuredCredentialIds.size > 0 && !configuredCredentialIds.has(credentialId)) {
      issues.push(buildIssue('credentials', credentialId, 'MISSING_CREDENTIAL', `Missing credential ${credentialId}.`, 'BLOCKED'));
    }
  });

  requiredCredentialIds.forEach(credentialId => {
    if (!configuredCredentialIdsFromRegistry.has(credentialId)) {
      issues.push(buildIssue('credentials', credentialId, 'MISSING_CREDENTIALS', `Missing configured credential ${credentialId}.`, 'BLOCKED'));
    }
  });
}

function validatePublishingDomain(configuration, businessProfile, issues) {
  const publishing = configuration.publishing;
  const missingFields = CanonicalPublishingFields.filter(field => !hasMeaningfulValue(publishing[field]) && field !== 'approvalRequired' && field !== 'rollbackEnabled');

  if (missingFields.length > 0) {
    issues.push(buildIssue('publishing', missingFields.join(','), 'MISSING_PUBLISHING_DEFAULTS', 'Missing publishing defaults.', 'BLOCKED'));
  }

  if (publishing.visibilityDefault !== 'PRIVATE') {
    issues.push(buildIssue('publishing', 'visibilityDefault', 'MISSING_PUBLISHING_DEFAULTS', 'Default production upload visibility must be PRIVATE.', 'BLOCKED'));
  }

  if (String(publishing.publishMode ?? '').toUpperCase() !== 'NONE') {
    issues.push(buildDriftIssue('publishing', 'publishMode', 'NONE', publishing.publishMode, 'PUBLISH_MODE_DRIFT', 'Publishing mode must remain NONE unless explicitly enabled.'));
  }

  if (publishing.approvalRequired !== true) {
    issues.push(buildIssue('publishing', 'approvalRequired', 'MISSING_PUBLISHING_DEFAULTS', 'CEO approval is required before publish.', 'BLOCKED'));
  }

  if (publishing.rollbackEnabled !== true) {
    issues.push(buildIssue('publishing', 'rollbackEnabled', 'MISSING_PUBLISHING_DEFAULTS', 'Rollback support must be enabled.', 'BLOCKED'));
  }

  if (businessProfile && businessProfile.publishingProfile?.platform && publishing.platform && publishing.platform !== businessProfile.publishingProfile.platform) {
    issues.push(buildDriftIssue('publishing', 'platform', businessProfile.publishingProfile.platform, publishing.platform, 'PUBLISHING_PLATFORM_DRIFT', 'Publishing platform differs from business profile.'));
  }
}

function validateStorageDomain(configuration, businessProfile, issues) {
  const storage = configuration.storage;

  if (!hasMeaningfulValue(storage.assetStorage)) {
    issues.push(buildIssue('storage', 'assetStorage', 'MISSING_ASSET_ROOT', 'Missing asset root.', 'BLOCKED'));
  }

  if (!hasMeaningfulValue(storage.reportStorage)) {
    issues.push(buildIssue('storage', 'reportStorage', 'MISSING_REPORT_STORAGE', 'Missing report storage.', 'BLOCKED'));
  }

  if (!hasMeaningfulValue(storage.knowledgeStorage)) {
    issues.push(buildIssue('storage', 'knowledgeStorage', 'MISSING_KNOWLEDGE_PARTITION', 'Missing knowledge partition.', 'BLOCKED'));
  }

  if (!hasMeaningfulValue(storage.backupPolicy)) {
    issues.push(buildIssue('storage', 'backupPolicy', 'MISSING_STORAGE_BACKUP_POLICY', 'Missing storage backup policy.', 'BLOCKED'));
  }

  if (businessProfile && businessProfile.assetRoot && storage.assetStorage && storage.assetStorage !== businessProfile.assetRoot) {
    issues.push(buildDriftIssue('storage', 'assetStorage', businessProfile.assetRoot, storage.assetStorage, 'ASSET_ROOT_DRIFT', 'Asset root differs from business profile.'));
  }
}

function validateKnowledgeDomain(configuration, businessProfile, issues) {
  const knowledge = configuration.knowledge;

  if (!hasMeaningfulValue(knowledge.knowledgePartition)) {
    issues.push(buildIssue('knowledge', 'knowledgePartition', 'MISSING_KNOWLEDGE_PARTITION', 'Missing knowledge partition.', 'BLOCKED'));
  }

  if (businessProfile && businessProfile.knowledgePartition && knowledge.knowledgePartition && knowledge.knowledgePartition !== businessProfile.knowledgePartition) {
    issues.push(buildDriftIssue('knowledge', 'knowledgePartition', businessProfile.knowledgePartition, knowledge.knowledgePartition, 'KNOWLEDGE_PARTITION_DRIFT', 'Knowledge partition differs from business profile.'));
  }
}

function validateMetricsDomain(configuration, businessProfile, issues) {
  const metrics = configuration.metrics;
  const missingFields = CanonicalMetricsFields.filter(field => metrics[field] !== true);

  if (missingFields.length > 0) {
    issues.push(buildIssue('metrics', missingFields.join(','), 'MISSING_METRICS_CONFIGURATION', 'Missing metrics configuration.', 'WARNING'));
  }
}

function resolveHealth(issues) {
  if (issues.some(issue => issue.severity === 'BLOCKED')) {
    return ProductionConfigurationHealthStates.BLOCKED;
  }

  if (issues.some(issue => issue.severity === 'WARNING')) {
    return ProductionConfigurationHealthStates.READY_WITH_WARNINGS;
  }

  return ProductionConfigurationHealthStates.READY;
}

function isDomainConfigured(configuration, domain) {
  const value = configuration[domain];

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.values(value).some(item => Array.isArray(item) ? item.length > 0 : Boolean(item));
}

function aggregateRequiredCredentialIds() {
  return [...new Set(Object.values(RequiredProviderDefinitions).flat())];
}

function resolveProvider(providerRegistry, providerId) {
  if (!providerRegistry) {
    return null;
  }

  if (typeof providerRegistry.getProvider === 'function') {
    try {
      return providerRegistry.getProvider(providerId);
    } catch (_error) {
      return null;
    }
  }

  if (typeof providerRegistry.listProviders === 'function') {
    return providerRegistry.listProviders().find(provider => provider.providerId === providerId) ?? null;
  }

  return null;
}

function buildIssue(domain, field, code, message, severity) {
  return {
    category: domain,
    domain,
    field,
    code,
    message,
    severity,
    expected: null,
    actual: null
  };
}

function buildDriftIssue(domain, field, expected, actual, code, message) {
  return {
    category: 'drift',
    domain,
    field,
    code,
    message,
    severity: 'WARNING',
    expected,
    actual
  };
}

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'boolean') {
    return true;
  }

  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeString(value, fallback = '') {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value).trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(item => normalizeString(item)).filter(item => item.length > 0);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const cloned = {};
  Object.keys(value).forEach(key => {
    cloned[key] = cloneValue(value[key]);
  });

  return cloned;
}

function resolveConfiguredCredentialIdsFromRegistry(credentialRegistry) {
  if (!credentialRegistry || typeof credentialRegistry.listCredentials !== 'function') {
    return new Set();
  }

  return new Set(
    credentialRegistry
      .listCredentials()
      .filter(credential => credential.configured === true)
      .map(credential => credential.credentialId)
      .filter(Boolean)
  );
}

module.exports = {
  ProductionConfigurationHealthStates,
  SupportedConfigurationDomains,
  RequiredProviderDefinitions,
  CanonicalBrandFields,
  CanonicalPublishingFields,
  CanonicalStorageFields,
  CanonicalKnowledgeFields,
  CanonicalMetricsFields,
  CanonicalBusinessFields,
  createBusinessConfiguration,
  createBrandConfiguration,
  createProviderConfiguration,
  createCredentialConfiguration,
  createPublishingConfiguration,
  createStorageConfiguration,
  createKnowledgeConfiguration,
  createMetricsConfiguration,
  createProductionConfiguration,
  validateProductionConfiguration,
  aggregateRequiredCredentialIds,
  resolveConfiguredCredentialIdsFromRegistry,
  cloneValue
};