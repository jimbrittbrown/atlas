import { createHash } from 'node:crypto';
import {
  appendEvent,
  getMetaMap,
  loadRecordMap,
  setMetaValue,
  upsertRecord
} from '../storage/provider-backed-state.js';
import {
  NotificationTemplateStates,
  NotificationChannels,
  NotificationIntentStates,
  createNotificationTemplate,
  validateNotificationTemplate,
  createNotificationComposition,
  validateNotificationComposition,
  serializeDomainEventForAudit
} from './notification-domain-contracts.js';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{3,160}$/;
const PLACEHOLDER_PATTERN = /{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g;
const EXACT_PLACEHOLDER_PATTERN = /^{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}$/;
const PROHIBITED_FIELD_PATTERN = /(password|secret|token|credential|api[_-]?key|authorization|cookie|session)/i;
const PROHIBITED_VALUE_PATTERN = /(bearer\s+[a-z0-9._-]+|sk_[a-z0-9]{12,}|ghp_[a-z0-9]{12,})/i;

const DEFAULT_PAYLOAD_LIMITS = Object.freeze({
  [NotificationChannels.EMAIL]: 200 * 1024,
  [NotificationChannels.WEBHOOK]: 256 * 1024,
  [NotificationChannels.EXECUTIVE]: 32 * 1024
});

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function parseType(type) {
  const raw = String(type ?? '').trim();
  if (raw.endsWith('[]')) {
    return { isArray: true, elementType: raw.slice(0, -2), optional: false };
  }
  if (raw.startsWith('optional ')) {
    return { isArray: false, elementType: raw.slice('optional '.length).trim(), optional: true };
  }
  return { isArray: false, elementType: raw, optional: false };
}

function isValidTimestamp(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed);
}

function isValidUrl(value) {
  try {
    const parsed = new URL(String(value ?? ''));
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map((item) => sortObject(item));
  if (!value || typeof value !== 'object') return value;

  const output = {};
  Object.keys(value).sort().forEach((key) => {
    output[key] = sortObject(value[key]);
  });
  return output;
}

function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function templateScopeKey({ templateId, channel, businessScope, locale } = {}) {
  return `${templateId}:${channel}:${businessScope}:${locale}`;
}

function templateRecordKey({ templateId, channel, businessScope, locale, version } = {}) {
  return `${templateScopeKey({ templateId, channel, businessScope, locale })}:${version}`;
}

function isAllowedStatus(status) {
  return Object.values(NotificationTemplateStates).includes(String(status ?? '').trim().toUpperCase());
}

function toStatus(value) {
  return String(value ?? '').trim().toUpperCase();
}

function lifecycleTransitionAllowed(fromStatus, toStatus) {
  const from = toStatusValue(fromStatus);
  const to = toStatusValue(toStatus);

  if (from === NotificationTemplateStates.DRAFT && to === NotificationTemplateStates.REVIEW) return true;
  if (from === NotificationTemplateStates.REVIEW && to === NotificationTemplateStates.APPROVED) return true;
  if (from === NotificationTemplateStates.APPROVED && to === NotificationTemplateStates.ACTIVE) return true;
  if (from === NotificationTemplateStates.ACTIVE && to === NotificationTemplateStates.RETIRED) return true;

  return false;
}

function toStatusValue(value) {
  return String(value ?? '').trim().toUpperCase();
}

function redactField(name, value, redacted = false) {
  if (redacted || PROHIBITED_FIELD_PATTERN.test(String(name ?? ''))) return '[REDACTED]';
  if (typeof value === 'string' && PROHIBITED_VALUE_PATTERN.test(value)) return '[REDACTED]';
  return value;
}

function sanitizeAuditVariables(variables = {}, schema = {}) {
  const fields = asArray(schema.fields);
  const byName = new Map(fields.map((field) => [String(field.name ?? ''), field]));
  const output = {};

  Object.entries(asObject(variables)).forEach(([name, value]) => {
    const field = byName.get(name) ?? {};
    output[name] = redactField(name, value, Boolean(field.redacted));
  });

  return output;
}

function findUnresolvedPlaceholders(value) {
  if (typeof value === 'string') {
    const matches = value.match(PLACEHOLDER_PATTERN) ?? [];
    return matches.map((item) => String(item));
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findUnresolvedPlaceholders(item));
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((item) => findUnresolvedPlaceholders(item));
  }

  return [];
}

function checkSimpleType(value, elementType) {
  const normalized = String(elementType ?? '').trim().toLowerCase();

  if (normalized === 'string') return typeof value === 'string';
  if (normalized === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (normalized === 'boolean') return typeof value === 'boolean';
  if (normalized === 'timestamp') return typeof value === 'string' && isValidTimestamp(value);
  if (normalized === 'url') return typeof value === 'string' && isValidUrl(value);
  if (normalized === 'identifier') return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);

  return false;
}

function renderTemplateString(text, variables, { escape = true } = {}) {
  return String(text ?? '').replace(PLACEHOLDER_PATTERN, (_, name) => {
    const value = variables[name];
    if (value == null) return `{{${name}}}`;
    const rendered = typeof value === 'object' ? stableJson(value) : String(value);
    return escape ? escapeHtml(rendered) : rendered;
  });
}

function renderWebhookValue(value, variables) {
  if (typeof value === 'string') {
    const exact = EXACT_PLACEHOLDER_PATTERN.exec(value);
    if (exact) {
      const variable = variables[exact[1]];
      return variable == null ? value : variable;
    }
    return renderTemplateString(value, variables, { escape: false });
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderWebhookValue(item, variables));
  }

  if (value && typeof value === 'object') {
    const output = {};
    Object.entries(value).forEach(([key, child]) => {
      output[key] = renderWebhookValue(child, variables);
    });
    return output;
  }

  return value;
}

export class NotificationTemplateDomain {
  constructor({
    storageProvider,
    now,
    payloadLimits = DEFAULT_PAYLOAD_LIMITS,
    namespace = 'executive.notification-template-domain'
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.payloadLimits = { ...DEFAULT_PAYLOAD_LIMITS, ...asObject(payloadLimits) };
    this.namespace = namespace;

    this.templates = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.templates` });
    this.compositions = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.compositions` });
    this.renderedContent = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.rendered-content` });
    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` });
    this.telemetry = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry` });
  }

  createTemplateRecord({
    templateId,
    notificationType,
    classification,
    channel,
    businessScope,
    locale,
    version,
    status = NotificationTemplateStates.DRAFT,
    variableSchema = {},
    content = {},
    approvalMetadata = {},
    branding = {},
    defaultLocale = 'en-US'
  } = {}) {
    const template = createNotificationTemplate({
      templateId,
      version,
      notificationType,
      classification,
      channel,
      businessScope,
      locale,
      status,
      variableSchema,
      content,
      approvalMetadata: {
        ...asObject(approvalMetadata),
        branding: this.sanitizeBranding(branding),
        defaultLocale: String(defaultLocale ?? 'en-US').trim()
      },
      createdAt: isoNow(this.now)
    });

    const key = templateRecordKey(template);
    if (this.templates.has(key)) {
      return { accepted: false, code: 'TEMPLATE_EXISTS', reason: 'Template version already exists.', template: null };
    }

    const stored = Object.freeze({
      ...template,
      updatedAt: isoNow(this.now),
      lifecycleHistory: [
        {
          at: isoNow(this.now),
          fromStatus: null,
          toStatus: NotificationTemplateStates.DRAFT,
          reason: 'template_created'
        }
      ]
    });

    this.templates.set(key, stored);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.templates`, key, value: stored });

    this.recordAudit('template_created', {
      templateKey: key,
      template: this.auditTemplate(stored)
    });

    this.incrementTelemetry(`template.status.${stored.status}.count`, 1);
    this.incrementTelemetry(`template.channel.${stored.channel}.count`, 1);
    this.incrementTelemetry(`template.business.${stored.businessScope}.count`, 1);

    return { accepted: true, code: 'OK', template: stored };
  }

  submitForReview({ templateId, channel, businessScope, locale, version, requestedBy } = {}) {
    return this.transitionTemplateStatus({
      templateId,
      channel,
      businessScope,
      locale,
      version,
      toStatus: NotificationTemplateStates.REVIEW,
      reason: 'template_submitted_for_review',
      metadataPatch: { reviewRequestedBy: requestedBy ?? null }
    });
  }

  approveTemplate({ templateId, channel, businessScope, locale, version, approvalReference, approvedBy } = {}) {
    if (!hasText(approvalReference)) {
      return { accepted: false, code: 'MISSING_APPROVAL_REFERENCE', reason: 'Approval reference is required.' };
    }

    return this.transitionTemplateStatus({
      templateId,
      channel,
      businessScope,
      locale,
      version,
      toStatus: NotificationTemplateStates.APPROVED,
      reason: 'template_approved',
      metadataPatch: {
        approvalReference,
        approvedBy: approvedBy ?? null,
        approvedAt: isoNow(this.now)
      }
    });
  }

  activateTemplate({ templateId, channel, businessScope, locale, version, activatedBy } = {}) {
    const record = this.getTemplateRecord({ templateId, channel, businessScope, locale, version });
    if (!record) {
      return { accepted: false, code: 'TEMPLATE_NOT_FOUND', reason: 'Template not found.' };
    }

    if (toStatusValue(record.status) !== NotificationTemplateStates.APPROVED) {
      return { accepted: false, code: 'ILLEGAL_TEMPLATE_TRANSITION', reason: 'Only APPROVED templates may be activated.' };
    }

    const scope = templateScopeKey(record);
    const active = this.findActiveTemplateInScope(scope, record.version);
    if (active) {
      const demoted = this.applyTemplateMutation(active, {
        status: NotificationTemplateStates.APPROVED,
        activatedAt: null,
        lifecycleHistory: [
          ...asArray(active.lifecycleHistory),
          {
            at: isoNow(this.now),
            fromStatus: NotificationTemplateStates.ACTIVE,
            toStatus: NotificationTemplateStates.APPROVED,
            reason: 'activation_replaced_by_new_version'
          }
        ]
      });
      this.persistTemplateRecord(demoted);
    }

    const result = this.transitionTemplateStatus({
      templateId,
      channel,
      businessScope,
      locale,
      version,
      toStatus: NotificationTemplateStates.ACTIVE,
      reason: 'template_activated',
      metadataPatch: {
        activatedBy: activatedBy ?? null,
        activatedAt: isoNow(this.now)
      }
    });

    return result;
  }

  retireTemplate({ templateId, channel, businessScope, locale, version, retiredBy } = {}) {
    return this.transitionTemplateStatus({
      templateId,
      channel,
      businessScope,
      locale,
      version,
      toStatus: NotificationTemplateStates.RETIRED,
      reason: 'template_retired',
      metadataPatch: {
        retiredBy: retiredBy ?? null,
        retiredAt: isoNow(this.now)
      }
    });
  }

  rollbackTemplate({ templateId, channel, businessScope, locale, targetVersion, rollbackBy } = {}) {
    const target = this.getTemplateRecord({ templateId, channel, businessScope, locale, version: targetVersion });
    if (!target) {
      return { accepted: false, code: 'TEMPLATE_NOT_FOUND', reason: 'Rollback target not found.' };
    }

    if (toStatusValue(target.status) !== NotificationTemplateStates.APPROVED) {
      return { accepted: false, code: 'INVALID_ROLLBACK_TARGET', reason: 'Rollback target must be APPROVED.' };
    }

    const scope = templateScopeKey(target);
    const active = this.findActiveTemplateInScope(scope);
    if (!active) {
      return this.activateTemplate({ templateId, channel, businessScope, locale, version: targetVersion, activatedBy: rollbackBy ?? null });
    }

    const demotedActive = this.applyTemplateMutation(active, {
      status: NotificationTemplateStates.APPROVED,
      activatedAt: null,
      lifecycleHistory: [
        ...asArray(active.lifecycleHistory),
        {
          at: isoNow(this.now),
          fromStatus: NotificationTemplateStates.ACTIVE,
          toStatus: NotificationTemplateStates.APPROVED,
          reason: 'template_rollback'
        }
      ]
    });
    this.persistTemplateRecord(demotedActive);

    const activatedTarget = this.applyTemplateMutation(target, {
      status: NotificationTemplateStates.ACTIVE,
      activatedAt: isoNow(this.now),
      lifecycleHistory: [
        ...asArray(target.lifecycleHistory),
        {
          at: isoNow(this.now),
          fromStatus: NotificationTemplateStates.APPROVED,
          toStatus: NotificationTemplateStates.ACTIVE,
          reason: 'template_rollback'
        }
      ],
      approvalMetadata: {
        ...asObject(target.approvalMetadata),
        rollbackBy: rollbackBy ?? null,
        rollbackAt: isoNow(this.now)
      }
    });

    this.persistTemplateRecord(activatedTarget);
    this.recordAudit('template_rollback', {
      templateKey: this.templateRecordKeyFromTemplate(activatedTarget),
      previousActiveVersion: active.version,
      activatedVersion: activatedTarget.version
    });

    return { accepted: true, code: 'OK', template: activatedTarget };
  }

  transitionTemplateStatus({ templateId, channel, businessScope, locale, version, toStatus, reason, metadataPatch = {} } = {}) {
    const record = this.getTemplateRecord({ templateId, channel, businessScope, locale, version });
    if (!record) {
      return { accepted: false, code: 'TEMPLATE_NOT_FOUND', reason: 'Template not found.' };
    }

    const from = toStatusValue(record.status);
    const to = toStatusValue(toStatus);

    if (!isAllowedStatus(to)) {
      return { accepted: false, code: 'INVALID_TEMPLATE_STATUS', reason: 'Unsupported template status.' };
    }

    if (!lifecycleTransitionAllowed(from, to)) {
      return { accepted: false, code: 'ILLEGAL_TEMPLATE_TRANSITION', reason: `Illegal status transition ${from} -> ${to}.` };
    }

    if ([NotificationTemplateStates.APPROVED, NotificationTemplateStates.ACTIVE, NotificationTemplateStates.RETIRED].includes(from)) {
      if (metadataPatch.content || metadataPatch.variableSchema) {
        return { accepted: false, code: 'IMMUTABLE_TEMPLATE_VERSION', reason: 'Approved template versions are immutable.' };
      }
    }

    const next = this.applyTemplateMutation(record, {
      status: to,
      updatedAt: isoNow(this.now),
      activatedAt: to === NotificationTemplateStates.ACTIVE ? isoNow(this.now) : record.activatedAt,
      retiredAt: to === NotificationTemplateStates.RETIRED ? isoNow(this.now) : record.retiredAt,
      approvalMetadata: {
        ...asObject(record.approvalMetadata),
        ...asObject(metadataPatch)
      },
      lifecycleHistory: [
        ...asArray(record.lifecycleHistory),
        {
          at: isoNow(this.now),
          fromStatus: from,
          toStatus: to,
          reason
        }
      ]
    });

    this.persistTemplateRecord(next);

    this.recordAudit(reason, {
      templateKey: this.templateRecordKeyFromTemplate(next),
      fromStatus: from,
      toStatus: to
    });
    this.incrementTelemetry(`template.status.${to}.count`, 1);

    return { accepted: true, code: 'OK', template: next };
  }

  applyTemplateMutation(template, patch) {
    return Object.freeze({
      ...template,
      ...patch
    });
  }

  persistTemplateRecord(template) {
    const key = this.templateRecordKeyFromTemplate(template);
    this.templates.set(key, template);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.templates`, key, value: template });
  }

  sanitizeBranding(branding = {}) {
    const input = asObject(branding);
    return {
      businessDisplayName: hasText(input.businessDisplayName) ? String(input.businessDisplayName).trim() : null,
      logoReference: hasText(input.logoReference) ? String(input.logoReference).trim() : null,
      supportContact: hasText(input.supportContact) ? String(input.supportContact).trim() : null,
      approvedFooter: hasText(input.approvedFooter) ? String(input.approvedFooter).trim() : null
    };
  }

  templateRecordKeyFromTemplate(template) {
    return templateRecordKey(template);
  }

  getTemplateRecord({ templateId, channel, businessScope, locale, version } = {}) {
    return this.templates.get(templateRecordKey({ templateId, channel, businessScope, locale, version })) ?? null;
  }

  findActiveTemplateInScope(scopeKey, excludeVersion = null) {
    const values = Array.from(this.templates.values()).filter((template) => {
      if (templateScopeKey(template) !== scopeKey) return false;
      if (excludeVersion != null && String(template.version) === String(excludeVersion)) return false;
      return toStatusValue(template.status) === NotificationTemplateStates.ACTIVE;
    });

    return values[0] ?? null;
  }

  listTemplates({ templateId, channel, businessScope, locale, notificationType } = {}) {
    return Array.from(this.templates.values()).filter((template) => {
      if (hasText(templateId) && template.templateId !== templateId) return false;
      if (hasText(channel) && template.channel !== channel) return false;
      if (hasText(businessScope) && template.businessScope !== businessScope) return false;
      if (hasText(locale) && template.locale !== locale) return false;
      if (hasText(notificationType) && template.notificationType !== notificationType) return false;
      return true;
    });
  }

  resolveTemplateForComposition({
    notificationType,
    classification,
    channel,
    businessScope,
    requestedLocale,
    defaultLocale = 'en-US'
  } = {}) {
    const options = [
      { businessScope, locale: requestedLocale, reason: 'exact_business_requested_locale', source: 'BUSINESS_REQUESTED_LOCALE' },
      { businessScope, locale: defaultLocale, reason: 'exact_business_default_locale', source: 'BUSINESS_DEFAULT_LOCALE' },
      { businessScope: 'GLOBAL', locale: requestedLocale, reason: 'global_requested_locale', source: 'GLOBAL_REQUESTED_LOCALE' },
      { businessScope: 'GLOBAL', locale: defaultLocale, reason: 'global_default_locale', source: 'GLOBAL_DEFAULT_LOCALE' }
    ];

    for (const option of options) {
      const candidates = this.listTemplates({
        templateId: null,
        channel,
        businessScope: option.businessScope,
        locale: option.locale,
        notificationType
      })
        .filter((template) => template.classification === classification)
        .filter((template) => [NotificationTemplateStates.ACTIVE, NotificationTemplateStates.APPROVED].includes(toStatusValue(template.status)))
        .sort((a, b) => {
          if (toStatusValue(a.status) !== toStatusValue(b.status)) {
            return toStatusValue(a.status) === NotificationTemplateStates.ACTIVE ? -1 : 1;
          }
          return String(b.version).localeCompare(String(a.version), undefined, { numeric: true });
        });

      if (candidates.length > 0) {
        const selected = candidates[0];
        return {
          accepted: true,
          template: selected,
          fallback: {
            used: option.reason !== 'exact_business_requested_locale',
            reason: option.reason,
            source: option.source
          }
        };
      }
    }

    return {
      accepted: false,
      code: 'NO_COMPATIBLE_TEMPLATE',
      reason: 'No compatible approved/active template found for composition fallback chain.'
    };
  }

  validateVariables({ schema = {}, variables = {} } = {}) {
    const normalizedSchema = asObject(schema, {});
    const fields = asArray(normalizedSchema.fields);
    const byName = new Map(fields.map((field) => [String(field.name ?? ''), field]));
    const failures = [];

    fields.forEach((field) => {
      const name = String(field.name ?? '').trim();
      const type = parseType(field.type);
      const required = field.required === true || (type.optional === false && field.required !== false);
      const value = variables[name];

      if (required && value == null) {
        failures.push({ field: name, issue: 'MISSING_REQUIRED_VARIABLE', message: `${name} is required.` });
        return;
      }

      if (value == null) return;

      if (PROHIBITED_FIELD_PATTERN.test(name)) {
        failures.push({ field: name, issue: 'PROHIBITED_VARIABLE_FIELD', message: `${name} is prohibited.` });
        return;
      }

      if (typeof value === 'string' && PROHIBITED_VALUE_PATTERN.test(value)) {
        failures.push({ field: name, issue: 'PROHIBITED_VARIABLE_VALUE', message: `${name} contains prohibited secret/token material.` });
      }

      if (type.isArray) {
        if (!Array.isArray(value)) {
          failures.push({ field: name, issue: 'INVALID_VARIABLE_TYPE', message: `${name} must be an array.` });
          return;
        }

        const maxItems = Number(field.maxItems ?? 50);
        if (value.length > maxItems) {
          failures.push({ field: name, issue: 'ARRAY_SIZE_EXCEEDED', message: `${name} exceeds maxItems ${maxItems}.` });
        }

        value.forEach((item, index) => {
          if (!checkSimpleType(item, type.elementType)) {
            failures.push({ field: `${name}[${index}]`, issue: 'INVALID_VARIABLE_TYPE', message: `${name}[${index}] must be ${type.elementType}.` });
          }
        });
      } else if (!checkSimpleType(value, type.elementType)) {
        failures.push({ field: name, issue: 'INVALID_VARIABLE_TYPE', message: `${name} must be ${type.elementType}.` });
      }

      const maxLength = Number(field.maxLength ?? 4000);
      if (typeof value === 'string' && value.length > maxLength) {
        failures.push({ field: name, issue: 'MAX_LENGTH_EXCEEDED', message: `${name} exceeds maxLength ${maxLength}.` });
      }

      if (type.isArray) {
        value.forEach((item, index) => {
          if (typeof item === 'string' && item.length > maxLength) {
            failures.push({ field: `${name}[${index}]`, issue: 'MAX_LENGTH_EXCEEDED', message: `${name}[${index}] exceeds maxLength ${maxLength}.` });
          }
        });
      }
    });

    Object.keys(asObject(variables)).forEach((name) => {
      if (byName.has(name)) return;
      if (normalizedSchema.allowUnknownVariables === true) return;
      failures.push({ field: name, issue: 'UNKNOWN_VARIABLE', message: `${name} is not defined in schema.` });
    });

    return {
      accepted: failures.length === 0,
      failures,
      safeDisplay: fields.map((field) => ({
        name: field.name,
        displayLabel: field.displayLabel ?? field.name,
        redacted: Boolean(field.redacted)
      }))
    };
  }

  composeFromIntent({
    intent,
    variables,
    requestedLocale = 'en-US',
    defaultLocale = 'en-US',
    preview = false,
    businessScope,
    branding = {}
  } = {}) {
    if (!intent || typeof intent !== 'object') {
      return { accepted: false, code: 'INVALID_INTENT', reason: 'Intent is required.' };
    }

    if (!preview && toStatusValue(intent.state) !== NotificationIntentStates.ELIGIBLE) {
      return { accepted: false, code: 'INTENT_NOT_ELIGIBLE', reason: 'Only ELIGIBLE intents can be composed.' };
    }

    const channel = asArray(intent.candidateChannels)[0];
    if (!hasText(channel) || !Object.values(NotificationChannels).includes(String(channel).toUpperCase())) {
      return { accepted: false, code: 'INVALID_CHANNEL', reason: 'Intent must provide a supported candidate channel.' };
    }

    const resolved = this.resolveTemplateForComposition({
      notificationType: intent.notificationType,
      classification: intent.classification,
      channel,
      businessScope: businessScope ?? intent.businessId ?? 'GLOBAL',
      requestedLocale,
      defaultLocale
    });

    if (!resolved.accepted) {
      this.recordAudit('template_render_failed', {
        intentId: intent.intentId,
        reason: resolved.reason,
        code: resolved.code
      });
      this.incrementTelemetry('render.failure.count', 1);
      return resolved;
    }

    const template = resolved.template;
    if (toStatusValue(template.status) === NotificationTemplateStates.RETIRED) {
      return { accepted: false, code: 'TEMPLATE_RETIRED', reason: 'Retired templates cannot be selected for composition.' };
    }

    const variableValidation = this.validateVariables({ schema: template.variableSchema, variables });
    if (!variableValidation.accepted) {
      this.recordAudit('template_render_failed', {
        intentId: intent.intentId,
        templateKey: this.templateRecordKeyFromTemplate(template),
        failures: variableValidation.failures
      });
      this.incrementTelemetry('render.failure.count', 1);
      this.incrementTelemetry('render.validation_failures.count', variableValidation.failures.length);
      return {
        accepted: false,
        code: 'VARIABLE_SCHEMA_VALIDATION_FAILED',
        failures: variableValidation.failures
      };
    }

    const renderResult = this.renderTemplate({ template, variables, preview, branding });
    if (!renderResult.accepted) {
      this.recordAudit('template_render_failed', {
        intentId: intent.intentId,
        templateKey: this.templateRecordKeyFromTemplate(template),
        failures: renderResult.failures
      });
      this.incrementTelemetry('render.failure.count', 1);
      return renderResult;
    }

    const compositionId = `ncmp_${stableHash(`${intent.intentId}:${this.templateRecordKeyFromTemplate(template)}:${stableJson(renderResult.rendered)}`).slice(0, 24)}`;
    const contentRef = `content://${compositionId}`;
    const contentIntegrityHash = stableHash(stableJson(renderResult.rendered));

    let composition = createNotificationComposition({
      compositionId,
      intentId: intent.intentId,
      templateId: template.templateId,
      templateVersion: template.version,
      channel,
      locale: resolved.template.locale,
      renderSchemaVersion: '1.0.0',
      contentRef,
      contentIntegrityHash,
      state: 'PENDING',
      createdAt: isoNow(this.now)
    });

    composition = this.transitionComposition({ composition, toState: 'RENDERED' });
    composition = this.transitionComposition({ composition, toState: 'VERIFIED' });
    composition = this.transitionComposition({ composition, toState: 'FROZEN', frozenAt: isoNow(this.now) });

    const contentRecord = Object.freeze({
      contentRef,
      rendered: renderResult.rendered,
      renderedBytes: renderResult.sizeBytes,
      channel,
      hash: contentIntegrityHash,
      preview,
      fallback: resolved.fallback,
      templateKey: this.templateRecordKeyFromTemplate(template),
      locale: resolved.template.locale,
      intentId: intent.intentId,
      branding: renderResult.branding
    });

    this.renderedContent.set(contentRef, contentRecord);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.rendered-content`, key: contentRef, value: contentRecord });

    this.compositions.set(composition.compositionId, composition);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.compositions`, key: composition.compositionId, value: composition });

    if (resolved.fallback.used) {
      this.recordAudit('template_fallback_used', {
        intentId: intent.intentId,
        templateKey: this.templateRecordKeyFromTemplate(template),
        fallback: resolved.fallback
      });
      this.incrementTelemetry('render.fallback.count', 1);
    }

    const eventName = preview ? 'preview_rendered' : 'template_rendered';
    this.recordAudit(eventName, {
      intentId: intent.intentId,
      compositionId: composition.compositionId,
      templateKey: this.templateRecordKeyFromTemplate(template),
      fallback: resolved.fallback,
      variables: sanitizeAuditVariables(variables, template.variableSchema)
    });

    this.incrementTelemetry('render.success.count', 1);
    this.incrementTelemetry(`composition.channel.${channel}.count`, 1);

    return {
      accepted: true,
      code: 'OK',
      composition,
      content: contentRecord,
      preview,
      fallback: resolved.fallback
    };
  }

  transitionComposition({ composition, toState, frozenAt = null } = {}) {
    const updated = Object.freeze({
      ...composition,
      state: toState,
      frozenAt: frozenAt ?? composition.frozenAt
    });

    const validation = validateNotificationComposition(updated);
    if (!validation.isValid) {
      throw new Error(`Invalid composition transition to ${toState}: ${validation.issues.join(' | ')}`);
    }

    return updated;
  }

  renderTemplate({ template, variables, preview, branding = {} } = {}) {
    const channel = String(template.channel).toUpperCase();
    const content = asObject(template.content);
    const templateBranding = asObject(template.approvalMetadata?.branding);
    const mergedBranding = {
      ...templateBranding,
      ...this.sanitizeBranding(branding)
    };

    let rendered;
    if (channel === NotificationChannels.EMAIL) {
      rendered = {
        subject: renderTemplateString(content.subjectTemplate, variables, { escape: true }),
        textBody: renderTemplateString(content.textTemplate, variables, { escape: true }),
        htmlBody: hasText(content.htmlTemplate)
          ? renderTemplateString(content.htmlTemplate, variables, { escape: true })
          : null
      };
    } else if (channel === NotificationChannels.WEBHOOK) {
      rendered = {
        jsonPayload: renderWebhookValue(content.jsonTemplate, variables)
      };
    } else if (channel === NotificationChannels.EXECUTIVE) {
      rendered = {
        title: renderTemplateString(content.titleTemplate, variables, { escape: true }),
        summary: renderTemplateString(content.summaryTemplate, variables, { escape: true }),
        severity: String(content.severity ?? 'INFO').trim(),
        actionReference: renderTemplateString(content.actionReferenceTemplate, variables, { escape: true })
      };
    } else {
      return {
        accepted: false,
        code: 'UNSUPPORTED_CHANNEL_RENDER',
        failures: [{ field: 'channel', issue: 'UNSUPPORTED_CHANNEL_RENDER', message: `Unsupported channel ${channel}.` }]
      };
    }

    if (preview) {
      rendered.preview = {
        nonProduction: true,
        marker: 'PREVIEW_ONLY_NON_DELIVERING'
      };
    }

    rendered.branding = mergedBranding;

    const unresolved = findUnresolvedPlaceholders(rendered);
    if (unresolved.length > 0) {
      this.incrementTelemetry('render.unresolved_placeholder.count', unresolved.length);
      return {
        accepted: false,
        code: 'UNRESOLVED_PLACEHOLDER',
        failures: unresolved.map((placeholder) => ({
          field: 'content',
          issue: 'UNRESOLVED_PLACEHOLDER',
          message: `Unresolved placeholder ${placeholder}.`
        }))
      };
    }

    const sizeBytes = Buffer.byteLength(stableJson(rendered), 'utf8');
    const maxBytes = Number(this.payloadLimits[channel] ?? 32768);
    if (sizeBytes > maxBytes) {
      return {
        accepted: false,
        code: 'RENDER_PAYLOAD_TOO_LARGE',
        failures: [{
          field: 'rendered',
          issue: 'RENDER_PAYLOAD_TOO_LARGE',
          message: `Rendered payload size ${sizeBytes} exceeds ${maxBytes} bytes.`
        }]
      };
    }

    return {
      accepted: true,
      rendered: sortObject(rendered),
      sizeBytes,
      branding: mergedBranding
    };
  }

  listCompositions() {
    return Array.from(this.compositions.values());
  }

  getComposition(compositionId) {
    const key = String(compositionId ?? '').trim();
    if (!key) return null;
    return this.compositions.get(key) ?? null;
  }

  getRenderedContent(contentRef) {
    const key = String(contentRef ?? '').trim();
    if (!key) return null;
    return this.renderedContent.get(key) ?? null;
  }

  listTemplateAudit() {
    return Array.from(this.audit.values())
      .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
  }

  getTelemetrySnapshot() {
    return Object.fromEntries(this.telemetry.entries());
  }

  auditTemplate(template = {}) {
    return {
      templateId: template.templateId,
      notificationType: template.notificationType,
      classification: template.classification,
      channel: template.channel,
      businessScope: template.businessScope,
      locale: template.locale,
      version: template.version,
      status: template.status
    };
  }

  getSanitizedAuditEvent(event) {
    return serializeDomainEventForAudit(event);
  }

  incrementTelemetry(key, amount = 1) {
    const normalized = String(key ?? '').trim();
    if (!normalized) return;
    const next = Number(this.telemetry.get(normalized) ?? 0) + Number(amount);
    this.telemetry.set(normalized, next);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.telemetry`, key: normalized, value: next });
  }

  recordAudit(event, details = {}) {
    const entry = {
      auditId: `ntpl_${stableHash(`${event}:${isoNow(this.now)}:${stableJson(details)}`).slice(0, 24)}`,
      event,
      at: isoNow(this.now),
      details
    };

    this.audit.set(entry.auditId, entry);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: entry.auditId, value: entry });
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.audit-events`, key: entry.auditId, value: entry });
  }
}
