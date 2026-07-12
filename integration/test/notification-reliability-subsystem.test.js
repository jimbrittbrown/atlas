import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { NotificationDeliveryOrchestrationCore } from '../src/executive/notification-delivery-orchestration-core.js';
import { NotificationReliabilitySubsystem } from '../src/executive/notification-reliability-subsystem.js';
import { NotificationDeliveryJobStates } from '../src/executive/notification-domain-contracts.js';

function withRuntime(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-notification-reliability-'));
  const provider = new SQLiteStorageProvider({ databasePath: join(dir, 'notification-reliability.sqlite') });

  let current = Date.parse('2025-01-01T00:00:00.000Z');
  const now = () => new Date(current).toISOString();

  const core = new NotificationDeliveryOrchestrationCore({ storageProvider: provider, now });
  const reliability = new NotificationReliabilitySubsystem({ orchestrationCore: core, storageProvider: provider, now });

  function tick(ms) {
    current += ms;
    return now();
  }

  try {
    return callback({ provider, core, reliability, now, tick });
  } finally {
    provider.closeSync();
  }
}

function createIntent({ intentId = 'nint_1', businessId = 'biz_1', customerId = 'cust_1' } = {}) {
  return {
    intentId,
    state: 'ELIGIBLE',
    classification: 'OPERATIONAL',
    candidateChannels: ['EMAIL'],
    correlationId: `corr_${intentId}`,
    causationId: `cause_${intentId}`,
    businessId,
    customerId,
    recipientRefs: [{ type: 'CUSTOMER', id: customerId, customerId }]
  };
}

function createComposition({ compositionId, intentId, channel = 'EMAIL' }) {
  return {
    compositionId,
    intentId,
    channel,
    state: 'FROZEN',
    contentRef: `content://${compositionId}`,
    templateVersion: '1.0.0'
  };
}

function createQueuedJob(core, { id = '1' } = {}) {
  const created = core.createJobsFromFrozenComposition({
    intent: createIntent({ intentId: `nint_${id}` }),
    composition: createComposition({ compositionId: `ncmp_${id}`, intentId: `nint_${id}` })
  });
  assert.equal(created.accepted, true);
  const job = created.jobs[0];
  core.enqueueJob({ jobId: job.jobId });
  return job.jobId;
}

function completeAs(core, { jobId, outcome = 'FAILED_RETRYABLE', errorClass = 'TIMEOUT', leaseOwner = 'worker_1' } = {}) {
  const leased = core.acquireLease({ jobId, leaseOwner, leaseDurationMs: 1000 });
  assert.equal(leased.accepted, true);

  const attempt = core.startAttempt({ jobId, leaseOwner, providerRequestRef: `pref_${jobId}_${outcome}` });
  assert.equal(attempt.accepted, true);

  const completed = core.completeAttempt({
    jobId,
    leaseOwner,
    attemptId: attempt.attempt.attemptId,
    resultInput: {
      outcome,
      providerMessageId: `msg_${jobId}_${outcome}`,
      classifiedFailure: errorClass,
      retryable: outcome === 'FAILED_RETRYABLE',
      terminal: outcome !== 'FAILED_RETRYABLE',
      providerMeta: {
        apiToken: 'sensitive-token',
        payload: '{"secret":"value"}'
      }
    }
  });

  assert.equal(completed.accepted, true);
  return completed;
}

test('dead-letter creation preserves immutable history and correlation', () => {
  withRuntime(({ core, reliability }) => {
    const jobId = createQueuedJob(core, { id: 'dead' });
    completeAs(core, { jobId, outcome: 'FAILED_TERMINAL', errorClass: 'RECIPIENT_INVALID' });

    const created = reliability.createDeadLetterRecord({
      jobId,
      terminalReason: 'recipient_invalid',
      replayEligibility: false
    });

    assert.equal(created.accepted, true);
    assert.equal(created.deadLetter.jobId, jobId);
    assert.equal(created.deadLetter.replay.eligible, false);
    assert.equal(Array.isArray(created.deadLetter.failureHistory.attempts), true);
    assert.equal(Array.isArray(created.deadLetter.failureHistory.results), true);
    assert.equal(created.deadLetter.correlationId.startsWith('corr_'), true);
  });
});

test('retry scheduling and exhaustion use canonical path', () => {
  withRuntime(({ core, reliability }) => {
    const jobId = createQueuedJob(core, { id: 'retry' });

    completeAs(core, { jobId, outcome: 'FAILED_RETRYABLE', errorClass: 'TIMEOUT' });
    const scheduled = reliability.scheduleRetry({ jobId });
    assert.equal(scheduled.accepted, true);
    assert.equal(scheduled.code, 'RETRY_SCHEDULED');
    assert.equal(scheduled.job.status, 'QUEUED');

    for (let i = 0; i < 2; i += 1) {
      completeAs(core, { jobId, outcome: 'FAILED_RETRYABLE', errorClass: 'TIMEOUT' });
      const decision = reliability.scheduleRetry({ jobId });
      if (i === 0) {
        assert.equal(decision.code, 'RETRY_SCHEDULED');
      } else {
        assert.equal(decision.code, 'RETRY_EXHAUSTED');
      }
    }

    const finalJob = core.listJobs({}).find((job) => job.jobId === jobId);
    assert.equal(finalJob.status, 'DEAD_LETTERED');
  });
});

test('restart recovery handles stale leases and interrupted dispatches', () => {
  withRuntime(({ core, reliability, tick }) => {
    const jobId = createQueuedJob(core, { id: 'recover' });

    const lease = core.acquireLease({ jobId, leaseOwner: 'worker_recovery', leaseDurationMs: 1000 });
    assert.equal(lease.accepted, true);

    tick(2500);

    const recovered = reliability.recoverOnRestart();
    assert.equal(recovered.accepted, true);
    assert.equal(recovered.recovered.staleLeaseRecovered > 0, true);
    assert.equal(recovered.recovered.interruptedDispatchRecovered > 0, true);

    const job = core.listJobs({}).find((entry) => entry.jobId === jobId);
    assert.equal(job.status, NotificationDeliveryJobStates.QUEUED);
  });
});

test('reconciliation detects duplicate completion and orphaned attempt deterministically', () => {
  withRuntime(({ core, reliability }) => {
    const jobId = createQueuedJob(core, { id: 'recon' });
    const completed = completeAs(core, { jobId, outcome: 'SUCCEEDED', errorClass: null });

    const duplicateResult = {
      ...completed.result,
      resultId: `${completed.result.resultId}_dup`
    };

    core.results.set(duplicateResult.resultId, duplicateResult);

    const orphanAttempt = {
      attemptId: 'nattempt_orphan_1',
      jobId: 'njob_missing_1',
      attemptNumber: 1,
      providerId: 'UNRESOLVED_PROVIDER',
      startedAt: '2025-01-01T00:00:00.000Z',
      finishedAt: null,
      providerRequestRef: 'orphan_ref',
      outcome: 'UNKNOWN',
      errorClass: null,
      correlationId: 'corr_orphan',
      completionStatus: 'IN_PROGRESS'
    };
    core.attempts.set(orphanAttempt.attemptId, orphanAttempt);

    const beforeStatus = core.listJobs({}).find((job) => job.jobId === jobId).status;
    const report = reliability.reconcile({ autoResolve: false });
    const reportAgain = reliability.reconcile({ autoResolve: false });
    const afterStatus = core.listJobs({}).find((job) => job.jobId === jobId).status;

    assert.equal(report.accepted, true);
    assert.equal(report.findings.some((finding) => finding.type === 'duplicate_completion'), true);
    assert.equal(report.findings.some((finding) => finding.type === 'orphaned_attempt'), true);

    const keys = report.findings.map((finding) => finding.recommendation.deterministicKey);
    const keysAgain = reportAgain.findings.map((finding) => finding.recommendation.deterministicKey);
    assert.deepEqual(keys, keysAgain);

    assert.equal(beforeStatus, afterStatus);
  });
});

test('compare-and-set safety rejects stale version updates', () => {
  withRuntime(({ core }) => {
    const jobId = createQueuedJob(core, { id: 'cas' });
    const current = core.listJobs({}).find((job) => job.jobId === jobId);

    const transitioned = core.acquireLease({ jobId, leaseOwner: 'worker_cas' });
    assert.equal(transitioned.accepted, true);

    const staleNext = {
      ...current,
      status: 'CANCELLED',
      version: Number(current.version) + 1,
      updatedAt: '2025-01-01T00:00:01.000Z'
    };

    const cas = core.compareAndSetJob({ current, next: staleNext });
    assert.equal(cas.accepted, false);
    assert.equal(cas.code, 'INVALID_JOB_VERSION');
  });
});

test('telemetry and audit are emitted with redaction', () => {
  withRuntime(({ core, reliability }) => {
    const jobId = createQueuedJob(core, { id: 'audit' });

    completeAs(core, { jobId, outcome: 'FAILED_RETRYABLE', errorClass: 'TIMEOUT' });
    reliability.scheduleRetry({ jobId });
    reliability.reconcile({ autoResolve: false });
    reliability.recordAudit('redaction_probe', {
      apiToken: 'sensitive-token',
      payload: '{"secret":"value"}'
    });

    completeAs(core, { jobId, outcome: 'FAILED_TERMINAL', errorClass: 'RECIPIENT_INVALID' });
    reliability.createDeadLetterRecord({ jobId, terminalReason: 'recipient_invalid', replayEligibility: false });
    reliability.refreshRollupTelemetry();

    const telemetry = reliability.getTelemetrySnapshot();
    assert.equal((telemetry['reliability.retry.count'] ?? 0) > 0, true);
    assert.equal((telemetry['reliability.dead_letter.backlog'] ?? 0) >= 1, true);
    assert.equal((telemetry['reliability.reconciliation.findings.count'] ?? 0) >= 0, true);

    const audit = JSON.stringify(reliability.listAuditRecords());
    assert.equal(audit.includes('sensitive-token'), false);
    assert.equal(audit.includes('"secret":"value"'), false);
    assert.equal(audit.includes('[REDACTED]'), true);
  });
});
