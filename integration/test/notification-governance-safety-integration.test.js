import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { createDomainEventEnvelope, NotificationPolicyOutcomes } from '../src/executive/notification-domain-contracts.js';
import { NotificationIntentPolicyEngine } from '../src/executive/notification-intent-policy-engine.js';
import { NotificationGovernanceSafetyIntegration } from '../src/executive/notification-governance-safety-integration.js';

function withRuntime({ approvalAuthority } = {}, callback) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-notification-governance-'));
  const dbPath = join(dir, 'notification-governance.sqlite');

  const provider = new SQLiteStorageProvider({ databasePath: dbPath });
  let current = Date.parse('2026-07-12T10:00:00.000Z');
  const now = () => new Date(current).toISOString();

  const governance = new NotificationGovernanceSafetyIntegration({
    storageProvider: provider,
    now,
    approvalAuthority,
    suppressionWindowMs: 10 * 60 * 1000,
    rateLimitDefaults: {
      windowMs: 60 * 1000,
      maxPerWindow: 2
    },
    quietHoursDefaults: {
      timezone: 'UTC',
      start: '22:00',
      end: '08:00',
      invalidTimezonePolicy: 'FAIL_CLOSED'
    }
  });

  const engine = new NotificationIntentPolicyEngine({
    storageProvider: provider,
    now,
    policyAdapters: governance.buildPolicyAdapters()
  });

  function tick(ms) {
    current += ms;
    return now();
  }

  try {
    return callback({ provider, governance, engine, now, tick, dbPath });
  } finally {
    provider.closeSync();
  }
}

function canonicalEvent({
  eventType = 'WEBSITE_PUBLISHED',
  sourceEventId = 'src_1',
  businessId = 'biz_1',
  customerId = 'cust_1',
  correlationId = 'corr_1',
  causationId = 'cause_1'
} = {}) {
  return createDomainEventEnvelope({
    eventId: `evt_${sourceEventId}`,
    eventType,
    occurredAt: '2026-07-12T10:00:00.000Z',
    recordedAt: '2026-07-12T10:00:00.100Z',
    sourceSystem: 'TEST_SOURCE',
    sourceEntityType: 'test-entity',
    sourceEntityId: `entity_${sourceEventId}`,
    businessId,
    customerId,
    missionId: 'mission_1',
    correlationId,
    causationId,
    sensitivity: 'INTERNAL',
    payload: {
      sourceEventId,
      data: {}
    },
    metadata: {
      sourceOwnership: {
        sourceSystem: 'TEST_SOURCE',
        sourceEventId,
        sourceEntityType: 'test-entity',
        sourceEntityId: `entity_${sourceEventId}`
      }
    }
  });
}

function firstCreatedIntent(engine, event) {
  const created = engine.createIntentsFromCanonicalEvent(event);
  assert.equal(created.accepted, true);
  assert.equal(created.created.length > 0, true);
  return created.created[0];
}

test('opt-in and opt-out persistence', () => {
  withRuntime({}, ({ governance }) => {
    const optIn = governance.upsertConsentPreference({
      customerId: 'cust_1',
      businessId: 'biz_1',
      channel: 'EMAIL',
      notificationClass: 'CUSTOMER_SUCCESS',
      consentState: 'OPTED_IN',
      source: 'test'
    });
    assert.equal(optIn.accepted, true);

    const optOut = governance.upsertConsentPreference({
      customerId: 'cust_1',
      businessId: 'biz_1',
      channel: 'EMAIL',
      notificationClass: 'CUSTOMER_SUCCESS',
      consentState: 'OPTED_OUT',
      source: 'test',
      expectedVersion: optIn.record.version
    });
    assert.equal(optOut.accepted, true);
    assert.equal(optOut.record.consentState, 'OPTED_OUT');
  });
});

test('immutable consent history', () => {
  withRuntime({}, ({ governance }) => {
    const first = governance.upsertConsentPreference({
      customerId: 'cust_2',
      businessId: 'biz_1',
      channel: 'EMAIL',
      notificationClass: 'CUSTOMER_SUCCESS',
      consentState: 'OPTED_IN',
      source: 'test'
    });

    const second = governance.upsertConsentPreference({
      customerId: 'cust_2',
      businessId: 'biz_1',
      channel: 'EMAIL',
      notificationClass: 'CUSTOMER_SUCCESS',
      consentState: 'OPTED_OUT',
      source: 'test',
      expectedVersion: first.record.version
    });

    const history = governance.getConsentHistory({
      customerId: 'cust_2',
      businessId: 'biz_1',
      channel: 'EMAIL',
      notificationClass: 'CUSTOMER_SUCCESS'
    });

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    assert.equal(history.length >= 2, true);
    assert.equal(history[0].version < history[history.length - 1].version, true);
  });
});

test('unknown-consent fail-closed behavior', () => {
  withRuntime({}, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'consent_unknown' }));
    const snapshot = governance.getConsentSnapshot(intent);

    assert.equal(snapshot.allowed, false);
    assert.equal(snapshot.reason, 'UNKNOWN_CONSENT_FAIL_CLOSED');
  });
});

test('mandatory transactional override', () => {
  withRuntime({}, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ eventType: 'PAYMENT_SUCCEEDED', sourceEventId: 'mandatory_txn' }));
    const transactional = engine.listIntents({}).find((entry) => entry.intentId === intent.intentId || entry.classification === 'TRANSACTIONAL');

    governance.upsertConsentPreference({
      customerId: transactional.customerId,
      businessId: transactional.businessId,
      channel: 'EMAIL',
      notificationClass: 'TRANSACTIONAL',
      consentState: 'OPTED_OUT',
      source: 'test'
    });

    governance.setPolicyContext(transactional.intentId, { transactionalMandatory: true, mandatoryOverride: true });

    const evaluated = engine.evaluateIntentPolicy({ intentId: transactional.intentId });
    assert.equal(evaluated.accepted, true);
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.ALLOW);
  });
});

test('critical security override', () => {
  withRuntime({}, ({ governance, engine }) => {
    const created = engine.createIntentsFromCanonicalEvent(canonicalEvent({ eventType: 'IDENTITY_SECURITY_INCIDENT', sourceEventId: 'sec_override' }));
    const intent = created.created[0];

    governance.upsertConsentPreference({
      customerId: intent.customerId,
      businessId: intent.businessId,
      channel: 'EXECUTIVE',
      notificationClass: 'SECURITY',
      consentState: 'OPTED_OUT',
      source: 'test'
    });

    governance.setPolicyContext(intent.intentId, { securityCritical: true });

    const evaluated = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(evaluated.accepted, true);
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.OVERRIDE_FOR_SECURITY);
  });
});

test('quiet-hours deferral', () => {
  withRuntime({}, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'quiet_deferral' }));
    governance.upsertConsentPreference({
      customerId: intent.customerId,
      businessId: intent.businessId,
      channel: 'EMAIL',
      notificationClass: 'CUSTOMER_SUCCESS',
      consentState: 'OPTED_IN',
      source: 'test'
    });
    governance.setPolicyContext(intent.intentId, {
      customerTimezone: 'UTC',
      quietHoursStart: '00:00',
      quietHoursEnd: '23:59'
    });

    const evaluated = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(evaluated.accepted, true);
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.DEFER);
  });
});

test('timezone edge case invalid timezone fails closed', () => {
  withRuntime({}, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'tz_invalid' }));
    governance.setPolicyContext(intent.intentId, {
      customerTimezone: 'Mars/OlympusMons',
      invalidTimezonePolicy: 'FAIL_CLOSED'
    });

    const snapshot = governance.getQuietHoursSnapshot(intent);
    assert.equal(snapshot.active, true);
    assert.equal(snapshot.reason, 'INVALID_TIMEZONE_FAIL_CLOSED');
  });
});

test('customer rate limit suppression', () => {
  withRuntime({}, ({ governance, engine }) => {
    const event = canonicalEvent({ sourceEventId: 'rate_customer' });
    const intent = firstCreatedIntent(engine, event);

    governance.upsertConsentPreference({
      customerId: intent.customerId,
      businessId: intent.businessId,
      channel: 'EMAIL',
      notificationClass: 'CUSTOMER_SUCCESS',
      consentState: 'OPTED_IN',
      source: 'test'
    });

    governance.setPolicyContext(intent.intentId, { maxPerWindow: 1, windowMs: 60000, quietHoursStart: '23:00', quietHoursEnd: '23:30' });

    const first = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(first.accepted, true);

    const another = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'rate_customer_2' }));
    governance.upsertConsentPreference({
      customerId: another.customerId,
      businessId: another.businessId,
      channel: 'EMAIL',
      notificationClass: 'CUSTOMER_SUCCESS',
      consentState: 'OPTED_IN',
      source: 'test'
    });
    governance.setPolicyContext(another.intentId, { maxPerWindow: 1, windowMs: 60000, quietHoursStart: '23:00', quietHoursEnd: '23:30' });

    const second = engine.evaluateIntentPolicy({ intentId: another.intentId });
    assert.equal(second.decision.outcome, NotificationPolicyOutcomes.SUPPRESS_RATE_LIMIT);
  });
});

test('business rate limit suppression', () => {
  withRuntime({}, ({ governance, engine }) => {
    const a = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'rate_business_1', customerId: 'cust_a' }));
    const b = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'rate_business_2', customerId: 'cust_b' }));

    governance.upsertConsentPreference({ customerId: a.customerId, businessId: a.businessId, channel: 'EMAIL', notificationClass: 'CUSTOMER_SUCCESS', consentState: 'OPTED_IN', source: 'test' });
    governance.upsertConsentPreference({ customerId: b.customerId, businessId: b.businessId, channel: 'EMAIL', notificationClass: 'CUSTOMER_SUCCESS', consentState: 'OPTED_IN', source: 'test' });

    governance.setPolicyContext(a.intentId, { maxPerWindow: 1, windowMs: 60000, rateLimitScope: 'BUSINESS', quietHoursStart: '23:00', quietHoursEnd: '23:30' });
    governance.setPolicyContext(b.intentId, { maxPerWindow: 1, windowMs: 60000, rateLimitScope: 'BUSINESS', quietHoursStart: '23:00', quietHoursEnd: '23:30' });

    const first = engine.evaluateIntentPolicy({ intentId: a.intentId });
    assert.equal(first.accepted, true);

    const second = engine.evaluateIntentPolicy({ intentId: b.intentId });
    assert.equal(second.decision.outcome, NotificationPolicyOutcomes.SUPPRESS_RATE_LIMIT);
  });
});

test('atomic concurrent rate-limit checks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-notification-rate-concurrent-'));
  const dbPath = join(dir, 'notification-governance.sqlite');

  const providerA = new SQLiteStorageProvider({ databasePath: dbPath });
  const providerB = new SQLiteStorageProvider({ databasePath: dbPath });

  const now = () => '2026-07-12T10:00:00.000Z';

  const governanceA = new NotificationGovernanceSafetyIntegration({
    storageProvider: providerA,
    now,
    rateLimitDefaults: { windowMs: 60000, maxPerWindow: 1 }
  });

  const governanceB = new NotificationGovernanceSafetyIntegration({
    storageProvider: providerB,
    now,
    rateLimitDefaults: { windowMs: 60000, maxPerWindow: 1 }
  });

  const intent = {
    intentId: 'nint_atomic_1',
    businessId: 'biz_atomic',
    customerId: 'cust_atomic',
    candidateChannels: ['EMAIL'],
    notificationType: 'WEBSITE_PUBLISHED',
    classification: 'CUSTOMER_SUCCESS',
    urgency: 'NORMAL',
    consentRequirements: { requireOptIn: true }
  };

  governanceA.setPolicyContext(intent.intentId, { rateLimitScope: 'BUSINESS' });
  governanceB.setPolicyContext(intent.intentId, { rateLimitScope: 'BUSINESS' });

  const [left, right] = await Promise.all([
    Promise.resolve(governanceA.getRateLimitSnapshot(intent)),
    Promise.resolve(governanceB.getRateLimitSnapshot(intent))
  ]);

  const limitedCount = [left, right].filter((entry) => entry.limited === true).length;
  const allowedCount = [left, right].filter((entry) => entry.limited === false).length;

  assert.equal(limitedCount, 1);
  assert.equal(allowedCount, 1);

  providerA.closeSync();
  providerB.closeSync();
});

test('duplicate suppression', () => {
  withRuntime({}, ({ governance, engine }) => {
    const first = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'dup_same' }));
    governance.upsertConsentPreference({ customerId: first.customerId, businessId: first.businessId, channel: 'EMAIL', notificationClass: 'CUSTOMER_SUCCESS', consentState: 'OPTED_IN', source: 'test' });
    governance.setPolicyContext(first.intentId, { quietHoursStart: '23:00', quietHoursEnd: '23:30' });
    const firstEval = engine.evaluateIntentPolicy({ intentId: first.intentId });
    assert.equal(firstEval.accepted, true);

    const second = Object.freeze({
      ...first,
      intentId: `${first.intentId}_dup2`,
      dedupeKey: `${first.dedupeKey}_dup2`,
      state: 'CREATED',
      decisionHistory: [],
      approvalReference: null,
      version: 1,
      updatedAt: '2026-07-12T10:00:00.000Z'
    });
    engine.intents.set(second.intentId, second);
    engine.storageProvider.upsertRecordSync(`${engine.namespace}.intents`, second.intentId, second);

    governance.upsertConsentPreference({ customerId: second.customerId, businessId: second.businessId, channel: 'EMAIL', notificationClass: 'CUSTOMER_SUCCESS', consentState: 'OPTED_IN', source: 'test' });
    governance.setPolicyContext(second.intentId, { quietHoursStart: '23:00', quietHoursEnd: '23:30' });
    const secondEval = engine.evaluateIntentPolicy({ intentId: second.intentId });

    assert.equal(secondEval.decision.outcome, NotificationPolicyOutcomes.SUPPRESS_DUPLICATE);
  });
});

test('escalation exception bypasses duplicate suppression', () => {
  withRuntime({}, ({ governance, engine }) => {
    const first = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'dup_escalate' }));
    governance.upsertConsentPreference({ customerId: first.customerId, businessId: first.businessId, channel: 'EMAIL', notificationClass: 'CUSTOMER_SUCCESS', consentState: 'OPTED_IN', source: 'test' });
    governance.setPolicyContext(first.intentId, { quietHoursStart: '23:00', quietHoursEnd: '23:30' });
    engine.evaluateIntentPolicy({ intentId: first.intentId });

    const second = Object.freeze({
      ...first,
      intentId: `${first.intentId}_dup2`,
      dedupeKey: `${first.dedupeKey}_dup2`,
      state: 'CREATED',
      decisionHistory: [],
      approvalReference: null,
      version: 1,
      updatedAt: '2026-07-12T10:00:00.000Z'
    });
    engine.intents.set(second.intentId, second);
    engine.storageProvider.upsertRecordSync(`${engine.namespace}.intents`, second.intentId, second);

    governance.upsertConsentPreference({ customerId: second.customerId, businessId: second.businessId, channel: 'EMAIL', notificationClass: 'CUSTOMER_SUCCESS', consentState: 'OPTED_IN', source: 'test' });
    governance.setPolicyContext(second.intentId, { escalationException: true, quietHoursStart: '23:00', quietHoursEnd: '23:30' });

    const evaluated = engine.evaluateIntentPolicy({ intentId: second.intentId });
    assert.equal(evaluated.decision.outcome === NotificationPolicyOutcomes.SUPPRESS_DUPLICATE, false);
  });
});

test('valid approval progression from APPROVAL_PENDING to ELIGIBLE', () => {
  const approvals = new Map();
  withRuntime({
    approvalAuthority: {
      getApprovalStatus({ approvalReference }) {
        return approvals.get(approvalReference) ?? { found: false, status: 'MISSING' };
      }
    }
  }, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'approval_valid' }));

    const pending = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(pending.decision.outcome, NotificationPolicyOutcomes.REQUIRE_APPROVAL);
    assert.equal(pending.intent.state, 'APPROVAL_PENDING');

    governance.setApprovalReference({ intentId: intent.intentId, approvalReference: 'apr_1', businessId: intent.businessId, customerId: intent.customerId, source: 'CEO' });
    approvals.set('apr_1', { found: true, status: 'APPROVED', businessId: intent.businessId, customerId: intent.customerId, approvedAt: '2026-07-12T10:05:00.000Z' });
    governance.setPolicyContext(intent.intentId, { escalationException: true });

    const reevaluated = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(reevaluated.accepted, true);
    assert.equal(reevaluated.decision.outcome, NotificationPolicyOutcomes.ALLOW);
    assert.equal(reevaluated.intent.state, 'ELIGIBLE');
  });
});

test('stale approval rejection', () => {
  withRuntime({
    approvalAuthority: {
      getApprovalStatus() {
        return { found: true, status: 'STALE', businessId: 'biz_1', customerId: 'cust_1' };
      }
    }
  }, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'approval_stale' }));
    governance.setApprovalReference({ intentId: intent.intentId, approvalReference: 'apr_stale', businessId: intent.businessId, customerId: intent.customerId });

    const evaluated = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.BLOCK);
  });
});

test('revoked approval rejection', () => {
  withRuntime({
    approvalAuthority: {
      getApprovalStatus() {
        return { found: true, status: 'REVOKED', businessId: 'biz_1', customerId: 'cust_1' };
      }
    }
  }, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'approval_revoked' }));
    governance.setApprovalReference({ intentId: intent.intentId, approvalReference: 'apr_revoked', businessId: intent.businessId, customerId: intent.customerId });

    const evaluated = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.BLOCK);
  });
});

test('cross-business approval rejection', () => {
  withRuntime({
    approvalAuthority: {
      getApprovalStatus() {
        return { found: true, status: 'APPROVED', businessId: 'biz_other', customerId: 'cust_1' };
      }
    }
  }, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'approval_cross_biz' }));
    governance.setApprovalReference({ intentId: intent.intentId, approvalReference: 'apr_cross', businessId: intent.businessId, customerId: intent.customerId });

    const evaluated = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.BLOCK);
  });
});

test('cross-customer consent denial', () => {
  withRuntime({}, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'cross_customer_denial' }));
    governance.setPolicyContext(intent.intentId, {
      recipientRefs: [{ customerId: 'cust_x' }]
    });

    const mutableIntent = engine.intents.get(intent.intentId);
    const patched = Object.freeze({
      ...mutableIntent,
      recipientRefs: [{ type: 'CUSTOMER', customerId: 'cust_x' }],
      version: Number(mutableIntent.version) + 1
    });
    engine.intents.set(intent.intentId, patched);
    engine.storageProvider.upsertRecordSync(`${engine.namespace}.intents`, intent.intentId, patched);

    const evaluated = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.BLOCK);
  });
});

test('cross-business template and endpoint denial', () => {
  withRuntime({}, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'cross_template_endpoint' }));
    governance.setPolicyContext(intent.intentId, {
      templateBusinessId: 'biz_other',
      endpointBusinessId: 'biz_other'
    });

    const evaluated = engine.evaluateIntentPolicy({ intentId: intent.intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.BLOCK);
  });
});

test('MARKETING blocked through all paths', () => {
  withRuntime({}, ({ governance, engine }) => {
    const source = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'marketing_block' }));
    const marketingIntent = Object.freeze({
      ...source,
      intentId: `${source.intentId}_marketing`,
      classification: 'MARKETING',
      dedupeKey: `${source.dedupeKey}_marketing`,
      version: 1,
      createdAt: '2026-07-12T10:00:00.000Z',
      updatedAt: '2026-07-12T10:00:00.000Z',
      state: 'CREATED',
      approvalReference: null,
      decisionHistory: []
    });

    engine.intents.set(marketingIntent.intentId, marketingIntent);
    engine.storageProvider.upsertRecordSync(`${engine.namespace}.intents`, marketingIntent.intentId, marketingIntent);
    governance.setPolicyContext(marketingIntent.intentId, { mandatoryOverride: true, securityCritical: true });

    const evaluated = engine.evaluateIntentPolicy({ intentId: marketingIntent.intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.BLOCK);
  });
});

test('opt-out ownership enforcement', () => {
  withRuntime({}, ({ governance }) => {
    const denied = governance.processOptOut({
      authenticatedCustomerId: 'cust_auth',
      customerId: 'cust_other',
      businessId: 'biz_1',
      channel: 'EMAIL',
      notificationClass: 'CUSTOMER_SUCCESS',
      csrfValidated: true,
      originValidated: true,
      source: 'api'
    });

    assert.equal(denied.accepted, false);
    assert.equal(denied.code, 'FORBIDDEN');
  });
});

test('audit redaction', () => {
  withRuntime({}, ({ governance }) => {
    governance.recordAudit('redaction_probe', {
      apiToken: 'secret-token',
      payload: '<html>very large body</html>',
      recipientEmail: 'customer@example.com',
      safeField: 'safe-value'
    });

    const audit = JSON.stringify(governance.listAuditRecords());
    assert.equal(audit.includes('secret-token'), false);
    assert.equal(audit.includes('customer@example.com'), false);
    assert.equal(audit.includes('[REDACTED]'), true);
  });
});

test('telemetry emission', () => {
  withRuntime({}, ({ governance, engine }) => {
    const intent = firstCreatedIntent(engine, canonicalEvent({ sourceEventId: 'telemetry_emit' }));
    governance.upsertConsentPreference({ customerId: intent.customerId, businessId: intent.businessId, channel: 'EMAIL', notificationClass: 'CUSTOMER_SUCCESS', consentState: 'OPTED_OUT', source: 'test' });
    governance.setPolicyContext(intent.intentId, { quietHoursStart: '00:00', quietHoursEnd: '23:59', maxPerWindow: 1, windowMs: 60000 });

    engine.evaluateIntentPolicy({ intentId: intent.intentId });

    const telemetry = governance.getTelemetrySnapshot();
    assert.equal((telemetry['governance.consent.upsert.count'] ?? 0) > 0, true);
    assert.equal((telemetry['governance.preference.suppression.count'] ?? 0) > 0, true);
  });
});
