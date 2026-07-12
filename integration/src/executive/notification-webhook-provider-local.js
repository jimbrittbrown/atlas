import {
  buildCanonicalWebhookResult,
  buildWebhookProviderContract,
  classifyWebhookFailure,
  deterministicWebhookMessageId,
  deterministicWebhookRequestRef,
  sanitizeWebhookMetadata,
  validateCanonicalWebhookRequest,
  WebhookProviderIds,
  WebhookProviderSimulationModes,
  WebhookProviderTypes
} from './notification-webhook-provider-contracts.js';
import { NotificationProviderHealthStates } from './notification-domain-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function simulationMode(request) {
  const value = request?.metadata?.simulationMode;
  const mode = String(value ?? WebhookProviderSimulationModes.SUCCESS).trim().toLowerCase();
  if (Object.values(WebhookProviderSimulationModes).includes(mode)) return mode;
  return WebhookProviderSimulationModes.SUCCESS;
}

export class LocalDevelopmentWebhookProviderAdapter {
  constructor({ now } = {}) {
    this.now = now;
    this.providerId = WebhookProviderIds.LOCAL;
    this.providerType = WebhookProviderTypes.LOCAL;
    this.outboundDeliveries = new Map();
  }

  getContract() {
    return buildWebhookProviderContract({
      providerId: this.providerId,
      name: 'Atlas Local Webhook Adapter',
      healthState: NotificationProviderHealthStates.HEALTHY,
      maximumPayloadBytes: 262144
    });
  }

  validateConfiguration() {
    return { accepted: true, issues: [] };
  }

  getHealthSnapshot() {
    return {
      providerId: this.providerId,
      providerType: this.providerType,
      healthState: NotificationProviderHealthStates.HEALTHY,
      checkedAt: nowIso(this.now),
      warnings: []
    };
  }

  sendWebhook(request) {
    const validation = validateCanonicalWebhookRequest(request, {
      requireHttps: false,
      allowUnsafeTargets: true
    });
    if (!validation.accepted) {
      return buildCanonicalWebhookResult({
        accepted: false,
        outcome: 'FAILED_TERMINAL',
        normalizedErrorClass: 'CONFIGURATION_FAILURE',
        retryable: false,
        terminal: true,
        metadata: {
          reason: 'Invalid canonical webhook request.',
          issues: validation.issues
        }
      }, { now: this.now });
    }

    const canonical = validation.request;
    const mode = simulationMode(canonical);
    const requestSeed = `${canonical.providerRequestId}:${canonical.idempotencyKey}:${canonical.endpoint}`;
    const providerRequestRef = deterministicWebhookRequestRef(requestSeed);
    const providerMessageId = deterministicWebhookMessageId(requestSeed);

    const envelope = {
      endpoint: canonical.endpoint,
      method: canonical.method,
      headers: canonical.headers,
      bodyFingerprint: canonical.bodyFingerprint,
      contentType: canonical.contentType,
      payloadBytes: canonical.payloadBytes,
      metadata: sanitizeWebhookMetadata(canonical.metadata),
      signature: canonical.signature
    };

    this.outboundDeliveries.set(providerRequestRef, {
      providerRequestRef,
      providerMessageId,
      mode,
      acceptedAt: nowIso(this.now),
      envelope
    });

    if (mode === WebhookProviderSimulationModes.SUCCESS) {
      return buildCanonicalWebhookResult({
        accepted: true,
        providerMessageId,
        providerRequestRef,
        outcome: 'SUCCEEDED',
        metadata: { mode }
      }, { now: this.now });
    }

    if (mode === WebhookProviderSimulationModes.TIMEOUT) {
      const classification = classifyWebhookFailure({ timeout: true, statusCode: 504 });
      return buildCanonicalWebhookResult({
        accepted: false,
        providerMessageId,
        providerRequestRef,
        providerStatusCode: 504,
        ...classification,
        metadata: { mode }
      }, { now: this.now });
    }

    if (mode === WebhookProviderSimulationModes.RATE_LIMIT) {
      const classification = classifyWebhookFailure({ rateLimited: true, statusCode: 429 });
      return buildCanonicalWebhookResult({
        accepted: false,
        providerMessageId,
        providerRequestRef,
        providerStatusCode: 429,
        ...classification,
        metadata: { mode }
      }, { now: this.now });
    }

    if (mode === WebhookProviderSimulationModes.RECEIVER_REJECTION) {
      const classification = classifyWebhookFailure({ receiverRejected: true, statusCode: 422 });
      return buildCanonicalWebhookResult({
        accepted: false,
        providerMessageId,
        providerRequestRef,
        providerStatusCode: 422,
        ...classification,
        metadata: { mode }
      }, { now: this.now });
    }

    if (mode === WebhookProviderSimulationModes.PROVIDER_OUTAGE) {
      const classification = classifyWebhookFailure({ statusCode: 503 });
      return buildCanonicalWebhookResult({
        accepted: false,
        providerMessageId,
        providerRequestRef,
        providerStatusCode: 503,
        ...classification,
        metadata: { mode }
      }, { now: this.now });
    }

    const classification = classifyWebhookFailure({ unknown: true });
    return buildCanonicalWebhookResult({
      accepted: false,
      providerMessageId,
      providerRequestRef,
      ...classification,
      metadata: { mode: WebhookProviderSimulationModes.UNKNOWN }
    }, { now: this.now });
  }
}
