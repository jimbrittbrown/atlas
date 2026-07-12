import { createHash, randomUUID } from 'node:crypto';

export const StrategicRegistryEntryTypes = Object.freeze({
  OPPORTUNITY: 'OPPORTUNITY',
  NOT_YET: 'NOT_YET',
  STRATEGIC_DECISION: 'STRATEGIC_DECISION',
  ARCHITECTURE_BACKLOG: 'ARCHITECTURE_BACKLOG',
  PRODUCT_EVOLUTION: 'PRODUCT_EVOLUTION',
  LESSON_LEARNED: 'LESSON_LEARNED',
  REJECTED_IDEA: 'REJECTED_IDEA'
});

export const StrategicRegistryStatuses = Object.freeze({
  CAPTURED: 'CAPTURED',
  EVALUATING: 'EVALUATING',
  DEFERRED: 'DEFERRED',
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED'
});

export const StrategicValueBands = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

const RedactedAuditKeys = [
  /secret/i,
  /token/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /cookie/i,
  /signature/i,
  /body/i,
  /message/i,
  /payload/i,
  /customer.*data/i,
  /email/i,
  /phone/i
];

const AllowedTransitions = Object.freeze({
  CAPTURED: new Set(['EVALUATING', 'DEFERRED', 'REJECTED']),
  EVALUATING: new Set(['DEFERRED', 'PLANNED', 'REJECTED']),
  DEFERRED: new Set(['EVALUATING', 'PLANNED']),
  PLANNED: new Set(['ACTIVE']),
  ACTIVE: new Set(['COMPLETED']),
  COMPLETED: new Set([]),
  REJECTED: new Set(['EVALUATING']),
  ARCHIVED: new Set([])
});

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function cloneJson(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function deterministicId(prefix, seed) {
  return `${prefix}_${stableHash(seed).slice(0, 24)}`;
}

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function isIsoTimestamp(value) {
  if (!hasText(value)) return false;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => {
    const child = value[key];
    if (child && typeof child === 'object') deepFreeze(child);
  });
  return Object.freeze(value);
}

function redactAuditValue(value, key = '') {
  if (RedactedAuditKeys.some((rule) => rule.test(String(key ?? '')))) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) return value.map((entry) => redactAuditValue(entry, key));

  if (value && typeof value === 'object') {
    const output = {};
    Object.entries(value).forEach(([childKey, childValue]) => {
      output[childKey] = redactAuditValue(childValue, childKey);
    });
    return output;
  }

  if (typeof value === 'string' && value.length > 240) {
    return `${value.slice(0, 240)}...`;
  }

  return value;
}

function validateBand(field, value, issues, { allowNull = false } = {}) {
  if (value == null && allowNull) return;
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!Object.values(StrategicValueBands).includes(normalized)) {
    issues.push(`${field} must be one of: ${Object.values(StrategicValueBands).join(', ')}.`);
  }
}

function validateStringArray(field, value, issues) {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be an array.`);
    return;
  }
  value.forEach((entry, index) => {
    if (!hasText(entry)) issues.push(`${field}[${index}] must be non-empty text.`);
  });
}

function normalizeTextArray(value) {
  return asArray(value)
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0);
}

export function createStrategicRegistryEntry({
  entryId,
  title,
  summary,
  entryType,
  status = StrategicRegistryStatuses.CAPTURED,
  category,
  source,
  createdBy,
  businessScope = {},
  strategicValue = StrategicValueBands.MEDIUM,
  customerValue = StrategicValueBands.MEDIUM,
  revenuePotential = StrategicValueBands.MEDIUM,
  technicalComplexity = StrategicValueBands.MEDIUM,
  operationalComplexity = StrategicValueBands.MEDIUM,
  dependencies = [],
  risks = [],
  decisionReason = null,
  deferredReason = null,
  rejectionReason = null,
  reviewTrigger = null,
  nextReviewAt = null,
  relatedEntryIds = [],
  tags = [],
  evidenceReferences = [],
  version = 1,
  createdAt,
  updatedAt,
  metadata = {}
} = {}, { now } = {}) {
  const issuedAt = nowIso(now);
  const normalized = {
    entryId: hasText(entryId)
      ? String(entryId).trim()
      : deterministicId('sreg', `${String(title ?? '').trim()}:${randomUUID()}`),
    title: String(title ?? '').trim(),
    summary: String(summary ?? '').trim(),
    entryType: String(entryType ?? '').trim().toUpperCase(),
    status: String(status ?? StrategicRegistryStatuses.CAPTURED).trim().toUpperCase(),
    category: String(category ?? '').trim(),
    source: String(source ?? '').trim(),
    createdAt: String(createdAt ?? issuedAt).trim(),
    updatedAt: String(updatedAt ?? issuedAt).trim(),
    createdBy: String(createdBy ?? '').trim(),
    businessScope: {
      businessId: hasText(asObject(businessScope).businessId) ? String(asObject(businessScope).businessId).trim() : null,
      customerId: hasText(asObject(businessScope).customerId) ? String(asObject(businessScope).customerId).trim() : null,
      productArea: hasText(asObject(businessScope).productArea) ? String(asObject(businessScope).productArea).trim() : null
    },
    strategicValue: String(strategicValue ?? StrategicValueBands.MEDIUM).trim().toUpperCase(),
    customerValue: String(customerValue ?? StrategicValueBands.MEDIUM).trim().toUpperCase(),
    revenuePotential: String(revenuePotential ?? StrategicValueBands.MEDIUM).trim().toUpperCase(),
    technicalComplexity: String(technicalComplexity ?? StrategicValueBands.MEDIUM).trim().toUpperCase(),
    operationalComplexity: String(operationalComplexity ?? StrategicValueBands.MEDIUM).trim().toUpperCase(),
    dependencies: normalizeTextArray(dependencies),
    risks: normalizeTextArray(risks),
    decisionReason: hasText(decisionReason) ? String(decisionReason).trim() : null,
    deferredReason: hasText(deferredReason) ? String(deferredReason).trim() : null,
    rejectionReason: hasText(rejectionReason) ? String(rejectionReason).trim() : null,
    reviewTrigger: hasText(reviewTrigger) ? String(reviewTrigger).trim() : null,
    nextReviewAt: hasText(nextReviewAt) ? String(nextReviewAt).trim() : null,
    relatedEntryIds: normalizeTextArray(relatedEntryIds),
    tags: normalizeTextArray(tags),
    evidenceReferences: cloneJson(evidenceReferences, []),
    version: Number(version),
    metadata: cloneJson(metadata, {})
  };

  const validation = validateStrategicRegistryEntry(normalized);
  if (!validation.isValid) {
    throw new Error(`StrategicRegistryEntry invalid: ${validation.issues.join(' | ')}`);
  }

  return deepFreeze(normalized);
}

export function validateStrategicRegistryEntry(entry = {}) {
  const issues = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { isValid: false, issues: ['entry must be an object.'] };
  }

  if (!hasText(entry.entryId)) issues.push('entryId is required.');
  if (!hasText(entry.title)) issues.push('title is required.');
  if (!hasText(entry.summary)) issues.push('summary is required.');

  if (!Object.values(StrategicRegistryEntryTypes).includes(String(entry.entryType ?? '').toUpperCase())) {
    issues.push(`entryType must be one of: ${Object.values(StrategicRegistryEntryTypes).join(', ')}.`);
  }

  if (!Object.values(StrategicRegistryStatuses).includes(String(entry.status ?? '').toUpperCase())) {
    issues.push(`status must be one of: ${Object.values(StrategicRegistryStatuses).join(', ')}.`);
  }

  if (!hasText(entry.category)) issues.push('category is required.');
  if (!hasText(entry.source)) issues.push('source is required.');
  if (!hasText(entry.createdBy)) issues.push('createdBy is required.');

  if (!isIsoTimestamp(entry.createdAt)) issues.push('createdAt must be a valid ISO timestamp.');
  if (!isIsoTimestamp(entry.updatedAt)) issues.push('updatedAt must be a valid ISO timestamp.');
  if (hasText(entry.nextReviewAt) && !isIsoTimestamp(entry.nextReviewAt)) {
    issues.push('nextReviewAt must be a valid ISO timestamp when provided.');
  }

  if (!entry.businessScope || typeof entry.businessScope !== 'object' || Array.isArray(entry.businessScope)) {
    issues.push('businessScope must be an object.');
  } else if (!hasText(entry.businessScope.businessId) && !hasText(entry.businessScope.productArea)) {
    issues.push('businessScope must include businessId or productArea.');
  }

  validateBand('strategicValue', entry.strategicValue, issues);
  validateBand('customerValue', entry.customerValue, issues);
  validateBand('revenuePotential', entry.revenuePotential, issues);
  validateBand('technicalComplexity', entry.technicalComplexity, issues);
  validateBand('operationalComplexity', entry.operationalComplexity, issues);

  validateStringArray('dependencies', entry.dependencies, issues);
  validateStringArray('risks', entry.risks, issues);
  validateStringArray('relatedEntryIds', entry.relatedEntryIds, issues);
  validateStringArray('tags', entry.tags, issues);

  if (!Array.isArray(entry.evidenceReferences)) {
    issues.push('evidenceReferences must be an array.');
  }

  if (!Number.isInteger(Number(entry.version)) || Number(entry.version) < 1) {
    issues.push('version must be a positive integer.');
  }

  if (String(entry.status ?? '').toUpperCase() === StrategicRegistryStatuses.DEFERRED && !hasText(entry.deferredReason)) {
    issues.push('deferredReason is required when status is DEFERRED.');
  }

  if (String(entry.status ?? '').toUpperCase() === StrategicRegistryStatuses.REJECTED && !hasText(entry.rejectionReason)) {
    issues.push('rejectionReason is required when status is REJECTED.');
  }

  return { isValid: issues.length === 0, issues };
}

export function validateStrategicStatusTransition({
  fromStatus,
  toStatus,
  authorizeArchive = false,
  reconsiderationReason = null
} = {}) {
  const from = String(fromStatus ?? '').trim().toUpperCase();
  const to = String(toStatus ?? '').trim().toUpperCase();

  if (!Object.values(StrategicRegistryStatuses).includes(from)) {
    return { isValid: false, reason: `Unknown fromStatus: ${fromStatus}` };
  }

  if (!Object.values(StrategicRegistryStatuses).includes(to)) {
    return { isValid: false, reason: `Unknown toStatus: ${toStatus}` };
  }

  if (from === to) {
    return { isValid: true, reason: 'No-op transition allowed.' };
  }

  if (to === StrategicRegistryStatuses.ARCHIVED) {
    if (from === StrategicRegistryStatuses.COMPLETED) {
      return { isValid: false, reason: 'Completed entries cannot transition to ARCHIVED.' };
    }
    if (!authorizeArchive) {
      return { isValid: false, reason: 'ARCHIVED transition requires explicit authorization.' };
    }
    return { isValid: true, reason: 'Archive authorized.' };
  }

  if (from === StrategicRegistryStatuses.REJECTED && to === StrategicRegistryStatuses.EVALUATING) {
    if (!hasText(reconsiderationReason)) {
      return { isValid: false, reason: 'Rejected entry reconsideration requires reconsiderationReason.' };
    }
    return { isValid: true, reason: 'Rejected idea reconsidered.' };
  }

  const allowed = AllowedTransitions[from] ?? new Set();
  if (!allowed.has(to)) {
    return { isValid: false, reason: `Illegal status transition ${from} -> ${to}.` };
  }

  return { isValid: true, reason: 'Transition allowed.' };
}

export function createStrategicHistoryEntry({
  historyId,
  entryId,
  type,
  actor,
  reason = null,
  fromStatus = null,
  toStatus = null,
  changes = {},
  createdAt,
  metadata = {}
} = {}, { now } = {}) {
  const at = String(createdAt ?? nowIso(now)).trim();
  const normalized = {
    historyId: hasText(historyId)
      ? String(historyId).trim()
      : deterministicId('sreg_hist', `${String(entryId ?? '').trim()}:${String(type ?? '').trim()}:${at}:${randomUUID()}`),
    entryId: String(entryId ?? '').trim(),
    type: String(type ?? '').trim(),
    actor: String(actor ?? 'SYSTEM').trim(),
    reason: hasText(reason) ? String(reason).trim() : null,
    fromStatus: hasText(fromStatus) ? String(fromStatus).trim().toUpperCase() : null,
    toStatus: hasText(toStatus) ? String(toStatus).trim().toUpperCase() : null,
    changes: cloneJson(changes, {}),
    createdAt: at,
    metadata: cloneJson(metadata, {})
  };

  return deepFreeze(normalized);
}

export function serializeStrategicAuditDetails(details = {}) {
  return deepFreeze(redactAuditValue(cloneJson(details, {}), 'details'));
}