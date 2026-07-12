import {
  EmailProviderIds,
  buildCanonicalEmailResult,
  buildEmailProviderContract,
  classifyFailureFromStatus,
  sanitizeProviderMetadata,
  validateCanonicalEmailRequest,
  validateDisplayName,
  validateReplyTo
} from './notification-email-provider-contracts.js';
import {
  NotificationFailureClasses,
  NotificationProviderHealthStates
} from './notification-domain-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function asUrl(value) {
  try {
    return new URL(String(value ?? ''));
  } catch {
    return null;
  }
}

function inferRecipientRejection(body = {}) {
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const text = errors
    .map((entry) => `${entry?.message ?? ''} ${entry?.field ?? ''}`.toLowerCase())
    .join(' | ');
  return /recipient|to\[\]|invalid email|email address/.test(text);
}

export class SendGridEmailProviderAdapter {
  constructor({
    now,
    fetchImpl = globalThis.fetch,
    config = {}
  } = {}) {
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.config = {
      apiKey: String(config.apiKey ?? process.env.ATLAS_EMAIL_SENDGRID_API_KEY ?? '').trim(),
      endpoint: String(config.endpoint ?? process.env.ATLAS_EMAIL_SENDGRID_ENDPOINT ?? 'https://api.sendgrid.com/v3/mail/send').trim(),
      defaultSenderEmail: String(config.defaultSenderEmail ?? process.env.ATLAS_EMAIL_SENDER_ADDRESS ?? '').trim().toLowerCase(),
      defaultSenderDisplayName: String(config.defaultSenderDisplayName ?? process.env.ATLAS_EMAIL_SENDER_DISPLAY_NAME ?? '').trim(),
      defaultReplyTo: String(config.defaultReplyTo ?? process.env.ATLAS_EMAIL_REPLY_TO ?? '').trim().toLowerCase(),
      timeoutMs: toInt(config.timeoutMs ?? process.env.ATLAS_EMAIL_SENDGRID_TIMEOUT_MS, 10000),
      region: String(config.region ?? process.env.ATLAS_EMAIL_PROVIDER_REGION ?? '').trim(),
      emergencyDisable: String(config.emergencyDisable ?? process.env.ATLAS_EMAIL_PROVIDER_EMERGENCY_DISABLE ?? 'false').trim().toLowerCase() === 'true'
    };
  }

  providerId() {
    return EmailProviderIds.SENDGRID;
  }

  providerName() {
    return 'SENDGRID';
  }

  providerType() {
    return 'sendgrid';
  }

  validateConfiguration() {
    const issues = [];

    if (!hasText(this.config.apiKey)) {
      issues.push('ATLAS_EMAIL_SENDGRID_API_KEY is required.');
    }

    const endpoint = asUrl(this.config.endpoint);
    if (!endpoint || endpoint.protocol !== 'https:') {
      issues.push('ATLAS_EMAIL_SENDGRID_ENDPOINT must be a valid HTTPS URL.');
    }

    if (!hasText(this.config.defaultSenderEmail)) {
      issues.push('ATLAS_EMAIL_SENDER_ADDRESS is required.');
    }

    const senderDisplay = validateDisplayName(this.config.defaultSenderDisplayName);
    if (!senderDisplay.valid) {
      issues.push('ATLAS_EMAIL_SENDER_DISPLAY_NAME is invalid.');
    }

    const replyToValidation = validateReplyTo(this.config.defaultReplyTo || null);
    if (!replyToValidation.accepted) {
      issues.push(...replyToValidation.errors.map((entry) => `ATLAS_EMAIL_REPLY_TO invalid: ${entry}`));
    }

    if (this.config.timeoutMs < 500 || this.config.timeoutMs > 60000) {
      issues.push('ATLAS_EMAIL_SENDGRID_TIMEOUT_MS must be between 500 and 60000 ms.');
    }

    if (this.config.emergencyDisable) {
      issues.push('Email provider is disabled by emergency switch.');
    }

    return {
      accepted: issues.length === 0,
      issues,
      mode: 'PRODUCTION'
    };
  }

  healthReport() {
    const validation = this.validateConfiguration();
    const healthState = validation.accepted
      ? NotificationProviderHealthStates.HEALTHY
      : (this.config.emergencyDisable ? NotificationProviderHealthStates.UNAVAILABLE : NotificationProviderHealthStates.DEGRADED);

    return {
      providerId: this.providerId(),
      providerName: this.providerName(),
      healthState,
      mode: 'PRODUCTION',
      endpointConfigured: hasText(this.config.endpoint),
      region: this.config.region || null,
      contract: buildEmailProviderContract({
        providerId: this.providerId(),
        name: this.providerName(),
        healthState,
        supportsIdempotency: true
      }),
      issues: validation.issues
    };
  }

  classifyError(errorOrResponse = {}) {
    const input = asObject(errorOrResponse);
    if (input.timeout === true || input.name === 'AbortError') {
      return classifyFailureFromStatus({ timeout: true });
    }

    if (input.configuration === true) {
      return classifyFailureFromStatus({ configuration: true });
    }

    const statusCode = Number(input.statusCode ?? input.providerStatusCode ?? null);
    const recipientRejected = Boolean(input.recipientRejected);
    const rateLimited = statusCode === 429;
    const classification = classifyFailureFromStatus({ statusCode, recipientRejected, rateLimited });

    if (statusCode === 400 && classification.normalizedErrorClass === NotificationFailureClasses.RECIPIENT_INVALID) {
      return {
        normalizedErrorClass: NotificationFailureClasses.PROVIDER_REJECTED,
        retryable: false,
        terminal: true,
        outcome: 'FAILED_TERMINAL'
      };
    }

    return classification;
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

  buildProviderRequest(canonical) {
    const senderEmail = String(canonical.sender?.email ?? this.config.defaultSenderEmail).trim().toLowerCase();
    const senderName = String(canonical.sender?.displayName ?? this.config.defaultSenderDisplayName).trim();
    const replyTo = canonical.replyTo ?? this.config.defaultReplyTo ?? null;

    return {
      personalizations: [{
        to: [{ email: canonical.recipient.email }],
        custom_args: {
          providerRequestId: canonical.providerRequestId,
          correlationId: canonical.correlationId,
          businessId: canonical.businessId,
          customerId: canonical.customerId ?? ''
        }
      }],
      from: {
        email: senderEmail,
        name: senderName
      },
      reply_to: replyTo ? { email: replyTo } : undefined,
      subject: canonical.subject,
      content: [
        { type: 'text/plain', value: canonical.textBody },
        ...(canonical.htmlBody ? [{ type: 'text/html', value: canonical.htmlBody }] : [])
      ],
      headers: {
        'X-Atlas-Idempotency-Key': canonical.idempotencyKey,
        'X-Atlas-Correlation-Id': canonical.correlationId
      }
    };
  }

  async sendEmail(request = {}) {
    const configValidation = this.validateConfiguration();
    if (!configValidation.accepted) {
      return this.normalizeProviderResult({
        accepted: false,
        providerRequestRef: request.providerRequestId ?? null,
        providerStatusCode: 503,
        configuration: true,
        metadata: { reason: 'invalid_provider_configuration' }
      });
    }

    const validation = validateCanonicalEmailRequest(request);
    if (!validation.accepted) {
      return this.normalizeProviderResult({
        accepted: false,
        providerRequestRef: request.providerRequestId ?? null,
        providerStatusCode: 400,
        recipientRejected: true,
        metadata: {
          reason: 'invalid_request',
          failures: validation.errors
        }
      });
    }

    const canonical = validation.request;
    const providerPayload = this.buildProviderRequest(canonical);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const startedAt = Date.now();
    try {
      const response = await this.fetchImpl(this.config.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': canonical.idempotencyKey
        },
        body: JSON.stringify(providerPayload),
        signal: controller.signal
      });

      const latencyMs = Date.now() - startedAt;
      const requestRef = response.headers?.get?.('x-message-id')
        ?? response.headers?.get?.('x-request-id')
        ?? canonical.providerRequestId;

      if (response.ok) {
        return this.normalizeProviderResult({
          accepted: true,
          providerMessageId: response.headers?.get?.('x-message-id') ?? requestRef,
          providerRequestRef: requestRef,
          providerStatusCode: response.status,
          metadata: {
            latencyMs,
            provider: this.providerName()
          }
        });
      }

      let parsed = {};
      try {
        parsed = await response.json();
      } catch {
        parsed = {};
      }

      return this.normalizeProviderResult({
        accepted: false,
        providerRequestRef: requestRef,
        providerStatusCode: response.status,
        recipientRejected: inferRecipientRejection(parsed),
        metadata: {
          latencyMs,
          provider: this.providerName(),
          failureCount: Array.isArray(parsed.errors) ? parsed.errors.length : 0
        }
      });
    } catch (error) {
      const timeout = error?.name === 'AbortError';
      return this.normalizeProviderResult({
        accepted: false,
        providerRequestRef: validation.request.providerRequestId,
        providerStatusCode: timeout ? 504 : 503,
        timeout,
        metadata: {
          provider: this.providerName(),
          errorName: String(error?.name ?? 'Error')
        }
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
