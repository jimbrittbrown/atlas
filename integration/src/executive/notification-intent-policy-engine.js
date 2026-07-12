import { createHash } from 'node:crypto';
import {
  appendEvent,
  getMetaMap,
  loadRecordMap,
  setMetaValue,
  upsertRecord
} from '../storage/provider-backed-state.js';
import {
  NotificationIntentClassifications,
  NotificationAudienceTypes,
  NotificationChannels,
  NotificationIntentStates,
  NotificationPolicyOutcomes,
  createNotificationIntent,
  createNotificationPolicyDecision,
  validateIntentStateTransition,
  validateDomainEventEnvelope,
  serializeDomainEventForAudit
} from './notification-domain-contracts.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function deterministicId(prefix, seed) {
  return `${prefix}_${stableHash(seed).slice(0, 24)}`;
}

function normalizeEventType(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeSourceEventIdentity(event) {
  return {
    sourceSystem: String(event?.sourceSystem ?? '').trim(),
    sourceEventId: String(event?.payload?.sourceEventId ?? event?.metadata?.sourceOwnership?.sourceEventId ?? event?.eventId ?? '').trim(),
    sourceEntityType: String(event?.sourceEntityType ?? event?.metadata?.sourceOwnership?.sourceEntityType ?? '').trim(),
    sourceEntityId: String(event?.sourceEntityId ?? event?.metadata?.sourceOwnership?.sourceEntityId ?? '').trim()
  };
}

function normalizeMappingKey(event = {}) {
  const type = normalizeEventType(event.eventType);
  const payload = asObject(event.payload);
  const data = asObject(payload.data);
  const details = asObject(data.details);
  const state = normalizeEventType(details.status ?? data.status);

  if (type === 'PAYMENT_SUCCEEDED' || (type === 'PAYMENT_PLATFORM.PAYMENT_STATUS_UPDATED' && state === 'SUCCEEDED')) {
    return 'PAYMENT_SUCCEEDED';
  }

  if (
    type === 'SIGNED_ARTIFACT_READY'
    || type.endsWith('.SIGNED_ARTIFACT_READY')
    || type === 'SIGNED_ARTIFACT_DELIVERY.AUTHORIZATION_ISSUED'
  ) {
    return 'SIGNED_ARTIFACT_READY';
  }

  if (type === 'MISSION_APPROVAL_REQUIRED' || type.endsWith('.MISSION_APPROVAL_REQUIRED')) {
    return 'MISSION_APPROVAL_REQUIRED';
  }

  if (type === 'IDENTITY_SECURITY_INCIDENT' || type.endsWith('.IDENTITY_SECURITY_INCIDENT')) {
    return 'IDENTITY_SECURITY_INCIDENT';
  }

  if (type === 'WEBSITE_PUBLISHED' || type.endsWith('.WEBSITE_PUBLISHED')) {
    return 'WEBSITE_PUBLISHED';
  }

  if (type === 'NOTIFICATION_DELIVERY_FAILED' || type.endsWith('.NOTIFICATION_DELIVERY_FAILED')) {
    return 'NOTIFICATION_DELIVERY_FAILED';
  }

  return '';
}

function defaultDedupeKey({ sourceEventId, notificationType, audienceType, recipientRef, businessId, customerId }) {
  return stableHash(JSON.stringify({
    sourceEventId,
    notificationType,
    audienceType,
    recipientRef,
    businessId,
    customerId
  }));
}

function buildRecipientRefsFromEvent(event = {}) {
  const refs = [];

  if (hasText(event.customerId)) refs.push({ type: 'CUSTOMER', id: event.customerId });
  if (hasText(event.businessId)) refs.push({ type: 'BUSINESS', id: event.businessId });
  if (hasText(event.missionId)) refs.push({ type: 'MISSION', id: event.missionId });

  if (refs.length === 0) refs.push({ type: 'SYSTEM', id: 'SYSTEM_INTERNAL' });
  return refs;
}

function firstRecipientId(recipientRefs = []) {
  const first = asArray(recipientRefs)[0] ?? {};
  return String(first.id ?? first.customerId ?? first.principalId ?? 'UNKNOWN').trim();
}

function toAuditIntent(intent) {
  return {
    intentId: intent.intentId,
    sourceEventId: intent.sourceEventId,
    notificationType: intent.notificationType,
    classification: intent.classification,
    audienceType: intent.audienceType,
    candidateChannels: intent.candidateChannels,
    urgency: intent.urgency,
    dedupeKey: intent.dedupeKey,
    state: intent.state,
    businessId: intent.businessId,
    customerId: intent.customerId,
    missionId: intent.missionId,
    correlationId: intent.correlationId,
    causationId: intent.causationId
  };
}

function policyReason(code, detail, priority) {
  return { code, detail, priority };
}

function freezeRecord(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.getOwnPropertyNames(value).forEach((key) => {
      const child = value[key];
      if (child && typeof child === 'object') freezeRecord(child);
    });
    Object.freeze(value);
  }
  return value;
}

export function createStaticPolicyInputAdapters({
  consentByIntentId = {},
  quietHoursByIntentId = {},
  rateLimitByIntentId = {},
  channelAvailabilityByIntentId = {},
  governanceByIntentId = {},
  businessRulesByIntentId = {}
} = {}) {
  return {
    consentPreferences: {
      getSnapshot(intent) {
        return asObject(consentByIntentId[intent.intentId], {
          allowed: true,
          reason: 'DEFAULT_ALLOW',
          mandatoryBypassAllowed: false
        });
      }
    },
    quietHours: {
      getSnapshot(intent) {
        return asObject(quietHoursByIntentId[intent.intentId], {
          active: false,
          timezone: 'UTC'
        });
      }
    },
    rateLimit: {
      getSnapshot(intent) {
        return asObject(rateLimitByIntentId[intent.intentId], {
          limited: false,
          window: 'NONE'
        });
      }
    },
    channelAvailability: {
      getSnapshot(intent) {
        return asObject(channelAvailabilityByIntentId[intent.intentId], {
          availableChannels: intent.candidateChannels,
          unavailableChannels: []
        });
      }
    },
    governanceApproval: {
      getSnapshot(intent) {
        return asObject(governanceByIntentId[intent.intentId], {
          requiresApproval: false,
          approvalState: 'NOT_REQUIRED',
          blocked: false,
          approvalReference: null
        });
      }
    },
    businessRules: {
      getSnapshot(intent) {
        return asObject(businessRulesByIntentId[intent.intentId], {
          mandatory: false,
          legalMandatory: false,
          explicitBlock: false,
          duplicateDetected: false,
          securityOverride: false
        });
      }
    }
  };
}

export const NotificationEventIntentMappings = Object.freeze({
  PAYMENT_SUCCEEDED: (event) => {
    const recipients = buildRecipientRefsFromEvent(event);
    const customerRecipient = recipients.find((item) => item.type === 'CUSTOMER') ?? recipients[0];
    const executiveRecipient = recipients.find((item) => item.type === 'BUSINESS') ?? recipients[0];

    return [
      {
        mappingId: 'PAYMENT_SUCCEEDED_CUSTOMER_RECEIPT',
        notificationType: 'PAYMENT_SUCCEEDED_RECEIPT',
        classification: NotificationIntentClassifications.TRANSACTIONAL,
        audienceType: NotificationAudienceTypes.CUSTOMER,
        recipientRefs: [customerRecipient],
        candidateChannels: [NotificationChannels.EMAIL, NotificationChannels.WEBHOOK],
        templateRef: { templateId: 'payment_succeeded_customer_receipt', templateVersion: '1.0.0' },
        urgency: 'NORMAL',
        governanceRequirements: { approvalRequired: false },
        consentRequirements: { requireOptIn: false, allowMandatoryBypass: true },
        schedulingConstraints: { respectQuietHours: false, maxDelayMinutes: 5 },
        expirationPolicyHours: 24
      },
      {
        mappingId: 'PAYMENT_SUCCEEDED_EXECUTIVE_AUDIT',
        notificationType: 'PAYMENT_SUCCEEDED_EXECUTIVE_AUDIT',
        classification: NotificationIntentClassifications.OPERATIONAL,
        audienceType: NotificationAudienceTypes.EXECUTIVE,
        recipientRefs: [executiveRecipient],
        candidateChannels: [NotificationChannels.EXECUTIVE],
        templateRef: { templateId: 'payment_succeeded_executive_audit', templateVersion: '1.0.0' },
        urgency: 'LOW',
        governanceRequirements: { approvalRequired: false },
        consentRequirements: { requireOptIn: false, allowMandatoryBypass: false },
        schedulingConstraints: { respectQuietHours: false, maxDelayMinutes: 30 },
        expirationPolicyHours: 24
      }
    ];
  },
  SIGNED_ARTIFACT_READY: (event) => {
    const recipients = buildRecipientRefsFromEvent(event);
    return [
      {
        mappingId: 'SIGNED_ARTIFACT_READY_CUSTOMER',
        notificationType: 'SIGNED_ARTIFACT_READY',
        classification: NotificationIntentClassifications.CUSTOMER_SUCCESS,
        audienceType: NotificationAudienceTypes.CUSTOMER,
        recipientRefs: [recipients.find((item) => item.type === 'CUSTOMER') ?? recipients[0]],
        candidateChannels: [NotificationChannels.EMAIL, NotificationChannels.WEBHOOK],
        templateRef: { templateId: 'signed_artifact_ready_customer', templateVersion: '1.0.0' },
        urgency: 'NORMAL',
        governanceRequirements: { approvalRequired: false },
        consentRequirements: { requireOptIn: true, allowMandatoryBypass: false },
        schedulingConstraints: { respectQuietHours: true, maxDelayMinutes: 240 },
        expirationPolicyHours: 72
      }
    ];
  },
  MISSION_APPROVAL_REQUIRED: (event) => {
    const recipients = buildRecipientRefsFromEvent(event);
    return [
      {
        mappingId: 'MISSION_APPROVAL_REQUIRED_EXECUTIVE',
        notificationType: 'MISSION_APPROVAL_REQUIRED',
        classification: NotificationIntentClassifications.EXECUTIVE,
        audienceType: NotificationAudienceTypes.EXECUTIVE,
        recipientRefs: [recipients.find((item) => item.type === 'BUSINESS') ?? recipients[0]],
        candidateChannels: [NotificationChannels.EXECUTIVE],
        templateRef: { templateId: 'mission_approval_required_executive', templateVersion: '1.0.0' },
        urgency: 'HIGH',
        governanceRequirements: { approvalRequired: true, approvalType: 'CEO' },
        consentRequirements: { requireOptIn: false, allowMandatoryBypass: false },
        schedulingConstraints: { respectQuietHours: false, maxDelayMinutes: 10 },
        expirationPolicyHours: 48
      }
    ];
  },
  IDENTITY_SECURITY_INCIDENT: (event) => {
    const recipients = buildRecipientRefsFromEvent(event);
    return [
      {
        mappingId: 'IDENTITY_SECURITY_INCIDENT_RESPONSE',
        notificationType: 'IDENTITY_SECURITY_INCIDENT',
        classification: NotificationIntentClassifications.SECURITY,
        audienceType: NotificationAudienceTypes.EXECUTIVE,
        recipientRefs: [recipients.find((item) => item.type === 'BUSINESS') ?? recipients[0]],
        candidateChannels: [NotificationChannels.EXECUTIVE, NotificationChannels.EMAIL],
        templateRef: { templateId: 'identity_security_incident', templateVersion: '1.0.0' },
        urgency: 'CRITICAL',
        governanceRequirements: { approvalRequired: false },
        consentRequirements: { requireOptIn: false, allowMandatoryBypass: true },
        schedulingConstraints: { respectQuietHours: false, maxDelayMinutes: 1 },
        expirationPolicyHours: 12
      }
    ];
  },
  WEBSITE_PUBLISHED: (event) => {
    const recipients = buildRecipientRefsFromEvent(event);
    return [
      {
        mappingId: 'WEBSITE_PUBLISHED_CUSTOMER',
        notificationType: 'WEBSITE_PUBLISHED',
        classification: NotificationIntentClassifications.CUSTOMER_SUCCESS,
        audienceType: NotificationAudienceTypes.CUSTOMER,
        recipientRefs: [recipients.find((item) => item.type === 'CUSTOMER') ?? recipients[0]],
        candidateChannels: [NotificationChannels.EMAIL],
        templateRef: { templateId: 'website_published_customer', templateVersion: '1.0.0' },
        urgency: 'NORMAL',
        governanceRequirements: { approvalRequired: false },
        consentRequirements: { requireOptIn: true, allowMandatoryBypass: false },
        schedulingConstraints: { respectQuietHours: true, maxDelayMinutes: 360 },
        expirationPolicyHours: 72
      }
    ];
  },
  NOTIFICATION_DELIVERY_FAILED: (event) => {
    const recipients = buildRecipientRefsFromEvent(event);
    return [
      {
        mappingId: 'NOTIFICATION_DELIVERY_FAILED_INTERNAL',
        notificationType: 'NOTIFICATION_DELIVERY_FAILED',
        classification: NotificationIntentClassifications.OPERATIONAL,
        audienceType: NotificationAudienceTypes.EXECUTIVE,
        recipientRefs: [recipients.find((item) => item.type === 'BUSINESS') ?? recipients[0]],
        candidateChannels: [NotificationChannels.EXECUTIVE],
        templateRef: { templateId: 'notification_delivery_failed_internal', templateVersion: '1.0.0' },
        urgency: 'HIGH',
        governanceRequirements: { approvalRequired: false },
        consentRequirements: { requireOptIn: false, allowMandatoryBypass: false },
        schedulingConstraints: { respectQuietHours: false, maxDelayMinutes: 5 },
        expirationPolicyHours: 24
      }
    ];
  }
});

export class NotificationIntentPolicyEngine {
  constructor({
    storageProvider,
    intakeLayer,
    policyAdapters = {},
    now,
    namespace = 'executive.notification-intent-policy'
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.intakeLayer = intakeLayer ?? null;
    this.now = now;
    this.namespace = namespace;

    this.intents = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.intents` });
    this.intentByDedupe = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.intent-by-dedupe` });
    this.intentBySourceEvent = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.intent-by-source-event` });
    this.policyDecisions = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.policy-decisions` });
    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` });
    this.telemetry = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry` });

    this.policyAdapters = {
      consentPreferences: policyAdapters.consentPreferences ?? { getSnapshot: () => ({ allowed: true, mandatoryBypassAllowed: false }) },
      quietHours: policyAdapters.quietHours ?? { getSnapshot: () => ({ active: false, timezone: 'UTC' }) },
      rateLimit: policyAdapters.rateLimit ?? { getSnapshot: () => ({ limited: false, window: 'NONE' }) },
      channelAvailability: policyAdapters.channelAvailability ?? { getSnapshot: (intent) => ({ availableChannels: intent.candidateChannels, unavailableChannels: [] }) },
      governanceApproval: policyAdapters.governanceApproval ?? { getSnapshot: () => ({ requiresApproval: false, approvalState: 'NOT_REQUIRED', blocked: false, approvalReference: null }) },
      businessRules: policyAdapters.businessRules ?? { getSnapshot: () => ({ mandatory: false, legalMandatory: false, explicitBlock: false, duplicateDetected: false, securityOverride: false }) }
    };
  }

  mapCanonicalEventToIntents(event = {}) {
    const envelopeValidation = validateDomainEventEnvelope(event);
    if (!envelopeValidation.isValid) {
      return {
        accepted: false,
        code: 'INVALID_CANONICAL_EVENT',
        issues: envelopeValidation.issues,
        intents: []
      };
    }

    const mappingKey = normalizeMappingKey(event);
    if (!mappingKey || !NotificationEventIntentMappings[mappingKey]) {
      return {
        accepted: false,
        code: 'UNSUPPORTED_EVENT_MAPPING',
        issues: [`Unsupported canonical mapping for eventType: ${event.eventType}`],
        intents: []
      };
    }

    const mappingDefinitions = NotificationEventIntentMappings[mappingKey](event);
    const sourceIdentity = normalizeSourceEventIdentity(event);

    const intents = mappingDefinitions.map((mapping) => {
      const dedupeKey = defaultDedupeKey({
        sourceEventId: sourceIdentity.sourceEventId || event.eventId,
        notificationType: mapping.notificationType,
        audienceType: mapping.audienceType,
        recipientRef: firstRecipientId(mapping.recipientRefs),
        businessId: event.businessId,
        customerId: event.customerId
      });

      const expiresAt = new Date(Date.parse(event.occurredAt) + Number(mapping.expirationPolicyHours ?? 24) * 60 * 60 * 1000).toISOString();

      return createNotificationIntent({
        sourceEventId: sourceIdentity.sourceEventId || event.eventId,
        notificationType: mapping.notificationType,
        classification: mapping.classification,
        audienceType: mapping.audienceType,
        recipientRefs: mapping.recipientRefs,
        candidateChannels: mapping.candidateChannels,
        templateRef: mapping.templateRef,
        urgency: mapping.urgency,
        governanceRequirements: mapping.governanceRequirements,
        consentRequirements: mapping.consentRequirements,
        schedulingConstraints: mapping.schedulingConstraints,
        dedupeKey,
        expiresAt,
        correlationId: event.correlationId,
        causationId: event.causationId,
        businessId: event.businessId,
        customerId: event.customerId,
        missionId: event.missionId,
        state: NotificationIntentStates.CREATED,
        metadata: {
          mappingKey,
          mappingId: mapping.mappingId,
          sourceSystem: sourceIdentity.sourceSystem,
          sourceEntityType: sourceIdentity.sourceEntityType,
          sourceEntityId: sourceIdentity.sourceEntityId
        }
      });
    });

    return {
      accepted: true,
      code: 'OK',
      mappingKey,
      intents
    };
  }

  createIntentsFromCanonicalEvent(event = {}) {
    const mapping = this.mapCanonicalEventToIntents(event);
    if (!mapping.accepted) {
      this.recordAudit('intent_mapping_failed', {
        code: mapping.code,
        issues: mapping.issues,
        event: serializeDomainEventForAudit(event)
      });
      return mapping;
    }

    const created = [];
    const duplicates = [];
    const sourceEventId = String(event.payload?.sourceEventId ?? event.eventId).trim();

    mapping.intents.forEach((intent) => {
      const existingIntentId = this.intentByDedupe.get(intent.dedupeKey) ?? null;
      if (existingIntentId) {
        const existing = this.intents.get(existingIntentId);
        if (existing) {
          duplicates.push(existing);
          return;
        }
      }

      const candidateIntentId = deterministicId('nint', intent.dedupeKey);
      const claim = this.claimIntentDedupe({ dedupeKey: intent.dedupeKey, intentId: candidateIntentId });
      if (!claim.accepted) {
        const duplicateIntent = this.resolveIntentById(claim.intentId);
        if (duplicateIntent) {
          duplicates.push(duplicateIntent);
        }
        return;
      }

      const record = {
        ...intent,
        intentId: candidateIntentId,
        sourceEventId,
        version: 1,
        createdAt: isoNow(this.now),
        updatedAt: isoNow(this.now),
        approvalReference: null,
        decisionHistory: []
      };

      this.intents.set(record.intentId, freezeRecord(record));
      upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.intents`, key: record.intentId, value: record });

      this.intentByDedupe.set(record.dedupeKey, record.intentId);
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.intent-by-dedupe`, key: record.dedupeKey, value: record.intentId });

      const sourceIndexKey = `${record.businessId}:${record.customerId ?? 'NONE'}:${sourceEventId}`;
      const existingSourceIndex = asArray(this.intentBySourceEvent.get(sourceIndexKey));
      this.intentBySourceEvent.set(sourceIndexKey, [...existingSourceIndex, record.intentId]);
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.intent-by-source-event`, key: sourceIndexKey, value: [...existingSourceIndex, record.intentId] });

      appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.intent-events`, key: record.intentId, value: record });
      this.incrementTelemetry(`intent.classification.${record.classification}.count`, 1);
      this.recordAudit('intent_created', { intent: toAuditIntent(record), sourceEventId });
      created.push(record);
    });

    if (duplicates.length > 0) {
      this.recordAudit('policy_duplicate_suppressed', {
        sourceEventId,
        duplicateIntentIds: duplicates.map((item) => item.intentId)
      });
      this.incrementTelemetry('policy.suppression.duplicate', duplicates.length);
    }

    return {
      accepted: true,
      code: 'OK',
      mappingKey: mapping.mappingKey,
      created,
      duplicates
    };
  }

  claimIntentDedupe({ dedupeKey, intentId } = {}) {
    const namespace = `${this.namespace}.intent-by-dedupe`;
    const key = String(dedupeKey ?? '').trim();
    const value = String(intentId ?? '').trim();
    if (!key || !value) return { accepted: false, intentId: null };

    if (typeof this.storageProvider?.initializeSync === 'function') {
      this.storageProvider.initializeSync();
      const inserted = this.storageProvider.database.prepare(
        `INSERT INTO storage_meta (namespace, meta_key, payload, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(namespace, meta_key) DO NOTHING`
      ).run(namespace, key, JSON.stringify(value), isoNow(this.now));

      if (Number(inserted?.changes ?? 0) === 1) {
        this.intentByDedupe.set(key, value);
        return { accepted: true, intentId: value };
      }

      const existing = this.storageProvider.getMetaSync?.(namespace, key)
        ?? this.storageProvider.getMeta?.(namespace, key)
        ?? this.intentByDedupe.get(key)
        ?? null;
      return { accepted: false, intentId: existing };
    }

    const existing = this.intentByDedupe.get(key) ?? null;
    if (existing) return { accepted: false, intentId: existing };

    this.intentByDedupe.set(key, value);
    setMetaValue({ provider: this.storageProvider, namespace, key, value });
    return { accepted: true, intentId: value };
  }

  resolveIntentById(intentId) {
    const key = String(intentId ?? '').trim();
    if (!key) return null;

    const inMemory = this.intents.get(key) ?? null;
    if (inMemory) return inMemory;

    if (this.storageProvider && typeof this.storageProvider.getStateRecord === 'function') {
      const record = this.storageProvider.getStateRecord({ namespace: `${this.namespace}.intents`, key });
      if (record?.ok && record.value) {
        const frozen = freezeRecord({ ...record.value });
        this.intents.set(key, frozen);
        return frozen;
      }
    }

    return null;
  }

  evaluateIntentPolicy({ intentId } = {}) {
    const current = this.intents.get(String(intentId ?? '').trim()) ?? null;
    if (!current) {
      return { accepted: false, code: 'INTENT_NOT_FOUND', reason: 'Intent not found.', decision: null };
    }

    const transitionPending = this.transitionIntentState({
      intentId: current.intentId,
      fromState: current.state,
      toState: NotificationIntentStates.POLICY_PENDING,
      reason: 'policy_evaluation_started'
    });

    if (!transitionPending.ok) {
      return {
        accepted: false,
        code: 'ILLEGAL_STATE_TRANSITION',
        reason: transitionPending.reason,
        decision: null
      };
    }

    const intent = this.intents.get(current.intentId) ?? current;
    const snapshots = this.collectPolicySnapshots(intent);
    const evaluation = this.evaluatePolicyOutcome({ intent, snapshots });

    const decision = createNotificationPolicyDecision({
      intentId: intent.intentId,
      outcome: evaluation.outcome,
      reasonCodes: evaluation.reasons.map((item) => item.code),
      evaluatedAt: isoNow(this.now),
      inputsSnapshotHash: stableHash(JSON.stringify({
        intentId: intent.intentId,
        classification: intent.classification,
        snapshots,
        precedence: evaluation.precedence
      })),
      policyVersion: '1.0.0',
      correlationId: intent.correlationId
    });

    const immutableDecision = freezeRecord({
      ...decision,
      intentVersion: intent.version,
      precedence: evaluation.precedence,
      reasons: evaluation.reasons,
      snapshots: {
        governance: snapshots.governance,
        consent: snapshots.consent,
        quietHours: snapshots.quietHours,
        rateLimit: snapshots.rateLimit,
        channelAvailability: snapshots.channelAvailability,
        businessRules: snapshots.businessRules
      }
    });

    this.policyDecisions.set(immutableDecision.decisionId, immutableDecision);
    upsertRecord({
      provider: this.storageProvider,
      namespace: `${this.namespace}.policy-decisions`,
      key: immutableDecision.decisionId,
      value: immutableDecision
    });

    const targetState = this.intentStateForOutcome(evaluation.outcome);
    const finalTransition = this.transitionIntentState({
      intentId: intent.intentId,
      fromState: NotificationIntentStates.POLICY_PENDING,
      toState: targetState,
      reason: evaluation.outcome,
      approvalReference: snapshots.governance.approvalReference ?? null,
      decisionId: immutableDecision.decisionId
    });

    if (!finalTransition.ok) {
      this.recordAudit('policy_evaluation_failure', {
        intentId: intent.intentId,
        reason: finalTransition.reason,
        decisionId: immutableDecision.decisionId
      });
      this.incrementTelemetry('policy.evaluation.failures', 1);
      return {
        accepted: false,
        code: 'ILLEGAL_STATE_TRANSITION',
        reason: finalTransition.reason,
        decision: immutableDecision
      };
    }

    const outcomeAuditEvent = this.auditEventForOutcome(evaluation.outcome);
    this.recordAudit('policy_evaluated', {
      intentId: intent.intentId,
      outcome: evaluation.outcome,
      reasonCodes: immutableDecision.reasonCodes,
      decisionId: immutableDecision.decisionId,
      precedence: immutableDecision.precedence
    });
    this.recordAudit(outcomeAuditEvent, {
      intentId: intent.intentId,
      decisionId: immutableDecision.decisionId,
      reasons: immutableDecision.reasons
    });

    this.incrementTelemetry(`policy.outcome.${evaluation.outcome}.count`, 1);
    if (evaluation.outcome === NotificationPolicyOutcomes.REQUIRE_APPROVAL) {
      this.incrementTelemetry('policy.approval.pending.count', 1);
    }
    if (evaluation.outcome === NotificationPolicyOutcomes.SUPPRESS_PREFERENCE) {
      this.incrementTelemetry('policy.suppression.preference', 1);
    }
    if (evaluation.outcome === NotificationPolicyOutcomes.SUPPRESS_RATE_LIMIT) {
      this.incrementTelemetry('policy.suppression.rate_limit', 1);
    }

    return {
      accepted: true,
      code: 'OK',
      decision: immutableDecision,
      intent: this.intents.get(intent.intentId)
    };
  }

  collectPolicySnapshots(intent) {
    return {
      consent: asObject(this.policyAdapters.consentPreferences.getSnapshot(intent), { allowed: true }),
      quietHours: asObject(this.policyAdapters.quietHours.getSnapshot(intent), { active: false }),
      rateLimit: asObject(this.policyAdapters.rateLimit.getSnapshot(intent), { limited: false }),
      channelAvailability: asObject(this.policyAdapters.channelAvailability.getSnapshot(intent), { availableChannels: intent.candidateChannels, unavailableChannels: [] }),
      governance: asObject(this.policyAdapters.governanceApproval.getSnapshot(intent), { requiresApproval: false, blocked: false }),
      businessRules: asObject(this.policyAdapters.businessRules.getSnapshot(intent), { mandatory: false, explicitBlock: false, duplicateDetected: false, securityOverride: false })
    };
  }

  evaluatePolicyOutcome({ intent, snapshots }) {
    const classification = String(intent.classification ?? '').toUpperCase();
    const mandatoryTransactional = classification === NotificationIntentClassifications.TRANSACTIONAL && (snapshots.businessRules.mandatory === true || snapshots.businessRules.legalMandatory === true);
    const mandatoryLegal = classification === NotificationIntentClassifications.LEGAL && (snapshots.businessRules.legalMandatory === true || snapshots.businessRules.mandatory === true);
    const securityCritical = classification === NotificationIntentClassifications.SECURITY && (snapshots.businessRules.securityOverride === true || intent.urgency === 'CRITICAL');

    const reasons = [];

    if (classification === NotificationIntentClassifications.MARKETING) {
      reasons.push(policyReason('MARKETING_BLOCKED_V1', 'MARKETING intents are contract-reserved and blocked in v1.0.', 4));
      return {
        outcome: NotificationPolicyOutcomes.BLOCK,
        reasons,
        precedence: 4
      };
    }

    if (securityCritical) {
      reasons.push(policyReason('SECURITY_OVERRIDE', 'SECURITY critical intent overrides preference and quiet hours.', 1));
      reasons.push(policyReason('SECURITY_AUDIT_REQUIRED', 'Security override requires explicit audit traceability.', 1));
      return {
        outcome: NotificationPolicyOutcomes.OVERRIDE_FOR_SECURITY,
        reasons,
        precedence: 1
      };
    }

    if (mandatoryTransactional || mandatoryLegal) {
      reasons.push(policyReason('MANDATORY_RULE', 'Mandatory transactional/legal rule allows notification despite preferences.', 2));
      return {
        outcome: NotificationPolicyOutcomes.ALLOW,
        reasons,
        precedence: 2
      };
    }

    if (snapshots.governance.requiresApproval === true || String(snapshots.governance.approvalState ?? '').toUpperCase() === 'PENDING') {
      reasons.push(policyReason('APPROVAL_REQUIRED', 'Governance/CEO approval required before delivery eligibility.', 3));
      return {
        outcome: NotificationPolicyOutcomes.REQUIRE_APPROVAL,
        reasons,
        precedence: 3
      };
    }

    const noChannelsAvailable = asArray(snapshots.channelAvailability.availableChannels).length === 0;
    if (snapshots.governance.blocked === true || snapshots.businessRules.explicitBlock === true || noChannelsAvailable) {
      reasons.push(policyReason('POLICY_BLOCK', 'Policy blocked by governance/business rule or no available channels.', 4));
      return {
        outcome: NotificationPolicyOutcomes.BLOCK,
        reasons,
        precedence: 4
      };
    }

    if (snapshots.businessRules.duplicateDetected === true) {
      reasons.push(policyReason('DUPLICATE_SUPPRESSION', 'Duplicate notification context detected.', 5));
      return {
        outcome: NotificationPolicyOutcomes.SUPPRESS_DUPLICATE,
        reasons,
        precedence: 5
      };
    }

    if (snapshots.rateLimit.limited === true) {
      reasons.push(policyReason('RATE_LIMIT_SUPPRESSION', 'Rate limit window suppression active.', 6));
      return {
        outcome: NotificationPolicyOutcomes.SUPPRESS_RATE_LIMIT,
        reasons,
        precedence: 6
      };
    }

    const allowMandatoryBypass = intent.consentRequirements?.allowMandatoryBypass === true;
    if (snapshots.consent.allowed === false && !allowMandatoryBypass) {
      reasons.push(policyReason('PREFERENCE_SUPPRESSION', 'Recipient preference does not allow this notification.', 7));
      return {
        outcome: NotificationPolicyOutcomes.SUPPRESS_PREFERENCE,
        reasons,
        precedence: 7
      };
    }

    if (snapshots.quietHours.active === true && intent.schedulingConstraints?.respectQuietHours !== false) {
      reasons.push(policyReason('QUIET_HOURS_DEFER', 'Quiet hours are active for recipient scope.', 8));
      return {
        outcome: NotificationPolicyOutcomes.DEFER,
        reasons,
        precedence: 8
      };
    }

    reasons.push(policyReason('ALLOW', 'Policy checks passed.', 9));
    return {
      outcome: NotificationPolicyOutcomes.ALLOW,
      reasons,
      precedence: 9
    };
  }

  intentStateForOutcome(outcome) {
    const normalized = String(outcome ?? '').toUpperCase();
    if (normalized === NotificationPolicyOutcomes.ALLOW || normalized === NotificationPolicyOutcomes.OVERRIDE_FOR_SECURITY) {
      return NotificationIntentStates.ELIGIBLE;
    }
    if (normalized === NotificationPolicyOutcomes.REQUIRE_APPROVAL) {
      return NotificationIntentStates.APPROVAL_PENDING;
    }
    if (normalized === NotificationPolicyOutcomes.DEFER) {
      return NotificationIntentStates.DEFERRED;
    }
    return NotificationIntentStates.BLOCKED;
  }

  auditEventForOutcome(outcome) {
    const normalized = String(outcome ?? '').toUpperCase();
    if (normalized === NotificationPolicyOutcomes.ALLOW) return 'policy_allowed';
    if (normalized === NotificationPolicyOutcomes.BLOCK) return 'policy_blocked';
    if (normalized === NotificationPolicyOutcomes.DEFER) return 'policy_deferred';
    if (normalized === NotificationPolicyOutcomes.REQUIRE_APPROVAL) return 'policy_approval_required';
    if (normalized === NotificationPolicyOutcomes.SUPPRESS_DUPLICATE) return 'policy_duplicate_suppressed';
    if (normalized === NotificationPolicyOutcomes.SUPPRESS_PREFERENCE) return 'policy_preference_suppressed';
    if (normalized === NotificationPolicyOutcomes.SUPPRESS_RATE_LIMIT) return 'policy_rate_limited';
    if (normalized === NotificationPolicyOutcomes.OVERRIDE_FOR_SECURITY) return 'policy_security_override';
    return 'policy_blocked';
  }

  transitionIntentState({ intentId, fromState, toState, reason = null, approvalReference = null, decisionId = null } = {}) {
    const current = this.intents.get(intentId) ?? null;
    if (!current) {
      return { ok: false, reason: 'Intent not found.' };
    }

    if (String(current.state).toUpperCase() !== String(fromState).toUpperCase()) {
      return { ok: false, reason: `Intent state conflict. Expected ${fromState}, found ${current.state}.` };
    }

    const transition = validateIntentStateTransition({ fromState, toState });
    if (!transition.isValid) {
      return { ok: false, reason: transition.reason };
    }

    const next = {
      ...current,
      state: toState,
      version: Number(current.version ?? 1) + 1,
      updatedAt: isoNow(this.now),
      approvalReference: approvalReference ?? current.approvalReference,
      decisionHistory: [
        ...asArray(current.decisionHistory),
        {
          at: isoNow(this.now),
          fromState,
          toState,
          reason,
          decisionId
        }
      ]
    };

    const casResult = this.compareAndSetIntent({ current, next });
    if (!casResult.ok) {
      return { ok: false, reason: casResult.reason };
    }

    this.recordAudit('intent_state_transition', {
      intentId,
      fromState,
      toState,
      reason,
      decisionId
    });

    return { ok: true };
  }

  compareAndSetIntent({ current, next } = {}) {
    if (this.storageProvider && typeof this.storageProvider.conditionalSetStateRecord === 'function' && typeof this.storageProvider.getStateRecord === 'function') {
      const result = this.storageProvider.conditionalSetStateRecord({
        namespace: `${this.namespace}.intents`,
        key: current.intentId,
        expectedVersion: Number(current.version ?? 1),
        value: next
      });

      if (result?.ok) {
        this.intents.set(current.intentId, freezeRecord(next));
        return { ok: true };
      }

      return {
        ok: false,
        reason: result?.reason ?? 'Conditional state update failed.'
      };
    }

    this.intents.set(current.intentId, freezeRecord(next));
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.intents`, key: current.intentId, value: next });
    return { ok: true };
  }

  processCanonicalEvent(event = {}) {
    const creation = this.createIntentsFromCanonicalEvent(event);
    if (!creation.accepted) return creation;

    const decisions = creation.created.map((intent) => this.evaluateIntentPolicy({ intentId: intent.intentId }));
    return {
      accepted: true,
      code: 'OK',
      mappingKey: creation.mappingKey,
      createdIntents: creation.created,
      duplicateIntents: creation.duplicates,
      decisions
    };
  }

  listIntents({ businessId, customerId } = {}) {
    return Array.from(this.intents.values()).filter((intent) => {
      if (hasText(businessId) && intent.businessId !== businessId) return false;
      if (hasText(customerId) && intent.customerId !== customerId) return false;
      return true;
    });
  }

  listPolicyDecisions({ intentId } = {}) {
    return Array.from(this.policyDecisions.values())
      .filter((decision) => !hasText(intentId) || decision.intentId === intentId)
      .sort((a, b) => String(a.evaluatedAt ?? '').localeCompare(String(b.evaluatedAt ?? '')));
  }

  incrementTelemetry(key, amount = 1) {
    const normalized = String(key ?? '').trim();
    if (!normalized) return;
    const next = Number(this.telemetry.get(normalized) ?? 0) + Number(amount);
    this.telemetry.set(normalized, next);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry`, key: normalized, value: next });
  }

  recordAudit(event, details = {}) {
    const entry = {
      auditId: `npol_${stableHash(`${event}:${isoNow(this.now)}:${JSON.stringify(details)}`).slice(0, 24)}`,
      event,
      at: isoNow(this.now),
      details
    };

    this.audit.set(entry.auditId, entry);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: entry.auditId, value: entry });
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.audit-events`, key: entry.auditId, value: entry });
  }

  getTelemetrySnapshot() {
    return Object.fromEntries(this.telemetry.entries());
  }

  getAuditRecords() {
    return Array.from(this.audit.values())
      .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
  }

  getSanitizedAuditSourceEvent(event = {}) {
    return serializeDomainEventForAudit(event);
  }
}
