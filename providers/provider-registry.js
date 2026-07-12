const {
  ProviderHealthStates,
  ProviderStatuses,
  normalizeProviderHealth,
  createProviderRecord,
  validateProviderRecord,
  createProviderValidationResult
} = require('./provider-registry-contracts.js');

const DEFAULT_PROVIDERS = [
  {
    providerId: 'GOOGLE_CLOUD',
    displayName: 'Google Cloud',
    category: 'CLOUD',
    status: 'ENABLED',
    environment: 'production',
    health: 'UNKNOWN',
    capabilities: ['CLOUD_RUNTIME', 'CREDENTIAL_HOSTING'],
    requiredCredentials: ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS_JSON'],
    quotaStatus: {
      status: 'UNKNOWN',
      warnings: []
    },
    lastHealthCheck: null
  },
  {
    providerId: 'VERTEX_AI',
    displayName: 'Vertex AI',
    category: 'MODEL',
    status: 'ENABLED',
    environment: 'production',
    health: 'UNKNOWN',
    capabilities: ['TEXT_GENERATION', 'IMAGE_GENERATION', 'VIDEO_GENERATION'],
    requiredCredentials: ['GOOGLE_VERTEX_API_KEY', 'GOOGLE_CLOUD_PROJECT'],
    quotaStatus: {
      status: 'UNKNOWN',
      warnings: []
    },
    lastHealthCheck: null
  },
  {
    providerId: 'GEMINI',
    displayName: 'Gemini',
    category: 'MODEL',
    status: 'ENABLED',
    environment: 'production',
    health: 'UNKNOWN',
    capabilities: ['TEXT_GENERATION', 'REASONING'],
    requiredCredentials: ['GOOGLE_VERTEX_API_KEY'],
    quotaStatus: {
      status: 'UNKNOWN',
      warnings: []
    },
    lastHealthCheck: null
  },
  {
    providerId: 'YOUTUBE',
    displayName: 'YouTube',
    category: 'PUBLISHING',
    status: 'ENABLED',
    environment: 'production',
    health: 'UNKNOWN',
    capabilities: ['PRIVATE_PUBLISHING', 'THUMBNAIL_UPLOAD'],
    requiredCredentials: ['YOUTUBE_API_KEY', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'],
    quotaStatus: {
      status: 'UNKNOWN',
      warnings: []
    },
    lastHealthCheck: null
  },
  {
    providerId: 'ELEVENLABS',
    displayName: 'ElevenLabs',
    category: 'VOICE',
    status: 'ENABLED',
    environment: 'production',
    health: 'UNKNOWN',
    capabilities: ['VOICE_SYNTHESIS'],
    requiredCredentials: ['ELEVENLABS_API_KEY'],
    quotaStatus: {
      status: 'UNKNOWN',
      warnings: []
    },
    lastHealthCheck: null
  }
];

class ProviderRegistry {
  constructor({ environment = 'production', initialProviders = null } = {}) {
    this.environment = String(environment).toLowerCase().trim();
    this.providers = new Map();

    const providers = Array.isArray(initialProviders) ? initialProviders : DEFAULT_PROVIDERS;
    providers.forEach(provider => {
      this.registerProvider(provider);
    });
  }

  registerProvider(providerInput = {}) {
    const provider = createProviderRecord(providerInput);
    const validation = validateProviderRecord(provider);

    if (!validation.isValid) {
      throw new Error(`Invalid provider: ${validation.issues.map(issue => issue.issue).join(', ')}`);
    }

    if (this.providers.has(provider.providerId)) {
      throw new Error(`Provider already registered: ${provider.providerId}`);
    }

    this.providers.set(provider.providerId, Object.freeze({ ...provider }));

    return this.providers.get(provider.providerId);
  }

  hasProvider(providerId) {
    return this.providers.has(String(providerId ?? '').toUpperCase().trim());
  }

  getProvider(providerId) {
    const normalized = String(providerId ?? '').toUpperCase().trim();
    const provider = this.providers.get(normalized);

    if (!provider) {
      throw new Error(`Unknown provider: ${normalized}`);
    }

    return provider;
  }

  listProviders() {
    return [...this.providers.values()];
  }

  getProviderCount() {
    return this.providers.size;
  }

  updateProviderStatus(providerId, updates = {}) {
    const provider = this.getProvider(providerId);
    const nextProvider = createProviderRecord({
      ...provider,
      ...updates
    });
    const validation = validateProviderRecord(nextProvider);

    if (!validation.isValid) {
      throw new Error(`Invalid provider update: ${validation.issues.map(issue => issue.issue).join(', ')}`);
    }

    this.providers.set(nextProvider.providerId, Object.freeze({ ...nextProvider }));

    return this.providers.get(nextProvider.providerId);
  }

  validateProviderConfiguration({
    providerId,
    environment = this.environment,
    credentialRegistry = null,
    requiredScopes = []
  } = {}) {
    const normalizedProviderId = String(providerId ?? '').toUpperCase().trim();

    if (!this.hasProvider(normalizedProviderId)) {
      return createProviderValidationResult({
        providerId: normalizedProviderId,
        isValid: false,
        code: 'UNKNOWN_PROVIDER',
        message: `Unknown provider: ${normalizedProviderId}`
      });
    }

    const provider = this.getProvider(normalizedProviderId);
    const normalizedEnvironment = String(environment ?? this.environment).toLowerCase().trim();

    if (provider.status === ProviderStatuses.DISABLED) {
      return createProviderValidationResult({
        providerId: normalizedProviderId,
        isValid: false,
        code: 'DISABLED_PROVIDER',
        message: `Provider ${normalizedProviderId} is disabled.`
      });
    }

    if (provider.environment !== normalizedEnvironment) {
      return createProviderValidationResult({
        providerId: normalizedProviderId,
        isValid: false,
        code: 'ENVIRONMENT_MISMATCH',
        message: `Provider ${normalizedProviderId} is configured for ${provider.environment}, requested ${normalizedEnvironment}.`
      });
    }

    if (!credentialRegistry || typeof credentialRegistry.validateProviderCredentials !== 'function') {
      return createProviderValidationResult({
        providerId: normalizedProviderId,
        isValid: false,
        code: 'INVALID_CONFIGURATION',
        message: `Credential registry unavailable for provider ${normalizedProviderId}.`
      });
    }

    const credentialValidation = credentialRegistry.validateProviderCredentials({
      providerId: normalizedProviderId,
      environment: normalizedEnvironment,
      requiredCredentials: provider.requiredCredentials,
      requiredScopes
    });

    if (!credentialValidation.isValid) {
      return createProviderValidationResult({
        providerId: normalizedProviderId,
        isValid: false,
        code: credentialValidation.code,
        message: credentialValidation.message,
        details: credentialValidation.details
      });
    }

    return createProviderValidationResult({
      providerId: normalizedProviderId,
      isValid: true,
      code: null,
      message: null,
      details: {
        environment: normalizedEnvironment,
        health: provider.health,
        quotaStatus: provider.quotaStatus?.status ?? 'UNKNOWN'
      }
    });
  }

  getProviderSummary({
    environment = this.environment,
    credentialRegistry = null
  } = {}) {
    const normalizedEnvironment = String(environment ?? this.environment).toLowerCase().trim();
    const providers = this.listProviders().filter(provider => provider.environment === normalizedEnvironment);

    const configuredProviders = providers.filter(provider => {
      if (!credentialRegistry || typeof credentialRegistry.validateProviderCredentials !== 'function') {
        return false;
      }

      const result = credentialRegistry.validateProviderCredentials({
        providerId: provider.providerId,
        environment: normalizedEnvironment,
        requiredCredentials: provider.requiredCredentials
      });

      return result.code !== 'MISSING_CREDENTIALS';
    }).length;

    const healthyProviders = providers.filter(provider => provider.health === ProviderHealthStates.HEALTHY).length;
    const productionReadyProviders = providers.filter(provider => {
      if (provider.status !== ProviderStatuses.ENABLED) {
        return false;
      }

      if (!(provider.health === ProviderHealthStates.HEALTHY || provider.health === ProviderHealthStates.WARNING)) {
        return false;
      }

      if (!credentialRegistry || typeof credentialRegistry.validateProviderCredentials !== 'function') {
        return false;
      }

      const result = credentialRegistry.validateProviderCredentials({
        providerId: provider.providerId,
        environment: normalizedEnvironment,
        requiredCredentials: provider.requiredCredentials
      });

      return result.isValid;
    }).length;

    const failedProviders = providers
      .filter(provider => provider.health === ProviderHealthStates.FAILED)
      .map(provider => provider.providerId);

    const quotaWarnings = providers
      .flatMap(provider => {
        const warnings = Array.isArray(provider.quotaStatus?.warnings) ? provider.quotaStatus.warnings : [];

        return warnings.map(warning => ({
          providerId: provider.providerId,
          warning
        }));
      });

    return {
      environment: normalizedEnvironment,
      providerCount: providers.length,
      configuredProviders,
      healthyProviders,
      productionReadyProviders,
      failedProviders,
      quotaWarnings
    };
  }

  getHealth() {
    const providers = this.listProviders();

    if (providers.length === 0) {
      return ProviderHealthStates.UNKNOWN;
    }

    if (providers.some(provider => provider.health === ProviderHealthStates.FAILED)) {
      return ProviderHealthStates.FAILED;
    }

    if (providers.some(provider => provider.health === ProviderHealthStates.DEGRADED)) {
      return ProviderHealthStates.DEGRADED;
    }

    if (providers.some(provider => provider.health === ProviderHealthStates.WARNING)) {
      return ProviderHealthStates.WARNING;
    }

    if (providers.every(provider => provider.health === ProviderHealthStates.HEALTHY)) {
      return ProviderHealthStates.HEALTHY;
    }

    return normalizeProviderHealth('UNKNOWN');
  }
}

module.exports = {
  ProviderRegistry
};
