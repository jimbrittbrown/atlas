import { createHash, randomUUID } from 'node:crypto';
import {
  NotificationChannels,
  NotificationDeliveryAttemptOutcomes,
  NotificationFailureClasses,
  NotificationProviderHealthStates,
  createNotificationProviderContract
} from './notification-domain-contracts.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 .'()\-_,]{1,80}$/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
const CRLF_PATTERN = /\r|\n/;

export const EmailProviderIds = Object.freeze({
  LOCAL: 'EMAIL_LOCAL',
  SENDGRID: 'EMAIL_SENDGRID',
  NOT_CONFIGURED: 'EMAIL_NOT_CONFIGURED'
});

export const EmailProviderTypes = Object.freeze({
  LOCAL: 'local',
  SENDGRID: 'sendgrid',
  NOT_CONFIGURED: 'not_configured'
});

export const EmailProviderSimulationModes = Object.freeze({
  SUCCESS: 'success',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  RECIPIENT_REJECTION: 'recipient_rejection',
  PROVIDER_OUTAGE: 'provider_outage'
});

export const EmailDispatchErrorCodes = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_RECIPIENT: 'INVALID_RECIPIENT',
  INVALID_SENDER: 'INVALID_SENDER',
  INVALID_REPLY_TO: 'INVALID_REPLY_TO',
  HEADER_INJECTION: 'HEADER_INJECTION',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  CUSTOMER_ISOLATION_VIOLATION: 'CUSTOMER_ISOLATION_VIOLATION',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_DISABLED: 'PROVIDER_DISABLED',
  PROVIDER_UNSUPPORTED: 'PROVIDER_UNSUPPORTED',
  PROVIDER_CONFIGURATION_INVALID: 'PROVIDER_CONFIGURATION_INVALID'
});

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function safeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

export function sanitizeProviderMetadata(metadata = {}) {
  const input = asObject(metadata);
  const output = {};
  Object.entries(input).forEach(([key, value]) => {
    const lower = String(key).toLowerCase();
    if (/(token|secret|password|credential|authorization|api[_-]?key|cookie|html|textbody|body|content)/i.test(lower)) {
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

export function normalizeEmailAddress(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function isValidEmailAddress(email) {
  const normalized = normalizeEmailAddress(email);
  if (!normalized) return false;
  if (CRLF_PATTERN.test(normalized) || CONTROL_CHAR_PATTERN.test(normalized)) return false;
  return EMAIL_PATTERN.test(normalized);
}

export function validateDisplayName(value) {
  const text = safeString(value);
  if (!text) {
    return { valid: false, issue: 'Display name is required.' };
  }

  if (CRLF_PATTERN.test(text) || CONTROL_CHAR_PATTERN.test(text)) {
    return { valid: false, issue: 'Display name contains prohibited control or CRLF characters.' };
  }

  if (!DISPLAY_NAME_PATTERN.test(text)) {
    return { valid: false, issue: 'Display name contains unsupported characters.' };
  }

  return { valid: true, issue: null };
}

function containsHeaderInjection(value) {
  const text = String(value ?? '');
  return CRLF_PATTERN.test(text) || CONTROL_CHAR_PATTERN.test(text);
}

export function validateSenderIdentity(sender = {}) {
  const errors = [];
  const normalized = {
    email: normalizeEmailAddress(sender.email),
    displayName: safeString(sender.displayName)
  };

  if (!isValidEmailAddress(normalized.email)) {
    errors.push('sender.email must be a valid canonical email address.');
  }

  const displayValidation = validateDisplayName(normalized.displayName);
  if (!displayValidation.valid) {
    errors.push(displayValidation.issue);
  }

  if (containsHeaderInjection(normalized.email) || containsHeaderInjection(normalized.displayName)) {
    errors.push('Sender identity contains prohibited header injection characters.');
  }

  return {
    accepted: errors.length === 0,
    errors,
    sender: normalized
  };
}

export function validateReplyTo(replyTo = null) {
  if (!replyTo) return { accepted: true, errors: [], replyTo: null };
  const normalized = normalizeEmailAddress(replyTo);
  const errors = [];
  if (!isValidEmailAddress(normalized)) {
    errors.push('replyTo must be a valid canonical email address.');
  }
  if (containsHeaderInjection(normalized)) {
    errors.push('replyTo contains prohibited header injection characters.');
  }
  return {
    accepted: errors.length === 0,
    errors,
    replyTo: normalized
  };
}

export function validateCanonicalEmailRequest(request = {}, {
  maximumSubjectBytes = 998,
  maximumTextBytes = 100000,
  maximumHtmlBytes = 250000
} = {}) {
  const errors = [];
  const normalized = {
    providerRequestId: safeString(request.providerRequestId, `nemail_req_${randomUUID()}`),
    idempotencyKey: safeString(request.idempotencyKey),
    recipient: asObject(request.recipient),
    replyTo: request.replyTo == null ? null : safeString(request.replyTo),
    subject: safeString(request.subject),
    textBody: String(request.textBody ?? ''),
    htmlBody: request.htmlBody == null ? null : String(request.htmlBody),
    sender: asObject(request.sender),
    correlationId: safeString(request.correlationId),
    businessId: safeString(request.businessId),
    customerId: request.customerId == null ? null : safeString(request.customerId),
    metadata: asObject(request.metadata)
  };

  if (!hasText(normalized.idempotencyKey)) errors.push('idempotencyKey is required.');
  if (!hasText(normalized.subject)) errors.push('subject is required.');
  if (!hasText(normalized.textBody) && !hasText(normalized.htmlBody)) {
    errors.push('At least one of textBody or htmlBody is required.');
  }

  const recipientEmail = normalizeEmailAddress(normalized.recipient.email ?? normalized.recipient.address ?? '');
  if (!isValidEmailAddress(recipientEmail)) {
    errors.push('recipient.email must be a valid canonical email address.');
  }

  const recipientCustomerId = safeString(normalized.recipient.customerId ?? normalized.recipient.id ?? '');
  if (hasText(normalized.customerId) && hasText(recipientCustomerId) && normalized.customerId !== recipientCustomerId) {
    errors.push('recipient customer identity does not match customerId.');
  }

  const senderValidation = validateSenderIdentity(normalized.sender);
  if (!senderValidation.accepted) {
    senderValidation.errors.forEach((entry) => errors.push(entry));
  }

  const replyToValidation = validateReplyTo(normalized.replyTo);
  if (!replyToValidation.accepted) {
    replyToValidation.errors.forEach((entry) => errors.push(entry));
  }

  if (containsHeaderInjection(normalized.subject) || containsHeaderInjection(normalized.textBody) || containsHeaderInjection(normalized.htmlBody)) {
    errors.push('subject/body contains prohibited control or CRLF characters.');
  }

  const subjectBytes = Buffer.byteLength(normalized.subject, 'utf8');
  const textBytes = Buffer.byteLength(normalized.textBody, 'utf8');
  const htmlBytes = Buffer.byteLength(String(normalized.htmlBody ?? ''), 'utf8');
  if (subjectBytes > maximumSubjectBytes) {
    errors.push(`subject exceeds maximum ${maximumSubjectBytes} bytes.`);
  }
  if (textBytes > maximumTextBytes) {
    errors.push(`textBody exceeds maximum ${maximumTextBytes} bytes.`);
  }
  if (htmlBytes > maximumHtmlBytes) {
    errors.push(`htmlBody exceeds maximum ${maximumHtmlBytes} bytes.`);
  }

  return {
    accepted: errors.length === 0,
    errors,
    request: {
      ...normalized,
      recipient: {
        ...normalized.recipient,
        email: recipientEmail
      },
      sender: senderValidation.sender,
      replyTo: replyToValidation.replyTo,
      payloadSizes: {
        subjectBytes,
        textBytes,
        htmlBytes
      }
    }
  };
}

export function buildCanonicalEmailResult({
  accepted = false,
  providerMessageId = null,
  providerRequestRef = null,
  outcome,
  normalizedErrorClass = null,
  retryable = false,
  terminal = false,
  providerStatusCode = null,
  occurredAt,
  metadata = {}
} = {}, { now } = {}) {
  const normalizedOutcome = String(outcome ?? (accepted ? NotificationDeliveryAttemptOutcomes.SUCCEEDED : NotificationDeliveryAttemptOutcomes.FAILED_RETRYABLE)).trim().toUpperCase();
  const normalizedClass = normalizedErrorClass == null ? null : String(normalizedErrorClass).trim().toUpperCase();

  return Object.freeze({
    accepted: Boolean(accepted),
    providerMessageId: providerMessageId == null ? null : String(providerMessageId).trim(),
    providerRequestRef: providerRequestRef == null ? null : String(providerRequestRef).trim(),
    outcome: normalizedOutcome,
    normalizedErrorClass: normalizedClass,
    retryable: Boolean(retryable),
    terminal: Boolean(terminal),
    providerStatusCode: providerStatusCode == null ? null : Number(providerStatusCode),
    occurredAt: String(occurredAt ?? nowIso(now)).trim(),
    metadata: sanitizeProviderMetadata(metadata)
  });
}

export function classifyFailureFromStatus({
  statusCode = null,
  timeout = false,
  recipientRejected = false,
  rateLimited = false,
  configuration = false
} = {}) {
  if (configuration) {
    return {
      normalizedErrorClass: NotificationFailureClasses.CONFIGURATION_FAILURE,
      retryable: false,
      terminal: true,
      outcome: NotificationDeliveryAttemptOutcomes.FAILED_TERMINAL
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

  if (recipientRejected || Number(statusCode) === 422 || Number(statusCode) === 400) {
    return {
      normalizedErrorClass: NotificationFailureClasses.RECIPIENT_INVALID,
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

  if (statusCode != null && [401, 403].includes(Number(statusCode))) {
    return {
      normalizedErrorClass: NotificationFailureClasses.CONFIGURATION_FAILURE,
      retryable: false,
      terminal: true,
      outcome: NotificationDeliveryAttemptOutcomes.FAILED_TERMINAL
    };
  }

  return {
    normalizedErrorClass: NotificationFailureClasses.DELIVERY_UNKNOWN,
    retryable: true,
    terminal: false,
    outcome: NotificationDeliveryAttemptOutcomes.FAILED_RETRYABLE
  };
}

export function buildEmailProviderContract({ providerId, name, healthState, supportsIdempotency = true, maximumPayloadBytes = 250000 } = {}) {
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
      supportedChannels: [NotificationChannels.EMAIL],
      healthReporting: true
    }
  });
}

export function toHealthState(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (Object.values(NotificationProviderHealthStates).includes(normalized)) return normalized;
  return NotificationProviderHealthStates.NOT_CONFIGURED;
}

export function deterministicProviderMessageId(seed) {
  return `email_msg_${stableHash(seed).slice(0, 24)}`;
}

export function deterministicProviderRequestRef(seed) {
  return `email_req_${stableHash(seed).slice(0, 24)}`;
}
