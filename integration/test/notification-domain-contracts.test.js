import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NotificationContractVersions,
  NotificationSensitivityLevels,
  NotificationIntentClassifications,
  NotificationChannels,
  NotificationV1Channels,
  NotificationReservedChannels,
  NotificationIntentStates,
  NotificationDeliveryJobStates,
  NotificationPolicyOutcomes,
  NotificationCompositionStates,
  NotificationFailureClasses,
  NotificationFailureMetadata,
  NotificationConsentStates,
  NotificationProviderHealthStates,
  isAdditiveCompatibleVersion,
  createDomainEventEnvelope,
  validateDomainEventEnvelope,
  serializeDomainEventForAudit,
  createNotificationIntent,
  validateNotificationIntent,
  validateIntentStateTransition,
  createNotificationPolicyDecision,
  validateNotificationPolicyDecision,
  createNotificationComposition,
  validateNotificationComposition,
  createNotificationDeliveryJob,
  validateNotificationDeliveryJob,
  validateDeliveryJobStateTransition,
  createNotificationDeliveryAttempt,
  validateNotificationDeliveryAttempt,
  createNotificationDeliveryResult,
  validateNotificationDeliveryResult,
  createNotificationTemplate,
  validateNotificationTemplate,
  createNotificationProviderContract,
  validateNotificationProviderContract,
  createNotificationProviderError,
  createNotificationProviderResult,
  createConsentPreferenceRecord,
  validateConsentPreferenceRecord,
  createDeadLetterRecord,
  validateDeadLetterRecord,
  getFailureClassMetadata
} from '../src/executive/notification-domain-contracts.js';

test('notification channel contracts preserve V1 support and reserve future channels', () => {
  assert.deepEqual(NotificationV1Channels, [
    NotificationChannels.EXECUTIVE,
    NotificationChannels.EMAIL,
    NotificationChannels.WEBHOOK
  ]);

  assert.equal(NotificationReservedChannels.includes(NotificationChannels.SMS), true);
  assert.equal(NotificationReservedChannels.includes(NotificationChannels.PUSH), true);
  assert.equal(NotificationReservedChannels.includes(NotificationChannels.IN_APP), true);
});

test('contract versions support additive semver evolution within major version 1', () => {
  assert.equal(isAdditiveCompatibleVersion('1.0.0'), true);
  assert.equal(isAdditiveCompatibleVersion('1.99.10'), true);
  assert.equal(isAdditiveCompatibleVersion('2.0.0'), false);
  assert.equal(isAdditiveCompatibleVersion('not-semver'), false);
  assert.equal(NotificationContractVersions.DOMAIN_EVENT, '1.0.0');
});

test('domain event envelope validates and freezes valid envelope', () => {
  const event = createDomainEventEnvelope({
    eventType: 'EXECUTIVE_ALERT_TRIGGERED',
    sourceSystem: 'executive-ops',
    sourceEntityType: 'alert',
    sourceEntityId: 'alert_001',
    businessId: 'biz_001',
    customerId: 'cust_001',
    correlationId: 'corr_001',
    causationId: 'cause_001',
    sensitivity: NotificationSensitivityLevels.INTERNAL,
    payload: {
      summary: 'Threshold exceeded',
      metrics: { cpu: 92 }
    },
    metadata: {
      traceId: 'trace_123'
    }
  });

  const validation = validateDomainEventEnvelope(event);

  assert.equal(validation.isValid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.payload), true);
  assert.equal(event.eventVersion, '1.0.0');
});

test('domain event envelope rejects forbidden provider and channel instructions', () => {
  const result = validateDomainEventEnvelope({
    eventId: 'evt_001',
    eventType: 'TEST',
    eventVersion: '1.0.0',
    occurredAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
    sourceSystem: 'ops',
    sourceEntityType: 'entity',
    sourceEntityId: 'entity_1',
    businessId: 'biz_1',
    correlationId: 'corr_1',
    sensitivity: NotificationSensitivityLevels.INTERNAL,
    payload: {
      provider: 'twilio',
      nested: {
        candidateChannels: ['EMAIL']
      }
    },
    metadata: {
      routeProvider: 'mailgun'
    }
  });

  assert.equal(result.isValid, false);
  assert.equal(result.issues.some(issue => issue.includes('forbidden provider/channel instruction keys')), true);
});

test('domain event envelope rejects incompatible major versions', () => {
  const result = validateDomainEventEnvelope({
    eventId: 'evt_compat_1',
    eventType: 'TYPE',
    eventVersion: '2.0.0',
    occurredAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
    sourceSystem: 'ops',
    sourceEntityType: 'entity',
    sourceEntityId: 'ent_1',
    businessId: 'biz_1',
    correlationId: 'corr_1',
    sensitivity: NotificationSensitivityLevels.INTERNAL,
    payload: {}
  });

  assert.equal(result.isValid, false);
  assert.equal(result.issues.some(issue => issue.includes('major must be 1')), true);
});

test('audit serializer redacts sensitive payload and metadata fields', () => {
  const event = createDomainEventEnvelope({
    eventType: 'SECURITY_INCIDENT',
    sourceSystem: 'security-center',
    sourceEntityType: 'incident',
    sourceEntityId: 'inc_42',
    businessId: 'biz_007',
    correlationId: 'corr_007',
    sensitivity: NotificationSensitivityLevels.RESTRICTED,
    payload: {
      recipientEmail: 'leader@example.com',
      nested: {
        accessToken: 'secret-token-value'
      },
      safeField: 'visible'
    },
    metadata: {
      authorization: 'Bearer token',
      requestId: 'req_1'
    }
  });

  const serialized = serializeDomainEventForAudit(event);

  assert.equal(serialized.payload.recipientEmail, '[REDACTED]');
  assert.equal(serialized.payload.nested.accessToken, '[REDACTED]');
  assert.equal(serialized.payload.safeField, 'visible');
  assert.equal(serialized.metadata.authorization, '[REDACTED]');
  assert.equal(serialized.metadata.requestId, 'req_1');
  assert.equal(Object.isFrozen(serialized), true);
});

test('notification intent enforces classification, recipients, channels, and identity links', () => {
  const intent = createNotificationIntent({
    sourceEventId: 'evt_001',
    notificationType: 'EXECUTIVE_ALERT',
    classification: NotificationIntentClassifications.OPERATIONAL,
    audienceType: 'EXECUTIVE',
    recipientRefs: [{ role: 'CEO', principalId: 'usr_001' }],
    candidateChannels: ['EXECUTIVE', 'EMAIL'],
    templateRef: { templateId: 'tmpl_ops_alert', templateVersion: '1.0.0' },
    urgency: 'HIGH',
    governanceRequirements: { legalReviewRequired: false },
    consentRequirements: { requireOptIn: false },
    schedulingConstraints: { earliestAt: new Date().toISOString() },
    dedupeKey: 'dedupe-001',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    correlationId: 'corr_001',
    causationId: 'cause_001',
    businessId: 'biz_001',
    customerId: 'cust_001',
    missionId: 'mission_001',
    state: NotificationIntentStates.CREATED
  });

  const validation = validateNotificationIntent(intent);

  assert.equal(validation.isValid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(Object.isFrozen(intent), true);
});

test('notification intent allows MARKETING classification in schema', () => {
  const intent = createNotificationIntent({
    sourceEventId: 'evt_marketing_1',
    notificationType: 'CAMPAIGN_PING',
    classification: NotificationIntentClassifications.MARKETING,
    audienceType: 'CUSTOMER',
    recipientRefs: [{ customerId: 'cust_009' }],
    candidateChannels: ['EMAIL'],
    templateRef: { templateId: 'tmpl_marketing', templateVersion: '1.0.0' },
    dedupeKey: 'mk-1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    correlationId: 'corr_marketing_1',
    businessId: 'biz_009'
  });

  assert.equal(intent.classification, NotificationIntentClassifications.MARKETING);
});

test('notification intent validation reports invalid channel and missing recipients', () => {
  const validation = validateNotificationIntent({
    intentId: 'nint_001',
    sourceEventId: 'evt_001',
    notificationType: 'TEST',
    classification: 'OPERATIONAL',
    audienceType: 'EXECUTIVE',
    recipientRefs: [],
    candidateChannels: ['FAX'],
    templateRef: {},
    urgency: 'NORMAL',
    governanceRequirements: {},
    consentRequirements: {},
    schedulingConstraints: {},
    dedupeKey: 'd-1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    correlationId: 'corr_1',
    businessId: 'biz_1',
    state: NotificationIntentStates.CREATED
  });

  assert.equal(validation.isValid, false);
  assert.equal(validation.issues.some(issue => issue.includes('recipientRefs must include')), true);
  assert.equal(validation.issues.some(issue => issue.includes('unsupported channel')), true);
});

test('intent state transition map accepts valid and rejects invalid transitions', () => {
  const allowed = validateIntentStateTransition({
    fromState: NotificationIntentStates.CREATED,
    toState: NotificationIntentStates.POLICY_PENDING
  });

  const denied = validateIntentStateTransition({
    fromState: NotificationIntentStates.CREATED,
    toState: NotificationIntentStates.JOBS_CREATED
  });

  assert.equal(allowed.isValid, true);
  assert.equal(denied.isValid, false);
  assert.equal(denied.reason.includes('Invalid intent state transition'), true);
});

test('policy decision contract validates deterministic snapshot hash and enum outcome', () => {
  const decision = createNotificationPolicyDecision({
    intentId: 'nint_001',
    outcome: NotificationPolicyOutcomes.ALLOW,
    reasonCodes: ['POLICY_RULE_MATCH'],
    correlationId: 'corr_001'
  });

  const validation = validateNotificationPolicyDecision(decision);

  assert.equal(validation.isValid, true);
  assert.equal(decision.inputsSnapshotHash.length, 64);
  assert.equal(Object.isFrozen(decision), true);
});

test('composition contract validates render schema and integrity hash', () => {
  const composition = createNotificationComposition({
    intentId: 'nint_002',
    templateId: 'tmpl_ops_1',
    templateVersion: '1.2.0',
    channel: NotificationChannels.EMAIL,
    locale: 'en-US',
    renderSchemaVersion: '1.1.0',
    contentRef: 'content://notification/abc123',
    contentIntegrityHash: 'a'.repeat(64),
    state: NotificationCompositionStates.RENDERED
  });

  const validation = validateNotificationComposition(composition);

  assert.equal(validation.isValid, true);
  assert.equal(Object.isFrozen(composition), true);
});

test('delivery job contract validates lease metadata and state progression definitions', () => {
  const job = createNotificationDeliveryJob({
    intentId: 'nint_010',
    channel: NotificationChannels.EMAIL,
    providerId: 'provider_mailgun',
    recipient: { email: 'ops@example.com' },
    templateVersion: '1.0.1',
    renderedContentRef: 'content://notification/rendered/1',
    idempotencyKey: 'idem_001',
    priority: 80,
    maximumAttempts: 4,
    status: NotificationDeliveryJobStates.QUEUED,
    lease: {
      holderId: 'worker_1',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      leaseVersion: 1
    },
    correlationId: 'corr_010',
    businessId: 'biz_010',
    customerId: 'cust_010'
  });

  const validation = validateNotificationDeliveryJob(job);

  assert.equal(validation.isValid, true);
  assert.equal(Object.isFrozen(job), true);

  const allowed = validateDeliveryJobStateTransition({
    fromState: NotificationDeliveryJobStates.QUEUED,
    toState: NotificationDeliveryJobStates.DISPATCHING
  });
  const denied = validateDeliveryJobStateTransition({
    fromState: NotificationDeliveryJobStates.QUEUED,
    toState: NotificationDeliveryJobStates.DELIVERED
  });

  assert.equal(allowed.isValid, true);
  assert.equal(denied.isValid, false);
});

test('delivery attempt and result contracts enforce failure taxonomy metadata defaults', () => {
  const attempt = createNotificationDeliveryAttempt({
    jobId: 'njob_001',
    attemptNumber: 1,
    providerId: 'provider_sendgrid',
    providerRequestRef: 'req_sendgrid_1',
    outcome: 'FAILED_RETRYABLE',
    errorClass: NotificationFailureClasses.PROVIDER_UNAVAILABLE,
    correlationId: 'corr_200'
  });

  const attemptValidation = validateNotificationDeliveryAttempt(attempt);
  assert.equal(attemptValidation.isValid, true);

  const result = createNotificationDeliveryResult({
    jobId: attempt.jobId,
    attemptId: attempt.attemptId,
    outcome: 'FAILED_RETRYABLE',
    classifiedFailure: NotificationFailureClasses.PROVIDER_UNAVAILABLE
  });

  const resultValidation = validateNotificationDeliveryResult(result);

  assert.equal(resultValidation.isValid, true);
  assert.equal(result.retryable, true);
  assert.equal(result.terminal, false);
  assert.equal(result.customerVisible, false);
  assert.equal(result.executiveVisible, true);

  const metadata = getFailureClassMetadata(NotificationFailureClasses.PROVIDER_UNAVAILABLE);
  assert.equal(metadata.retryable, true);
  assert.equal(metadata.terminal, false);
});

test('template contract validates lifecycle and schema fields', () => {
  const template = createNotificationTemplate({
    templateId: 'tmpl_ops_escalation',
    version: '1.0.0',
    notificationType: 'OPS_ESCALATION',
    classification: NotificationIntentClassifications.OPERATIONAL,
    channel: NotificationChannels.EXECUTIVE,
    businessScope: 'global',
    locale: 'en-US',
    status: 'APPROVED',
    variableSchema: {
      required: ['title', 'summary']
    },
    content: {
      title: '{{title}}',
      body: '{{summary}}'
    },
    approvalMetadata: {
      approvedBy: 'director_1',
      approvedAt: new Date().toISOString()
    }
  });

  const validation = validateNotificationTemplate(template);

  assert.equal(validation.isValid, true);
  assert.equal(Object.isFrozen(template), true);
});

test('provider contract validates capabilities and health status', () => {
  const provider = createNotificationProviderContract({
    providerId: 'provider_mailgun',
    name: 'Mailgun',
    capabilities: {
      supportsIdempotency: true,
      supportsAttachments: true,
      supportsProviderTemplates: false,
      maximumPayloadBytes: 300000,
      supportedChannels: [NotificationChannels.EMAIL, NotificationChannels.WEBHOOK],
      healthReporting: true
    },
    healthState: NotificationProviderHealthStates.HEALTHY,
    errorMapVersion: '1.0.0'
  });

  const validation = validateNotificationProviderContract(provider);

  assert.equal(validation.isValid, true);
  assert.equal(Object.isFrozen(provider), true);
});

test('provider result and provider error contracts are immutable', () => {
  const error = createNotificationProviderError({
    classCode: NotificationFailureClasses.RATE_LIMITED,
    message: 'rate limit exceeded',
    retryable: true,
    providerRetryAfterMs: 5000,
    details: {
      quotaScope: 'minute'
    }
  });

  const result = createNotificationProviderResult({
    ok: false,
    providerId: 'provider_webhook',
    statusCode: 429,
    error,
    metadata: {
      requestId: 'provider_req_1'
    }
  });

  assert.equal(Object.isFrozen(error), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.error.retryable, true);
});

test('consent preference record validates explicit preferences by channel and class', () => {
  const record = createConsentPreferenceRecord({
    customerId: 'cust_999',
    businessId: 'biz_999',
    channel: NotificationChannels.EMAIL,
    notificationClass: NotificationIntentClassifications.TRANSACTIONAL,
    consentState: NotificationConsentStates.OPTED_IN,
    source: 'self-service-portal',
    version: 3
  });

  const validation = validateConsentPreferenceRecord(record);

  assert.equal(validation.isValid, true);
  assert.equal(Object.isFrozen(record), true);
});

test('dead-letter record validates lifecycle metadata', () => {
  const record = createDeadLetterRecord({
    jobId: 'njob_900',
    terminalReason: 'Maximum retries exhausted',
    finalAttemptAt: new Date().toISOString(),
    replayEligibility: true,
    acknowledgedAt: new Date().toISOString(),
    correlationId: 'corr_900'
  });

  const validation = validateDeadLetterRecord(record);

  assert.equal(validation.isValid, true);
  assert.equal(Object.isFrozen(record), true);
});

test('failure taxonomy definitions include metadata for each class', () => {
  const classes = Object.values(NotificationFailureClasses);

  classes.forEach((failureClass) => {
    const metadata = NotificationFailureMetadata[failureClass];
    assert.equal(Boolean(metadata), true);
    assert.equal(typeof metadata.retryable, 'boolean');
    assert.equal(typeof metadata.terminal, 'boolean');
    assert.equal(typeof metadata.customerVisible, 'boolean');
    assert.equal(typeof metadata.executiveVisible, 'boolean');
  });
});

test('explicit validation errors are emitted for invalid contract shapes', () => {
  const invalidEvent = validateDomainEventEnvelope({
    eventId: 'bad event id with spaces',
    eventType: '',
    eventVersion: 'x',
    occurredAt: 'not-a-date',
    recordedAt: 'not-a-date',
    sourceSystem: '',
    sourceEntityType: '',
    sourceEntityId: '',
    businessId: '',
    correlationId: '',
    sensitivity: 'UNKNOWN',
    payload: []
  });

  const invalidJob = validateNotificationDeliveryJob({
    jobId: 'job 1',
    intentId: '',
    channel: 'FAX',
    providerId: '',
    recipient: null,
    templateVersion: 'x',
    renderedContentRef: '',
    idempotencyKey: '',
    priority: 101,
    availableAt: 'bad-date',
    attemptCount: -1,
    maximumAttempts: 0,
    status: 'NONE',
    version: 0,
    lease: null,
    createdAt: 'bad-date',
    updatedAt: 'bad-date',
    correlationId: '',
    businessId: ''
  });

  assert.equal(invalidEvent.isValid, false);
  assert.equal(invalidEvent.issues.length > 5, true);
  assert.equal(invalidJob.isValid, false);
  assert.equal(invalidJob.issues.length > 5, true);
});
