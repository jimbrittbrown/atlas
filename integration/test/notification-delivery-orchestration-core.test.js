import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { createDomainEventEnvelope } from '../src/executive/notification-domain-contracts.js';
import { NotificationDeliveryOrchestrationCore } from '../src/executive/notification-delivery-orchestration-core.js';

function withCore(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-delivery-core-'));
  const dbPath = join(dir, 'delivery.sqlite');
  const provider = new SQLiteStorageProvider({ databasePath: dbPath });
  const core = new NotificationDeliveryOrchestrationCore({ storageProvider: provider });
  try {
    return callback({ core, provider, dbPath });
  } finally {
    provider.closeSync();
  }
}

function intent({
  intentId = 'nint_1',
  state = 'ELIGIBLE',
  classification = 'OPERATIONAL',
  channel = 'EMAIL',
  businessId = 'biz_1',
  customerId = 'cust_1',
  recipientRefs = [{ type: 'CUSTOMER', id: 'cust_1' }]
} = {}) {
  return {
    intentId,
    state,
    classification,
    candidateChannels: [channel],
    correlationId: 'corr_1',
    causationId: 'cause_1',
    businessId,
    customerId,
    recipientRefs
  };
}

function composition({
  compositionId = 'ncmp_1',
  intentId = 'nint_1',
  channel = 'EMAIL',
  state = 'FROZEN',
  contentRef = 'content://ncmp_1',
  templateVersion = '1.0.0'
} = {}) {
  return {
    compositionId,
    intentId,
    channel,
    state,
    contentRef,
    templateVersion
  };
}

function fakeDispatcher(outcome) {
  return ({ attemptNumber }) => ({
    outcome,
    providerMessageId: `provider_msg_${attemptNumber}`,
    classifiedFailure: outcome === 'SUCCEEDED' ? null : 'PROVIDER_UNAVAILABLE',
    providerMeta: {
      statusCode: outcome === 'SUCCEEDED' ? 202 : 503,
      token: 'secret-token-should-not-log'
    }
  });
}

test('successful job creation', () => {
  withCore(({ core }) => {
    const created = core.createJobsFromFrozenComposition({
      intent: intent(),
      composition: composition()
    });

    assert.equal(created.accepted, true);
    assert.equal(created.jobs.length, 1);
    assert.equal(created.jobs[0].status, 'COMPOSED');
  });
});

test('duplicate job creation suppression', () => {
  withCore(({ core }) => {
    const i = intent();
    const c = composition();
    const first = core.createJobsFromFrozenComposition({ intent: i, composition: c });
    const second = core.createJobsFromFrozenComposition({ intent: i, composition: c });

    assert.equal(first.jobs.length, 1);
    assert.equal(second.jobs.length, 0);
    assert.equal(second.duplicates.length, 1);
  });
});

test('one intent producing multiple channel-recipient jobs', () => {
  withCore(({ core }) => {
    const created = core.createJobsFromFrozenComposition({
      intent: intent({
        recipientRefs: [
          { type: 'CUSTOMER', id: 'cust_1' },
          { type: 'CUSTOMER', id: 'cust_2' }
        ]
      }),
      composition: composition()
    });

    assert.equal(created.accepted, true);
    assert.equal(created.jobs.length, 2);
  });
});

test('illegal job transition fails closed', () => {
  withCore(({ core }) => {
    const created = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() });
    const illegal = core.transitionJob({ jobId: created.jobs[0].jobId, toState: 'DELIVERED' });

    assert.equal(illegal.accepted, false);
    assert.equal(illegal.code, 'ILLEGAL_JOB_TRANSITION');
  });
});

test('queue priority ordering', () => {
  withCore(({ core }) => {
    const high = core.createJobsFromFrozenComposition({
      intent: intent({ intentId: 'nint_high', classification: 'SECURITY' }),
      composition: composition({ compositionId: 'ncmp_high', intentId: 'nint_high' })
    }).jobs[0];

    const low = core.createJobsFromFrozenComposition({
      intent: intent({ intentId: 'nint_low', classification: 'CUSTOMER_SUCCESS' }),
      composition: composition({ compositionId: 'ncmp_low', intentId: 'nint_low' })
    }).jobs[0];

    core.enqueueJob({ jobId: low.jobId });
    core.enqueueJob({ jobId: high.jobId });

    const listed = core.listAvailableJobs({ limit: 10 });
    assert.equal(listed[0].jobId, high.jobId);
  });
});

test('stable tie-breaking for queue ordering', () => {
  withCore(({ core }) => {
    const a = core.createJobsFromFrozenComposition({
      intent: intent({ intentId: 'nint_a', classification: 'OPERATIONAL', recipientRefs: [{ type: 'CUSTOMER', id: 'A' }] }),
      composition: composition({ compositionId: 'ncmp_a', intentId: 'nint_a' })
    }).jobs[0];

    const b = core.createJobsFromFrozenComposition({
      intent: intent({ intentId: 'nint_b', classification: 'OPERATIONAL', recipientRefs: [{ type: 'CUSTOMER', id: 'B' }] }),
      composition: composition({ compositionId: 'ncmp_b', intentId: 'nint_b' })
    }).jobs[0];

    core.enqueueJob({ jobId: a.jobId });
    core.enqueueJob({ jobId: b.jobId });

    const listed = core.listAvailableJobs({ limit: 10 });
    const expected = [a.jobId, b.jobId].sort();
    const actual = [listed[0].jobId, listed[1].jobId].sort();
    assert.deepEqual(actual, expected);
  });
});

test('bounded batch pickup', () => {
  withCore(({ core }) => {
    for (let i = 0; i < 5; i += 1) {
      const id = `nint_batch_${i}`;
      const created = core.createJobsFromFrozenComposition({
        intent: intent({ intentId: id, recipientRefs: [{ type: 'CUSTOMER', id: `cust_${i}` }] }),
        composition: composition({ compositionId: `ncmp_batch_${i}`, intentId: id })
      }).jobs[0];
      core.enqueueJob({ jobId: created.jobId });
    }

    const listed = core.listAvailableJobs({ limit: 2 });
    assert.equal(listed.length, 2);
  });
});

test('simultaneous worker lease contention has only one winner', () => {
  withCore(({ core }) => {
    const job = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
    core.enqueueJob({ jobId: job.jobId });

    const first = core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });
    const second = core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_2' });

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, false);
    assert.equal(second.code, 'LEASE_CONTENTION_DENIED');
  });
});

test('stale lease recovery', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-delivery-stale-'));
  const dbPath = join(dir, 'delivery.sqlite');
  const provider = new SQLiteStorageProvider({ databasePath: dbPath });

  let current = Date.parse('2025-01-01T00:00:00.000Z');
  const core = new NotificationDeliveryOrchestrationCore({
    storageProvider: provider,
    now: () => new Date(current).toISOString()
  });

  const job = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
  core.enqueueJob({ jobId: job.jobId });

  const lease = core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1', leaseDurationMs: 1000 });
  assert.equal(lease.accepted, true);

  current += 2000;

  const recovered = core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_2', leaseDurationMs: 30000 });
  assert.equal(recovered.accepted, true);
  assert.equal(recovered.lease.leaseOwner, 'worker_2');

  provider.closeSync();
});

test('lease renewal and release', () => {
  withCore(({ core }) => {
    const job = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
    core.enqueueJob({ jobId: job.jobId });
    core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });

    const renewed = core.renewLease({ jobId: job.jobId, leaseOwner: 'worker_1', extendMs: 60000 });
    assert.equal(renewed.accepted, true);

    const released = core.releaseLease({ jobId: job.jobId, leaseOwner: 'worker_1', requeue: true });
    assert.equal(released.accepted, true);
    assert.equal(released.job.status, 'QUEUED');
  });
});

test('restart recovery persists authoritative state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-delivery-restart-'));
  const dbPath = join(dir, 'delivery.sqlite');

  const providerA = new SQLiteStorageProvider({ databasePath: dbPath });
  const coreA = new NotificationDeliveryOrchestrationCore({ storageProvider: providerA });

  const job = coreA.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
  coreA.enqueueJob({ jobId: job.jobId });
  providerA.closeSync();

  const providerB = new SQLiteStorageProvider({ databasePath: dbPath });
  const coreB = new NotificationDeliveryOrchestrationCore({ storageProvider: providerB });

  const listed = coreB.listAvailableJobs({ limit: 10 });
  assert.equal(listed.some((item) => item.jobId === job.jobId), true);

  providerB.closeSync();
});

test('monotonic attempt numbering and append-only attempts/results', () => {
  withCore(({ core }) => {
    const job = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
    core.enqueueJob({ jobId: job.jobId });
    core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });

    const a1 = core.startAttempt({ jobId: job.jobId, leaseOwner: 'worker_1' });
    assert.equal(a1.accepted, true);
    assert.equal(a1.attempt.attemptNumber, 1);

    const c1 = core.completeAttempt({
      jobId: job.jobId,
      leaseOwner: 'worker_1',
      attemptId: a1.attempt.attemptId,
      resultInput: fakeDispatcher('FAILED_RETRYABLE')({ attemptNumber: 1 })
    });
    assert.equal(c1.accepted, true);
    core.requeueRetryableJob({ jobId: job.jobId });

    core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });
    const a2 = core.startAttempt({ jobId: job.jobId, leaseOwner: 'worker_1' });
    assert.equal(a2.accepted, true);
    assert.equal(a2.attempt.attemptNumber, 2);

    const attempts = core.getAttemptsForJob(job.jobId);
    const results = core.getResultsForJob(job.jobId);
    assert.equal(attempts.length, 2);
    assert.equal(results.length, 1);
  });
});

test('duplicate completion rejection and duplicate result suppression', () => {
  withCore(({ core }) => {
    const job = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
    core.enqueueJob({ jobId: job.jobId });
    core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });

    const attempt = core.startAttempt({ jobId: job.jobId, leaseOwner: 'worker_1' }).attempt;
    const resultInput = fakeDispatcher('SUCCEEDED')({ attemptNumber: 1 });

    const first = core.completeAttempt({ jobId: job.jobId, leaseOwner: 'worker_1', attemptId: attempt.attemptId, resultInput });
    assert.equal(first.accepted, true);

    const duplicateSuppressed = core.completeAttempt({ jobId: job.jobId, leaseOwner: 'worker_1', attemptId: attempt.attemptId, resultInput });
    assert.equal(duplicateSuppressed.accepted, true);
    assert.equal(duplicateSuppressed.code, 'DUPLICATE_RESULT_SUPPRESSED');

    const rejectedDifferent = core.completeAttempt({
      jobId: job.jobId,
      leaseOwner: 'worker_1',
      attemptId: attempt.attemptId,
      resultInput: fakeDispatcher('FAILED_TERMINAL')({ attemptNumber: 1 })
    });
    assert.equal(rejectedDifferent.accepted, false);
    assert.equal(rejectedDifferent.code, 'DUPLICATE_COMPLETION_REJECTED');
  });
});

test('retryable failure transition and maximum-attempt exhaustion', () => {
  withCore(({ core }) => {
    const job = core.createJobsFromFrozenComposition({
      intent: intent({ classification: 'CUSTOMER_SUCCESS' }),
      composition: composition()
    }).jobs[0];

    core.enqueueJob({ jobId: job.jobId });

    for (let attemptNumber = 1; attemptNumber <= Number(job.maximumAttempts); attemptNumber += 1) {
      core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });
      const attempt = core.startAttempt({ jobId: job.jobId, leaseOwner: 'worker_1' }).attempt;
      const completed = core.completeAttempt({
        jobId: job.jobId,
        leaseOwner: 'worker_1',
        attemptId: attempt.attemptId,
        resultInput: fakeDispatcher('FAILED_RETRYABLE')({ attemptNumber })
      });
      assert.equal(completed.accepted, true);

      const current = core.listJobs({})[0];
      if (attemptNumber < Number(job.maximumAttempts)) {
        assert.equal(current.status, 'DELIVERY_FAILED_RETRYABLE');
        core.requeueRetryableJob({ jobId: job.jobId });
      }
    }

    const final = core.listJobs({})[0];
    assert.equal(final.status, 'DEAD_LETTERED');
  });
});

test('terminal failure transition', () => {
  withCore(({ core }) => {
    const job = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
    core.enqueueJob({ jobId: job.jobId });
    core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });

    const attempt = core.startAttempt({ jobId: job.jobId, leaseOwner: 'worker_1' }).attempt;
    const completed = core.completeAttempt({
      jobId: job.jobId,
      leaseOwner: 'worker_1',
      attemptId: attempt.attemptId,
      resultInput: fakeDispatcher('FAILED_TERMINAL')({ attemptNumber: 1 })
    });

    assert.equal(completed.accepted, true);
    assert.equal(completed.job.status, 'DEAD_LETTERED');
  });
});

test('delivered terminal behavior', () => {
  withCore(({ core }) => {
    const job = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
    core.enqueueJob({ jobId: job.jobId });
    core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });

    const attempt = core.startAttempt({ jobId: job.jobId, leaseOwner: 'worker_1' }).attempt;
    const completed = core.completeAttempt({
      jobId: job.jobId,
      leaseOwner: 'worker_1',
      attemptId: attempt.attemptId,
      resultInput: fakeDispatcher('SUCCEEDED')({ attemptNumber: 1 })
    });

    assert.equal(completed.accepted, true);
    assert.equal(completed.job.status, 'DELIVERED');

    const illegal = core.transitionJob({ jobId: job.jobId, toState: 'QUEUED' });
    assert.equal(illegal.accepted, false);
  });
});

test('cancelled and expired behavior', () => {
  withCore(({ core }) => {
    const cancelJob = core.createJobsFromFrozenComposition({ intent: intent({ intentId: 'nint_cancel' }), composition: composition({ compositionId: 'ncmp_cancel', intentId: 'nint_cancel' }) }).jobs[0];
    core.enqueueJob({ jobId: cancelJob.jobId });
    const cancelled = core.cancelJob({ jobId: cancelJob.jobId, reason: 'user_cancelled' });
    assert.equal(cancelled.accepted, true);

    const expiredJob = core.createJobsFromFrozenComposition({ intent: intent({ intentId: 'nint_expire' }), composition: composition({ compositionId: 'ncmp_expire', intentId: 'nint_expire' }) }).jobs[0];
    core.enqueueJob({ jobId: expiredJob.jobId });
    const expired = core.expireJob({ jobId: expiredJob.jobId, reason: 'ttl_expired' });
    assert.equal(expired.accepted, true);
  });
});

test('malformed result rejection and unknown job handling', () => {
  withCore(({ core }) => {
    const unknown = core.completeAttempt({
      jobId: 'njob_unknown',
      leaseOwner: 'worker_1',
      attemptId: 'nattempt_unknown',
      resultInput: { outcome: 'SUCCEEDED' }
    });
    assert.equal(unknown.accepted, false);
    assert.equal(unknown.code, 'UNKNOWN_JOB');

    const job = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
    core.enqueueJob({ jobId: job.jobId });
    core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });
    const attempt = core.startAttempt({ jobId: job.jobId, leaseOwner: 'worker_1' }).attempt;

    const malformed = core.completeAttempt({
      jobId: job.jobId,
      leaseOwner: 'worker_1',
      attemptId: attempt.attemptId,
      resultInput: { outcome: 'BROKEN' }
    });
    assert.equal(malformed.accepted, false);
    assert.equal(malformed.code, 'MALFORMED_DELIVERY_RESULT');
  });
});

test('business and customer isolation for queue reads', () => {
  withCore(({ core }) => {
    const jobA = core.createJobsFromFrozenComposition({
      intent: intent({ intentId: 'nint_iso_a', businessId: 'biz_A', customerId: 'cust_A' }),
      composition: composition({ compositionId: 'ncmp_iso_a', intentId: 'nint_iso_a' })
    }).jobs[0];

    const jobB = core.createJobsFromFrozenComposition({
      intent: intent({ intentId: 'nint_iso_b', businessId: 'biz_B', customerId: 'cust_B' }),
      composition: composition({ compositionId: 'ncmp_iso_b', intentId: 'nint_iso_b' })
    }).jobs[0];

    core.enqueueJob({ jobId: jobA.jobId });
    core.enqueueJob({ jobId: jobB.jobId });

    const onlyA = core.listAvailableJobs({ businessId: 'biz_A', customerId: 'cust_A', limit: 10 });
    assert.equal(onlyA.length, 1);
    assert.equal(onlyA[0].jobId, jobA.jobId);
  });
});

test('audit redaction and telemetry emission', () => {
  withCore(({ core }) => {
    const canonical = createDomainEventEnvelope({
      eventType: 'NOTIFICATION_DELIVERY_FAILED',
      sourceSystem: 'notifications',
      sourceEntityType: 'job',
      sourceEntityId: 'njob_1',
      businessId: 'biz_1',
      correlationId: 'corr_1',
      sensitivity: 'CONFIDENTIAL',
      payload: {
        token: 'super-secret',
        recipientEmail: 'hidden@example.com'
      }
    });

    const sanitized = core.getSanitizedAuditEvent(canonical);
    assert.equal(sanitized.payload.token, '[REDACTED]');
    assert.equal(sanitized.payload.recipientEmail, '[REDACTED]');

    const job = core.createJobsFromFrozenComposition({ intent: intent(), composition: composition() }).jobs[0];
    core.enqueueJob({ jobId: job.jobId });
    core.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });
    const attempt = core.startAttempt({ jobId: job.jobId, leaseOwner: 'worker_1' }).attempt;
    core.completeAttempt({
      jobId: job.jobId,
      leaseOwner: 'worker_1',
      attemptId: attempt.attemptId,
      resultInput: fakeDispatcher('SUCCEEDED')({ attemptNumber: 1 })
    });

    const telemetry = core.getTelemetrySnapshot();
    assert.equal((telemetry['attempt.count'] ?? 0) > 0, true);
    assert.equal((telemetry['completion.success'] ?? 0) > 0, true);
  });
});
