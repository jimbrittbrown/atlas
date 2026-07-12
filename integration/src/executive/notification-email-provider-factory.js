import {
  EmailDispatchErrorCodes,
  EmailProviderIds,
  EmailProviderTypes,
  buildEmailProviderContract,
  toHealthState,
  validateDisplayName,
  validateReplyTo
} from './notification-email-provider-contracts.js';
import {
  NotificationProviderHealthStates
} from './notification-domain-contracts.js';
import { LocalDevelopmentEmailProviderAdapter } from './notification-email-provider-local.js';
import { SendGridEmailProviderAdapter } from './notification-email-provider-sendgrid.js';

function boolFlag(value, fallback = false) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function normalizeProviderType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === EmailProviderTypes.LOCAL) return EmailProviderTypes.LOCAL;
  if (normalized === EmailProviderTypes.SENDGRID) return EmailProviderTypes.SENDGRID;
  return EmailProviderTypes.NOT_CONFIGURED;
}

function isProductionLike(environment) {
  const normalized = String(environment ?? '').trim().toLowerCase();
  return normalized === 'production' || normalized === 'staging';
}

class NotConfiguredEmailProviderAdapter {
  constructor({ reason = 'Email provider is not configured.' } = {}) {
    this.reason = reason;
  }

  providerId() {
    return EmailProviderIds.NOT_CONFIGURED;
  }

  providerName() {
    return 'NOT_CONFIGURED';
  }

  providerType() {
    return EmailProviderTypes.NOT_CONFIGURED;
  }

  validateConfiguration() {
    return {
      accepted: false,
      issues: [this.reason],
      code: EmailDispatchErrorCodes.PROVIDER_NOT_CONFIGURED
    };
  }

  healthReport() {
    return {
      providerId: this.providerId(),
      providerName: this.providerName(),
      mode: 'DISABLED',
      healthState: NotificationProviderHealthStates.NOT_CONFIGURED,
      issues: [this.reason],
      contract: buildEmailProviderContract({
        providerId: this.providerId(),
        name: this.providerName(),
        healthState: NotificationProviderHealthStates.NOT_CONFIGURED,
        supportsIdempotency: false
      })
    };
  }

  classifyError() {
    return {
      normalizedErrorClass: 'CONFIGURATION_FAILURE',
      retryable: false,
      terminal: true,
      outcome: 'FAILED_TERMINAL'
    };
  }

  normalizeProviderResult() {
    return {
      accepted: false,
      providerMessageId: null,
      providerRequestRef: null,
      outcome: 'FAILED_TERMINAL',
      normalizedErrorClass: 'CONFIGURATION_FAILURE',
      retryable: false,
      terminal: true,
      providerStatusCode: 503,
      occurredAt: new Date().toISOString(),
      metadata: { reason: this.reason }
    };
  }

  sendEmail(request = {}) {
    return this.normalizeProviderResult({ request });
  }
}

export function createNotificationEmailProvider({
  storageProvider,
  now,
  fetchImpl = globalThis.fetch,
  environment = process.env.NODE_ENV ?? 'development',
  providerType = process.env.ATLAS_EMAIL_PROVIDER ?? 'not_configured',
  allowLocalInProduction = boolFlag(process.env.ATLAS_EMAIL_ALLOW_LOCAL_IN_PRODUCTION, false),
  emergencyGlobalDisable = boolFlag(process.env.ATLAS_EMAIL_GLOBAL_EMERGENCY_DISABLE, false),
  emergencyProviderDisable = boolFlag(process.env.ATLAS_EMAIL_PROVIDER_EMERGENCY_DISABLE, false)
} = {}) {
  const selectedType = normalizeProviderType(providerType);
  const emergencyDisabled = emergencyGlobalDisable || emergencyProviderDisable;
  const warnings = [];

  if (emergencyDisabled) {
    warnings.push('Email provider is disabled by emergency switch.');
    return {
      provider: new NotConfiguredEmailProviderAdapter({ reason: 'Email provider disabled by emergency switch.' }),
      type: EmailProviderTypes.NOT_CONFIGURED,
      selectedExplicitly: true,
      blocked: true,
      status: NotificationProviderHealthStates.UNAVAILABLE,
      warnings,
      startupReadiness: {
        ready: false,
        failStartup: isProductionLike(environment),
        summary: 'Email provider disabled by emergency switch.',
        checks: {
          providerSelected: { ready: true, issues: [] },
          providerConfiguration: { ready: false, issues: ['Email provider disabled by emergency switch.'] },
          senderConfiguration: { ready: false, issues: ['Email provider disabled by emergency switch.'] },
          productionPolicy: { ready: false, issues: ['Email provider disabled by emergency switch.'] }
        }
      }
    };
  }

  if (selectedType === EmailProviderTypes.LOCAL) {
    const provider = new LocalDevelopmentEmailProviderAdapter({ storageProvider, now });
    const productionBlocked = isProductionLike(environment) && !allowLocalInProduction;
    if (productionBlocked) {
      warnings.push('Local non-delivering adapter is blocked in production/staging unless ATLAS_EMAIL_ALLOW_LOCAL_IN_PRODUCTION=true.');
    }

    return {
      provider,
      type: EmailProviderTypes.LOCAL,
      selectedExplicitly: true,
      blocked: productionBlocked,
      status: productionBlocked ? NotificationProviderHealthStates.NOT_CONFIGURED : NotificationProviderHealthStates.DEGRADED,
      warnings,
      startupReadiness: {
        ready: !productionBlocked,
        failStartup: productionBlocked,
        summary: productionBlocked
          ? 'Local adapter is not allowed in production/staging without explicit override.'
          : 'Local non-delivering adapter ready.',
        checks: {
          providerSelected: { ready: true, issues: [] },
          providerConfiguration: { ready: true, issues: [] },
          senderConfiguration: { ready: true, issues: [] },
          productionPolicy: {
            ready: !productionBlocked,
            issues: productionBlocked ? ['Local adapter blocked in production/staging.'] : []
          }
        }
      }
    };
  }

  if (selectedType === EmailProviderTypes.SENDGRID) {
    const provider = new SendGridEmailProviderAdapter({ now, fetchImpl });
    const config = provider.validateConfiguration();

    const senderChecks = [];
    const senderDisplay = validateDisplayName(process.env.ATLAS_EMAIL_SENDER_DISPLAY_NAME ?? '');
    if (!senderDisplay.valid) senderChecks.push('ATLAS_EMAIL_SENDER_DISPLAY_NAME is invalid.');

    const replyTo = validateReplyTo(process.env.ATLAS_EMAIL_REPLY_TO ?? null);
    if (!replyTo.accepted) senderChecks.push(...replyTo.errors.map((item) => `ATLAS_EMAIL_REPLY_TO invalid: ${item}`));

    const checks = {
      providerSelected: { ready: true, issues: [] },
      providerConfiguration: {
        ready: config.accepted,
        issues: [...config.issues]
      },
      senderConfiguration: {
        ready: senderChecks.length === 0,
        issues: senderChecks
      },
      productionPolicy: { ready: true, issues: [] }
    };

    const failed = Object.values(checks).filter((entry) => entry.ready !== true);

    return {
      provider,
      type: EmailProviderTypes.SENDGRID,
      selectedExplicitly: true,
      blocked: failed.length > 0,
      status: failed.length === 0 ? NotificationProviderHealthStates.HEALTHY : NotificationProviderHealthStates.DEGRADED,
      warnings,
      startupReadiness: {
        ready: failed.length === 0,
        failStartup: isProductionLike(environment) && failed.length > 0,
        summary: failed.length === 0
          ? 'Email provider ready.'
          : failed.map((entry) => entry.issues.join('; ')).join(' | '),
        checks
      }
    };
  }

  warnings.push(`Unsupported email provider '${providerType}'.`);
  return {
    provider: new NotConfiguredEmailProviderAdapter({ reason: `Unsupported email provider '${providerType}'.` }),
    type: EmailProviderTypes.NOT_CONFIGURED,
    selectedExplicitly: true,
    blocked: true,
    status: NotificationProviderHealthStates.NOT_CONFIGURED,
    warnings,
    startupReadiness: {
      ready: false,
      failStartup: isProductionLike(environment),
      summary: `Unsupported email provider '${providerType}'.`,
      checks: {
        providerSelected: { ready: false, issues: [`Unsupported email provider '${providerType}'.`] },
        providerConfiguration: { ready: false, issues: ['Email provider type is unsupported.'] },
        senderConfiguration: { ready: false, issues: ['Sender configuration cannot be validated without a provider.'] },
        productionPolicy: { ready: false, issues: ['Unsupported provider in active environment.'] }
      }
    }
  };
}

export class NotificationEmailProviderFactory {
  constructor(options = {}) {
    this.options = options;
    this.selection = createNotificationEmailProvider(options);
  }

  getSelection() {
    return this.selection;
  }

  getAdapter() {
    return this.selection.provider;
  }

  getStartupReadiness() {
    return this.selection.startupReadiness;
  }

  validateStartup() {
    return this.selection.startupReadiness;
  }

  getHealthStatus() {
    const providerHealth = this.selection.provider.healthReport?.() ?? {};
    return {
      providerType: this.selection.type,
      blocked: this.selection.blocked,
      status: toHealthState(this.selection.status),
      warnings: this.selection.warnings ?? [],
      providerHealth,
      startupReadiness: this.selection.startupReadiness,
      contract: providerHealth.contract ?? buildEmailProviderContract({
        providerId: providerHealth.providerId ?? EmailProviderIds.NOT_CONFIGURED,
        name: providerHealth.providerName ?? 'UNKNOWN',
        healthState: toHealthState(providerHealth.healthState ?? this.selection.status),
        supportsIdempotency: true
      })
    };
  }

  buildProviderStatus() {
    const health = this.getHealthStatus();
    return {
      providerId: health.providerHealth.providerId ?? EmailProviderIds.NOT_CONFIGURED,
      providerName: health.providerHealth.providerName ?? 'UNKNOWN',
      healthState: health.status,
      blocked: health.blocked,
      warnings: health.warnings,
      capabilities: health.contract.capabilities
    };
  }
}
