import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { ExecutiveDashboardApiRateLimiter } from '../src/executive/executive-dashboard-api-rate-limiter.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';
import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { CustomerStatuses, MissionExecutiveStatuses } from '../src/executive/customer-intake-mission-control-contracts.js';

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides ?? {})) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createRuntime({ storageProvider = null, rateLimiter = null } = {}) {
  const missionControl = new CustomerIntakeMissionControl({ storageProvider });
  const planning = new ExecutivePlanningSystem({ missionControl, storageProvider });
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    customerPortalManager: new CustomerPortalManager({
      missionControl,
      executivePlanningSystem: planning,
      workforceDirector: missionControl.workforceDirector,
      storageProvider
    }),
    storageProvider
  });

  const dashboard = new ExecutiveOperationsDashboard({ manager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    rateLimiter: rateLimiter ?? new ExecutiveDashboardApiRateLimiter(),
    env: {
      ...process.env,
      ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE: 'development_token',
      ATLAS_CUSTOMER_AUTH_ALLOW_DEVELOPMENT_TOKEN_TRANSPORT: 'true'
    },
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'token-customer',
      ATLAS_DASHBOARD_API_TOKEN_CEO: 'token-ceo',
      ATLAS_DASHBOARD_API_TOKEN: 'token-ceo'
    } })
  });

  return { api, manager, missionControl };
}

async function callApi(api, {
  path,
  method = 'GET',
  body = {},
  token = null,
  sessionToken = null,
  cookie = null,
  csrfToken = null,
  origin = null,
  customerId = null,
  clientId = 'customer-auth-tests'
} = {}) {
  const headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(sessionToken ? { 'x-customer-session-token': sessionToken } : {}),
    ...(cookie ? { cookie } : {}),
    ...(csrfToken ? { 'x-atlas-csrf-token': csrfToken } : {}),
    ...(origin ? { origin } : {}),
    ...(customerId ? { 'x-customer-id': customerId } : {}),
    'x-client-id': clientId
  };

  return api.handleRequest({
    method,
    path,
    body,
    headers,
    clientId
  });
}

function toSetCookieArray(setCookie) {
  if (Array.isArray(setCookie)) return setCookie.filter(Boolean);
  if (typeof setCookie === 'string' && setCookie.trim().length > 0) return [setCookie];
  return [];
}

function cookieHeaderFromSetCookie(setCookie, cookieName = null) {
  const cookies = toSetCookieArray(setCookie);
  for (const cookie of cookies) {
    const first = String(cookie).split(';')[0]?.trim() ?? '';
    if (!first) continue;
    if (!cookieName || first.startsWith(`${cookieName}=`)) {
      return first;
    }
  }
  return '';
}

function mergeCookieHeaders(...cookieHeaders) {
  return cookieHeaders.filter(Boolean).join('; ');
}

function csrfTokenFromCookieHeader(cookieHeader) {
  const index = String(cookieHeader ?? '').indexOf('=');
  if (index <= 0) return null;
  return decodeURIComponent(String(cookieHeader).slice(index + 1));
}

async function loginCookieSession(api, email, origin = 'https://portal.atlas.example') {
  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email, password: 'atlas-pass-1234' },
    origin
  });

  const login = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email, password: 'atlas-pass-1234' },
    origin
  });

  const sessionCookie = cookieHeaderFromSetCookie(login.responseHeaders?.['set-cookie'], 'atlas_customer_session');
  const csrfCookie = cookieHeaderFromSetCookie(login.responseHeaders?.['set-cookie'], 'atlas_customer_csrf');
  const csrfToken = csrfTokenFromCookieHeader(csrfCookie);

  return {
    login,
    cookie: mergeCookieHeaders(sessionCookie, csrfCookie),
    sessionCookie,
    csrfCookie,
    csrfToken
  };
}

function minimalRequest(email) {
  return {
    businessName: 'Secure Flow Site',
    businessType: 'Professional Services',
    websiteUrl: `https://${email.split('@')[0]}.example`,
    contactName: 'Secure User',
    email,
    phone: '+1-555-0900',
    targetAudience: 'Buyers',
    businessDescription: 'Auth security isolation test request.',
    goals: ['launch'],
    budget: '$5,000 - $8,000',
    timeline: '4 weeks',
    desiredPages: ['home', 'contact']
  };
}

test('canonical customer linkage is durable and idempotent for normalized email', async () => {
  const { api, manager } = createRuntime();

  const first = await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: {
      email: '  Owner@Example.COM ',
      password: 'atlas-pass-1234',
      companyName: 'Owner Example Ltd'
    }
  });

  const second = await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: {
      email: 'owner@example.com',
      password: 'atlas-pass-1234',
      companyName: 'Owner Example Ltd'
    }
  });

  assert.equal(first.httpStatus, 200);
  assert.equal(second.httpStatus, 200);
  assert.equal(second.envelope.data.alreadyRegistered, true);
  assert.equal(first.envelope.data.customerId, second.envelope.data.customerId);

  const customers = manager.missionControl.customerRegistry.listCustomers()
    .filter((item) => String(item.email).toLowerCase() === 'owner@example.com');
  assert.equal(customers.length, 1);

  const links = Array.from(manager.customerPortalManager.authManager.identityLinks.values())
    .filter((item) => item.normalizedEmail === 'owner@example.com');
  assert.equal(links.length, 1);
  assert.equal(links[0].customerId, first.envelope.data.customerId);
});

test('login success and login failure are enforced', async () => {
  const { api } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'login-flow@example.com', password: 'atlas-pass-1234' }
  });

  const success = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'login-flow@example.com', password: 'atlas-pass-1234' }
  });

  const failure = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'login-flow@example.com', password: 'atlas-pass-bad' }
  });

  assert.equal(success.httpStatus, 200);
  assert.equal(typeof success.envelope.data.sessionToken, 'string');
  assert.equal(failure.httpStatus, 401);
});

test('suspended, disabled, and archived-equivalent customers are denied sessions', async () => {
  const { api, manager } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'status-check@example.com', password: 'atlas-pass-1234', companyName: 'Status Co' }
  });

  const customer = manager.missionControl.customerRegistry.listCustomers()
    .find((item) => item.email === 'status-check@example.com');
  assert.ok(customer);

  for (const status of [CustomerStatuses.SUSPENDED, CustomerStatuses.DISABLED, CustomerStatuses.BLOCKED]) {
    manager.missionControl.customerRegistry.updateCustomer(customer.customerId, { status });
    const denied = await callApi(api, {
      path: '/api/v1/customer/login',
      method: 'POST',
      body: { email: 'status-check@example.com', password: 'atlas-pass-1234' }
    });
    assert.equal(denied.httpStatus, 403);
  }
});

test('session refresh rotates token and old token fails closed', async () => {
  const { api } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'rotation@example.com', password: 'atlas-pass-1234' }
  });

  const login = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'rotation@example.com', password: 'atlas-pass-1234' }
  });

  const firstToken = login.envelope.data.sessionToken;
  const refreshed = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    sessionToken: firstToken
  });

  const oldTokenCurrent = await callApi(api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    sessionToken: firstToken
  });

  const newTokenCurrent = await callApi(api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    sessionToken: refreshed.envelope.data.sessionToken
  });

  assert.equal(refreshed.httpStatus, 200);
  assert.equal(oldTokenCurrent.httpStatus, 401);
  assert.equal(newTokenCurrent.httpStatus, 200);
});

test('logout and revoke-all invalidate active sessions', async () => {
  const { api } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'revoke@example.com', password: 'atlas-pass-1234' }
  });

  const loginA = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'revoke@example.com', password: 'atlas-pass-1234' }
  });

  const loginB = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'revoke@example.com', password: 'atlas-pass-1234' }
  });

  const logout = await callApi(api, {
    path: '/api/v1/customer/logout',
    method: 'POST',
    sessionToken: loginA.envelope.data.sessionToken
  });

  const afterLogout = await callApi(api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    sessionToken: loginA.envelope.data.sessionToken
  });

  const revokeAll = await callApi(api, {
    path: '/api/v1/customer/sessions/revoke-all',
    method: 'POST',
    sessionToken: loginB.envelope.data.sessionToken
  });

  const afterRevokeAll = await callApi(api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    sessionToken: loginB.envelope.data.sessionToken
  });

  assert.equal(logout.httpStatus, 200);
  assert.equal(afterLogout.httpStatus, 401);
  assert.equal(revokeAll.httpStatus, 200);
  assert.equal(afterRevokeAll.httpStatus, 401);
});

test('password reset request is privacy-preserving and reset is single-use with session revocation', async () => {
  await withEnv({ ATLAS_LOCAL_IDENTITY_EXPOSE_RESET_TOKEN: 'false' }, async () => {
    const { api } = createRuntime();
    await callApi(api, {
      path: '/api/v1/customer/register',
      method: 'POST',
      body: { email: 'privacy-reset@example.com', password: 'atlas-pass-1234' }
    });

    const existing = await callApi(api, {
      path: '/api/v1/customer/password-reset/request',
      method: 'POST',
      body: { email: 'privacy-reset@example.com' }
    });

    const missing = await callApi(api, {
      path: '/api/v1/customer/password-reset/request',
      method: 'POST',
      body: { email: 'missing-user@example.com' }
    });

    assert.equal(existing.httpStatus, 200);
    assert.equal(missing.httpStatus, 200);
    assert.equal(existing.envelope.data.accepted, true);
    assert.equal(missing.envelope.data.accepted, true);
    assert.equal(existing.envelope.data.developmentResetToken, null);
    assert.equal(missing.envelope.data.developmentResetToken, null);
  });

  await withEnv({ ATLAS_LOCAL_IDENTITY_EXPOSE_RESET_TOKEN: 'true' }, async () => {
    const { api, manager } = createRuntime();

    await callApi(api, {
      path: '/api/v1/customer/register',
      method: 'POST',
      body: { email: 'reset-complete@example.com', password: 'atlas-pass-1234' }
    });

    const login = await callApi(api, {
      path: '/api/v1/customer/login',
      method: 'POST',
      body: { email: 'reset-complete@example.com', password: 'atlas-pass-1234' }
    });

    const resetRequest = await callApi(api, {
      path: '/api/v1/customer/password-reset/request',
      method: 'POST',
      body: { email: 'reset-complete@example.com' }
    });

    const resetToken = resetRequest.envelope.data.developmentResetToken;
    assert.equal(typeof resetToken, 'string');

    const complete = await callApi(api, {
      path: '/api/v1/customer/password-reset/complete',
      method: 'POST',
      body: { token: resetToken, newPassword: 'atlas-pass-5678' }
    });

    const afterResetSession = await callApi(api, {
      path: '/api/v1/customer/session',
      method: 'GET',
      sessionToken: login.envelope.data.sessionToken
    });

    const replay = await callApi(api, {
      path: '/api/v1/customer/password-reset/complete',
      method: 'POST',
      body: { token: resetToken, newPassword: 'atlas-pass-9101' }
    });

    assert.equal(complete.httpStatus, 200);
    assert.equal(afterResetSession.httpStatus, 401);
    assert.equal(replay.httpStatus, 400);

    const secondResetRequest = await callApi(api, {
      path: '/api/v1/customer/password-reset/request',
      method: 'POST',
      body: { email: 'reset-complete@example.com' }
    });
    const secondResetToken = secondResetRequest.envelope.data.developmentResetToken;
    assert.equal(typeof secondResetToken, 'string');

    const provider = manager.customerPortalManager.authManager.identityProvider;
    const resetRecordEntry = Array.from(provider.resetTokens.entries())
      .find(([, value]) => value.email === 'reset-complete@example.com' && value.used === false);
    assert.ok(resetRecordEntry);
    const [tokenHash, resetRecord] = resetRecordEntry;
    const expiredRecord = { ...resetRecord, expiresAt: new Date(Date.now() - 60_000).toISOString() };
    provider.resetTokens.set(tokenHash, expiredRecord);

    const expiredComplete = await callApi(api, {
      path: '/api/v1/customer/password-reset/complete',
      method: 'POST',
      body: { token: secondResetToken, newPassword: 'atlas-pass-7777' }
    });

    assert.equal(expiredComplete.httpStatus, 400);
  });
});

test('customer data is isolated by authenticated customer context', async () => {
  const { api } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'isolation-a@example.com', password: 'atlas-pass-1234' }
  });
  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'isolation-b@example.com', password: 'atlas-pass-1234' }
  });

  const loginA = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'isolation-a@example.com', password: 'atlas-pass-1234' }
  });

  const loginB = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'isolation-b@example.com', password: 'atlas-pass-1234' }
  });

  const createA = await callApi(api, {
    path: '/api/v1/customer/request',
    method: 'POST',
    sessionToken: loginA.envelope.data.sessionToken,
    body: minimalRequest('isolation-a@example.com')
  });

  const projectIdA = createA.envelope.data.missionId;

  const accessByB = await callApi(api, {
    path: `/api/v1/customer/project/${projectIdA}`,
    method: 'GET',
    sessionToken: loginB.envelope.data.sessionToken
  });

  assert.notEqual(accessByB.httpStatus, 200);
});

test('customer tokens cannot access executive endpoints and malformed customer tokens fail closed', async () => {
  const { api } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'boundary@example.com', password: 'atlas-pass-1234' }
  });

  const login = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'boundary@example.com', password: 'atlas-pass-1234' }
  });

  const executiveRoute = await callApi(api, {
    path: '/api/v1/dashboard',
    method: 'GET',
    token: login.envelope.data.sessionToken
  });

  const malformed = await callApi(api, {
    path: '/api/v1/customer/projects',
    method: 'GET',
    sessionToken: 'bad-token-without-dot'
  });

  const serviceWithoutCustomerContext = await callApi(api, {
    path: '/api/v1/customer/projects',
    method: 'GET',
    token: 'token-ceo'
  });

  assert.equal(executiveRoute.httpStatus, 401);
  assert.equal(malformed.httpStatus, 401);
  assert.notEqual(serviceWithoutCustomerContext.httpStatus, 200);
});

test('public auth endpoints are rate limited and audited', async () => {
  const { api } = createRuntime({
    rateLimiter: new ExecutiveDashboardApiRateLimiter({ requestsPerWindow: 1, windowMs: 60_000 })
  });

  const first = await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'limit-1@example.com', password: 'atlas-pass-1234' },
    clientId: 'rate-limit-client'
  });

  const second = await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'limit-2@example.com', password: 'atlas-pass-1234' },
    clientId: 'rate-limit-client'
  });

  assert.equal(first.httpStatus, 200);
  assert.equal(second.httpStatus, 429);
  assert.equal(api.auditLog.listEvents().length >= 2, true);
});

test('auth telemetry is projected through dashboard architecture', async () => {
  const { api, manager } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'telemetry@example.com', password: 'atlas-pass-1234' }
  });

  await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'telemetry@example.com', password: 'atlas-pass-1234' }
  });

  await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'telemetry@example.com', password: 'atlas-pass-bad' }
  });

  const snapshot = manager.buildSnapshot();
  assert.ok(snapshot.websiteBusinessLaunch.authentication);
  assert.equal(snapshot.websiteBusinessLaunch.authentication.authCounters.loginSuccessful >= 1, true);
  assert.equal(snapshot.websiteBusinessLaunch.authentication.authCounters.loginFailed >= 1, true);
});

test('payment checkout and customer payment history remain customer-scoped', async () => {
  const { api, manager } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'payments-a@example.com', password: 'atlas-pass-1234' }
  });
  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'payments-b@example.com', password: 'atlas-pass-1234' }
  });

  const loginA = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'payments-a@example.com', password: 'atlas-pass-1234' }
  });
  const loginB = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'payments-b@example.com', password: 'atlas-pass-1234' }
  });

  const missionA = manager.missionControl.missionRegistry.createMission({
    customerId: loginA.envelope.data.customerId,
    missionType: 'WEBSITE_BUILD',
    assignedWorkforce: ['WEBSITE_DIVISION'],
    executiveStatus: MissionExecutiveStatuses.ACTIVE,
    currentStage: 'PAYMENT_GATE_READY',
    progress: 2
  });
  const missionIdA = missionA.missionId;

  const checkoutA = await callApi(api, {
    path: '/api/v1/customer/payments/checkout',
    method: 'POST',
    sessionToken: loginA.envelope.data.sessionToken,
    body: {
      missionId: missionIdA,
      amount: 2499.99,
      currency: 'USD',
      description: 'Initial strategy payment'
    }
  });

  const historyA = await callApi(api, {
    path: '/api/v1/customer/payments/history',
    method: 'GET',
    sessionToken: loginA.envelope.data.sessionToken
  });

  const historyB = await callApi(api, {
    path: '/api/v1/customer/payments/history',
    method: 'GET',
    sessionToken: loginB.envelope.data.sessionToken
  });

  const forbiddenCheckoutByB = await callApi(api, {
    path: '/api/v1/customer/payments/checkout',
    method: 'POST',
    sessionToken: loginB.envelope.data.sessionToken,
    body: {
      missionId: missionIdA,
      amount: 10,
      currency: 'USD'
    }
  });

  assert.equal(checkoutA.httpStatus, 200);
  assert.equal(historyA.httpStatus, 200);
  assert.equal(historyA.envelope.data.payments.length, 1);
  assert.equal(historyA.envelope.data.payments[0].missionId, missionIdA);
  assert.equal(historyA.envelope.data.payments[0].status, 'CHECKOUT_PENDING');
  assert.equal(historyB.httpStatus, 200);
  assert.equal(historyB.envelope.data.payments.length, 0);
  assert.equal(forbiddenCheckoutByB.httpStatus, 403);
});

test('stripe webhook processing is idempotent and activates mission lifecycle on success', async () => {
  const { api, manager } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'payments-webhook@example.com', password: 'atlas-pass-1234' }
  });

  const login = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'payments-webhook@example.com', password: 'atlas-pass-1234' }
  });

  const mission = manager.missionControl.missionRegistry.createMission({
    customerId: login.envelope.data.customerId,
    missionType: 'WEBSITE_BUILD',
    assignedWorkforce: ['WEBSITE_DIVISION'],
    executiveStatus: MissionExecutiveStatuses.ACTIVE,
    currentStage: 'PAYMENT_GATE_READY',
    progress: 2
  });
  const missionId = mission.missionId;

  const checkout = await callApi(api, {
    path: '/api/v1/customer/payments/checkout',
    method: 'POST',
    sessionToken: login.envelope.data.sessionToken,
    body: {
      missionId,
      amount: 1250,
      currency: 'USD'
    }
  });

  const payment = checkout.envelope.data.payment;
  const webhookBody = {
    id: 'evt_phase1_success_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: payment.providerCheckoutSessionId,
        payment_intent: payment.providerPaymentId,
        metadata: {
          paymentId: payment.paymentId,
          missionId,
          customerId: payment.customerId
        }
      }
    }
  };

  const webhookFirst = await callApi(api, {
    path: '/api/v1/payments/webhook/stripe',
    method: 'POST',
    token: 'token-ceo',
    body: webhookBody
  });
  const webhookDuplicate = await callApi(api, {
    path: '/api/v1/payments/webhook/stripe',
    method: 'POST',
    token: 'token-ceo',
    body: webhookBody
  });

  const updatedMission = manager.missionControl.missionRegistry.getMissionById(missionId);

  assert.equal(webhookFirst.httpStatus, 200);
  assert.equal(webhookFirst.envelope.data.payment.status, 'SUCCEEDED');
  assert.equal(webhookDuplicate.httpStatus, 200);
  assert.equal(webhookDuplicate.envelope.data.duplicate, true);
  assert.equal(updatedMission.paymentStatus, 'SUCCEEDED');
  assert.equal(updatedMission.currentStage, 'PAYMENT_CONFIRMED_MISSION_ACTIVE');
});

test('stripe webhook signature verification rejects unsigned payloads when secret is configured', async () => {
  await withEnv({
    ATLAS_STRIPE_WEBHOOK_SECRET: 'whsec_phase1_signature'
  }, async () => {
    const { api } = createRuntime();

    const rejected = await callApi(api, {
      path: '/api/v1/payments/webhook/stripe',
      method: 'POST',
      token: 'token-ceo',
      body: {
        id: 'evt_unsigned_1',
        type: 'checkout.session.completed',
        data: { object: {} }
      }
    });

    assert.equal(rejected.httpStatus, 401);
  });
});

test('payment telemetry is projected through dashboard architecture', async () => {
  const { api, manager } = createRuntime();

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'payments-telemetry@example.com', password: 'atlas-pass-1234' }
  });

  const login = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'payments-telemetry@example.com', password: 'atlas-pass-1234' }
  });

  const mission = manager.missionControl.missionRegistry.createMission({
    customerId: login.envelope.data.customerId,
    missionType: 'WEBSITE_BUILD',
    assignedWorkforce: ['WEBSITE_DIVISION'],
    executiveStatus: MissionExecutiveStatuses.ACTIVE,
    currentStage: 'PAYMENT_GATE_READY',
    progress: 2
  });

  await callApi(api, {
    path: '/api/v1/customer/payments/checkout',
    method: 'POST',
    sessionToken: login.envelope.data.sessionToken,
    body: {
      missionId: mission.missionId,
      amount: 999,
      currency: 'USD'
    }
  });

  const snapshot = manager.buildSnapshot();
  assert.ok(snapshot.websiteBusinessLaunch.payments);
  assert.equal(snapshot.websiteBusinessLaunch.payments.counters.checkoutCreated >= 1, true);
  assert.equal(snapshot.websiteBusinessLaunch.payments.payments.total >= 1, true);
});

test('provider misconfiguration fails safely when OIDC adapter is selected', async () => {
  await withEnv({
    ATLAS_IDENTITY_PROVIDER: 'oidc',
    ATLAS_IDENTITY_OIDC_EXPERIMENTAL_ENABLE: 'false'
  }, async () => {
    const { api } = createRuntime();
    const register = await callApi(api, {
      path: '/api/v1/customer/register',
      method: 'POST',
      body: { email: 'oidc-blocked@example.com', password: 'atlas-pass-1234' }
    });

    assert.equal(register.httpStatus, 503);
  });
});

test('session persistence and startup recovery restore valid sessions and reject expired sessions', async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'atlas-auth-session-')), 'atlas-auth.sqlite');

  const providerA = new SQLiteStorageProvider({ databasePath });
  providerA.initializeSync();
  const runtimeA = createRuntime({ storageProvider: providerA });

  await callApi(runtimeA.api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'restart@example.com', password: 'atlas-pass-1234' }
  });

  const login = await callApi(runtimeA.api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'restart@example.com', password: 'atlas-pass-1234' }
  });

  const validToken = login.envelope.data.sessionToken;
  const sessionId = login.envelope.data.sessionId;

  providerA.closeSync();

  const providerB = new SQLiteStorageProvider({ databasePath });
  providerB.initializeSync();
  const runtimeB = createRuntime({ storageProvider: providerB });

  const afterRestart = await callApi(runtimeB.api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    sessionToken: validToken
  });

  assert.equal(afterRestart.httpStatus, 200);

  const expiredRecord = {
    ...runtimeB.manager.customerPortalManager.authManager.sessionManager.sessions.get(sessionId),
    status: 'ACTIVE',
    idleExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() - 60_000).toISOString()
  };

  providerB.setMetaSync('executive.customer-auth.sessions.records', sessionId, expiredRecord);
  providerB.closeSync();

  const providerC = new SQLiteStorageProvider({ databasePath });
  providerC.initializeSync();
  const runtimeC = createRuntime({ storageProvider: providerC });

  const expiredAfterRestart = await callApi(runtimeC.api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    sessionToken: validToken
  });

  assert.equal(expiredAfterRestart.httpStatus, 401);
  assert.equal(runtimeC.manager.customerPortalManager.authManager.getAuthHealth().sessions.expired >= 1, true);
});

function createCookieRuntime({ storageProvider = null, envOverrides = {} } = {}) {
  const missionControl = new CustomerIntakeMissionControl({ storageProvider });
  const planning = new ExecutivePlanningSystem({ missionControl, storageProvider });
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    customerPortalManager: new CustomerPortalManager({
      missionControl,
      executivePlanningSystem: planning,
      workforceDirector: missionControl.workforceDirector,
      storageProvider
    }),
    storageProvider
  });

  const dashboard = new ExecutiveOperationsDashboard({ manager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE: 'secure_cookie',
      ATLAS_CUSTOMER_SESSION_COOKIE_NAME: 'atlas_customer_session',
      ATLAS_CUSTOMER_SESSION_COOKIE_PATH: '/api/v1/customer',
      ATLAS_CUSTOMER_SESSION_COOKIE_SAMESITE: 'Lax',
      ATLAS_CUSTOMER_SESSION_COOKIE_SECURE: 'true',
      ATLAS_CUSTOMER_SESSION_COOKIE_HTTP_ONLY: 'true',
      ATLAS_CUSTOMER_TRUSTED_ORIGINS: 'https://portal.atlas.example',
      ATLAS_CUSTOMER_ENFORCE_TRUSTED_ORIGIN: 'true',
      ATLAS_CUSTOMER_ALLOW_MISSING_ORIGIN: 'false',
      ATLAS_CUSTOMER_CSRF_PROTECTION_ENABLED: 'true',
      ATLAS_CUSTOMER_CSRF_COOKIE_NAME: 'atlas_customer_csrf',
      ATLAS_CUSTOMER_CSRF_HEADER_NAME: 'x-atlas-csrf-token',
      ATLAS_CUSTOMER_CSRF_COOKIE_SAMESITE: 'Lax',
      ATLAS_CUSTOMER_CSRF_COOKIE_SECURE: 'true',
      ATLAS_CUSTOMER_CSRF_COOKIE_PATH: '/api/v1/customer',
      ...envOverrides
    },
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'token-customer',
      ATLAS_DASHBOARD_API_TOKEN_CEO: 'token-ceo',
      ATLAS_DASHBOARD_API_TOKEN: 'token-ceo'
    } })
  });

  return { api, manager };
}

test('secure cookie transport sets HttpOnly Secure cookie and hides raw token in production responses', async () => {
  const { api } = createCookieRuntime();
  const origin = 'https://portal.atlas.example';

  const login = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'cookie-login@example.com', password: 'atlas-pass-1234' },
    origin
  });

  if (login.httpStatus !== 200) {
    await callApi(api, {
      path: '/api/v1/customer/register',
      method: 'POST',
      body: { email: 'cookie-login@example.com', password: 'atlas-pass-1234' },
      origin
    });
  }

  const secondLogin = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'cookie-login@example.com', password: 'atlas-pass-1234' },
    origin
  });

  const setCookie = toSetCookieArray(secondLogin.responseHeaders?.['set-cookie']).join('; ');
  assert.equal(secondLogin.httpStatus, 200);
  assert.equal(typeof secondLogin.envelope.data.sessionToken, 'undefined');
  assert.equal(typeof secondLogin.envelope.data.csrfToken, 'undefined');
  assert.equal(setCookie.includes('HttpOnly'), true);
  assert.equal(setCookie.includes('Secure'), true);
  assert.equal(setCookie.includes('SameSite=Lax'), true);
  assert.equal(setCookie.includes('Path=/api/v1/customer'), true);
  assert.equal(setCookie.includes('Expires='), true);
});

test('registration sets cookie when registration creates authenticated session', async () => {
  const { api } = createCookieRuntime();
  const origin = 'https://portal.atlas.example';

  const register = await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: {
      email: 'cookie-register@example.com',
      password: 'atlas-pass-1234',
      companyName: 'Cookie Register Co'
    },
    origin
  });

  assert.equal(register.httpStatus, 200);
  assert.equal(typeof register.envelope.data.sessionToken, 'undefined');
  assert.equal(toSetCookieArray(register.responseHeaders?.['set-cookie']).length >= 2, true);
});

test('trusted origin accepted and untrusted or malformed origins are rejected for protected customer mutations', async () => {
  const { api } = createCookieRuntime();
  const session = await loginCookieSession(api, 'origin-policy@example.com');

  const trusted = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: session.cookie,
    csrfToken: session.csrfToken,
    origin: 'https://portal.atlas.example'
  });
  assert.equal(trusted.httpStatus, 200);

  const untrusted = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: session.cookie,
    csrfToken: session.csrfToken,
    origin: 'https://evil.example'
  });
  assert.equal(untrusted.httpStatus, 403);

  const malformed = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: session.cookie,
    csrfToken: session.csrfToken,
    origin: 'not-an-origin'
  });
  assert.equal(malformed.httpStatus, 403);
});

test('production rejects missing Origin for protected browser mutations and development can allow explicit override', async () => {
  const { api } = createCookieRuntime();
  const session = await loginCookieSession(api, 'missing-origin@example.com');

  const missingOriginRejected = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: session.cookie,
    csrfToken: session.csrfToken
  });
  assert.equal(missingOriginRejected.httpStatus, 403);

  const missionControl = new CustomerIntakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    customerPortalManager: new CustomerPortalManager({
      missionControl,
      executivePlanningSystem: planning,
      workforceDirector: missionControl.workforceDirector
    })
  });
  const dashboard = new ExecutiveOperationsDashboard({ manager });
  const devApi = new ExecutiveDashboardApiService({
    dashboard,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE: 'secure_cookie',
      ATLAS_CUSTOMER_SESSION_COOKIE_SECURE: 'true',
      ATLAS_CUSTOMER_SESSION_COOKIE_HTTP_ONLY: 'true',
      ATLAS_CUSTOMER_TRUSTED_ORIGINS: 'https://portal.atlas.example',
      ATLAS_CUSTOMER_ENFORCE_TRUSTED_ORIGIN: 'true',
      ATLAS_CUSTOMER_ALLOW_MISSING_ORIGIN: 'true',
      ATLAS_CUSTOMER_CSRF_PROTECTION_ENABLED: 'true',
      ATLAS_CUSTOMER_CSRF_COOKIE_SECURE: 'true'
    },
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'token-customer',
      ATLAS_DASHBOARD_API_TOKEN: 'token-ceo'
    } })
  });

  const devSession = await loginCookieSession(devApi, 'missing-origin-dev@example.com');
  const allowed = await callApi(devApi, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: devSession.cookie,
    csrfToken: devSession.csrfToken
  });

  assert.equal(allowed.httpStatus, 200);
});

test('wildcard trusted origin configuration is rejected in production secure-cookie mode', async () => {
  const { api } = createCookieRuntime({
    envOverrides: {
      ATLAS_CUSTOMER_TRUSTED_ORIGINS: '*'
    }
  });

  const rejected = await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    origin: 'https://portal.atlas.example',
    body: { email: 'wildcard-origin@example.com', password: 'atlas-pass-1234' }
  });

  assert.equal(rejected.httpStatus, 503);
});

test('protected customer mutations require matching CSRF cookie and header tokens', async () => {
  const { api } = createCookieRuntime();
  const session = await loginCookieSession(api, 'csrf-checks@example.com');

  const missingHeader = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: session.cookie,
    origin: 'https://portal.atlas.example'
  });
  assert.equal(missingHeader.httpStatus, 403);

  const missingCookie = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: session.sessionCookie,
    csrfToken: session.csrfToken,
    origin: 'https://portal.atlas.example'
  });
  assert.equal(missingCookie.httpStatus, 403);

  const mismatch = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: session.cookie,
    csrfToken: 'A'.repeat(43),
    origin: 'https://portal.atlas.example'
  });
  assert.equal(mismatch.httpStatus, 403);

  const malformed = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: session.cookie,
    csrfToken: 'bad-token',
    origin: 'https://portal.atlas.example'
  });
  assert.equal(malformed.httpStatus, 403);

  const freshSession = await loginCookieSession(api, 'csrf-checks-fresh@example.com');
  const ok = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: freshSession.cookie,
    csrfToken: freshSession.csrfToken,
    origin: 'https://portal.atlas.example'
  });
  assert.equal(ok.httpStatus, 200);
});

test('protected request denials do not execute business actions and produce non-secret telemetry counters', async () => {
  const { api, manager } = createCookieRuntime();
  const session = await loginCookieSession(api, 'protected-denial@example.com');

  const missionCountBefore = manager.missionControl.missionRegistry.listMissions().length;
  const denied = await callApi(api, {
    path: '/api/v1/customer/request',
    method: 'POST',
    cookie: session.cookie,
    origin: 'https://portal.atlas.example',
    body: minimalRequest('protected-denial@example.com')
  });
  const missionCountAfter = manager.missionControl.missionRegistry.listMissions().length;

  assert.equal(denied.httpStatus, 403);
  assert.equal(missionCountAfter, missionCountBefore);

  const authCounters = manager.customerPortalManager.authManager.getAuthHealth().authCounters;
  assert.equal(authCounters.protectedRequestDenied >= 1, true);
  assert.equal(authCounters.csrfMissing >= 1, true);

  const auditPayload = JSON.stringify(api.auditLog.listEvents());
  assert.equal(auditPayload.includes('atlas_customer_session'), false);
  assert.equal(auditPayload.includes('x-atlas-csrf-token'), false);
  assert.equal(auditPayload.includes('atlas-pass-1234'), false);
});

test('revision and checkout mutations are protected while read-only customer routes remain functional', async () => {
  const { api, manager } = createCookieRuntime();
  const session = await loginCookieSession(api, 'mutation-protection@example.com');

  const created = await callApi(api, {
    path: '/api/v1/customer/request',
    method: 'POST',
    cookie: session.cookie,
    csrfToken: session.csrfToken,
    origin: 'https://portal.atlas.example',
    body: minimalRequest('mutation-protection@example.com')
  });
  assert.equal(created.httpStatus, 200);

  const revisionDenied = await callApi(api, {
    path: '/api/v1/customer/revision',
    method: 'POST',
    cookie: session.cookie,
    origin: 'https://portal.atlas.example',
    body: {
      missionId: created.envelope.data.missionId,
      reason: 'Need copy update'
    }
  });
  assert.equal(revisionDenied.httpStatus, 403);

  const mission = manager.missionControl.missionRegistry.createMission({
    customerId: session.login.envelope.data.customerId,
    missionType: 'WEBSITE_BUILD',
    assignedWorkforce: ['WEBSITE_DIVISION'],
    executiveStatus: MissionExecutiveStatuses.ACTIVE,
    currentStage: 'PAYMENT_GATE_READY',
    progress: 2
  });

  const checkoutDenied = await callApi(api, {
    path: '/api/v1/customer/payments/checkout',
    method: 'POST',
    cookie: session.cookie,
    origin: 'https://portal.atlas.example',
    body: {
      missionId: mission.missionId,
      amount: 50,
      currency: 'USD'
    }
  });
  assert.equal(checkoutDenied.httpStatus, 403);

  const projectsReadOnly = await callApi(api, {
    path: '/api/v1/customer/projects',
    method: 'GET',
    cookie: session.cookie
  });
  assert.equal(projectsReadOnly.httpStatus, 200);
});

test('current-session, rotation, logout, and revoke-all operate via cookie transport', async () => {
  const { api } = createCookieRuntime();
  const origin = 'https://portal.atlas.example';

  const login = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'cookie-flow@example.com', password: 'atlas-pass-1234' },
    origin
  });

  if (login.httpStatus !== 200) {
    await callApi(api, {
      path: '/api/v1/customer/register',
      method: 'POST',
      body: { email: 'cookie-flow@example.com', password: 'atlas-pass-1234' },
      origin
    });
  }

  const authenticated = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'cookie-flow@example.com', password: 'atlas-pass-1234' },
    origin
  });
  const firstSessionCookie = cookieHeaderFromSetCookie(authenticated.responseHeaders?.['set-cookie'], 'atlas_customer_session');
  const firstCsrfCookie = cookieHeaderFromSetCookie(authenticated.responseHeaders?.['set-cookie'], 'atlas_customer_csrf');
  const firstCookie = mergeCookieHeaders(firstSessionCookie, firstCsrfCookie);
  const firstCsrfToken = csrfTokenFromCookieHeader(firstCsrfCookie);

  const current = await callApi(api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    cookie: firstCookie
  });
  assert.equal(current.httpStatus, 200);

  const refreshed = await callApi(api, {
    path: '/api/v1/customer/session/refresh',
    method: 'POST',
    cookie: firstCookie,
    csrfToken: firstCsrfToken,
    origin
  });
  const refreshedSessionCookie = cookieHeaderFromSetCookie(refreshed.responseHeaders?.['set-cookie'], 'atlas_customer_session');
  const refreshedCsrfCookie = cookieHeaderFromSetCookie(refreshed.responseHeaders?.['set-cookie'], 'atlas_customer_csrf');
  const refreshedCookie = mergeCookieHeaders(refreshedSessionCookie, refreshedCsrfCookie);
  const refreshedCsrfToken = csrfTokenFromCookieHeader(refreshedCsrfCookie);
  assert.equal(refreshed.httpStatus, 200);
  assert.notEqual(refreshedSessionCookie, firstSessionCookie);

  const stale = await callApi(api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    cookie: firstCookie
  });
  assert.equal(stale.httpStatus, 401);

  const afterRotation = await callApi(api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    cookie: refreshedCookie
  });
  assert.equal(afterRotation.httpStatus, 200);

  const revokeAll = await callApi(api, {
    path: '/api/v1/customer/sessions/revoke-all',
    method: 'POST',
    cookie: refreshedCookie,
    csrfToken: refreshedCsrfToken,
    origin
  });
  assert.equal(revokeAll.httpStatus, 200);
  assert.equal(toSetCookieArray(revokeAll.responseHeaders?.['set-cookie']).join('; ').includes('Max-Age=0'), true);

  const revokedSession = await callApi(api, {
    path: '/api/v1/customer/session',
    method: 'GET',
    cookie: refreshedCookie
  });
  assert.equal(revokedSession.httpStatus, 401);

  const relogin = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'cookie-flow@example.com', password: 'atlas-pass-1234' },
    origin
  });
  const activeSessionCookie = cookieHeaderFromSetCookie(relogin.responseHeaders?.['set-cookie'], 'atlas_customer_session');
  const activeCsrfCookie = cookieHeaderFromSetCookie(relogin.responseHeaders?.['set-cookie'], 'atlas_customer_csrf');
  const activeCookie = mergeCookieHeaders(activeSessionCookie, activeCsrfCookie);
  const activeCsrfToken = csrfTokenFromCookieHeader(activeCsrfCookie);
  const logout = await callApi(api, {
    path: '/api/v1/customer/logout',
    method: 'POST',
    cookie: activeCookie,
    csrfToken: activeCsrfToken,
    origin
  });

  assert.equal(logout.httpStatus, 200);
  assert.equal(toSetCookieArray(logout.responseHeaders?.['set-cookie']).join('; ').includes('Max-Age=0'), true);
});

test('secure cookie cannot authorize executive routes and payment checkout works with cookie auth', async () => {
  const { api, manager } = createCookieRuntime();
  const origin = 'https://portal.atlas.example';

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'cookie-payments@example.com', password: 'atlas-pass-1234' },
    origin
  });

  const login = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'cookie-payments@example.com', password: 'atlas-pass-1234' },
    origin
  });
  const sessionCookie = cookieHeaderFromSetCookie(login.responseHeaders?.['set-cookie'], 'atlas_customer_session');
  const csrfCookie = cookieHeaderFromSetCookie(login.responseHeaders?.['set-cookie'], 'atlas_customer_csrf');
  const cookie = mergeCookieHeaders(sessionCookie, csrfCookie);
  const csrfToken = csrfTokenFromCookieHeader(csrfCookie);

  const executive = await callApi(api, {
    path: '/api/v1/dashboard',
    method: 'GET',
    cookie
  });
  assert.equal(executive.httpStatus, 401);

  const mission = manager.missionControl.missionRegistry.createMission({
    customerId: login.envelope.data.customerId,
    missionType: 'WEBSITE_BUILD',
    assignedWorkforce: ['WEBSITE_DIVISION'],
    executiveStatus: MissionExecutiveStatuses.ACTIVE,
    currentStage: 'PAYMENT_GATE_READY',
    progress: 2
  });

  const checkout = await callApi(api, {
    path: '/api/v1/customer/payments/checkout',
    method: 'POST',
    cookie,
    csrfToken,
    origin,
    body: {
      missionId: mission.missionId,
      amount: 199,
      currency: 'USD'
    }
  });

  assert.equal(checkout.httpStatus, 200);
});

test('production rejects development token transport and development mode requires explicit enablement', async () => {
  const { api: productionApi } = createCookieRuntime({
    envOverrides: {
      ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE: 'development_token',
      ATLAS_CUSTOMER_AUTH_ALLOW_DEVELOPMENT_TOKEN_TRANSPORT: 'true'
    }
  });

  const productionRejected = await callApi(productionApi, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'prod-reject@example.com', password: 'atlas-pass-1234' }
  });

  assert.equal(productionRejected.httpStatus, 503);

  const missionControl = new CustomerIntakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    customerPortalManager: new CustomerPortalManager({
      missionControl,
      executivePlanningSystem: planning,
      workforceDirector: missionControl.workforceDirector
    })
  });
  const dashboard = new ExecutiveOperationsDashboard({ manager });

  const developmentApiDisabled = new ExecutiveDashboardApiService({
    dashboard,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE: 'development_token',
      ATLAS_CUSTOMER_AUTH_ALLOW_DEVELOPMENT_TOKEN_TRANSPORT: 'false'
    },
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'token-customer',
      ATLAS_DASHBOARD_API_TOKEN: 'token-ceo'
    } })
  });

  const disabled = await callApi(developmentApiDisabled, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'dev-disabled@example.com', password: 'atlas-pass-1234' }
  });
  assert.equal(disabled.httpStatus, 503);

  const developmentApiEnabled = new ExecutiveDashboardApiService({
    dashboard,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE: 'development_token',
      ATLAS_CUSTOMER_AUTH_ALLOW_DEVELOPMENT_TOKEN_TRANSPORT: 'true'
    },
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'token-customer',
      ATLAS_DASHBOARD_API_TOKEN: 'token-ceo'
    } })
  });

  await callApi(developmentApiEnabled, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'dev-enabled@example.com', password: 'atlas-pass-1234' }
  });
  const enabledLogin = await callApi(developmentApiEnabled, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'dev-enabled@example.com', password: 'atlas-pass-1234' }
  });

  assert.equal(enabledLogin.httpStatus, 200);
  assert.equal(typeof enabledLogin.envelope.data.sessionToken, 'string');
});

test('stripe webhook authentication remains independent of browser cookies', async () => {
  const { api, manager } = createCookieRuntime();
  const origin = 'https://portal.atlas.example';

  await callApi(api, {
    path: '/api/v1/customer/register',
    method: 'POST',
    body: { email: 'cookie-webhook@example.com', password: 'atlas-pass-1234' },
    origin
  });

  const login = await callApi(api, {
    path: '/api/v1/customer/login',
    method: 'POST',
    body: { email: 'cookie-webhook@example.com', password: 'atlas-pass-1234' },
    origin
  });
  const sessionCookie = cookieHeaderFromSetCookie(login.responseHeaders?.['set-cookie'], 'atlas_customer_session');
  const csrfCookie = cookieHeaderFromSetCookie(login.responseHeaders?.['set-cookie'], 'atlas_customer_csrf');
  const cookie = mergeCookieHeaders(sessionCookie, csrfCookie);
  const csrfToken = csrfTokenFromCookieHeader(csrfCookie);

  const mission = manager.missionControl.missionRegistry.createMission({
    customerId: login.envelope.data.customerId,
    missionType: 'WEBSITE_BUILD',
    assignedWorkforce: ['WEBSITE_DIVISION'],
    executiveStatus: MissionExecutiveStatuses.ACTIVE,
    currentStage: 'PAYMENT_GATE_READY',
    progress: 2
  });

  const checkout = await callApi(api, {
    path: '/api/v1/customer/payments/checkout',
    method: 'POST',
    cookie,
    csrfToken,
    origin,
    body: {
      missionId: mission.missionId,
      amount: 500,
      currency: 'USD'
    }
  });

  const payment = checkout.envelope.data.payment;
  const webhookBody = {
    id: 'evt_cookie_webhook_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: payment.providerCheckoutSessionId,
        payment_intent: payment.providerPaymentId,
        metadata: {
          paymentId: payment.paymentId,
          missionId: mission.missionId,
          customerId: payment.customerId
        }
      }
    }
  };

  const webhook = await callApi(api, {
    path: '/api/v1/payments/webhook/stripe',
    method: 'POST',
    token: 'token-ceo',
    body: webhookBody
  });

  assert.equal(webhook.httpStatus, 200);
  assert.equal(webhook.envelope.data.payment.status, 'SUCCEEDED');
});
