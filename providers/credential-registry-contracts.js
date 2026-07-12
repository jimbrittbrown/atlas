const CredentialStatuses = Object.freeze({
  MISSING: 'MISSING',
  CONFIGURED: 'CONFIGURED',
  VERIFIED: 'VERIFIED',
  WARNING: 'WARNING',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN'
});

const CredentialRegistryFutureHooks = Object.freeze({
  automaticHealthChecks: 'automaticHealthChecks',
  quotaPolling: 'quotaPolling',
  credentialRotation: 'credentialRotation',
  providerFailover: 'providerFailover',
  multiProviderSelection: 'multiProviderSelection'
});

function normalizeCredentialStatus(value) {
  const normalized = String(value ?? '').toUpperCase().trim();

  if (
    normalized === CredentialStatuses.MISSING
    || normalized === CredentialStatuses.CONFIGURED
    || normalized === CredentialStatuses.VERIFIED
    || normalized === CredentialStatuses.WARNING
    || normalized === CredentialStatuses.FAILED
    || normalized === CredentialStatuses.UNKNOWN
  ) {
    return normalized;
  }

  return CredentialStatuses.UNKNOWN;
}

function createCredentialRecord(input = {}) {
  return {
    credentialId: String(input.credentialId ?? '').toUpperCase().trim(),
    providerId: String(input.providerId ?? '').toUpperCase().trim(),
    environment: String(input.environment ?? 'production').toLowerCase().trim(),
    configured: Boolean(input.configured),
    verified: Boolean(input.verified),
    lastValidated: input.lastValidated ?? null,
    expiresAt: input.expiresAt ?? null,
    requiredScopes: Array.isArray(input.requiredScopes) ? [...input.requiredScopes] : [],
    status: normalizeCredentialStatus(input.status),
    validationMessage: String(input.validationMessage ?? '').trim()
  };
}

function validateCredentialRecord(credential = {}) {
  const issues = [];

  if (typeof credential.credentialId !== 'string' || credential.credentialId.trim().length === 0) {
    issues.push({ field: 'credentialId', issue: 'MISSING_CREDENTIAL_ID' });
  }

  if (typeof credential.providerId !== 'string' || credential.providerId.trim().length === 0) {
    issues.push({ field: 'providerId', issue: 'MISSING_PROVIDER_ID' });
  }

  if (typeof credential.environment !== 'string' || credential.environment.trim().length === 0) {
    issues.push({ field: 'environment', issue: 'MISSING_ENVIRONMENT' });
  }

  if (!Array.isArray(credential.requiredScopes)) {
    issues.push({ field: 'requiredScopes', issue: 'INVALID_REQUIRED_SCOPES' });
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

function createCredentialValidationResult({
  credentialId = null,
  providerId = null,
  isValid = true,
  code = null,
  message = null,
  details = {}
} = {}) {
  return {
    credentialId,
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
  CredentialStatuses,
  CredentialRegistryFutureHooks,
  normalizeCredentialStatus,
  createCredentialRecord,
  validateCredentialRecord,
  createCredentialValidationResult
};
