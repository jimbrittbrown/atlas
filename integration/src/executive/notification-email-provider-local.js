import { appendEvent, getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';
import {
  EmailProviderIds,
  EmailProviderSimulationModes,
  buildCanonicalEmailResult,
  buildEmailProviderContract,
  classifyFailureFromStatus,
  deterministicProviderMessageId,
  deterministicProviderRequestRef,
  sanitizeProviderMetadata,
  validateCanonicalEmailRequest
} from './notification-email-provider-contracts.js';
import {
  NotificationFailureClasses,
  NotificationProviderHealthStates
} from './notification-domain-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function simulationModeFromRequest(request) {
  const metadata = asObject(request.metadata);
  const fromMetadata = String(metadata.simulationMode ?? metadata.simulate ?? '').trim().toLowerCase();
  if (Object.values(EmailProviderSimulationModes).includes(fromMetadata)) return fromMetadata;
  return EmailProviderSimulationModes.SUCCESS;
}

function sanitizeEnvelopeForAudit(request = {}) {
  return {
    providerRequestId: request.providerRequestId,
    idempotencyKey: request.idempotencyKey,
    recipient: {
      email: request.recipient?.email ?? null,
      customerId: request.recipient?.customerId ?? request.recipient?.id ?? null
    },
    sender: {
      email: request.sender?.email ?? null,
      displayName: request.sender?.displayName ?? null
    },
    replyTo: request.replyTo ?? null,
    subjectPreview: String(request.subject ?? '').slice(0, 120),
    textPreview: `[REDACTED length=${Buffer.byteLength(String(request.textBody ?? ''), 'utf8')}]`,
    htmlPreview: request.htmlBody == null
      ? null
      : `[REDACTED length=${Buffer.byteLength(String(request.htmlBody ?? ''), 'utf8')}]`,
    correlationId: request.correlationId,
    businessId: request.businessId,
    customerId: request.customerId,
    metadata: sanitizeProviderMetadata(request.metadata)
  };
}

export class LocalDevelopmentEmailProviderAdapter {
  constructor({
    storageProvider,
    now,
    namespace = 'executive.notification-email.local'
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.namespace = namespace;
    this.outboundEnvelopes = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.outbound-envelopes` });
    this.metrics = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.metrics` });
  }

  providerId() {
    return EmailProviderIds.LOCAL;
  }

  providerName() {
    return 'ATLAS_LOCAL_NON_DELIVERING_EMAIL';
  }

  providerType() {
    return 'local';
  }

  validateConfiguration() {
    return {
      accepted: true,
      issues: [],
      mode: 'NON_DELIVERING_LOCAL'
    };
  }

  healthReport() {
    return {
      providerId: this.providerId(),
      providerName: this.providerName(),
      healthState: NotificationProviderHealthStates.DEGRADED,
      nonProduction: true,
      acceptsExternalDelivery: false,
      mode: 'NON_DELIVERING_LOCAL',
      contract: buildEmailProviderContract({
        providerId: this.providerId(),
        name: this.providerName(),
        healthState: NotificationProviderHealthStates.DEGRADED,
        supportsIdempotency: true
      })
    };
  }

  classifyError(errorOrResponse) {
    const input = asObject(errorOrResponse);
    const simulationMode = String(input.simulationMode ?? '').trim().toLowerCase();

    if (simulationMode === EmailProviderSimulationModes.TIMEOUT) {
      return classifyFailureFromStatus({ timeout: true });
    }

    if (simulationMode === EmailProviderSimulationModes.RATE_LIMIT) {
      return classifyFailureFromStatus({ rateLimited: true, statusCode: 429 });
    }

    if (simulationMode === EmailProviderSimulationModes.RECIPIENT_REJECTION) {
      return classifyFailureFromStatus({ recipientRejected: true, statusCode: 422 });
    }

    if (simulationMode === EmailProviderSimulationModes.PROVIDER_OUTAGE) {
      return classifyFailureFromStatus({ statusCode: 503 });
    }

    return classifyFailureFromStatus({ statusCode: Number(input.statusCode ?? input.providerStatusCode ?? 500) });
  }

  normalizeProviderResult(raw = {}) {
    const input = asObject(raw);
    if (input.accepted === true) {
      return buildCanonicalEmailResult({
        accepted: true,
        providerMessageId: input.providerMessageId,
        providerRequestRef: input.providerRequestRef,
        outcome: 'SUCCEEDED',
        normalizedErrorClass: null,
        retryable: false,
        terminal: false,
        providerStatusCode: Number(input.providerStatusCode ?? 202),
        occurredAt: nowIso(this.now),
        metadata: sanitizeProviderMetadata(input.metadata)
      }, { now: this.now });
    }

    const classified = this.classifyError(input);
    return buildCanonicalEmailResult({
      accepted: false,
      providerMessageId: null,
      providerRequestRef: input.providerRequestRef,
      outcome: classified.outcome,
      normalizedErrorClass: classified.normalizedErrorClass,
      retryable: classified.retryable,
      terminal: classified.terminal,
      providerStatusCode: Number(input.providerStatusCode ?? null),
      occurredAt: nowIso(this.now),
      metadata: sanitizeProviderMetadata(input.metadata)
    }, { now: this.now });
  }

  sendEmail(request = {}) {
    const validation = validateCanonicalEmailRequest(request);
    if (!validation.accepted) {
      return this.normalizeProviderResult({
        accepted: false,
        providerRequestRef: deterministicProviderRequestRef(`${request.providerRequestId}:validation`),
        providerStatusCode: 400,
        metadata: {
          simulationMode: 'validation_error',
          failures: validation.errors
        },
        simulationMode: EmailProviderSimulationModes.RECIPIENT_REJECTION
      });
    }

    const canonical = validation.request;
    const simulationMode = simulationModeFromRequest(canonical);
    const outbound = sanitizeEnvelopeForAudit(canonical);

    this.outboundEnvelopes.set(canonical.providerRequestId, {
      recordedAt: nowIso(this.now),
      providerRequestId: canonical.providerRequestId,
      simulationMode,
      envelope: outbound
    });
    setMetaValue({
      provider: this.storageProvider,
      namespace: `${this.namespace}.outbound-envelopes`,
      key: canonical.providerRequestId,
      value: {
        recordedAt: nowIso(this.now),
        providerRequestId: canonical.providerRequestId,
        simulationMode,
        envelope: outbound
      }
    });
    appendEvent({
      provider: this.storageProvider,
      namespace: `${this.namespace}.outbound-events`,
      key: canonical.providerRequestId,
      value: {
        providerRequestId: canonical.providerRequestId,
        simulationMode,
        envelope: outbound,
        occurredAt: nowIso(this.now)
      }
    });

    this.incrementMetric('local.adapter.usage', 1);

    if (simulationMode === EmailProviderSimulationModes.SUCCESS) {
      return this.normalizeProviderResult({
        accepted: true,
        providerMessageId: deterministicProviderMessageId(`${canonical.idempotencyKey}:${canonical.recipient.email}`),
        providerRequestRef: deterministicProviderRequestRef(`${canonical.providerRequestId}:${canonical.idempotencyKey}`),
        providerStatusCode: 202,
        metadata: {
          nonDeliveringMode: true,
          simulationMode
        }
      });
    }

    if (simulationMode === EmailProviderSimulationModes.TIMEOUT) {
      return this.normalizeProviderResult({
        accepted: false,
        providerRequestRef: deterministicProviderRequestRef(`${canonical.providerRequestId}:timeout`),
        providerStatusCode: 504,
        metadata: { nonDeliveringMode: true, simulationMode },
        simulationMode
      });
    }

    if (simulationMode === EmailProviderSimulationModes.RATE_LIMIT) {
      return this.normalizeProviderResult({
        accepted: false,
        providerRequestRef: deterministicProviderRequestRef(`${canonical.providerRequestId}:rate_limit`),
        providerStatusCode: 429,
        metadata: { nonDeliveringMode: true, simulationMode },
        simulationMode
      });
    }

    if (simulationMode === EmailProviderSimulationModes.RECIPIENT_REJECTION) {
      return this.normalizeProviderResult({
        accepted: false,
        providerRequestRef: deterministicProviderRequestRef(`${canonical.providerRequestId}:recipient_rejection`),
        providerStatusCode: 422,
        metadata: {
          nonDeliveringMode: true,
          simulationMode,
          normalizedErrorClass: NotificationFailureClasses.RECIPIENT_INVALID
        },
        simulationMode
      });
    }

    return this.normalizeProviderResult({
      accepted: false,
      providerRequestRef: deterministicProviderRequestRef(`${canonical.providerRequestId}:outage`),
      providerStatusCode: 503,
      metadata: {
        nonDeliveringMode: true,
        simulationMode,
        normalizedErrorClass: NotificationFailureClasses.PROVIDER_UNAVAILABLE
      },
      simulationMode: EmailProviderSimulationModes.PROVIDER_OUTAGE
    });
  }

  incrementMetric(name, amount = 1) {
    const key = String(name ?? '').trim();
    if (!key) return;
    const next = Number(this.metrics.get(key) ?? 0) + Number(amount);
    this.metrics.set(key, next);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.metrics`, key, value: next });
  }
}
