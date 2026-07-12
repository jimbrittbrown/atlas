import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { NotificationDeliveryOrchestrationCore } from '../src/executive/notification-delivery-orchestration-core.js';
import { NotificationReliabilitySubsystem } from '../src/executive/notification-reliability-subsystem.js';
import { NotificationGovernanceSafetyIntegration } from '../src/executive/notification-governance-safety-integration.js';
import { NotificationTemplateDomain } from '../src/executive/notification-template-domain.js';
import { NotificationObservabilityProjectionProvider } from '../src/executive/notification-observability-projection-provider.js';
import { createExecutiveProjectionProviderRegistry } from '../src/executive/executive-projection-provider-bootstrap.js';

function createRuntime() {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-notification-observability-'));
  const dbPath = join(dir, 'notification-observability.sqlite');
  const provider = new SQLiteStorageProvider({ databasePath: dbPath });

  let current = Date.parse('2026-07-12T12:00:00.000Z');
  const now = () => new Date(current).toISOString();

  const deliveryCore = new NotificationDeliveryOrchestrationCore({
    storageProvider: provider,
    now
  });

  const reliability = new NotificationReliabilitySubsystem({
    orchestrationCore: deliveryCore,
    storageProvider: provider,
    now
  });

  const governance = new NotificationGovernanceSafetyIntegration({
    storageProvider: provider,
    now
  });

  const templateDomain = new NotificationTemplateDomain({
    storageProvider: provider,
    now
  });

  const emailBridge = {
    getHealth() {
      return {
        provider: {
          healthState: 'HEALTHY'
        },
        startupReadiness: {
          checkedAt: now(),
          ready: true,
          issues: []
        }
      };
    },
    getTelemetrySnapshot() {
      return {
        'email.dispatch.succeeded': 8,
        'email.dispatch.failed': 2,
        'email.latency.total_ms': 500,
        'email.rate_limited': 1,
        apiToken: 'secret-token'
      };
    }
  };

  const webhookBridge = {
    getHealth() {
      return {
        provider: {
          healthState: 'DEGRADED'
        },
        startupReadiness: {
          checkedAt: now(),
          ready: false,
          issues: ['signing key missing']
        }
      };
    },
    getTelemetrySnapshot() {
      return {
        'webhook.dispatch.succeeded': 6,
        'webhook.dispatch.failed': 3,
        'webhook.latency.total_ms': 630,
        'webhook.receiver_rejections': 2,
        'webhook.endpoint.rejected': 1,
        'webhook.rate_limited': 1
      };
    }
  };

  const observability = new NotificationObservabilityProjectionProvider({
    deliveryCore,
    reliabilitySubsystem: reliability,
    governanceIntegration: governance,
    templateDomain,
    emailDispatcherBridge: emailBridge,
    webhookDispatcherBridge: webhookBridge,
    now,
    maxTelemetryAgeMs: 60 * 1000
  });

  function setNow(iso) {
    current = Date.parse(iso);
  }

  function seedJob({
    jobId,
    status,
    channel,
    providerId,
    businessId,
    customerId,
    classification,
    notificationType,
    updatedAt = now()
  }) {
    const record = Object.freeze({
      jobId,
      intentId: `intent_${jobId}`,
      channel,
      providerId,
      recipient: { id: customerId, customerId },
      templateVersion: '1.0.0',
      renderedContentRef: `content_${jobId}`,
      idempotencyKey: `idem_${jobId}`,
      priority: 50,
      availableAt: now(),
      attemptCount: status === 'DELIVERED' ? 1 : 0,
      maximumAttempts: 3,
      status,
      version: 1,
      lease: {
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseVersion: 0
      },
      correlationId: `corr_${jobId}`,
      causationId: `cause_${jobId}`,
      compositionId: `cmp_${jobId}`,
      classification,
      notificationType,
      businessId,
      customerId,
      createdAt: updatedAt,
      updatedAt,
      transitionHistory: []
    });

    deliveryCore.jobs.set(record.jobId, record);
    deliveryCore.storageProvider.upsertRecordSync(`${deliveryCore.namespace}.jobs`, record.jobId, record);

    return record;
  }

  return {
    provider,
    now,
    setNow,
    deliveryCore,
    reliability,
    governance,
    templateDomain,
    observability,
    seedJob
  };
}

test('projection correctness and aggregation accuracy', () => {
  const runtime = createRuntime();

  runtime.seedJob({ jobId: 'job_1', status: 'DELIVERED', channel: 'EMAIL', providerId: 'EMAIL_LOCAL', businessId: 'biz_1', customerId: 'cust_1', classification: 'CUSTOMER_SUCCESS', notificationType: 'WEBSITE_PUBLISHED' });
  runtime.seedJob({ jobId: 'job_2', status: 'QUEUED', channel: 'WEBHOOK', providerId: 'WEBHOOK_LOCAL', businessId: 'biz_1', customerId: 'cust_1', classification: 'CUSTOMER_SUCCESS', notificationType: 'WEBSITE_PUBLISHED' });
  runtime.seedJob({ jobId: 'job_3', status: 'DELIVERY_FAILED_RETRYABLE', channel: 'EMAIL', providerId: 'EMAIL_LOCAL', businessId: 'biz_2', customerId: 'cust_2', classification: 'TRANSACTIONAL', notificationType: 'PAYMENT_SUCCEEDED_RECEIPT' });
  runtime.seedJob({ jobId: 'job_4', status: 'DEAD_LETTERED', channel: 'EMAIL', providerId: 'EMAIL_LOCAL', businessId: 'biz_2', customerId: 'cust_2', classification: 'TRANSACTIONAL', notificationType: 'PAYMENT_SUCCEEDED_RECEIPT' });

  const projection = runtime.observability.project({});

  assert.equal(projection.projectionType, 'NOTIFICATION_OBSERVABILITY');
  assert.equal(projection.payload.deliveryHealth.totalNotifications, 4);
  assert.equal(projection.payload.deliveryHealth.delivered, 1);
  assert.equal(projection.payload.deliveryHealth.queued, 1);
  assert.equal(projection.payload.deliveryHealth.retrying, 1);
  assert.equal(projection.payload.deliveryHealth.deadLetter, 1);
  assert.equal(projection.payload.deliveryHealth.breakDownByChannel.EMAIL.totalNotifications, 3);
  assert.equal(projection.payload.deliveryHealth.breakDownByBusiness.biz_1.totalNotifications, 2);
  assert.equal(projection.payload.deliveryHealth.breakDownByClassification.CUSTOMER_SUCCESS.totalNotifications, 2);
  assert.equal(typeof projection.generatedAt, 'string');

  runtime.provider.closeSync();
});

test('provider health and queue metrics are projected', () => {
  const runtime = createRuntime();

  runtime.seedJob({ jobId: 'job_q1', status: 'QUEUED', channel: 'EMAIL', providerId: 'EMAIL_LOCAL', businessId: 'biz_1', customerId: 'cust_1', classification: 'CUSTOMER_SUCCESS', notificationType: 'WEBSITE_PUBLISHED' });
  runtime.seedJob({ jobId: 'job_q2', status: 'DISPATCHING', channel: 'WEBHOOK', providerId: 'WEBHOOK_LOCAL', businessId: 'biz_1', customerId: 'cust_1', classification: 'CUSTOMER_SUCCESS', notificationType: 'WEBSITE_PUBLISHED' });

  const projection = runtime.observability.project({});

  assert.equal(projection.payload.providerHealth.EMAIL.availability, 'HEALTHY');
  assert.equal(projection.payload.providerHealth.WEBHOOK.signingHealth, 'DEGRADED');
  assert.equal(projection.payload.providerHealth.WEBHOOK.endpointHealth.rejectedEndpoints, 1);
  assert.equal(projection.payload.queueHealth.queued, 1);
  assert.equal(projection.payload.queueHealth.dispatching, 1);

  runtime.provider.closeSync();
});

test('reliability, governance, and template metrics are projected', () => {
  const runtime = createRuntime();

  const deadJob = runtime.seedJob({
    jobId: 'job_dead_1',
    status: 'DEAD_LETTERED',
    channel: 'EMAIL',
    providerId: 'EMAIL_LOCAL',
    businessId: 'biz_1',
    customerId: 'cust_1',
    classification: 'TRANSACTIONAL',
    notificationType: 'PAYMENT_SUCCEEDED_RECEIPT'
  });

  runtime.reliability.createDeadLetterRecord({
    jobId: deadJob.jobId,
    terminalReason: 'terminal_failure',
    replayEligibility: false
  });
  runtime.reliability.setTelemetry('reliability.recovery.restart.count', 2);
  runtime.reliability.setTelemetry('reliability.recovery.latency.total_ms', 3000);
  runtime.reliability.setTelemetry('reliability.reconciliation.findings.count', 3);
  runtime.reliability.setTelemetry('reliability.retry.success_rate', 0.75);
  runtime.reliability.setTelemetry('reliability.retry.exhaustion_rate', 0.2);

  runtime.governance.setTelemetry('governance.preference.suppression.count', 4);
  runtime.governance.setTelemetry('governance.duplicate.suppressed.count', 2);
  runtime.governance.setTelemetry('governance.quiet_hours.deferred.count', 1);
  runtime.governance.setTelemetry('governance.rate_limit.suppressed.count', 3);
  runtime.governance.setTelemetry('governance.override.security.count', 2);
  runtime.governance.setTelemetry('governance.approval.pending.backlog', 5);
  runtime.governance.setTelemetry('governance.cross_tenant.denials.count', 2);
  runtime.governance.setTelemetry('governance.policy.failures.count', 2);
  runtime.governance.recordAudit('mandatory_notice_override', { reason: 'quiet_hours_bypass_legal_mandatory', businessId: 'biz_1', customerId: 'cust_1' });

  runtime.templateDomain.createTemplateRecord({
    templateId: 'tpl_active',
    notificationType: 'WEBSITE_PUBLISHED',
    classification: 'CUSTOMER_SUCCESS',
    channel: 'EMAIL',
    businessScope: 'GLOBAL',
    locale: 'en-US',
    version: '1.0.0',
    status: 'ACTIVE',
    variableSchema: {},
    content: { subject: 'ok', textBody: 'ok' }
  });
  runtime.templateDomain.createTemplateRecord({
    templateId: 'tpl_review',
    notificationType: 'WEBSITE_PUBLISHED',
    classification: 'CUSTOMER_SUCCESS',
    channel: 'EMAIL',
    businessScope: 'GLOBAL',
    locale: 'en-US',
    version: '1.0.1',
    status: 'REVIEW',
    variableSchema: {},
    content: { subject: 'ok', textBody: 'ok' }
  });
  runtime.templateDomain.createTemplateRecord({
    templateId: 'tpl_retired',
    notificationType: 'WEBSITE_PUBLISHED',
    classification: 'CUSTOMER_SUCCESS',
    channel: 'EMAIL',
    businessScope: 'GLOBAL',
    locale: 'en-US',
    version: '1.0.2',
    status: 'RETIRED',
    variableSchema: {},
    content: { subject: 'ok', textBody: 'ok' }
  });
  runtime.templateDomain.incrementTelemetry('render.fallback.count', 7);
  runtime.templateDomain.incrementTelemetry('render.failure.count', 4);
  runtime.templateDomain.incrementTelemetry('render.unresolved_placeholder.count', 1);
  runtime.templateDomain.recordAudit('preview_rendered', { businessId: 'biz_1' });

  const projection = runtime.observability.project({});

  assert.equal(projection.payload.reliability.deadLetterBacklog >= 1, true);
  assert.equal(projection.payload.reliability.retrySuccessRate, 0.75);
  assert.equal(projection.payload.reliability.reconciliationFindings, 3);
  assert.equal(projection.payload.governance.approvalPending, 5);
  assert.equal(projection.payload.governance.suppressions.duplicate, 2);
  assert.equal(projection.payload.governance.legalOverrides, 1);
  assert.equal(projection.payload.templateHealth.activeTemplates, 1);
  assert.equal(projection.payload.templateHealth.reviewTemplates, 1);
  assert.equal(projection.payload.templateHealth.retiredTemplates, 1);
  assert.equal(projection.payload.templateHealth.previewActivity, 1);

  runtime.provider.closeSync();
});

test('incident projection includes required fields', () => {
  const runtime = createRuntime();

  const deadJob = runtime.seedJob({
    jobId: 'job_incident_1',
    status: 'DEAD_LETTERED',
    channel: 'EMAIL',
    providerId: 'EMAIL_LOCAL',
    businessId: 'biz_inc',
    customerId: 'cust_inc',
    classification: 'TRANSACTIONAL',
    notificationType: 'PAYMENT_SUCCEEDED_RECEIPT'
  });

  runtime.reliability.createDeadLetterRecord({
    jobId: deadJob.jobId,
    terminalReason: 'terminal_failure',
    replayEligibility: false
  });

  const projection = runtime.observability.project({});
  const incident = projection.payload.operationalIncidents.records[0];

  assert.equal(Boolean(incident.severity), true);
  assert.equal(Boolean(incident.category), true);
  assert.equal(Boolean(incident.status), true);
  assert.equal(Object.prototype.hasOwnProperty.call(incident, 'firstSeen'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(incident, 'lastSeen'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(incident, 'affectedProvider'), true);
  assert.equal(Array.isArray(incident.affectedBusinesses), true);
  assert.equal(Array.isArray(incident.correlationIds), true);
  assert.equal(Boolean(incident.recoveryStatus), true);

  runtime.provider.closeSync();
});

test('freshness timestamps and stale telemetry handling', () => {
  const runtime = createRuntime();

  runtime.seedJob({
    jobId: 'job_old_1',
    status: 'DELIVERED',
    channel: 'EMAIL',
    providerId: 'EMAIL_LOCAL',
    businessId: 'biz_1',
    customerId: 'cust_1',
    classification: 'CUSTOMER_SUCCESS',
    notificationType: 'WEBSITE_PUBLISHED',
    updatedAt: '2026-07-10T08:00:00.000Z'
  });

  runtime.setNow('2026-07-12T12:00:00.000Z');
  const projection = runtime.observability.project({});

  assert.equal(typeof projection.payload.freshness.deliveryHealth.checkedAt, 'string');
  assert.equal(typeof projection.payload.freshness.deliveryHealth.sourceTimestamp, 'string');
  assert.equal(projection.warnings.some((entry) => entry.includes('stale')), true);

  runtime.provider.closeSync();
});

test('projection redaction never exposes secrets or payload bodies', () => {
  const runtime = createRuntime();

  runtime.governance.recordAudit('sensitive_probe', {
    apiToken: 'secret-token',
    payload: '<html>secret body</html>',
    authorization: 'Bearer token'
  });

  const projection = runtime.observability.project({});
  const text = JSON.stringify(projection);

  assert.equal(text.includes('secret-token'), false);
  assert.equal(text.includes('Bearer token'), false);
  assert.equal(text.includes('<html>secret body</html>'), false);

  runtime.provider.closeSync();
});

test('customer and business isolation filters', () => {
  const runtime = createRuntime();

  runtime.seedJob({ jobId: 'job_iso_1', status: 'DELIVERED', channel: 'EMAIL', providerId: 'EMAIL_LOCAL', businessId: 'biz_a', customerId: 'cust_a', classification: 'CUSTOMER_SUCCESS', notificationType: 'WEBSITE_PUBLISHED' });
  runtime.seedJob({ jobId: 'job_iso_2', status: 'DELIVERED', channel: 'EMAIL', providerId: 'EMAIL_LOCAL', businessId: 'biz_b', customerId: 'cust_b', classification: 'CUSTOMER_SUCCESS', notificationType: 'WEBSITE_PUBLISHED' });

  const byBusiness = runtime.observability.project({ filters: { businessId: 'biz_a' } });
  const byCustomer = runtime.observability.project({ filters: { customerId: 'cust_b' } });

  assert.equal(byBusiness.payload.deliveryHealth.totalNotifications, 1);
  assert.equal(Object.keys(byBusiness.payload.deliveryHealth.breakDownByBusiness).length, 1);
  assert.equal(byCustomer.payload.deliveryHealth.totalNotifications, 1);
  assert.equal(byCustomer.payload.deliveryHealth.breakDownByBusiness.biz_b.totalNotifications, 1);

  runtime.provider.closeSync();
});

test('projection rebuild and replay-safe aggregation behavior', () => {
  const runtime = createRuntime();

  runtime.seedJob({ jobId: 'job_rebuild_1', status: 'DELIVERED', channel: 'EMAIL', providerId: 'EMAIL_LOCAL', businessId: 'biz_a', customerId: 'cust_a', classification: 'CUSTOMER_SUCCESS', notificationType: 'WEBSITE_PUBLISHED' });

  const first = runtime.observability.project({});
  const replaySafe = runtime.observability.project({});
  assert.equal(first.payload.deliveryHealth.totalNotifications, replaySafe.payload.deliveryHealth.totalNotifications);

  runtime.seedJob({ jobId: 'job_rebuild_2', status: 'QUEUED', channel: 'WEBHOOK', providerId: 'WEBHOOK_LOCAL', businessId: 'biz_a', customerId: 'cust_a', classification: 'CUSTOMER_SUCCESS', notificationType: 'WEBSITE_PUBLISHED' });

  const rebuilt = runtime.observability.rebuildProjection({});
  assert.equal(rebuilt.payload.deliveryHealth.totalNotifications, 2);
  assert.equal(rebuilt.payload.deliveryHealth.queued, 1);

  runtime.provider.closeSync();
});

test('provider registers through executive projection registry bootstrap', () => {
  const runtime = createRuntime();

  const registry = createExecutiveProjectionProviderRegistry({
    now: runtime.now,
    notificationDeliveryCore: runtime.deliveryCore,
    notificationReliabilitySubsystem: runtime.reliability,
    notificationGovernanceIntegration: runtime.governance,
    notificationTemplateDomain: runtime.templateDomain
  });

  const provider = registry.resolveByProjectionType('NOTIFICATION_OBSERVABILITY');
  assert.equal(Boolean(provider), true);

  const invocation = registry.invokeProvider(provider.providerId);
  assert.equal(invocation.ok, true);
  assert.equal(invocation.projection.projectionType, 'NOTIFICATION_OBSERVABILITY');

  runtime.provider.closeSync();
});
