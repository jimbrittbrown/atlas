import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { NotificationIntentPolicyEngine } from '../src/executive/notification-intent-policy-engine.js';
import { NotificationGovernanceSafetyIntegration } from '../src/executive/notification-governance-safety-integration.js';
import { NotificationDeliveryOrchestrationCore } from '../src/executive/notification-delivery-orchestration-core.js';
import { NotificationReliabilitySubsystem } from '../src/executive/notification-reliability-subsystem.js';
import { createDomainEventEnvelope } from '../src/executive/notification-domain-contracts.js';

function canonicalEvent({ sourceEventId = 'src_conc_1' } = {}) {
  return createDomainEventEnvelope({
    eventId: `evt_${sourceEventId}`,
    eventType: 'MISSION_APPROVAL_REQUIRED',
    occurredAt: '2026-07-12T16:00:00.000Z',
    recordedAt: '2026-07-12T16:00:00.100Z',
    sourceSystem: 'TEST_SOURCE',
    sourceEntityType: 'test-entity',
    sourceEntityId: `entity_${sourceEventId}`,
    businessId: 'biz_conc',
    customerId: 'cust_conc',
    missionId: 'mission_conc',
    correlationId: 'corr_conc',
    causationId: 'cause_conc',
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

function createSharedDb(name = 'atlas-notification-concurrency') {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  return join(dir, 'concurrency.sqlite');
}

function createFailedRetryableJob(core, { jobId = 'job_retry_1', businessId = 'biz_conc', customerId = 'cust_conc' } = {}) {
  const record = Object.freeze({
    jobId,
    intentId: `intent_${jobId}`,
    channel: 'EMAIL',
    providerId: 'EMAIL_LOCAL',
    recipient: { id: customerId, customerId },
    templateVersion: '1.0.0',
    renderedContentRef: `content_${jobId}`,
    idempotencyKey: `idem_${jobId}`,
    priority: 80,
    availableAt: '2026-07-12T16:00:00.000Z',
    attemptCount: 1,
    maximumAttempts: 3,
    status: 'DELIVERY_FAILED_RETRYABLE',
    version: 1,
    lease: {
      leaseId: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseVersion: 0
    },
    correlationId: `corr_${jobId}`,
    causationId: `cause_${jobId}`,
    compositionId: `cmp_${jobId}`,
    classification: 'TRANSACTIONAL',
    notificationType: 'PAYMENT_SUCCEEDED_RECEIPT',
    businessId,
    customerId,
    createdAt: '2026-07-12T16:00:00.000Z',
    updatedAt: '2026-07-12T16:00:00.000Z',
    transitionHistory: []
  });

  core.jobs.set(record.jobId, record);
  core.storageProvider.upsertRecordSync(`${core.namespace}.jobs`, record.jobId, record);
  return record;
}

test('simultaneous intent creation has deterministic winner/loser and no duplicates', async () => {
  const dbPath = createSharedDb('atlas-intent-race');
  const providerA = new SQLiteStorageProvider({ databasePath: dbPath });
  const providerB = new SQLiteStorageProvider({ databasePath: dbPath });

  const engineA = new NotificationIntentPolicyEngine({ storageProvider: providerA });
  const engineB = new NotificationIntentPolicyEngine({ storageProvider: providerB });

  const event = canonicalEvent({ sourceEventId: 'src_intent_race' });

  const [left, right] = await Promise.all([
    Promise.resolve(engineA.createIntentsFromCanonicalEvent(event)),
    Promise.resolve(engineB.createIntentsFromCanonicalEvent(event))
  ]);

  const createdCount = (left.created?.length ?? 0) + (right.created?.length ?? 0);
  const duplicateCount = (left.duplicates?.length ?? 0) + (right.duplicates?.length ?? 0);

  assert.equal(createdCount, 1);
  assert.equal(duplicateCount >= 1, true);

  const persisted = providerA.listRecordsSync('executive.notification-intent-policy.intents');
  assert.equal(persisted.length, 1);

  providerA.closeSync();
  providerB.closeSync();
});

test('duplicate suppression race has deterministic suppression and no duplicate customer communication', async () => {
  const dbPath = createSharedDb('atlas-dup-race');
  const providerA = new SQLiteStorageProvider({ databasePath: dbPath });
  const providerB = new SQLiteStorageProvider({ databasePath: dbPath });

  const now = () => '2026-07-12T16:00:00.000Z';
  const govA = new NotificationGovernanceSafetyIntegration({ storageProvider: providerA, now });
  const govB = new NotificationGovernanceSafetyIntegration({ storageProvider: providerB, now });

  const intent = {
    intentId: 'nint_dup_race_1',
    sourceEventId: 'src_dup_race_1',
    notificationType: 'WEBSITE_PUBLISHED',
    classification: 'CUSTOMER_SUCCESS',
    urgency: 'NORMAL',
    candidateChannels: ['EMAIL'],
    recipientRefs: [{ type: 'CUSTOMER', id: 'cust_conc', customerId: 'cust_conc' }],
    businessId: 'biz_conc',
    customerId: 'cust_conc'
  };

  const [left, right] = await Promise.all([
    Promise.resolve(govA.getBusinessRulesSnapshot(intent)),
    Promise.resolve(govB.getBusinessRulesSnapshot(intent))
  ]);

  const suppressedCount = [left, right].filter((entry) => entry.duplicateDetected === true).length;
  const allowedCount = [left, right].filter((entry) => entry.duplicateDetected === false).length;

  assert.equal(suppressedCount, 1);
  assert.equal(allowedCount, 1);

  providerA.closeSync();
  providerB.closeSync();
});

test('retry scheduling contention has one authoritative winner and no duplicate terminal outcomes', async () => {
  const dbPath = createSharedDb('atlas-retry-race');
  const providerA = new SQLiteStorageProvider({ databasePath: dbPath });
  const providerB = new SQLiteStorageProvider({ databasePath: dbPath });

  const now = () => '2026-07-12T16:00:00.000Z';

  const coreA = new NotificationDeliveryOrchestrationCore({ storageProvider: providerA, now });
  const coreB = new NotificationDeliveryOrchestrationCore({ storageProvider: providerB, now });
  createFailedRetryableJob(coreA, { jobId: 'job_retry_race_1' });

  const relA = new NotificationReliabilitySubsystem({ orchestrationCore: coreA, storageProvider: providerA, now });
  const relB = new NotificationReliabilitySubsystem({ orchestrationCore: coreB, storageProvider: providerB, now });

  const [left, right] = await Promise.all([
    Promise.resolve(relA.scheduleRetry({ jobId: 'job_retry_race_1' })),
    Promise.resolve(relB.scheduleRetry({ jobId: 'job_retry_race_1' }))
  ]);

  const scheduledCount = [left, right].filter((entry) => entry.code === 'RETRY_SCHEDULED').length;
  const loserCount = [left, right].filter((entry) => entry.code !== 'RETRY_SCHEDULED').length;

  assert.equal(scheduledCount, 1);
  assert.equal(loserCount, 1);

  const jobs = providerA.listRecordsSync('executive.notification-delivery-core.jobs').map((entry) => entry.value);
  const terminal = jobs.filter((job) => String(job.status).toUpperCase() === 'DEAD_LETTERED' || String(job.status).toUpperCase() === 'DELIVERY_FAILED_TERMINAL');
  assert.equal(terminal.length <= 1, true);

  providerA.closeSync();
  providerB.closeSync();
});

test('dead-letter creation contention has one record and deterministic duplicate loser', async () => {
  const dbPath = createSharedDb('atlas-deadletter-race');
  const providerA = new SQLiteStorageProvider({ databasePath: dbPath });
  const providerB = new SQLiteStorageProvider({ databasePath: dbPath });

  const now = () => '2026-07-12T16:00:00.000Z';

  const coreA = new NotificationDeliveryOrchestrationCore({ storageProvider: providerA, now });
  const coreB = new NotificationDeliveryOrchestrationCore({ storageProvider: providerB, now });
  createFailedRetryableJob(coreB, { jobId: 'job_dead_race_1' });

  const record = Object.freeze({
    ...createFailedRetryableJob(coreA, { jobId: 'job_dead_race_1' }),
    status: 'DEAD_LETTERED',
    version: 2
  });
  coreA.jobs.set(record.jobId, record);
  coreB.jobs.set(record.jobId, record);
  providerA.upsertRecordSync(`${coreA.namespace}.jobs`, record.jobId, record);

  const relA = new NotificationReliabilitySubsystem({ orchestrationCore: coreA, storageProvider: providerA, now });
  const relB = new NotificationReliabilitySubsystem({ orchestrationCore: coreB, storageProvider: providerB, now });

  const [left, right] = await Promise.all([
    Promise.resolve(relA.createDeadLetterRecord({ jobId: 'job_dead_race_1', terminalReason: 'terminal_failure', replayEligibility: false })),
    Promise.resolve(relB.createDeadLetterRecord({ jobId: 'job_dead_race_1', terminalReason: 'terminal_failure', replayEligibility: false }))
  ]);

  const createdCount = [left, right].filter((entry) => entry.code === 'DEAD_LETTER_CREATED').length;
  const duplicateCount = [left, right].filter((entry) => entry.code === 'DEAD_LETTER_ALREADY_EXISTS').length;

  assert.equal(createdCount, 1);
  assert.equal(duplicateCount, 1);

  const deadLetters = providerA.listRecordsSync('executive.notification-reliability.dead-letters');
  assert.equal(deadLetters.length, 1);

  providerA.closeSync();
  providerB.closeSync();
});
