import { createHash } from 'node:crypto';

import {
  DataAvailabilityStatuses
} from './executive-operations-dashboard-contracts.js';
import {
  NotificationDeliveryJobStates,
  NotificationIntentClassifications,
  NotificationTemplateStates
} from './notification-domain-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function nowMs(nowFn) {
  const parsed = Date.parse(String(nowFn?.() ?? ''));
  if (Number.isFinite(parsed)) return parsed;
  return Date.now();
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function redact(value, key = '') {
  const lower = String(key ?? '').toLowerCase();
  if (/(secret|token|password|authorization|cookie|credential|signature|textbody|htmlbody|messagebody|rawpayload|recipient)/i.test(lower)) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) return value.map((entry) => redact(entry, key));

  if (value && typeof value === 'object') {
    const output = {};
    Object.entries(value).forEach(([childKey, childValue]) => {
      output[childKey] = redact(childValue, childKey);
    });
    return output;
  }

  if (typeof value === 'string' && value.length > 200) {
    return `${value.slice(0, 200)}...`;
  }

  return value;
}

function mapJobStateToDeliveryBucket(status) {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === NotificationDeliveryJobStates.DELIVERED) return 'delivered';
  if (normalized === NotificationDeliveryJobStates.DELIVERY_FAILED_RETRYABLE) return 'retrying';
  if (normalized === NotificationDeliveryJobStates.QUEUED) return 'queued';
  if (normalized === NotificationDeliveryJobStates.DISPATCHING) return 'dispatching';
  if (normalized === NotificationDeliveryJobStates.DELIVERY_FAILED_TERMINAL) return 'failed';
  if (normalized === NotificationDeliveryJobStates.DEAD_LETTERED) return 'deadLetter';
  if (normalized === NotificationDeliveryJobStates.EXPIRED) return 'expired';
  if (normalized === NotificationDeliveryJobStates.CANCELLED) return 'cancelled';
  return 'other';
}

function ensureCounter(map, key) {
  if (!map[key]) {
    map[key] = {
      totalNotifications: 0,
      delivered: 0,
      retrying: 0,
      queued: 0,
      dispatching: 0,
      failed: 0,
      deadLetter: 0,
      expired: 0,
      cancelled: 0,
      other: 0
    };
  }
  return map[key];
}

function addDeliveryCount(container, bucket) {
  container.totalNotifications += 1;
  container[bucket] += 1;
}

function scopeMatches(record = {}, scope = {}) {
  const businessId = hasText(scope.businessId) ? String(scope.businessId) : null;
  const customerId = hasText(scope.customerId) ? String(scope.customerId) : null;

  if (businessId && String(record.businessId ?? '') !== businessId) return false;
  if (customerId && String(record.customerId ?? '') !== customerId) return false;
  return true;
}

function projectFreshness({ checkedAt, sourceTimestamp = null, maxAgeMs = 15 * 60 * 1000 } = {}) {
  const at = String(checkedAt ?? new Date().toISOString());
  const sourceMs = Date.parse(String(sourceTimestamp ?? ''));
  if (!Number.isFinite(sourceMs)) {
    return {
      checkedAt: at,
      sourceTimestamp: sourceTimestamp ?? null,
      stale: false,
      status: DataAvailabilityStatuses.PARTIAL,
      ageMs: null,
      maxAgeMs,
      note: 'No source timestamp available.'
    };
  }

  const ageMs = Math.max(Date.parse(at) - sourceMs, 0);
  const stale = ageMs > maxAgeMs;

  return {
    checkedAt: at,
    sourceTimestamp: new Date(sourceMs).toISOString(),
    stale,
    status: stale ? DataAvailabilityStatuses.PARTIAL : DataAvailabilityStatuses.AVAILABLE,
    ageMs,
    maxAgeMs,
    note: stale ? 'Source telemetry is stale.' : 'Source telemetry is fresh.'
  };
}

function incrementTrend(trends, at) {
  const parsed = Date.parse(String(at ?? ''));
  if (!Number.isFinite(parsed)) return;
  const day = new Date(parsed).toISOString().slice(0, 10);
  trends[day] = toNumber(trends[day], 0) + 1;
}

export class NotificationObservabilityProjectionProvider {
  constructor({
    deliveryCore,
    reliabilitySubsystem,
    governanceIntegration,
    templateDomain,
    emailDispatcherBridge = null,
    webhookDispatcherBridge = null,
    now,
    maxTelemetryAgeMs = 15 * 60 * 1000,
    providerId = 'notification.observability.provider',
    projectionType = 'NOTIFICATION_OBSERVABILITY'
  } = {}) {
    this.deliveryCore = deliveryCore ?? null;
    this.reliabilitySubsystem = reliabilitySubsystem ?? null;
    this.governanceIntegration = governanceIntegration ?? null;
    this.templateDomain = templateDomain ?? null;
    this.emailDispatcherBridge = emailDispatcherBridge;
    this.webhookDispatcherBridge = webhookDispatcherBridge;
    this.now = now;
    this.maxTelemetryAgeMs = Number(maxTelemetryAgeMs);
    this.providerId = providerId;
    this.projectionType = projectionType;
  }

  createProviderContract({ required = false } = {}) {
    return {
      providerId: this.providerId,
      projectionType: this.projectionType,
      contractVersion: '1.0.0',
      required,
      sourceDomain: 'NotificationPlatform',
      maxAgeMs: this.maxTelemetryAgeMs,
      dependencies: [
        'notification-delivery-orchestration-core',
        'notification-reliability-subsystem',
        'notification-governance-safety-integration',
        'notification-template-domain'
      ],
      isHealthy: () => this.isHealthy(),
      project: (context = {}) => this.project(context)
    };
  }

  isHealthy() {
    return Boolean(
      this.deliveryCore
      && typeof this.deliveryCore.listJobs === 'function'
      && this.reliabilitySubsystem
      && typeof this.reliabilitySubsystem.getTelemetrySnapshot === 'function'
      && this.governanceIntegration
      && typeof this.governanceIntegration.getTelemetrySnapshot === 'function'
      && this.templateDomain
      && typeof this.templateDomain.listTemplates === 'function'
    );
  }

  rebuildProjection(context = {}) {
    return this.project(context);
  }

  project(context = {}) {
    const checkedAt = nowIso(this.now);
    const scope = asObject(context.filters, {});
    const warnings = [];

    if (!this.isHealthy()) {
      throw new Error('Notification observability provider dependencies are not connected.');
    }

    const jobs = asArray(this.deliveryCore.listJobs({})).filter((job) => scopeMatches(job, scope));
    const deliveryTelemetry = asObject(this.deliveryCore.getTelemetrySnapshot?.(), {});

    const reliabilityTelemetry = asObject(this.reliabilitySubsystem.getTelemetrySnapshot?.(), {});
    const deadLetters = asArray(this.reliabilitySubsystem.listDeadLetters?.({
      businessId: scope.businessId ?? null,
      customerId: scope.customerId ?? null
    }));

    const governanceTelemetry = asObject(this.governanceIntegration.getTelemetrySnapshot?.(), {});
    const governanceAudit = asArray(this.governanceIntegration.listAuditRecords?.()).filter((entry) => scopeMatches(asObject(entry.details), scope));

    const templates = asArray(this.templateDomain.listTemplates?.()).filter((template) => {
      if (hasText(scope.businessId)) {
        return String(template.businessScope) === String(scope.businessId) || String(template.businessScope).toUpperCase() === 'GLOBAL';
      }
      return true;
    });
    const templateTelemetry = asObject(this.templateDomain.getTelemetrySnapshot?.(), {});
    const templateAudit = asArray(this.templateDomain.listTemplateAudit?.());

    const emailHealth = this.emailDispatcherBridge?.getHealth?.() ?? null;
    const emailTelemetry = asObject(this.emailDispatcherBridge?.getTelemetrySnapshot?.(), {});
    const webhookHealth = this.webhookDispatcherBridge?.getHealth?.() ?? null;
    const webhookTelemetry = asObject(this.webhookDispatcherBridge?.getTelemetrySnapshot?.(), {});

    const deliveryHealth = this.buildDeliveryHealth({ jobs, warnings });
    const queueHealth = this.buildQueueHealth({ jobs, deliveryTelemetry, warnings });
    const reliability = this.buildReliability({ jobs, deadLetters, reliabilityTelemetry, warnings });
    const governance = this.buildGovernance({ governanceTelemetry, governanceAudit, scope, warnings });
    const templateHealth = this.buildTemplateHealth({ templates, templateTelemetry, templateAudit, scope, warnings });
    const providerHealth = this.buildProviderHealth({ emailHealth, emailTelemetry, webhookHealth, webhookTelemetry, warnings });
    const incidents = this.buildIncidents({ jobs, deadLetters, providerHealth, governance, reliability, scope });
    const customerHealthFoundation = this.buildCustomerHealthFoundation({ jobs, incidents, governance });

    const freshness = {
      deliveryHealth: projectFreshness({
        checkedAt,
        sourceTimestamp: deliveryHealth.lastObservedAt,
        maxAgeMs: this.maxTelemetryAgeMs
      }),
      providerHealth: projectFreshness({
        checkedAt,
        sourceTimestamp: providerHealth.lastObservedAt,
        maxAgeMs: this.maxTelemetryAgeMs
      }),
      queueHealth: projectFreshness({
        checkedAt,
        sourceTimestamp: queueHealth.lastObservedAt,
        maxAgeMs: this.maxTelemetryAgeMs
      }),
      reliability: projectFreshness({
        checkedAt,
        sourceTimestamp: reliability.lastObservedAt,
        maxAgeMs: this.maxTelemetryAgeMs
      }),
      governance: projectFreshness({
        checkedAt,
        sourceTimestamp: governance.lastObservedAt,
        maxAgeMs: this.maxTelemetryAgeMs
      }),
      templateHealth: projectFreshness({
        checkedAt,
        sourceTimestamp: templateHealth.lastObservedAt,
        maxAgeMs: this.maxTelemetryAgeMs
      }),
      operationalIncidents: projectFreshness({
        checkedAt,
        sourceTimestamp: incidents.lastObservedAt,
        maxAgeMs: this.maxTelemetryAgeMs
      }),
      customerHealthFoundation: projectFreshness({
        checkedAt,
        sourceTimestamp: customerHealthFoundation.lastObservedAt,
        maxAgeMs: this.maxTelemetryAgeMs
      })
    };

    Object.entries(freshness).forEach(([section, item]) => {
      if (item.stale) {
        warnings.push(`Telemetry for ${section} is stale.`);
      }
    });

    if (hasText(scope.businessId) || hasText(scope.customerId)) {
      warnings.push('Scoped projection mode is active; global-only counters are omitted where attribution is unavailable.');
    }

    const payload = redact({
      readOnly: true,
      safety: {
        secretsExposed: false,
        messageBodiesExposed: false,
        customerSensitivePayloadExposed: false
      },
      filters: {
        businessId: scope.businessId ?? null,
        customerId: scope.customerId ?? null
      },
      freshness,
      deliveryHealth,
      providerHealth,
      queueHealth,
      reliability,
      governance,
      templateHealth,
      operationalIncidents: {
        total: incidents.records.length,
        records: incidents.records
      },
      customerHealthFoundation,
      projectionInventory: [
        'Delivery Health',
        'Provider Health',
        'Queue Health',
        'Reliability',
        'Governance',
        'Template Health',
        'Operational Incidents',
        'Customer Health Foundation'
      ]
    });

    const aggregateMetrics = {
      totalNotifications: deliveryHealth.totalNotifications,
      delivered: deliveryHealth.delivered,
      retrying: deliveryHealth.retrying,
      queued: deliveryHealth.queued,
      failed: deliveryHealth.failed + deliveryHealth.deadLetter,
      providerLatencyMs: providerHealth.aggregate.averageLatencyMs,
      retryLatencyMs: reliability.recoveryLatency.averageMs,
      deadLetterBacklog: reliability.deadLetterBacklog,
      suppressionCounts: governance.suppressions,
      approvalBacklog: governance.approvalPending,
      policyDistribution: governance.policyDistribution,
      templateHealth: {
        activeTemplates: templateHealth.activeTemplates,
        reviewTemplates: templateHealth.reviewTemplates,
        retiredTemplates: templateHealth.retiredTemplates,
        renderFailures: templateHealth.renderFailures
      }
    };

    return {
      providerId: this.providerId,
      projectionId: `${this.providerId}.${String(checkedAt).replace(/[:.]/g, '-')}`,
      projectionType: this.projectionType,
      contractVersion: '1.0.0',
      source: 'NotificationObservabilityProjectionProvider',
      status: warnings.length > 0 ? DataAvailabilityStatuses.PARTIAL : DataAvailabilityStatuses.AVAILABLE,
      generatedAt: checkedAt,
      aggregateMetrics,
      warnings,
      incidents: incidents.records,
      payload
    };
  }

  buildDeliveryHealth({ jobs, warnings }) {
    const totals = {
      totalNotifications: 0,
      delivered: 0,
      retrying: 0,
      queued: 0,
      dispatching: 0,
      failed: 0,
      deadLetter: 0,
      expired: 0,
      cancelled: 0,
      other: 0
    };

    const byChannel = {};
    const byProvider = {};
    const byBusiness = {};
    const byClassification = {};

    let lastObservedAt = null;

    jobs.forEach((job) => {
      const bucket = mapJobStateToDeliveryBucket(job.status);
      addDeliveryCount(totals, bucket);

      const channel = String(job.channel ?? 'UNKNOWN').toUpperCase();
      const provider = String(job.providerId ?? 'UNRESOLVED_PROVIDER').toUpperCase();
      const business = String(job.businessId ?? 'UNKNOWN');
      const classification = String(job.classification ?? NotificationIntentClassifications.SYSTEM).toUpperCase();

      addDeliveryCount(ensureCounter(byChannel, channel), bucket);
      addDeliveryCount(ensureCounter(byProvider, provider), bucket);
      addDeliveryCount(ensureCounter(byBusiness, business), bucket);
      addDeliveryCount(ensureCounter(byClassification, classification), bucket);

      const updatedAt = Date.parse(String(job.updatedAt ?? job.createdAt ?? ''));
      if (Number.isFinite(updatedAt)) {
        const iso = new Date(updatedAt).toISOString();
        if (!lastObservedAt || iso > lastObservedAt) lastObservedAt = iso;
      }
    });

    if (totals.totalNotifications === 0) {
      warnings.push('Delivery health has no notifications in scope.');
    }

    return {
      ...totals,
      breakDownByChannel: byChannel,
      breakDownByProvider: byProvider,
      breakDownByBusiness: byBusiness,
      breakDownByClassification: byClassification,
      lastObservedAt
    };
  }

  buildQueueHealth({ jobs, deliveryTelemetry, warnings }) {
    const queuedJobs = jobs.filter((job) => String(job.status).toUpperCase() === NotificationDeliveryJobStates.QUEUED);
    const dispatchingJobs = jobs.filter((job) => String(job.status).toUpperCase() === NotificationDeliveryJobStates.DISPATCHING);
    const retryingJobs = jobs.filter((job) => String(job.status).toUpperCase() === NotificationDeliveryJobStates.DELIVERY_FAILED_RETRYABLE);

    const queueDepth = toNumber(deliveryTelemetry['queue.depth'], queuedJobs.length);
    const delayedQueue = queuedJobs.filter((job) => Date.parse(String(job.availableAt ?? '')) > nowMs(this.now)).length;

    const latest = queuedJobs
      .map((job) => Date.parse(String(job.updatedAt ?? job.createdAt ?? '')))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)[0] ?? null;

    if (queueDepth > 0 && dispatchingJobs.length === 0) {
      warnings.push('Queue has pending jobs while no jobs are dispatching.');
    }

    return {
      queueDepth,
      queued: queuedJobs.length,
      dispatching: dispatchingJobs.length,
      retryBacklog: retryingJobs.length,
      delayedQueue,
      leaseContentionDenials: toNumber(deliveryTelemetry['lease.contention_denials'], 0),
      persistenceFailures: toNumber(deliveryTelemetry['persistence.failures'], 0),
      lastObservedAt: latest != null ? new Date(latest).toISOString() : null
    };
  }

  buildReliability({ jobs, deadLetters, reliabilityTelemetry, warnings }) {
    const retryBacklog = jobs.filter((job) => String(job.status).toUpperCase() === NotificationDeliveryJobStates.DELIVERY_FAILED_RETRYABLE).length;
    const deadLetterBacklog = deadLetters.length;
    const restartRecoveries = toNumber(reliabilityTelemetry['reliability.recovery.restart.count'], 0);
    const totalRecoveryLatencyMs = toNumber(reliabilityTelemetry['reliability.recovery.latency.total_ms'], 0);

    const lastObservedAt = deadLetters
      .map((entry) => String(entry.createdAt ?? ''))
      .filter((value) => hasText(value))
      .sort()
      .slice(-1)[0] ?? null;

    if (deadLetterBacklog > 0) {
      warnings.push('Dead-letter backlog is non-zero and requires operational review.');
    }

    return {
      retryBacklog,
      retrySuccessRate: toNumber(reliabilityTelemetry['reliability.retry.success_rate'], 0),
      deadLetterBacklog,
      staleLeaseRecoveries: toNumber(reliabilityTelemetry['reliability.recovery.stale_lease.count'], 0),
      restartRecoveries,
      reconciliationFindings: toNumber(reliabilityTelemetry['reliability.reconciliation.findings.count'], 0),
      recoveryLatency: {
        totalMs: totalRecoveryLatencyMs,
        averageMs: restartRecoveries > 0 ? Number((totalRecoveryLatencyMs / restartRecoveries).toFixed(2)) : 0
      },
      exhaustionRate: toNumber(reliabilityTelemetry['reliability.retry.exhaustion_rate'], 0),
      lastObservedAt
    };
  }

  buildGovernance({ governanceTelemetry, governanceAudit, scope, warnings }) {
    const eventCount = (eventName) => governanceAudit.filter((entry) => String(entry.event) === eventName).length;

    let approvalPending = toNumber(governanceTelemetry['governance.approval.pending.backlog'], 0);
    if ((hasText(scope.businessId) || hasText(scope.customerId)) && approvalPending > 0) {
      approvalPending = 0;
      warnings.push('Approval backlog cannot be safely attributed in scoped mode and is returned as 0.');
    }

    const suppressions = {
      consent: toNumber(governanceTelemetry['governance.preference.suppression.count'], eventCount('governance_policy_failed')),
      duplicate: toNumber(governanceTelemetry['governance.duplicate.suppressed.count'], eventCount('duplicate_suppressed')),
      quietHours: toNumber(governanceTelemetry['governance.quiet_hours.deferred.count'], eventCount('quiet_hours_deferred')),
      rateLimit: toNumber(governanceTelemetry['governance.rate_limit.suppressed.count'], eventCount('rate_limit_suppressed'))
    };

    const securityOverrides = toNumber(governanceTelemetry['governance.override.security.count'], eventCount('security_override'));
    const legalOverrides = governanceAudit
      .filter((entry) => String(entry.event) === 'mandatory_notice_override')
      .filter((entry) => /legal/i.test(String(entry.details?.reason ?? '')))
      .length;

    const policyFailures = toNumber(governanceTelemetry['governance.policy.failures.count'], eventCount('governance_policy_failed'));
    const crossTenantDenials = toNumber(governanceTelemetry['governance.cross_tenant.denials.count'], eventCount('cross_tenant_access_denied'));

    if (policyFailures > 0 || crossTenantDenials > 0) {
      warnings.push('Governance denials/failures detected in projection window.');
    }

    const latestAudit = governanceAudit
      .map((entry) => String(entry.at ?? ''))
      .filter((value) => hasText(value))
      .sort()
      .slice(-1)[0] ?? null;

    return {
      approvalPending,
      suppressions,
      securityOverrides,
      legalOverrides,
      crossTenantDenials,
      policyFailures,
      policyDistribution: {
        approvalRequired: approvalPending,
        preferenceSuppression: suppressions.consent,
        duplicateSuppression: suppressions.duplicate,
        quietHoursDeferral: suppressions.quietHours,
        rateLimitSuppression: suppressions.rateLimit,
        securityOverride: securityOverrides,
        legalOverride: legalOverrides,
        crossTenantDenied: crossTenantDenials,
        policyFailure: policyFailures
      },
      lastObservedAt: latestAudit
    };
  }

  buildTemplateHealth({ templates, templateTelemetry, templateAudit, scope, warnings }) {
    const activeTemplates = templates.filter((template) => String(template.status).toUpperCase() === NotificationTemplateStates.ACTIVE).length;
    const reviewTemplates = templates.filter((template) => String(template.status).toUpperCase() === NotificationTemplateStates.REVIEW).length;
    const retiredTemplates = templates.filter((template) => String(template.status).toUpperCase() === NotificationTemplateStates.RETIRED).length;

    let fallbackFrequency = toNumber(templateTelemetry['render.fallback.count'], 0);
    let renderFailures = toNumber(templateTelemetry['render.failure.count'], 0);
    let unresolvedPlaceholderFailures = toNumber(templateTelemetry['render.unresolved_placeholder.count'], 0);

    if ((hasText(scope.businessId) || hasText(scope.customerId)) && (fallbackFrequency > 0 || renderFailures > 0 || unresolvedPlaceholderFailures > 0)) {
      fallbackFrequency = 0;
      renderFailures = 0;
      unresolvedPlaceholderFailures = 0;
      warnings.push('Template render telemetry is global-only and omitted in scoped projection mode.');
    }

    const previewActivity = templateAudit.filter((entry) => String(entry.event) === 'preview_rendered').length;
    const latestAudit = templateAudit
      .map((entry) => String(entry.at ?? ''))
      .filter((value) => hasText(value))
      .sort()
      .slice(-1)[0] ?? null;

    return {
      activeTemplates,
      reviewTemplates,
      retiredTemplates,
      fallbackFrequency,
      renderFailures,
      unresolvedPlaceholderFailures,
      previewActivity,
      lastObservedAt: latestAudit
    };
  }

  buildProviderHealth({ emailHealth, emailTelemetry, webhookHealth, webhookTelemetry, warnings }) {
    const emailAttempts = toNumber(emailTelemetry['email.dispatch.succeeded'], 0) + toNumber(emailTelemetry['email.dispatch.failed'], 0);
    const webhookAttempts = toNumber(webhookTelemetry['webhook.dispatch.succeeded'], 0) + toNumber(webhookTelemetry['webhook.dispatch.failed'], 0);

    const emailAverageLatency = emailAttempts > 0
      ? Number((toNumber(emailTelemetry['email.latency.total_ms'], 0) / emailAttempts).toFixed(2))
      : 0;
    const webhookAverageLatency = webhookAttempts > 0
      ? Number((toNumber(webhookTelemetry['webhook.latency.total_ms'], 0) / webhookAttempts).toFixed(2))
      : 0;

    const emailProvider = {
      availability: String(emailHealth?.provider?.healthState ?? DataAvailabilityStatuses.NOT_CONNECTED),
      latency: {
        averageMs: emailAverageLatency,
        totalMs: toNumber(emailTelemetry['email.latency.total_ms'], 0)
      },
      failures: toNumber(emailTelemetry['email.dispatch.failed'], 0),
      rateLimits: toNumber(emailTelemetry['email.rate_limited'], 0),
      configurationStatus: emailHealth?.startupReadiness?.ready === true ? 'READY' : 'NOT_READY'
    };

    const webhookProvider = {
      availability: String(webhookHealth?.provider?.healthState ?? DataAvailabilityStatuses.NOT_CONNECTED),
      latency: {
        averageMs: webhookAverageLatency,
        totalMs: toNumber(webhookTelemetry['webhook.latency.total_ms'], 0)
      },
      receiverFailures: toNumber(webhookTelemetry['webhook.receiver_rejections'], 0),
      signingHealth: webhookHealth?.startupReadiness?.issues?.some((entry) => /sign/i.test(String(entry))) ? 'DEGRADED' : 'HEALTHY',
      endpointHealth: {
        rejectedEndpoints: toNumber(webhookTelemetry['webhook.endpoint.rejected'], 0),
        configurationStatus: webhookHealth?.startupReadiness?.ready === true ? 'READY' : 'NOT_READY'
      },
      rateLimits: toNumber(webhookTelemetry['webhook.rate_limited'], 0),
      failures: toNumber(webhookTelemetry['webhook.dispatch.failed'], 0)
    };

    const missing = [];
    if (!emailHealth) missing.push('EMAIL');
    if (!webhookHealth) missing.push('WEBHOOK');
    if (missing.length > 0) {
      warnings.push(`Provider health source missing for ${missing.join(', ')}.`);
    }

    const latestAt = [
      emailHealth?.startupReadiness?.checkedAt,
      webhookHealth?.startupReadiness?.checkedAt
    ].filter((value) => hasText(value)).sort().slice(-1)[0] ?? null;

    return {
      EMAIL: emailProvider,
      WEBHOOK: webhookProvider,
      aggregate: {
        totalFailures: emailProvider.failures + webhookProvider.failures,
        totalRateLimits: emailProvider.rateLimits + webhookProvider.rateLimits,
        averageLatencyMs: Number(((emailAverageLatency + webhookAverageLatency) / 2).toFixed(2))
      },
      lastObservedAt: latestAt
    };
  }

  buildIncidents({ jobs, deadLetters, providerHealth, governance, reliability, scope }) {
    const incidents = [];

    if (deadLetters.length > 0) {
      const affectedBusinesses = Array.from(new Set(deadLetters.map((entry) => String(entry.businessId ?? 'UNKNOWN'))));
      const firstSeen = deadLetters.map((entry) => String(entry.createdAt ?? '')).sort()[0] ?? null;
      const lastSeen = deadLetters.map((entry) => String(entry.createdAt ?? '')).sort().slice(-1)[0] ?? null;

      incidents.push({
        incidentId: `incident.deadletter.${stableHash(JSON.stringify({ affectedBusinesses, firstSeen, lastSeen })).slice(0, 16)}`,
        severity: 'HIGH',
        category: 'RELIABILITY',
        status: 'OPEN',
        firstSeen,
        lastSeen,
        affectedProvider: 'MULTIPLE',
        affectedBusinesses,
        correlationIds: deadLetters.map((entry) => entry.correlationId).filter((value) => hasText(value)).slice(0, 50),
        recoveryStatus: {
          state: reliability.deadLetterBacklog > 0 ? 'PENDING' : 'RECOVERED',
          note: 'Dead-letter records require manual operator review.'
        }
      });
    }

    if (providerHealth.EMAIL.failures > 0 || providerHealth.WEBHOOK.failures > 0) {
      incidents.push({
        incidentId: `incident.provider.${stableHash(`${providerHealth.EMAIL.failures}:${providerHealth.WEBHOOK.failures}`).slice(0, 16)}`,
        severity: 'MEDIUM',
        category: 'PROVIDER_HEALTH',
        status: 'OPEN',
        firstSeen: null,
        lastSeen: nowIso(this.now),
        affectedProvider: providerHealth.EMAIL.failures >= providerHealth.WEBHOOK.failures ? 'EMAIL' : 'WEBHOOK',
        affectedBusinesses: Array.from(new Set(jobs.map((job) => String(job.businessId ?? 'UNKNOWN')))).slice(0, 200),
        correlationIds: [],
        recoveryStatus: {
          state: 'MONITORING',
          note: 'Provider failure telemetry indicates degraded dispatch outcomes.'
        }
      });
    }

    if (governance.policyFailures > 0 || governance.crossTenantDenials > 0) {
      incidents.push({
        incidentId: `incident.governance.${stableHash(`${governance.policyFailures}:${governance.crossTenantDenials}`).slice(0, 16)}`,
        severity: governance.crossTenantDenials > 0 ? 'HIGH' : 'MEDIUM',
        category: 'GOVERNANCE',
        status: 'OPEN',
        firstSeen: governance.lastObservedAt,
        lastSeen: governance.lastObservedAt,
        affectedProvider: null,
        affectedBusinesses: hasText(scope.businessId)
          ? [String(scope.businessId)]
          : Array.from(new Set(jobs.map((job) => String(job.businessId ?? 'UNKNOWN')))).slice(0, 200),
        correlationIds: [],
        recoveryStatus: {
          state: 'PENDING',
          note: 'Governance failures require policy and data isolation review.'
        }
      });
    }

    return {
      records: incidents,
      lastObservedAt: incidents.map((entry) => entry.lastSeen).filter((value) => hasText(value)).sort().slice(-1)[0] ?? null
    };
  }

  buildCustomerHealthFoundation({ jobs, incidents, governance }) {
    const websiteHistory = jobs
      .filter((job) => /WEBSITE/i.test(String(job.notificationType ?? '')))
      .map((job) => ({
        jobId: job.jobId,
        status: job.status,
        channel: job.channel,
        businessId: job.businessId,
        customerId: job.customerId,
        updatedAt: job.updatedAt ?? job.createdAt ?? null
      }))
      .slice(-100);

    const delivered = jobs.filter((job) => mapJobStateToDeliveryBucket(job.status) === 'delivered').length;
    const failures = jobs.filter((job) => ['failed', 'deadLetter', 'expired', 'cancelled'].includes(mapJobStateToDeliveryBucket(job.status))).length;
    const total = jobs.length;
    const successRate = total > 0 ? Number((delivered / total).toFixed(6)) : 0;

    const trends = {};
    jobs.forEach((job) => incrementTrend(trends, job.updatedAt ?? job.createdAt));

    const unresolvedIncidents = incidents.records.filter((entry) => String(entry.recoveryStatus?.state ?? '') !== 'RECOVERED').length;

    const communicationHealth = successRate >= 0.97
      ? 'HEALTHY'
      : (successRate >= 0.9 ? 'DEGRADED' : 'CRITICAL');

    return {
      websiteNotificationHistory: websiteHistory,
      deliverySuccess: {
        total,
        delivered,
        failures,
        successRate
      },
      customerCommunicationHealth: {
        status: communicationHealth,
        governanceRiskSignals: governance.policyFailures + governance.crossTenantDenials
      },
      recentRecommendations: [
        unresolvedIncidents > 0
          ? 'Prioritize unresolved notification incidents before increasing throughput.'
          : 'No unresolved incidents detected; continue standard reliability monitoring.',
        successRate < 0.97
          ? 'Investigate delivery failures and tune retry/channel fallback strategies.'
          : 'Delivery success is stable; maintain current policy thresholds.',
        governance.crossTenantDenials > 0
          ? 'Review tenant isolation policy denials for potential integration issues.'
          : 'No cross-tenant denials observed in current projection.'
      ],
      unresolvedIncidents,
      notificationTrends: Object.entries(trends)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([day, count]) => ({ day, count })),
      internalOnly: true,
      futureUseCases: [
        'Atlas Website Care Reports',
        'Atlas Business Health Reports'
      ],
      lastObservedAt: websiteHistory.map((entry) => entry.updatedAt).filter((value) => hasText(value)).sort().slice(-1)[0] ?? null
    };
  }
}
