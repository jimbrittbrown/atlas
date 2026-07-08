import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORTED_ENVIRONMENTS = ['development', 'testing', 'production'];

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENV_FILE_CANDIDATES = [
  join(process.cwd(), '.env'),
  join(MODULE_DIR, '../../../.env')
];

export class SecretManager {
  constructor({
    environment = process.env.NODE_ENV ?? 'development',
    env = process.env,
    providerSchemas = null,
    loadFromEnvFile = env === process.env,
    envFilePath = null
  } = {}) {
    this.environment = this.normalizeEnvironment(environment);
    this.env = env;
    this.bootstrapEnv(envFilePath, loadFromEnvFile);
    this.providerSchemas = providerSchemas ?? this.buildDefaultProviderSchemas();
  }

  bootstrapEnv(envFilePath, loadFromEnvFile) {
    if (!loadFromEnvFile) {
      return;
    }

    const resolvedEnvFilePath = this.resolveEnvFilePath(envFilePath);

    if (!resolvedEnvFilePath) {
      return;
    }

    try {
      const content = readFileSync(resolvedEnvFilePath, 'utf8');
      this.applyEnvContent(content);
    } catch (_error) {
      throw new Error('Failed to load environment file.');
    }
  }

  resolveEnvFilePath(envFilePath) {
    if (typeof envFilePath === 'string' && envFilePath.trim().length > 0) {
      return envFilePath;
    }

    for (const candidate of DEFAULT_ENV_FILE_CANDIDATES) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  applyEnvContent(content) {
    const lines = String(content).split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');

      if (separatorIndex <= 0) {
        throw new Error('Invalid environment file line.');
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();

      if (key.length === 0 || typeof this.env[key] === 'string') {
        continue;
      }

      this.env[key] = this.normalizeEnvValue(rawValue);
    }
  }

  normalizeEnvValue(value) {
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    return value;
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
