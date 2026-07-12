import { createHash } from 'node:crypto';
import {
  appendEvent,
  getMetaMap,
  loadRecordMap,
  setMetaValue,
  upsertRecord
} from '../storage/provider-backed-state.js';
import {
  NotificationChannels,
  NotificationIntentClassifications,
  NotificationIntentStates,
  NotificationDeliveryJobStates,
  NotificationDeliveryAttemptOutcomes,
  NotificationFailureClasses,
  createNotificationDeliveryJob,
  validateNotificationDeliveryJob,
  validateDeliveryJobStateTransition,
  createNotificationDeliveryAttempt,
  validateNotificationDeliveryAttempt,
  createNotificationDeliveryResult,
  validateNotificationDeliveryResult,
  serializeDomainEventForAudit
} from './notification-domain-contracts.js';

const TERMINAL_STATES = new Set([
  NotificationDeliveryJobStates.DELIVERED,
  NotificationDeliveryJobStates.CANCELLED,
  NotificationDeliveryJobStates.EXPIRED,
  NotificationDeliveryJobStates.DEAD_LETTERED
]);

const SUPPORTED_CHANNELS = new Set([
  NotificationChannels.EMAIL,
  NotificationChannels.WEBHOOK,
  NotificationChannels.EXECUTIVE
]);

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function nowMs(nowFn) {
  const value = nowFn?.();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ''));
  if (Number.isFinite(parsed)) return parsed;
  return Date.now();
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

function sanitizeDispatchMeta(meta = {}) {
  const input = asObject(meta);
  const output = {};
  Object.entries(input).forEach(([key, value]) => {
    const lower = String(key).toLowerCase();
    if (/(secret|token|credential|password|authorization|cookie|recipient|payload|html|body)/i.test(lower)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = value;
    }
  });
  return output;
}

function jobControlByClassification(classification) {
  const normalized = String(classification ?? '').toUpperCase();
  if (normalized === NotificationIntentClassifications.SECURITY) return { priority: 95, maximumAttempts: 5 };
  if (normalized === NotificationIntentClassifications.TRANSACTIONAL) return { priority: 90, maximumAttempts: 4 };
  if (normalized === NotificationIntentClassifications.EXECUTIVE) return { priority: 85, maximumAttempts: 4 };
  if (normalized === NotificationIntentClassifications.LEGAL) return { priority: 90, maximumAttempts: 4 };
  if (normalized === NotificationIntentClassifications.OPERATIONAL) return { priority: 70, maximumAttempts: 3 };
  if (normalized === NotificationIntentClassifications.CUSTOMER_SUCCESS) return { priority: 60, maximumAttempts: 3 };
  return { priority: 50, maximumAttempts: 3 };
}

function recipientKey(recipient = {}) {
  const candidate = recipient.id ?? recipient.customerId ?? recipient.principalId ?? recipient.email ?? recipient.webhookUrl ?? 'UNKNOWN';
  return String(candidate).trim();
}

function deterministicId(prefix, seed) {
  return `${prefix}_${stableHash(seed).slice(0, 24)}`;
}

function isLeaseExpired(lease = {}, now) {
  if (!lease || !lease.leaseExpiresAt) return true;
  return Date.parse(String(lease.leaseExpiresAt)) <= now;
}

function isMalformedResultInput(resultInput = {}) {
  const outcome = String(resultInput.outcome ?? '').toUpperCase();
  return !Object.values(NotificationDeliveryAttemptOutcomes).includes(outcome);
}

export class NotificationDeliveryOrchestrationCore {
  constructor({
    storageProvider,
    now,
    namespace = 'executive.notification-delivery-core'
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.namespace = namespace;

    this.jobs = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.jobs` });
    this.jobByIdempotency = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.job-idempotency` });
    this.attempts = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.attempts` });
    this.results = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.results` });
    this.attemptCompletionIndex = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.attempt-completion-index` });
    this.resultIdempotencyIndex = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.result-idempotency-index` });
    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` });
    this.telemetry = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry` });
  }

  createJobsFromFrozenComposition({ intent, composition, availableAt = null } = {}) {
    if (!intent || typeof intent !== 'object') {
      return { accepted: false, code: 'INVALID_INTENT', reason: 'Intent is required.', jobs: [] };
    }

    if (!composition || typeof composition !== 'object') {
      return { accepted: false, code: 'INVALID_COMPOSITION', reason: 'Composition is required.', jobs: [] };
    }

    if (String(intent.state).toUpperCase() !== NotificationIntentStates.ELIGIBLE) {
      return { accepted: false, code: 'INTENT_NOT_ELIGIBLE', reason: 'Intent must be ELIGIBLE.', jobs: [] };
    }

    if (String(composition.state).toUpperCase() !== 'FROZEN') {
      return { accepted: false, code: 'COMPOSITION_NOT_FROZEN', reason: 'Composition must be FROZEN.', jobs: [] };
    }

    if (String(intent.intentId) !== String(composition.intentId)) {
      return { accepted: false, code: 'INTENT_COMPOSITION_MISMATCH', reason: 'Intent/composition linkage mismatch.', jobs: [] };
    }

    const channel = String(composition.channel ?? '').toUpperCase();
    if (!SUPPORTED_CHANNELS.has(channel)) {
      return { accepted: false, code: 'UNSUPPORTED_CHANNEL', reason: `Unsupported channel ${channel}.`, jobs: [] };
    }

    const recipients = asArray(intent.recipientRefs);
    if (recipients.length === 0) {
      return { accepted: false, code: 'NO_RECIPIENTS', reason: 'Intent must include recipientRefs.', jobs: [] };
    }

    const controls = jobControlByClassification(intent.classification);
    const jobs = [];
    const duplicates = [];

    recipients.forEach((recipient) => {
      const recipientIdentity = recipientKey(recipient);
      const idempotencyKey = stableHash(JSON.stringify({
        intentId: intent.intentId,
        compositionId: composition.compositionId,
        contentRef: composition.contentRef,
        channel,
        recipientIdentity
      }));

      const existingId = this.jobByIdempotency.get(idempotencyKey) ?? null;
      if (existingId) {
        const existing = this.jobs.get(existingId) ?? null;
        if (existing) {
          duplicates.push(existing);
          this.recordAudit('delivery_duplicate_suppressed', {
            intentId: intent.intentId,
            idempotencyKey,
            jobId: existing.jobId
          });
          this.incrementTelemetry('delivery.duplicates.suppressed', 1);
          return;
        }
      }

      const jobId = deterministicId('njob', `${intent.intentId}:${composition.compositionId}:${channel}:${recipientIdentity}`);
      const job = createNotificationDeliveryJob({
        jobId,
        intentId: intent.intentId,
        channel,
        providerId: 'UNRESOLVED_PROVIDER',
        recipient,
        templateVersion: composition.templateVersion,
        renderedContentRef: composition.contentRef,
        idempotencyKey,
        priority: controls.priority,
        availableAt: String(availableAt ?? isoNow(this.now)),
        attemptCount: 0,
        maximumAttempts: controls.maximumAttempts,
        status: NotificationDeliveryJobStates.COMPOSED,
        version: 1,
        lease: {
          leaseId: null,
          leaseOwner: null,
          leasedAt: null,
          leaseExpiresAt: null,
          jobVersion: 1,
          holderId: null,
          acquiredAt: null,
          expiresAt: null,
          leaseVersion: 0
        },
        correlationId: intent.correlationId,
        businessId: intent.businessId,
        customerId: intent.customerId
      });

      const withMetadata = Object.freeze({
        ...job,
        compositionId: composition.compositionId,
        classification: intent.classification,
        causationId: intent.causationId,
        transitionHistory: [
          {
            at: isoNow(this.now),
            fromState: null,
            toState: NotificationDeliveryJobStates.COMPOSED,
            reason: 'delivery_job_created'
          }
        ],
        createdAt: isoNow(this.now),
        updatedAt: isoNow(this.now)
      });

      this.jobs.set(withMetadata.jobId, withMetadata);
      upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.jobs`, key: withMetadata.jobId, value: withMetadata });
      this.jobByIdempotency.set(idempotencyKey, withMetadata.jobId);
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.job-idempotency`, key: idempotencyKey, value: withMetadata.jobId });

      this.recordAudit('delivery_job_created', {
        jobId: withMetadata.jobId,
        intentId: withMetadata.intentId,
        channel: withMetadata.channel,
        businessId: withMetadata.businessId,
        customerId: withMetadata.customerId,
        idempotencyKey
      });

      this.incrementTelemetry(`jobs.state.${withMetadata.status}`, 1);
      this.incrementTelemetry(`jobs.channel.${withMetadata.channel}`, 1);
      this.incrementTelemetry(`jobs.classification.${withMetadata.classification}`, 1);
      jobs.push(withMetadata);
    });

    return {
      accepted: true,
      code: 'OK',
      jobs,
      duplicates
    };
  }

  transitionJob({ jobId, toState, reason = null, patch = {} } = {}) {
    const current = this.jobs.get(String(jobId ?? '').trim()) ?? null;
    if (!current) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };

    if (TERMINAL_STATES.has(String(current.status).toUpperCase()) && String(toState).toUpperCase() !== current.status) {
      return { accepted: false, code: 'TERMINAL_STATE_LOCKED', reason: 'Terminal job state cannot transition without replay subsystem.' };
    }

    const transition = validateDeliveryJobStateTransition({ fromState: current.status, toState });
    if (!transition.isValid) {
      return { accepted: false, code: 'ILLEGAL_JOB_TRANSITION', reason: transition.reason };
    }

    const next = Object.freeze({
      ...current,
      ...patch,
      status: String(toState).toUpperCase(),
      version: Number(current.version ?? 1) + 1,
      updatedAt: isoNow(this.now),
      transitionHistory: [
        ...asArray(current.transitionHistory),
        {
          at: isoNow(this.now),
          fromState: current.status,
          toState: String(toState).toUpperCase(),
          reason
        }
      ]
    });

    const cas = this.compareAndSetJob({ current, next });
    if (!cas.accepted) return cas;

    this.incrementTelemetry(`jobs.state.${next.status}`, 1);

    return { accepted: true, code: 'OK', job: next };
  }

  enqueueJob({ jobId } = {}) {
    const moved = this.transitionJob({
      jobId,
      toState: NotificationDeliveryJobStates.QUEUED,
      reason: 'delivery_job_queued'
    });

    if (moved.accepted) {
      this.recordAudit('delivery_job_queued', { jobId: moved.job.jobId, priority: moved.job.priority, availableAt: moved.job.availableAt });
    }
    return moved;
  }

  listAvailableJobs({ businessId = null, customerId = null, limit = 20, now = nowMs(this.now) } = {}) {
    const jobs = Array.from(this.jobs.values())
      .filter((job) => String(job.status).toUpperCase() === NotificationDeliveryJobStates.QUEUED)
      .filter((job) => Date.parse(String(job.availableAt)) <= now)
      .filter((job) => !hasText(businessId) || String(job.businessId) === String(businessId))
      .filter((job) => !hasText(customerId) || String(job.customerId ?? '') === String(customerId))
      .sort((a, b) => {
        const byPriority = Number(b.priority) - Number(a.priority);
        if (byPriority !== 0) return byPriority;
        const byTime = Date.parse(String(a.availableAt)) - Date.parse(String(b.availableAt));
        if (byTime !== 0) return byTime;
        return String(a.jobId).localeCompare(String(b.jobId));
      })
      .slice(0, Math.max(1, Number(limit) || 20));

    this.telemetry.set('queue.depth', jobs.length);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry`, key: 'queue.depth', value: jobs.length });

    return jobs;
  }

  acquireLease({ jobId, leaseOwner, leaseDurationMs = 30000 } = {}) {
    const current = this.jobs.get(String(jobId ?? '').trim()) ?? null;
    if (!current) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };

    const now = nowMs(this.now);
    const lease = asObject(current.lease);

    if (String(current.status).toUpperCase() === NotificationDeliveryJobStates.DISPATCHING && !isLeaseExpired(lease, now)) {
      this.recordAudit('delivery_contention_denied', {
        jobId,
        leaseOwner,
        existingOwner: lease.leaseOwner ?? lease.holderId
      });
      this.incrementTelemetry('lease.contention_denials', 1);
      return { accepted: false, code: 'LEASE_CONTENTION_DENIED', reason: 'Job already leased.' };
    }

    if (String(current.status).toUpperCase() !== NotificationDeliveryJobStates.QUEUED && !(String(current.status).toUpperCase() === NotificationDeliveryJobStates.DISPATCHING && isLeaseExpired(lease, now))) {
      return { accepted: false, code: 'JOB_NOT_LEASABLE', reason: `Job state ${current.status} is not leasable.` };
    }

    if (String(current.status).toUpperCase() === NotificationDeliveryJobStates.DISPATCHING && isLeaseExpired(lease, now)) {
      const leaseId = deterministicId('lease', `${jobId}:${leaseOwner}:${isoNow(this.now)}:${current.version}`);
      const leaseExpiresAt = new Date(now + Number(leaseDurationMs)).toISOString();
      const next = Object.freeze({
        ...current,
        version: Number(current.version ?? 1) + 1,
        updatedAt: isoNow(this.now),
        lease: {
          leaseId,
          leaseOwner,
          leasedAt: isoNow(this.now),
          leaseExpiresAt,
          jobVersion: Number(current.version ?? 1),
          holderId: leaseOwner,
          acquiredAt: isoNow(this.now),
          expiresAt: leaseExpiresAt,
          leaseVersion: Number(lease.leaseVersion ?? 0) + 1
        },
        transitionHistory: [
          ...asArray(current.transitionHistory),
          {
            at: isoNow(this.now),
            fromState: NotificationDeliveryJobStates.DISPATCHING,
            toState: NotificationDeliveryJobStates.DISPATCHING,
            reason: 'stale_lease_recovery'
          }
        ]
      });

      const reassigned = this.compareAndSetJob({ current, next });
      if (!reassigned.accepted) return reassigned;

      this.recordAudit('delivery_job_leased', {
        jobId,
        leaseId,
        leaseOwner,
        leaseExpiresAt,
        staleRecovered: true
      });
      this.incrementTelemetry('lease.stale_recoveries', 1);

      return { accepted: true, code: 'OK', job: next, lease: next.lease };
    }

    const leaseId = deterministicId('lease', `${jobId}:${leaseOwner}:${isoNow(this.now)}:${current.version}`);
    const leaseExpiresAt = new Date(now + Number(leaseDurationMs)).toISOString();

    const leased = this.transitionJob({
      jobId,
      toState: NotificationDeliveryJobStates.DISPATCHING,
      reason: 'delivery_job_leased',
      patch: {
        lease: {
          leaseId,
          leaseOwner,
          leasedAt: isoNow(this.now),
          leaseExpiresAt,
          jobVersion: Number(current.version ?? 1),
          holderId: leaseOwner,
          acquiredAt: isoNow(this.now),
          expiresAt: leaseExpiresAt,
          leaseVersion: Number(asObject(current.lease).leaseVersion ?? 0) + 1
        }
      }
    });

    if (!leased.accepted) return leased;

    this.recordAudit('delivery_job_leased', {
      jobId,
      leaseId,
      leaseOwner,
      leaseExpiresAt
    });
    this.incrementTelemetry('leases.active', 1);

    return { accepted: true, code: 'OK', job: leased.job, lease: leased.job.lease };
  }

  renewLease({ jobId, leaseOwner, extendMs = 30000 } = {}) {
    const current = this.jobs.get(String(jobId ?? '').trim()) ?? null;
    if (!current) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };
    if (String(current.status).toUpperCase() !== NotificationDeliveryJobStates.DISPATCHING) {
      return { accepted: false, code: 'LEASE_NOT_ACTIVE', reason: 'Job is not in DISPATCHING state.' };
    }

    const lease = asObject(current.lease);
    if (String(lease.leaseOwner ?? lease.holderId) !== String(leaseOwner)) {
      return { accepted: false, code: 'LEASE_OWNER_MISMATCH', reason: 'Lease owner mismatch.' };
    }

    if (isLeaseExpired(lease, nowMs(this.now))) {
      return { accepted: false, code: 'LEASE_EXPIRED', reason: 'Lease is expired.' };
    }

    const leaseExpiresAt = new Date(nowMs(this.now) + Number(extendMs)).toISOString();
    const next = Object.freeze({
      ...current,
      version: Number(current.version ?? 1) + 1,
      updatedAt: isoNow(this.now),
      lease: {
        ...lease,
        leaseExpiresAt,
        expiresAt: leaseExpiresAt,
        leaseVersion: Number(lease.leaseVersion ?? 0) + 1
      },
      transitionHistory: [
        ...asArray(current.transitionHistory),
        {
          at: isoNow(this.now),
          fromState: NotificationDeliveryJobStates.DISPATCHING,
          toState: NotificationDeliveryJobStates.DISPATCHING,
          reason: 'delivery_lease_renewed'
        }
      ]
    });

    const renewed = this.compareAndSetJob({ current, next });
    if (!renewed.accepted) return renewed;

    this.recordAudit('delivery_lease_renewed', {
      jobId,
      leaseOwner,
      leaseExpiresAt
    });

    return { accepted: true, code: 'OK', job: next };
  }

  releaseLease({ jobId, leaseOwner, requeue = true } = {}) {
    const current = this.jobs.get(String(jobId ?? '').trim()) ?? null;
    if (!current) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };

    if (String(current.status).toUpperCase() !== NotificationDeliveryJobStates.DISPATCHING) {
      return { accepted: false, code: 'LEASE_NOT_ACTIVE', reason: 'Job is not in DISPATCHING state.' };
    }

    const lease = asObject(current.lease);
    if (String(lease.leaseOwner ?? lease.holderId) !== String(leaseOwner)) {
      return { accepted: false, code: 'LEASE_OWNER_MISMATCH', reason: 'Lease owner mismatch.' };
    }

    let released;
    if (requeue) {
      const next = Object.freeze({
        ...current,
        status: NotificationDeliveryJobStates.QUEUED,
        version: Number(current.version ?? 1) + 1,
        updatedAt: isoNow(this.now),
        lease: {
          ...lease,
          leaseOwner: null,
          holderId: null,
          leaseId: null,
          leasedAt: null,
          acquiredAt: null,
          leaseExpiresAt: null,
          expiresAt: null,
          leaseVersion: Number(lease.leaseVersion ?? 0) + 1
        },
        transitionHistory: [
          ...asArray(current.transitionHistory),
          {
            at: isoNow(this.now),
            fromState: NotificationDeliveryJobStates.DISPATCHING,
            toState: NotificationDeliveryJobStates.QUEUED,
            reason: 'delivery_lease_released'
          }
        ]
      });

      const cas = this.compareAndSetJob({ current, next });
      if (!cas.accepted) return cas;
      released = { accepted: true, code: 'OK', job: next };
    } else {
      released = this.transitionJob({
        jobId,
        toState: NotificationDeliveryJobStates.CANCELLED,
        reason: 'delivery_lease_released',
        patch: {
          lease: {
            ...lease,
            leaseOwner: null,
            holderId: null,
            leaseId: null,
            leasedAt: null,
            acquiredAt: null,
            leaseExpiresAt: null,
            expiresAt: null,
            leaseVersion: Number(lease.leaseVersion ?? 0) + 1
          }
        }
      });
      if (!released.accepted) return released;
    }

    this.recordAudit('delivery_lease_released', {
      jobId,
      leaseOwner,
      requeue
    });
    this.incrementTelemetry('leases.active', -1);

    return { accepted: true, code: 'OK', job: released.job };
  }

  startAttempt({ jobId, leaseOwner, providerRequestRef = null } = {}) {
    const job = this.jobs.get(String(jobId ?? '').trim()) ?? null;
    if (!job) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };

    if (String(job.status).toUpperCase() !== NotificationDeliveryJobStates.DISPATCHING) {
      return { accepted: false, code: 'JOB_NOT_DISPATCHING', reason: 'Job must be DISPATCHING to start attempt.' };
    }

    const lease = asObject(job.lease);
    if (String(lease.leaseOwner ?? lease.holderId) !== String(leaseOwner)) {
      return { accepted: false, code: 'LEASE_OWNER_MISMATCH', reason: 'Lease owner mismatch.' };
    }

    if (isLeaseExpired(lease, nowMs(this.now))) {
      return { accepted: false, code: 'LEASE_EXPIRED', reason: 'Lease has expired.' };
    }

    const attemptNumber = Number(job.attemptCount ?? 0) + 1;
    if (attemptNumber > Number(job.maximumAttempts ?? 1)) {
      return { accepted: false, code: 'MAX_ATTEMPTS_EXHAUSTED', reason: 'Maximum attempts already reached.' };
    }

    const attemptId = deterministicId('nattempt', `${jobId}:${attemptNumber}:${providerRequestRef ?? ''}`);
    if (this.attempts.has(attemptId)) {
      return { accepted: false, code: 'DUPLICATE_ATTEMPT', reason: 'Attempt already exists for this dispatch cycle.' };
    }

    const attempt = createNotificationDeliveryAttempt({
      attemptId,
      jobId,
      attemptNumber,
      providerId: String(job.providerId ?? 'UNRESOLVED_PROVIDER'),
      startedAt: isoNow(this.now),
      finishedAt: isoNow(this.now),
      providerRequestRef: String(providerRequestRef ?? deterministicId('req', `${attemptId}:provider`)),
      outcome: NotificationDeliveryAttemptOutcomes.UNKNOWN,
      errorClass: null,
      correlationId: job.correlationId
    });

    const attemptRecord = Object.freeze({
      ...attempt,
      startedAt: isoNow(this.now),
      finishedAt: null,
      outcome: NotificationDeliveryAttemptOutcomes.UNKNOWN,
      completionStatus: 'IN_PROGRESS'
    });

    this.attempts.set(attemptRecord.attemptId, attemptRecord);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.attempts`, key: attemptRecord.attemptId, value: attemptRecord });

    this.recordAudit('delivery_attempt_started', {
      jobId,
      attemptId: attemptRecord.attemptId,
      attemptNumber,
      leaseOwner,
      providerRequestRef: sanitizeDispatchMeta({ providerRequestRef }).providerRequestRef
    });
    this.incrementTelemetry('attempt.count', 1);

    return { accepted: true, code: 'OK', attempt: attemptRecord };
  }

  completeAttempt({ jobId, leaseOwner, attemptId, resultInput = {} } = {}) {
    const job = this.jobs.get(String(jobId ?? '').trim()) ?? null;
    if (!job) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };

    const attempt = this.attempts.get(String(attemptId ?? '').trim()) ?? null;
    if (!attempt) return { accepted: false, code: 'UNKNOWN_ATTEMPT', reason: 'Attempt not found.' };

    const resultIdempotencyKey = stableHash(JSON.stringify({
      jobId,
      attemptId,
      outcome: resultInput.outcome,
      providerMessageId: resultInput.providerMessageId ?? null,
      classifiedFailure: resultInput.classifiedFailure ?? null
    }));

    const existingResultId = this.resultIdempotencyIndex.get(resultIdempotencyKey) ?? null;
    if (existingResultId) {
      const existingResult = this.results.get(existingResultId);
      if (existingResult) {
        this.recordAudit('delivery_duplicate_suppressed', {
          jobId,
          attemptId,
          resultId: existingResult.resultId,
          reason: 'duplicate_provider_result_application'
        });
        this.incrementTelemetry('delivery.duplicates.suppressed', 1);
        return { accepted: true, code: 'DUPLICATE_RESULT_SUPPRESSED', duplicate: true, result: existingResult, job };
      }
    }

    if (attempt.completionStatus === 'COMPLETED') {
      return { accepted: false, code: 'DUPLICATE_COMPLETION_REJECTED', reason: 'Attempt already completed.' };
    }

    if (TERMINAL_STATES.has(String(job.status).toUpperCase())) {
      return { accepted: false, code: 'JOB_TERMINAL', reason: 'Job already terminal.' };
    }

    const lease = asObject(job.lease);
    if (String(lease.leaseOwner ?? lease.holderId) !== String(leaseOwner)) {
      return { accepted: false, code: 'LEASE_OWNER_MISMATCH', reason: 'Lease owner mismatch.' };
    }

    if (isMalformedResultInput(resultInput)) {
      return { accepted: false, code: 'MALFORMED_DELIVERY_RESULT', reason: 'Invalid result outcome.' };
    }

    const normalizedOutcome = String(resultInput.outcome).toUpperCase();
    const failureClass = hasText(resultInput.classifiedFailure) ? String(resultInput.classifiedFailure).toUpperCase() : null;

    const completedAttempt = Object.freeze({
      ...attempt,
      finishedAt: isoNow(this.now),
      outcome: normalizedOutcome,
      errorClass: failureClass,
      completionStatus: 'COMPLETED'
    });

    const attemptValidation = validateNotificationDeliveryAttempt(completedAttempt);
    if (!attemptValidation.isValid) {
      return { accepted: false, code: 'MALFORMED_DELIVERY_RESULT', reason: attemptValidation.issues.join(' | ') };
    }

    this.attempts.set(completedAttempt.attemptId, completedAttempt);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.attempts`, key: completedAttempt.attemptId, value: completedAttempt });

    const result = createNotificationDeliveryResult({
      resultId: deterministicId('nresult', `${attemptId}:${normalizedOutcome}:${resultInput.providerMessageId ?? ''}`),
      jobId,
      attemptId,
      outcome: normalizedOutcome,
      providerMessageId: resultInput.providerMessageId ?? null,
      classifiedFailure: failureClass,
      retryable: resultInput.retryable,
      terminal: resultInput.terminal,
      customerVisible: resultInput.customerVisible,
      executiveVisible: resultInput.executiveVisible,
      recordedAt: isoNow(this.now)
    });

    const resultValidation = validateNotificationDeliveryResult(result);
    if (!resultValidation.isValid) {
      return { accepted: false, code: 'MALFORMED_DELIVERY_RESULT', reason: resultValidation.issues.join(' | ') };
    }

    const immutableResult = Object.freeze({
      ...result,
      idempotencyKey: resultIdempotencyKey
    });

    this.results.set(immutableResult.resultId, immutableResult);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.results`, key: immutableResult.resultId, value: immutableResult });
    this.resultIdempotencyIndex.set(resultIdempotencyKey, immutableResult.resultId);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.result-idempotency-index`, key: resultIdempotencyKey, value: immutableResult.resultId });

    this.attemptCompletionIndex.set(completedAttempt.attemptId, immutableResult.resultId);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.attempt-completion-index`, key: completedAttempt.attemptId, value: immutableResult.resultId });

    const updatePatch = {
      attemptCount: completedAttempt.attemptNumber,
      lastAttemptAt: isoNow(this.now),
      lastErrorClass: failureClass
    };

    let transition;
    if (normalizedOutcome === NotificationDeliveryAttemptOutcomes.SUCCEEDED) {
      transition = this.transitionJob({
        jobId,
        toState: NotificationDeliveryJobStates.DELIVERED,
        reason: 'delivery_job_delivered',
        patch: updatePatch
      });
      if (transition.accepted) {
        this.recordAudit('delivery_job_delivered', { jobId, attemptId: completedAttempt.attemptId, resultId: immutableResult.resultId });
        this.incrementTelemetry('completion.success', 1);
      }
    } else if (normalizedOutcome === NotificationDeliveryAttemptOutcomes.FAILED_RETRYABLE) {
      const exhausted = completedAttempt.attemptNumber >= Number(job.maximumAttempts ?? 1);
      if (exhausted) {
        const terminal = this.transitionJob({
          jobId,
          toState: NotificationDeliveryJobStates.DELIVERY_FAILED_TERMINAL,
          reason: 'maximum_attempts_reached',
          patch: updatePatch
        });

        if (!terminal.accepted) return terminal;

        transition = this.transitionJob({
          jobId,
          toState: NotificationDeliveryJobStates.DEAD_LETTERED,
          reason: 'delivery_job_dead_lettered',
          patch: updatePatch
        });

        if (transition.accepted) {
          this.recordAudit('delivery_job_dead_lettered', {
            jobId,
            attemptId: completedAttempt.attemptId,
            resultId: immutableResult.resultId,
            reason: 'maximum_attempts_reached'
          });
        }
      } else {
        transition = this.transitionJob({
          jobId,
          toState: NotificationDeliveryJobStates.DELIVERY_FAILED_RETRYABLE,
          reason: 'delivery_job_retryable_failed',
          patch: updatePatch
        });

        if (transition.accepted) {
          this.recordAudit('delivery_job_retryable_failed', { jobId, attemptId: completedAttempt.attemptId, resultId: immutableResult.resultId });
        }
      }
      this.incrementTelemetry('completion.failed', 1);
    } else if (normalizedOutcome === NotificationDeliveryAttemptOutcomes.FAILED_TERMINAL) {
      const terminal = this.transitionJob({
        jobId,
        toState: NotificationDeliveryJobStates.DELIVERY_FAILED_TERMINAL,
        reason: 'delivery_job_terminal_failed',
        patch: updatePatch
      });

      if (!terminal.accepted) return terminal;

      transition = this.transitionJob({
        jobId,
        toState: NotificationDeliveryJobStates.DEAD_LETTERED,
        reason: 'delivery_job_dead_lettered',
        patch: updatePatch
      });

      if (transition.accepted) {
        this.recordAudit('delivery_job_terminal_failed', { jobId, attemptId: completedAttempt.attemptId, resultId: immutableResult.resultId });
        this.recordAudit('delivery_job_dead_lettered', { jobId, attemptId: completedAttempt.attemptId, resultId: immutableResult.resultId });
      }
      this.incrementTelemetry('completion.failed', 1);
    } else {
      return { accepted: false, code: 'MALFORMED_DELIVERY_RESULT', reason: 'Unsupported completion outcome.' };
    }

    if (!transition?.accepted) return transition;

    this.recordAudit('delivery_attempt_completed', {
      jobId,
      attemptId: completedAttempt.attemptId,
      resultId: immutableResult.resultId,
      outcome: normalizedOutcome,
      providerMeta: sanitizeDispatchMeta(resultInput.providerMeta ?? {})
    });

    return {
      accepted: true,
      code: 'OK',
      attempt: completedAttempt,
      result: immutableResult,
      job: transition.job
    };
  }

  requeueRetryableJob({ jobId } = {}) {
    const current = this.jobs.get(String(jobId ?? '').trim()) ?? null;
    if (!current) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };

    if (String(current.status).toUpperCase() !== NotificationDeliveryJobStates.DELIVERY_FAILED_RETRYABLE) {
      return { accepted: false, code: 'JOB_NOT_RETRYABLE_FAILED', reason: 'Only retryable-failed jobs can be requeued.' };
    }

    return this.transitionJob({
      jobId,
      toState: NotificationDeliveryJobStates.QUEUED,
      reason: 'retry_requeue'
    });
  }

  cancelJob({ jobId, reason = 'cancelled' } = {}) {
    const cancelled = this.transitionJob({
      jobId,
      toState: NotificationDeliveryJobStates.CANCELLED,
      reason
    });

    if (cancelled.accepted) {
      this.recordAudit('delivery_job_cancelled', { jobId, reason });
    }
    return cancelled;
  }

  expireJob({ jobId, reason = 'expired' } = {}) {
    const expired = this.transitionJob({
      jobId,
      toState: NotificationDeliveryJobStates.EXPIRED,
      reason
    });

    if (expired.accepted) {
      this.recordAudit('delivery_job_expired', { jobId, reason });
    }
    return expired;
  }

  compareAndSetJob({ current, next } = {}) {
    const namespace = `${this.namespace}.jobs`;

    if (this.storageProvider && typeof this.storageProvider.conditionalSetStateRecord === 'function' && typeof this.storageProvider.getStateRecord === 'function') {
      const result = this.storageProvider.conditionalSetStateRecord({
        namespace,
        key: current.jobId,
        expectedVersion: Number(current.version ?? 1),
        value: next
      });

      if (!result?.ok) {
        this.recordAudit('delivery_contention_denied', {
          jobId: current.jobId,
          code: result?.code ?? 'VERSION_MISMATCH',
          reason: result?.reason ?? 'CAS update failed.'
        });
        this.incrementTelemetry('lease.contention_denials', 1);
        if ((result?.code ?? '') === 'VERSION_MISMATCH') {
          return { accepted: false, code: 'INVALID_JOB_VERSION', reason: result.reason ?? 'Version mismatch.' };
        }
        this.incrementTelemetry('persistence.failures', 1);
        return { accepted: false, code: 'PERSISTENCE_FAILURE', reason: result?.reason ?? 'Persistence CAS failure.' };
      }

      this.jobs.set(next.jobId, next);
      upsertRecord({ provider: this.storageProvider, namespace, key: next.jobId, value: next });
      return { accepted: true, code: 'OK', job: next };
    }

    const existing = this.jobs.get(current.jobId);
    if (!existing || Number(existing.version ?? 1) !== Number(current.version ?? 1)) {
      this.incrementTelemetry('lease.contention_denials', 1);
      return { accepted: false, code: 'INVALID_JOB_VERSION', reason: 'In-memory version mismatch.' };
    }

    this.jobs.set(next.jobId, next);
    upsertRecord({ provider: this.storageProvider, namespace, key: next.jobId, value: next });
    return { accepted: true, code: 'OK', job: next };
  }

  listJobs({ businessId = null, customerId = null, state = null } = {}) {
    return Array.from(this.jobs.values())
      .filter((job) => !hasText(businessId) || String(job.businessId) === String(businessId))
      .filter((job) => !hasText(customerId) || String(job.customerId ?? '') === String(customerId))
      .filter((job) => !hasText(state) || String(job.status) === String(state).toUpperCase());
  }

  getAttemptsForJob(jobId) {
    return Array.from(this.attempts.values())
      .filter((attempt) => String(attempt.jobId) === String(jobId))
      .sort((a, b) => Number(a.attemptNumber) - Number(b.attemptNumber));
  }

  getResultsForJob(jobId) {
    return Array.from(this.results.values())
      .filter((result) => String(result.jobId) === String(jobId))
      .sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt)));
  }

  getTelemetrySnapshot() {
    return Object.fromEntries(this.telemetry.entries());
  }

  listAuditRecords() {
    return Array.from(this.audit.values())
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  getSanitizedAuditEvent(event = {}) {
    return serializeDomainEventForAudit(event);
  }

  incrementTelemetry(key, amount = 1) {
    const name = String(key ?? '').trim();
    if (!name) return;
    const next = Number(this.telemetry.get(name) ?? 0) + Number(amount);
    this.telemetry.set(name, next);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry`, key: name, value: next });
  }

  recordAudit(event, details = {}) {
    const entry = {
      auditId: deterministicId('ndel_audit', `${event}:${isoNow(this.now)}:${stableHash(JSON.stringify(details))}`),
      event,
      at: isoNow(this.now),
      details
    };

    this.audit.set(entry.auditId, entry);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: entry.auditId, value: entry });
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.audit-events`, key: entry.auditId, value: entry });
  }
}
