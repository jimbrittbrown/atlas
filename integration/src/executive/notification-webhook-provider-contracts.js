import { createHash, randomUUID } from 'node:crypto';
import {
  NotificationChannels,
  NotificationDeliveryAttemptOutcomes,
  NotificationFailureClasses,
  NotificationProviderHealthStates,
  createNotificationProviderContract
} from './notification-domain-contracts.js';

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
const CRLF_PATTERN = /\r|\n/;
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);
const ALLOWED_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc/i,
  /^fd/i
];

export const WebhookProviderIds = Object.freeze({
  LOCAL: 'WEBHOOK_LOCAL',
  HTTPS: 'WEBHOOK_HTTPS',
  NOT_CONFIGURED: 'WEBHOOK_NOT_CONFIGURED'
});

export const WebhookProviderTypes = Object.freeze({
  LOCAL: 'local',
  HTTPS: 'https',
  NOT_CONFIGURED: 'not_configured'
});

export const WebhookProviderSimulationModes = Object.freeze({
  SUCCESS: 'success',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  RECEIVER_REJECTION: 'receiver_rejection',
  PROVIDER_OUTAGE: 'provider_outage',
  UNKNOWN: 'unknown'
});

export const WebhookDispatchErrorCodes = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_ENDPOINT: 'INVALID_ENDPOINT',
  UNSAFE_ENDPOINT: 'UNSAFE_ENDPOINT',
  ENDPOINT_OWNERSHIP_MISMATCH: 'ENDPOINT_OWNERSHIP_MISMATCH',
  HEADER_INJECTION: 'HEADER_INJECTION',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  PROHIBITED_HEADER: 'PROHIBITED_HEADER',
  SIGNING_CONFIGURATION_MISSING: 'SIGNING_CONFIGURATION_MISSING',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_DISABLED: 'PROVIDER_DISABLED',
  PROVIDER_UNSUPPORTED: 'PROVIDER_UNSUPPORTED',
  PROVIDER_CONFIGURATION_INVALID: 'PROVIDER_CONFIGURATION_INVALID'
});

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function safeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function containsControlOrInjection(value) {
  const text = String(value ?? '');
  return CONTROL_CHAR_PATTERN.test(text) || CRLF_PATTERN.test(text);
}

function fingerprintBody(body) {
  const normalized = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  return `sha256:${stableHash(normalized)}`;
}

export function sanitizeWebhookMetadata(metadata = {}) {
  const input = asObject(metadata);
  const output = {};

  Object.entries(input).forEach(([key, value]) => {
    const lower = String(key).toLowerCase();
    if (/(authorization|token|secret|credential|signature|api[_-]?key|cookie|password)/i.test(lower)) {
      output[key] = '[REDACTED]';
      return;
    }

    if (typeof value === 'string' && value.length > 180) {
      output[key] = `${value.slice(0, 180)}...`;
      return;
    }

    output[key] = value;
  });

  return output;
}

export function validateWebhookEndpoint(endpoint, {
  requireHttps = true,
  allowUnsafeTargets = false,
  allowlist = []
} = {}) {
  const text = String(endpoint ?? '').trim();
  const issues = [];

  if (!text) {
    return { accepted: false, issues: ['endpoint is required.'], endpoint: null };
  }

  if (text.startsWith('//')) {
    issues.push('Protocol-relative URLs are not allowed.');
  }

  if (/%25[0-9a-fA-F]{2}/.test(text)) {
    issues.push('Double-encoded endpoint patterns are not allowed.');
  }

  let parsed = null;
  try {
    parsed = new URL(text);
  } catch {
    issues.push('endpoint must be a valid absolute URL.');
  }

  if (!parsed) {
    return { accepted: false, issues, endpoint: null };
  }

  const scheme = String(parsed.protocol ?? '').toLowerCase();
  if (!['http:', 'https:'].includes(scheme)) {
    issues.push('Only HTTP/HTTPS schemes are allowed.');
  }

  if (requireHttps && scheme !== 'https:') {
    issues.push('HTTPS is required.');
  }

  if (parsed.username || parsed.password) {
    issues.push('Endpoint credentials in URL are not allowed.');
  }

  const host = String(parsed.hostname ?? '').trim().toLowerCase();
  if (!host) {
    issues.push('Endpoint host is required.');
  }

  const unsafeHost = PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))
    || host === 'metadata.google.internal'
    || host === '169.254.169.254';

  const allowlistMatch = allowlist.some((item) => {
    const normalized = String(item ?? '').trim().toLowerCase();
    if (!normalized) return false;
    return host === normalized || host.endsWith(`.${normalized}`);
  });

  if (!allowUnsafeTargets && unsafeHost && !allowlistMatch) {
    issues.push('Endpoint target is unsafe and not allowlisted.');
  }

  if (containsControlOrInjection(parsed.pathname) || containsControlOrInjection(parsed.search)) {
    issues.push('Endpoint path/query includes prohibited control characters.');
  }

  return {
    accepted: issues.length === 0,
    issues,
    endpoint: parsed.toString()
  };
}

export function validateWebhookHeaders(headers = {}, { maxHeaderCount = 24 } = {}) {
  const normalizedHeaders = {};
  const issues = [];
  const entries = Object.entries(asObject(headers));

  if (entries.length > maxHeaderCount) {
    issues.push(`header count exceeds ${maxHeaderCount}.`);
  }

  entries.forEach(([name, value]) => {
    const key = String(name ?? '').trim().toLowerCase();
    const val = String(value ?? '').trim();

    if (!key) return;

    if (containsControlOrInjection(key) || containsControlOrInjection(val)) {
      issues.push(`header ${key} contains prohibited control characters.`);
      return;
    }

    if (HOP_BY_HOP_HEADERS.has(key)) {
      issues.push(`header ${key} is prohibited.`);
      return;
    }

    if (key === 'host' || key === 'content-length') {
      issues.push(`header ${key} is managed by transport and is prohibited.`);
      return;
    }

    normalizedHeaders[key] = val;
  });

  return {
    accepted: issues.length === 0,
    issues,
    headers: normalizedHeaders
  };
}

export function validateCanonicalWebhookRequest(request = {}, {
  maximumPayloadBytes = 262144,
  approvedMethods = ALLOWED_METHODS,
  requireHttps = true,
  allowUnsafeTargets = false,
  allowlist = []
} = {}) {
  const normalized = {
    providerRequestId: safeString(request.providerRequestId, `nwh_req_${randomUUID()}`),
    idempotencyKey: safeString(request.idempotencyKey),
    endpoint: safeString(request.endpoint),
    method: safeString(request.method || 'POST').toUpperCase(),
    headers: asObject(request.headers),
    body: request.body,
    contentType: safeString(request.contentType || 'application/json').toLowerCase(),
    signature: asObject(request.signature),
    timeoutMs: Number.parseInt(String(request.timeoutMs ?? 10000), 10),
    correlationId: safeString(request.correlationId),
    businessId: safeString(request.businessId),
    customerId: request.customerId == null ? null : safeString(request.customerId),
    metadata: asObject(request.metadata)
  };

  const issues = [];

  if (!hasText(normalized.idempotencyKey)) issues.push('idempotencyKey is required.');
  if (!hasText(normalized.correlationId)) issues.push('correlationId is required.');
  if (!hasText(normalized.businessId)) issues.push('businessId is required.');

  if (!approvedMethods.has(normalized.method)) {
    issues.push(`method ${normalized.method} is not allowed.`);
  }

  const endpointValidation = validateWebhookEndpoint(normalized.endpoint, {
    requireHttps,
    allowUnsafeTargets,
    allowlist
  });
  if (!endpointValidation.accepted) {
    endpointValidation.issues.forEach((entry) => issues.push(entry));
  } else {
    normalized.endpoint = endpointValidation.endpoint;
  }

  const headerValidation = validateWebhookHeaders(normalized.headers);
  if (!headerValidation.accepted) {
    headerValidation.issues.forEach((entry) => issues.push(entry));
  }
  normalized.headers = headerValidation.headers;

  if (!Number.isFinite(normalized.timeoutMs) || normalized.timeoutMs < 500 || normalized.timeoutMs > 60000) {
    issues.push('timeoutMs must be between 500 and 60000 ms.');
  }

  const serializedBody = typeof normalized.body === 'string'
    ? normalized.body
    : JSON.stringify(normalized.body ?? {});
  const payloadBytes = Buffer.byteLength(serializedBody, 'utf8');
  if (payloadBytes > maximumPayloadBytes) {
    issues.push(`payload exceeds maximum ${maximumPayloadBytes} bytes.`);
  }

  const contentType = normalized.contentType;
  if (!hasText(contentType) || containsControlOrInjection(contentType)) {
    issues.push('contentType is required and must be safe.');
  }

  return {
    accepted: issues.length === 0,
    issues,
    request: {
      ...normalized,
      payloadBytes,
      bodyFingerprint: fingerprintBody(serializedBody)
    }
  };
}

export function buildCanonicalWebhookResult({
  accepted = false,
  providerMessageId = null,
  providerRequestRef = null,
  outcome,
  normalizedErrorClass = null,
  retryable = false,
  terminal = false,
  providerStatusCode = null,
  responseFingerprint = null,
  occurredAt,
  metadata = {}
} = {}, { now } = {}) {
  const normalizedOutcome = String(outcome ?? (accepted ? NotificationDeliveryAttemptOutcomes.SUCCEEDED : NotificationDeliveryAttemptOutcomes.FAILED_RETRYABLE)).trim().toUpperCase();
  return Object.freeze({
    accepted: Boolean(accepted),
    providerMessageId: providerMessageId == null ? null : String(providerMessageId).trim(),
    providerRequestRef: providerRequestRef == null ? null : String(providerRequestRef).trim(),
    outcome: normalizedOutcome,
    normalizedErrorClass: normalizedErrorClass == null ? null : String(normalizedErrorClass).trim().toUpperCase(),
    retryable: Boolean(retryable),
    terminal: Boolean(terminal),
    providerStatusCode: providerStatusCode == null ? null : Number(providerStatusCode),
    responseFingerprint: responseFingerprint == null ? null : String(responseFingerprint).trim(),
    occurredAt: String(occurredAt ?? nowIso(now)).trim(),
    metadata: sanitizeWebhookMetadata(metadata)
  });
}

export function classifyWebhookFailure({
  statusCode = null,
  timeout = false,
  rateLimited = false,
  receiverRejected = false,
  configuration = false,
  unknown = false
} = {}) {
  if (configuration) {
    return {
      normalizedErrorClass: NotificationFailureClasses.CONFIGURATION_FAILURE,
      retryable: false,
      terminal: true,
      outcome: NotificationDeliveryAttemptOutcomes.FAILED_TERMINAL
    };
  }

  if (unknown) {
    return {
      normalizedErrorClass: NotificationFailureClasses.DELIVERY_UNKNOWN,
      retryable: true,
      terminal: false,
      outcome: NotificationDeliveryAttemptOutcomes.FAILED_RETRYABLE
    };
  }

  if (timeout || Number(statusCode) === 408 || Number(statusCode) === 504) {
    return {
      normalizedErrorClass: NotificationFailureClasses.TIMEOUT,
      retryable: true,
      terminal: false,
      outcome: NotificationDeliveryAttemptOutcomes.FAILED_RETRYABLE
    };
  }

  if (rateLimited || Number(statusCode) === 429) {
    return {
      normalizedErrorClass: NotificationFailureClasses.RATE_LIMITED,
      retryable: true,
      terminal: false,
      outcome: NotificationDeliveryAttemptOutcomes.FAILED_RETRYABLE
    };
  }

  if (receiverRejected || (statusCode != null && Number(statusCode) >= 400 && Number(statusCode) < 500)) {
    return {
      normalizedErrorClass: NotificationFailureClasses.PROVIDER_REJECTED,
      retryable: false,
      terminal: true,
      outcome: NotificationDeliveryAttemptOutcomes.FAILED_TERMINAL
    };
  }

  if (statusCode != null && Number(statusCode) >= 500) {
    return {
      normalizedErrorClass: NotificationFailureClasses.PROVIDER_UNAVAILABLE,
      retryable: true,
      terminal: false,
      outcome: NotificationDeliveryAttemptOutcomes.FAILED_RETRYABLE
    };
  }

  return {
    normalizedErrorClass: NotificationFailureClasses.DELIVERY_UNKNOWN,
    retryable: true,
    terminal: false,
    outcome: NotificationDeliveryAttemptOutcomes.FAILED_RETRYABLE
  };
}

export function buildWebhookProviderContract({ providerId, name, healthState, supportsIdempotency = true, maximumPayloadBytes = 262144 } = {}) {
  return createNotificationProviderContract({
    providerId,
    name,
    healthState,
    errorMapVersion: '1.0.0',
    capabilities: {
      supportsIdempotency,
      supportsAttachments: false,
      supportsProviderTemplates: false,
      maximumPayloadBytes,
      supportedChannels: [NotificationChannels.WEBHOOK],
      healthReporting: true
    }
  });
}

export function deterministicWebhookMessageId(seed) {
  return `wh_msg_${stableHash(seed).slice(0, 24)}`;
}

export function deterministicWebhookRequestRef(seed) {
  return `wh_req_${stableHash(seed).slice(0, 24)}`;
}
