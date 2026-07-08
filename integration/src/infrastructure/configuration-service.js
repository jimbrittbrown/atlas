import { SecretManager } from './secret-manager.js';

const SUPPORTED_ENVIRONMENTS = ['development', 'testing', 'production'];
const DEFAULT_ASSET_ROOT = '/var/lib/atlas/assets';
const ASSET_PATHS = {
  audio: 'audio',
  images: 'images',
  video: 'video',
  reports: 'reports',
  archive: 'archive'
};

export class ConfigurationService {
  constructor({
    environment = process.env.NODE_ENV ?? 'development',
    secretManager = null,
    providerConfigurations = null,
    featureFlags = null,
    assetRoot = process.env.ATLAS_ASSET_ROOT ?? DEFAULT_ASSET_ROOT
  } = {}) {
    this.environment = this.normalizeEnvironment(environment);
    this.secretManager = secretManager ?? new SecretManager({ environment: this.environment });
    this.featureFlags = featureFlags ?? this.buildDefaultFeatureFlags();
    this.providerConfigurations = providerConfigurations ?? this.buildDefaultProviderConfigurations();
    this.assetRoot = this.normalizeAssetRoot(assetRoot);
  }

  normalizeEnvironment(environment) {
    const normalized = String(environment).toLowerCase().trim();

    if (!SUPPORTED_ENVIRONMENTS.includes(normalized)) {
      return 'development';
    }

    return normalized;
  }

  getEnvironment() {
    return this.environment;
  }

  getAssetRoot() {
    return this.assetRoot;
  }

  getAssetPath(assetType) {
    const normalizedAssetType = String(assetType ?? '').toLowerCase().trim();
    const pathSegment = ASSET_PATHS[normalizedAssetType];

    if (!pathSegment) {
      return null;
    }

    return `${this.assetRoot}/${pathSegment}`;
  }

  getAssetPaths() {
    return Object.fromEntries(
      Object.keys(ASSET_PATHS)
        .sort((a, b) => a.localeCompare(b))
        .map(assetType => [assetType, this.getAssetPath(assetType)])
    );
  }

  buildDefaultFeatureFlags() {
    return {
      enableProviderFallback: this.environment !== 'testing',
      enableProviderShadowMode: this.environment === 'development',
      enableStrictStartupValidation: this.environment === 'production'
    };
  }

  buildDefaultProviderConfigurations() {
    const sharedRuntime = this.resolveEnvironmentRuntimeDefaults();

    return {
      elevenlabs: {
        endpoint: 'https://api.elevenlabs.io/v1/text-to-speech',
        retryPolicy: { maxRetries: sharedRuntime.maxRetries, baseDelayMs: sharedRuntime.baseDelayMs },
        timeoutMs: sharedRuntime.timeoutMs,
        rateLimit: { requestsPerMinute: sharedRuntime.requestsPerMinute },
        requiredSecrets: ['apiKey']
      },
      'google-vertex': {
        endpoint: 'https://aiplatform.googleapis.com/v1',
        retryPolicy: { maxRetries: sharedRuntime.maxRetries, baseDelayMs: sharedRuntime.baseDelayMs },
        timeoutMs: sharedRuntime.timeoutMs,
        rateLimit: { requestsPerMinute: sharedRuntime.requestsPerMinute },
        requiredSecrets: ['projectId', 'location', 'credentialsJson']
      },
      openai: {
        endpoint: 'https://api.openai.com/v1/images',
        retryPolicy: { maxRetries: sharedRuntime.maxRetries, baseDelayMs: sharedRuntime.baseDelayMs },
        timeoutMs: sharedRuntime.timeoutMs,
        rateLimit: { requestsPerMinute: sharedRuntime.requestsPerMinute },
        requiredSecrets: ['apiKey']
      },
      youtube: {
        endpoint: 'https://www.googleapis.com/youtube/v3',
        retryPolicy: { maxRetries: sharedRuntime.maxRetries, baseDelayMs: sharedRuntime.baseDelayMs },
        timeoutMs: sharedRuntime.timeoutMs,
        rateLimit: { requestsPerMinute: sharedRuntime.requestsPerMinute },
        requiredSecrets: ['apiKey', 'clientId', 'clientSecret', 'refreshToken']
      }
    };
  }

  resolveEnvironmentRuntimeDefaults() {
    if (this.environment === 'production') {
      return {
        maxRetries: 3,
        baseDelayMs: 250,
        timeoutMs: 15000,
        requestsPerMinute: 120
      };
    }

    if (this.environment === 'testing') {
      return {
        maxRetries: 0,
        baseDelayMs: 1,
        timeoutMs: 2500,
        requestsPerMinute: 20
      };
    }

    return {
      maxRetries: 1,
      baseDelayMs: 100,
      timeoutMs: 8000,
      requestsPerMinute: 60
    };
  }

  registerProviderConfiguration(providerId, configuration = {}) {
    const normalizedProviderId = this.normalizeProviderId(providerId);
    const normalizedConfiguration = this.normalizeProviderConfiguration(configuration);

    this.providerConfigurations[normalizedProviderId] = normalizedConfiguration;

    if (!this.secretManager.hasProvider(normalizedProviderId)) {
      this.secretManager.registerProviderSchema(normalizedProviderId, {
        required: normalizedConfiguration.requiredSecrets,
        envMap: {}
      });
    }
  }

  getProviderConfiguration(providerId) {
    const normalizedProviderId = this.normalizeProviderId(providerId);
    const configuration = this.providerConfigurations[normalizedProviderId] ?? null;

    if (!configuration) {
      return null;
    }

    const secrets = this.secretManager.getProviderSecrets(normalizedProviderId);

    return {
      providerId: normalizedProviderId,
      endpoint: configuration.endpoint,
      retryPolicy: configuration.retryPolicy,
      timeoutMs: configuration.timeoutMs,
      rateLimit: configuration.rateLimit,
      requiredSecrets: configuration.requiredSecrets,
      secrets,
      featureFlags: this.featureFlags
    };
  }

  getProviderEndpoint(providerId) {
    return this.getProviderConfiguration(providerId)?.endpoint ?? null;
  }

  getProviderRetryPolicy(providerId) {
    return this.getProviderConfiguration(providerId)?.retryPolicy ?? null;
  }

  getProviderTimeoutMs(providerId) {
    return this.getProviderConfiguration(providerId)?.timeoutMs ?? null;
  }

  getProviderRateLimit(providerId) {
    return this.getProviderConfiguration(providerId)?.rateLimit ?? null;
  }

  isFeatureEnabled(flagName) {
    return Boolean(this.featureFlags[String(flagName ?? '')]);
  }

  validateStartup({ requiredProviders = [] } = {}) {
    const normalizedRequiredProviders = this.normalizeProviders(requiredProviders);
    const missingRequiredProviders = normalizedRequiredProviders
      .filter(providerId => !this.providerConfigurations[providerId]);
    const secretAudit = this.secretManager.buildStartupSecretAudit(normalizedRequiredProviders);
    const missingSecrets = secretAudit.flatMap(audit => audit.missingRequiredSecrets);
    const invalidConfiguration = this.collectInvalidConfiguration(normalizedRequiredProviders);
    const blocked = (
      missingRequiredProviders.length > 0
      || missingSecrets.length > 0
      || invalidConfiguration.length > 0
    );

    return {
      environment: this.environment,
      status: blocked ? 'BLOCKED' : 'READY',
      requiredProviders: normalizedRequiredProviders,
      missingRequiredProviders,
      missingSecrets,
      invalidConfiguration,
      validatedAt: 'VALIDATED_AT_PLACEHOLDER'
    };
  }

  generateProductionHealthReport({ requiredProviders = [] } = {}) {
    const startupValidation = this.validateStartup({ requiredProviders });
    const providerHealth = startupValidation.requiredProviders.map(providerId => {
      const configuration = this.providerConfigurations[providerId] ?? null;

      if (!configuration) {
        return {
          providerId,
          status: 'MISSING_PROVIDER_CONFIGURATION',
          endpointConfigured: false,
          retryPolicyHealthy: false,
          timeoutHealthy: false,
          rateLimitHealthy: false,
          missingSecretCount: startupValidation.missingSecrets.filter(secret => secret.providerId === providerId).length
        };
      }

      const invalidEntries = this.collectInvalidProviderConfiguration(providerId, configuration);
      const missingSecretCount = startupValidation.missingSecrets
        .filter(secret => secret.providerId === providerId)
        .length;

      return {
        providerId,
        status: (invalidEntries.length === 0 && missingSecretCount === 0) ? 'HEALTHY' : 'DEGRADED',
        endpointConfigured: typeof configuration.endpoint === 'string' && configuration.endpoint.trim().length > 0,
        retryPolicyHealthy: this.isRetryPolicyValid(configuration.retryPolicy),
        timeoutHealthy: this.isTimeoutValid(configuration.timeoutMs),
        rateLimitHealthy: this.isRateLimitValid(configuration.rateLimit),
        missingSecretCount
      };
    });

    const overallStatus = startupValidation.status === 'READY' ? 'HEALTHY' : 'BLOCKED';

    return {
      environment: this.environment,
      overallStatus,
      startupValidation,
      providerHealth,
      featureFlags: this.featureFlags,
      generatedAt: 'HEALTH_REPORT_GENERATED_AT_PLACEHOLDER'
    };
  }

  collectInvalidConfiguration(requiredProviders) {
    return requiredProviders.flatMap(providerId => {
      const configuration = this.providerConfigurations[providerId];

      if (!configuration) {
        return [];
      }

      return this.collectInvalidProviderConfiguration(providerId, configuration);
    });
  }

  collectInvalidProviderConfiguration(providerId, configuration) {
    const invalidEntries = [];

    if (typeof configuration.endpoint !== 'string' || configuration.endpoint.trim().length === 0) {
      invalidEntries.push({ providerId, field: 'endpoint', issue: 'MISSING_ENDPOINT' });
    }

    if (!this.isRetryPolicyValid(configuration.retryPolicy)) {
      invalidEntries.push({ providerId, field: 'retryPolicy', issue: 'INVALID_RETRY_POLICY' });
    }

    if (!this.isTimeoutValid(configuration.timeoutMs)) {
      invalidEntries.push({ providerId, field: 'timeoutMs', issue: 'INVALID_TIMEOUT' });
    }

    if (!this.isRateLimitValid(configuration.rateLimit)) {
      invalidEntries.push({ providerId, field: 'rateLimit', issue: 'INVALID_RATE_LIMIT' });
    }

    return invalidEntries;
  }

  isRetryPolicyValid(retryPolicy) {
    const maxRetries = retryPolicy?.maxRetries;
    const baseDelayMs = retryPolicy?.baseDelayMs;

    return Number.isInteger(maxRetries)
      && maxRetries >= 0
      && Number.isInteger(baseDelayMs)
      && baseDelayMs >= 0;
  }

  isTimeoutValid(timeoutMs) {
    return Number.isInteger(timeoutMs) && timeoutMs > 0;
  }

  isRateLimitValid(rateLimit) {
    return Number.isInteger(rateLimit?.requestsPerMinute) && rateLimit.requestsPerMinute > 0;
  }

  normalizeProviders(providers) {
    if (!Array.isArray(providers) || providers.length === 0) {
      return [];
    }

    return providers
      .map(provider => this.normalizeProviderId(provider))
      .filter(provider => provider.length > 0)
      .sort((a, b) => a.localeCompare(b));
  }

  normalizeProviderId(providerId) {
    return String(providerId ?? '')
      .toLowerCase()
      .trim();
  }

  normalizeAssetRoot(assetRoot) {
    const normalized = String(assetRoot ?? '').trim();

    if (normalized.length === 0) {
      return DEFAULT_ASSET_ROOT;
    }

    return normalized.replace(/\/+$/g, '');
  }

  normalizeProviderConfiguration(configuration) {
    return {
      endpoint: configuration.endpoint ?? '',
      retryPolicy: {
        maxRetries: Number.parseInt(String(configuration.retryPolicy?.maxRetries ?? 0), 10),
        baseDelayMs: Number.parseInt(String(configuration.retryPolicy?.baseDelayMs ?? 0), 10)
      },
      timeoutMs: Number.parseInt(String(configuration.timeoutMs ?? 0), 10),
      rateLimit: {
        requestsPerMinute: Number.parseInt(String(configuration.rateLimit?.requestsPerMinute ?? 0), 10)
      },
      requiredSecrets: Array.isArray(configuration.requiredSecrets)
        ? configuration.requiredSecrets.map(secret => String(secret).trim()).filter(secret => secret.length > 0)
        : []
    };
  }
}
