import { appendEvent, getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';
import {
  NotificationChannels,
  NotificationDeliveryAttemptOutcomes,
  NotificationFailureClasses,
  NotificationProviderHealthStates
} from './notification-domain-contracts.js';
import {
  classifyWebhookFailure,
  deterministicWebhookRequestRef,
  sanitizeWebhookMetadata,
  validateCanonicalWebhookRequest,
  WebhookDispatchErrorCodes
} from './notification-webhook-provider-contracts.js';
import { NotificationWebhookProviderFactory } from './notification-webhook-provider-factory.js';
import { NotificationWebhookSigningService } from './notification-webhook-signing-service.js';
import { NotificationWebhookEndpointRegistry } from './notification-webhook-endpoint-registry.js';

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

function summarize(value, limit = 180) {
  const text = String(value ?? '');
  if (!text) return '';
  return text.slice(0, limit);
}

function mapValidationErrors(issues = []) {
  const joined = issues.join(' | ').toLowerCase();
  if (/unsafe/.test(joined)) return WebhookDispatchErrorCodes.UNSAFE_ENDPOINT;
  if (/payload exceeds/.test(joined)) return WebhookDispatchErrorCodes.PAYLOAD_TOO_LARGE;
  if (/header/.test(joined)) return WebhookDispatchErrorCodes.HEADER_INJECTION;
  if (/endpoint/.test(joined)) return WebhookDispatchErrorCodes.INVALID_ENDPOINT;
  return WebhookDispatchErrorCodes.INVALID_REQUEST;
}

function selectWebhookRenderedPayload(renderedContent) {
  const rendered = asObject(renderedContent?.rendered);
  const payload = rendered.jsonPayload;

  if (payload == null) {
    return {
      accepted: false,
      code: 'MISSING_WEBHOOK_PAYLOAD',
      reason: 'Rendered webhook payload is missing jsonPayload.'
    };
  }

  return {
    accepted: true,
    body: payload,
    contentType: 'application/json'
  };
}

export class NotificationWebhookDispatcherBridge {
  constructor({
    orchestrationCore,
    templateDomain,
    providerFactory = null,
    providerFactoryOptions = {},
    endpointRegistry = null,
    endpointRegistryOptions = {},
    signingService = null,
    signingServiceOptions = {},
    storageProvider = null,
    now,
    namespace = 'executive.notification-webhook-dispatcher'
  } = {}) {
    this.orchestrationCore = orchestrationCore;
    this.templateDomain = templateDomain;
    this.storageProvider = storageProvider ?? orchestrationCore?.storageProvider ?? null;
    this.now = now;
    this.namespace = namespace;

    this.providerFactory = providerFactory ?? new NotificationWebhookProviderFactory({
      environment: process.env.NODE_ENV ?? 'development',
      ...providerFactoryOptions
    });

    this.endpointRegistry = endpointRegistry ?? new NotificationWebhookEndpointRegistry(endpointRegistryOptions);
    this.signingService = signingService ?? new NotificationWebhookSigningService(signingServiceOptions);

    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` });
    this.telemetry = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry` });
    this.dispatchDedupe = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.dispatch-dedupe` });
  }

  getHealth() {
    const provider = this.providerFactory.getHealthSnapshot();
    return {
      scope: 'notification-webhook-dispatch',
      provider: {
        providerId: provider.providerId ?? 'UNKNOWN',
        providerName: provider.providerType ?? 'UNKNOWN',
        healthState: provider.healthState ?? NotificationProviderHealthStates.NOT_CONFIGURED,
        warnings: provider.warnings ?? []
      },
      startupReadiness: this.validateStartup(),
      telemetry: this.getTelemetrySnapshot()
    };
  }

  validateStartup() {
    const providerReadiness = this.providerFactory.validateStartup();
    const endpointReadiness = this.endpointRegistry.validateStartup({ production: providerReadiness.providerType === 'https' });
    const signingReadiness = this.signingService.validateConfiguration({ production: providerReadiness.providerType === 'https' });

    const issues = [
      ...(providerReadiness.issues ?? []),
      ...(endpointReadiness.issues ?? []),
      ...(signingReadiness.issues ?? [])
    ];

    return {
      ready: issues.length === 0,
      failStartup: Boolean(providerReadiness.failStartup || endpointReadiness.failStartup || signingReadiness.failStartup),
      summary: issues.length === 0 ? 'ready' : 'blocked',
      issues,
      warnings: [...(providerReadiness.warnings ?? [])],
      providerType: providerReadiness.providerType,
      emergencyDisabled: providerReadiness.emergencyDisabled
    };
  }

  getTelemetrySnapshot() {
    return Object.fromEntries(this.telemetry.entries());
  }

  listAuditRecords() {
    return Array.from(this.audit.values()).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  async dispatchLeasedWebhookJob({ jobId, leaseOwner, endpoint, method = 'POST', headers = {}, dispatchMetadata = {} } = {}) {
    const startMs = nowMs(this.now);
    const readiness = this.validateStartup();
    if (!readiness.ready) {
      this.recordAudit('webhook_configuration_invalid', {
        jobId,
        reason: readiness.summary,
        issues: readiness.issues,
        providerType: readiness.providerType
      });
      this.incrementTelemetry('webhook.configuration_failures', 1);
      return {
        accepted: false,
        code: WebhookDispatchErrorCodes.PROVIDER_CONFIGURATION_INVALID,
        reason: readiness.issues.join(' | ')
      };
    }

    const job = this.findJob(jobId);
    if (!job) return { accepted: false, code: 'UNKNOWN_JOB', reason: 'Job not found.' };
    if (String(job.channel).toUpperCase() !== NotificationChannels.WEBHOOK) {
      return { accepted: false, code: 'CHANNEL_NOT_SUPPORTED', reason: 'Only WEBHOOK jobs are supported by this dispatcher.' };
    }

    if (String(job.status).toUpperCase() !== 'DISPATCHING') {
      return { accepted: false, code: 'JOB_NOT_DISPATCHING', reason: 'Job must be DISPATCHING for webhook dispatch.' };
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
    if (!consistency.accepted) return consistency;

    const endpointAuth = this.endpointRegistry.authorizeEndpoint({
      endpoint,
      businessId: job.businessId,
      customerId: job.customerId
    });
    if (!endpointAuth.accepted) {
      this.recordAudit('webhook_endpoint_rejected', {
        jobId: job.jobId,
        endpoint,
        code: endpointAuth.code,
        reason: endpointAuth.reason
      });
      this.incrementTelemetry('webhook.endpoint.rejected', 1);
      return endpointAuth;
    }

    const payload = selectWebhookRenderedPayload(renderedContent);
    if (!payload.accepted) return payload;

    const duplicateKey = `${job.jobId}:${leaseOwner}:${job.attemptCount}:${job.idempotencyKey}`;
    if (this.dispatchDedupe.get(duplicateKey) === 'COMPLETED') {
      this.recordAudit('webhook_duplicate_dispatch_suppressed', { jobId: job.jobId, duplicateKey });
      this.incrementTelemetry('webhook.duplicates.suppressed', 1);
      return { accepted: true, code: 'DUPLICATE_DISPATCH_SUPPRESSED', duplicate: true };
    }

    const providerRequestRef = deterministicWebhookRequestRef(`${job.jobId}:${job.idempotencyKey}:${job.attemptCount + 1}`);
    const attempt = this.orchestrationCore.startAttempt({
      jobId: job.jobId,
      leaseOwner,
      providerRequestRef
    });

    if (!attempt.accepted) {
      if (attempt.code === 'DUPLICATE_ATTEMPT') {
        this.recordAudit('webhook_duplicate_dispatch_suppressed', {
          jobId: job.jobId,
          duplicateKey,
          reason: attempt.reason
        });
        this.incrementTelemetry('webhook.duplicates.suppressed', 1);
      }
      return attempt;
    }

    const signing = this.signingService.createSignature({
      requestId: attempt.attempt.attemptId,
      method,
      endpoint: endpointAuth.endpoint,
      body: payload.body
    });

    if (!signing.accepted) {
      const classification = classifyWebhookFailure({ configuration: true });
      return this.orchestrationCore.completeAttempt({
        jobId: job.jobId,
        leaseOwner,
        attemptId: attempt.attempt.attemptId,
        resultInput: {
          outcome: NotificationDeliveryAttemptOutcomes.FAILED_TERMINAL,
          providerMessageId: null,
          classifiedFailure: classification.normalizedErrorClass,
          retryable: classification.retryable,
          terminal: classification.terminal,
          providerMeta: {
            code: WebhookDispatchErrorCodes.SIGNING_CONFIGURATION_MISSING,
            reason: signing.reason
          }
        }
      });
    }

    const canonicalRequest = {
      providerRequestId: attempt.attempt.attemptId,
      idempotencyKey: job.idempotencyKey,
      endpoint: endpointAuth.endpoint,
      method,
      headers: {
        ...asObject(headers),
        'x-atlas-webhook-signature': signing.metadata.signatureHeader,
        'x-atlas-webhook-key-version': signing.metadata.keyVersion,
        'x-atlas-webhook-request-id': signing.metadata.requestId
      },
      body: payload.body,
      contentType: payload.contentType,
      timeoutMs: 10000,
      correlationId: job.correlationId,
      businessId: job.businessId,
      customerId: job.customerId,
      signature: signing.metadata,
      metadata: {
        ...sanitizeWebhookMetadata(dispatchMetadata),
        providerRequestRef,
        compositionId: composition.compositionId,
        contentRef: renderedContent.contentRef,
        intentId: composition.intentId
      }
    };

    const requestValidation = validateCanonicalWebhookRequest(canonicalRequest);
    if (!requestValidation.accepted) {
      const code = mapValidationErrors(requestValidation.issues);
      this.recordAudit('webhook_dispatch_failed', {
        jobId: job.jobId,
        attemptId: attempt.attempt.attemptId,
        code,
        failures: requestValidation.issues
      });
      this.incrementTelemetry('webhook.dispatch.failed', 1);

      const classed = code === WebhookDispatchErrorCodes.UNSAFE_ENDPOINT
        ? NotificationFailureClasses.CONFIGURATION_FAILURE
        : NotificationFailureClasses.DELIVERY_UNKNOWN;

      return this.orchestrationCore.completeAttempt({
        jobId: job.jobId,
        leaseOwner,
        attemptId: attempt.attempt.attemptId,
        resultInput: {
          outcome: NotificationDeliveryAttemptOutcomes.FAILED_TERMINAL,
          providerMessageId: null,
          classifiedFailure: classed,
          retryable: false,
          terminal: true,
          providerMeta: {
            code,
            failures: requestValidation.issues.map((entry) => summarize(entry, 160))
          }
        }
      });
    }

    const adapter = this.providerFactory.getAdapter();
    const providerName = adapter.providerType ?? this.providerFactory.getCapabilities().providerType;

    this.recordAudit('webhook_dispatch_started', {
      jobId: job.jobId,
      attemptId: attempt.attempt.attemptId,
      provider: providerName,
      providerRequestRef,
      endpoint: endpointAuth.endpoint
    });

    const providerResult = await adapter.sendWebhook(requestValidation.request);

    const completion = this.orchestrationCore.completeAttempt({
      jobId: job.jobId,
      leaseOwner,
      attemptId: attempt.attempt.attemptId,
      resultInput: {
        outcome: providerResult.outcome,
        providerMessageId: providerResult.providerMessageId,
        classifiedFailure: providerResult.normalizedErrorClass,
        retryable: providerResult.retryable,
        terminal: providerResult.terminal,
        providerMeta: {
          providerStatusCode: providerResult.providerStatusCode,
          providerRequestRef: providerResult.providerRequestRef,
          provider: providerName,
          latencyMs: nowMs(this.now) - startMs,
          metadata: sanitizeWebhookMetadata(providerResult.metadata)
        }
      }
    });

    this.incrementTelemetry(`webhook.attempts.provider.${String(providerName).toLowerCase()}`, 1);
    this.incrementTelemetry('webhook.latency.total_ms', nowMs(this.now) - startMs);

    if (!completion.accepted) {
      this.incrementTelemetry('webhook.dispatch.failed', 1);
      this.recordAudit('webhook_dispatch_failed', {
        jobId: job.jobId,
        attemptId: attempt.attempt.attemptId,
        code: completion.code,
        reason: completion.reason
      });
      return completion;
    }

    if (providerResult.accepted) {
      this.dispatchDedupe.set(duplicateKey, 'COMPLETED');
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.dispatch-dedupe`, key: duplicateKey, value: 'COMPLETED' });
      this.incrementTelemetry('webhook.dispatch.succeeded', 1);
      this.recordAudit('webhook_dispatch_succeeded', {
        jobId: job.jobId,
        attemptId: attempt.attempt.attemptId,
        providerMessageId: providerResult.providerMessageId,
        providerRequestRef: providerResult.providerRequestRef,
        providerStatusCode: providerResult.providerStatusCode
      });
    } else {
      this.incrementTelemetry('webhook.dispatch.failed', 1);

      if (providerResult.normalizedErrorClass === NotificationFailureClasses.PROVIDER_REJECTED) {
        this.incrementTelemetry('webhook.receiver_rejections', 1);
        this.recordAudit('webhook_receiver_rejected', {
          jobId: job.jobId,
          attemptId: attempt.attempt.attemptId,
          providerStatusCode: providerResult.providerStatusCode
        });
      }

      if (providerResult.normalizedErrorClass === NotificationFailureClasses.RATE_LIMITED) {
        this.incrementTelemetry('webhook.rate_limited', 1);
      }

      if (providerResult.normalizedErrorClass === NotificationFailureClasses.PROVIDER_UNAVAILABLE || providerResult.normalizedErrorClass === NotificationFailureClasses.TIMEOUT) {
        this.incrementTelemetry('webhook.provider_outages', 1);
      }

      if (providerResult.normalizedErrorClass === NotificationFailureClasses.DELIVERY_UNKNOWN) {
        this.incrementTelemetry('webhook.unknown_outcomes', 1);
      }

      this.recordAudit('webhook_dispatch_failed', {
        jobId: job.jobId,
        attemptId: attempt.attempt.attemptId,
        normalizedErrorClass: providerResult.normalizedErrorClass,
        providerStatusCode: providerResult.providerStatusCode,
        retryable: providerResult.retryable,
        terminal: providerResult.terminal
      });
    }

    return {
      accepted: true,
      code: 'OK',
      attempt: completion.attempt,
      result: completion.result,
      job: completion.job,
      providerResult
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

    if (String(composition.channel).toUpperCase() !== NotificationChannels.WEBHOOK) {
      return { accepted: false, code: 'COMPOSITION_CHANNEL_MISMATCH', reason: 'Composition is not WEBHOOK.' };
    }

    if (String(renderedContent.channel).toUpperCase() !== NotificationChannels.WEBHOOK) {
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
      auditId: `nwh_${event}_${String(nowMs(this.now))}_${Math.random().toString(36).slice(2, 10)}`,
      event,
      at: nowIso(this.now),
      details: sanitizeWebhookMetadata(details)
    };

    this.audit.set(entry.auditId, entry);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: entry.auditId, value: entry });
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.audit-events`, key: entry.auditId, value: entry });
  }
}
