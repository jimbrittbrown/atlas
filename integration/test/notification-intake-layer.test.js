import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import {
  NotificationIntakeLayer,
  NotificationSourceSystems
} from '../src/executive/notification-intake-layer.js';

function withSqliteIntake(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-notification-intake-'));
  const databasePath = join(dir, 'intake.sqlite');
  const provider = new SQLiteStorageProvider({ databasePath });
  const intake = new NotificationIntakeLayer({ storageProvider: provider });

  try {
    return callback({ intake, provider });
  } finally {
    provider.closeSync();
  }
}

test('successful normalization from payment platform produces canonical immutable event', () => {
  withSqliteIntake(({ intake }) => {
    const sourceEvent = {
      auditId: 'pay_audit_001',
      timestamp: '2026-07-12T09:30:00.000Z',
      event: 'PAYMENT_CHECKOUT_CREATED',
      correlationId: 'corr_pay_001',
      details: {
        paymentId: 'pay_001',
        missionId: 'mission_001',
        customerId: 'cust_001',
        businessId: 'biz_001'
      }
    };

    const result = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.PAYMENT_PLATFORM,
      sourceEvent
    });

    assert.equal(result.accepted, true);
    assert.equal(result.duplicate, false);
    assert.equal(result.canonicalEvent.sourceSystem, NotificationSourceSystems.PAYMENT_PLATFORM);
    assert.equal(result.canonicalEvent.eventType, 'PAYMENT_PLATFORM.PAYMENT_CHECKOUT_CREATED');
    assert.equal(result.canonicalEvent.correlationId, 'corr_pay_001');
    assert.equal(Object.isFrozen(result.canonicalEvent), true);
  });
});

test('duplicate replay returns existing canonical event deterministically', () => {
  withSqliteIntake(({ intake }) => {
    const sourceEvent = {
      auditId: 'ops_audit_001',
      timestamp: '2026-07-12T09:31:00.000Z',
      event: 'CYCLE_COMPLETED',
      details: {
        cycleId: 'cycle_1',
        businessId: 'biz_001'
      }
    };

    const first = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.OPERATIONS_LOOP,
      sourceEvent
    });

    const second = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.OPERATIONS_LOOP,
      sourceEvent
    });

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    assert.equal(second.duplicate, true);
    assert.equal(first.normalizationKey, second.normalizationKey);
    assert.equal(first.canonicalEvent.eventId, second.canonicalEvent.eventId);
    assert.equal(intake.listCanonicalEvents().length, 1);
  });
});

test('malformed source event is rejected with structured validation failures', () => {
  withSqliteIntake(({ intake }) => {
    const result = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.IDENTITY_PLATFORM,
      sourceEvent: null
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, 'SOURCE_EVENT_MALFORMED');
    assert.equal(Array.isArray(result.failures), true);
    assert.equal(result.failures[0].issue, 'SOURCE_EVENT_MALFORMED');
  });
});

test('unknown source system is rejected', () => {
  withSqliteIntake(({ intake }) => {
    const result = intake.normalizeSourceEvent({
      sourceSystem: 'LEGACY_UNKNOWN_SOURCE',
      sourceEvent: { eventId: 'x' }
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, 'UNKNOWN_SOURCE_SYSTEM');
    assert.equal(result.failures[0].issue, 'UNKNOWN_SOURCE_SYSTEM');
  });
});

test('missing required fields are rejected for source integrity', () => {
  withSqliteIntake(({ intake }) => {
    const result = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.SIGNED_ARTIFACT_DELIVERY,
      sourceEvent: {
        eventId: '',
        type: '',
        at: '2026-07-12T09:32:00.000Z'
      }
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, 'SOURCE_EVENT_VALIDATION_FAILED');
    assert.equal(result.failures.some((item) => item.field === 'eventId'), true);
    assert.equal(result.failures.some((item) => item.field === 'type'), true);
  });
});

test('invalid source event version is rejected', () => {
  withSqliteIntake(({ intake }) => {
    const result = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.MISSION_CONTROL,
      sourceEvent: {
        auditEventId: 'mc_audit_1',
        command: 'MISSION_APPROVE',
        timestamp: '2026-07-12T09:33:00.000Z',
        eventVersion: 'v1',
        missionId: 'mission_1',
        businessId: 'biz_1'
      }
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, 'SOURCE_EVENT_VALIDATION_FAILED');
    assert.equal(result.failures.some((item) => item.issue === 'INVALID_EVENT_VERSION_FORMAT'), true);
  });
});

test('invalid sensitivity classification is rejected', () => {
  withSqliteIntake(({ intake }) => {
    const result = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.CEO_DECISION_CENTER,
      sourceEvent: {
        decisionId: 'decision_1',
        decisionType: 'CEO_GOVERNANCE_APPROVAL',
        timestamp: '2026-07-12T09:34:00.000Z',
        relatedMission: 'mission_77',
        businessId: 'biz_77',
        sensitivity: 'ULTRA_SECRET'
      }
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, 'SOURCE_EVENT_VALIDATION_FAILED');
    assert.equal(result.failures.some((item) => item.issue === 'INVALID_SENSITIVITY'), true);
  });
});

test('correlation id is propagated from source event', () => {
  withSqliteIntake(({ intake }) => {
    const result = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.WEBSITE_PRODUCTION,
      sourceEvent: {
        reviewId: 'review_1',
        missionId: 'mission_1',
        updatedAt: '2026-07-12T09:35:00.000Z',
        state: 'AWAITING_CEO_APPROVAL',
        correlationId: 'corr_wp_1',
        businessId: 'biz_1'
      }
    });

    assert.equal(result.accepted, true);
    assert.equal(result.canonicalEvent.correlationId, 'corr_wp_1');
  });
});

test('causation id is propagated from source event', () => {
  withSqliteIntake(({ intake }) => {
    const result = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.EXECUTIVE_GOVERNANCE,
      sourceEvent: {
        governanceEventId: 'gov_evt_1',
        eventType: 'GOVERNANCE_VIOLATION_ATTEMPT',
        timestamp: '2026-07-12T09:36:00.000Z',
        ownerSystem: 'website-builder-mission-manager',
        entityId: 'mission_1',
        causationId: 'cause_123',
        businessId: 'biz_1'
      }
    });

    assert.equal(result.accepted, true);
    assert.equal(result.canonicalEvent.causationId, 'cause_123');
  });
});

test('normalized canonical event remains immutable and source event is not modified', () => {
  withSqliteIntake(({ intake }) => {
    const sourceEvent = {
      auditId: 'id_audit_1',
      timestamp: '2026-07-12T09:37:00.000Z',
      event: 'SESSION_CREATED',
      details: {
        customerId: 'cust_1',
        businessId: 'biz_1'
      }
    };

    const sourceSnapshot = JSON.parse(JSON.stringify(sourceEvent));

    const result = intake.normalizeSourceEvent({
      sourceSystem: NotificationSourceSystems.IDENTITY_PLATFORM,
      sourceEvent
    });

    assert.equal(result.accepted, true);
    assert.equal(Object.isFrozen(result.canonicalEvent), true);
    assert.deepEqual(sourceEvent, sourceSnapshot);
  });
});
