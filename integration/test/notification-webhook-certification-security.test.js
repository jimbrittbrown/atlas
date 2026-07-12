import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  validateWebhookEndpoint,
  validateCanonicalWebhookRequest
} from '../src/executive/notification-webhook-provider-contracts.js';
import { NotificationWebhookSigningService } from '../src/executive/notification-webhook-signing-service.js';

function canonical(overrides = {}) {
  return {
    providerRequestId: overrides.providerRequestId ?? 'wh_cert_req_1',
    idempotencyKey: overrides.idempotencyKey ?? 'idem_wh_cert_1',
    endpoint: overrides.endpoint ?? 'https://hooks.atlas.test/events',
    method: overrides.method ?? 'POST',
    headers: overrides.headers ?? { 'x-atlas-source': 'atlas-cert' },
    body: overrides.body ?? { event: 'WEBSITE_PUBLISHED' },
    contentType: overrides.contentType ?? 'application/json',
    timeoutMs: overrides.timeoutMs ?? 5000,
    correlationId: overrides.correlationId ?? 'corr_wh_cert_1',
    businessId: overrides.businessId ?? 'biz_1',
    customerId: overrides.customerId ?? 'cust_1',
    metadata: overrides.metadata ?? {}
  };
}

test('blocks protocol-relative URLs', () => {
  const result = validateWebhookEndpoint('//hooks.atlas.test/events');
  assert.equal(result.accepted, false);
  assert.equal(result.issues.some((entry) => entry.toLowerCase().includes('protocol-relative')), true);
});

test('blocks URL credentials', () => {
  const result = validateWebhookEndpoint('https://user:pass@hooks.atlas.test/events');
  assert.equal(result.accepted, false);
  assert.equal(result.issues.some((entry) => entry.toLowerCase().includes('credentials')), true);
});

test('blocks localhost targets', () => {
  const result = validateWebhookEndpoint('http://localhost:8080/callback', { requireHttps: false });
  assert.equal(result.accepted, false);
  assert.equal(result.issues.some((entry) => entry.toLowerCase().includes('unsafe')), true);
});

test('blocks loopback targets', () => {
  const result = validateWebhookEndpoint('http://127.0.0.1:8080/callback', { requireHttps: false });
  assert.equal(result.accepted, false);
  assert.equal(result.issues.some((entry) => entry.toLowerCase().includes('unsafe')), true);
});

test('blocks private-network targets', () => {
  const result = validateWebhookEndpoint('http://10.10.10.10/callback', { requireHttps: false });
  assert.equal(result.accepted, false);
  assert.equal(result.issues.some((entry) => entry.toLowerCase().includes('unsafe')), true);
});

test('blocks metadata-service targets', () => {
  const byIp = validateWebhookEndpoint('http://169.254.169.254/latest/meta-data', { requireHttps: false });
  const byName = validateWebhookEndpoint('https://metadata.google.internal/computeMetadata/v1');

  assert.equal(byIp.accepted, false);
  assert.equal(byName.accepted, false);
  assert.equal(byIp.issues.some((entry) => entry.toLowerCase().includes('unsafe')), true);
  assert.equal(byName.issues.some((entry) => entry.toLowerCase().includes('unsafe')), true);
});

test('blocks DNS rebinding-risk aliases that resolve to loopback forms', () => {
  const result = validateWebhookEndpoint('https://127.0.0.1.nip.io/events');
  assert.equal(result.accepted, false);
  assert.equal(result.issues.some((entry) => entry.toLowerCase().includes('unsafe')), true);
});

test('canonical request validation blocks unsafe endpoint classes', () => {
  const request = canonical({ endpoint: 'https://127.0.0.1.nip.io/events' });
  const result = validateCanonicalWebhookRequest(request);

  assert.equal(result.accepted, false);
  assert.equal(result.issues.some((entry) => entry.toLowerCase().includes('unsafe')), true);
});

test('signature tampering is detectable by canonical recomputation', () => {
  const signing = new NotificationWebhookSigningService({
    now: () => '2026-07-12T14:00:00.000Z',
    keyVersion: 'v1',
    keyRing: { v1: 'atlas-signing-test-key' }
  });

  const signed = signing.createSignature({
    requestId: 'attempt_1',
    method: 'POST',
    endpoint: 'https://hooks.atlas.test/events',
    body: { event: 'WEBSITE_PUBLISHED' }
  });

  assert.equal(signed.accepted, true);

  const header = signed.metadata.signatureHeader;
  const signaturePart = header.split(',').find((entry) => entry.startsWith('sig='));
  const originalSig = signaturePart.slice(4);
  const tamperedSig = `${originalSig.slice(0, -1)}${originalSig.endsWith('0') ? '1' : '0'}`;

  const expectedCanonical = signing.canonicalInput({
    timestamp: signed.metadata.timestamp,
    requestId: signed.metadata.requestId,
    method: 'POST',
    endpoint: 'https://hooks.atlas.test/events',
    bodyDigestValue: signed.metadata.bodyDigest,
    keyVersion: signed.metadata.keyVersion
  });

  const expectedSig = createHmac('sha256', signing.keyRing.get(signed.metadata.keyVersion))
    .update(expectedCanonical, 'utf8')
    .digest('hex');

  assert.equal(expectedSig, originalSig);
  assert.equal(tamperedSig === expectedSig, false);
});

test('payload tampering is detectable by signature mismatch', () => {
  const signing = new NotificationWebhookSigningService({
    now: () => '2026-07-12T14:00:00.000Z',
    keyVersion: 'v1',
    keyRing: { v1: 'atlas-signing-test-key' }
  });

  const original = signing.createSignature({
    requestId: 'attempt_2',
    method: 'POST',
    endpoint: 'https://hooks.atlas.test/events',
    body: { event: 'WEBSITE_PUBLISHED', value: 1 }
  });

  const tampered = signing.createSignature({
    requestId: 'attempt_2',
    method: 'POST',
    endpoint: 'https://hooks.atlas.test/events',
    body: { event: 'WEBSITE_PUBLISHED', value: 999 }
  });

  assert.equal(original.accepted, true);
  assert.equal(tampered.accepted, true);
  assert.equal(original.metadata.signatureHeader === tampered.metadata.signatureHeader, false);
  assert.equal(original.metadata.bodyDigest === tampered.metadata.bodyDigest, false);
});
