import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { NotificationTemplateDomain } from '../src/executive/notification-template-domain.js';
import { NotificationDeliveryOrchestrationCore } from '../src/executive/notification-delivery-orchestration-core.js';
import { NotificationWebhookDispatcherBridge } from '../src/executive/notification-webhook-dispatcher-bridge.js';
import { NotificationWebhookEndpointRegistry } from '../src/executive/notification-webhook-endpoint-registry.js';
import { deterministicWebhookRequestRef } from '../src/executive/notification-webhook-provider-contracts.js';

function withRuntime(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-webhook-dispatch-'));
  const provider = new SQLiteStorageProvider({ databasePath: join(dir, 'webhook-dispatch.sqlite') });
  const templateDomain = new NotificationTemplateDomain({ storageProvider: provider });
  const orchestrationCore = new NotificationDeliveryOrchestrationCore({ storageProvider: provider });

  const endpointRegistry = new NotificationWebhookEndpointRegistry({
    requireHttps: true,
    globalAllowlist: ['hooks.atlas.test'],
    approvedEndpoints: [
      {
        endpoint: 'https://hooks.atlas.test/events',
        businessId: 'biz_1',
        customerId: 'cust_1'
      }
    ]
  });

  const bridge = new NotificationWebhookDispatcherBridge({
    orchestrationCore,
    templateDomain,
    storageProvider: provider,
    providerFactoryOptions: {
      environment: 'development',
      providerType: 'local'
    },
    endpointRegistry,
    signingServiceOptions: {
      now: () => '2025-01-01T00:00:00.000Z',
      keyVersion: 'v1',
      keyRing: { v1: 'atlas-test-signing' }
    }
  });

  try {
    return callback({ provider, templateDomain, orchestrationCore, bridge });
  } finally {
    provider.closeSync();
  }
}

function createWebhookTemplate(domain, { templateId = 'dispatch_webhook_template', businessScope = 'biz_1' } = {}) {
  domain.createTemplateRecord({
    templateId,
    version: '1.0.0',
    notificationType: 'WEBSITE_PUBLISHED',
    classification: 'CUSTOMER_SUCCESS',
    channel: 'WEBHOOK',
    businessScope,
    locale: 'en-US',
    status: 'DRAFT',
    variableSchema: {
      allowUnknownVariables: false,
      fields: [
        { name: 'customerName', type: 'string', required: true, maxLength: 80 },
        { name: 'websiteId', type: 'string', required: true }
      ]
    },
    content: {
      jsonTemplate: {
        event: 'WEBSITE_PUBLISHED',
        customerName: '{{customerName}}',
        websiteId: '{{websiteId}}'
      }
    },
    approvalMetadata: {},
    branding: {
      businessDisplayName: 'Atlas',
      approvedFooter: 'footer'
    }
  });

  domain.submitForReview({ templateId, channel: 'WEBHOOK', businessScope, locale: 'en-US', version: '1.0.0' });
  domain.approveTemplate({ templateId, channel: 'WEBHOOK', businessScope, locale: 'en-US', version: '1.0.0', approvalReference: 'apr_1' });
  domain.activateTemplate({ templateId, channel: 'WEBHOOK', businessScope, locale: 'en-US', version: '1.0.0' });
}

function eligibleIntent({
  intentId = 'nint_wh_1',
  businessId = 'biz_1',
  customerId = 'cust_1',
  recipientId = 'cust_1'
} = {}) {
  return {
    intentId,
    state: 'ELIGIBLE',
    notificationType: 'WEBSITE_PUBLISHED',
    classification: 'CUSTOMER_SUCCESS',
    candidateChannels: ['WEBHOOK'],
    correlationId: `corr_${intentId}`,
    causationId: `cause_${intentId}`,
    businessId,
    customerId,
    recipientRefs: [{
      type: 'CUSTOMER',
      id: recipientId,
      customerId: recipientId
    }]
  };
}

function compose(domain, intent) {
  const composed = domain.composeFromIntent({
    intent,
    variables: {
      customerName: 'Alex',
      websiteId: 'site_1'
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
  const created = orchestrationCore.createJobsFromFrozenComposition({ intent, composition: composed.composition });
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

test('leased job webhook dispatch success', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createWebhookTemplate(templateDomain);
    const intent = eligibleIntent();
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const dispatched = await bridge.dispatchLeasedWebhookJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      endpoint: 'https://hooks.atlas.test/events'
    });

    assert.equal(dispatched.accepted, true);
    assert.equal(dispatched.job.status, 'DELIVERED');
  });
});

test('stale or duplicate dispatch rejection', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createWebhookTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_wh_dup' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const stale = await bridge.dispatchLeasedWebhookJob({
      jobId: leased.jobId,
      leaseOwner: 'worker_x',
      endpoint: 'https://hooks.atlas.test/events'
    });
    assert.equal(stale.accepted, false);
    assert.equal(stale.code, 'LEASE_OWNER_MISMATCH');

    const job = orchestrationCore.listJobs({}).find((item) => item.jobId === leased.jobId);
    const providerRequestRef = deterministicWebhookRequestRef(`${job.jobId}:${job.idempotencyKey}:${job.attemptCount + 1}`);
    orchestrationCore.startAttempt({ jobId: leased.jobId, leaseOwner: leased.leaseOwner, providerRequestRef });

    const duplicate = await bridge.dispatchLeasedWebhookJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      endpoint: 'https://hooks.atlas.test/events'
    });

    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.code, 'DUPLICATE_ATTEMPT');
  });
});

test('endpoint ownership mismatch blocked', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createWebhookTemplate(templateDomain, { businessScope: 'biz_2' });
    const intent = eligibleIntent({ intentId: 'nint_wh_owner', businessId: 'biz_2' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const result = await bridge.dispatchLeasedWebhookJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      endpoint: 'https://hooks.atlas.test/events'
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, 'ENDPOINT_OWNERSHIP_MISMATCH');
  });
});

test('retryable failure transition', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createWebhookTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_wh_retry' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const result = await bridge.dispatchLeasedWebhookJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      endpoint: 'https://hooks.atlas.test/events',
      dispatchMetadata: { simulationMode: 'rate_limit' }
    });

    assert.equal(result.accepted, true);
    assert.equal(result.job.status, 'DELIVERY_FAILED_RETRYABLE');
  });
});

test('terminal failure transition', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createWebhookTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_wh_terminal' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const result = await bridge.dispatchLeasedWebhookJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      endpoint: 'https://hooks.atlas.test/events',
      dispatchMetadata: { simulationMode: 'receiver_rejection' }
    });

    assert.equal(result.accepted, true);
    assert.equal(result.job.status, 'DEAD_LETTERED');
  });
});

test('unknown outcome is retryable', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createWebhookTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_wh_unknown' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    const result = await bridge.dispatchLeasedWebhookJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      endpoint: 'https://hooks.atlas.test/events',
      dispatchMetadata: { simulationMode: 'unknown' }
    });

    assert.equal(result.accepted, true);
    assert.equal(result.job.status, 'DELIVERY_FAILED_RETRYABLE');
  });
});

test('audit redaction and telemetry emission', async () => {
  await withRuntime(async ({ templateDomain, orchestrationCore, bridge }) => {
    createWebhookTemplate(templateDomain);
    const intent = eligibleIntent({ intentId: 'nint_wh_audit' });
    const leased = await createLeasedJob({ orchestrationCore, templateDomain, intent });

    await bridge.dispatchLeasedWebhookJob({
      jobId: leased.jobId,
      leaseOwner: leased.leaseOwner,
      endpoint: 'https://hooks.atlas.test/events',
      dispatchMetadata: {
        apiKey: 'top-secret',
        token: 'secret-token',
        payload: 'safe-value'
      }
    });

    const audit = bridge.listAuditRecords();
    const merged = JSON.stringify(audit);
    assert.equal(merged.includes('top-secret'), false);
    assert.equal(merged.includes('secret-token'), false);

    const telemetry = bridge.getTelemetrySnapshot();
    assert.equal((telemetry['webhook.dispatch.succeeded'] ?? 0) > 0, true);
    assert.equal((telemetry['webhook.attempts.provider.local'] ?? 0) > 0, true);
  });
});
