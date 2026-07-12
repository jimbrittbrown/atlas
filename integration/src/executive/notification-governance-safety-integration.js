import { createHash } from 'node:crypto';

import { appendEvent, getMetaMap, loadRecordMap, setMetaValue, upsertRecord } from '../storage/provider-backed-state.js';
import {
  NotificationChannels,
  NotificationConsentStates,
  NotificationIntentClassifications,
  createConsentPreferenceRecord
} from './notification-domain-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function nowMs(nowFn) {
  const value = nowFn?.();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ''));
  if (Number.isFinite(parsed)) return parsed;
  return Date.now();
}

function normalizeScope(value, fallback = 'CUSTOMER') {
  const text = String(value ?? fallback).trim().toUpperCase();
  if (text === 'BUSINESS') return 'BUSINESS';
  return 'CUSTOMER';
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

function redact(value, key = '') {
  const name = String(key ?? '').toLowerCase();
  if (/(secret|token|credential|password|authorization|cookie|signature|payload|body|recipient)/i.test(name)) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value && typeof value === 'object') {
    const output = {};
    Object.entries(value).forEach(([childKey, childValue]) => {
      output[childKey] = redact(childValue, childKey);
    });
    return output;
  }

  if (typeof value === 'string' && value.length > 180) return `${value.slice(0, 180)}...`;
  return value;
}

function deterministicId(prefix, seed) {
  return `${prefix}_${stableHash(seed).slice(0, 24)}`;
}

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseHourMinute(text) {
  const value = String(text ?? '').trim();
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute, totalMinutes: (hour * 60) + minute };
}

function localMinutesInTimezone(atMs, timezone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  const parts = formatter.formatToParts(new Date(atMs));
  const hour = Number(parts.find((item) => item.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((item) => item.type === 'minute')?.value ?? '0');
  return (hour * 60) + minute;
}

function inQuietWindow(localMinutes, startMinutes, endMinutes) {
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return localMinutes >= startMinutes && localMinutes < endMinutes;
  }
  return localMinutes >= startMinutes || localMinutes < endMinutes;
}

function consentRecordKey({ businessId, customerId, channel, notificationClass }) {
  return `${businessId}:${customerId}:${String(channel).toUpperCase()}:${String(notificationClass).toUpperCase()}`;
}

function normalizeConsentState(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'REQUIRED_TRANSACTIONAL_ONLY') return NotificationConsentStates.REQUIRED_TRANSACTIONAL;
  if (Object.values(NotificationConsentStates).includes(normalized)) return normalized;
  return NotificationConsentStates.UNKNOWN;
}

function recipientIdentity(intent = {}) {
  const recipient = asArray(intent.recipientRefs)[0] ?? {};
  return String(recipient.id ?? recipient.customerId ?? recipient.principalId ?? recipient.email ?? 'UNKNOWN').trim();
}

function windowStart(nowMsValue, windowMs) {
  const size = Math.max(1000, Number(windowMs) || 1000);
  return Math.floor(nowMsValue / size) * size;
}

class ConsentPreferenceRegistry {
  constructor({ storageProvider, now, namespace, retentionDays = 365, owner = null } = {}) {
    this.storageProvider = storageProvider;
    this.now = now;
    this.namespace = namespace;
    this.retentionDays = retentionDays;
    this.owner = owner;

    this.records = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.consent-records` });
    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` });
    this.telemetry = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry` });
  }

  upsertConsent({
    customerId,
    businessId,
    channel,
    notificationClass,
    consentState,
    source,
    expectedVersion = null,
    actor = null,
    reason = null
  } = {}) {
    if (!hasText(customerId) || !hasText(businessId)) {
      return { accepted: false, code: 'INVALID_SCOPE', reason: 'customerId and businessId are required.' };
    }

    const normalizedState = normalizeConsentState(consentState);
    const key = consentRecordKey({ businessId, customerId, channel, notificationClass });
    const existing = this.records.get(key) ?? null;

    const expected = expectedVersion == null
      ? Number(existing?.version ?? 0)
      : Number(expectedVersion);

    if (existing && Number(existing.version) !== expected) {
      return { accepted: false, code: 'VERSION_MISMATCH', reason: 'Consent version mismatch.' };
    }

    const base = createConsentPreferenceRecord({
      recordId: deterministicId('nconsent', `${key}:${normalizedState}`),
      customerId,
      businessId,
      channel,
      notificationClass,
      consentState: normalizedState,
      source,
      version: Number(existing?.version ?? 0) + 1,
      updatedAt: nowIso(this.now)
    });

    const record = Object.freeze({
      ...base,
      version: Number(existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? nowIso(this.now),
      updatedAt: nowIso(this.now),
      actor: actor ?? null,
      reason: reason ?? null,
      historyVersion: deterministicId('chv', `${key}:${Number(existing?.version ?? 0) + 1}`),
      retention: {
        policy: 'TIME_BASED',
        retentionDays: this.retentionDays,
        retentionExpiresAt: new Date(nowMs(this.now) + this.retentionDays * 86400000).toISOString()
      }
    });

    const cas = this.compareAndSet({ key, current: existing, next: record });
    if (!cas.accepted) return cas;

    const eventType = !existing
      ? 'consent_created'
      : (normalizedState === NotificationConsentStates.OPTED_OUT ? 'consent_revoked' : 'consent_updated');

    this.recordAudit(eventType, {
      key,
      customerId,
      businessId,
      channel,
      notificationClass,
      consentState: normalizedState,
      source,
      actor
    });

    this.incrementTelemetry(`governance.consent.state.${String(channel).toUpperCase()}.${String(notificationClass).toUpperCase()}.${normalizedState}`, 1);
    this.incrementTelemetry('governance.consent.upsert.count', 1);

    return { accepted: true, code: 'OK', record };
  }

  compareAndSet({ key, current, next } = {}) {
    const namespace = `${this.namespace}.consent-records`;
    if (this.storageProvider && typeof this.storageProvider.conditionalSetStateRecord === 'function') {
      if (!current) {
        upsertRecord({ provider: this.storageProvider, namespace, key, value: next });
        this.records.set(key, next);
      } else {
        const result = this.storageProvider.conditionalSetStateRecord({
          namespace,
          key,
          expectedVersion: Number(current.version),
          value: next
        });
        if (!result?.ok) {
          return {
            accepted: false,
            code: result?.code === 'VERSION_MISMATCH' ? 'VERSION_MISMATCH' : 'PERSISTENCE_FAILURE',
            reason: result?.reason ?? 'CAS write failed.'
          };
        }
        this.records.set(key, next);
      }
    } else {
      if (current && Number(this.records.get(key)?.version ?? -1) !== Number(current.version ?? -2)) {
        return { accepted: false, code: 'VERSION_MISMATCH', reason: 'In-memory consent CAS mismatch.' };
      }
      this.records.set(key, next);
      upsertRecord({ provider: this.storageProvider, namespace, key, value: next });
    }

    appendEvent({
      provider: this.storageProvider,
      namespace: `${this.namespace}.consent-history`,
      key: next.historyVersion,
      value: next
    });

    return { accepted: true, code: 'OK' };
  }

  getConsentRecord({ customerId, businessId, channel, notificationClass } = {}) {
    const key = consentRecordKey({ customerId, businessId, channel, notificationClass });
    return this.records.get(key) ?? null;
  }

  listConsentHistory({ customerId, businessId, channel = null, notificationClass = null } = {}) {
    const events = asArray(this.storageProvider?.listEventsSync?.(`${this.namespace}.consent-history`) ?? []);
    return events
      .map((event) => event.value)
      .filter((entry) => String(entry.customerId) === String(customerId))
      .filter((entry) => String(entry.businessId) === String(businessId))
      .filter((entry) => !hasText(channel) || String(entry.channel).toUpperCase() === String(channel).toUpperCase())
      .filter((entry) => !hasText(notificationClass) || String(entry.notificationClass).toUpperCase() === String(notificationClass).toUpperCase())
      .sort((a, b) => Number(a.version) - Number(b.version));
  }

  evaluateConsentSnapshot(intent, { mandatoryOverride = false, overrideReason = null } = {}) {
    const classification = String(intent.classification ?? '').toUpperCase();
    const channel = String(asArray(intent.candidateChannels)[0] ?? NotificationChannels.EMAIL).toUpperCase();

    const record = this.getConsentRecord({
      customerId: intent.customerId,
      businessId: intent.businessId,
      channel,
      notificationClass: classification
    });

    const state = normalizeConsentState(record?.consentState ?? NotificationConsentStates.UNKNOWN);
    const requireOptIn = intent.consentRequirements?.requireOptIn === true;

    let allowed = true;
    let reason = 'CONSENT_ALLOWED';

    if (state === NotificationConsentStates.OPTED_OUT) {
      allowed = false;
      reason = 'CONSENT_OPTED_OUT';
    }

    if (state === NotificationConsentStates.UNKNOWN && requireOptIn) {
      allowed = false;
      reason = 'UNKNOWN_CONSENT_FAIL_CLOSED';
    }

    if (state === NotificationConsentStates.REQUIRED_TRANSACTIONAL && classification !== NotificationIntentClassifications.TRANSACTIONAL) {
      allowed = false;
      reason = 'CONSENT_REQUIRED_TRANSACTIONAL_ONLY';
    }

    if (state === NotificationConsentStates.REQUIRED_SECURITY && classification !== NotificationIntentClassifications.SECURITY) {
      allowed = false;
      reason = 'CONSENT_REQUIRED_SECURITY_ONLY';
    }

    if (!allowed && mandatoryOverride) {
      allowed = true;
      reason = overrideReason ?? 'MANDATORY_NOTICE_OVERRIDE';
      this.recordAudit('mandatory_notice_override', {
        intentId: intent.intentId,
        businessId: intent.businessId,
        customerId: intent.customerId,
        classification,
        channel,
        reason
      });
      this.incrementTelemetry('governance.override.mandatory.count', 1);
    }

    if (!allowed) {
      this.incrementTelemetry('governance.preference.suppression.count', 1);
    }

    return {
      allowed,
      reason,
      consentState: state,
      mandatoryBypassAllowed: mandatoryOverride,
      source: record?.source ?? 'UNKNOWN'
    };
  }

  processOptOut({
    authenticatedCustomerId,
    customerId,
    businessId,
    channel,
    notificationClass,
    csrfValidated = false,
    originValidated = false,
    source = 'API',
    actor = null
  } = {}) {
    if (String(authenticatedCustomerId ?? '') !== String(customerId ?? '')) {
      this.recordAudit('cross_tenant_access_denied', {
        reason: 'opt_out_customer_ownership_mismatch',
        authenticatedCustomerId,
        customerId,
        businessId
      });
      this.incrementTelemetry('governance.cross_tenant.denials.count', 1);
      return { accepted: false, code: 'FORBIDDEN', reason: 'Customer ownership mismatch.' };
    }

    if (!csrfValidated || !originValidated) {
      this.recordAudit('governance_policy_failed', {
        reason: 'opt_out_security_guard_failed',
        csrfValidated,
        originValidated,
        customerId,
        businessId
      });
      this.incrementTelemetry('governance.policy.failures.count', 1);
      return { accepted: false, code: 'SECURITY_GUARD_FAILED', reason: 'CSRF/origin validation failed.' };
    }

    const updated = this.upsertConsent({
      customerId,
      businessId,
      channel,
      notificationClass,
      consentState: NotificationConsentStates.OPTED_OUT,
      source,
      actor: actor ?? authenticatedCustomerId,
      reason: 'customer_opt_out'
    });

    if (!updated.accepted) return updated;

    this.recordAudit('notification_opted_out', {
      customerId,
      businessId,
      channel,
      notificationClass,
      source
    });

    return { accepted: true, code: 'OK', record: updated.record };
  }

  recordAudit(event, details = {}) {
    this.owner?.recordAudit?.(event, details);
  }

  incrementTelemetry(name, amount = 1) {
    this.owner?.incrementTelemetry?.(name, amount);
  }
}

class RateLimitLedger {
  constructor({ storageProvider, now, namespace, owner = null, defaults = {} } = {}) {
    this.storageProvider = storageProvider;
    this.now = now;
    this.namespace = namespace;
    this.owner = owner;
    this.records = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.rate-limit-records` });
    this.defaults = {
      windowMs: Number(defaults.windowMs ?? 60000),
      maxPerWindow: Number(defaults.maxPerWindow ?? 5),
      ...defaults
    };
  }

  limitForIntent(intent, context = {}) {
    const configured = Number(context.maxPerWindow ?? this.defaults.maxPerWindow);
    const windowMs = Number(context.windowMs ?? this.defaults.windowMs);

    if (String(intent.classification).toUpperCase() === NotificationIntentClassifications.SECURITY && String(intent.urgency).toUpperCase() === 'CRITICAL') {
      return { bypassed: true, maxPerWindow: configured, windowMs, reason: 'security_critical_override' };
    }

    if (context.mandatoryOverride === true) {
      return { bypassed: true, maxPerWindow: configured, windowMs, reason: 'mandatory_override' };
    }

    return { bypassed: false, maxPerWindow: configured, windowMs, reason: null };
  }

  keyForIntent(intent, channel, scope = 'CUSTOMER') {
    const normalizedScope = normalizeScope(scope, 'CUSTOMER');
    const customerDimension = normalizedScope === 'BUSINESS' ? 'ALL' : (intent.customerId ?? 'NONE');
    return [
      intent.businessId,
      customerDimension,
      String(channel).toUpperCase(),
      String(intent.notificationType).toUpperCase(),
      String(intent.classification).toUpperCase()
    ].join(':');
  }

  checkAndIncrement(intent, { channel, context = {} } = {}) {
    const limit = this.limitForIntent(intent, context);
    if (limit.bypassed) {
      if (limit.reason === 'security_critical_override') {
        this.owner?.recordAudit?.('security_override', {
          intentId: intent.intentId,
          reason: limit.reason,
          businessId: intent.businessId,
          customerId: intent.customerId
        });
        this.owner?.incrementTelemetry?.('governance.override.security.count', 1);
      }
      if (limit.reason === 'mandatory_override') {
        this.owner?.recordAudit?.('mandatory_notice_override', {
          intentId: intent.intentId,
          reason: limit.reason,
          businessId: intent.businessId,
          customerId: intent.customerId
        });
        this.owner?.incrementTelemetry?.('governance.override.mandatory.count', 1);
      }
      return { limited: false, bypassed: true, reason: limit.reason, windowMs: limit.windowMs, maxPerWindow: limit.maxPerWindow };
    }

    const scope = normalizeScope(context.scope, 'CUSTOMER');
    const keyBase = this.keyForIntent(intent, channel, scope);
    const nowValue = nowMs(this.now);
    const winMs = Math.max(1000, Number(limit.windowMs));
    const ws = windowStart(nowValue, winMs);
    const recordKey = `${keyBase}:${ws}`;

    let retries = 0;
    while (retries < 4) {
      retries += 1;

      const persisted = this.storageProvider && typeof this.storageProvider.getStateRecord === 'function'
        ? this.storageProvider.getStateRecord({ namespace: `${this.namespace}.rate-limit-records`, key: recordKey })
        : null;

      const persistedValue = persisted?.ok ? asObject(persisted.value, null) : null;
      if (persistedValue) {
        this.records.set(recordKey, persistedValue);
      }

      const existing = persistedValue ?? this.records.get(recordKey) ?? {
        key: recordKey,
        version: 1,
        windowStartAt: new Date(ws).toISOString(),
        windowEndAt: new Date(ws + winMs).toISOString(),
        count: 0,
        suppressedCount: 0,
        dimensions: {
          businessId: intent.businessId,
          customerId: scope === 'BUSINESS' ? null : (intent.customerId ?? null),
          scope,
          channel: String(channel).toUpperCase(),
          notificationType: String(intent.notificationType).toUpperCase(),
          classification: String(intent.classification).toUpperCase()
        }
      };

      const limited = Number(existing.count) >= Number(limit.maxPerWindow);
      const next = Object.freeze({
        ...existing,
        version: Number(existing.version ?? 1) + 1,
        updatedAt: nowIso(this.now),
        count: limited ? Number(existing.count) : Number(existing.count) + 1,
        suppressedCount: limited ? Number(existing.suppressedCount ?? 0) + 1 : Number(existing.suppressedCount ?? 0),
        policySnapshotHash: stableHash(JSON.stringify({
          keyBase,
          windowStart: ws,
          windowMs: winMs,
          maxPerWindow: limit.maxPerWindow
        })),
        retention: {
          policy: 'WINDOW_PLUS_BUFFER',
          retentionExpiresAt: new Date((ws + winMs) + 86400000).toISOString()
        }
      });

      const applied = this.compareAndSet(recordKey, existing, next);
      if (!applied.accepted && applied.code === 'VERSION_MISMATCH') {
        continue;
      }
      if (!applied.accepted) return { limited: true, failed: true, reason: applied.reason ?? 'rate_limit_persistence_failure' };

      if (limited) {
        this.owner?.recordAudit?.('rate_limit_suppressed', {
          intentId: intent.intentId,
          businessId: intent.businessId,
          customerId: intent.customerId,
          channel,
          notificationType: intent.notificationType,
          classification: intent.classification,
          windowStartAt: next.windowStartAt,
          windowEndAt: next.windowEndAt,
          maxPerWindow: limit.maxPerWindow
        });
        this.owner?.incrementTelemetry?.('governance.rate_limit.suppressed.count', 1);
      }

      return {
        limited,
        bypassed: false,
        count: next.count,
        maxPerWindow: limit.maxPerWindow,
        windowStartAt: next.windowStartAt,
        windowEndAt: next.windowEndAt,
        policySnapshotHash: next.policySnapshotHash
      };
    }

    return { limited: true, failed: true, reason: 'rate_limit_cas_retry_exhausted' };
  }

  compareAndSet(key, current, next) {
    const namespace = `${this.namespace}.rate-limit-records`;
    if (!current && this.storageProvider?.database && typeof this.storageProvider.initializeSync === 'function') {
      this.storageProvider.initializeSync();
      const inserted = this.storageProvider.database.prepare(
        `INSERT INTO storage_records (namespace, record_id, payload, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(namespace, record_id) DO NOTHING`
      ).run(namespace, key, JSON.stringify(next), nowIso(this.now));

      if (Number(inserted?.changes ?? 0) === 1) {
        this.records.set(key, next);
        return { accepted: true };
      }

      return { accepted: false, code: 'VERSION_MISMATCH', reason: 'Concurrent insert detected.' };
    }

    if (this.storageProvider && typeof this.storageProvider.conditionalSetStateRecord === 'function' && current && this.records.has(key)) {
      const result = this.storageProvider.conditionalSetStateRecord({
        namespace,
        key,
        expectedVersion: Number(current.version),
        value: next
      });
      if (!result?.ok) {
        return {
          accepted: false,
          code: result?.code === 'VERSION_MISMATCH' ? 'VERSION_MISMATCH' : 'PERSISTENCE_FAILURE',
          reason: result?.reason ?? 'CAS failure'
        };
      }
      this.records.set(key, next);
      upsertRecord({ provider: this.storageProvider, namespace, key, value: next });
      return { accepted: true };
    }

    if (current && this.records.has(key) && Number(this.records.get(key)?.version ?? -1) !== Number(current.version ?? -2)) {
      return { accepted: false, code: 'VERSION_MISMATCH', reason: 'In-memory version mismatch' };
    }

    this.records.set(key, next);
    upsertRecord({ provider: this.storageProvider, namespace, key, value: next });
    return { accepted: true };
  }
}

class DuplicateSuppressionLedger {
  constructor({ storageProvider, now, namespace, owner = null } = {}) {
    this.storageProvider = storageProvider;
    this.now = now;
    this.namespace = namespace;
    this.owner = owner;
    this.records = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.suppression-ledger` });
  }

  makeKey({ sourceEventId, notificationType, recipient, channel }) {
    return stableHash(JSON.stringify({
      sourceEventId,
      notificationType,
      recipient,
      channel
    }));
  }

  checkAndRecord({
    sourceEventId,
    notificationType,
    recipient,
    channel,
    suppressionWindowMs = 300000,
    escalationException = false,
    securityOverride = false,
    intentId = null,
    businessId = null,
    customerId = null
  } = {}) {
    const key = this.makeKey({ sourceEventId, notificationType, recipient, channel });
    const existing = this.records.get(key) ?? null;
    const nowValue = nowMs(this.now);

    if (existing) {
      const ageMs = nowValue - Number(existing.firstSeenAtMs ?? 0);
      if (ageMs <= Number(suppressionWindowMs)) {
        if (escalationException || securityOverride) {
          this.owner?.recordAudit?.(securityOverride ? 'security_override' : 'mandatory_notice_override', {
            intentId,
            businessId,
            customerId,
            reason: securityOverride ? 'duplicate_suppression_security_override' : 'duplicate_suppression_escalation_exception',
            sourceEventId,
            notificationType,
            channel
          });
          this.owner?.incrementTelemetry?.('governance.duplicate.override.count', 1);
          return { suppressed: false, overridden: true, key };
        }

        this.owner?.recordAudit?.('duplicate_suppressed', {
          intentId,
          businessId,
          customerId,
          sourceEventId,
          notificationType,
          channel,
          suppressionWindowMs
        });
        this.owner?.incrementTelemetry?.('governance.duplicate.suppressed.count', 1);
        return { suppressed: true, overridden: false, key };
      }
    }

    const next = Object.freeze({
      key,
      sourceEventId,
      notificationType,
      recipient,
      channel,
      firstSeenAt: nowIso(this.now),
      firstSeenAtMs: nowValue,
      lastSeenAt: nowIso(this.now),
      seenCount: Number(existing?.seenCount ?? 0) + 1,
      version: Number(existing?.version ?? 0) + 1,
      retention: {
        policy: 'WINDOW_PLUS_BUFFER',
        retentionExpiresAt: new Date(nowValue + Number(suppressionWindowMs) + 86400000).toISOString()
      }
    });

    this.records.set(key, next);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.suppression-ledger`, key, value: next });

    return { suppressed: false, overridden: false, key };
  }
}

export class NotificationGovernanceSafetyIntegration {
  constructor({
    storageProvider,
    now,
    namespace = 'executive.notification-governance-safety',
    retentionDays = 365,
    quietHoursDefaults = {
      timezone: 'UTC',
      start: '22:00',
      end: '08:00',
      invalidTimezonePolicy: 'FAIL_CLOSED'
    },
    rateLimitDefaults = {
      windowMs: 60000,
      maxPerWindow: 5
    },
    suppressionWindowMs = 300000,
    approvalAuthority = null,
    policyContextByIntentId = {}
  } = {}) {
    this.storageProvider = storageProvider;
    this.now = now;
    this.namespace = namespace;
    this.retentionDays = retentionDays;
    this.quietHoursDefaults = quietHoursDefaults;
    this.rateLimitDefaults = rateLimitDefaults;
    this.suppressionWindowMs = suppressionWindowMs;
    this.approvalAuthority = approvalAuthority ?? {
      getApprovalStatus() {
        return { found: false, status: 'MISSING' };
      }
    };

    this.policyContextByIntentId = { ...policyContextByIntentId };

    this.approvalRecords = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.approval-records` });
    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` });
    this.telemetry = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry` });

    this.consentRegistry = new ConsentPreferenceRegistry({
      storageProvider: this.storageProvider,
      now: this.now,
      namespace: this.namespace,
      retentionDays: this.retentionDays,
      owner: this
    });

    this.rateLimitLedger = new RateLimitLedger({
      storageProvider: this.storageProvider,
      now: this.now,
      namespace: this.namespace,
      owner: this,
      defaults: this.rateLimitDefaults
    });

    this.duplicateLedger = new DuplicateSuppressionLedger({
      storageProvider: this.storageProvider,
      now: this.now,
      namespace: this.namespace,
      owner: this
    });
  }

  setPolicyContext(intentId, context = {}) {
    this.policyContextByIntentId[String(intentId)] = { ...asObject(context) };
  }

  getPolicyContext(intentId) {
    return asObject(this.policyContextByIntentId[String(intentId)], {});
  }

  setApprovalReference({ intentId, approvalReference, businessId, customerId = null, source = 'SYSTEM', actor = null } = {}) {
    if (!hasText(intentId) || !hasText(approvalReference) || !hasText(businessId)) {
      return { accepted: false, code: 'INVALID_APPROVAL_REFERENCE', reason: 'intentId, approvalReference, and businessId are required.' };
    }

    const current = this.approvalRecords.get(String(intentId)) ?? null;
    const next = Object.freeze({
      intentId: String(intentId),
      approvalReference: String(approvalReference),
      businessId: String(businessId),
      customerId: hasText(customerId) ? String(customerId) : null,
      source: String(source),
      actor: actor ?? null,
      version: Number(current?.version ?? 0) + 1,
      updatedAt: nowIso(this.now),
      createdAt: current?.createdAt ?? nowIso(this.now),
      retention: {
        policy: 'TIME_BASED',
        retentionDays: this.retentionDays,
        retentionExpiresAt: new Date(nowMs(this.now) + this.retentionDays * 86400000).toISOString()
      }
    });

    this.approvalRecords.set(String(intentId), next);
    upsertRecord({
      provider: this.storageProvider,
      namespace: `${this.namespace}.approval-records`,
      key: String(intentId),
      value: next
    });

    appendEvent({
      provider: this.storageProvider,
      namespace: `${this.namespace}.approval-history`,
      key: deterministicId('napp', `${intentId}:${next.version}`),
      value: next
    });

    return { accepted: true, code: 'OK', record: next };
  }

  buildPolicyAdapters() {
    return {
      consentPreferences: {
        getSnapshot: (intent) => this.getConsentSnapshot(intent)
      },
      quietHours: {
        getSnapshot: (intent) => this.getQuietHoursSnapshot(intent)
      },
      rateLimit: {
        getSnapshot: (intent) => this.getRateLimitSnapshot(intent)
      },
      channelAvailability: {
        getSnapshot: (intent) => ({
          availableChannels: asArray(intent.candidateChannels),
          unavailableChannels: []
        })
      },
      governanceApproval: {
        getSnapshot: (intent) => this.getApprovalSnapshot(intent)
      },
      businessRules: {
        getSnapshot: (intent) => this.getBusinessRulesSnapshot(intent)
      }
    };
  }

  getConsentSnapshot(intent) {
    const classification = String(intent.classification).toUpperCase();
    const context = this.getPolicyContext(intent.intentId);
    const mandatoryOverride = Boolean(context.mandatoryOverride || context.legalMandatory || context.transactionalMandatory || context.securityCritical);

    return this.consentRegistry.evaluateConsentSnapshot(intent, {
      mandatoryOverride,
      overrideReason: context.securityCritical
        ? 'SECURITY_CRITICAL_OVERRIDE'
        : (mandatoryOverride ? 'MANDATORY_NOTICE_OVERRIDE' : null)
    });
  }

  getQuietHoursSnapshot(intent) {
    const context = this.getPolicyContext(intent.intentId);
    const classification = String(intent.classification).toUpperCase();
    const urgency = String(intent.urgency ?? 'NORMAL').toUpperCase();

    const timezone = String(context.customerTimezone ?? context.businessTimezone ?? this.quietHoursDefaults.timezone ?? 'UTC');
    const start = parseHourMinute(context.quietHoursStart ?? this.quietHoursDefaults.start ?? '22:00');
    const end = parseHourMinute(context.quietHoursEnd ?? this.quietHoursDefaults.end ?? '08:00');

    const invalidTimezonePolicy = String(context.invalidTimezonePolicy ?? this.quietHoursDefaults.invalidTimezonePolicy ?? 'FAIL_CLOSED').toUpperCase();

    if (!isValidTimezone(timezone)) {
      const failClosed = invalidTimezonePolicy !== 'EXPLICIT_FALLBACK_UTC';
      if (failClosed) {
        this.recordAudit('governance_policy_failed', {
          intentId: intent.intentId,
          reason: 'invalid_timezone_fail_closed',
          timezone
        });
        this.incrementTelemetry('governance.policy.failures.count', 1);
        return {
          active: true,
          timezone,
          deferredUntil: null,
          reason: 'INVALID_TIMEZONE_FAIL_CLOSED'
        };
      }
    }

    const effectiveTimezone = isValidTimezone(timezone) ? timezone : 'UTC';

    if (classification === NotificationIntentClassifications.SECURITY && urgency === 'CRITICAL') {
      this.recordAudit('security_override', {
        intentId: intent.intentId,
        reason: 'quiet_hours_bypass_security_critical',
        timezone: effectiveTimezone
      });
      this.incrementTelemetry('governance.override.security.count', 1);
      return { active: false, timezone: effectiveTimezone, reason: 'SECURITY_BYPASS' };
    }

    if (classification === NotificationIntentClassifications.LEGAL && (context.legalMandatory === true || context.mandatoryOverride === true)) {
      this.recordAudit('mandatory_notice_override', {
        intentId: intent.intentId,
        reason: 'quiet_hours_bypass_legal_mandatory',
        timezone: effectiveTimezone
      });
      this.incrementTelemetry('governance.override.mandatory.count', 1);
      return { active: false, timezone: effectiveTimezone, reason: 'LEGAL_MANDATORY_BYPASS' };
    }

    if ([
      NotificationIntentClassifications.EXECUTIVE,
      NotificationIntentClassifications.OPERATIONAL,
      NotificationIntentClassifications.SYSTEM
    ].includes(classification)) {
      return { active: false, timezone: effectiveTimezone, reason: 'INTERNAL_POLICY' };
    }

    if (!start || !end) {
      return {
        active: true,
        timezone: effectiveTimezone,
        reason: 'INVALID_QUIET_HOURS_WINDOW'
      };
    }

    const localMinutes = localMinutesInTimezone(nowMs(this.now), effectiveTimezone);
    const active = inQuietWindow(localMinutes, start.totalMinutes, end.totalMinutes);
    const nonUrgent = !['HIGH', 'CRITICAL'].includes(urgency);

    if (active && nonUrgent) {
      const deferMs = Number(context.defaultDeferMs ?? 60 * 60 * 1000);
      const deferredUntil = new Date(nowMs(this.now) + deferMs).toISOString();
      this.recordAudit('quiet_hours_deferred', {
        intentId: intent.intentId,
        timezone: effectiveTimezone,
        deferredUntil,
        classification,
        urgency
      });
      this.incrementTelemetry('governance.quiet_hours.deferred.count', 1);
      return {
        active: true,
        timezone: effectiveTimezone,
        deferredUntil,
        reason: 'QUIET_HOURS_ACTIVE'
      };
    }

    return {
      active: false,
      timezone: effectiveTimezone,
      deferredUntil: null,
      reason: 'QUIET_HOURS_INACTIVE'
    };
  }

  getRateLimitSnapshot(intent) {
    const context = this.getPolicyContext(intent.intentId);
    const channel = String(asArray(intent.candidateChannels)[0] ?? NotificationChannels.EMAIL).toUpperCase();
    const mandatoryOverride = Boolean(context.mandatoryOverride || context.legalMandatory || context.transactionalMandatory);

    const outcome = this.rateLimitLedger.checkAndIncrement(intent, {
      channel,
      context: {
        maxPerWindow: context.maxPerWindow,
        windowMs: context.windowMs,
        scope: context.rateLimitScope,
        mandatoryOverride
      }
    });

    return {
      limited: Boolean(outcome.limited),
      bypassed: Boolean(outcome.bypassed),
      reason: outcome.reason ?? null,
      windowStartAt: outcome.windowStartAt ?? null,
      windowEndAt: outcome.windowEndAt ?? null,
      policySnapshotHash: outcome.policySnapshotHash ?? null
    };
  }

  getApprovalSnapshot(intent) {
    const requiresApproval = Boolean(intent.governanceRequirements?.approvalRequired);
    if (!requiresApproval) {
      return {
        requiresApproval: false,
        approvalState: 'NOT_REQUIRED',
        blocked: false,
        approvalReference: null
      };
    }

    const record = this.approvalRecords.get(String(intent.intentId)) ?? null;
    const approvalReference = hasText(intent.approvalReference) ? intent.approvalReference : record?.approvalReference ?? null;

    if (!hasText(approvalReference)) {
      return {
        requiresApproval: true,
        approvalState: 'PENDING',
        blocked: false,
        approvalReference: null
      };
    }

    const authority = asObject(this.approvalAuthority.getApprovalStatus({ approvalReference, intent }), { found: false, status: 'MISSING' });
    const status = String(authority.status ?? 'MISSING').toUpperCase();

    if (!authority.found || ['MISSING', 'REVOKED', 'EXPIRED', 'STALE', 'REJECTED'].includes(status)) {
      this.recordAudit('approval_rejected', {
        intentId: intent.intentId,
        approvalReference,
        reason: authority.reason ?? status
      });
      this.incrementTelemetry('governance.approval.failures.count', 1);
      return {
        requiresApproval: false,
        approvalState: 'REJECTED',
        blocked: true,
        approvalReference,
        reason: authority.reason ?? status
      };
    }

    if (hasText(authority.businessId) && String(authority.businessId) !== String(intent.businessId)) {
      this.recordAudit('cross_tenant_access_denied', {
        intentId: intent.intentId,
        approvalReference,
        reason: 'approval_business_mismatch',
        authorityBusinessId: authority.businessId,
        intentBusinessId: intent.businessId
      });
      this.incrementTelemetry('governance.cross_tenant.denials.count', 1);
      return {
        requiresApproval: false,
        approvalState: 'REJECTED',
        blocked: true,
        approvalReference,
        reason: 'approval_business_mismatch'
      };
    }

    if (hasText(authority.customerId) && hasText(intent.customerId) && String(authority.customerId) !== String(intent.customerId)) {
      this.recordAudit('cross_tenant_access_denied', {
        intentId: intent.intentId,
        approvalReference,
        reason: 'approval_customer_mismatch',
        authorityCustomerId: authority.customerId,
        intentCustomerId: intent.customerId
      });
      this.incrementTelemetry('governance.cross_tenant.denials.count', 1);
      return {
        requiresApproval: false,
        approvalState: 'REJECTED',
        blocked: true,
        approvalReference,
        reason: 'approval_customer_mismatch'
      };
    }

    if (status !== 'APPROVED') {
      this.incrementTelemetry('governance.approval.pending.backlog', 1);
      return {
        requiresApproval: true,
        approvalState: 'PENDING',
        blocked: false,
        approvalReference
      };
    }

    this.recordAudit('approval_verified', {
      intentId: intent.intentId,
      approvalReference,
      approvedAt: authority.approvedAt ?? null
    });

    return {
      requiresApproval: false,
      approvalState: 'APPROVED',
      blocked: false,
      approvalReference
    };
  }

  getBusinessRulesSnapshot(intent) {
    const context = this.getPolicyContext(intent.intentId);
    const classification = String(intent.classification).toUpperCase();

    if (classification === NotificationIntentClassifications.MARKETING) {
      return {
        mandatory: false,
        legalMandatory: false,
        explicitBlock: true,
        duplicateDetected: false,
        securityOverride: false
      };
    }

    const recipient = recipientIdentity(intent);
    const channel = String(asArray(intent.candidateChannels)[0] ?? NotificationChannels.EMAIL).toUpperCase();
    const suppression = this.duplicateLedger.checkAndRecord({
      sourceEventId: String(intent.sourceEventId ?? ''),
      notificationType: String(intent.notificationType),
      recipient,
      channel,
      suppressionWindowMs: Number(context.suppressionWindowMs ?? this.suppressionWindowMs),
      escalationException: Boolean(context.escalationException),
      securityOverride: classification === NotificationIntentClassifications.SECURITY && String(intent.urgency).toUpperCase() === 'CRITICAL',
      intentId: intent.intentId,
      businessId: intent.businessId,
      customerId: intent.customerId
    });

    const crossCustomer = asArray(intent.recipientRefs)
      .filter((entry) => String(entry.type ?? '').toUpperCase() === 'CUSTOMER' || hasText(entry.customerId))
      .some((entry) => {
        const candidate = String(entry.customerId ?? entry.id ?? '').trim();
        return hasText(intent.customerId) && hasText(candidate) && candidate !== String(intent.customerId);
      });

    const templateBusinessMismatch = hasText(context.templateBusinessId)
      && String(context.templateBusinessId) !== String(intent.businessId);

    const endpointBusinessMismatch = hasText(context.endpointBusinessId)
      && String(context.endpointBusinessId) !== String(intent.businessId);

    if (crossCustomer || templateBusinessMismatch || endpointBusinessMismatch) {
      this.recordAudit('cross_tenant_access_denied', {
        intentId: intent.intentId,
        reason: crossCustomer
          ? 'cross_customer_recipient_resolution_denied'
          : (templateBusinessMismatch ? 'cross_business_template_denied' : 'cross_business_endpoint_denied'),
        businessId: intent.businessId,
        customerId: intent.customerId
      });
      this.incrementTelemetry('governance.cross_tenant.denials.count', 1);
    }

    const explicitBlock = Boolean(crossCustomer || templateBusinessMismatch || endpointBusinessMismatch || context.explicitBlock === true);

    if (explicitBlock) {
      this.recordAudit('governance_policy_failed', {
        intentId: intent.intentId,
        reason: 'isolation_violation_or_explicit_block',
        businessId: intent.businessId,
        customerId: intent.customerId
      });
      this.incrementTelemetry('governance.policy.failures.count', 1);
    }

    return {
      mandatory: Boolean(context.transactionalMandatory || context.mandatoryOverride),
      legalMandatory: Boolean(context.legalMandatory),
      explicitBlock,
      duplicateDetected: Boolean(suppression.suppressed),
      securityOverride: Boolean(classification === NotificationIntentClassifications.SECURITY && String(intent.urgency).toUpperCase() === 'CRITICAL')
    };
  }

  getConsentHistory(args = {}) {
    return this.consentRegistry.listConsentHistory(args);
  }

  upsertConsentPreference(args = {}) {
    return this.consentRegistry.upsertConsent(args);
  }

  processOptOut(args = {}) {
    return this.consentRegistry.processOptOut(args);
  }

  incrementTelemetry(name, amount = 1) {
    const key = String(name ?? '').trim();
    if (!key) return;
    const next = Number(this.telemetry.get(key) ?? 0) + Number(amount);
    this.telemetry.set(key, next);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry`, key, value: next });
  }

  setTelemetry(name, value) {
    const key = String(name ?? '').trim();
    if (!key) return;
    this.telemetry.set(key, value);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry`, key, value });
  }

  getTelemetrySnapshot() {
    return Object.fromEntries(this.telemetry.entries());
  }

  recordAudit(event, details = {}) {
    const entry = {
      auditId: deterministicId('ngov_audit', `${event}:${nowIso(this.now)}:${stableHash(JSON.stringify(details))}`),
      event,
      at: nowIso(this.now),
      details: redact(details)
    };

    this.audit.set(entry.auditId, entry);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: entry.auditId, value: entry });
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.audit-events`, key: entry.auditId, value: entry });
  }

  listAuditRecords() {
    return Array.from(this.audit.values()).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
}
