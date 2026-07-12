import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  createPaymentError,
  createPaymentResult,
  PaymentErrorCodes,
  PaymentProviderStatuses
} from './payment-provider-contracts.js';

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function parseStripeSignatureHeader(value) {
  const header = String(value ?? '').trim();
  if (!header) return null;

  const entries = header.split(',').map((item) => item.trim());
  const out = {};
  for (const entry of entries) {
    const [key, val] = entry.split('=');
    if (key && val) {
      out[key.trim()] = val.trim();
    }
  }

  if (!out.t || !out.v1) return null;
  return {
    timestamp: Number.parseInt(out.t, 10),
    signature: out.v1
  };
}

function secureHexEquals(leftHex, rightHex) {
  const left = Buffer.from(String(leftHex ?? ''), 'hex');
  const right = Buffer.from(String(rightHex ?? ''), 'hex');
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export class StripePaymentProviderAdapter {
  constructor({
    now,
    logger,
    config = {}
  } = {}) {
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.config = {
      secretKey: config.secretKey ?? process.env.ATLAS_STRIPE_SECRET_KEY ?? '',
      webhookSecret: config.webhookSecret ?? process.env.ATLAS_STRIPE_WEBHOOK_SECRET ?? '',
      publishableKey: config.publishableKey ?? process.env.ATLAS_STRIPE_PUBLISHABLE_KEY ?? '',
      mode: String(config.mode ?? process.env.ATLAS_STRIPE_MODE ?? 'mock').trim().toLowerCase(),
      allowLive: String(config.allowLive ?? process.env.ATLAS_STRIPE_ALLOW_LIVE ?? 'false').trim().toLowerCase() === 'true',
      webhookToleranceSeconds: Number.parseInt(String(config.webhookToleranceSeconds ?? process.env.ATLAS_STRIPE_WEBHOOK_TOLERANCE_SECONDS ?? '300'), 10)
    };
  }

  getProviderName() {
    return 'STRIPE';
  }

  getProviderStatus() {
    if (this.config.mode === 'mock') {
      return {
        mode: PaymentProviderStatuses.DEVELOPMENT_ONLY,
        readiness: PaymentProviderStatuses.CONFIGURED,
        connectivity: PaymentProviderStatuses.CONNECTED,
        warnings: ['Stripe adapter running in mock sandbox mode.']
      };
    }

    if (!hasText(this.config.secretKey)) {
      return {
        mode: PaymentProviderStatuses.NOT_CONFIGURED,
        readiness: PaymentProviderStatuses.NOT_CONFIGURED,
        connectivity: PaymentProviderStatuses.NOT_CONNECTED,
        warnings: ['Stripe secret key is not configured.']
      };
    }

    if (!this.config.allowLive) {
      return {
        mode: PaymentProviderStatuses.DEGRADED,
        readiness: PaymentProviderStatuses.DEGRADED,
        connectivity: PaymentProviderStatuses.NOT_CONNECTED,
        warnings: ['Live Stripe transactions are disabled by policy in this environment.']
      };
    }

    return {
      mode: PaymentProviderStatuses.CONFIGURED,
      readiness: PaymentProviderStatuses.CONFIGURED,
      connectivity: PaymentProviderStatuses.CONNECTED,
      warnings: []
    };
  }

  createCheckoutSession({ payment, customer, successUrl, cancelUrl, metadata = {} } = {}) {
    const status = this.getProviderStatus();

    if (this.config.mode !== 'mock' && status.readiness !== PaymentProviderStatuses.CONFIGURED) {
      return createPaymentResult({
        ok: false,
        error: createPaymentError({
          code: PaymentErrorCodes.PROVIDER_NOT_CONFIGURED,
          message: 'Stripe provider is not configured for live transactions.'
        }),
        providerStatus: status
      });
    }

    const providerCheckoutSessionId = `cs_test_${payment.paymentId}`;
    const providerPaymentId = `pi_test_${payment.paymentId}`;
    const checkoutUrl = `https://checkout.stripe.local/session/${providerCheckoutSessionId}`;

    return createPaymentResult({
      ok: true,
      data: {
        providerCheckoutSessionId,
        providerPaymentId,
        checkoutUrl,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        mode: this.config.mode,
        metadata: {
          ...metadata,
          paymentId: payment.paymentId,
          customerId: customer?.customerId ?? payment.customerId,
          missionId: payment.missionId
        }
      },
      providerStatus: status
    });
  }

  verifyWebhook({ headers = {}, rawBody = '', payload = null } = {}) {
    const status = this.getProviderStatus();
    const body = String(rawBody ?? (payload ? JSON.stringify(payload) : ''));

    const webhookSecret = String(this.config.webhookSecret ?? '').trim();
    const signatureHeader = headers['stripe-signature'] ?? headers['Stripe-Signature'] ?? null;

    if (hasText(webhookSecret)) {
      const parsed = parseStripeSignatureHeader(signatureHeader);
      if (!parsed || !Number.isFinite(parsed.timestamp)) {
        return createPaymentResult({
          ok: false,
          error: createPaymentError({ code: PaymentErrorCodes.WEBHOOK_REJECTED, message: 'Invalid Stripe webhook signature header.' }),
          providerStatus: status
        });
      }

      const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp);
      const tolerance = Number.isFinite(this.config.webhookToleranceSeconds) ? this.config.webhookToleranceSeconds : 300;
      if (ageSeconds > tolerance) {
        return createPaymentResult({
          ok: false,
          error: createPaymentError({ code: PaymentErrorCodes.WEBHOOK_REJECTED, message: 'Stripe webhook signature timestamp is outside tolerance.' }),
          providerStatus: status
        });
      }

      const signedPayload = `${parsed.timestamp}.${body}`;
      const expected = createHmac('sha256', webhookSecret).update(signedPayload, 'utf8').digest('hex');
      if (!secureHexEquals(expected, parsed.signature)) {
        return createPaymentResult({
          ok: false,
          error: createPaymentError({ code: PaymentErrorCodes.WEBHOOK_REJECTED, message: 'Stripe webhook signature verification failed.' }),
          providerStatus: status
        });
      }
    }

    const event = payload && typeof payload === 'object'
      ? payload
      : { type: 'unknown', id: `evt_${Date.now()}`, data: { object: {} } };

    return createPaymentResult({
      ok: true,
      data: {
        verified: true,
        provider: this.getProviderName(),
        receivedAt: nowIso(this.now),
        event
      },
      providerStatus: status
    });
  }

  healthReport() {
    return {
      provider: this.getProviderName(),
      ...this.getProviderStatus(),
      mode: this.config.mode,
      webhookVerificationEnabled: hasText(this.config.webhookSecret)
    };
  }
}
