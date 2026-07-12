import { randomUUID } from 'node:crypto';

export const IdentityProviderStatuses = Object.freeze({
  CONFIGURED: 'CONFIGURED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CONNECTED: 'CONNECTED',
  NOT_CONNECTED: 'NOT_CONNECTED',
  DEGRADED: 'DEGRADED',
  DEVELOPMENT_ONLY: 'DEVELOPMENT_ONLY'
});

export const IdentityErrorCodes = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  DUPLICATE_ACCOUNT: 'DUPLICATE_ACCOUNT',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  DEVELOPMENT_AUTH_FORBIDDEN: 'DEVELOPMENT_AUTH_FORBIDDEN'
});

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function createIdentityError({ code, message, retryable = false, details = null } = {}) {
  return {
    code: code ?? IdentityErrorCodes.INVALID_REQUEST,
    message: message ?? 'Identity operation failed.',
    retryable: Boolean(retryable),
    details
  };
}

export function createIdentityResult({ ok, data = null, error = null, providerStatus = null } = {}) {
  return {
    ok: Boolean(ok),
    data,
    error,
    providerStatus
  };
}

export function createProviderUserRecord({
  providerUserId,
  email,
  emailVerified = false,
  linkedCustomerId = null,
  linkedAt = null,
  createdAt,
  updatedAt,
  metadata = {}
} = {}, { now } = {}) {
  const timestamp = createdAt ?? nowIso(now);
  return {
    providerUserId: providerUserId ?? `pid_${randomUUID()}`,
    email: normalizeEmail(email),
    emailVerified: Boolean(emailVerified),
    linkedCustomerId,
    linkedAt,
    createdAt: timestamp,
    updatedAt: updatedAt ?? timestamp,
    metadata
  };
}
