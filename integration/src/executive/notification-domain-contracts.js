import { randomUUID, createHash } from 'node:crypto';

const CONTRACT_MAJOR_VERSION = 1;

const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]{3,160}$/;
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

const FORBIDDEN_EVENT_INSTRUCTION_KEYS = new Set([
  'provider',
  'providerid',
  'providerids',
  'channel',
  'channels',
  'candidatechannels',
  'templateref',
  'templateid',
  'templateversion',
  'recipient',
  'recipientrefs',
  'deliveryjob',
  'deliveryjobs',
  'webhookurl',
  'dispatch',
  'routeprovider'
]);

const REDACTED_AUDIT_KEYS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /credential/i,
  /key/i,
  /signature/i,
  /cipher/i,
  /hash/i,
  /recipientemail/i,
  /phone/i
];

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function parseSemver(value) {
  const text = String(value ?? '').trim();
  const match = SEMVER_PATTERN.exec(text);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function isIsoTimestamp(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed);
}

function normalizeId(value, fallbackPrefix) {
  const text = String(value ?? '').trim();
  if (text && SAFE_ID_PATTERN.test(text)) return text;
  return `${fallbackPrefix}_${randomUUID()}`;
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function deepFreeze(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => {
    const child = value[key];
    if (isObject(child) || Array.isArray(child)) {
      deepFreeze(child);
    }
  });
  return Object.freeze(value);
}

function cloneJson(value, fallback = {}) {
  if (value == null) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function validateIdField(name, value, issues, { required = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text) {
    if (required) issues.push(`${name} is required.`);
    return;
  }
  if (!SAFE_ID_PATTERN.test(text)) {
    issues.push(`${name} must match safe identifier pattern.`);
  }
}

function recursiveForbiddenInstructionScan(value, path = 'payload', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => recursiveForbiddenInstructionScan(item, `${path}[${index}]`, findings));
    return findings;
  }

  if (!isObject(value)) return findings;

  Object.entries(value).forEach(([key, child]) => {
    const normalizedKey = String(key ?? '').trim().toLowerCase();
    if (FORBIDDEN_EVENT_INSTRUCTION_KEYS.has(normalizedKey)) {
      findings.push(`${path}.${key}`);
    }
    recursiveForbiddenInstructionScan(child, `${path}.${key}`, findings);
  });

  return findings;
}

function redactAuditValue(value, key = '') {
  if (REDACTED_AUDIT_KEYS.some((rule) => rule.test(String(key ?? '')))) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactAuditValue(entry, key));
  }

  if (isObject(value)) {
    const output = {};
    Object.entries(value).forEach(([childKey, childValue]) => {
      output[childKey] = redactAuditValue(childValue, childKey);
    });
    return output;
  }

  return value;
}

export const NotificationContractVersions = Object.freeze({
  DOMAIN_EVENT: '1.0.0',
  NOTIFICATION_INTENT: '1.0.0',
  POLICY_DECISION: '1.0.0',
  COMPOSITION: '1.0.0',
  DELIVERY_JOB: '1.0.0',
  DELIVERY_ATTEMPT: '1.0.0',
  DELIVERY_RESULT: '1.0.0',
  TEMPLATE: '1.0.0',
  PROVIDER: '1.0.0',
  CONSENT_PREFERENCE: '1.0.0',
  DEAD_LETTER: '1.0.0'
});

export const NotificationSensitivityLevels = Object.freeze({
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
  RESTRICTED: 'RESTRICTED',
  SECRET: 'SECRET'
});

export const NotificationIntentClassifications = Object.freeze({
  SECURITY: 'SECURITY',
  TRANSACTIONAL: 'TRANSACTIONAL',
  OPERATIONAL: 'OPERATIONAL',
  EXECUTIVE: 'EXECUTIVE',
  CUSTOMER_SUCCESS: 'CUSTOMER_SUCCESS',
  SYSTEM: 'SYSTEM',
  LEGAL: 'LEGAL',
  MARKETING: 'MARKETING'
});

export const NotificationAudienceTypes = Object.freeze({
  EXECUTIVE: 'EXECUTIVE',
  CUSTOMER: 'CUSTOMER',
  SYSTEM_ENDPOINT: 'SYSTEM_ENDPOINT'
});

export const NotificationChannels = Object.freeze({
  EXECUTIVE: 'EXECUTIVE',
  EMAIL: 'EMAIL',
  WEBHOOK: 'WEBHOOK',
  SMS: 'SMS',
  PUSH: 'PUSH',
  IN_APP: 'IN_APP'
});

export const NotificationV1Channels = Object.freeze([
  NotificationChannels.EXECUTIVE,
  NotificationChannels.EMAIL,
  NotificationChannels.WEBHOOK
]);

export const NotificationReservedChannels = Object.freeze([
  NotificationChannels.SMS,
  NotificationChannels.PUSH,
  NotificationChannels.IN_APP
]);

export const NotificationUrgencyLevels = Object.freeze({
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

export const NotificationIntentStates = Object.freeze({
  CREATED: 'CREATED',
  POLICY_PENDING: 'POLICY_PENDING',
  BLOCKED: 'BLOCKED',
  DEFERRED: 'DEFERRED',
  APPROVAL_PENDING: 'APPROVAL_PENDING',
  ELIGIBLE: 'ELIGIBLE',
  COMPOSITION_PENDING: 'COMPOSITION_PENDING',
  COMPOSED: 'COMPOSED',
  JOBS_CREATED: 'JOBS_CREATED',
  EXPIRED: 'EXPIRED',
  CLOSED: 'CLOSED'
});

export const NotificationPolicyOutcomes = Object.freeze({
  ALLOW: 'ALLOW',
  BLOCK: 'BLOCK',
  DEFER: 'DEFER',
  REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
  SUPPRESS_DUPLICATE: 'SUPPRESS_DUPLICATE',
  SUPPRESS_PREFERENCE: 'SUPPRESS_PREFERENCE',
  SUPPRESS_RATE_LIMIT: 'SUPPRESS_RATE_LIMIT',
  OVERRIDE_FOR_SECURITY: 'OVERRIDE_FOR_SECURITY'
});

export const NotificationCompositionStates = Object.freeze({
  PENDING: 'PENDING',
  RENDERED: 'RENDERED',
  VERIFIED: 'VERIFIED',
  FROZEN: 'FROZEN'
});

export const NotificationDeliveryJobStates = Object.freeze({
  RECEIVED: 'RECEIVED',
  POLICY_BLOCKED: 'POLICY_BLOCKED',
  APPROVAL_PENDING: 'APPROVAL_PENDING',
  COMPOSED: 'COMPOSED',
  QUEUED: 'QUEUED',
  DISPATCHING: 'DISPATCHING',
  DELIVERED: 'DELIVERED',
  DELIVERY_FAILED_RETRYABLE: 'DELIVERY_FAILED_RETRYABLE',
  DELIVERY_FAILED_TERMINAL: 'DELIVERY_FAILED_TERMINAL',
  DEAD_LETTERED: 'DEAD_LETTERED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
});

export const NotificationDeliveryAttemptOutcomes = Object.freeze({
  SUCCEEDED: 'SUCCEEDED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_TERMINAL: 'FAILED_TERMINAL',
  UNKNOWN: 'UNKNOWN'
});

export const NotificationTemplateStates = Object.freeze({
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED'
});

export const NotificationConsentStates = Object.freeze({
  OPTED_IN: 'OPTED_IN',
  OPTED_OUT: 'OPTED_OUT',
  REQUIRED_TRANSACTIONAL: 'REQUIRED_TRANSACTIONAL',
  REQUIRED_TRANSACTIONAL_ONLY: 'REQUIRED_TRANSACTIONAL',
  REQUIRED_SECURITY: 'REQUIRED_SECURITY',
  UNKNOWN: 'UNKNOWN'
});

export const NotificationProviderHealthStates = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
  NOT_CONFIGURED: 'NOT_CONFIGURED'
});

export const NotificationFailureClasses = Object.freeze({
  INVALID_EVENT: 'INVALID_EVENT',
  POLICY_BLOCKED: 'POLICY_BLOCKED',
  TEMPLATE_FAILURE: 'TEMPLATE_FAILURE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_REJECTED: 'PROVIDER_REJECTED',
  RECIPIENT_INVALID: 'RECIPIENT_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  PERSISTENCE_FAILURE: 'PERSISTENCE_FAILURE',
  CONFIGURATION_FAILURE: 'CONFIGURATION_FAILURE',
  DELIVERY_UNKNOWN: 'DELIVERY_UNKNOWN'
});

export const NotificationFailureMetadata = Object.freeze({
  [NotificationFailureClasses.INVALID_EVENT]: Object.freeze({ retryable: false, terminal: true, approvalRequired: false, securitySignificant: false, customerVisible: false, executiveVisible: true }),
  [NotificationFailureClasses.POLICY_BLOCKED]: Object.freeze({ retryable: false, terminal: true, approvalRequired: false, securitySignificant: false, customerVisible: false, executiveVisible: true }),
  [NotificationFailureClasses.TEMPLATE_FAILURE]: Object.freeze({ retryable: false, terminal: true, approvalRequired: true, securitySignificant: false, customerVisible: false, executiveVisible: true }),
  [NotificationFailureClasses.PROVIDER_UNAVAILABLE]: Object.freeze({ retryable: true, terminal: false, approvalRequired: false, securitySignificant: false, customerVisible: false, executiveVisible: true }),
  [NotificationFailureClasses.PROVIDER_REJECTED]: Object.freeze({ retryable: false, terminal: true, approvalRequired: false, securitySignificant: false, customerVisible: true, executiveVisible: true }),
  [NotificationFailureClasses.RECIPIENT_INVALID]: Object.freeze({ retryable: false, terminal: true, approvalRequired: false, securitySignificant: false, customerVisible: true, executiveVisible: true }),
  [NotificationFailureClasses.RATE_LIMITED]: Object.freeze({ retryable: true, terminal: false, approvalRequired: false, securitySignificant: false, customerVisible: false, executiveVisible: true }),
  [NotificationFailureClasses.TIMEOUT]: Object.freeze({ retryable: true, terminal: false, approvalRequired: false, securitySignificant: false, customerVisible: false, executiveVisible: true }),
  [NotificationFailureClasses.PERSISTENCE_FAILURE]: Object.freeze({ retryable: true, terminal: false, approvalRequired: false, securitySignificant: true, customerVisible: false, executiveVisible: true }),
  [NotificationFailureClasses.CONFIGURATION_FAILURE]: Object.freeze({ retryable: false, terminal: true, approvalRequired: true, securitySignificant: true, customerVisible: false, executiveVisible: true }),
  [NotificationFailureClasses.DELIVERY_UNKNOWN]: Object.freeze({ retryable: true, terminal: false, approvalRequired: false, securitySignificant: false, customerVisible: false, executiveVisible: true })
});

export const NotificationIntentStateTransitions = Object.freeze({
  [NotificationIntentStates.CREATED]: Object.freeze([NotificationIntentStates.POLICY_PENDING, NotificationIntentStates.EXPIRED]),
  [NotificationIntentStates.POLICY_PENDING]: Object.freeze([
    NotificationIntentStates.BLOCKED,
    NotificationIntentStates.DEFERRED,
    NotificationIntentStates.APPROVAL_PENDING,
    NotificationIntentStates.ELIGIBLE,
    NotificationIntentStates.EXPIRED
  ]),
  [NotificationIntentStates.BLOCKED]: Object.freeze([NotificationIntentStates.CLOSED]),
  [NotificationIntentStates.DEFERRED]: Object.freeze([NotificationIntentStates.POLICY_PENDING, NotificationIntentStates.EXPIRED, NotificationIntentStates.CLOSED]),
  [NotificationIntentStates.APPROVAL_PENDING]: Object.freeze([
    NotificationIntentStates.POLICY_PENDING,
    NotificationIntentStates.ELIGIBLE,
    NotificationIntentStates.BLOCKED,
    NotificationIntentStates.EXPIRED,
    NotificationIntentStates.CLOSED
  ]),
  [NotificationIntentStates.ELIGIBLE]: Object.freeze([NotificationIntentStates.COMPOSITION_PENDING, NotificationIntentStates.EXPIRED]),
  [NotificationIntentStates.COMPOSITION_PENDING]: Object.freeze([NotificationIntentStates.COMPOSED, NotificationIntentStates.BLOCKED, NotificationIntentStates.EXPIRED]),
  [NotificationIntentStates.COMPOSED]: Object.freeze([NotificationIntentStates.JOBS_CREATED, NotificationIntentStates.EXPIRED]),
  [NotificationIntentStates.JOBS_CREATED]: Object.freeze([NotificationIntentStates.CLOSED, NotificationIntentStates.EXPIRED]),
  [NotificationIntentStates.EXPIRED]: Object.freeze([NotificationIntentStates.CLOSED]),
  [NotificationIntentStates.CLOSED]: Object.freeze([])
});

export const NotificationDeliveryJobStateTransitions = Object.freeze({
  [NotificationDeliveryJobStates.RECEIVED]: Object.freeze([
    NotificationDeliveryJobStates.POLICY_BLOCKED,
    NotificationDeliveryJobStates.APPROVAL_PENDING,
    NotificationDeliveryJobStates.COMPOSED,
    NotificationDeliveryJobStates.CANCELLED,
    NotificationDeliveryJobStates.EXPIRED
  ]),
  [NotificationDeliveryJobStates.POLICY_BLOCKED]: Object.freeze([NotificationDeliveryJobStates.CANCELLED]),
  [NotificationDeliveryJobStates.APPROVAL_PENDING]: Object.freeze([
    NotificationDeliveryJobStates.COMPOSED,
    NotificationDeliveryJobStates.CANCELLED,
    NotificationDeliveryJobStates.EXPIRED
  ]),
  [NotificationDeliveryJobStates.COMPOSED]: Object.freeze([
    NotificationDeliveryJobStates.QUEUED,
    NotificationDeliveryJobStates.CANCELLED,
    NotificationDeliveryJobStates.EXPIRED
  ]),
  [NotificationDeliveryJobStates.QUEUED]: Object.freeze([
    NotificationDeliveryJobStates.DISPATCHING,
    NotificationDeliveryJobStates.CANCELLED,
    NotificationDeliveryJobStates.EXPIRED
  ]),
  [NotificationDeliveryJobStates.DISPATCHING]: Object.freeze([
    NotificationDeliveryJobStates.DELIVERED,
    NotificationDeliveryJobStates.DELIVERY_FAILED_RETRYABLE,
    NotificationDeliveryJobStates.DELIVERY_FAILED_TERMINAL,
    NotificationDeliveryJobStates.EXPIRED
  ]),
  [NotificationDeliveryJobStates.DELIVERY_FAILED_RETRYABLE]: Object.freeze([
    NotificationDeliveryJobStates.QUEUED,
    NotificationDeliveryJobStates.DELIVERY_FAILED_TERMINAL,
    NotificationDeliveryJobStates.DEAD_LETTERED,
    NotificationDeliveryJobStates.CANCELLED,
    NotificationDeliveryJobStates.EXPIRED
  ]),
  [NotificationDeliveryJobStates.DELIVERY_FAILED_TERMINAL]: Object.freeze([
    NotificationDeliveryJobStates.DEAD_LETTERED,
    NotificationDeliveryJobStates.CANCELLED
  ]),
  [NotificationDeliveryJobStates.DEAD_LETTERED]: Object.freeze([NotificationDeliveryJobStates.CANCELLED]),
  [NotificationDeliveryJobStates.DELIVERED]: Object.freeze([]),
  [NotificationDeliveryJobStates.CANCELLED]: Object.freeze([]),
  [NotificationDeliveryJobStates.EXPIRED]: Object.freeze([])
});

export function isAdditiveCompatibleVersion(version) {
  const parsed = parseSemver(version);
  if (!parsed) return false;
  return parsed.major === CONTRACT_MAJOR_VERSION;
}

export function validateDomainEventEnvelope(event = {}) {
  const issues = [];
  if (!isObject(event)) {
    return { isValid: false, issues: ['event envelope must be an object.'] };
  }

  validateIdField('eventId', event.eventId, issues, { required: true });
  if (!hasText(event.eventType)) issues.push('eventType is required.');
  if (!hasText(event.eventVersion)) issues.push('eventVersion is required.');
  if (hasText(event.eventVersion) && !SEMVER_PATTERN.test(String(event.eventVersion))) {
    issues.push('eventVersion must be semantic version format.');
  }
  if (hasText(event.eventVersion) && !isAdditiveCompatibleVersion(event.eventVersion)) {
    issues.push(`eventVersion major must be ${CONTRACT_MAJOR_VERSION}.`);
  }

  if (!isIsoTimestamp(event.occurredAt)) issues.push('occurredAt must be valid timestamp.');
  if (!isIsoTimestamp(event.recordedAt)) issues.push('recordedAt must be valid timestamp.');
  if (!hasText(event.sourceSystem)) issues.push('sourceSystem is required.');
  if (!hasText(event.sourceEntityType)) issues.push('sourceEntityType is required.');
  validateIdField('sourceEntityId', event.sourceEntityId, issues, { required: true });
  validateIdField('businessId', event.businessId, issues, { required: true });
  validateIdField('customerId', event.customerId, issues, { required: false });
  validateIdField('missionId', event.missionId, issues, { required: false });
  validateIdField('correlationId', event.correlationId, issues, { required: true });
  validateIdField('causationId', event.causationId, issues, { required: false });

  if (!Object.values(NotificationSensitivityLevels).includes(String(event.sensitivity ?? '').toUpperCase())) {
    issues.push(`sensitivity must be one of: ${Object.values(NotificationSensitivityLevels).join(', ')}.`);
  }

  if (!isObject(event.payload)) issues.push('payload must be an object.');
  if (event.metadata != null && !isObject(event.metadata)) issues.push('metadata must be an object when provided.');

  if (isObject(event.payload)) {
    const findings = recursiveForbiddenInstructionScan(event.payload, 'payload');
    if (findings.length > 0) {
      issues.push(`payload contains forbidden provider/channel instruction keys at: ${findings.join(', ')}`);
    }
  }

  if (isObject(event.metadata)) {
    const findings = recursiveForbiddenInstructionScan(event.metadata, 'metadata');
    if (findings.length > 0) {
      issues.push(`metadata contains forbidden provider/channel instruction keys at: ${findings.join(', ')}`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function createDomainEventEnvelope({
  eventId,
  eventType,
  eventVersion = NotificationContractVersions.DOMAIN_EVENT,
  occurredAt,
  recordedAt,
  sourceSystem,
  sourceEntityType,
  sourceEntityId,
  businessId,
  customerId = null,
  missionId = null,
  correlationId,
  causationId = null,
  sensitivity = NotificationSensitivityLevels.INTERNAL,
  payload = {},
  metadata = {},
  now
} = {}) {
  const normalized = {
    eventId: normalizeId(eventId, 'evt'),
    eventType: String(eventType ?? '').trim(),
    eventVersion: String(eventVersion ?? NotificationContractVersions.DOMAIN_EVENT).trim(),
    occurredAt: String(occurredAt ?? nowIso(now)).trim(),
    recordedAt: String(recordedAt ?? nowIso(now)).trim(),
    sourceSystem: String(sourceSystem ?? '').trim(),
    sourceEntityType: String(sourceEntityType ?? '').trim(),
    sourceEntityId: String(sourceEntityId ?? '').trim(),
    businessId: String(businessId ?? '').trim(),
    customerId: hasText(customerId) ? String(customerId).trim() : null,
    missionId: hasText(missionId) ? String(missionId).trim() : null,
    correlationId: normalizeId(correlationId, 'corr'),
    causationId: hasText(causationId) ? String(causationId).trim() : null,
    sensitivity: String(sensitivity ?? NotificationSensitivityLevels.INTERNAL).trim().toUpperCase(),
    payload: cloneJson(payload, {}),
    metadata: cloneJson(metadata, {})
  };

  const validation = validateDomainEventEnvelope(normalized);
  if (!validation.isValid) {
    throw new Error(`DomainEventEnvelope invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function serializeDomainEventForAudit(event = {}) {
  const normalized = cloneJson(event, {});
  return deepFreeze({
    eventId: normalized.eventId ?? null,
    eventType: normalized.eventType ?? null,
    eventVersion: normalized.eventVersion ?? null,
    occurredAt: normalized.occurredAt ?? null,
    recordedAt: normalized.recordedAt ?? null,
    sourceSystem: normalized.sourceSystem ?? null,
    sourceEntityType: normalized.sourceEntityType ?? null,
    sourceEntityId: normalized.sourceEntityId ?? null,
    businessId: normalized.businessId ?? null,
    customerId: normalized.customerId ?? null,
    missionId: normalized.missionId ?? null,
    correlationId: normalized.correlationId ?? null,
    causationId: normalized.causationId ?? null,
    sensitivity: normalized.sensitivity ?? null,
    payload: redactAuditValue(normalized.payload ?? {}, 'payload'),
    metadata: redactAuditValue(normalized.metadata ?? {}, 'metadata')
  });
}

export function validateNotificationIntent(intent = {}) {
  const issues = [];
  if (!isObject(intent)) return { isValid: false, issues: ['intent must be an object.'] };

  validateIdField('intentId', intent.intentId, issues, { required: true });
  validateIdField('sourceEventId', intent.sourceEventId, issues, { required: true });
  if (!hasText(intent.notificationType)) issues.push('notificationType is required.');

  if (!Object.values(NotificationIntentClassifications).includes(String(intent.classification ?? '').toUpperCase())) {
    issues.push(`classification must be one of: ${Object.values(NotificationIntentClassifications).join(', ')}.`);
  }

  if (!Object.values(NotificationAudienceTypes).includes(String(intent.audienceType ?? '').toUpperCase())) {
    issues.push(`audienceType must be one of: ${Object.values(NotificationAudienceTypes).join(', ')}.`);
  }

  if (!Array.isArray(intent.recipientRefs) || intent.recipientRefs.length === 0) {
    issues.push('recipientRefs must include at least one recipient reference.');
  }

  if (!Array.isArray(intent.candidateChannels) || intent.candidateChannels.length === 0) {
    issues.push('candidateChannels must include at least one channel.');
  } else {
    intent.candidateChannels.forEach((channel) => {
      if (!Object.values(NotificationChannels).includes(String(channel ?? '').toUpperCase())) {
        issues.push(`candidateChannels contains unsupported channel: ${channel}`);
      }
    });
  }

  if (!isObject(intent.templateRef)) issues.push('templateRef is required and must be an object.');
  if (!Object.values(NotificationUrgencyLevels).includes(String(intent.urgency ?? '').toUpperCase())) {
    issues.push(`urgency must be one of: ${Object.values(NotificationUrgencyLevels).join(', ')}.`);
  }

  if (!isObject(intent.governanceRequirements)) issues.push('governanceRequirements must be an object.');
  if (!isObject(intent.consentRequirements)) issues.push('consentRequirements must be an object.');
  if (!isObject(intent.schedulingConstraints)) issues.push('schedulingConstraints must be an object.');

  if (!hasText(intent.dedupeKey)) issues.push('dedupeKey is required.');
  if (!isIsoTimestamp(intent.expiresAt)) issues.push('expiresAt must be valid timestamp.');

  validateIdField('correlationId', intent.correlationId, issues, { required: true });
  validateIdField('causationId', intent.causationId, issues, { required: false });
  validateIdField('businessId', intent.businessId, issues, { required: true });
  validateIdField('customerId', intent.customerId, issues, { required: false });
  validateIdField('missionId', intent.missionId, issues, { required: false });

  if (!Object.values(NotificationIntentStates).includes(String(intent.state ?? '').toUpperCase())) {
    issues.push(`state must be one of: ${Object.values(NotificationIntentStates).join(', ')}.`);
  }

  return { isValid: issues.length === 0, issues };
}

export function createNotificationIntent({
  intentId,
  sourceEventId,
  notificationType,
  classification,
  audienceType,
  recipientRefs,
  candidateChannels,
  templateRef,
  urgency = NotificationUrgencyLevels.NORMAL,
  governanceRequirements = {},
  consentRequirements = {},
  schedulingConstraints = {},
  dedupeKey,
  expiresAt,
  correlationId,
  causationId = null,
  businessId,
  customerId = null,
  missionId = null,
  state = NotificationIntentStates.CREATED,
  metadata = {}
} = {}) {
  const normalized = {
    intentId: normalizeId(intentId, 'nint'),
    sourceEventId: String(sourceEventId ?? '').trim(),
    notificationType: String(notificationType ?? '').trim(),
    classification: String(classification ?? '').trim().toUpperCase(),
    audienceType: String(audienceType ?? '').trim().toUpperCase(),
    recipientRefs: cloneJson(recipientRefs, []),
    candidateChannels: cloneJson(candidateChannels, []).map((channel) => String(channel ?? '').trim().toUpperCase()),
    templateRef: cloneJson(templateRef, {}),
    urgency: String(urgency ?? NotificationUrgencyLevels.NORMAL).trim().toUpperCase(),
    governanceRequirements: cloneJson(governanceRequirements, {}),
    consentRequirements: cloneJson(consentRequirements, {}),
    schedulingConstraints: cloneJson(schedulingConstraints, {}),
    dedupeKey: String(dedupeKey ?? stableHash(`${sourceEventId}:${notificationType}`)).trim(),
    expiresAt: String(expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()).trim(),
    correlationId: normalizeId(correlationId, 'corr'),
    causationId: hasText(causationId) ? String(causationId).trim() : null,
    businessId: String(businessId ?? '').trim(),
    customerId: hasText(customerId) ? String(customerId).trim() : null,
    missionId: hasText(missionId) ? String(missionId).trim() : null,
    state: String(state ?? NotificationIntentStates.CREATED).trim().toUpperCase(),
    metadata: cloneJson(metadata, {})
  };

  const validation = validateNotificationIntent(normalized);
  if (!validation.isValid) {
    throw new Error(`NotificationIntent invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function validateIntentStateTransition({ fromState, toState } = {}) {
  const from = String(fromState ?? '').trim().toUpperCase();
  const to = String(toState ?? '').trim().toUpperCase();

  if (!Object.values(NotificationIntentStates).includes(from)) {
    return { isValid: false, reason: `Unknown intent state: ${fromState}` };
  }

  if (!Object.values(NotificationIntentStates).includes(to)) {
    return { isValid: false, reason: `Unknown intent transition target: ${toState}` };
  }

  const supported = NotificationIntentStateTransitions[from] ?? [];
  if (supported.includes(to)) {
    return { isValid: true, reason: null };
  }

  return { isValid: false, reason: `Invalid intent state transition ${from} -> ${to}.` };
}

export function validateNotificationPolicyDecision(decision = {}) {
  const issues = [];
  if (!isObject(decision)) return { isValid: false, issues: ['decision must be an object.'] };

  validateIdField('decisionId', decision.decisionId, issues, { required: true });
  validateIdField('intentId', decision.intentId, issues, { required: true });
  if (!Object.values(NotificationPolicyOutcomes).includes(String(decision.outcome ?? '').toUpperCase())) {
    issues.push(`outcome must be one of: ${Object.values(NotificationPolicyOutcomes).join(', ')}.`);
  }
  if (!Array.isArray(decision.reasonCodes)) issues.push('reasonCodes must be an array.');
  if (!isIsoTimestamp(decision.evaluatedAt)) issues.push('evaluatedAt must be valid timestamp.');
  if (!hasText(decision.inputsSnapshotHash) || !/^[a-f0-9]{64}$/i.test(String(decision.inputsSnapshotHash))) {
    issues.push('inputsSnapshotHash must be a sha256 hash string.');
  }
  if (!hasText(decision.policyVersion) || !SEMVER_PATTERN.test(String(decision.policyVersion))) {
    issues.push('policyVersion must be semantic version format.');
  }
  validateIdField('correlationId', decision.correlationId, issues, { required: true });

  return { isValid: issues.length === 0, issues };
}

export function createNotificationPolicyDecision({
  decisionId,
  intentId,
  outcome,
  reasonCodes = [],
  evaluatedAt,
  inputsSnapshotHash,
  policyVersion = '1.0.0',
  correlationId
} = {}) {
  const normalized = {
    decisionId: normalizeId(decisionId, 'ndec'),
    intentId: String(intentId ?? '').trim(),
    outcome: String(outcome ?? '').trim().toUpperCase(),
    reasonCodes: Array.isArray(reasonCodes) ? [...reasonCodes].map((item) => String(item ?? '').trim()).filter(Boolean) : [],
    evaluatedAt: String(evaluatedAt ?? nowIso()).trim(),
    inputsSnapshotHash: String(inputsSnapshotHash ?? stableHash(JSON.stringify({ intentId, outcome, reasonCodes }))).trim().toLowerCase(),
    policyVersion: String(policyVersion ?? '1.0.0').trim(),
    correlationId: normalizeId(correlationId, 'corr')
  };

  const validation = validateNotificationPolicyDecision(normalized);
  if (!validation.isValid) {
    throw new Error(`NotificationPolicyDecision invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function validateNotificationComposition(composition = {}) {
  const issues = [];
  if (!isObject(composition)) return { isValid: false, issues: ['composition must be an object.'] };

  validateIdField('compositionId', composition.compositionId, issues, { required: true });
  validateIdField('intentId', composition.intentId, issues, { required: true });
  if (!hasText(composition.templateId)) issues.push('templateId is required.');
  if (!hasText(composition.templateVersion) || !SEMVER_PATTERN.test(String(composition.templateVersion))) {
    issues.push('templateVersion must be semantic version format.');
  }

  if (!Object.values(NotificationChannels).includes(String(composition.channel ?? '').toUpperCase())) {
    issues.push(`channel must be one of: ${Object.values(NotificationChannels).join(', ')}.`);
  }

  if (!hasText(composition.locale) || !LOCALE_PATTERN.test(String(composition.locale))) {
    issues.push('locale must be valid IETF-like locale (e.g., en or en-US).');
  }

  if (!hasText(composition.renderSchemaVersion) || !SEMVER_PATTERN.test(String(composition.renderSchemaVersion))) {
    issues.push('renderSchemaVersion must be semantic version format.');
  }

  if (!hasText(composition.contentRef)) issues.push('contentRef is required.');
  if (!hasText(composition.contentIntegrityHash) || !/^[a-f0-9]{64}$/i.test(String(composition.contentIntegrityHash))) {
    issues.push('contentIntegrityHash must be a sha256 hash string.');
  }

  if (!Object.values(NotificationCompositionStates).includes(String(composition.state ?? '').toUpperCase())) {
    issues.push(`state must be one of: ${Object.values(NotificationCompositionStates).join(', ')}.`);
  }

  if (!isIsoTimestamp(composition.createdAt)) issues.push('createdAt must be valid timestamp.');
  if (composition.frozenAt != null && !isIsoTimestamp(composition.frozenAt)) issues.push('frozenAt must be valid timestamp when provided.');

  return { isValid: issues.length === 0, issues };
}

export function createNotificationComposition({
  compositionId,
  intentId,
  templateId,
  templateVersion,
  channel,
  locale = 'en-US',
  renderSchemaVersion = '1.0.0',
  contentRef,
  contentIntegrityHash,
  state = NotificationCompositionStates.PENDING,
  createdAt,
  frozenAt = null
} = {}) {
  const normalized = {
    compositionId: normalizeId(compositionId, 'ncmp'),
    intentId: String(intentId ?? '').trim(),
    templateId: String(templateId ?? '').trim(),
    templateVersion: String(templateVersion ?? '').trim(),
    channel: String(channel ?? '').trim().toUpperCase(),
    locale: String(locale ?? 'en-US').trim(),
    renderSchemaVersion: String(renderSchemaVersion ?? '1.0.0').trim(),
    contentRef: String(contentRef ?? '').trim(),
    contentIntegrityHash: String(contentIntegrityHash ?? '').trim().toLowerCase(),
    state: String(state ?? NotificationCompositionStates.PENDING).trim().toUpperCase(),
    createdAt: String(createdAt ?? nowIso()).trim(),
    frozenAt: frozenAt == null ? null : String(frozenAt).trim()
  };

  const validation = validateNotificationComposition(normalized);
  if (!validation.isValid) {
    throw new Error(`NotificationComposition invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function validateNotificationDeliveryJob(job = {}) {
  const issues = [];
  if (!isObject(job)) return { isValid: false, issues: ['job must be an object.'] };

  validateIdField('jobId', job.jobId, issues, { required: true });
  validateIdField('intentId', job.intentId, issues, { required: true });
  if (!Object.values(NotificationChannels).includes(String(job.channel ?? '').toUpperCase())) {
    issues.push(`channel must be one of: ${Object.values(NotificationChannels).join(', ')}.`);
  }

  if (!hasText(job.providerId)) issues.push('providerId is required.');
  if (!isObject(job.recipient)) issues.push('recipient must be an object.');
  if (!hasText(job.templateVersion) || !SEMVER_PATTERN.test(String(job.templateVersion))) {
    issues.push('templateVersion must be semantic version format.');
  }

  if (!hasText(job.renderedContentRef)) issues.push('renderedContentRef is required.');
  if (!hasText(job.idempotencyKey)) issues.push('idempotencyKey is required.');

  const priority = Number(job.priority);
  if (!Number.isFinite(priority) || priority < 0 || priority > 100) {
    issues.push('priority must be a number between 0 and 100.');
  }

  if (!isIsoTimestamp(job.availableAt)) issues.push('availableAt must be valid timestamp.');

  const attemptCount = Number(job.attemptCount);
  if (!Number.isInteger(attemptCount) || attemptCount < 0) {
    issues.push('attemptCount must be a non-negative integer.');
  }

  const maximumAttempts = Number(job.maximumAttempts);
  if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
    issues.push('maximumAttempts must be an integer >= 1.');
  }

  if (!Object.values(NotificationDeliveryJobStates).includes(String(job.status ?? '').toUpperCase())) {
    issues.push(`status must be one of: ${Object.values(NotificationDeliveryJobStates).join(', ')}.`);
  }

  if (job.lastErrorClass != null) {
    const errorClass = String(job.lastErrorClass).trim().toUpperCase();
    if (!Object.values(NotificationFailureClasses).includes(errorClass)) {
      issues.push(`lastErrorClass must be one of: ${Object.values(NotificationFailureClasses).join(', ')}.`);
    }
  }

  const version = Number(job.version);
  if (!Number.isInteger(version) || version < 1) {
    issues.push('version must be a positive integer.');
  }

  if (!isObject(job.lease)) {
    issues.push('lease metadata object is required.');
  } else {
    if (job.lease.expiresAt != null && !isIsoTimestamp(job.lease.expiresAt)) {
      issues.push('lease.expiresAt must be valid timestamp when provided.');
    }
  }

  if (!isIsoTimestamp(job.createdAt)) issues.push('createdAt must be valid timestamp.');
  if (!isIsoTimestamp(job.updatedAt)) issues.push('updatedAt must be valid timestamp.');

  validateIdField('correlationId', job.correlationId, issues, { required: true });
  validateIdField('businessId', job.businessId, issues, { required: true });
  validateIdField('customerId', job.customerId, issues, { required: false });

  return { isValid: issues.length === 0, issues };
}

export function createNotificationDeliveryJob({
  jobId,
  intentId,
  channel,
  providerId,
  recipient,
  templateVersion,
  renderedContentRef,
  idempotencyKey,
  priority = 50,
  availableAt,
  attemptCount = 0,
  maximumAttempts = 5,
  status = NotificationDeliveryJobStates.RECEIVED,
  lastErrorClass = null,
  providerMessageId = null,
  version = 1,
  lease = {},
  createdAt,
  updatedAt,
  lastAttemptAt = null,
  correlationId,
  businessId,
  customerId = null
} = {}) {
  const timestamp = nowIso();
  const normalized = {
    jobId: normalizeId(jobId, 'njob'),
    intentId: String(intentId ?? '').trim(),
    channel: String(channel ?? '').trim().toUpperCase(),
    providerId: String(providerId ?? '').trim(),
    recipient: cloneJson(recipient, {}),
    templateVersion: String(templateVersion ?? '').trim(),
    renderedContentRef: String(renderedContentRef ?? '').trim(),
    idempotencyKey: String(idempotencyKey ?? '').trim(),
    priority: Number(priority ?? 50),
    availableAt: String(availableAt ?? timestamp).trim(),
    attemptCount: Number(attemptCount ?? 0),
    maximumAttempts: Number(maximumAttempts ?? 5),
    status: String(status ?? NotificationDeliveryJobStates.RECEIVED).trim().toUpperCase(),
    lastErrorClass: lastErrorClass == null ? null : String(lastErrorClass).trim().toUpperCase(),
    providerMessageId: providerMessageId == null ? null : String(providerMessageId).trim(),
    version: Number(version ?? 1),
    lease: {
      holderId: lease?.holderId ?? null,
      acquiredAt: lease?.acquiredAt ?? null,
      expiresAt: lease?.expiresAt ?? null,
      leaseVersion: Number(lease?.leaseVersion ?? 0)
    },
    createdAt: String(createdAt ?? timestamp).trim(),
    updatedAt: String(updatedAt ?? timestamp).trim(),
    lastAttemptAt: lastAttemptAt == null ? null : String(lastAttemptAt).trim(),
    correlationId: normalizeId(correlationId, 'corr'),
    businessId: String(businessId ?? '').trim(),
    customerId: hasText(customerId) ? String(customerId).trim() : null
  };

  const validation = validateNotificationDeliveryJob(normalized);
  if (!validation.isValid) {
    throw new Error(`NotificationDeliveryJob invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function validateDeliveryJobStateTransition({ fromState, toState } = {}) {
  const from = String(fromState ?? '').trim().toUpperCase();
  const to = String(toState ?? '').trim().toUpperCase();

  if (!Object.values(NotificationDeliveryJobStates).includes(from)) {
    return { isValid: false, reason: `Unknown delivery job state: ${fromState}` };
  }

  if (!Object.values(NotificationDeliveryJobStates).includes(to)) {
    return { isValid: false, reason: `Unknown delivery job transition target: ${toState}` };
  }

  const supported = NotificationDeliveryJobStateTransitions[from] ?? [];
  if (supported.includes(to)) return { isValid: true, reason: null };

  return { isValid: false, reason: `Invalid delivery job transition ${from} -> ${to}.` };
}

export function validateNotificationDeliveryAttempt(attempt = {}) {
  const issues = [];
  if (!isObject(attempt)) return { isValid: false, issues: ['delivery attempt must be an object.'] };

  validateIdField('attemptId', attempt.attemptId, issues, { required: true });
  validateIdField('jobId', attempt.jobId, issues, { required: true });

  const attemptNumber = Number(attempt.attemptNumber);
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    issues.push('attemptNumber must be an integer >= 1.');
  }

  if (!hasText(attempt.providerId)) issues.push('providerId is required.');
  if (!isIsoTimestamp(attempt.startedAt)) issues.push('startedAt must be valid timestamp.');
  if (!isIsoTimestamp(attempt.finishedAt)) issues.push('finishedAt must be valid timestamp.');
  if (!hasText(attempt.providerRequestRef)) issues.push('providerRequestRef is required.');

  if (!Object.values(NotificationDeliveryAttemptOutcomes).includes(String(attempt.outcome ?? '').toUpperCase())) {
    issues.push(`outcome must be one of: ${Object.values(NotificationDeliveryAttemptOutcomes).join(', ')}.`);
  }

  if (attempt.errorClass != null) {
    const errorClass = String(attempt.errorClass).trim().toUpperCase();
    if (!Object.values(NotificationFailureClasses).includes(errorClass)) {
      issues.push(`errorClass must be one of: ${Object.values(NotificationFailureClasses).join(', ')}.`);
    }
  }

  validateIdField('correlationId', attempt.correlationId, issues, { required: true });

  return { isValid: issues.length === 0, issues };
}

export function createNotificationDeliveryAttempt({
  attemptId,
  jobId,
  attemptNumber,
  providerId,
  startedAt,
  finishedAt,
  providerRequestRef,
  outcome,
  errorClass = null,
  correlationId
} = {}) {
  const now = nowIso();
  const normalized = {
    attemptId: normalizeId(attemptId, 'nattempt'),
    jobId: String(jobId ?? '').trim(),
    attemptNumber: Number(attemptNumber ?? 1),
    providerId: String(providerId ?? '').trim(),
    startedAt: String(startedAt ?? now).trim(),
    finishedAt: String(finishedAt ?? now).trim(),
    providerRequestRef: String(providerRequestRef ?? '').trim(),
    outcome: String(outcome ?? '').trim().toUpperCase(),
    errorClass: errorClass == null ? null : String(errorClass).trim().toUpperCase(),
    correlationId: normalizeId(correlationId, 'corr')
  };

  const validation = validateNotificationDeliveryAttempt(normalized);
  if (!validation.isValid) {
    throw new Error(`NotificationDeliveryAttempt invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function validateNotificationDeliveryResult(result = {}) {
  const issues = [];
  if (!isObject(result)) return { isValid: false, issues: ['delivery result must be an object.'] };

  validateIdField('resultId', result.resultId, issues, { required: true });
  validateIdField('jobId', result.jobId, issues, { required: true });
  validateIdField('attemptId', result.attemptId, issues, { required: true });

  if (!Object.values(NotificationDeliveryAttemptOutcomes).includes(String(result.outcome ?? '').toUpperCase())) {
    issues.push(`outcome must be one of: ${Object.values(NotificationDeliveryAttemptOutcomes).join(', ')}.`);
  }

  if (result.classifiedFailure != null) {
    const normalizedClass = String(result.classifiedFailure).trim().toUpperCase();
    if (!Object.values(NotificationFailureClasses).includes(normalizedClass)) {
      issues.push(`classifiedFailure must be one of: ${Object.values(NotificationFailureClasses).join(', ')}.`);
    }
  }

  ['retryable', 'terminal', 'customerVisible', 'executiveVisible'].forEach((flag) => {
    if (typeof result[flag] !== 'boolean') {
      issues.push(`${flag} must be boolean.`);
    }
  });

  if (!isIsoTimestamp(result.recordedAt)) issues.push('recordedAt must be valid timestamp.');

  return { isValid: issues.length === 0, issues };
}

export function createNotificationDeliveryResult({
  resultId,
  jobId,
  attemptId,
  outcome,
  providerMessageId = null,
  classifiedFailure = null,
  retryable,
  terminal,
  customerVisible,
  executiveVisible,
  recordedAt
} = {}) {
  const failure = classifiedFailure == null ? null : String(classifiedFailure).trim().toUpperCase();
  const metadata = failure ? NotificationFailureMetadata[failure] ?? null : null;

  const normalized = {
    resultId: normalizeId(resultId, 'nresult'),
    jobId: String(jobId ?? '').trim(),
    attemptId: String(attemptId ?? '').trim(),
    outcome: String(outcome ?? '').trim().toUpperCase(),
    providerMessageId: providerMessageId == null ? null : String(providerMessageId).trim(),
    classifiedFailure: failure,
    retryable: typeof retryable === 'boolean' ? retryable : Boolean(metadata?.retryable ?? false),
    terminal: typeof terminal === 'boolean' ? terminal : Boolean(metadata?.terminal ?? false),
    customerVisible: typeof customerVisible === 'boolean' ? customerVisible : Boolean(metadata?.customerVisible ?? false),
    executiveVisible: typeof executiveVisible === 'boolean' ? executiveVisible : Boolean(metadata?.executiveVisible ?? true),
    recordedAt: String(recordedAt ?? nowIso()).trim()
  };

  const validation = validateNotificationDeliveryResult(normalized);
  if (!validation.isValid) {
    throw new Error(`NotificationDeliveryResult invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function validateNotificationTemplate(template = {}) {
  const issues = [];
  if (!isObject(template)) return { isValid: false, issues: ['template must be an object.'] };

  if (!hasText(template.templateId)) issues.push('templateId is required.');
  if (!hasText(template.version) || !SEMVER_PATTERN.test(String(template.version))) {
    issues.push('version must be semantic version format.');
  }

  if (!hasText(template.notificationType)) issues.push('notificationType is required.');

  if (!Object.values(NotificationIntentClassifications).includes(String(template.classification ?? '').toUpperCase())) {
    issues.push(`classification must be one of: ${Object.values(NotificationIntentClassifications).join(', ')}.`);
  }

  if (!Object.values(NotificationChannels).includes(String(template.channel ?? '').toUpperCase())) {
    issues.push(`channel must be one of: ${Object.values(NotificationChannels).join(', ')}.`);
  }

  if (!hasText(template.businessScope)) issues.push('businessScope is required.');
  if (!hasText(template.locale) || !LOCALE_PATTERN.test(String(template.locale))) {
    issues.push('locale must be valid IETF-like locale (e.g., en or en-US).');
  }

  if (!Object.values(NotificationTemplateStates).includes(String(template.status ?? '').toUpperCase())) {
    issues.push(`status must be one of: ${Object.values(NotificationTemplateStates).join(', ')}.`);
  }

  if (!isObject(template.variableSchema)) issues.push('variableSchema must be an object.');
  if (!isObject(template.content)) issues.push('content must be an object.');
  if (!isObject(template.approvalMetadata)) issues.push('approvalMetadata must be an object.');

  if (!isIsoTimestamp(template.createdAt)) issues.push('createdAt must be valid timestamp.');
  if (template.activatedAt != null && !isIsoTimestamp(template.activatedAt)) issues.push('activatedAt must be valid timestamp when provided.');
  if (template.retiredAt != null && !isIsoTimestamp(template.retiredAt)) issues.push('retiredAt must be valid timestamp when provided.');

  return { isValid: issues.length === 0, issues };
}

export function createNotificationTemplate({
  templateId,
  version,
  notificationType,
  classification,
  channel,
  businessScope,
  locale = 'en-US',
  status = NotificationTemplateStates.DRAFT,
  variableSchema = {},
  content = {},
  approvalMetadata = {},
  createdAt,
  activatedAt = null,
  retiredAt = null
} = {}) {
  const normalized = {
    templateId: String(templateId ?? '').trim(),
    version: String(version ?? '').trim(),
    notificationType: String(notificationType ?? '').trim(),
    classification: String(classification ?? '').trim().toUpperCase(),
    channel: String(channel ?? '').trim().toUpperCase(),
    businessScope: String(businessScope ?? '').trim(),
    locale: String(locale ?? 'en-US').trim(),
    status: String(status ?? NotificationTemplateStates.DRAFT).trim().toUpperCase(),
    variableSchema: cloneJson(variableSchema, {}),
    content: cloneJson(content, {}),
    approvalMetadata: cloneJson(approvalMetadata, {}),
    createdAt: String(createdAt ?? nowIso()).trim(),
    activatedAt: activatedAt == null ? null : String(activatedAt).trim(),
    retiredAt: retiredAt == null ? null : String(retiredAt).trim()
  };

  const validation = validateNotificationTemplate(normalized);
  if (!validation.isValid) {
    throw new Error(`NotificationTemplate invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function validateNotificationProviderContract(provider = {}) {
  const issues = [];
  if (!isObject(provider)) return { isValid: false, issues: ['provider contract must be an object.'] };

  if (!hasText(provider.providerId)) issues.push('providerId is required.');
  if (!hasText(provider.name)) issues.push('name is required.');

  const capabilities = provider.capabilities;
  if (!isObject(capabilities)) {
    issues.push('capabilities object is required.');
  } else {
    ['supportsIdempotency', 'supportsAttachments', 'supportsProviderTemplates', 'healthReporting'].forEach((flag) => {
      if (typeof capabilities[flag] !== 'boolean') {
        issues.push(`capabilities.${flag} must be boolean.`);
      }
    });

    const maxBytes = Number(capabilities.maximumPayloadBytes);
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
      issues.push('capabilities.maximumPayloadBytes must be a positive integer.');
    }

    if (!Array.isArray(capabilities.supportedChannels) || capabilities.supportedChannels.length === 0) {
      issues.push('capabilities.supportedChannels must include at least one channel.');
    } else {
      capabilities.supportedChannels.forEach((channel) => {
        if (!Object.values(NotificationChannels).includes(String(channel ?? '').toUpperCase())) {
          issues.push(`capabilities.supportedChannels contains unsupported channel: ${channel}`);
        }
      });
    }
  }

  if (!Object.values(NotificationProviderHealthStates).includes(String(provider.healthState ?? '').toUpperCase())) {
    issues.push(`healthState must be one of: ${Object.values(NotificationProviderHealthStates).join(', ')}.`);
  }

  if (!hasText(provider.errorMapVersion) || !SEMVER_PATTERN.test(String(provider.errorMapVersion))) {
    issues.push('errorMapVersion must be semantic version format.');
  }

  return { isValid: issues.length === 0, issues };
}

export function createNotificationProviderContract({
  providerId,
  name,
  capabilities = {},
  healthState = NotificationProviderHealthStates.NOT_CONFIGURED,
  errorMapVersion = '1.0.0'
} = {}) {
  const normalized = {
    providerId: String(providerId ?? '').trim(),
    name: String(name ?? '').trim(),
    capabilities: {
      supportsIdempotency: Boolean(capabilities.supportsIdempotency),
      supportsAttachments: Boolean(capabilities.supportsAttachments),
      supportsProviderTemplates: Boolean(capabilities.supportsProviderTemplates),
      maximumPayloadBytes: Number(capabilities.maximumPayloadBytes ?? 262144),
      supportedChannels: Array.isArray(capabilities.supportedChannels)
        ? capabilities.supportedChannels.map((channel) => String(channel ?? '').trim().toUpperCase())
        : [],
      healthReporting: Boolean(capabilities.healthReporting)
    },
    healthState: String(healthState ?? NotificationProviderHealthStates.NOT_CONFIGURED).trim().toUpperCase(),
    errorMapVersion: String(errorMapVersion ?? '1.0.0').trim()
  };

  const validation = validateNotificationProviderContract(normalized);
  if (!validation.isValid) {
    throw new Error(`NotificationProviderContract invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function createNotificationProviderResult({
  ok,
  providerId,
  providerMessageId = null,
  statusCode = null,
  error = null,
  metadata = {}
} = {}) {
  return deepFreeze({
    ok: Boolean(ok),
    providerId: String(providerId ?? '').trim(),
    providerMessageId: providerMessageId == null ? null : String(providerMessageId).trim(),
    statusCode: statusCode == null ? null : Number(statusCode),
    error: error == null ? null : createNotificationProviderError(error),
    metadata: cloneJson(metadata, {})
  });
}

export function createNotificationProviderError({
  classCode,
  message,
  retryable = false,
  providerRetryAfterMs = null,
  details = null
} = {}) {
  return deepFreeze({
    classCode: String(classCode ?? NotificationFailureClasses.DELIVERY_UNKNOWN).trim().toUpperCase(),
    message: String(message ?? 'Provider error').trim(),
    retryable: Boolean(retryable),
    providerRetryAfterMs: providerRetryAfterMs == null ? null : Number(providerRetryAfterMs),
    details: details == null ? null : cloneJson(details, {})
  });
}

export function validateConsentPreferenceRecord(record = {}) {
  const issues = [];
  if (!isObject(record)) return { isValid: false, issues: ['consent/preference record must be an object.'] };

  validateIdField('recordId', record.recordId, issues, { required: true });
  validateIdField('customerId', record.customerId, issues, { required: true });
  validateIdField('businessId', record.businessId, issues, { required: true });

  if (!Object.values(NotificationChannels).includes(String(record.channel ?? '').toUpperCase())) {
    issues.push(`channel must be one of: ${Object.values(NotificationChannels).join(', ')}.`);
  }

  if (!Object.values(NotificationIntentClassifications).includes(String(record.notificationClass ?? '').toUpperCase())) {
    issues.push(`notificationClass must be one of: ${Object.values(NotificationIntentClassifications).join(', ')}.`);
  }

  if (!Object.values(NotificationConsentStates).includes(String(record.consentState ?? '').toUpperCase())) {
    issues.push(`consentState must be one of: ${Object.values(NotificationConsentStates).join(', ')}.`);
  }

  if (!hasText(record.source)) issues.push('source is required.');
  if (!isIsoTimestamp(record.updatedAt)) issues.push('updatedAt must be valid timestamp.');

  const version = Number(record.version);
  if (!Number.isInteger(version) || version < 1) {
    issues.push('version must be integer >= 1.');
  }

  return { isValid: issues.length === 0, issues };
}

export function createConsentPreferenceRecord({
  recordId,
  customerId,
  businessId,
  channel,
  notificationClass,
  consentState,
  source,
  updatedAt,
  version = 1
} = {}) {
  const normalized = {
    recordId: normalizeId(recordId, 'nconsent'),
    customerId: String(customerId ?? '').trim(),
    businessId: String(businessId ?? '').trim(),
    channel: String(channel ?? '').trim().toUpperCase(),
    notificationClass: String(notificationClass ?? '').trim().toUpperCase(),
    consentState: String(consentState ?? NotificationConsentStates.UNKNOWN).trim().toUpperCase(),
    source: String(source ?? '').trim(),
    updatedAt: String(updatedAt ?? nowIso()).trim(),
    version: Number(version ?? 1)
  };

  const validation = validateConsentPreferenceRecord(normalized);
  if (!validation.isValid) {
    throw new Error(`ConsentPreferenceRecord invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function validateDeadLetterRecord(record = {}) {
  const issues = [];
  if (!isObject(record)) return { isValid: false, issues: ['dead-letter record must be an object.'] };

  validateIdField('deadLetterId', record.deadLetterId, issues, { required: true });
  validateIdField('jobId', record.jobId, issues, { required: true });
  if (!hasText(record.terminalReason)) issues.push('terminalReason is required.');
  if (!isIsoTimestamp(record.finalAttemptAt)) issues.push('finalAttemptAt must be valid timestamp.');
  if (typeof record.replayEligibility !== 'boolean') issues.push('replayEligibility must be boolean.');

  ['acknowledgedAt', 'replayedAt', 'closedAt'].forEach((field) => {
    if (record[field] != null && !isIsoTimestamp(record[field])) {
      issues.push(`${field} must be valid timestamp when provided.`);
    }
  });

  validateIdField('correlationId', record.correlationId, issues, { required: true });

  return { isValid: issues.length === 0, issues };
}

export function createDeadLetterRecord({
  deadLetterId,
  jobId,
  terminalReason,
  finalAttemptAt,
  replayEligibility = false,
  acknowledgedAt = null,
  replayedAt = null,
  closedAt = null,
  correlationId
} = {}) {
  const normalized = {
    deadLetterId: normalizeId(deadLetterId, 'ndlq'),
    jobId: String(jobId ?? '').trim(),
    terminalReason: String(terminalReason ?? '').trim(),
    finalAttemptAt: String(finalAttemptAt ?? nowIso()).trim(),
    replayEligibility: Boolean(replayEligibility),
    acknowledgedAt: acknowledgedAt == null ? null : String(acknowledgedAt).trim(),
    replayedAt: replayedAt == null ? null : String(replayedAt).trim(),
    closedAt: closedAt == null ? null : String(closedAt).trim(),
    correlationId: normalizeId(correlationId, 'corr')
  };

  const validation = validateDeadLetterRecord(normalized);
  if (!validation.isValid) {
    throw new Error(`DeadLetterRecord invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function getFailureClassMetadata(failureClass) {
  const normalized = String(failureClass ?? '').trim().toUpperCase();
  return NotificationFailureMetadata[normalized] ?? null;
}
