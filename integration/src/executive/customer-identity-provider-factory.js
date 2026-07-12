import { IdentityProviderStatuses } from './customer-identity-provider-contracts.js';
import { LocalDevelopmentIdentityProviderAdapter } from './customer-identity-provider-local.js';
import { OidcIdentityProviderAdapter } from './customer-identity-provider-oidc.js';

const ProviderRolloutStages = Object.freeze({
  DISABLED: 'disabled',
  EXPERIMENTAL: 'experimental',
  INTERNAL: 'internal',
  BETA: 'beta',
  PRODUCTION: 'production'
});

function boolFlag(value, fallback = false) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}

function normalizeRolloutStage(value, fallback = ProviderRolloutStages.DISABLED) {
  const text = String(value ?? '').trim().toLowerCase();
  const supported = new Set(Object.values(ProviderRolloutStages));
  return supported.has(text) ? text : fallback;
}

function rolloutIsEnabled(stage) {
  return stage !== ProviderRolloutStages.DISABLED;
}

function rolloutAudience(stage) {
  switch (stage) {
    case ProviderRolloutStages.EXPERIMENTAL:
      return 'EXPERIMENTAL';
    case ProviderRolloutStages.INTERNAL:
      return 'INTERNAL';
    case ProviderRolloutStages.BETA:
      return 'BETA';
    case ProviderRolloutStages.PRODUCTION:
      return 'PRODUCTION';
    default:
      return 'DISABLED';
  }
}

export function createCustomerIdentityProvider({
  providerType = process.env.ATLAS_IDENTITY_PROVIDER ?? 'local',
  storageProvider,
  now,
  logger,
  fetchImpl,
  environment = process.env.NODE_ENV ?? 'development',
  rolloutStage = process.env.ATLAS_IDENTITY_ROLLOUT_STAGE ?? null,
  oidcRolloutStage = process.env.ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE ?? null,
  emergencyGlobalDisable = boolFlag(process.env.ATLAS_IDENTITY_GLOBAL_EMERGENCY_DISABLE, false),
  emergencyProviderDisable = boolFlag(process.env.ATLAS_IDENTITY_PROVIDER_EMERGENCY_DISABLE, false),
  emergencyDevelopmentOverride = boolFlag(process.env.ATLAS_AUTH_ALLOW_DEVELOPMENT_IN_PRODUCTION, false),
  oidcExperimentalEnabled = boolFlag(process.env.ATLAS_IDENTITY_OIDC_EXPERIMENTAL_ENABLE, false)
} = {}) {
  const normalized = String(providerType ?? '').trim().toLowerCase();
  const stageFallback = oidcExperimentalEnabled
    ? ProviderRolloutStages.EXPERIMENTAL
    : ProviderRolloutStages.DISABLED;
  const effectiveRolloutStage = normalizeRolloutStage(
    oidcRolloutStage ?? rolloutStage,
    stageFallback
  );
  const emergencyDisabled = Boolean(emergencyGlobalDisable || emergencyProviderDisable);

  if (normalized === 'oidc' || normalized === 'external') {
    const provider = new OidcIdentityProviderAdapter({ fetchImpl, logger });
    const configured = provider.isConfigured();
    const blocked = emergencyDisabled || !configured || !rolloutIsEnabled(effectiveRolloutStage);
    const warnings = [];
    if (!configured) {
      warnings.push('OIDC provider selected but not configured.');
    }
    if (!rolloutIsEnabled(effectiveRolloutStage)) {
      warnings.push('OIDC provider rollout is disabled.');
    }
    if (effectiveRolloutStage === ProviderRolloutStages.EXPERIMENTAL && !oidcExperimentalEnabled) {
      warnings.push('OIDC provider is in experimental rollout but experimental enable flag is false.');
    }
    if (emergencyDisabled) {
      warnings.push('OIDC provider is disabled by emergency kill switch.');
    }

    return {
      provider,
      type: 'oidc',
      selectedExplicitly: true,
      blocked: blocked || (effectiveRolloutStage === ProviderRolloutStages.EXPERIMENTAL && !oidcExperimentalEnabled),
      status: configured ? IdentityProviderStatuses.DEGRADED : IdentityProviderStatuses.NOT_CONFIGURED,
      warnings,
      rollout: {
        stage: effectiveRolloutStage,
        audience: rolloutAudience(effectiveRolloutStage),
        enabled: rolloutIsEnabled(effectiveRolloutStage),
        emergencyDisabled
      }
    };
  }

  if ((environment === 'production' || environment === 'staging') && !emergencyDevelopmentOverride) {
    return {
      provider: new LocalDevelopmentIdentityProviderAdapter({ storageProvider, now, logger }),
      type: 'local',
      selectedExplicitly: true,
      blocked: true,
      status: IdentityProviderStatuses.DEVELOPMENT_ONLY,
      warnings: ['Development authentication is blocked in production/staging unless emergency override is explicitly enabled.'],
      rollout: {
        stage: ProviderRolloutStages.DISABLED,
        audience: 'DISABLED',
        enabled: false,
        emergencyDisabled: false
      }
    };
  }

  const provider = new LocalDevelopmentIdentityProviderAdapter({ storageProvider, now, logger });
  const warnings = [];
  if (environment === 'production' || environment === 'staging') {
    warnings.push('High severity: Development authentication override is enabled in production/staging.');
  }

  return {
    provider,
    type: 'local',
    selectedExplicitly: true,
    blocked: false,
    status: IdentityProviderStatuses.DEVELOPMENT_ONLY,
    warnings,
    rollout: {
      stage: ProviderRolloutStages.INTERNAL,
      audience: 'INTERNAL',
      enabled: true,
      emergencyDisabled: false
    }
  };
}
