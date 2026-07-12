import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { NotificationTemplateDomain } from '../src/executive/notification-template-domain.js';
import { NotificationDeliveryOrchestrationCore } from '../src/executive/notification-delivery-orchestration-core.js';
import { NotificationEmailDispatcherBridge } from '../src/executive/notification-email-dispatcher-bridge.js';
import { deterministicProviderRequestRef } from '../src/executive/notification-email-provider-contracts.js';

function withRuntime(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-email-dispatch-'));
  const provider = new SQLiteStorageProvider({ databasePath: join(dir, 'email-dispatch.sqlite') });
  const templateDomain = new NotificationTemplateDomain({ storageProvider: provider });
  const orchestrationCore = new NotificationDeliveryOrchestrationCore({ storageProvider: provider });
  const bridge = new NotificationEmailDispatcherBridge({
    orchestrationCore,
    templateDomain,
    storageProvider: provider,
    providerFactoryOptions: {
      environment: 'development',
      providerType: 'local'
    },
    senderIdentity: {
      email: 'sender@atlas.test',
      displayName: 'Atlas Sender'
    },
    replyTo: 'reply@atlas.test'
  });

  try {
    return callback({ provider, templateDomain, orchestrationCore, bridge });
  } finally {
    provider.closeSync();
  }
}

function createEmailTemplate(domain, { templateId = 'dispatch_template', businessScope = 'biz_1' } = {}) {
  domain.createTemplateRecord({
    templateId,
    version: '1.0.0',
    notificationType: 'WEBSITE_PUBLISHED',
    classification: 'CUSTOMER_SUCCESS',
    channel: 'EMAIL',
    businessScope,
    locale: 'en-US',
    status: 'DRAFT',
    variableSchema: {
      allowUnknownVariables: false,
      fields: [
        { name: 'customerName', type: 'string', required: true, maxLength: 80 },
        { name: 'supportUrl', type: 'URL', required: true }
      ]
    },
    content: {
      subjectTemplate: 'Hello {{customerName}}',
      textTemplate: 'Support: {{supportUrl}}',
      htmlTemplate: '<p>Hello {{customerName}}</p><p>Support: {{supportUrl}}</p>'
    },
    approvalMetadata: {},
    branding: {
      businessDisplayName: 'Atlas',
      approvedFooter: 'footer'
    }
  });

  domain.submitForReview({ templateId, channel: 'EMAIL', businessScope, locale: 'en-US', version: '1.0.0' });
  domain.approveTemplate({ templateId, channel: 'EMAIL', businessScope, locale: 'en-US', version: '1.0.0', approvalReference: 'apr_1' });
  domain.activateTemplate({ templateId, channel: 'EMAIL', businessScope, locale: 'en-US', version: '1.0.0' });
}

function eligibleIntent({
  intentId = 'nint_1',
  businessId = 'biz_1',
  customerId = 'cust_1',
  recipientId = 'cust_1',
  recipientEmail = 'customer@atlas.test'
} = {}) {
  return {
    intentId,
    state: 'ELIGIBLE',
    notificationType: 'WEBSITE_PUBLISHED',
    classification: 'CUSTOMER_SUCCESS',
    candidateChannels: ['EMAIL'],
    correlationId: `corr_${intentId}`,
    causationId: `cause_${intentId}`,
    businessId,
    customerId,
    recipientRefs: [{
      type: 'CUSTOMER',
      id: recipientId,
      customerId: recipientId,
      email: recipientEmail
    }]
  };
}

function compose(domain, intent) {
  const composed = domain.composeFromIntent({
    intent,
    variables: {
      customerName: 'Alex',
      supportUrl: 'https://atlas.test/help'
    },
    requestedLocale: 'en-US',
    defaultLocale: 'en-US',
    businessScope: intent.businessId
  });

  assert.equal(composed.accepted, true);
  return composed;
}

async function createLeasedJob({ orchestrationCore, templateDomain, intent }) {
  const composed = compose(templateDomain, intent);
  const created = orchestrationCore.createJobsFromFrozenComposition({
    intent,
    composition: composed.composition
  });
  assert.equal(created.accepted, true);

  const job = created.jobs[0];
  orchestrationCore.enqueueJob({ jobId: job.jobId });
  const lease = orchestrationCore.acquireLease({ jobId: job.jobId, leaseOwner: 'worker_1' });
  assert.equal(lease.accepted, true);

  return {
    jobId: job.jobId,
    leaseOwner: 'worker_1',
    compositionId: composed.composition.compositionId,
    contentRef: composed.content.contentRef
  };
}

test('leased job email dispatch success', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createEmailTemplate(templateDomain);
    const intent = eligibleIntent();
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const dispatched = await bridge.dispatchLeasedEmailJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner
    });

    assert.equal(dispatched.accepted, true);
    assert.equal(dispatched.job.status, 'DELIVERED');
  });
});

test('stale or duplicate dispatch rejection', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createEmailTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_dup' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const staleOwner = await bridge.dispatchLeasedEmailJob({ jobId: leased.jobId, leaseOwner: 'worker_x' });
    assert.equal(staleOwner.accepted, false);
    assert.equal(staleOwner.code, 'LEASE_OWNER_MISMATCH');

    const job = orchestrationCore.listJobs({}).find((item) => item.jobId === leased.jobId);
    const providerRequestRef = deterministicProviderRequestRef(`${job.jobId}:${job.idempotencyKey}:${job.attemptCount + 1}`);
    orchestrationCore.startAttempt({ jobId: leased.jobId, leaseOwner: leased.leaseOwner, providerRequestRef });

    const duplicate = await bridge.dispatchLeasedEmailJob({ jobId: leased.jobId, leaseOwner: leased.leaseOwner });
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.code, 'DUPLICATE_ATTEMPT');

    const audit = bridge.listAuditRecords();
    assert.equal(audit.some((entry) => entry.event === 'email_duplicate_dispatch_suppressed'), true);
  });
});

test('job/composition channel mismatch', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createEmailTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_mismatch' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const existing = templateDomain.getComposition(leased.compositionId);
    templateDomain.compositions.set(leased.compositionId, {
      ...existing,
      channel: 'WEBHOOK'
    });

    const result = await bridge.dispatchLeasedEmailJob({ jobId: leased.jobId, leaseOwner: leased.leaseOwner });
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'COMPOSITION_CHANNEL_MISMATCH');
  });
});

test('customer and business isolation', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createEmailTemplate(templateDomain, { businessScope: 'biz_A' });

    const intent = eligibleIntent({
      intentId: 'nint_iso',
      businessId: 'biz_A',
      customerId: 'cust_A',
      recipientId: 'cust_B',
      recipientEmail: 'customer@atlas.test'
    });

    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });
    const result = await bridge.dispatchLeasedEmailJob({ jobId: leased.jobId, leaseOwner: leased.leaseOwner });

    assert.equal(result.accepted, false);
    assert.equal(result.code, 'CUSTOMER_ISOLATION_VIOLATION');
  });
});

test('idempotency propagation', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createEmailTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_idem' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    await bridge.dispatchLeasedEmailJob({ jobId: leased.jobId, leaseOwner: leased.leaseOwner });

    const outbound = bridge.providerFactory.getAdapter().outboundEnvelopes;
    const envelope = Array.from(outbound.values())[0]?.envelope;
    const job = orchestrationCore.listJobs({}).find((item) => item.jobId === leased.jobId);
    assert.equal(envelope.idempotencyKey, job.idempotencyKey);
  });
});

test('retryable failure transition', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createEmailTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_retry' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const result = await bridge.dispatchLeasedEmailJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      dispatchMetadata: { simulationMode: 'rate_limit' }
    });

    assert.equal(result.accepted, true);
    assert.equal(result.job.status, 'DELIVERY_FAILED_RETRYABLE');
  });
});

test('terminal failure transition', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createEmailTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_terminal' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const result = await bridge.dispatchLeasedEmailJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      dispatchMetadata: { simulationMode: 'recipient_rejection' }
    });

    assert.equal(result.accepted, true);
    assert.equal(result.job.status, 'DEAD_LETTERED');
  });
});

test('audit redaction', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createEmailTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_audit' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    await bridge.dispatchLeasedEmailJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      dispatchMetadata: {
        apiKey: 'top-secret',
        htmlBody: '<p>should not log full html</p>'
      }
    });

    const audit = bridge.listAuditRecords();
    const merged = JSON.stringify(audit);
    assert.equal(merged.includes('top-secret'), false);
    assert.equal(merged.includes('should not log full html'), false);
  });
});

test('telemetry emission', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createEmailTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_tel' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    await bridge.dispatchLeasedEmailJob({ jobId: leased.jobId, leaseOwner: leased.leaseOwner });

    const telemetry = bridge.getTelemetrySnapshot();
    assert.equal((telemetry['email.dispatch.succeeded'] ?? 0) > 0, true);
    assert.equal((telemetry['email.attempts.provider.atlas_local_non_delivering_email'] ?? 0) > 0, true);
  });
});
