import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { createDomainEventEnvelope, NotificationIntentClassifications, NotificationPolicyOutcomes } from '../src/executive/notification-domain-contracts.js';
import {
  NotificationIntentPolicyEngine,
  createStaticPolicyInputAdapters
} from '../src/executive/notification-intent-policy-engine.js';

function withEngine({ adapters } = {}, callback) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-notification-policy-'));
  const provider = new SQLiteStorageProvider({ databasePath: join(dir, 'notification-policy.sqlite') });
  const engine = new NotificationIntentPolicyEngine({
    storageProvider: provider,
    policyAdapters: adapters
  });

  try {
    return callback({ engine, provider });
  } finally {
    provider.closeSync();
  }
}

function canonicalEvent({ eventType, sourceEventId, businessId = 'biz_a', customerId = 'cust_a', missionId = 'mission_a', correlationId = 'corr_a', causationId = 'cause_a', payloadData = {}, sensitivity = 'INTERNAL' } = {}) {
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
    missionId,
    correlationId,
    causationId,
    sensitivity,
    payload: {
      sourceEventId,
      data: payloadData
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

test('successful event-to-intent mapping', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({
      eventType: 'MISSION_APPROVAL_REQUIRED',
      sourceEventId: 'src_1'
    });

    const result = engine.createIntentsFromCanonicalEvent(event);

    assert.equal(result.accepted, true);
    assert.equal(result.created.length, 1);
    assert.equal(result.created[0].notificationType, 'MISSION_APPROVAL_REQUIRED');
  });
});

test('one event can produce multiple intents', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({
      eventType: 'PAYMENT_SUCCEEDED',
      sourceEventId: 'src_multi'
    });

    const result = engine.createIntentsFromCanonicalEvent(event);

    assert.equal(result.accepted, true);
    assert.equal(result.created.length, 2);
  });
});

test('duplicate event replay does not create duplicate intents', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({
      eventType: 'MISSION_APPROVAL_REQUIRED',
      sourceEventId: 'src_dup'
    });

    const first = engine.createIntentsFromCanonicalEvent(event);
    const second = engine.createIntentsFromCanonicalEvent(event);

    assert.equal(first.created.length, 1);
    assert.equal(second.created.length, 0);
    assert.equal(second.duplicates.length, 1);
  });
});

test('deterministic dedupe key generation', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'src_dedupe' });

    const first = engine.mapCanonicalEventToIntents(event);
    const second = engine.mapCanonicalEventToIntents(event);

    assert.equal(first.intents[0].dedupeKey, second.intents[0].dedupeKey);
  });
});

test('security override precedence wins', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({
      eventType: 'IDENTITY_SECURITY_INCIDENT',
      sourceEventId: 'src_sec',
      sensitivity: 'RESTRICTED'
    });

    const create = engine.createIntentsFromCanonicalEvent(event);
    const intentId = create.created[0].intentId;

    const adapters = createStaticPolicyInputAdapters({
      businessRulesByIntentId: {
        [intentId]: { securityOverride: true, mandatory: false, explicitBlock: true }
      },
      governanceByIntentId: {
        [intentId]: { requiresApproval: true, approvalState: 'PENDING', blocked: true }
      },
      consentByIntentId: {
        [intentId]: { allowed: false }
      },
      quietHoursByIntentId: {
        [intentId]: { active: true }
      }
    });

    engine.policyAdapters = adapters;

    const evaluated = engine.evaluateIntentPolicy({ intentId });
    assert.equal(evaluated.accepted, true);
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.OVERRIDE_FOR_SECURITY);
  });
});

test('mandatory transactional precedence before approval and suppressions', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'PAYMENT_SUCCEEDED', sourceEventId: 'src_mandatory' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const transactionalIntent = create.created.find((intent) => intent.classification === NotificationIntentClassifications.TRANSACTIONAL);

    const adapters = createStaticPolicyInputAdapters({
      businessRulesByIntentId: {
        [transactionalIntent.intentId]: { mandatory: true, legalMandatory: false, duplicateDetected: true }
      },
      governanceByIntentId: {
        [transactionalIntent.intentId]: { requiresApproval: true, approvalState: 'PENDING' }
      },
      consentByIntentId: {
        [transactionalIntent.intentId]: { allowed: false }
      },
      rateLimitByIntentId: {
        [transactionalIntent.intentId]: { limited: true }
      }
    });

    engine.policyAdapters = adapters;
    const evaluated = engine.evaluateIntentPolicy({ intentId: transactionalIntent.intentId });

    assert.equal(evaluated.accepted, true);
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.ALLOW);
  });
});

test('approval-required outcome transitions to approval pending', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'src_approval' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const intentId = create.created[0].intentId;

    engine.policyAdapters = createStaticPolicyInputAdapters({
      governanceByIntentId: {
        [intentId]: { requiresApproval: true, approvalState: 'PENDING', approvalReference: 'ceo_ref_1' }
      }
    });

    const evaluated = engine.evaluateIntentPolicy({ intentId });

    assert.equal(evaluated.accepted, true);
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.REQUIRE_APPROVAL);
    assert.equal(evaluated.intent.state, 'APPROVAL_PENDING');
    assert.equal(evaluated.intent.approvalReference, 'ceo_ref_1');
  });
});

test('explicit policy block', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'WEBSITE_PUBLISHED', sourceEventId: 'src_block' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const intentId = create.created[0].intentId;

    engine.policyAdapters = createStaticPolicyInputAdapters({
      businessRulesByIntentId: {
        [intentId]: { explicitBlock: true }
      }
    });

    const evaluated = engine.evaluateIntentPolicy({ intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.BLOCK);
  });
});

test('duplicate suppression outcome', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'WEBSITE_PUBLISHED', sourceEventId: 'src_dup_supp' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const intentId = create.created[0].intentId;

    engine.policyAdapters = createStaticPolicyInputAdapters({
      businessRulesByIntentId: {
        [intentId]: { duplicateDetected: true }
      }
    });

    const evaluated = engine.evaluateIntentPolicy({ intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.SUPPRESS_DUPLICATE);
  });
});

test('rate-limit suppression outcome', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'WEBSITE_PUBLISHED', sourceEventId: 'src_rate' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const intentId = create.created[0].intentId;

    engine.policyAdapters = createStaticPolicyInputAdapters({
      rateLimitByIntentId: {
        [intentId]: { limited: true }
      }
    });

    const evaluated = engine.evaluateIntentPolicy({ intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.SUPPRESS_RATE_LIMIT);
  });
});

test('preference suppression outcome', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'WEBSITE_PUBLISHED', sourceEventId: 'src_pref' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const intentId = create.created[0].intentId;

    engine.policyAdapters = createStaticPolicyInputAdapters({
      consentByIntentId: {
        [intentId]: { allowed: false }
      }
    });

    const evaluated = engine.evaluateIntentPolicy({ intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.SUPPRESS_PREFERENCE);
  });
});

test('quiet-hours deferral outcome', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'WEBSITE_PUBLISHED', sourceEventId: 'src_quiet' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const intentId = create.created[0].intentId;

    engine.policyAdapters = createStaticPolicyInputAdapters({
      quietHoursByIntentId: {
        [intentId]: { active: true }
      }
    });

    const evaluated = engine.evaluateIntentPolicy({ intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.DEFER);
  });
});

test('marketing is blocked in v1', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'WEBSITE_PUBLISHED', sourceEventId: 'src_marketing' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const source = create.created[0];

    const marketingIntent = {
      ...source,
      intentId: `${source.intentId}_mkt`,
      classification: 'MARKETING',
      dedupeKey: `${source.dedupeKey}_mkt`,
      state: 'CREATED',
      version: 1,
      createdAt: '2026-07-12T10:00:00.000Z',
      updatedAt: '2026-07-12T10:00:00.000Z',
      sourceEventId: source.sourceEventId,
      approvalReference: null,
      decisionHistory: []
    };

    engine.intents.set(marketingIntent.intentId, Object.freeze(marketingIntent));
    providerUpsert(engine, marketingIntent);

    const evaluated = engine.evaluateIntentPolicy({ intentId: marketingIntent.intentId });
    assert.equal(evaluated.decision.outcome, NotificationPolicyOutcomes.BLOCK);
  });
});

function providerUpsert(engine, intent) {
  engine.storageProvider.upsertRecordSync(`${engine.namespace}.intents`, intent.intentId, intent);
}

test('illegal state transition fails closed', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'src_illegal' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const intentId = create.created[0].intentId;

    const illegal = engine.transitionIntentState({
      intentId,
      fromState: 'CREATED',
      toState: 'ELIGIBLE',
      reason: 'illegal'
    });

    assert.equal(illegal.ok, false);
  });
});

test('policy decision records are immutable', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'src_immutable' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    const evaluated = engine.evaluateIntentPolicy({ intentId: create.created[0].intentId });

    assert.equal(Object.isFrozen(evaluated.decision), true);
  });
});

test('customer and business isolation in intent listing', () => {
  withEngine({}, ({ engine }) => {
    engine.createIntentsFromCanonicalEvent(canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'src_iso_1', businessId: 'biz_1', customerId: 'cust_1' }));
    engine.createIntentsFromCanonicalEvent(canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'src_iso_2', businessId: 'biz_2', customerId: 'cust_2' }));

    const filtered = engine.listIntents({ businessId: 'biz_1', customerId: 'cust_1' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].businessId, 'biz_1');
    assert.equal(filtered[0].customerId, 'cust_1');
  });
});

test('correlation and causation are propagated to intents', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({
      eventType: 'MISSION_APPROVAL_REQUIRED',
      sourceEventId: 'src_corr',
      correlationId: 'corr_x',
      causationId: 'cause_x'
    });

    const create = engine.createIntentsFromCanonicalEvent(event);
    const intent = create.created[0];

    assert.equal(intent.correlationId, 'corr_x');
    assert.equal(intent.causationId, 'cause_x');
  });
});

test('audit redaction uses canonical audit-safe serializer', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({
      eventType: 'IDENTITY_SECURITY_INCIDENT',
      sourceEventId: 'src_audit',
      payloadData: {
        accessToken: 'secret',
        recipientEmail: 'hidden@example.com'
      },
      sensitivity: 'RESTRICTED'
    });

    const sanitized = engine.getSanitizedAuditSourceEvent(event);
    assert.equal(sanitized.payload.data.accessToken, '[REDACTED]');
    assert.equal(sanitized.payload.data.recipientEmail, '[REDACTED]');
  });
});

test('telemetry counters are emitted for intent classifications and policy outcomes', () => {
  withEngine({}, ({ engine }) => {
    const event = canonicalEvent({ eventType: 'MISSION_APPROVAL_REQUIRED', sourceEventId: 'src_tel' });
    const create = engine.createIntentsFromCanonicalEvent(event);
    engine.policyAdapters = createStaticPolicyInputAdapters({
      governanceByIntentId: {
        [create.created[0].intentId]: { requiresApproval: true, approvalState: 'PENDING' }
      }
    });
    engine.evaluateIntentPolicy({ intentId: create.created[0].intentId });

    const telemetry = engine.getTelemetrySnapshot();
    assert.equal((telemetry['intent.classification.EXECUTIVE.count'] ?? 0) > 0, true);
    assert.equal((telemetry['policy.outcome.REQUIRE_APPROVAL.count'] ?? 0) > 0, true);
  });
});
