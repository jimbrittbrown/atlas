const SUPPORTED_ENVIRONMENTS = ['development', 'testing', 'production'];

export class SecretManager {
  constructor({
    environment = process.env.NODE_ENV ?? 'development',
    env = process.env,
    providerSchemas = null
  } = {}) {
    this.environment = this.normalizeEnvironment(environment);
    this.env = env;
    this.providerSchemas = providerSchemas ?? this.buildDefaultProviderSchemas();
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

  buildDefaultProviderSchemas() {
    return {
      elevenlabs: {
        required: ['apiKey'],
        envMap: {
          apiKey: 'ELEVENLABS_API_KEY'
        }
      },
      'google-vertex': {
        required: ['projectId', 'location', 'credentialsJson'],
        envMap: {
          projectId: 'GOOGLE_CLOUD_PROJECT',
          location: 'GOOGLE_CLOUD_LOCATION',
          credentialsJson: 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
        }
      },
      openai: {
        required: ['apiKey'],
        envMap: {
          apiKey: 'OPENAI_API_KEY'
        }
      },
      youtube: {
        required: ['apiKey', 'clientId', 'clientSecret', 'refreshToken'],
        envMap: {
          apiKey: 'YOUTUBE_API_KEY',
          clientId: 'YOUTUBE_CLIENT_ID',
          clientSecret: 'YOUTUBE_CLIENT_SECRET',
          refreshToken: 'YOUTUBE_REFRESH_TOKEN'
        }
      }
    };
  }

  registerProviderSchema(providerId, schema = {}) {
    const normalizedProviderId = this.normalizeProviderId(providerId);
    const required = Array.isArray(schema.required) ? schema.required : [];
    const envMap = typeof schema.envMap === 'object' && schema.envMap !== null
      ? schema.envMap
      : {};

    this.providerSchemas[normalizedProviderId] = {
      required,
      envMap
    };
  }

  hasProvider(providerId) {
    return Boolean(this.providerSchemas[this.normalizeProviderId(providerId)]);
  }

  getProviderSchema(providerId) {
    return this.providerSchemas[this.normalizeProviderId(providerId)] ?? null;
  }

  getSecret({ providerId, secretName, defaultValue = null } = {}) {
    const normalizedProviderId = this.normalizeProviderId(providerId);
    const normalizedSecretName = this.normalizeSecretName(secretName);
    const schema = this.providerSchemas[normalizedProviderId] ?? { required: [], envMap: {} };
    const envKey = schema.envMap[normalizedSecretName] ?? this.buildFallbackEnvKey(normalizedProviderId, normalizedSecretName);
    const value = this.env[envKey];

    if (typeof value !== 'string' || value.trim().length === 0) {
      return {
        providerId: normalizedProviderId,
        secretName: normalizedSecretName,
        envKey,
        configured: false,
        value: defaultValue
      };
    }

    return {
      providerId: normalizedProviderId,
      secretName: normalizedSecretName,
      envKey,
      configured: true,
      value
    };
  }

  getProviderSecrets(providerId) {
    const normalizedProviderId = this.normalizeProviderId(providerId);
    const schema = this.providerSchemas[normalizedProviderId] ?? { required: [], envMap: {} };
    const secretNames = [...new Set([
      ...Object.keys(schema.envMap),
      ...schema.required
    ])].sort((a, b) => a.localeCompare(b));

    const resolvedSecrets = {};
    const missingRequiredSecrets = [];

    for (const secretName of secretNames) {
      const secret = this.getSecret({ providerId: normalizedProviderId, secretName });
      resolvedSecrets[secretName] = secret;

      if (schema.required.includes(secretName) && !secret.configured) {
        missingRequiredSecrets.push({
          providerId: normalizedProviderId,
          secretName,
          envKey: secret.envKey
        });
      }
    }

    return {
      providerId: normalizedProviderId,
      configuredSecrets: resolvedSecrets,
      missingRequiredSecrets
    };
  }

  buildStartupSecretAudit(requiredProviders = []) {
    const normalizedProviders = this.normalizeProviders(requiredProviders);

    return normalizedProviders.map(providerId => {
      const schemaExists = this.hasProvider(providerId);

      if (!schemaExists) {
        return {
          providerId,
          schemaConfigured: false,
          missingRequiredSecrets: [
            {
              providerId,
              secretName: 'PROVIDER_SCHEMA',
              envKey: `${this.normalizeProviderToken(providerId)}_SCHEMA`
            }
          ]
        };
      }

      const providerSecrets = this.getProviderSecrets(providerId);

      return {
        providerId,
        schemaConfigured: true,
        missingRequiredSecrets: providerSecrets.missingRequiredSecrets
      };
    });
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

  normalizeSecretName(secretName) {
    return String(secretName ?? '')
      .trim();
  }

  normalizeProviderToken(providerId) {
    return this.normalizeProviderId(providerId)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'PROVIDER';
  }

  buildFallbackEnvKey(providerId, secretName) {
    const providerToken = this.normalizeProviderToken(providerId);
    const secretToken = this.normalizeSecretName(secretName)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'SECRET';

    return `${providerToken}_${secretToken}`;
  }
}
