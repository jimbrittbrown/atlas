import { randomUUID } from 'node:crypto';
import { appendEvent, getMetaMap, loadEventList, loadRecordMap, setMetaValue, upsertRecord } from '../storage/provider-backed-state.js';
import { MissionExecutiveStatuses } from './customer-intake-mission-control-contracts.js';
import { createPaymentProvider } from './payment-provider-factory.js';
import {
  createPaymentError,
  createPaymentRecord,
  createPaymentResult,
  normalizeCurrency,
  PaymentErrorCodes,
  PaymentLifecycleStates,
  PaymentProviderStatuses
} from './payment-provider-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function toAmountMinor(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function normalizeWebhookType(value) {
  return String(value ?? '').trim().toLowerCase();
}

export class PaymentManager {
  constructor({
    missionControl,
    storageProvider,
    now,
    logger,
    providerFactoryArgs = {},
    namespace = 'executive.payment-manager'
  } = {}) {
    this.missionControl = missionControl ?? null;
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.namespace = namespace;

    this.payments = loadRecordMap({ provider: this.storageProvider, namespace: `${namespace}.payments` });
    this.auditEvents = loadEventList({ provider: this.storageProvider, namespace: `${namespace}.audit` });
    this.processedWebhookEvents = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.processed-webhooks` });
    this.metrics = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.metrics` });

    this.providerSelection = createPaymentProvider({ now: this.now, logger: this.logger, ...providerFactoryArgs });
    this.provider = this.providerSelection.provider;
  }

  providerBlocked() {
    return Boolean(this.providerSelection.blocked);
  }

  providerWarnings() {
    return this.providerSelection.warnings ?? [];
  }

  incrementMetric(key, amount = 1) {
    const normalized = String(key ?? '').trim();
    if (!normalized) return;
    const next = Number(this.metrics.get(normalized) ?? 0) + Number(amount);
    this.metrics.set(normalized, next);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.metrics`, key: normalized, value: next });
  }

  appendAudit(event, details = {}) {
    const record = {
      auditId: `pay_audit_${randomUUID()}`,
      timestamp: nowIso(this.now),
      event,
      details
    };
    this.auditEvents.push(record);
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: record.auditId, value: record });
    return record;
  }

  persistPayment(payment) {
    this.payments.set(payment.paymentId, payment);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.payments`, key: payment.paymentId, value: payment });
    return payment;
  }

  rejectBlockedProvider() {
    return createPaymentResult({
      ok: false,
      error: createPaymentError({
        code: PaymentErrorCodes.PROVIDER_NOT_CONFIGURED,
        message: 'Payment provider is blocked in this environment by policy.'
      }),
      providerStatus: this.providerSelection.status ?? PaymentProviderStatuses.NOT_CONFIGURED
    });
  }

  getPaymentById(paymentId) {
    return this.payments.get(paymentId) ?? null;
  }

  findMissionPayment({ missionId, status = null } = {}) {
    return Array.from(this.payments.values()).find((payment) => {
      if (payment.missionId !== missionId) return false;
      if (!status) return true;
      return String(payment.status ?? '').toUpperCase() === String(status).toUpperCase();
    }) ?? null;
  }

  activateMissionAfterSuccessfulPayment({ missionId, paymentId } = {}) {
    const mission = this.missionControl?.missionRegistry?.getMissionById?.(missionId) ?? null;
    if (!mission) return null;

    const updated = this.missionControl.missionRegistry.updateMission(mission.missionId, {
      currentStage: 'PAYMENT_CONFIRMED_MISSION_ACTIVE',
      executiveStatus: MissionExecutiveStatuses.ACTIVE,
      blockedIssues: [],
      paymentStatus: PaymentLifecycleStates.SUCCEEDED,
      paymentId,
      progress: Math.max(Number(mission.progress ?? 0), 5)
    });

    this.appendAudit('MISSION_PAYMENT_ACTIVATED', {
      missionId,
      paymentId,
      customerId: mission.customerId
    });

    return updated;
  }

  createCheckoutSession({
    customerId,
    missionId,
    amount,
    currency = 'USD',
    description = null,
    successUrl = null,
    cancelUrl = null,
    requestedBy = 'CUSTOMER_PORTAL'
  } = {}) {
    if (this.providerBlocked()) {
      return this.rejectBlockedProvider();
    }

    const customer = this.missionControl?.customerRegistry?.getCustomerById?.(customerId) ?? null;
    if (!customer) {
      return createPaymentResult({
        ok: false,
        error: createPaymentError({ code: PaymentErrorCodes.NOT_FOUND, message: 'Customer not found.' }),
        providerStatus: this.providerSelection.status
      });
    }

    const mission = this.missionControl?.missionRegistry?.getMissionById?.(missionId) ?? null;
    if (!mission) {
      return createPaymentResult({
        ok: false,
        error: createPaymentError({ code: PaymentErrorCodes.NOT_FOUND, message: 'Mission not found.' }),
        providerStatus: this.providerSelection.status
      });
    }

    if (mission.customerId !== customerId) {
      return createPaymentResult({
        ok: false,
        error: createPaymentError({ code: PaymentErrorCodes.FORBIDDEN, message: 'Mission does not belong to customer.' }),
        providerStatus: this.providerSelection.status
      });
    }

    const existingPending = this.findMissionPayment({ missionId, status: PaymentLifecycleStates.CHECKOUT_PENDING });
    if (existingPending) {
      return createPaymentResult({
        ok: true,
        data: {
          payment: existingPending,
          checkout: {
            providerCheckoutSessionId: existingPending.providerCheckoutSessionId,
            providerPaymentId: existingPending.providerPaymentId,
            checkoutUrl: existingPending.checkoutUrl,
            reused: true
          }
        },
        providerStatus: this.provider.getProviderStatus?.() ?? null
      });
    }

    const amountMinor = toAmountMinor(amount);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      return createPaymentResult({
        ok: false,
        error: createPaymentError({ code: PaymentErrorCodes.INVALID_REQUEST, message: 'Valid positive payment amount is required.' }),
        providerStatus: this.providerSelection.status
      });
    }

    const payment = createPaymentRecord({
      customerId,
      missionId,
      providerType: this.providerSelection.type,
      providerName: this.provider.getProviderName?.() ?? this.providerSelection.type,
      amountMinor,
      currency: normalizeCurrency(currency),
      status: PaymentLifecycleStates.CHECKOUT_PENDING,
      metadata: {
        description,
        successUrl,
        cancelUrl,
        requestedBy
      }
    }, { now: this.now });

    const checkout = this.provider.createCheckoutSession({
      payment,
      customer,
      successUrl,
      cancelUrl,
      metadata: {
        paymentId: payment.paymentId,
        missionId,
        customerId
      }
    });

    if (!checkout.ok) {
      payment.status = PaymentLifecycleStates.FAILED;
      payment.failedAt = nowIso(this.now);
      payment.failureReason = checkout.error?.message ?? 'Checkout initialization failed.';
      payment.updatedAt = nowIso(this.now);
      this.persistPayment(payment);
      this.incrementMetric('checkoutFailed', 1);
      this.appendAudit('PAYMENT_CHECKOUT_FAILED', {
        paymentId: payment.paymentId,
        missionId,
        customerId,
        reason: payment.failureReason
      });
      return checkout;
    }

    const updatedPayment = {
      ...payment,
      providerCheckoutSessionId: checkout.data.providerCheckoutSessionId,
      providerPaymentId: checkout.data.providerPaymentId,
      checkoutUrl: checkout.data.checkoutUrl,
      updatedAt: nowIso(this.now)
    };

    this.persistPayment(updatedPayment);
    this.incrementMetric('checkoutCreated', 1);
    this.appendAudit('PAYMENT_CHECKOUT_CREATED', {
      paymentId: updatedPayment.paymentId,
      missionId,
      customerId,
      providerCheckoutSessionId: updatedPayment.providerCheckoutSessionId
    });

    this.missionControl?.missionRegistry?.updateMission?.(mission.missionId, {
      currentStage: 'PAYMENT_PENDING',
      executiveStatus: MissionExecutiveStatuses.BLOCKED,
      paymentStatus: PaymentLifecycleStates.CHECKOUT_PENDING,
      paymentId: updatedPayment.paymentId,
      blockedIssues: ['Customer payment is pending before mission activation.']
    });

    return createPaymentResult({
      ok: true,
      data: {
        payment: updatedPayment,
        checkout: checkout.data
      },
      providerStatus: checkout.providerStatus
    });
  }

  updatePaymentStatus({ payment, status, reason = null, eventId = null } = {}) {
    const next = {
      ...payment,
      status,
      updatedAt: nowIso(this.now),
      failureReason: reason ?? payment.failureReason
    };

    if (status === PaymentLifecycleStates.SUCCEEDED) next.completedAt = nowIso(this.now);
    if (status === PaymentLifecycleStates.FAILED) next.failedAt = nowIso(this.now);
    if (status === PaymentLifecycleStates.CANCELED) next.canceledAt = nowIso(this.now);
    if (status === PaymentLifecycleStates.REFUNDED) next.refundedAt = nowIso(this.now);

    this.persistPayment(next);
    this.appendAudit('PAYMENT_STATUS_UPDATED', {
      paymentId: next.paymentId,
      status,
      eventId,
      missionId: next.missionId,
      customerId: next.customerId
    });

    return next;
  }

  parseWebhookPaymentReference(event = {}) {
    const object = event?.data?.object ?? {};
    const metadata = object.metadata ?? {};

    if (metadata.paymentId) {
      const payment = this.getPaymentById(metadata.paymentId);
      if (payment) return payment;
    }

    const providerCheckoutSessionId = object.id ?? metadata.providerCheckoutSessionId ?? null;
    const providerPaymentId = object.payment_intent ?? object.paymentIntentId ?? metadata.providerPaymentId ?? null;

    if (providerCheckoutSessionId) {
      const match = Array.from(this.payments.values()).find((payment) => payment.providerCheckoutSessionId === providerCheckoutSessionId);
      if (match) return match;
    }

    if (providerPaymentId) {
      const match = Array.from(this.payments.values()).find((payment) => payment.providerPaymentId === providerPaymentId);
      if (match) return match;
    }

    return null;
  }

  handleWebhook({ providerType = 'stripe', headers = {}, payload = null, rawBody = '' } = {}) {
    if (String(providerType).toLowerCase() !== String(this.providerSelection.type).toLowerCase()) {
      return createPaymentResult({
        ok: false,
        error: createPaymentError({ code: PaymentErrorCodes.INVALID_REQUEST, message: 'Webhook provider does not match configured payment provider.' }),
        providerStatus: this.providerSelection.status
      });
    }

    const verification = this.provider.verifyWebhook({ headers, payload, rawBody });
    if (!verification.ok) {
      this.incrementMetric('webhookRejected', 1);
      this.appendAudit('PAYMENT_WEBHOOK_REJECTED', {
        providerType,
        reason: verification.error?.message ?? 'verification failed'
      });
      return verification;
    }

    const event = verification.data.event;
    const eventId = String(event?.id ?? `evt_${randomUUID()}`);

    if (this.processedWebhookEvents.has(eventId)) {
      this.incrementMetric('webhookDuplicate', 1);
      return createPaymentResult({
        ok: true,
        data: { accepted: true, duplicate: true, eventId },
        providerStatus: verification.providerStatus
      });
    }

    const payment = this.parseWebhookPaymentReference(event);
    if (!payment) {
      this.processedWebhookEvents.set(eventId, { accepted: false, reason: 'payment_not_found', at: nowIso(this.now) });
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.processed-webhooks`, key: eventId, value: this.processedWebhookEvents.get(eventId) });
      this.incrementMetric('webhookUnhandled', 1);
      return createPaymentResult({
        ok: false,
        error: createPaymentError({ code: PaymentErrorCodes.NOT_FOUND, message: 'Payment record for webhook event was not found.' }),
        providerStatus: verification.providerStatus
      });
    }

    const normalizedType = normalizeWebhookType(event?.type);
    let updatedPayment = payment;

    if (normalizedType === 'checkout.session.completed' || normalizedType === 'payment_intent.succeeded') {
      updatedPayment = this.updatePaymentStatus({ payment, status: PaymentLifecycleStates.SUCCEEDED, eventId });
      this.activateMissionAfterSuccessfulPayment({ missionId: payment.missionId, paymentId: payment.paymentId });
      this.incrementMetric('paymentSucceeded', 1);
    } else if (normalizedType === 'payment_intent.payment_failed' || normalizedType === 'checkout.session.async_payment_failed') {
      updatedPayment = this.updatePaymentStatus({ payment, status: PaymentLifecycleStates.FAILED, reason: normalizedType, eventId });
      this.incrementMetric('paymentFailed', 1);
    } else if (normalizedType === 'charge.refunded') {
      updatedPayment = this.updatePaymentStatus({ payment, status: PaymentLifecycleStates.REFUNDED, eventId });
      this.incrementMetric('paymentRefunded', 1);
    } else if (normalizedType === 'checkout.session.expired') {
      updatedPayment = this.updatePaymentStatus({ payment, status: PaymentLifecycleStates.CANCELED, eventId });
      this.incrementMetric('paymentCanceled', 1);
    } else {
      this.incrementMetric('webhookUnhandled', 1);
    }

    const processed = {
      accepted: true,
      paymentId: updatedPayment.paymentId,
      paymentStatus: updatedPayment.status,
      at: nowIso(this.now)
    };
    this.processedWebhookEvents.set(eventId, processed);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.processed-webhooks`, key: eventId, value: processed });
    this.incrementMetric('webhookAccepted', 1);

    return createPaymentResult({
      ok: true,
      data: {
        accepted: true,
        eventId,
        payment: updatedPayment
      },
      providerStatus: verification.providerStatus
    });
  }

  listPaymentsForCustomer(customerId) {
    return Array.from(this.payments.values())
      .filter((payment) => payment.customerId === customerId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  getCustomerPaymentHistory({ customerId } = {}) {
    return {
      customerId,
      payments: this.listPaymentsForCustomer(customerId)
    };
  }

  getDashboardProjection() {
    const records = Array.from(this.payments.values());
    const byStatus = records.reduce((acc, payment) => {
      const key = String(payment.status ?? 'UNKNOWN').toUpperCase();
      acc[key] = Number(acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const providerHealth = this.provider.healthReport?.() ?? this.provider.getProviderStatus?.() ?? {};

    return {
      providerType: this.providerSelection.type,
      providerBlocked: this.providerBlocked(),
      providerStatus: providerHealth,
      warnings: this.providerWarnings(),
      payments: {
        total: records.length,
        checkoutPending: Number(byStatus.CHECKOUT_PENDING ?? 0),
        succeeded: Number(byStatus.SUCCEEDED ?? 0),
        failed: Number(byStatus.FAILED ?? 0),
        canceled: Number(byStatus.CANCELED ?? 0),
        refunded: Number(byStatus.REFUNDED ?? 0)
      },
      counters: {
        checkoutCreated: Number(this.metrics.get('checkoutCreated') ?? 0),
        checkoutFailed: Number(this.metrics.get('checkoutFailed') ?? 0),
        paymentSucceeded: Number(this.metrics.get('paymentSucceeded') ?? 0),
        paymentFailed: Number(this.metrics.get('paymentFailed') ?? 0),
        paymentCanceled: Number(this.metrics.get('paymentCanceled') ?? 0),
        paymentRefunded: Number(this.metrics.get('paymentRefunded') ?? 0),
        webhookAccepted: Number(this.metrics.get('webhookAccepted') ?? 0),
        webhookRejected: Number(this.metrics.get('webhookRejected') ?? 0),
        webhookDuplicate: Number(this.metrics.get('webhookDuplicate') ?? 0),
        webhookUnhandled: Number(this.metrics.get('webhookUnhandled') ?? 0),
        rateLimitEvents: Number(this.metrics.get('rateLimitEvents') ?? 0)
      },
      generatedAt: nowIso(this.now)
    };
  }

  recordRateLimitEvent() {
    this.incrementMetric('rateLimitEvents', 1);
  }
}
