import {
  WebhookDispatchErrorCodes,
  WebhookProviderIds,
  WebhookProviderTypes
} from './notification-webhook-provider-contracts.js';
import { NotificationProviderHealthStates } from './notification-domain-contracts.js';
import { LocalDevelopmentWebhookProviderAdapter } from './notification-webhook-provider-local.js';
import { HttpsWebhookProviderAdapter } from './notification-webhook-provider-https.js';

function parseProviderType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === WebhookProviderTypes.LOCAL) return WebhookProviderTypes.LOCAL;
  if (normalized === WebhookProviderTypes.HTTPS) return WebhookProviderTypes.HTTPS;
  if (normalized === WebhookProviderTypes.NOT_CONFIGURED) return WebhookProviderTypes.NOT_CONFIGURED;
  return WebhookProviderTypes.NOT_CONFIGURED;
}

function envBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function createNotConfiguredAdapter() {
  return {
    providerId: WebhookProviderIds.NOT_CONFIGURED,
    providerType: WebhookProviderTypes.NOT_CONFIGURED,
    getHealthSnapshot() {
      return {
        providerId: WebhookProviderIds.NOT_CONFIGURED,
        providerType: WebhookProviderTypes.NOT_CONFIGURED,
        healthState: NotificationProviderHealthStates.UNAVAILABLE,
        warnings: ['Webhook provider is not configured.']
      };
    },
    validateConfiguration() {
      return {
        accepted: false,
        issues: ['Webhook provider is not configured.']
      };
    },
    async sendWebhook() {
      return {
        accepted: false,
        outcome: 'FAILED_TERMINAL',
        retryable: false,
        terminal: true,
        normalizedErrorClass: 'CONFIGURATION_FAILURE',
        metadata: {
          code: WebhookDispatchErrorCodes.PROVIDER_NOT_CONFIGURED,
          message: 'Webhook provider is not configured.'
        }
      };
    }
  };
}

export class NotificationWebhookProviderFactory {
  constructor({
    environment = process.env.NODE_ENV ?? 'development',
    providerType = process.env.ATLAS_WEBHOOK_PROVIDER,
    emergencyDisabled = envBoolean('ATLAS_WEBHOOK_PROVIDER_EMERGENCY_DISABLE', false),
    adapterOptions = {}
  } = {}) {
    this.environment = String(environment).trim().toLowerCase();
    this.providerType = parseProviderType(providerType);
    this.emergencyDisabled = Boolean(emergencyDisabled);
    this.adapterOptions = adapterOptions;
    this.adapter = this.instantiateAdapter();
  }

  instantiateAdapter() {
    if (this.providerType === WebhookProviderTypes.LOCAL) {
      return new LocalDevelopmentWebhookProviderAdapter(this.adapterOptions.local ?? {});
    }
    if (this.providerType === WebhookProviderTypes.HTTPS) {
      return new HttpsWebhookProviderAdapter(this.adapterOptions.https ?? {});
    }
    return createNotConfiguredAdapter();
  }

  getAdapter() {
    return this.adapter;
  }

  getCapabilities() {
    return {
      providerType: this.providerType,
      emergencyDisabled: this.emergencyDisabled,
      environment: this.environment,
      supportsIdempotency: true,
      supportsWebhookSigning: true
    };
  }

  getHealthSnapshot() {
    const base = this.adapter.getHealthSnapshot?.() ?? {
      providerId: this.adapter.providerId,
      providerType: this.adapter.providerType,
      healthState: NotificationProviderHealthStates.UNKNOWN,
      warnings: []
    };

    return {
      ...base,
      emergencyDisabled: this.emergencyDisabled,
      environment: this.environment,
      providerType: this.providerType
    };
  }

  validateStartup() {
    const issues = [];
    const warnings = [];

    if (this.emergencyDisabled) {
      issues.push('Webhook provider is emergency-disabled by policy flag.');
    }

    if (this.providerType === WebhookProviderTypes.NOT_CONFIGURED) {
      issues.push('ATLAS_WEBHOOK_PROVIDER is not configured.');
    }

    const config = this.adapter.validateConfiguration?.() ?? { accepted: true, issues: [] };
    if (!config.accepted) {
      config.issues.forEach((item) => issues.push(item));
    }

    if (this.environment === 'production' && this.providerType === WebhookProviderTypes.LOCAL) {
      issues.push('Local webhook provider is not permitted in production.');
    }

    if (this.environment !== 'production' && this.providerType === WebhookProviderTypes.NOT_CONFIGURED) {
      warnings.push('Webhook provider not configured; dispatch attempts will fail closed.');
    }

    return {
      ready: issues.length === 0,
      failStartup: this.environment === 'production' && issues.length > 0,
      summary: issues.length === 0 ? 'ready' : 'blocked',
      issues,
      warnings,
      providerType: this.providerType,
      emergencyDisabled: this.emergencyDisabled
    };
  }
}
