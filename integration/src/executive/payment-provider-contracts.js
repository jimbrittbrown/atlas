import { randomUUID } from 'node:crypto';

export const PaymentProviderStatuses = Object.freeze({
  CONFIGURED: 'CONFIGURED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CONNECTED: 'CONNECTED',
  NOT_CONNECTED: 'NOT_CONNECTED',
  DEGRADED: 'DEGRADED',
  DEVELOPMENT_ONLY: 'DEVELOPMENT_ONLY'
});

export const PaymentLifecycleStates = Object.freeze({
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED'
});

export const PaymentErrorCodes = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  WEBHOOK_REJECTED: 'WEBHOOK_REJECTED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT'
});

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export function normalizeCurrency(value) {
  const normalized = String(value ?? 'USD').trim().toUpperCase();
  return normalized.length === 3 ? normalized : 'USD';
}

export function createPaymentError({ code, message, retryable = false, details = null } = {}) {
  return {
    code: code ?? PaymentErrorCodes.INVALID_REQUEST,
    message: message ?? 'Payment operation failed.',
    retryable: Boolean(retryable),
    details
  };
}

export function createPaymentResult({ ok, data = null, error = null, providerStatus = null } = {}) {
  return {
    ok: Boolean(ok),
    data,
    error,
    providerStatus
  };
}

export function createPaymentRecord({
  paymentId,
  customerId,
  missionId,
  providerType,
  providerName,
  providerPaymentId = null,
  providerCheckoutSessionId = null,
  amountMinor,
  currency = 'USD',
  status = PaymentLifecycleStates.PENDING,
  checkoutUrl = null,
  metadata = {},
  createdAt,
  updatedAt
} = {}, { now } = {}) {
  const timestamp = createdAt ?? nowIso(now);
  return {
    paymentId: paymentId ?? `pay_${randomUUID()}`,
    customerId,
    missionId,
    providerType,
    providerName,
    providerPaymentId,
    providerCheckoutSessionId,
    amountMinor: Number(amountMinor ?? 0),
    currency: normalizeCurrency(currency),
    status,
    checkoutUrl,
    metadata,
    createdAt: timestamp,
    updatedAt: updatedAt ?? timestamp,
    completedAt: null,
    failedAt: null,
    canceledAt: null,
    refundedAt: null,
    failureReason: null
  };
}
