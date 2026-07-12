import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WebhookProviderSimulationModes,
  validateCanonicalWebhookRequest,
  WebhookDispatchErrorCodes
} from '../src/executive/notification-webhook-provider-contracts.js';
import { LocalDevelopmentWebhookProviderAdapter } from '../src/executive/notification-webhook-provider-local.js';
import { HttpsWebhookProviderAdapter } from '../src/executive/notification-webhook-provider-https.js';
import { NotificationWebhookProviderFactory } from '../src/executive/notification-webhook-provider-factory.js';
import { NotificationWebhookSigningService } from '../src/executive/notification-webhook-signing-service.js';
import { NotificationWebhookEndpointRegistry } from '../src/executive/notification-webhook-endpoint-registry.js';

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides ?? {})) {
    previous.set(key, process.env[key]);
    if (value == null) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function canonicalRequest(overrides = {}) {
  return {
    providerRequestId: overrides.providerRequestId ?? 'wh_req_1',
    idempotencyKey: overrides.idempotencyKey ?? 'idem_wh_1',
    endpoint: overrides.endpoint ?? 'https://hooks.atlas.test/events',
    method: overrides.method ?? 'POST',
    headers: overrides.headers ?? { 'x-atlas-source': 'atlas-test' },
    body: overrides.body ?? { hello: 'world' },
    contentType: overrides.contentType ?? 'application/json',
    timeoutMs: overrides.timeoutMs ?? 2500,
    correlationId: overrides.correlationId ?? 'corr_wh_1',
    businessId: overrides.businessId ?? 'biz_1',
    customerId: overrides.customerId ?? 'cust_1',
    metadata: overrides.metadata ?? {}
  };
}

test('local adapter deterministic success', () => {
  const adapter = new LocalDevelopmentWebhookProviderAdapter();
  const request = canonicalRequest();
  const first = adapter.sendWebhook(request);
  const second = adapter.sendWebhook(request);

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(first.providerMessageId, second.providerMessageId);
  assert.equal(first.providerRequestRef, second.providerRequestRef);
});

test('local simulated timeout', () => {
  const adapter = new LocalDevelopmentWebhookProviderAdapter();
  const result = adapter.sendWebhook(canonicalRequest({ metadata: { simulationMode: WebhookProviderSimulationModes.TIMEOUT } }));
  assert.equal(result.accepted, false);
  assert.equal(result.normalizedErrorClass, 'TIMEOUT');
  assert.equal(result.retryable, true);
  assert.equal(result.outcome, 'FAILED_RETRYABLE');
});

test('local simulated rate limit', () => {
  const adapter = new LocalDevelopmentWebhookProviderAdapter();
  const result = adapter.sendWebhook(canonicalRequest({ metadata: { simulationMode: WebhookProviderSimulationModes.RATE_LIMIT } }));
  assert.equal(result.accepted, false);
  assert.equal(result.normalizedErrorClass, 'RATE_LIMITED');
  assert.equal(result.retryable, true);
});

test('local receiver rejection', () => {
  const adapter = new LocalDevelopmentWebhookProviderAdapter();
  const result = adapter.sendWebhook(canonicalRequest({ metadata: { simulationMode: WebhookProviderSimulationModes.RECEIVER_REJECTION } }));
  assert.equal(result.accepted, false);
  assert.equal(result.normalizedErrorClass, 'PROVIDER_REJECTED');
  assert.equal(result.terminal, true);
  assert.equal(result.outcome, 'FAILED_TERMINAL');
});

test('https adapter request mapping', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 202,
      headers: { get: (name) => (String(name).toLowerCase() === 'x-request-id' ? 'wh_provider_1' : null) },
      json: async () => ({ ok: true })
    };
  };

  const adapter = new HttpsWebhookProviderAdapter({ fetchImpl, config: { timeoutMs: 4000, userAgent: 'AtlasWebhookTest/1.0' } });
  await adapter.sendWebhook(canonicalRequest({ idempotencyKey: 'idem_wh_2' }));

  assert.equal(requests.length, 1);
  const sent = requests[0];
  assert.equal(sent.init.method, 'POST');
  assert.equal(sent.init.headers['Idempotency-Key'], 'idem_wh_2');
  assert.equal(sent.init.headers['User-Agent'], 'AtlasWebhookTest/1.0');
});

test('https adapter provider outage normalization', async () => {
  const adapter = new HttpsWebhookProviderAdapter({
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: async () => ({ code: 'unavailable' })
    })
  });

  const result = await adapter.sendWebhook(canonicalRequest());
  assert.equal(result.accepted, false);
  assert.equal(result.normalizedErrorClass, 'PROVIDER_UNAVAILABLE');
  assert.equal(result.retryable, true);
});

test('request validation blocks unsafe endpoints', () => {
  const validation = validateCanonicalWebhookRequest(canonicalRequest({ endpoint: 'http://localhost:8080/unsafe' }));
  assert.equal(validation.accepted, false);
  assert.equal(validation.issues.some((entry) => entry.toLowerCase().includes('https is required')), true);
});

test('request validation blocks prohibited headers', () => {
  const validation = validateCanonicalWebhookRequest(canonicalRequest({ headers: { Host: 'evil', Connection: 'keep-alive' } }));
  assert.equal(validation.accepted, false);
  assert.equal(validation.issues.some((entry) => entry.toLowerCase().includes('prohibited')), true);
});

test('signing deterministic and key version propagation', () => {
  const signing = new NotificationWebhookSigningService({
    now: () => '2025-01-01T00:00:00.000Z',
    keyVersion: 'v7',
    keyRing: { v7: 'atlas-secret-key' }
  });

  const first = signing.createSignature({
    requestId: 'attempt_1',
    method: 'POST',
    endpoint: 'https://hooks.atlas.test/events',
    body: { hello: 'world' }
  });
  const second = signing.createSignature({
    requestId: 'attempt_1',
    method: 'POST',
    endpoint: 'https://hooks.atlas.test/events',
    body: { hello: 'world' }
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(first.metadata.signatureHeader, second.metadata.signatureHeader);
  assert.equal(first.metadata.keyVersion, 'v7');
});

test('endpoint registry ownership and allowlist checks', () => {
  const registry = new NotificationWebhookEndpointRegistry({
    requireHttps: true,
    globalAllowlist: ['hooks.atlas.test'],
    approvedEndpoints: [
      { endpoint: 'https://hooks.atlas.test/events', businessId: 'biz_1', customerId: 'cust_1' }
    ]
  });

  const ok = registry.authorizeEndpoint({ endpoint: 'https://hooks.atlas.test/events', businessId: 'biz_1', customerId: 'cust_1' });
  assert.equal(ok.accepted, true);

  const denied = registry.authorizeEndpoint({ endpoint: 'https://hooks.atlas.test/events', businessId: 'biz_2', customerId: 'cust_1' });
  assert.equal(denied.accepted, false);
  assert.equal(denied.code, WebhookDispatchErrorCodes.ENDPOINT_OWNERSHIP_MISMATCH);
});

test('factory startup readiness and emergency disable', async () => {
  await withEnv({
    NODE_ENV: 'production',
    ATLAS_WEBHOOK_PROVIDER: 'https',
    ATLAS_WEBHOOK_PROVIDER_EMERGENCY_DISABLE: 'true'
  }, async () => {
    const factory = new NotificationWebhookProviderFactory({ environment: 'production' });
    const readiness = factory.validateStartup();

    assert.equal(readiness.ready, false);
    assert.equal(readiness.failStartup, true);
    assert.equal(readiness.summary, 'blocked');
  });
});
