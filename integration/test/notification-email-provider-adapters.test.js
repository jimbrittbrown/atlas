import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EmailProviderSimulationModes,
  validateCanonicalEmailRequest
} from '../src/executive/notification-email-provider-contracts.js';
import { LocalDevelopmentEmailProviderAdapter } from '../src/executive/notification-email-provider-local.js';
import { SendGridEmailProviderAdapter } from '../src/executive/notification-email-provider-sendgrid.js';
import { NotificationEmailProviderFactory } from '../src/executive/notification-email-provider-factory.js';

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
    providerRequestId: overrides.providerRequestId ?? 'email_req_1',
    idempotencyKey: overrides.idempotencyKey ?? 'idem_1',
    recipient: overrides.recipient ?? { email: 'customer@atlas.test', customerId: 'cust_1' },
    replyTo: overrides.replyTo ?? 'reply@atlas.test',
    subject: overrides.subject ?? 'Status update',
    textBody: overrides.textBody ?? 'Your order is ready.',
    htmlBody: overrides.htmlBody ?? '<p>Your order is ready.</p>',
    sender: overrides.sender ?? { email: 'sender@atlas.test', displayName: 'Atlas Ops' },
    correlationId: overrides.correlationId ?? 'corr_1',
    businessId: overrides.businessId ?? 'biz_1',
    customerId: overrides.customerId ?? 'cust_1',
    metadata: overrides.metadata ?? {}
  };
}

test('local adapter deterministic success', () => {
  const adapter = new LocalDevelopmentEmailProviderAdapter();
  const request = canonicalRequest();
  const first = adapter.sendEmail(request);
  const second = adapter.sendEmail(request);

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(first.providerMessageId, second.providerMessageId);
  assert.equal(first.providerRequestRef, second.providerRequestRef);
});

test('local simulated timeout', () => {
  const adapter = new LocalDevelopmentEmailProviderAdapter();
  const result = adapter.sendEmail(canonicalRequest({ metadata: { simulationMode: EmailProviderSimulationModes.TIMEOUT } }));
  assert.equal(result.accepted, false);
  assert.equal(result.normalizedErrorClass, 'TIMEOUT');
  assert.equal(result.retryable, true);
  assert.equal(result.outcome, 'FAILED_RETRYABLE');
});

test('local simulated rate limit', () => {
  const adapter = new LocalDevelopmentEmailProviderAdapter();
  const result = adapter.sendEmail(canonicalRequest({ metadata: { simulationMode: EmailProviderSimulationModes.RATE_LIMIT } }));
  assert.equal(result.accepted, false);
  assert.equal(result.normalizedErrorClass, 'RATE_LIMITED');
  assert.equal(result.retryable, true);
});

test('local recipient rejection', () => {
  const adapter = new LocalDevelopmentEmailProviderAdapter();
  const result = adapter.sendEmail(canonicalRequest({ metadata: { simulationMode: EmailProviderSimulationModes.RECIPIENT_REJECTION } }));
  assert.equal(result.accepted, false);
  assert.equal(result.normalizedErrorClass, 'RECIPIENT_INVALID');
  assert.equal(result.terminal, true);
  assert.equal(result.outcome, 'FAILED_TERMINAL');
});

test('production adapter request mapping', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 202,
      headers: {
        get(name) {
          if (String(name).toLowerCase() === 'x-message-id') return 'sg-message-1';
          if (String(name).toLowerCase() === 'x-request-id') return 'sg-request-1';
          return null;
        }
      },
      json: async () => ({})
    };
  };

  const adapter = new SendGridEmailProviderAdapter({
    fetchImpl,
    config: {
      apiKey: 'SG.key',
      defaultSenderEmail: 'sender@atlas.test',
      defaultSenderDisplayName: 'Atlas Sender',
      defaultReplyTo: 'reply@atlas.test'
    }
  });

  await adapter.sendEmail(canonicalRequest({ idempotencyKey: 'idem_production_1' }));

  assert.equal(requests.length, 1);
  const sent = requests[0];
  assert.equal(String(sent.url), 'https://api.sendgrid.com/v3/mail/send');
  assert.equal(sent.init.method, 'POST');
  assert.equal(sent.init.headers['Idempotency-Key'], 'idem_production_1');

  const body = JSON.parse(sent.init.body);
  assert.equal(body.personalizations[0].to[0].email, 'customer@atlas.test');
  assert.equal(body.from.email, 'sender@atlas.test');
  assert.equal(body.subject, 'Status update');
});

test('production adapter success normalization', async () => {
  const adapter = new SendGridEmailProviderAdapter({
    fetchImpl: async () => ({
      ok: true,
      status: 202,
      headers: {
        get(name) {
          if (String(name).toLowerCase() === 'x-message-id') return 'msg_123';
          return null;
        }
      },
      json: async () => ({})
    }),
    config: {
      apiKey: 'SG.key',
      defaultSenderEmail: 'sender@atlas.test',
      defaultSenderDisplayName: 'Atlas Sender',
      defaultReplyTo: 'reply@atlas.test'
    }
  });

  const result = await adapter.sendEmail(canonicalRequest());
  assert.equal(result.accepted, true);
  assert.equal(result.outcome, 'SUCCEEDED');
  assert.equal(result.providerMessageId, 'msg_123');
});

test('provider outage normalization', async () => {
  const adapter = new SendGridEmailProviderAdapter({
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: async () => ({ errors: [{ message: 'unavailable' }] })
    }),
    config: {
      apiKey: 'SG.key',
      defaultSenderEmail: 'sender@atlas.test',
      defaultSenderDisplayName: 'Atlas Sender',
      defaultReplyTo: 'reply@atlas.test'
    }
  });

  const result = await adapter.sendEmail(canonicalRequest());
  assert.equal(result.accepted, false);
  assert.equal(result.normalizedErrorClass, 'PROVIDER_UNAVAILABLE');
  assert.equal(result.retryable, true);
});

test('missing credential failure', () => {
  const adapter = new SendGridEmailProviderAdapter({
    config: {
      apiKey: '',
      defaultSenderEmail: 'sender@atlas.test',
      defaultSenderDisplayName: 'Atlas Sender'
    }
  });

  const validation = adapter.validateConfiguration();
  assert.equal(validation.accepted, false);
  assert.equal(validation.issues.some((entry) => entry.includes('ATLAS_EMAIL_SENDGRID_API_KEY')), true);
});

test('invalid sender configuration', () => {
  const adapter = new SendGridEmailProviderAdapter({
    config: {
      apiKey: 'SG.key',
      defaultSenderEmail: 'sender@atlas.test',
      defaultSenderDisplayName: 'Bad\nName'
    }
  });

  const validation = adapter.validateConfiguration();
  assert.equal(validation.accepted, false);
  assert.equal(validation.issues.some((entry) => entry.includes('ATLAS_EMAIL_SENDER_DISPLAY_NAME')), true);
});

test('invalid recipient address', () => {
  const validation = validateCanonicalEmailRequest(canonicalRequest({ recipient: { email: 'not-an-email' } }));
  assert.equal(validation.accepted, false);
  assert.equal(validation.errors.some((entry) => entry.includes('recipient.email')), true);
});

test('header injection rejection', () => {
  const validation = validateCanonicalEmailRequest(canonicalRequest({ subject: 'Hello\nBcc:evil@example.com' }));
  assert.equal(validation.accepted, false);
  assert.equal(validation.errors.some((entry) => entry.includes('control or CRLF')), true);
});

test('oversized payload rejection', () => {
  const veryLarge = 'x'.repeat(300000);
  const validation = validateCanonicalEmailRequest(canonicalRequest({ htmlBody: veryLarge }));
  assert.equal(validation.accepted, false);
  assert.equal(validation.errors.some((entry) => entry.includes('htmlBody exceeds')), true);
});

test('production startup validation', async () => {
  await withEnv({
    NODE_ENV: 'production',
    ATLAS_EMAIL_PROVIDER: 'sendgrid',
    ATLAS_EMAIL_SENDGRID_API_KEY: 'SG.key',
    ATLAS_EMAIL_SENDER_ADDRESS: 'sender@atlas.test',
    ATLAS_EMAIL_SENDER_DISPLAY_NAME: 'Atlas Sender',
    ATLAS_EMAIL_REPLY_TO: 'reply@atlas.test',
    ATLAS_EMAIL_SENDGRID_ENDPOINT: 'https://api.sendgrid.com/v3/mail/send'
  }, async () => {
    const factory = new NotificationEmailProviderFactory({ environment: 'production' });
    const readiness = factory.validateStartup();
    assert.equal(readiness.ready, true);
    assert.equal(readiness.failStartup, false);
  });
});

test('emergency disable behavior', async () => {
  await withEnv({
    NODE_ENV: 'production',
    ATLAS_EMAIL_PROVIDER: 'sendgrid',
    ATLAS_EMAIL_SENDGRID_API_KEY: 'SG.key',
    ATLAS_EMAIL_SENDER_ADDRESS: 'sender@atlas.test',
    ATLAS_EMAIL_SENDER_DISPLAY_NAME: 'Atlas Sender',
    ATLAS_EMAIL_PROVIDER_EMERGENCY_DISABLE: 'true'
  }, async () => {
    const factory = new NotificationEmailProviderFactory({ environment: 'production' });
    const readiness = factory.validateStartup();
    assert.equal(readiness.ready, false);
    assert.equal(readiness.failStartup, true);
    assert.equal(readiness.summary.includes('emergency'), true);
  });
});
