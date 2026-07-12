import { appendEvent, getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';
import {
  NotificationChannels,
  NotificationDeliveryAttemptOutcomes,
  NotificationFailureClasses,
  NotificationProviderHealthStates
} from './notification-domain-contracts.js';
import {
  EmailDispatchErrorCodes,
  deterministicProviderRequestRef,
  sanitizeProviderMetadata,
  validateCanonicalEmailRequest,
  validateReplyTo,
  validateSenderIdentity
} from './notification-email-provider-contracts.js';
import { NotificationEmailProviderFactory } from './notification-email-provider-factory.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function nowMs(nowFn) {
  const value = nowFn?.();
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

function summarizeBody(value, limit = 120) {
  const text = String(value ?? '');
  if (!text) return '';
  return text.slice(0, limit);
}

function mapValidationErrorToCode(errors = []) {
  const joined = errors.join(' | ').toLowerCase();
  if (/recipient/.test(joined) || /canonical email/.test(joined)) return EmailDispatchErrorCodes.INVALID_RECIPIENT;
  if (/sender/.test(joined) || /display name/.test(joined)) return EmailDispatchErrorCodes.INVALID_SENDER;
  if (/replyto/.test(joined)) return EmailDispatchErrorCodes.INVALID_REPLY_TO;
  if (/header injection|control|crlf/.test(joined)) return EmailDispatchErrorCodes.HEADER_INJECTION;
  if (/exceeds maximum/.test(joined)) return EmailDispatchErrorCodes.PAYLOAD_TOO_LARGE;
  if (/customer identity does not match/.test(joined)) return EmailDispatchErrorCodes.CUSTOMER_ISOLATION_VIOLATION;
  return EmailDispatchErrorCodes.INVALID_REQUEST;
}

export class NotificationEmailDispatcherBridge {
  constructor({
    orchestrationCore,
    templateDomain,
    providerFactory = null,
    providerFactoryOptions = {},
    senderIdentity = null,
    replyTo = null,
    storageProvider = null,
    now,
    namespace = 'executive.notification-email-dispatcher'
  } = {}) {
    this.orchestrationCore = orchestrationCore;
    this.templateDomain = templateDomain;
    this.storageProvider = storageProvider ?? orchestrationCore?.storageProvider ?? null;
    this.now = now;
    this.namespace = namespace;

    this.providerFactory = providerFactory ?? new NotificationEmailProviderFactory({
      storageProvider: this.storageProvider,
      now: this.now,
      ...providerFactoryOptions
    });

    this.senderIdentity = senderIdentity ?? {
      email: process.env.ATLAS_EMAIL_SENDER_ADDRESS ?? '',
      displayName: process.env.ATLAS_EMAIL_SENDER_DISPLAY_NAME ?? ''
    };
    this.replyTo = replyTo ?? (process.env.ATLAS_EMAIL_REPLY_TO ?? null);

    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` });
    this.telemetry = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry` });
    this.dispatchDedupe = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.dispatch-dedupe` });
  }

  getHealth() {
    const provider = this.providerFactory.getHealthStatus();
    return {
      scope: 'notification-email-dispatch',
      provider: {
        providerId: provider.providerHealth.providerId ?? 'UNKNOWN',
        providerName: provider.providerHealth.providerName ?? 'UNKNOWN',
        healthState: provider.status ?? NotificationProviderHealthStates.NOT_CONFIGURED,
        warnings: provider.warnings ?? []
      },
      startupReadiness: provider.startupReadiness,
      telemetry: this.getTelemetrySnapshot()
    };
  }

  getTelemetrySnapshot() {
    return Object.fromEntries(this.telemetry.entries());
  }

  listAuditRecords() {
    return Array.from(this.audit.values()).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  async dispatchLeasedEmailJob({ jobId, leaseOwner, dispatchMetadata = {} } = {}) {
    const startMs = nowMs(this.now);
    const providerSelection = this.providerFactory.getSelection();
    if (providerSelection.blocked) {
      const reason = providerSelection.startupReadiness?.summary ?? 'Provider blocked.';
      this.recordAudit('email_configuration_invalid', {
        jobId,
        reason,
        providerType: providerSelection.type
      });
      this.incrementTelemetry('email.configuration_failures', 1);
      return {
        accepted: false,
        code: EmailDispatchErrorCodes.PROVIDER_CONFIGURATION_INVALID,
        reason
      };
    }

    const job = this.findJob(jobId);
    if (!job) {
      return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };
    }

    if (String(job.channel).toUpperCase() !== NotificationChannels.EMAIL) {
      return { accepted: false, code: 'CHANNEL_NOT_SUPPORTED', reason: 'Only EMAIL jobs are supported by this dispatcher.' };
    }

    if (String(job.status).toUpperCase() !== 'DISPATCHING') {
      return { accepted: false, code: 'JOB_NOT_DISPATCHING', reason: 'Job must be DISPATCHING for email dispatch.' };
    }

    const lease = asObject(job.lease);
    if (String(lease.leaseOwner ?? lease.holderId) !== String(leaseOwner)) {
      return { accepted: false, code: 'LEASE_OWNER_MISMATCH', reason: 'Lease owner mismatch.' };
    }

    const expirationMs = Date.parse(String(lease.leaseExpiresAt ?? lease.expiresAt ?? ''));
    if (Number.isFinite(expirationMs) && expirationMs <= nowMs(this.now)) {
      return { accepted: false, code: 'LEASE_EXPIRED', reason: 'Lease expired before dispatch.' };
    }

    const composition = this.templateDomain?.getComposition?.(job.compositionId)
      ?? this.templateDomain?.listCompositions?.().find((item) => item.compositionId === job.compositionId)
      ?? null;
    if (!composition) {
      return { accepted: false, code: 'COMPOSITION_NOT_FOUND', reason: 'Composition not found for job.' };
    }

    const renderedContent = this.templateDomain?.getRenderedContent?.(job.renderedContentRef)
      ?? this.templateDomain?.renderedContent?.get?.(job.renderedContentRef)
      ?? null;
    if (!renderedContent) {
      return { accepted: false, code: 'RENDERED_CONTENT_NOT_FOUND', reason: 'Rendered content not found.' };
    }

    const consistency = this.validateConsistency({ job, composition, renderedContent });
    if (!consistency.accepted) {
      return consistency;
    }

    const senderValidation = validateSenderIdentity(this.senderIdentity);
    const replyValidation = validateReplyTo(this.replyTo);
    if (!senderValidation.accepted || !replyValidation.accepted) {
      const issues = [
        ...senderValidation.errors,
        ...replyValidation.errors
      ];
      this.recordAudit('email_configuration_invalid', {
        jobId,
        issues
      });
      this.incrementTelemetry('email.configuration_failures', 1);
      return {
        accepted: false,
        code: EmailDispatchErrorCodes.INVALID_SENDER,
        reason: issues.join(' | ')
      };
    }

    const duplicateKey = `${job.jobId}:${leaseOwner}:${job.attemptCount}:${job.idempotencyKey}`;
    if (this.dispatchDedupe.get(duplicateKey) === 'COMPLETED') {
      this.recordAudit('email_duplicate_dispatch_suppressed', {
        jobId: job.jobId,
        duplicateKey
      });
      this.incrementTelemetry('email.duplicates.suppressed', 1);
      return {
        accepted: true,
        code: 'DUPLICATE_DISPATCH_SUPPRESSED',
        duplicate: true
      };
    }

    const providerRequestRef = deterministicProviderRequestRef(`${job.jobId}:${job.idempotencyKey}:${job.attemptCount + 1}`);
    const attempt = this.orchestrationCore.startAttempt({
      jobId: job.jobId,
      leaseOwner,
      providerRequestRef
    });

    if (!attempt.accepted) {
      if (attempt.code === 'DUPLICATE_ATTEMPT') {
        this.recordAudit('email_duplicate_dispatch_suppressed', {
          jobId: job.jobId,
          duplicateKey,
          reason: attempt.reason
        });
        this.incrementTelemetry('email.duplicates.suppressed', 1);
      }
      return attempt;
    }

    const canonicalRequest = {
      providerRequestId: attempt.attempt.attemptId,
      idempotencyKey: job.idempotencyKey,
      recipient: {
        email: String(job.recipient?.email ?? '').trim().toLowerCase(),
        customerId: job.customerId ?? job.recipient?.customerId ?? job.recipient?.id ?? null
      },
      replyTo: this.replyTo,
      subject: String(renderedContent?.rendered?.subject ?? '').trim(),
      textBody: String(renderedContent?.rendered?.textBody ?? ''),
      htmlBody: renderedContent?.rendered?.htmlBody ?? null,
      sender: senderValidation.sender,
      correlationId: job.correlationId,
      businessId: job.businessId,
      customerId: job.customerId,
      metadata: {
        ...sanitizeProviderMetadata(dispatchMetadata),
        providerRequestRef,
        compositionId: composition.compositionId,
        contentRef: renderedContent.contentRef,
        intentId: composition.intentId,
        nonTemplateMutable: true
      }
    };

    const requestValidation = validateCanonicalEmailRequest(canonicalRequest);
    if (!requestValidation.accepted) {
      const code = mapValidationErrorToCode(requestValidation.errors);
      this.recordAudit('email_dispatch_failed', {
        jobId: job.jobId,
        attemptId: attempt.attempt.attemptId,
        code,
        failures: requestValidation.errors
      });
      this.incrementTelemetry('email.dispatch.failed', 1);

      const classifiedFailure = code === EmailDispatchErrorCodes.INVALID_RECIPIENT
        ? NotificationFailureClasses.RECIPIENT_INVALID
        : NotificationFailureClasses.CONFIGURATION_FAILURE;

      return this.orchestrationCore.completeAttempt({
        jobId: job.jobId,
        leaseOwner,
        attemptId: attempt.attempt.attemptId,
        resultInput: {
          outcome: NotificationDeliveryAttemptOutcomes.FAILED_TERMINAL,
          providerMessageId: null,
          classifiedFailure,
          retryable: false,
          terminal: true,
          providerMeta: {
            code,
            failures: requestValidation.errors.map((entry) => summarizeBody(entry, 160))
          }
        }
      });
    }

    const adapter = this.providerFactory.getAdapter();
    const providerName = adapter.providerName?.() ?? this.providerFactory.getSelection().type;

    this.recordAudit('email_dispatch_started', {
      jobId: job.jobId,
      attemptId: attempt.attempt.attemptId,
      provider: providerName,
      providerRequestRef,
      recipient: requestValidation.request.recipient.email
    });

    const providerResult = await adapter.sendEmail(requestValidation.request);
    const normalized = adapter.normalizeProviderResult(providerResult);

    const completion = this.orchestrationCore.completeAttempt({
      jobId: job.jobId,
      leaseOwner,
      attemptId: attempt.attempt.attemptId,
      resultInput: {
        outcome: normalized.outcome,
        providerMessageId: normalized.providerMessageId,
        classifiedFailure: normalized.normalizedErrorClass,
        retryable: normalized.retryable,
        terminal: normalized.terminal,
        providerMeta: {
          providerStatusCode: normalized.providerStatusCode,
          providerRequestRef: normalized.providerRequestRef,
          provider: providerName,
          latencyMs: nowMs(this.now) - startMs,
          metadata: sanitizeProviderMetadata(normalized.metadata)
        }
      }
    });

    this.incrementTelemetry(`email.attempts.provider.${String(providerName).toLowerCase()}`, 1);
    this.incrementTelemetry('email.latency.total_ms', nowMs(this.now) - startMs);

    if (!completion.accepted) {
      this.incrementTelemetry('email.dispatch.failed', 1);
      this.recordAudit('email_dispatch_failed', {
        jobId: job.jobId,
        attemptId: attempt.attempt.attemptId,
        code: completion.code,
        reason: completion.reason
      });
      return completion;
    }

    if (normalized.accepted) {
      this.dispatchDedupe.set(duplicateKey, 'COMPLETED');
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.dispatch-dedupe`, key: duplicateKey, value: 'COMPLETED' });
      this.incrementTelemetry('email.dispatch.succeeded', 1);
      this.recordAudit('email_dispatch_succeeded', {
        jobId: job.jobId,
        attemptId: attempt.attempt.attemptId,
        providerMessageId: normalized.providerMessageId,
        providerRequestRef: normalized.providerRequestRef,
        providerStatusCode: normalized.providerStatusCode
      });
    } else {
      this.incrementTelemetry('email.dispatch.failed', 1);

      if (normalized.normalizedErrorClass === NotificationFailureClasses.RECIPIENT_INVALID || normalized.normalizedErrorClass === NotificationFailureClasses.PROVIDER_REJECTED) {
        this.incrementTelemetry('email.recipient_rejections', 1);
        this.recordAudit('email_recipient_rejected', {
          jobId: job.jobId,
          attemptId: attempt.attempt.attemptId,
          providerStatusCode: normalized.providerStatusCode,
          normalizedErrorClass: normalized.normalizedErrorClass
        });
      }

      if (normalized.normalizedErrorClass === NotificationFailureClasses.RATE_LIMITED) {
        this.incrementTelemetry('email.rate_limited', 1);
        this.recordAudit('email_rate_limited', {
          jobId: job.jobId,
          attemptId: attempt.attempt.attemptId,
          providerStatusCode: normalized.providerStatusCode
        });
      }

      if (normalized.normalizedErrorClass === NotificationFailureClasses.PROVIDER_UNAVAILABLE || normalized.normalizedErrorClass === NotificationFailureClasses.TIMEOUT) {
        this.incrementTelemetry('email.provider_outages', 1);
        this.recordAudit('email_provider_unavailable', {
          jobId: job.jobId,
          attemptId: attempt.attempt.attemptId,
          providerStatusCode: normalized.providerStatusCode,
          normalizedErrorClass: normalized.normalizedErrorClass
        });
      }

      this.recordAudit('email_dispatch_failed', {
        jobId: job.jobId,
        attemptId: attempt.attempt.attemptId,
        normalizedErrorClass: normalized.normalizedErrorClass,
        providerStatusCode: normalized.providerStatusCode,
        retryable: normalized.retryable,
        terminal: normalized.terminal
      });
    }

    return {
      accepted: true,
      code: 'OK',
      attempt: completion.attempt,
      result: completion.result,
      job: completion.job,
      providerResult: normalized
    };
  }

  findJob(jobId) {
    const key = String(jobId ?? '').trim();
    if (!key) return null;
    const jobs = this.orchestrationCore.listJobs?.({}) ?? [];
    return jobs.find((job) => String(job.jobId) === key) ?? null;
  }

  validateConsistency({ job, composition, renderedContent }) {
    if (String(composition.intentId) !== String(job.intentId)) {
      return { accepted: false, code: 'JOB_COMPOSITION_MISMATCH', reason: 'Composition intent mismatch.' };
    }

    if (String(composition.channel).toUpperCase() !== NotificationChannels.EMAIL) {
      return { accepted: false, code: 'COMPOSITION_CHANNEL_MISMATCH', reason: 'Composition is not EMAIL.' };
    }

    if (String(renderedContent.channel).toUpperCase() !== NotificationChannels.EMAIL) {
      return { accepted: false, code: 'RENDERED_CONTENT_CHANNEL_MISMATCH', reason: 'Rendered content channel mismatch.' };
    }

    if (String(renderedContent.intentId) !== String(job.intentId)) {
      return { accepted: false, code: 'RENDERED_CONTENT_INTENT_MISMATCH', reason: 'Rendered content intent mismatch.' };
    }

    if (String(renderedContent.contentRef) !== String(job.renderedContentRef)) {
      return { accepted: false, code: 'RENDERED_CONTENT_REF_MISMATCH', reason: 'Rendered content reference mismatch.' };
    }

    if (!hasText(job.businessId)) {
      return { accepted: false, code: 'BUSINESS_ISOLATION_VIOLATION', reason: 'businessId is required on job.' };
    }

    const recipientCustomer = String(job.recipient?.customerId ?? job.recipient?.id ?? '').trim();
    if (hasText(job.customerId) && hasText(recipientCustomer) && String(job.customerId) !== recipientCustomer) {
      return { accepted: false, code: 'CUSTOMER_ISOLATION_VIOLATION', reason: 'Recipient/customer mismatch.' };
    }

    return { accepted: true, code: 'OK' };
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
      auditId: `neml_${event}_${String(nowMs(this.now))}_${Math.random().toString(36).slice(2, 10)}`,
      event,
      at: nowIso(this.now),
      details: sanitizeProviderMetadata(details)
    };

    this.audit.set(entry.auditId, entry);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: entry.auditId, value: entry });
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.audit-events`, key: entry.auditId, value: entry });
  }
}
