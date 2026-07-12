import { createHash } from 'node:crypto';

import { appendEvent, getMetaMap, loadRecordMap, setMetaValue, upsertRecord } from '../storage/provider-backed-state.js';
import {
  NotificationDeliveryAttemptOutcomes,
  NotificationDeliveryJobStates,
  NotificationFailureClasses,
  createDeadLetterRecord
} from './notification-domain-contracts.js';
import { NotificationRetryPolicyEngine } from './notification-reliability-retry-policy.js';

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

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

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function redactAudit(details = {}) {
  const input = asObject(details);
  const output = {};
  Object.entries(input).forEach(([key, value]) => {
    const lower = String(key).toLowerCase();
    if (/(secret|token|credential|password|authorization|cookie|recipient|payload|html|body|signature)/i.test(lower)) {
      output[key] = '[REDACTED]';
      return;
    }
    if (typeof value === 'string' && value.length > 180) {
      output[key] = `${value.slice(0, 180)}...`;
      return;
    }
    output[key] = value;
  });
  return output;
}

function deterministicId(prefix, seed) {
  return `${prefix}_${stableHash(seed).slice(0, 24)}`;
}

function findLatestAttempt(core, jobId) {
  const attempts = core.getAttemptsForJob(jobId);
  if (attempts.length === 0) return null;
  return attempts.slice().sort((a, b) => Number(b.attemptNumber) - Number(a.attemptNumber))[0];
}

function findLatestResult(core, jobId) {
  const results = core.getResultsForJob(jobId);
  if (results.length === 0) return null;
  return results.slice().sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
}

export class NotificationReliabilitySubsystem {
  constructor({
    orchestrationCore,
    storageProvider = null,
    retryPolicy = null,
    now,
    namespace = 'executive.notification-reliability',
    retentionDays = Number.parseInt(String(process.env.ATLAS_NOTIFICATION_DEADLETTER_RETENTION_DAYS ?? '30'), 10)
  } = {}) {
    this.orchestrationCore = orchestrationCore;
    this.storageProvider = storageProvider ?? orchestrationCore?.storageProvider ?? null;
    this.retryPolicy = retryPolicy ?? new NotificationRetryPolicyEngine({ now });
    this.now = now;
    this.namespace = namespace;
    this.retentionDays = Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : 30;

    this.deadLetters = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.dead-letters` });
    this.deadLetterByJob = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.dead-letter-by-job` });
    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` });
    this.telemetry = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry` });
  }

  validateStartup() {
    const issues = [];
    if (!this.orchestrationCore) issues.push('orchestrationCore is required.');

    const coreFns = ['listJobs', 'getAttemptsForJob', 'getResultsForJob', 'transitionJob', 'releaseLease'];
    coreFns.forEach((name) => {
      if (typeof this.orchestrationCore?.[name] !== 'function') {
        issues.push(`orchestrationCore.${name} is required.`);
      }
    });

    const retryReadiness = this.retryPolicy.validateStartup();
    issues.push(...(retryReadiness.issues ?? []));

    return {
      accepted: issues.length === 0,
      issues,
      failStartup: false
    };
  }

  getTelemetrySnapshot() {
    return Object.fromEntries(this.telemetry.entries());
  }

  listAuditRecords() {
    return Array.from(this.audit.values()).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  listDeadLetters({ businessId = null, customerId = null } = {}) {
    return Array.from(this.deadLetters.values())
      .filter((record) => !hasText(businessId) || String(record.businessId) === String(businessId))
      .filter((record) => !hasText(customerId) || String(record.customerId ?? '') === String(customerId))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  evaluateRetryPath({ jobId } = {}) {
    const job = this.findJob(jobId);
    if (!job) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };

    const latestAttempt = findLatestAttempt(this.orchestrationCore, job.jobId);
    const latestResult = findLatestResult(this.orchestrationCore, job.jobId);

    const outcome = String(latestResult?.outcome ?? latestAttempt?.outcome ?? '').toUpperCase();
    if (outcome === NotificationDeliveryAttemptOutcomes.SUCCEEDED) {
      return {
        accepted: true,
        canonicalPath: 'SUCCESS',
        reason: 'already_delivered',
        job
      };
    }

    const decision = this.retryPolicy.evaluateRetryDecision({
      job,
      attemptNumber: Number(job.attemptCount ?? latestAttempt?.attemptNumber ?? 0),
      failureClass: latestResult?.classifiedFailure ?? latestAttempt?.errorClass ?? job.lastErrorClass ?? NotificationFailureClasses.DELIVERY_UNKNOWN
    });

    return {
      accepted: true,
      canonicalPath: decision.canonicalPath,
      reason: decision.reason,
      retryDecision: decision,
      job,
      latestAttempt,
      latestResult
    };
  }

  scheduleRetry({ jobId } = {}) {
    const evaluated = this.evaluateRetryPath({ jobId });
    if (!evaluated.accepted) return evaluated;

    if (evaluated.canonicalPath !== 'RETRY') {
      if (evaluated.canonicalPath === 'TERMINAL') {
        const exhausted = this.markRetryExhausted({ jobId, reason: evaluated.reason });
        return exhausted;
      }
      return {
        accepted: true,
        code: 'NO_RETRY_REQUIRED',
        reason: evaluated.reason,
        job: evaluated.job
      };
    }

    const transition = this.orchestrationCore.transitionJob({
      jobId,
      toState: NotificationDeliveryJobStates.QUEUED,
      reason: 'retry_scheduled',
      patch: {
        availableAt: evaluated.retryDecision.nextAttemptAt,
        retry: {
          decision: evaluated.retryDecision
        }
      }
    });

    if (!transition.accepted) return transition;

    this.incrementTelemetry('reliability.retry.count', 1);
    this.recordAudit('retry_scheduled', {
      jobId,
      nextAttemptAt: evaluated.retryDecision.nextAttemptAt,
      nextDelayMs: evaluated.retryDecision.nextDelayMs,
      failureClass: evaluated.retryDecision.failureClass,
      attemptNumber: evaluated.retryDecision.attemptNumber,
      maximumAttempts: evaluated.retryDecision.maximumAttempts
    });

    this.refreshRollupTelemetry();

    return {
      accepted: true,
      code: 'RETRY_SCHEDULED',
      job: transition.job,
      retryDecision: evaluated.retryDecision
    };
  }

  markRetryExhausted({ jobId, reason = 'retry_exhausted' } = {}) {
    const job = this.findJob(jobId);
    if (!job) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };

    if (String(job.status).toUpperCase() === NotificationDeliveryJobStates.DEAD_LETTERED) {
      const deadLetter = this.createDeadLetterRecord({
        jobId,
        terminalReason: reason,
        replayEligibility: false
      });

      this.incrementTelemetry('reliability.retry.exhaustion.count', 1);
      this.recordAudit('retry_exhausted', {
        jobId,
        reason,
        deadLetterId: deadLetter.deadLetter?.deadLetterId ?? null,
        alreadyDeadLettered: true
      });
      this.refreshRollupTelemetry();

      return {
        accepted: true,
        code: 'RETRY_EXHAUSTED',
        job,
        deadLetter: deadLetter.deadLetter ?? null
      };
    }

    if (String(job.status).toUpperCase() === NotificationDeliveryJobStates.DELIVERY_FAILED_RETRYABLE) {
      const terminal = this.orchestrationCore.transitionJob({
        jobId,
        toState: NotificationDeliveryJobStates.DELIVERY_FAILED_TERMINAL,
        reason: 'retry_exhausted'
      });
      if (!terminal.accepted && terminal.code !== 'ILLEGAL_JOB_TRANSITION') return terminal;
    }

    const dlqTransition = this.orchestrationCore.transitionJob({
      jobId,
      toState: NotificationDeliveryJobStates.DEAD_LETTERED,
      reason: 'retry_exhausted'
    });

    if (!dlqTransition.accepted && dlqTransition.code !== 'TERMINAL_STATE_LOCKED') return dlqTransition;

    const deadLetter = this.createDeadLetterRecord({
      jobId,
      terminalReason: reason,
      replayEligibility: false
    });

    this.incrementTelemetry('reliability.retry.exhaustion.count', 1);
    this.recordAudit('retry_exhausted', {
      jobId,
      reason,
      deadLetterId: deadLetter.deadLetter?.deadLetterId ?? null
    });
    this.refreshRollupTelemetry();

    return {
      accepted: true,
      code: 'RETRY_EXHAUSTED',
      job: this.findJob(jobId),
      deadLetter: deadLetter.deadLetter ?? null
    };
  }

  createDeadLetterRecord({ jobId, terminalReason, replayEligibility = false } = {}) {
    const job = this.findJob(jobId);
    if (!job) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };

    const existingId = this.deadLetterByJob.get(job.jobId) ?? null;
    if (existingId) {
      const existing = this.deadLetters.get(existingId);
      if (existing) {
        return {
          accepted: true,
          code: 'DEAD_LETTER_ALREADY_EXISTS',
          deadLetter: existing,
          duplicate: true
        };
      }
    }

    const attempts = this.orchestrationCore.getAttemptsForJob(job.jobId);
    const results = this.orchestrationCore.getResultsForJob(job.jobId);
    const latestAttempt = findLatestAttempt(this.orchestrationCore, job.jobId);

    const baseRecord = createDeadLetterRecord({
      deadLetterId: deterministicId('ndlq', `${job.jobId}:${job.attemptCount}:${terminalReason}`),
      jobId: job.jobId,
      terminalReason: String(terminalReason ?? 'terminal_failure').trim(),
      finalAttemptAt: latestAttempt?.finishedAt ?? nowIso(this.now),
      replayEligibility: Boolean(replayEligibility),
      correlationId: job.correlationId
    });

    const createdAt = nowIso(this.now);
    const retentionExpiresAt = new Date(nowMs(this.now) + this.retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const deadLetter = Object.freeze({
      ...baseRecord,
      businessId: job.businessId,
      customerId: job.customerId ?? null,
      createdAt,
      retention: {
        policy: 'TIME_BASED',
        retentionDays: this.retentionDays,
        retentionExpiresAt
      },
      replay: {
        eligible: Boolean(replayEligibility),
        reason: replayEligibility ? 'manual_review_required' : 'terminal_not_replayable'
      },
      audit: {
        linkedJobId: job.jobId,
        createdBy: 'notification-reliability-subsystem'
      },
      failureHistory: Object.freeze({
        attempts: attempts.map((attempt) => Object.freeze({
          attemptId: attempt.attemptId,
          attemptNumber: attempt.attemptNumber,
          outcome: attempt.outcome,
          errorClass: attempt.errorClass,
          finishedAt: attempt.finishedAt
        })),
        results: results.map((result) => Object.freeze({
          resultId: result.resultId,
          attemptId: result.attemptId,
          outcome: result.outcome,
          classifiedFailure: result.classifiedFailure,
          recordedAt: result.recordedAt
        }))
      })
    });

    this.deadLetters.set(deadLetter.deadLetterId, deadLetter);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.dead-letters`, key: deadLetter.deadLetterId, value: deadLetter });

    this.deadLetterByJob.set(job.jobId, deadLetter.deadLetterId);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.dead-letter-by-job`, key: job.jobId, value: deadLetter.deadLetterId });

    this.recordAudit('dead_letter_created', {
      deadLetterId: deadLetter.deadLetterId,
      jobId: job.jobId,
      terminalReason: deadLetter.terminalReason,
      replayEligibility: deadLetter.replayEligibility,
      retentionExpiresAt
    });
    this.incrementTelemetry('reliability.dead_letter.created.count', 1);
    this.refreshRollupTelemetry();

    return {
      accepted: true,
      code: 'DEAD_LETTER_CREATED',
      deadLetter
    };
  }

  recoverOnRestart({ staleLeaseThresholdMs = 0 } = {}) {
    const startedAt = nowMs(this.now);
    this.recordAudit('recovery_started', { staleLeaseThresholdMs });

    const jobs = this.orchestrationCore.listJobs({});
    const recovered = {
      staleLeaseRecovered: 0,
      interruptedDispatchRecovered: 0,
      retryScheduled: 0,
      orphanedAttempts: 0
    };

    jobs
      .filter((job) => String(job.status).toUpperCase() === NotificationDeliveryJobStates.DISPATCHING)
      .forEach((job) => {
        const lease = asObject(job.lease);
        const leaseExpiresAtMs = Date.parse(String(lease.leaseExpiresAt ?? lease.expiresAt ?? ''));
        const staleByTime = Number.isFinite(leaseExpiresAtMs) && (leaseExpiresAtMs + Number(staleLeaseThresholdMs)) <= nowMs(this.now);
        if (!staleByTime) return;

        const owner = lease.leaseOwner ?? lease.holderId;
        if (!hasText(owner)) return;

        const released = this.orchestrationCore.releaseLease({ jobId: job.jobId, leaseOwner: owner, requeue: true });
        if (released.accepted) {
          recovered.staleLeaseRecovered += 1;
          recovered.interruptedDispatchRecovered += 1;
          this.incrementTelemetry('reliability.recovery.stale_lease.count', 1);
          this.recordAudit('stale_lease_recovered', {
            jobId: job.jobId,
            previousLeaseOwner: owner,
            previousLeaseExpiresAt: lease.leaseExpiresAt ?? lease.expiresAt ?? null
          });
        }
      });

    jobs
      .filter((job) => String(job.status).toUpperCase() === NotificationDeliveryJobStates.DELIVERY_FAILED_RETRYABLE)
      .forEach((job) => {
        const scheduled = this.scheduleRetry({ jobId: job.jobId });
        if (scheduled.accepted && scheduled.code === 'RETRY_SCHEDULED') recovered.retryScheduled += 1;
        if (scheduled.accepted && scheduled.code === 'RETRY_EXHAUSTED') recovered.retryScheduled += 0;
      });

    const attemptsById = Array.from(this.orchestrationCore.attempts?.values?.() ?? []);
    attemptsById
      .filter((attempt) => String(attempt.completionStatus).toUpperCase() === 'IN_PROGRESS')
      .forEach((attempt) => {
        const job = this.findJob(attempt.jobId);
        if (!job || String(job.status).toUpperCase() !== NotificationDeliveryJobStates.DISPATCHING) {
          recovered.orphanedAttempts += 1;
          this.incrementTelemetry('reliability.recovery.orphaned_attempt.count', 1);
        }
      });

    const latencyMs = nowMs(this.now) - startedAt;
    this.incrementTelemetry('reliability.recovery.restart.count', 1);
    this.incrementTelemetry('reliability.recovery.latency.total_ms', latencyMs);
    this.recordAudit('recovery_completed', {
      ...recovered,
      recoveryLatencyMs: latencyMs
    });
    this.refreshRollupTelemetry();

    return {
      accepted: true,
      code: 'RECOVERY_COMPLETED',
      recovered,
      recoveryLatencyMs: latencyMs
    };
  }

  reconcile({ autoResolve = false } = {}) {
    const findings = [];

    const jobs = this.orchestrationCore.listJobs({});
    const attempts = Array.from(this.orchestrationCore.attempts?.values?.() ?? []);
    const results = Array.from(this.orchestrationCore.results?.values?.() ?? []);

    jobs.forEach((job) => {
      const jobAttempts = attempts.filter((attempt) => String(attempt.jobId) === String(job.jobId));
      const jobResults = results.filter((result) => String(result.jobId) === String(job.jobId));

      const maxAttempt = jobAttempts.reduce((max, attempt) => Math.max(max, Number(attempt.attemptNumber ?? 0)), 0);
      if (Number(job.attemptCount ?? 0) < maxAttempt) {
        findings.push({
          type: 'inconsistent_job_state',
          severity: 'HIGH',
          jobId: job.jobId,
          details: {
            attemptCount: job.attemptCount,
            observedMaxAttempt: maxAttempt
          },
          recommendation: {
            action: 'UPDATE_JOB_ATTEMPT_COUNT',
            deterministicKey: stableHash(`update_attempt_count:${job.jobId}:${maxAttempt}`),
            patch: { attemptCount: maxAttempt }
          }
        });
      }

      if (String(job.status).toUpperCase() === NotificationDeliveryJobStates.DISPATCHING) {
        const lease = asObject(job.lease);
        const leaseExpiresAtMs = Date.parse(String(lease.leaseExpiresAt ?? lease.expiresAt ?? ''));
        if (Number.isFinite(leaseExpiresAtMs) && leaseExpiresAtMs <= nowMs(this.now)) {
          findings.push({
            type: 'stale_dispatch',
            severity: 'MEDIUM',
            jobId: job.jobId,
            details: {
              leaseExpiresAt: lease.leaseExpiresAt ?? lease.expiresAt ?? null,
              leaseOwner: lease.leaseOwner ?? lease.holderId ?? null
            },
            recommendation: {
              action: 'RECOVER_STALE_LEASE',
              deterministicKey: stableHash(`recover_stale_lease:${job.jobId}:${lease.leaseOwner ?? lease.holderId ?? ''}`)
            }
          });
        }
      }

      if (String(job.status).toUpperCase() === NotificationDeliveryJobStates.DEAD_LETTERED) {
        const deadLetterId = this.deadLetterByJob.get(job.jobId) ?? null;
        if (!deadLetterId || !this.deadLetters.get(deadLetterId)) {
          findings.push({
            type: 'dead_letter_inconsistency',
            severity: 'HIGH',
            jobId: job.jobId,
            details: {
              deadLetterId
            },
            recommendation: {
              action: 'CREATE_DEAD_LETTER',
              deterministicKey: stableHash(`create_dead_letter:${job.jobId}`)
            }
          });
        }
      }

      const resultsByAttempt = new Map();
      jobResults.forEach((result) => {
        const key = String(result.attemptId);
        const list = resultsByAttempt.get(key) ?? [];
        list.push(result);
        resultsByAttempt.set(key, list);
      });

      resultsByAttempt.forEach((list, attemptId) => {
        if (list.length > 1) {
          findings.push({
            type: 'duplicate_completion',
            severity: 'MEDIUM',
            jobId: job.jobId,
            details: {
              attemptId,
              duplicateResultIds: list.map((entry) => entry.resultId).sort()
            },
            recommendation: {
              action: 'REVIEW_DUPLICATE_COMPLETION',
              deterministicKey: stableHash(`review_duplicate_completion:${job.jobId}:${attemptId}`)
            }
          });
        }
      });
    });

    attempts.forEach((attempt) => {
      const job = this.findJob(attempt.jobId);
      if (!job) {
        findings.push({
          type: 'orphaned_attempt',
          severity: 'HIGH',
          jobId: attempt.jobId,
          details: {
            attemptId: attempt.attemptId,
            attemptNumber: attempt.attemptNumber
          },
          recommendation: {
            action: 'INVESTIGATE_ORPHANED_ATTEMPT',
            deterministicKey: stableHash(`orphan_attempt:${attempt.attemptId}`)
          }
        });
      }

      const resultLinked = results.some((result) => String(result.attemptId) === String(attempt.attemptId));
      if (String(attempt.completionStatus).toUpperCase() === 'COMPLETED' && !resultLinked) {
        findings.push({
          type: 'missing_attempt_record',
          severity: 'HIGH',
          jobId: attempt.jobId,
          details: {
            attemptId: attempt.attemptId
          },
          recommendation: {
            action: 'INVESTIGATE_MISSING_RESULT',
            deterministicKey: stableHash(`missing_result:${attempt.attemptId}`)
          }
        });
      }
    });

    results.forEach((result) => {
      const job = this.findJob(result.jobId);
      const attempt = this.orchestrationCore.attempts?.get?.(result.attemptId) ?? null;
      if (!job || !attempt) {
        findings.push({
          type: 'orphaned_result',
          severity: 'HIGH',
          jobId: result.jobId,
          details: {
            resultId: result.resultId,
            attemptId: result.attemptId,
            jobFound: Boolean(job),
            attemptFound: Boolean(attempt)
          },
          recommendation: {
            action: 'INVESTIGATE_ORPHANED_RESULT',
            deterministicKey: stableHash(`orphan_result:${result.resultId}`)
          }
        });
      }
    });

    const deterministicFindings = findings.sort((a, b) => {
      const left = `${a.type}:${a.jobId ?? ''}:${a.recommendation?.deterministicKey ?? ''}`;
      const right = `${b.type}:${b.jobId ?? ''}:${b.recommendation?.deterministicKey ?? ''}`;
      return left.localeCompare(right);
    });

    deterministicFindings.forEach((finding) => {
      this.recordAudit('reconciliation_detected', {
        type: finding.type,
        severity: finding.severity,
        jobId: finding.jobId ?? null,
        recommendation: finding.recommendation?.action ?? null
      });
    });

    this.incrementTelemetry('reliability.reconciliation.findings.count', deterministicFindings.length);

    const resolved = autoResolve
      ? this.resolveRecommendations({ findings: deterministicFindings })
      : { accepted: true, code: 'RECONCILIATION_REPORT_ONLY', resolved: [] };

    this.refreshRollupTelemetry();

    return {
      accepted: true,
      code: 'RECONCILIATION_COMPLETED',
      findings: deterministicFindings,
      resolved: resolved.resolved
    };
  }

  resolveRecommendations({ findings = [] } = {}) {
    const resolved = [];

    asArray(findings).forEach((finding) => {
      const action = finding?.recommendation?.action;
      if (action === 'RECOVER_STALE_LEASE') {
        const job = this.findJob(finding.jobId);
        const owner = job?.lease?.leaseOwner ?? job?.lease?.holderId;
        if (job && hasText(owner)) {
          const released = this.orchestrationCore.releaseLease({ jobId: job.jobId, leaseOwner: owner, requeue: true });
          if (released.accepted) {
            resolved.push({ type: finding.type, action, jobId: job.jobId });
          }
        }
      }

      if (action === 'CREATE_DEAD_LETTER') {
        const created = this.createDeadLetterRecord({
          jobId: finding.jobId,
          terminalReason: 'reconciliation_missing_dead_letter',
          replayEligibility: false
        });
        if (created.accepted) {
          resolved.push({ type: finding.type, action, jobId: finding.jobId, deadLetterId: created.deadLetter?.deadLetterId ?? null });
        }
      }

      if (action === 'UPDATE_JOB_ATTEMPT_COUNT') {
        const job = this.findJob(finding.jobId);
        if (job) {
          const next = Object.freeze({
            ...job,
            ...asObject(finding.recommendation.patch),
            version: Number(job.version ?? 1) + 1,
            updatedAt: nowIso(this.now),
            transitionHistory: [
              ...asArray(job.transitionHistory),
              {
                at: nowIso(this.now),
                fromState: job.status,
                toState: job.status,
                reason: 'reconciliation_resolved_attempt_count'
              }
            ]
          });
          const cas = this.orchestrationCore.compareAndSetJob({ current: job, next });
          if (cas.accepted) {
            resolved.push({ type: finding.type, action, jobId: finding.jobId });
          }
        }
      }
    });

    resolved.forEach((entry) => {
      this.recordAudit('reconciliation_resolved', entry);
    });

    return {
      accepted: true,
      code: 'RECONCILIATION_RESOLVED',
      resolved
    };
  }

  findJob(jobId) {
    if (!hasText(jobId)) return null;
    return this.orchestrationCore.listJobs({}).find((job) => String(job.jobId) === String(jobId)) ?? null;
  }

  refreshRollupTelemetry() {
    const jobs = this.orchestrationCore.listJobs({});
    const retriedJobs = jobs.filter((job) => Number(job.attemptCount ?? 0) > 1);
    const retrySucceeded = retriedJobs.filter((job) => String(job.status).toUpperCase() === NotificationDeliveryJobStates.DELIVERED).length;

    const deadLetterBacklog = jobs.filter((job) => String(job.status).toUpperCase() === NotificationDeliveryJobStates.DEAD_LETTERED).length;
    const exhaustionRate = retriedJobs.length === 0
      ? 0
      : Number((deadLetterBacklog / retriedJobs.length).toFixed(6));
    const retrySuccessRate = retriedJobs.length === 0
      ? 0
      : Number((retrySucceeded / retriedJobs.length).toFixed(6));

    this.setTelemetry('reliability.dead_letter.backlog', deadLetterBacklog);
    this.setTelemetry('reliability.retry.success_rate', retrySuccessRate);
    this.setTelemetry('reliability.retry.exhaustion_rate', exhaustionRate);
  }

  setTelemetry(name, value) {
    const key = String(name ?? '').trim();
    if (!key) return;
    this.telemetry.set(key, value);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry`, key, value });
  }

  incrementTelemetry(name, amount = 1) {
    const key = String(name ?? '').trim();
    if (!key) return;
    const next = Number(this.telemetry.get(key) ?? 0) + Number(amount);
    this.telemetry.set(key, next);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry`, key, value: next });
  }

  recordAudit(event, details = {}) {
    const entry = {
      auditId: deterministicId('nrel_audit', `${event}:${nowIso(this.now)}:${stableHash(JSON.stringify(details))}`),
      event,
      at: nowIso(this.now),
      details: redactAudit(details)
    };

    this.audit.set(entry.auditId, entry);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: entry.auditId, value: entry });
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.audit-events`, key: entry.auditId, value: entry });
  }
}
