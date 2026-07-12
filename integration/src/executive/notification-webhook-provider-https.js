import {
  buildCanonicalWebhookResult,
  buildWebhookProviderContract,
  classifyWebhookFailure,
  deterministicWebhookRequestRef,
  sanitizeWebhookMetadata,
  validateCanonicalWebhookRequest,
  WebhookProviderIds,
  WebhookProviderTypes
} from './notification-webhook-provider-contracts.js';
import { NotificationProviderHealthStates } from './notification-domain-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class HttpsWebhookProviderAdapter {
  constructor({
    fetchImpl = globalThis.fetch,
    now,
    config = {}
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.providerId = WebhookProviderIds.HTTPS;
    this.providerType = WebhookProviderTypes.HTTPS;
    this.config = {
      timeoutMs: Number.parseInt(String(config.timeoutMs ?? process.env.ATLAS_WEBHOOK_PROVIDER_TIMEOUT_MS ?? '10000'), 10),
      userAgent: String(config.userAgent ?? process.env.ATLAS_WEBHOOK_PROVIDER_USER_AGENT ?? 'AtlasWebhook/1.0').trim()
    };
  }

  getContract() {
    return buildWebhookProviderContract({
      providerId: this.providerId,
      name: 'Atlas HTTPS Webhook Adapter',
      healthState: NotificationProviderHealthStates.HEALTHY,
      maximumPayloadBytes: 262144
    });
  }

  validateConfiguration() {
    const issues = [];
    if (typeof this.fetchImpl !== 'function') issues.push('fetch implementation is required.');
    if (!Number.isFinite(this.config.timeoutMs) || this.config.timeoutMs < 500 || this.config.timeoutMs > 60000) {
      issues.push('timeoutMs must be between 500 and 60000 ms.');
    }
    if (!this.config.userAgent) issues.push('userAgent is required.');

    return {
      accepted: issues.length === 0,
      issues
    };
  }

  getHealthSnapshot() {
    const validation = this.validateConfiguration();
    return {
      providerId: this.providerId,
      providerType: this.providerType,
      healthState: validation.accepted ? NotificationProviderHealthStates.HEALTHY : NotificationProviderHealthStates.DEGRADED,
      checkedAt: nowIso(this.now),
      warnings: validation.issues
    };
  }

  async sendWebhook(request) {
    const validation = validateCanonicalWebhookRequest(request);
    if (!validation.accepted) {
      const classification = classifyWebhookFailure({ configuration: true });
      return buildCanonicalWebhookResult({
        accepted: false,
        ...classification,
        metadata: {
          reason: 'Invalid canonical webhook request.',
          issues: validation.issues
        }
      }, { now: this.now });
    }

    const canonical = validation.request;
    const providerRequestRef = deterministicWebhookRequestRef(`${canonical.providerRequestId}:${canonical.idempotencyKey}`);
    const headers = {
      'Content-Type': canonical.contentType,
      'Idempotency-Key': canonical.idempotencyKey,
      'User-Agent': this.config.userAgent,
      ...canonical.headers
    };

    const timeoutMs = Number.isFinite(canonical.timeoutMs) ? canonical.timeoutMs : this.config.timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = typeof canonical.body === 'string' ? canonical.body : JSON.stringify(canonical.body ?? {});
      const response = await this.fetchImpl(canonical.endpoint, {
        method: canonical.method,
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeout);

      const responseJson = await safeJson(response);
      const providerMessageId = response.headers?.get?.('x-request-id')
        || response.headers?.get?.('x-correlation-id')
        || null;

      if (response.ok) {
        return buildCanonicalWebhookResult({
          accepted: true,
          providerMessageId,
          providerRequestRef,
          providerStatusCode: response.status,
          outcome: 'SUCCEEDED',
          metadata: sanitizeWebhookMetadata({
            status: response.status,
            response: responseJson
          })
        }, { now: this.now });
      }

      const classification = classifyWebhookFailure({ statusCode: response.status });
      return buildCanonicalWebhookResult({
        accepted: false,
        providerMessageId,
        providerRequestRef,
        providerStatusCode: response.status,
        ...classification,
        metadata: sanitizeWebhookMetadata({
          status: response.status,
          response: responseJson
        })
      }, { now: this.now });
    } catch (error) {
      clearTimeout(timeout);
      const aborted = error?.name === 'AbortError';
      const classification = classifyWebhookFailure({ timeout: aborted, unknown: !aborted });
      return buildCanonicalWebhookResult({
        accepted: false,
        providerRequestRef,
        ...classification,
        metadata: sanitizeWebhookMetadata({
          error: error?.message ?? 'unknown'
        })
      }, { now: this.now });
    }
  }
}
