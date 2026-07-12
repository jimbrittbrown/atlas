import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { createDomainEventEnvelope } from '../src/executive/notification-domain-contracts.js';
import { NotificationTemplateDomain } from '../src/executive/notification-template-domain.js';

function withDomain(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-template-domain-'));
  const provider = new SQLiteStorageProvider({ databasePath: join(dir, 'template-domain.sqlite') });
  const domain = new NotificationTemplateDomain({ storageProvider: provider });

  try {
    return callback({ domain, provider });
  } finally {
    provider.closeSync();
  }
}

function baseSchema() {
  return {
    allowUnknownVariables: false,
    fields: [
      { name: 'customerName', type: 'string', required: true, maxLength: 120, displayLabel: 'Customer Name' },
      { name: 'orderTotal', type: 'number', required: true, displayLabel: 'Order Total' },
      { name: 'supportUrl', type: 'URL', required: true },
      { name: 'incidentAt', type: 'timestamp', required: false },
      { name: 'safeTags', type: 'string[]', required: false, maxItems: 4, maxLength: 20 },
      { name: 'maskedField', type: 'optional string', required: false, redacted: true }
    ]
  };
}

function emailContent() {
  return {
    subjectTemplate: 'Order update for {{customerName}}',
    textTemplate: 'Total {{orderTotal}}. Visit {{supportUrl}}',
    htmlTemplate: '<h1>Hello {{customerName}}</h1><p>Total {{orderTotal}}</p>'
  };
}

function webhookContent() {
  return {
    jsonTemplate: {
      event: 'ORDER_UPDATED',
      customer: '{{customerName}}',
      amount: '{{orderTotal}}'
    }
  };
}

function executiveContent() {
  return {
    titleTemplate: 'Approval needed for {{customerName}}',
    summaryTemplate: 'Order total {{orderTotal}} requires review.',
    severity: 'HIGH',
    actionReferenceTemplate: 'mission://{{customerName}}'
  };
}

function createTemplate(domain, {
  templateId = 'order_template',
  notificationType = 'WEBSITE_PUBLISHED',
  classification = 'CUSTOMER_SUCCESS',
  channel = 'EMAIL',
  businessScope = 'biz_1',
  locale = 'en-US',
  version = '1.0.0',
  status = 'DRAFT',
  variableSchema = baseSchema(),
  content = emailContent(),
  defaultLocale = 'en-US'
} = {}) {
  return domain.createTemplateRecord({
    templateId,
    notificationType,
    classification,
    channel,
    businessScope,
    locale,
    version,
    status,
    variableSchema,
    content,
    approvalMetadata: {},
    branding: {
      businessDisplayName: 'Atlas Industries',
      logoReference: 'asset://logo',
      supportContact: 'support@atlas.test',
      approvedFooter: 'Approved Footer'
    },
    defaultLocale
  });
}

function createEligibleIntent(overrides = {}) {
  return {
    intentId: overrides.intentId ?? 'nint_1',
    state: overrides.state ?? 'ELIGIBLE',
    notificationType: overrides.notificationType ?? 'WEBSITE_PUBLISHED',
    classification: overrides.classification ?? 'CUSTOMER_SUCCESS',
    candidateChannels: overrides.candidateChannels ?? ['EMAIL'],
    businessId: overrides.businessId ?? 'biz_1',
    customerId: overrides.customerId ?? 'cust_1',
    missionId: overrides.missionId ?? 'mission_1'
  };
}

function variables(overrides = {}) {
  return {
    customerName: 'Alex',
    orderTotal: 100,
    supportUrl: 'https://atlas.test/help',
    incidentAt: '2026-07-12T11:00:00.000Z',
    safeTags: ['one', 'two'],
    ...overrides
  };
}

test('template creation and immutable versioning', () => {
  withDomain(({ domain }) => {
    const created = createTemplate(domain);
    assert.equal(created.accepted, true);

    const dup = createTemplate(domain);
    assert.equal(dup.accepted, false);
    assert.equal(dup.code, 'TEMPLATE_EXISTS');
  });
});

test('legal and illegal lifecycle transitions', () => {
  withDomain(({ domain }) => {
    createTemplate(domain);

    const review = domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    assert.equal(review.accepted, true);

    const approved = domain.approveTemplate({
      templateId: 'order_template',
      channel: 'EMAIL',
      businessScope: 'biz_1',
      locale: 'en-US',
      version: '1.0.0',
      approvalReference: 'ceo_approval_1'
    });
    assert.equal(approved.accepted, true);

    const activated = domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    assert.equal(activated.accepted, true);

    const illegal = domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    assert.equal(illegal.accepted, false);
    assert.equal(illegal.code, 'ILLEGAL_TEMPLATE_TRANSITION');
  });
});

test('one active version enforcement', () => {
  withDomain(({ domain }) => {
    createTemplate(domain, { version: '1.0.0' });
    createTemplate(domain, { version: '1.1.0' });

    domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0', approvalReference: 'approve_1' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });

    domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.1.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.1.0', approvalReference: 'approve_2' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.1.0' });

    const templates = domain.listTemplates({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US' });
    const active = templates.filter((item) => item.status === 'ACTIVE');
    assert.equal(active.length, 1);
    assert.equal(active[0].version, '1.1.0');
  });
});

test('rollback to prior approved version', () => {
  withDomain(({ domain }) => {
    createTemplate(domain, { version: '1.0.0' });
    createTemplate(domain, { version: '1.1.0' });

    ['1.0.0', '1.1.0'].forEach((version) => {
      domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version });
      domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version, approvalReference: `approval_${version}` });
    });

    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.1.0' });
    const rollback = domain.rollbackTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', targetVersion: '1.0.0' });

    assert.equal(rollback.accepted, true);
    assert.equal(rollback.template.version, '1.0.0');
    assert.equal(rollback.template.status, 'ACTIVE');
  });
});

test('exact template resolution', () => {
  withDomain(({ domain }) => {
    createTemplate(domain, { businessScope: 'biz_1', locale: 'en-US' });
    domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0', approvalReference: 'approval_1' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });

    const resolved = domain.resolveTemplateForComposition({
      notificationType: 'WEBSITE_PUBLISHED',
      classification: 'CUSTOMER_SUCCESS',
      channel: 'EMAIL',
      businessScope: 'biz_1',
      requestedLocale: 'en-US',
      defaultLocale: 'en-US'
    });

    assert.equal(resolved.accepted, true);
    assert.equal(resolved.fallback.used, false);
  });
});

test('locale fallback', () => {
  withDomain(({ domain }) => {
    createTemplate(domain, { locale: 'en-US' });
    domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0', approvalReference: 'approval_1' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });

    const resolved = domain.resolveTemplateForComposition({
      notificationType: 'WEBSITE_PUBLISHED',
      classification: 'CUSTOMER_SUCCESS',
      channel: 'EMAIL',
      businessScope: 'biz_1',
      requestedLocale: 'fr-FR',
      defaultLocale: 'en-US'
    });

    assert.equal(resolved.accepted, true);
    assert.equal(resolved.fallback.used, true);
    assert.equal(resolved.fallback.reason, 'exact_business_default_locale');
  });
});

test('business-to-global fallback', () => {
  withDomain(({ domain }) => {
    createTemplate(domain, { businessScope: 'GLOBAL', locale: 'en-US' });
    domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'GLOBAL', locale: 'en-US', version: '1.0.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'GLOBAL', locale: 'en-US', version: '1.0.0', approvalReference: 'approval_1' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'GLOBAL', locale: 'en-US', version: '1.0.0' });

    const resolved = domain.resolveTemplateForComposition({
      notificationType: 'WEBSITE_PUBLISHED',
      classification: 'CUSTOMER_SUCCESS',
      channel: 'EMAIL',
      businessScope: 'biz_local',
      requestedLocale: 'fr-FR',
      defaultLocale: 'en-US'
    });

    assert.equal(resolved.accepted, true);
    assert.equal(resolved.fallback.source, 'GLOBAL_DEFAULT_LOCALE');
  });
});

test('incompatible template rejection', () => {
  withDomain(({ domain }) => {
    createTemplate(domain, { classification: 'EXECUTIVE' });
    domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0', approvalReference: 'approval_1' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });

    const resolved = domain.resolveTemplateForComposition({
      notificationType: 'WEBSITE_PUBLISHED',
      classification: 'CUSTOMER_SUCCESS',
      channel: 'EMAIL',
      businessScope: 'biz_1',
      requestedLocale: 'en-US',
      defaultLocale: 'en-US'
    });

    assert.equal(resolved.accepted, false);
    assert.equal(resolved.code, 'NO_COMPATIBLE_TEMPLATE');
  });
});

test('missing required variable', () => {
  withDomain(({ domain }) => {
    const validation = domain.validateVariables({ schema: baseSchema(), variables: { orderTotal: 1, supportUrl: 'https://atlas.test' } });
    assert.equal(validation.accepted, false);
    assert.equal(validation.failures.some((item) => item.issue === 'MISSING_REQUIRED_VARIABLE'), true);
  });
});

test('unknown variable rejection', () => {
  withDomain(({ domain }) => {
    const validation = domain.validateVariables({ schema: baseSchema(), variables: { ...variables(), unknownField: 'x' } });
    assert.equal(validation.accepted, false);
    assert.equal(validation.failures.some((item) => item.issue === 'UNKNOWN_VARIABLE'), true);
  });
});

test('invalid variable type rejection', () => {
  withDomain(({ domain }) => {
    const validation = domain.validateVariables({ schema: baseSchema(), variables: { ...variables(), orderTotal: 'not-number' } });
    assert.equal(validation.accepted, false);
    assert.equal(validation.failures.some((item) => item.issue === 'INVALID_VARIABLE_TYPE'), true);
  });
});

test('oversized variable and payload rejection', () => {
  withDomain(({ domain }) => {
    const validation = domain.validateVariables({ schema: baseSchema(), variables: { ...variables(), customerName: 'x'.repeat(500) } });
    assert.equal(validation.accepted, false);
    assert.equal(validation.failures.some((item) => item.issue === 'MAX_LENGTH_EXCEEDED'), true);

    createTemplate(domain, {
      channel: 'EXECUTIVE',
      content: {
        titleTemplate: '{{customerName}}',
        summaryTemplate: '{{veryLarge}}',
        severity: 'HIGH',
        actionReferenceTemplate: 'action://{{customerName}}'
      },
      variableSchema: {
        allowUnknownVariables: false,
        fields: [
          { name: 'customerName', type: 'string', required: true },
          { name: 'veryLarge', type: 'string', required: true, maxLength: 200000 }
        ]
      }
    });
    domain.submitForReview({ templateId: 'order_template', channel: 'EXECUTIVE', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EXECUTIVE', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0', approvalReference: 'approval' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EXECUTIVE', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });

    const composed = domain.composeFromIntent({
      intent: createEligibleIntent({ candidateChannels: ['EXECUTIVE'] }),
      variables: { customerName: 'Alex', veryLarge: 'z'.repeat(50000) },
      requestedLocale: 'en-US',
      defaultLocale: 'en-US'
    });

    assert.equal(composed.accepted, false);
    assert.equal(composed.code, 'RENDER_PAYLOAD_TOO_LARGE');
  });
});

test('secret/prohibited variable rejection', () => {
  withDomain(({ domain }) => {
    const validation = domain.validateVariables({
      schema: {
        allowUnknownVariables: false,
        fields: [
          { name: 'accessToken', type: 'string', required: true }
        ]
      },
      variables: { accessToken: 'Bearer abc123' }
    });

    assert.equal(validation.accepted, false);
    assert.equal(validation.failures.some((item) => item.issue === 'PROHIBITED_VARIABLE_FIELD' || item.issue === 'PROHIBITED_VARIABLE_VALUE'), true);
  });
});

test('html escaping in rendering', () => {
  withDomain(({ domain }) => {
    const rendered = domain.renderTemplate({
      template: {
        channel: 'EMAIL',
        content: emailContent(),
        approvalMetadata: {},
        variableSchema: baseSchema()
      },
      variables: variables({ customerName: '<script>alert(1)</script>' }),
      preview: false
    });

    assert.equal(rendered.accepted, true);
    assert.equal(rendered.rendered.htmlBody.includes('&lt;script&gt;'), true);
  });
});

test('unresolved placeholder rejection', () => {
  withDomain(({ domain }) => {
    const rendered = domain.renderTemplate({
      template: {
        channel: 'EMAIL',
        content: {
          subjectTemplate: 'Hello {{missingVar}}',
          textTemplate: 'Body {{customerName}}'
        },
        approvalMetadata: {},
        variableSchema: baseSchema()
      },
      variables: variables(),
      preview: false
    });

    assert.equal(rendered.accepted, false);
    assert.equal(rendered.code, 'UNRESOLVED_PLACEHOLDER');
  });
});

test('deterministic rendering', () => {
  withDomain(({ domain }) => {
    const template = {
      channel: 'WEBHOOK',
      content: webhookContent(),
      approvalMetadata: {},
      variableSchema: baseSchema()
    };

    const first = domain.renderTemplate({ template, variables: variables(), preview: false });
    const second = domain.renderTemplate({ template, variables: variables(), preview: false });

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    assert.deepEqual(first.rendered, second.rendered);
  });
});

test('email output shape', () => {
  withDomain(({ domain }) => {
    const output = domain.renderTemplate({
      template: {
        channel: 'EMAIL',
        content: emailContent(),
        approvalMetadata: {},
        variableSchema: baseSchema()
      },
      variables: variables(),
      preview: false
    });

    assert.equal(output.accepted, true);
    assert.equal(typeof output.rendered.subject, 'string');
    assert.equal(typeof output.rendered.textBody, 'string');
  });
});

test('webhook json output shape', () => {
  withDomain(({ domain }) => {
    const output = domain.renderTemplate({
      template: {
        channel: 'WEBHOOK',
        content: webhookContent(),
        approvalMetadata: {},
        variableSchema: baseSchema()
      },
      variables: variables(),
      preview: false
    });

    assert.equal(output.accepted, true);
    assert.equal(typeof output.rendered.jsonPayload, 'object');
  });
});

test('executive output shape', () => {
  withDomain(({ domain }) => {
    const output = domain.renderTemplate({
      template: {
        channel: 'EXECUTIVE',
        content: executiveContent(),
        approvalMetadata: {},
        variableSchema: baseSchema()
      },
      variables: variables(),
      preview: false
    });

    assert.equal(output.accepted, true);
    assert.equal(typeof output.rendered.title, 'string');
    assert.equal(typeof output.rendered.summary, 'string');
    assert.equal(typeof output.rendered.severity, 'string');
  });
});

test('composition state transitions and content integrity hash', () => {
  withDomain(({ domain }) => {
    createTemplate(domain);
    domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0', approvalReference: 'approval_1' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });

    const composed = domain.composeFromIntent({
      intent: createEligibleIntent(),
      variables: variables(),
      requestedLocale: 'en-US',
      defaultLocale: 'en-US'
    });

    assert.equal(composed.accepted, true);
    assert.equal(composed.composition.state, 'FROZEN');
    assert.equal(typeof composed.composition.contentIntegrityHash, 'string');
    assert.equal(composed.composition.contentIntegrityHash.length, 64);
  });
});

test('preview mode isolation', () => {
  withDomain(({ domain }) => {
    createTemplate(domain);
    domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0', approvalReference: 'approval_1' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });

    const preview = domain.composeFromIntent({
      intent: createEligibleIntent(),
      variables: variables(),
      requestedLocale: 'en-US',
      defaultLocale: 'en-US',
      preview: true
    });

    assert.equal(preview.accepted, true);
    assert.equal(preview.preview, true);
    assert.equal(preview.content.rendered.preview.nonProduction, true);
  });
});

test('audit redaction and telemetry emission', () => {
  withDomain(({ domain }) => {
    createTemplate(domain);
    domain.submitForReview({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });
    domain.approveTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0', approvalReference: 'approval_1' });
    domain.activateTemplate({ templateId: 'order_template', channel: 'EMAIL', businessScope: 'biz_1', locale: 'en-US', version: '1.0.0' });

    const preview = domain.composeFromIntent({
      intent: createEligibleIntent(),
      variables: variables({ maskedField: 'super-secret-token' }),
      requestedLocale: 'en-US',
      defaultLocale: 'en-US',
      preview: true
    });

    assert.equal(preview.accepted, true);

    const audit = domain.listTemplateAudit();
    assert.equal(audit.some((item) => item.event === 'preview_rendered'), true);

    const telemetry = domain.getTelemetrySnapshot();
    assert.equal((telemetry['render.success.count'] ?? 0) > 0, true);
    assert.equal((telemetry['composition.channel.EMAIL.count'] ?? 0) > 0, true);

    const redactedEvent = createDomainEventEnvelope({
      eventType: 'IDENTITY_SECURITY_INCIDENT',
      sourceSystem: 'security',
      sourceEntityType: 'incident',
      sourceEntityId: 'incident_1',
      businessId: 'biz_1',
      correlationId: 'corr_1',
      sensitivity: 'RESTRICTED',
      payload: {
        token: 'secret',
        recipientEmail: 'hidden@example.com'
      }
    });
    const sanitized = domain.getSanitizedAuditEvent(redactedEvent);
    assert.equal(sanitized.payload.token, '[REDACTED]');
    assert.equal(sanitized.payload.recipientEmail, '[REDACTED]');
  });
});
