const ProviderHealthStates = Object.freeze({
  HEALTHY: 'HEALTHY',
  WARNING: 'WARNING',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN'
});

const ProviderStatuses = Object.freeze({
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED'
});

const ProviderCategories = Object.freeze({
  CLOUD: 'CLOUD',
  MODEL: 'MODEL',
  PUBLISHING: 'PUBLISHING',
  VOICE: 'VOICE',
  OTHER: 'OTHER'
});

const ProviderRegistryFutureHooks = Object.freeze({
  automaticHealthChecks: 'automaticHealthChecks',
  quotaPolling: 'quotaPolling',
  credentialRotation: 'credentialRotation',
  providerFailover: 'providerFailover',
  multiProviderSelection: 'multiProviderSelection'
});

function normalizeProviderHealth(value) {
  const normalized = String(value ?? '').toUpperCase().trim();

  if (
    normalized === ProviderHealthStates.HEALTHY
    || normalized === ProviderHealthStates.WARNING
    || normalized === ProviderHealthStates.DEGRADED
    || normalized === ProviderHealthStates.FAILED
    || normalized === ProviderHealthStates.UNKNOWN
  ) {
    return normalized;
  }

  return ProviderHealthStates.UNKNOWN;
}

function normalizeProviderStatus(value) {
  const normalized = String(value ?? '').toUpperCase().trim();

  if (normalized === ProviderStatuses.ENABLED || normalized === ProviderStatuses.DISABLED) {
    return normalized;
  }

  return ProviderStatuses.ENABLED;
}

function normalizeProviderCategory(value) {
  const normalized = String(value ?? '').toUpperCase().trim();

  if (
    normalized === ProviderCategories.CLOUD
    || normalized === ProviderCategories.MODEL
    || normalized === ProviderCategories.PUBLISHING
    || normalized === ProviderCategories.VOICE
    || normalized === ProviderCategories.OTHER
  ) {
    return normalized;
  }

  return ProviderCategories.OTHER;
}

function createProviderRecord(input = {}) {
  return {
    providerId: String(input.providerId ?? '').toUpperCase().trim(),
    displayName: String(input.displayName ?? '').trim(),
    category: normalizeProviderCategory(input.category),
    status: normalizeProviderStatus(input.status),
    environment: String(input.environment ?? 'production').toLowerCase().trim(),
    health: normalizeProviderHealth(input.health),
    capabilities: Array.isArray(input.capabilities) ? [...input.capabilities] : [],
    requiredCredentials: Array.isArray(input.requiredCredentials) ? [...input.requiredCredentials] : [],
    quotaStatus: {
      status: String(input.quotaStatus?.status ?? 'UNKNOWN').toUpperCase().trim(),
      warnings: Array.isArray(input.quotaStatus?.warnings) ? [...input.quotaStatus.warnings] : [],
      remaining: Number(input.quotaStatus?.remaining ?? 0),
      resetAt: input.quotaStatus?.resetAt ?? null
    },
    lastHealthCheck: input.lastHealthCheck ?? null
  };
}

function validateProviderRecord(provider = {}) {
  const issues = [];

  if (typeof provider.providerId !== 'string' || provider.providerId.trim().length === 0) {
    issues.push({ field: 'providerId', issue: 'MISSING_PROVIDER_ID' });
  }

  if (typeof provider.displayName !== 'string' || provider.displayName.trim().length === 0) {
    issues.push({ field: 'displayName', issue: 'MISSING_DISPLAY_NAME' });
  }

  if (typeof provider.environment !== 'string' || provider.environment.trim().length === 0) {
    issues.push({ field: 'environment', issue: 'MISSING_ENVIRONMENT' });
  }

  if (!Array.isArray(provider.requiredCredentials)) {
    issues.push({ field: 'requiredCredentials', issue: 'INVALID_REQUIRED_CREDENTIALS' });
  }

  if (!Array.isArray(provider.capabilities)) {
    issues.push({ field: 'capabilities', issue: 'INVALID_CAPABILITIES' });
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

function createProviderValidationResult({
  providerId = null,
  isValid = true,
  code = null,
  message = null,
  details = {}
} = {}) {
  return {
    providerId,
    isValid,
    code,
    message,
    details: {
      ...details
    }
  };
}

module.exports = {
  ProviderHealthStates,
  ProviderStatuses,
  ProviderCategories,
  ProviderRegistryFutureHooks,
  normalizeProviderHealth,
  normalizeProviderStatus,
  normalizeProviderCategory,
  createProviderRecord,
  validateProviderRecord,
  createProviderValidationResult
};
