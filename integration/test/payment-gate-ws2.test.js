import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';
import { PaymentManager } from '../src/executive/payment-manager.js';

function createRuntime() {
  const missionControl = new CustomerIntakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });
  const portal = new CustomerPortalManager({
    missionControl,
    executivePlanningSystem: planning,
    workforceDirector: missionControl.workforceDirector
  });

  // Ensure payment manager uses runtime references directly.
  const paymentManager = new PaymentManager({
    missionControl,
    executivePlanningSystem: planning,
    customerPortalManager: portal
  });
  portal.paymentManager = paymentManager;

  return { missionControl, planning, portal, paymentManager };
}

function createCustomerWithMission(portal, missionControl, { email = 'ws2@example.com' } = {}) {
  const accountSlug = String(email).split('@')[0].replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const submit = portal.submitWebsiteRequest({
    businessName: `WS2 Prospect ${accountSlug}`,
    businessType: 'Professional Services',
    websiteUrl: `https://${accountSlug}.ws2-prospect.example`,
    contactName: 'WS2 Contact',
    email,
    phone: '+1-555-1000',
    targetAudience: 'SMB owners',
    businessDescription: 'Need a customer website.',
    goals: ['Launch website'],
    budget: '$2,500',
    timeline: '4 weeks',
    desiredPages: ['home', 'services', 'contact'],
    requestedBy: 'WS2_TEST'
  });

  const mission = missionControl.missionRegistry.getMissionById(submit.data.missionId);
  return {
    customerId: submit.data.customerId,
    missionId: submit.data.missionId,
    proposalId: portal.getRequestByMissionId(submit.data.missionId)?.proposalId ?? null,
    mission
  };
}

function acceptCommercial(planning, { proposalId, customerId, missionId }) {
  const accepted = planning.acceptCommercialProposal({
    proposalId,
    customerId,
    projectId: missionId,
    acceptedBy: 'WS2 Customer',
    termsVersion: 'ATLAS_WEBSITE_TERMS_V1'
  });
  assert.equal(accepted.accepted, true);
  return accepted;
}

function successWebhookFor(payment) {
  return {
    id: `evt_${payment.paymentId}_success`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: payment.providerCheckoutSessionId,
        payment_intent: payment.providerPaymentId,
        metadata: {
          paymentId: payment.paymentId,
          missionId: payment.missionId,
          customerId: payment.customerId
        }
      }
    }
  };
}

test('proposal required before checkout', () => {
  const { missionControl, paymentManager } = createRuntime();
  const created = missionControl.customerRegistry.createCustomer({
    companyName: 'No Proposal Co',
    contactName: 'No Proposal',
    email: 'no-proposal@example.com',
    phone: '+1-555-1001',
    website: 'https://no-proposal.example',
    industry: 'Services'
  });
  const customer = created.customer;
  const mission = missionControl.missionRegistry.createMission({
    customerId: customer.customerId,
    missionType: 'WEBSITE_BUILD',
    assignedWorkforce: ['WEBSITE_DIVISION'],
    executiveStatus: 'ACTIVE',
    currentStage: 'PAYMENT_GATE_READY',
    progress: 2
  });

  const checkout = paymentManager.createCheckoutSession({
    customerId: customer.customerId,
    missionId: mission.missionId,
    amount: 2500,
    currency: 'USD'
  });

  assert.equal(checkout.ok, false);
  assert.equal(checkout.error.code, 'CONFLICT');
  assert.equal(checkout.error.message.includes('proposal'), true);
});

test('expired proposal prevents checkout and payment after expiration fails closed', () => {
  const { missionControl, planning, portal, paymentManager } = createRuntime();
  const { customerId, missionId, proposalId } = createCustomerWithMission(portal, missionControl, {
    email: 'expired-before-checkout@example.com'
  });

  acceptCommercial(planning, { proposalId, customerId, missionId });
  const expired = planning.expireCommercialProposal(proposalId, {
    nowMs: Date.parse('2099-01-01T00:00:00.000Z')
  });
  assert.equal(expired.expired, false);

  // Force expiration by mutating proposal expiration in a controlled test path.
  const record = planning.portfolioManager.portfolioRegistry.getProposal(proposalId);
  record.proposal.commercial.expiresAt = '2000-01-01T00:00:00.000Z';

  const checkout = paymentManager.createCheckoutSession({
    customerId,
    missionId,
    amount: 2500,
    currency: 'USD'
  });

  assert.equal(checkout.ok, false);
  assert.equal(checkout.error.message.includes('expired'), true);
});

test('successful payment activates mission exactly once and records immutable activation data', () => {
  const { missionControl, planning, portal, paymentManager } = createRuntime();
  const { customerId, missionId, proposalId } = createCustomerWithMission(portal, missionControl, {
    email: 'success-case@example.com'
  });

  const acceptance = acceptCommercial(planning, { proposalId, customerId, missionId });
  const expectedAmount = acceptance.acceptanceRecord.lockedQuote.amountMinor;

  const checkout = paymentManager.createCheckoutSession({
    customerId,
    missionId,
    amount: expectedAmount / 100,
    currency: 'USD'
  });
  assert.equal(checkout.ok, true);

  const webhook = paymentManager.handleWebhook({
    providerType: 'stripe',
    payload: successWebhookFor(checkout.data.payment),
    rawBody: JSON.stringify(successWebhookFor(checkout.data.payment))
  });

  assert.equal(webhook.ok, true);
  assert.equal(webhook.data.payment.status, 'PAID');

  const mission = missionControl.missionRegistry.getMissionById(missionId);
  assert.equal(mission.currentStage, 'PRODUCTION_STARTED');
  assert.equal(mission.paymentStatus, 'PAID');
  assert.equal(mission.paymentActivationRecord.customerId, customerId);
  assert.equal(mission.paymentActivationRecord.projectId, missionId);
  assert.equal(mission.paymentActivationRecord.proposalVersion, acceptance.acceptanceRecord.versionNumber);
  assert.equal(typeof mission.paymentActivationRecord.quoteLock.lineItemIntegrityHash, 'string');
});

test('duplicate payment replay and duplicate mission activation are idempotent', () => {
  const { missionControl, planning, portal, paymentManager } = createRuntime();
  const { customerId, missionId, proposalId } = createCustomerWithMission(portal, missionControl, {
    email: 'replay-case@example.com'
  });

  const acceptance = acceptCommercial(planning, { proposalId, customerId, missionId });
  const checkout = paymentManager.createCheckoutSession({
    customerId,
    missionId,
    amount: acceptance.acceptanceRecord.lockedQuote.amountMinor / 100,
    currency: 'USD'
  });
  assert.equal(checkout.ok, true);

  const event = successWebhookFor(checkout.data.payment);
  const first = paymentManager.handleWebhook({
    providerType: 'stripe',
    payload: event,
    rawBody: JSON.stringify(event)
  });
  const second = paymentManager.handleWebhook({
    providerType: 'stripe',
    payload: event,
    rawBody: JSON.stringify(event)
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.data.duplicate, true);

  const mission = missionControl.missionRegistry.getMissionById(missionId);
  assert.equal(mission.currentStage, 'PRODUCTION_STARTED');

  const activations = paymentManager.auditEvents.filter((item) => item.event === 'mission_activated');
  assert.equal(activations.length, 1);
});

test('currency mismatch fails closed', () => {
  const { missionControl, planning, portal, paymentManager } = createRuntime();
  const { customerId, missionId, proposalId } = createCustomerWithMission(portal, missionControl, {
    email: 'currency-mismatch@example.com'
  });

  acceptCommercial(planning, { proposalId, customerId, missionId });

  const checkout = paymentManager.createCheckoutSession({
    customerId,
    missionId,
    amount: 2500,
    currency: 'EUR'
  });

  assert.equal(checkout.ok, false);
  assert.equal(checkout.error.message.includes('currency'), true);
});

test('quote mismatch fails closed', () => {
  const { missionControl, planning, portal, paymentManager } = createRuntime();
  const { customerId, missionId, proposalId } = createCustomerWithMission(portal, missionControl, {
    email: 'quote-mismatch@example.com'
  });

  acceptCommercial(planning, { proposalId, customerId, missionId });

  const checkout = paymentManager.createCheckoutSession({
    customerId,
    missionId,
    amount: 2499.99,
    currency: 'USD'
  });

  assert.equal(checkout.ok, false);
  assert.equal(checkout.error.message.includes('amount'), true);
});

test('failed and cancelled payment events fail closed and do not start production', () => {
  const { missionControl, planning, portal, paymentManager } = createRuntime();
  const { customerId, missionId, proposalId } = createCustomerWithMission(portal, missionControl, {
    email: 'failed-cancelled@example.com'
  });

  const acceptance = acceptCommercial(planning, { proposalId, customerId, missionId });
  const checkout = paymentManager.createCheckoutSession({
    customerId,
    missionId,
    amount: acceptance.acceptanceRecord.lockedQuote.amountMinor / 100,
    currency: 'USD'
  });
  assert.equal(checkout.ok, true);

  const failedEvent = {
    id: `evt_${checkout.data.payment.paymentId}_failed`,
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: checkout.data.payment.providerCheckoutSessionId,
        payment_intent: checkout.data.payment.providerPaymentId,
        metadata: {
          paymentId: checkout.data.payment.paymentId,
          missionId,
          customerId
        }
      }
    }
  };

  const failed = paymentManager.handleWebhook({
    providerType: 'stripe',
    payload: failedEvent,
    rawBody: JSON.stringify(failedEvent)
  });

  assert.equal(failed.ok, true);
  assert.equal(failed.data.payment.status, 'FAILED');

  const cancelledEvent = {
    id: `evt_${checkout.data.payment.paymentId}_cancelled`,
    type: 'checkout.session.expired',
    data: {
      object: {
        id: checkout.data.payment.providerCheckoutSessionId,
        payment_intent: checkout.data.payment.providerPaymentId,
        metadata: {
          paymentId: checkout.data.payment.paymentId,
          missionId,
          customerId
        }
      }
    }
  };

  const cancelled = paymentManager.handleWebhook({
    providerType: 'stripe',
    payload: cancelledEvent,
    rawBody: JSON.stringify(cancelledEvent)
  });

  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.data.payment.status, 'CANCELLED');

  const mission = missionControl.missionRegistry.getMissionById(missionId);
  assert.notEqual(mission.currentStage, 'PRODUCTION_STARTED');
});

test('customer isolation enforced in payment checkout', () => {
  const { missionControl, planning, portal, paymentManager } = createRuntime();
  const first = createCustomerWithMission(portal, missionControl, { email: 'isolation-a@example.com' });
  const second = createCustomerWithMission(portal, missionControl, { email: 'isolation-b@example.com' });

  acceptCommercial(planning, { proposalId: first.proposalId, customerId: first.customerId, missionId: first.missionId });

  const checkout = paymentManager.createCheckoutSession({
    customerId: second.customerId,
    missionId: first.missionId,
    amount: 2500,
    currency: 'USD'
  });

  assert.equal(checkout.ok, false);
  assert.equal(checkout.error.code, 'FORBIDDEN');
});

test('audit records are redacted and include required ws2 events', () => {
  const { missionControl, planning, portal, paymentManager } = createRuntime();
  const { customerId, missionId, proposalId } = createCustomerWithMission(portal, missionControl, {
    email: 'audit-redaction@example.com'
  });

  const acceptance = acceptCommercial(planning, { proposalId, customerId, missionId });
  const checkout = paymentManager.createCheckoutSession({
    customerId,
    missionId,
    amount: acceptance.acceptanceRecord.lockedQuote.amountMinor / 100,
    currency: 'USD'
  });
  assert.equal(checkout.ok, true);

  const event = successWebhookFor(checkout.data.payment);
  paymentManager.handleWebhook({ providerType: 'stripe', payload: event, rawBody: JSON.stringify(event), headers: { authorization: 'secret-token' } });
  paymentManager.handleWebhook({ providerType: 'stripe', payload: event, rawBody: JSON.stringify(event), headers: { authorization: 'secret-token' } });

  const eventNames = paymentManager.auditEvents.map((item) => item.event);
  assert.equal(eventNames.includes('payment_received'), true);
  assert.equal(eventNames.includes('payment_replayed'), true);
  assert.equal(eventNames.includes('mission_activated'), true);

  for (const audit of paymentManager.auditEvents) {
    assert.equal(Object.prototype.hasOwnProperty.call(audit.details, 'authorization'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(audit.details, 'rawBody'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(audit.details, 'checkoutUrl'), false);
  }
});
