import { IdentityProviderStatuses } from './customer-identity-provider-contracts.js';
import { LocalDevelopmentIdentityProviderAdapter } from './customer-identity-provider-local.js';
import { OidcIdentityProviderAdapter } from './customer-identity-provider-oidc.js';

function boolFlag(value, fallback = false) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}

export function createCustomerIdentityProvider({
  providerType = process.env.ATLAS_IDENTITY_PROVIDER ?? 'local',
  storageProvider,
  now,
  logger,
  fetchImpl,
  environment = process.env.NODE_ENV ?? 'development',
  emergencyDevelopmentOverride = boolFlag(process.env.ATLAS_AUTH_ALLOW_DEVELOPMENT_IN_PRODUCTION, false),
  oidcExperimentalEnabled = boolFlag(process.env.ATLAS_IDENTITY_OIDC_EXPERIMENTAL_ENABLE, false)
} = {}) {
  const normalized = String(providerType ?? '').trim().toLowerCase();

  if (normalized === 'oidc' || normalized === 'external') {
    const provider = new OidcIdentityProviderAdapter({ fetchImpl, logger });
    const configured = provider.isConfigured();
    const blocked = !configured || !oidcExperimentalEnabled;
    const warnings = [];
    if (!configured) {
      warnings.push('OIDC provider selected but not configured.');
    }
    if (!oidcExperimentalEnabled) {
      warnings.push('OIDC provider is partial and gated; set ATLAS_IDENTITY_OIDC_EXPERIMENTAL_ENABLE=true only for controlled testing.');
    }

    return {
      provider,
      type: 'oidc',
      selectedExplicitly: true,
      blocked,
      status: configured ? IdentityProviderStatuses.DEGRADED : IdentityProviderStatuses.NOT_CONFIGURED,
      warnings
    };
  }

  if ((environment === 'production' || environment === 'staging') && !emergencyDevelopmentOverride) {
    return {
      provider: new LocalDevelopmentIdentityProviderAdapter({ storageProvider, now, logger }),
      type: 'local',
      selectedExplicitly: true,
      blocked: true,
      status: IdentityProviderStatuses.DEVELOPMENT_ONLY,
      warnings: ['Development authentication is blocked in production/staging unless emergency override is explicitly enabled.']
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
    warnings
  };
}
