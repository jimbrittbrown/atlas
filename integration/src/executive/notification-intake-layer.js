import { createHash } from 'node:crypto';
import { appendEvent, getMetaMap, loadRecordMap, setMetaValue, upsertRecord } from '../storage/provider-backed-state.js';
import {
  NotificationSensitivityLevels,
  createDomainEventEnvelope,
  serializeDomainEventForAudit
} from './notification-domain-contracts.js';

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export const NotificationSourceSystems = Object.freeze({
  IDENTITY_PLATFORM: 'IDENTITY_PLATFORM',
  PAYMENT_PLATFORM: 'PAYMENT_PLATFORM',
  MISSION_CONTROL: 'MISSION_CONTROL',
  OPERATIONS_LOOP: 'OPERATIONS_LOOP',
  SIGNED_ARTIFACT_DELIVERY: 'SIGNED_ARTIFACT_DELIVERY',
  WEBSITE_PRODUCTION: 'WEBSITE_PRODUCTION',
  EXECUTIVE_GOVERNANCE: 'EXECUTIVE_GOVERNANCE',
  CEO_DECISION_CENTER: 'CEO_DECISION_CENTER'
});

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function toIsoOrNull(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function safeClone(value, fallback = {}) {
  if (value == null) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function safeUpper(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeSourceSystemName(sourceSystem) {
  const text = String(sourceSystem ?? '').trim();
  if (!text) return '';
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isValidSensitivity(value) {
  return Object.values(NotificationSensitivityLevels).includes(String(value ?? '').trim().toUpperCase());
}

function validateVersion(version, failures, fieldName = 'eventVersion') {
  if (!hasText(version)) return;
  const text = String(version).trim();
  const match = SEMVER_PATTERN.exec(text);
  if (!match) {
    failures.push({ field: fieldName, issue: 'INVALID_EVENT_VERSION_FORMAT', message: `${fieldName} must be semantic version format.` });
    return;
  }

  const major = Number(match[1]);
  if (major !== 1) {
    failures.push({ field: fieldName, issue: 'UNSUPPORTED_EVENT_VERSION', message: `${fieldName} major version must be 1.` });
  }
}

function validateSensitivity(value, failures, fieldName = 'sensitivity') {
  if (!hasText(value)) return;
  if (!isValidSensitivity(value)) {
    failures.push({
      field: fieldName,
      issue: 'INVALID_SENSITIVITY',
      message: `${fieldName} must be one of: ${Object.values(NotificationSensitivityLevels).join(', ')}.`
    });
  }
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function normalizeId(value, fallbackPrefix, hashSeed) {
  const text = String(value ?? '').trim();
  if (text) return text;
  return `${fallbackPrefix}_${stableHash(hashSeed).slice(0, 24)}`;
}

function resolveBusinessId(event = {}, details = {}) {
  return String(
    event.businessId
    ?? event.business_id
    ?? details.businessId
    ?? details.business_id
    ?? 'SYSTEM_INTERNAL'
  ).trim();
}

function resolveCustomerId(event = {}, details = {}) {
  const customerId = event.customerId ?? event.customer_id ?? details.customerId ?? details.customer_id ?? null;
  return hasText(customerId) ? String(customerId).trim() : null;
}

function resolveMissionId(event = {}, details = {}) {
  const missionId = event.missionId ?? event.mission_id ?? details.missionId ?? details.mission_id ?? details.relatedMission ?? null;
  return hasText(missionId) ? String(missionId).trim() : null;
}

function buildNormalizationFailure(code, sourceSystem, failures, sourceEvent = null) {
  return {
    accepted: false,
    code,
    sourceSystem,
    failures,
    sourceEvent
  };
}

function buildUnknownSourceSystemFailure(sourceSystem) {
  return buildNormalizationFailure('UNKNOWN_SOURCE_SYSTEM', sourceSystem, [
    {
      field: 'sourceSystem',
      issue: 'UNKNOWN_SOURCE_SYSTEM',
      message: `Unsupported source system: ${sourceSystem}`
    }
  ]);
}

function ensureObjectEvent(sourceSystem, sourceEvent) {
  if (!isObject(sourceEvent)) {
    return buildNormalizationFailure('SOURCE_EVENT_MALFORMED', sourceSystem, [
      {
        field: 'sourceEvent',
        issue: 'SOURCE_EVENT_MALFORMED',
        message: 'Source event must be an object.'
      }
    ]);
  }

  return null;
}

function inferIdentitySensitivity(eventName) {
  const text = String(eventName ?? '').toUpperCase();
  if (!text) return NotificationSensitivityLevels.INTERNAL;
  if (text.includes('LOGIN') || text.includes('AUTH') || text.includes('SESSION') || text.includes('TOKEN') || text.includes('OIDC')) {
    return NotificationSensitivityLevels.RESTRICTED;
  }
  return NotificationSensitivityLevels.INTERNAL;
}

function inferGovernanceSensitivity(eventName) {
  const text = String(eventName ?? '').toUpperCase();
  if (text.includes('VIOLATION') || text.includes('BYPASS')) return NotificationSensitivityLevels.RESTRICTED;
  return NotificationSensitivityLevels.INTERNAL;
}

function validateIdentityPlatformEvent(event = {}) {
  const failures = [];
  const details = isObject(event.details) ? event.details : {};
  const occurredAt = toIsoOrNull(event.timestamp ?? event.occurredAt);
  const sourceEventId = String(event.auditId ?? event.eventId ?? event.sessionId ?? '').trim();
  const sourceEventName = String(event.event ?? event.type ?? '').trim();

  if (!hasText(sourceEventId)) {
    failures.push({ field: 'auditId', issue: 'MISSING_REQUIRED_FIELD', message: 'auditId or eventId is required.' });
  }
  if (!hasText(sourceEventName)) {
    failures.push({ field: 'event', issue: 'MISSING_REQUIRED_FIELD', message: 'event or type is required.' });
  }
  if (!occurredAt) {
    failures.push({ field: 'timestamp', issue: 'INVALID_TIMESTAMP', message: 'timestamp must be a valid ISO timestamp.' });
  }

  validateVersion(event.eventVersion, failures);
  validateSensitivity(event.sensitivity, failures);

  if (failures.length > 0) return { ok: false, failures };

  const sensitivity = hasText(event.sensitivity)
    ? safeUpper(event.sensitivity)
    : inferIdentitySensitivity(sourceEventName);

  return {
    ok: true,
    normalized: {
      sourceEventId,
      sourceEntityType: 'identity-audit',
      sourceEntityId: String(details.customerId ?? details.sessionId ?? sourceEventId).trim(),
      canonicalEventType: `IDENTITY_PLATFORM.${safeUpper(sourceEventName)}`,
      occurredAt,
      correlationId: String(event.correlationId ?? details.correlationId ?? '').trim() || null,
      causationId: String(event.causationId ?? details.causationId ?? event.requestId ?? '').trim() || null,
      businessId: resolveBusinessId(event, details),
      customerId: resolveCustomerId(event, details),
      missionId: resolveMissionId(event, details),
      sensitivity,
      payload: {
        eventName: sourceEventName,
        details: safeClone(details, {}),
        sourceTimestamp: occurredAt
      }
    }
  };
}

function validatePaymentPlatformEvent(event = {}) {
  const failures = [];
  const details = isObject(event.details) ? event.details : {};
  const sourceEventId = String(event.auditId ?? event.eventId ?? '').trim();
  const sourceEventName = String(event.event ?? event.type ?? '').trim();
  const occurredAt = toIsoOrNull(event.timestamp ?? event.occurredAt);

  if (!hasText(sourceEventId)) failures.push({ field: 'auditId', issue: 'MISSING_REQUIRED_FIELD', message: 'auditId is required.' });
  if (!hasText(sourceEventName)) failures.push({ field: 'event', issue: 'MISSING_REQUIRED_FIELD', message: 'event is required.' });
  if (!occurredAt) failures.push({ field: 'timestamp', issue: 'INVALID_TIMESTAMP', message: 'timestamp must be valid.' });

  validateVersion(event.eventVersion, failures);
  validateSensitivity(event.sensitivity, failures);

  if (failures.length > 0) return { ok: false, failures };

  return {
    ok: true,
    normalized: {
      sourceEventId,
      sourceEntityType: 'payment-audit',
      sourceEntityId: String(details.paymentId ?? details.missionId ?? sourceEventId).trim(),
      canonicalEventType: `PAYMENT_PLATFORM.${safeUpper(sourceEventName)}`,
      occurredAt,
      correlationId: String(event.correlationId ?? details.correlationId ?? '').trim() || null,
      causationId: String(event.causationId ?? details.causationId ?? details.eventId ?? '').trim() || null,
      businessId: resolveBusinessId(event, details),
      customerId: resolveCustomerId(event, details),
      missionId: resolveMissionId(event, details),
      sensitivity: hasText(event.sensitivity) ? safeUpper(event.sensitivity) : NotificationSensitivityLevels.CONFIDENTIAL,
      payload: {
        eventName: sourceEventName,
        details: safeClone(details, {}),
        sourceTimestamp: occurredAt
      }
    }
  };
}

function validateMissionControlEvent(event = {}) {
  const failures = [];
  const details = isObject(event.details) ? event.details : {};
  const sourceEventName = String(event.command ?? event.type ?? event.event ?? '').trim();
  const occurredAt = toIsoOrNull(event.timestamp ?? event.occurredAt);
  const sourceEventId = String(event.auditEventId ?? event.eventId ?? `${sourceEventName}:${occurredAt ?? 'unknown'}`).trim();

  if (!hasText(sourceEventName)) failures.push({ field: 'command', issue: 'MISSING_REQUIRED_FIELD', message: 'command, type, or event is required.' });
  if (!occurredAt) failures.push({ field: 'timestamp', issue: 'INVALID_TIMESTAMP', message: 'timestamp must be valid.' });
  if (!hasText(sourceEventId)) failures.push({ field: 'auditEventId', issue: 'MISSING_REQUIRED_FIELD', message: 'Unable to resolve source event id.' });

  validateVersion(event.eventVersion, failures);
  validateSensitivity(event.sensitivity, failures);

  if (failures.length > 0) return { ok: false, failures };

  return {
    ok: true,
    normalized: {
      sourceEventId,
      sourceEntityType: 'mission-control-event',
      sourceEntityId: String(event.missionId ?? details.missionId ?? event.requestId ?? sourceEventId).trim(),
      canonicalEventType: `MISSION_CONTROL.${safeUpper(sourceEventName)}`,
      occurredAt,
      correlationId: String(event.correlationId ?? details.correlationId ?? '').trim() || null,
      causationId: String(event.causationId ?? details.causationId ?? event.requestId ?? '').trim() || null,
      businessId: resolveBusinessId(event, details),
      customerId: resolveCustomerId(event, details),
      missionId: resolveMissionId(event, details),
      sensitivity: hasText(event.sensitivity) ? safeUpper(event.sensitivity) : NotificationSensitivityLevels.INTERNAL,
      payload: {
        eventName: sourceEventName,
        role: event.role ?? null,
        result: event.result ?? null,
        details: safeClone(details, {}),
        sourceTimestamp: occurredAt
      }
    }
  };
}

function validateOperationsLoopEvent(event = {}) {
  const failures = [];
  const details = isObject(event.details) ? event.details : {};
  const sourceEventName = String(event.event ?? event.type ?? '').trim();
  const occurredAt = toIsoOrNull(event.timestamp ?? event.occurredAt);
  const sourceEventId = String(event.eventId ?? `${sourceEventName}:${occurredAt ?? 'unknown'}`).trim();

  if (!hasText(sourceEventName)) failures.push({ field: 'event', issue: 'MISSING_REQUIRED_FIELD', message: 'event is required.' });
  if (!occurredAt) failures.push({ field: 'timestamp', issue: 'INVALID_TIMESTAMP', message: 'timestamp must be valid.' });

  validateVersion(event.eventVersion, failures);
  validateSensitivity(event.sensitivity, failures);

  if (failures.length > 0) return { ok: false, failures };

  return {
    ok: true,
    normalized: {
      sourceEventId,
      sourceEntityType: 'operations-loop-audit',
      sourceEntityId: String(details.cycleId ?? details.alertId ?? sourceEventId).trim(),
      canonicalEventType: `OPERATIONS_LOOP.${safeUpper(sourceEventName)}`,
      occurredAt,
      correlationId: String(event.correlationId ?? details.correlationId ?? details.cycleId ?? '').trim() || null,
      causationId: String(event.causationId ?? details.causationId ?? details.previousCycleId ?? '').trim() || null,
      businessId: resolveBusinessId(event, details),
      customerId: resolveCustomerId(event, details),
      missionId: resolveMissionId(event, details),
      sensitivity: hasText(event.sensitivity) ? safeUpper(event.sensitivity) : NotificationSensitivityLevels.INTERNAL,
      payload: {
        eventName: sourceEventName,
        details: safeClone(details, {}),
        sourceTimestamp: occurredAt
      }
    }
  };
}

function validateSignedArtifactDeliveryEvent(event = {}) {
  const failures = [];
  const sourceEventId = String(event.eventId ?? '').trim();
  const sourceEventName = String(event.type ?? event.event ?? '').trim();
  const occurredAt = toIsoOrNull(event.at ?? event.timestamp ?? event.occurredAt);

  if (!hasText(sourceEventId)) failures.push({ field: 'eventId', issue: 'MISSING_REQUIRED_FIELD', message: 'eventId is required.' });
  if (!hasText(sourceEventName)) failures.push({ field: 'type', issue: 'MISSING_REQUIRED_FIELD', message: 'type is required.' });
  if (!occurredAt) failures.push({ field: 'at', issue: 'INVALID_TIMESTAMP', message: 'at must be a valid timestamp.' });

  validateVersion(event.eventVersion, failures);
  validateSensitivity(event.sensitivity, failures);

  if (failures.length > 0) return { ok: false, failures };

  return {
    ok: true,
    normalized: {
      sourceEventId,
      sourceEntityType: 'signed-artifact-delivery-event',
      sourceEntityId: String(event.authorizationId ?? event.packageId ?? sourceEventId).trim(),
      canonicalEventType: `SIGNED_ARTIFACT_DELIVERY.${safeUpper(sourceEventName)}`,
      occurredAt,
      correlationId: String(event.correlationId ?? event.packageId ?? '').trim() || null,
      causationId: String(event.causationId ?? event.authorizationId ?? '').trim() || null,
      businessId: resolveBusinessId(event, event),
      customerId: resolveCustomerId(event, event),
      missionId: resolveMissionId(event, event),
      sensitivity: hasText(event.sensitivity) ? safeUpper(event.sensitivity) : NotificationSensitivityLevels.CONFIDENTIAL,
      payload: {
        eventName: sourceEventName,
        details: {
          packageId: event.packageId ?? null,
          authorizationId: event.authorizationId ?? null,
          artifactId: event.artifactId ?? null,
          status: event.status ?? null
        },
        sourceTimestamp: occurredAt
      }
    }
  };
}

function validateWebsiteProductionEvent(event = {}) {
  const failures = [];
  const sourceEventId = String(event.reviewId ?? event.eventId ?? '').trim();
  const sourceEventName = String(event.state ?? event.event ?? '').trim();
  const occurredAt = toIsoOrNull(event.updatedAt ?? event.createdAt ?? event.timestamp);

  if (!hasText(sourceEventId)) failures.push({ field: 'reviewId', issue: 'MISSING_REQUIRED_FIELD', message: 'reviewId is required.' });
  if (!hasText(sourceEventName)) failures.push({ field: 'state', issue: 'MISSING_REQUIRED_FIELD', message: 'state is required.' });
  if (!occurredAt) failures.push({ field: 'updatedAt', issue: 'INVALID_TIMESTAMP', message: 'updatedAt must be a valid timestamp.' });
  if (!hasText(event.missionId)) failures.push({ field: 'missionId', issue: 'MISSING_REQUIRED_FIELD', message: 'missionId is required.' });

  validateVersion(event.eventVersion, failures);
  validateSensitivity(event.sensitivity, failures);

  if (failures.length > 0) return { ok: false, failures };

  return {
    ok: true,
    normalized: {
      sourceEventId,
      sourceEntityType: 'website-production-review',
      sourceEntityId: String(event.missionId).trim(),
      canonicalEventType: `WEBSITE_PRODUCTION.${safeUpper(sourceEventName)}`,
      occurredAt,
      correlationId: String(event.correlationId ?? '').trim() || null,
      causationId: String(event.causationId ?? event.orchestrationId ?? '').trim() || null,
      businessId: resolveBusinessId(event, event),
      customerId: resolveCustomerId(event, event),
      missionId: resolveMissionId(event, event),
      sensitivity: hasText(event.sensitivity) ? safeUpper(event.sensitivity) : NotificationSensitivityLevels.INTERNAL,
      payload: {
        reviewId: sourceEventId,
        state: sourceEventName,
        qaStatus: event.qa?.status ?? event.execution?.qaStatus ?? null,
        qualityScore: event.qa?.score ?? event.execution?.qualityScore ?? null,
        sourceTimestamp: occurredAt
      }
    }
  };
}

function validateExecutiveGovernanceEvent(event = {}) {
  const failures = [];
  const sourceEventId = String(event.governanceEventId ?? event.eventId ?? '').trim();
  const sourceEventName = String(event.eventType ?? event.event ?? '').trim();
  const occurredAt = toIsoOrNull(event.timestamp ?? event.occurredAt ?? event.updatedAt);

  if (!hasText(sourceEventId)) failures.push({ field: 'governanceEventId', issue: 'MISSING_REQUIRED_FIELD', message: 'governanceEventId or eventId is required.' });
  if (!hasText(sourceEventName)) failures.push({ field: 'eventType', issue: 'MISSING_REQUIRED_FIELD', message: 'eventType is required.' });
  if (!occurredAt) failures.push({ field: 'timestamp', issue: 'INVALID_TIMESTAMP', message: 'timestamp must be a valid timestamp.' });
  if (!hasText(event.ownerSystem ?? event.sourceOwner)) {
    failures.push({ field: 'ownerSystem', issue: 'MISSING_REQUIRED_FIELD', message: 'ownerSystem or sourceOwner is required to preserve ownership.' });
  }

  validateVersion(event.eventVersion, failures);
  validateSensitivity(event.sensitivity, failures);

  if (failures.length > 0) return { ok: false, failures };

  const eventName = safeUpper(sourceEventName);

  return {
    ok: true,
    normalized: {
      sourceEventId,
      sourceEntityType: 'executive-governance-event',
      sourceEntityId: String(event.entityId ?? event.missionId ?? sourceEventId).trim(),
      canonicalEventType: `EXECUTIVE_GOVERNANCE.${eventName}`,
      occurredAt,
      correlationId: String(event.correlationId ?? '').trim() || null,
      causationId: String(event.causationId ?? '').trim() || null,
      businessId: resolveBusinessId(event, event),
      customerId: resolveCustomerId(event, event),
      missionId: resolveMissionId(event, event),
      sensitivity: hasText(event.sensitivity) ? safeUpper(event.sensitivity) : inferGovernanceSensitivity(eventName),
      payload: {
        eventName,
        ownerSystem: String(event.ownerSystem ?? event.sourceOwner).trim(),
        governance: safeClone(event.governance ?? {}, {}),
        sourceTimestamp: occurredAt
      }
    }
  };
}

function validateCeoDecisionCenterEvent(event = {}) {
  const failures = [];
  const sourceEventName = String(event.decisionType ?? event.eventType ?? event.event ?? '').trim();
  const occurredAt = toIsoOrNull(event.timestamp ?? event.createdAt ?? event.generatedAt);
  const sourceEventId = String(event.decisionId ?? event.itemId ?? `${sourceEventName}:${event.relatedMission ?? event.relatedCustomer ?? 'unknown'}`).trim();

  if (!hasText(sourceEventName)) failures.push({ field: 'decisionType', issue: 'MISSING_REQUIRED_FIELD', message: 'decisionType or eventType is required.' });
  if (!occurredAt) failures.push({ field: 'timestamp', issue: 'INVALID_TIMESTAMP', message: 'timestamp must be valid.' });

  validateVersion(event.eventVersion, failures);
  validateSensitivity(event.sensitivity, failures);

  if (failures.length > 0) return { ok: false, failures };

  return {
    ok: true,
    normalized: {
      sourceEventId,
      sourceEntityType: 'ceo-decision-center-item',
      sourceEntityId: String(event.relatedMission ?? event.relatedCustomer ?? sourceEventId).trim(),
      canonicalEventType: `CEO_DECISION_CENTER.${safeUpper(sourceEventName)}`,
      occurredAt,
      correlationId: String(event.correlationId ?? '').trim() || null,
      causationId: String(event.causationId ?? event.proposalId ?? '').trim() || null,
      businessId: resolveBusinessId(event, event),
      customerId: resolveCustomerId(event, event),
      missionId: resolveMissionId(event, event),
      sensitivity: hasText(event.sensitivity) ? safeUpper(event.sensitivity) : NotificationSensitivityLevels.INTERNAL,
      payload: {
        decisionType: sourceEventName,
        recommendation: event.recommendation ?? null,
        risk: event.risk ?? null,
        requiredCeoAction: event.requiredCeoAction ?? null,
        sourceTimestamp: occurredAt
      }
    }
  };
}

const SourceAdapters = Object.freeze({
  [NotificationSourceSystems.IDENTITY_PLATFORM]: validateIdentityPlatformEvent,
  [NotificationSourceSystems.PAYMENT_PLATFORM]: validatePaymentPlatformEvent,
  [NotificationSourceSystems.MISSION_CONTROL]: validateMissionControlEvent,
  [NotificationSourceSystems.OPERATIONS_LOOP]: validateOperationsLoopEvent,
  [NotificationSourceSystems.SIGNED_ARTIFACT_DELIVERY]: validateSignedArtifactDeliveryEvent,
  [NotificationSourceSystems.WEBSITE_PRODUCTION]: validateWebsiteProductionEvent,
  [NotificationSourceSystems.EXECUTIVE_GOVERNANCE]: validateExecutiveGovernanceEvent,
  [NotificationSourceSystems.CEO_DECISION_CENTER]: validateCeoDecisionCenterEvent
});

export function normalizeNotificationSourceSystem(sourceSystem) {
  const normalized = normalizeSourceSystemName(sourceSystem);
  if (Object.values(NotificationSourceSystems).includes(normalized)) return normalized;
  return '';
}

export class NotificationIntakeLayer {
  constructor({
    storageProvider,
    now,
    namespace = 'executive.notification-intake'
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.namespace = namespace;

    this.normalizedByKey = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.normalized-events` });
    this.failures = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.validation-failures` });
    this.auditEvents = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.ingestion-audit` });
  }

  listCanonicalEvents() {
    return Array.from(this.normalizedByKey.values())
      .sort((a, b) => String(a.occurredAt ?? '').localeCompare(String(b.occurredAt ?? '')));
  }

  getNormalizationByKey(normalizationKey) {
    return this.normalizedByKey.get(String(normalizationKey ?? '').trim()) ?? null;
  }

  normalizeSourceEvent({ sourceSystem, sourceEvent } = {}) {
    const normalizedSource = normalizeNotificationSourceSystem(sourceSystem);
    if (!normalizedSource) {
      const failure = buildUnknownSourceSystemFailure(sourceSystem);
      this.persistFailure(failure);
      return failure;
    }

    const malformed = ensureObjectEvent(normalizedSource, sourceEvent);
    if (malformed) {
      this.persistFailure(malformed);
      return malformed;
    }

    const adapter = SourceAdapters[normalizedSource];
    const adapterResult = adapter(sourceEvent);
    if (!adapterResult.ok) {
      const failure = buildNormalizationFailure('SOURCE_EVENT_VALIDATION_FAILED', normalizedSource, adapterResult.failures, sourceEvent);
      this.persistFailure(failure);
      return failure;
    }

    const normalized = adapterResult.normalized;
    const normalizationKey = this.buildNormalizationKey({ sourceSystem: normalizedSource, normalized });
    const existing = this.normalizedByKey.get(normalizationKey) ?? null;

    if (existing) {
      this.recordAudit('NORMALIZATION_DUPLICATE_REPLAY', {
        sourceSystem: normalizedSource,
        normalizationKey,
        canonicalEventId: existing.eventId,
        sourceEventId: normalized.sourceEventId
      });

      return {
        accepted: true,
        duplicate: true,
        sourceSystem: normalizedSource,
        normalizationKey,
        canonicalEvent: existing
      };
    }

    const canonicalEvent = this.createCanonicalEvent({
      sourceSystem: normalizedSource,
      normalized,
      normalizationKey,
      sourceEvent
    });

    this.normalizedByKey.set(normalizationKey, canonicalEvent);
    upsertRecord({
      provider: this.storageProvider,
      namespace: `${this.namespace}.normalized-events`,
      key: normalizationKey,
      value: canonicalEvent
    });

    this.recordAudit('NORMALIZATION_ACCEPTED', {
      sourceSystem: normalizedSource,
      normalizationKey,
      canonicalEventId: canonicalEvent.eventId,
      sourceEventId: normalized.sourceEventId
    });

    appendEvent({
      provider: this.storageProvider,
      namespace: `${this.namespace}.canonical-event-stream`,
      key: canonicalEvent.eventId,
      value: canonicalEvent
    });

    return {
      accepted: true,
      duplicate: false,
      sourceSystem: normalizedSource,
      normalizationKey,
      canonicalEvent
    };
  }

  normalizeSourceEvents({ sourceSystem, sourceEvents = [] } = {}) {
    if (!Array.isArray(sourceEvents)) {
      return [
        buildNormalizationFailure('SOURCE_EVENT_BATCH_INVALID', String(sourceSystem ?? ''), [
          {
            field: 'sourceEvents',
            issue: 'INVALID_BATCH',
            message: 'sourceEvents must be an array.'
          }
        ])
      ];
    }

    return sourceEvents.map((sourceEvent) => this.normalizeSourceEvent({ sourceSystem, sourceEvent }));
  }

  buildNormalizationKey({ sourceSystem, normalized } = {}) {
    const payload = {
      sourceSystem,
      sourceEventId: normalized.sourceEventId,
      canonicalEventType: normalized.canonicalEventType,
      occurredAt: normalized.occurredAt,
      sourceEntityType: normalized.sourceEntityType,
      sourceEntityId: normalized.sourceEntityId,
      businessId: normalized.businessId,
      customerId: normalized.customerId,
      missionId: normalized.missionId
    };

    return `norm_${stableHash(JSON.stringify(payload))}`;
  }

  createCanonicalEvent({ sourceSystem, normalized, normalizationKey, sourceEvent } = {}) {
    const eventId = normalizeId(null, 'nevt', `event:${normalizationKey}`);
    const fallbackCorrelationId = normalizeId(null, 'corr', `corr:${normalizationKey}`);
    const correlationId = normalizeId(normalized.correlationId, 'corr', `corr:${normalizationKey}`);
    const causationId = normalizeId(normalized.causationId ?? normalized.sourceEventId, 'cause', `cause:${normalizationKey}`);

    return createDomainEventEnvelope({
      eventId,
      eventType: normalized.canonicalEventType,
      eventVersion: '1.0.0',
      occurredAt: normalized.occurredAt,
      recordedAt: nowIso(this.now),
      sourceSystem,
      sourceEntityType: normalized.sourceEntityType,
      sourceEntityId: normalized.sourceEntityId,
      businessId: normalized.businessId,
      customerId: normalized.customerId,
      missionId: normalized.missionId,
      correlationId: hasText(correlationId) ? correlationId : fallbackCorrelationId,
      causationId,
      sensitivity: normalized.sensitivity,
      payload: {
        normalizationKey,
        sourceEventId: normalized.sourceEventId,
        data: safeClone(normalized.payload, {})
      },
      metadata: {
        sourceOwnership: {
          sourceSystem,
          sourceEntityType: normalized.sourceEntityType,
          sourceEntityId: normalized.sourceEntityId,
          sourceEventId: normalized.sourceEventId
        },
        normalization: {
          idempotent: true,
          deterministic: true,
          normalizedAt: nowIso(this.now),
          adapterVersion: '1.0.0',
          sourceDigest: stableHash(JSON.stringify(sourceEvent ?? {}))
        }
      }
    });
  }

  persistFailure(failure) {
    const failureId = `fail_${stableHash(JSON.stringify({
      sourceSystem: failure.sourceSystem,
      failures: failure.failures,
      at: nowIso(this.now)
    })).slice(0, 24)}`;

    const persisted = {
      failureId,
      code: failure.code,
      sourceSystem: failure.sourceSystem,
      failures: safeClone(failure.failures, []),
      at: nowIso(this.now)
    };

    this.failures.set(failureId, persisted);
    setMetaValue({
      provider: this.storageProvider,
      namespace: `${this.namespace}.validation-failures`,
      key: failureId,
      value: persisted
    });

    appendEvent({
      provider: this.storageProvider,
      namespace: `${this.namespace}.validation-failure-events`,
      key: failureId,
      value: persisted
    });

    this.recordAudit('NORMALIZATION_REJECTED', {
      sourceSystem: failure.sourceSystem,
      code: failure.code,
      failureId,
      failureCount: Array.isArray(failure.failures) ? failure.failures.length : 0
    });
  }

  recordAudit(event, details = {}) {
    const entry = {
      auditId: `nia_${stableHash(`${event}:${nowIso(this.now)}:${JSON.stringify(details)}`).slice(0, 24)}`,
      event,
      at: nowIso(this.now),
      details
    };

    this.auditEvents.set(entry.auditId, entry);
    setMetaValue({
      provider: this.storageProvider,
      namespace: `${this.namespace}.ingestion-audit`,
      key: entry.auditId,
      value: entry
    });

    appendEvent({
      provider: this.storageProvider,
      namespace: `${this.namespace}.ingestion-audit-events`,
      key: entry.auditId,
      value: entry
    });
  }

  listValidationFailures() {
    return Array.from(this.failures.values()).sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
  }

  listCanonicalAuditView() {
    return this.listCanonicalEvents().map((event) => serializeDomainEventForAudit(event));
  }
}
