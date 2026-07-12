import { createHash } from 'node:crypto';
import { appendEvent, getMetaMap, loadRecordMap, setMetaValue, upsertRecord } from '../storage/provider-backed-state.js';
import {
  StrategicRegistryEntryTypes,
  StrategicRegistryStatuses,
  StrategicValueBands,
  createStrategicHistoryEntry,
  createStrategicRegistryEntry,
  serializeStrategicAuditDetails,
  validateStrategicRegistryEntry,
  validateStrategicStatusTransition
} from './strategic-ideas-registry-contracts.js';

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function cloneJson(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function deterministicId(prefix, seed) {
  return `${prefix}_${stableHash(seed).slice(0, 24)}`;
}

function sanitizeTags(value) {
  return asArray(value)
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
}

function uniqueList(values = []) {
  return Array.from(new Set(values));
}

function normalizeStatus(value, fallback = StrategicRegistryStatuses.CAPTURED) {
  const status = String(value ?? fallback).trim().toUpperCase();
  if (Object.values(StrategicRegistryStatuses).includes(status)) return status;
  return fallback;
}

function defaultBusinessScope(scope = {}) {
  const normalized = asObject(scope);
  return {
    businessId: hasText(normalized.businessId) ? String(normalized.businessId).trim() : 'SYSTEM_INTERNAL',
    customerId: hasText(normalized.customerId) ? String(normalized.customerId).trim() : null,
    productArea: hasText(normalized.productArea) ? String(normalized.productArea).trim() : 'ATLAS_PLATFORM'
  };
}

const SeedEntriesV01 = Object.freeze([
  {
    key: 'website_care_service',
    title: 'Website Care service',
    summary: 'Recurring service model for ongoing website maintenance, reliability, and optimization for retained customers.',
    entryType: StrategicRegistryEntryTypes.OPPORTUNITY,
    status: StrategicRegistryStatuses.PLANNED,
    category: 'WEBSITE_STUDIO',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'WEBSITE_STUDIO' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.HIGH,
    technicalComplexity: StrategicValueBands.MEDIUM,
    operationalComplexity: StrategicValueBands.MEDIUM,
    dependencies: ['operational_readiness_levels'],
    risks: ['service scope creep without standard operating profile'],
    decisionReason: 'Expands recurring value from established website production capability.',
    reviewTrigger: 'Re-evaluate when Operational Readiness Levels baseline is completed.',
    tags: ['recurring-service', 'website-care', 'retention'],
    evidenceReferences: [{ type: 'strategy', ref: 'website-recurring-services-thesis' }]
  },
  {
    key: 'monthly_website_health_reports',
    title: 'Monthly Website Care / Business Health Reports',
    summary: 'Monthly executive-facing performance and risk summaries for customer websites and business goals.',
    entryType: StrategicRegistryEntryTypes.PRODUCT_EVOLUTION,
    status: StrategicRegistryStatuses.DEFERRED,
    category: 'WEBSITE_STUDIO',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'WEBSITE_STUDIO' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.MEDIUM,
    technicalComplexity: StrategicValueBands.MEDIUM,
    operationalComplexity: StrategicValueBands.MEDIUM,
    dependencies: ['website_care_service', 'operational_readiness_levels'],
    risks: ['reporting quality degrades trust if data freshness is weak'],
    deferredReason: 'Deferred until baseline Website Care service instrumentation is stable.',
    reviewTrigger: 'Reconsider after Website Care service reaches active customer usage.',
    tags: ['monthly-review', 'reporting', 'retention'],
    evidenceReferences: [{ type: 'strategy', ref: 'monthly-health-report-outline' }]
  },
  {
    key: 'continuous_website_improvement_automation',
    title: 'Continuous website improvement automation',
    summary: 'Automate low-risk iterative improvements based on verified performance and customer outcome signals.',
    entryType: StrategicRegistryEntryTypes.PRODUCT_EVOLUTION,
    status: StrategicRegistryStatuses.DEFERRED,
    category: 'WEBSITE_STUDIO',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'WEBSITE_AUTOMATION' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.HIGH,
    technicalComplexity: StrategicValueBands.HIGH,
    operationalComplexity: StrategicValueBands.HIGH,
    dependencies: ['risk_based_website_change_automation', 'operational_readiness_levels'],
    risks: ['automation regressions without robust approval boundaries'],
    deferredReason: 'Deferred until risk-based automation controls are proven in production.',
    reviewTrigger: 'Re-evaluate after risk-based website change automation reaches stable operation.',
    tags: ['automation', 'website-improvement', 'continuous-delivery'],
    evidenceReferences: [{ type: 'strategy', ref: 'continuous-improvement-automation-note' }]
  },
  {
    key: 'automated_customer_email_intake_response',
    title: 'Automated customer email intake and response',
    summary: 'Operational capability to classify, route, and respond to customer email intake with governance controls.',
    entryType: StrategicRegistryEntryTypes.OPPORTUNITY,
    status: StrategicRegistryStatuses.EVALUATING,
    category: 'CUSTOMER_OPERATIONS',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'CUSTOMER_OPERATIONS' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.MEDIUM,
    technicalComplexity: StrategicValueBands.HIGH,
    operationalComplexity: StrategicValueBands.MEDIUM,
    dependencies: ['notification_platform_certification_lesson'],
    risks: ['incorrect response automation can degrade trust'],
    decisionReason: 'Potentially strong operations leverage once guardrails are validated.',
    reviewTrigger: 'Re-evaluate when certified messaging and governance controls are reusable for intake workflows.',
    tags: ['email', 'operations', 'automation'],
    evidenceReferences: [{ type: 'strategy', ref: 'email-intake-opportunity-brief' }]
  },
  {
    key: 'risk_based_website_change_automation',
    title: 'Risk-based website change automation',
    summary: 'Introduce change automation tiers where higher-risk changes require stronger approvals and controls.',
    entryType: StrategicRegistryEntryTypes.ARCHITECTURE_BACKLOG,
    status: StrategicRegistryStatuses.PLANNED,
    category: 'WEBSITE_AUTOMATION',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'WEBSITE_AUTOMATION' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.MEDIUM,
    technicalComplexity: StrategicValueBands.HIGH,
    operationalComplexity: StrategicValueBands.HIGH,
    dependencies: ['operational_readiness_levels', 'atlas_platform_certification_standard'],
    risks: ['inadequate risk classification can cause unsafe automation'],
    decisionReason: 'Core prerequisite for safe continuous automation roadmap.',
    reviewTrigger: 'Re-evaluate once readiness levels and certification criteria are stable for change classes.',
    tags: ['risk-based', 'automation', 'website'],
    evidenceReferences: [{ type: 'strategy', ref: 'risk-based-change-roadmap' }]
  },
  {
    key: 'prospect_scoring_engine',
    title: 'Prospect scoring engine',
    summary: 'Structured scoring model for outbound prioritization and qualification quality.',
    entryType: StrategicRegistryEntryTypes.OPPORTUNITY,
    status: StrategicRegistryStatuses.EVALUATING,
    category: 'GROWTH',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'GROWTH' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.MEDIUM,
    revenuePotential: StrategicValueBands.HIGH,
    technicalComplexity: StrategicValueBands.MEDIUM,
    operationalComplexity: StrategicValueBands.MEDIUM,
    dependencies: ['customer_acquisition_retention_engine_strategy'],
    risks: ['scoring drift without feedback loops'],
    decisionReason: 'Supports prioritization discipline in acquisition pipelines.',
    reviewTrigger: 'Re-evaluate once acquisition-retention strategy defines canonical success signals.',
    tags: ['prospecting', 'scoring', 'growth'],
    evidenceReferences: [{ type: 'strategy', ref: 'prospect-scoring-engine-note' }]
  },
  {
    key: 'graduated_autonomous_customer_outreach',
    title: 'Graduated autonomous customer outreach',
    summary: 'Progressive outreach autonomy model that increases automation only with proven reliability.',
    entryType: StrategicRegistryEntryTypes.ARCHITECTURE_BACKLOG,
    status: StrategicRegistryStatuses.DEFERRED,
    category: 'GROWTH',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'GROWTH' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.MEDIUM,
    revenuePotential: StrategicValueBands.HIGH,
    technicalComplexity: StrategicValueBands.HIGH,
    operationalComplexity: StrategicValueBands.HIGH,
    dependencies: ['prospect_scoring_engine', 'outreach_confidence_engine', 'notification_platform_certification_lesson'],
    risks: ['autonomous outreach can cause reputational harm without confidence gating'],
    deferredReason: 'Deferred pending confidence controls and verified outreach quality thresholds.',
    reviewTrigger: 'Reconsider when Outreach Confidence Engine is active with acceptable error profile.',
    tags: ['outreach', 'autonomy', 'growth'],
    evidenceReferences: [{ type: 'strategy', ref: 'graduated-outreach-model' }]
  },
  {
    key: 'outreach_confidence_engine',
    title: 'Outreach Confidence Engine',
    summary: 'Confidence-gating subsystem for outreach actions based on evidence quality and safety constraints.',
    entryType: StrategicRegistryEntryTypes.ARCHITECTURE_BACKLOG,
    status: StrategicRegistryStatuses.EVALUATING,
    category: 'GROWTH',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'GROWTH' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.MEDIUM,
    revenuePotential: StrategicValueBands.HIGH,
    technicalComplexity: StrategicValueBands.HIGH,
    operationalComplexity: StrategicValueBands.MEDIUM,
    dependencies: ['atlas_platform_certification_standard'],
    risks: ['false confidence can trigger unsafe outbound behavior'],
    decisionReason: 'Required governance boundary before autonomous outreach expansion.',
    reviewTrigger: 'Re-evaluate after certification standard baseline is adopted across platform services.',
    tags: ['confidence', 'outreach', 'safety'],
    evidenceReferences: [{ type: 'strategy', ref: 'outreach-confidence-concept' }]
  },
  {
    key: 'atlas_business_agent_local_connector',
    title: 'Atlas Business Agent — lightweight local customer connector',
    summary: 'Lightweight connector for local customer systems to expose controlled operations context into Atlas.',
    entryType: StrategicRegistryEntryTypes.OPPORTUNITY,
    status: StrategicRegistryStatuses.DEFERRED,
    category: 'ENTERPRISE_INTEGRATION',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'ENTERPRISE_INTEGRATION' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.HIGH,
    technicalComplexity: StrategicValueBands.HIGH,
    operationalComplexity: StrategicValueBands.HIGH,
    dependencies: ['atlas_enterprise_deployment_model', 'operational_readiness_levels'],
    risks: ['connector trust boundaries require strong security hardening'],
    deferredReason: 'Deferred until enterprise deployment and readiness standards are complete.',
    reviewTrigger: 'Reconsider when enterprise deployment model is completed with approved security boundaries.',
    tags: ['connector', 'enterprise', 'local-agent'],
    evidenceReferences: [{ type: 'strategy', ref: 'business-agent-local-connector-brief' }]
  },
  {
    key: 'atlas_enterprise_deployment_model',
    title: 'Atlas Enterprise deployment model',
    summary: 'Deployment model for enterprise environments requiring stronger isolation and governance.',
    entryType: StrategicRegistryEntryTypes.ARCHITECTURE_BACKLOG,
    status: StrategicRegistryStatuses.EVALUATING,
    category: 'ENTERPRISE',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'ENTERPRISE' },
    strategicValue: StrategicValueBands.CRITICAL,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.HIGH,
    technicalComplexity: StrategicValueBands.HIGH,
    operationalComplexity: StrategicValueBands.HIGH,
    dependencies: ['atlas_platform_certification_standard', 'operational_readiness_levels'],
    risks: ['enterprise misconfiguration risk without strict operational controls'],
    decisionReason: 'Strategic path for high-trust enterprise adoption.',
    reviewTrigger: 'Re-evaluate after certification standard and readiness levels are institutionalized.',
    tags: ['enterprise', 'deployment', 'isolation'],
    evidenceReferences: [{ type: 'strategy', ref: 'enterprise-deployment-model-note' }]
  },
  {
    key: 'operational_readiness_levels',
    title: 'Operational Readiness Levels',
    summary: 'Institutional readiness scale to gate service promotion and automation depth.',
    entryType: StrategicRegistryEntryTypes.STRATEGIC_DECISION,
    status: StrategicRegistryStatuses.ACTIVE,
    category: 'OPERATIONS',
    source: 'ATLAS_GOVERNANCE',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'PLATFORM_GOVERNANCE' },
    strategicValue: StrategicValueBands.CRITICAL,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.MEDIUM,
    technicalComplexity: StrategicValueBands.MEDIUM,
    operationalComplexity: StrategicValueBands.MEDIUM,
    dependencies: [],
    risks: ['inconsistent application of readiness criteria across teams'],
    decisionReason: 'Active governance foundation for controlled growth and reliability.',
    reviewTrigger: 'Review when any service proposes autonomy level increase beyond current readiness band.',
    tags: ['readiness', 'governance', 'operations'],
    evidenceReferences: [{ type: 'governance', ref: 'operational-readiness-levels-policy' }]
  },
  {
    key: 'atlas_platform_certification_standard',
    title: 'Atlas Platform Certification Standard',
    summary: 'Cross-service certification standard for release authority decisions and production promotion.',
    entryType: StrategicRegistryEntryTypes.STRATEGIC_DECISION,
    status: StrategicRegistryStatuses.ACTIVE,
    category: 'GOVERNANCE',
    source: 'ATLAS_GOVERNANCE',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'PLATFORM_GOVERNANCE' },
    strategicValue: StrategicValueBands.CRITICAL,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.MEDIUM,
    technicalComplexity: StrategicValueBands.MEDIUM,
    operationalComplexity: StrategicValueBands.MEDIUM,
    dependencies: [],
    risks: ['certification drift if standards are not consistently applied'],
    decisionReason: 'Institutional mechanism for fail-closed release governance.',
    reviewTrigger: 'Review when new service class or materially new risk domain is introduced.',
    tags: ['certification', 'release-authority', 'governance'],
    evidenceReferences: [{ type: 'governance', ref: 'atlas-platform-certification-standard' }]
  },
  {
    key: 'expand_website_studio_before_unrelated_businesses',
    title: 'Expand Website Studio into related recurring services before starting unrelated businesses',
    summary: 'Strategic sequencing decision to deepen Website Studio compounding services prior to unrelated ventures.',
    entryType: StrategicRegistryEntryTypes.STRATEGIC_DECISION,
    status: StrategicRegistryStatuses.ACTIVE,
    category: 'STRATEGY',
    source: 'ATLAS_EXECUTIVE_DECISION',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'WEBSITE_STUDIO' },
    strategicValue: StrategicValueBands.CRITICAL,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.HIGH,
    technicalComplexity: StrategicValueBands.LOW,
    operationalComplexity: StrategicValueBands.MEDIUM,
    dependencies: [],
    risks: ['execution distraction if sequencing is not enforced'],
    decisionReason: 'Focus on compounding capabilities in current strategic lane.',
    reviewTrigger: 'Review when recurring Website Studio service portfolio reaches sustained growth targets.',
    tags: ['focus', 'sequencing', 'website-studio'],
    evidenceReferences: [{ type: 'executive-decision', ref: 'website-studio-expansion-priority' }]
  },
  {
    key: 'executive_knowledge_platform',
    title: 'Executive Knowledge Platform',
    summary: 'Long-term platform concept for broader executive memory, review workflows, and strategic synthesis.',
    entryType: StrategicRegistryEntryTypes.NOT_YET,
    status: StrategicRegistryStatuses.DEFERRED,
    category: 'PLATFORM_EVOLUTION',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'PLATFORM_EVOLUTION' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.MEDIUM,
    revenuePotential: StrategicValueBands.MEDIUM,
    technicalComplexity: StrategicValueBands.HIGH,
    operationalComplexity: StrategicValueBands.HIGH,
    dependencies: ['atlas_platform_certification_standard', 'operational_readiness_levels'],
    risks: ['premature scope expansion can dilute current execution focus'],
    deferredReason: 'Deferred to preserve focus on bounded strategic registry and core platform priorities.',
    reviewTrigger: 'Reconsider when strategic registry demonstrates sustained value and review discipline.',
    tags: ['knowledge-platform', 'not-yet', 'institutional-memory'],
    evidenceReferences: [{ type: 'strategy', ref: 'executive-knowledge-platform-concept' }]
  },
  {
    key: 'quarterly_opportunity_review',
    title: 'Quarterly opportunity review',
    summary: 'Executive process decision to review strategic ideas quarterly with dependency-driven reconsideration in between.',
    entryType: StrategicRegistryEntryTypes.STRATEGIC_DECISION,
    status: StrategicRegistryStatuses.ACTIVE,
    category: 'GOVERNANCE',
    source: 'ATLAS_EXECUTIVE_DECISION',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'PLATFORM_GOVERNANCE' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.MEDIUM,
    revenuePotential: StrategicValueBands.MEDIUM,
    technicalComplexity: StrategicValueBands.LOW,
    operationalComplexity: StrategicValueBands.LOW,
    dependencies: ['atlas_strategic_ideas_registry_v0_1'],
    risks: ['review debt if cadence is not operationally protected'],
    decisionReason: 'Institutional cadence to prevent strategic forgetting.',
    reviewTrigger: 'Quarterly executive review and dependency milestone completion events.',
    tags: ['quarterly-review', 'governance', 'cadence'],
    evidenceReferences: [{ type: 'executive-decision', ref: 'quarterly-opportunity-review-mandate' }]
  },
  {
    key: 'customer_acquisition_retention_engine_strategy',
    title: 'Customer acquisition and retention engine strategy',
    summary: 'Integrated strategy linking acquisition quality, onboarding, retention, and recurring value delivery.',
    entryType: StrategicRegistryEntryTypes.STRATEGIC_DECISION,
    status: StrategicRegistryStatuses.EVALUATING,
    category: 'GROWTH',
    source: 'ATLAS_STRATEGY',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'GROWTH' },
    strategicValue: StrategicValueBands.CRITICAL,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.CRITICAL,
    technicalComplexity: StrategicValueBands.MEDIUM,
    operationalComplexity: StrategicValueBands.MEDIUM,
    dependencies: ['website_care_service', 'monthly_website_health_reports'],
    risks: ['fragmented execution if strategy remains disconnected from service capabilities'],
    decisionReason: 'Defines compounding engine for sustainable growth and retention.',
    reviewTrigger: 'Review when Website Care and monthly health reporting have baseline execution evidence.',
    tags: ['growth-engine', 'retention', 'acquisition'],
    evidenceReferences: [{ type: 'strategy', ref: 'acquisition-retention-engine-thesis' }]
  },
  {
    key: 'identity_platform_certification_lesson',
    title: 'Identity Platform certification lesson',
    summary: 'Institutional lesson from identity certification emphasizing fail-closed controls and adversarial coverage.',
    entryType: StrategicRegistryEntryTypes.LESSON_LEARNED,
    status: StrategicRegistryStatuses.ACTIVE,
    category: 'LESSONS',
    source: 'ATLAS_CERTIFICATION',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'PLATFORM_GOVERNANCE' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.LOW,
    technicalComplexity: StrategicValueBands.LOW,
    operationalComplexity: StrategicValueBands.LOW,
    dependencies: [],
    risks: ['lessons can decay if not reinforced across new missions'],
    decisionReason: 'Preserve certification learning as reusable governance asset.',
    reviewTrigger: 'Review whenever authentication or identity-related mission enters certification stage.',
    tags: ['lesson-learned', 'identity', 'certification'],
    evidenceReferences: [{ type: 'certification', ref: 'mission-g-r1-identity-remediation' }]
  },
  {
    key: 'notification_platform_certification_lesson',
    title: 'Notification Platform certification lesson',
    summary: 'Institutional lesson from notification certification emphasizing explicit security/concurrency coverage and reproducibility hygiene.',
    entryType: StrategicRegistryEntryTypes.LESSON_LEARNED,
    status: StrategicRegistryStatuses.ACTIVE,
    category: 'LESSONS',
    source: 'ATLAS_CERTIFICATION',
    businessScope: { businessId: 'SYSTEM_INTERNAL', productArea: 'PLATFORM_GOVERNANCE' },
    strategicValue: StrategicValueBands.HIGH,
    customerValue: StrategicValueBands.HIGH,
    revenuePotential: StrategicValueBands.LOW,
    technicalComplexity: StrategicValueBands.LOW,
    operationalComplexity: StrategicValueBands.LOW,
    dependencies: [],
    risks: ['release rigor can regress if certification artifacts are not reproducible'],
    decisionReason: 'Preserve release authority lessons for future platform services.',
    reviewTrigger: 'Review at start of each new service certification mission.',
    tags: ['lesson-learned', 'notification', 'certification'],
    evidenceReferences: [{ type: 'certification', ref: 'mission-n11-r2-notification-certification' }]
  }
]);

export class StrategicIdeasRegistry {
  constructor({
    storageProvider,
    now,
    namespace = 'executive.strategic-ideas-registry',
    seedOnStartup = true,
    createdBy = 'ATLAS_EXECUTIVE'
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.namespace = namespace;
    this.createdBy = String(createdBy ?? 'ATLAS_EXECUTIVE').trim();

    this.entries = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.entries` });
    this.history = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.history` });
    this.historyByEntry = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.history-by-entry` });
    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` });
    this.seedIndex = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.seed-index` });

    if (seedOnStartup) this.seedInitialEntries();
  }

  listEntries({
    businessId = null,
    customerId = null,
    entryType = null,
    status = null,
    category = null,
    includeArchived = false,
    tags = []
  } = {}) {
    const requiredTags = sanitizeTags(tags).map((entry) => entry.toLowerCase());
    return Array.from(this.entries.values())
      .filter((entry) => includeArchived || String(entry.status).toUpperCase() !== StrategicRegistryStatuses.ARCHIVED)
      .filter((entry) => !hasText(businessId) || String(entry.businessScope?.businessId ?? '') === String(businessId))
      .filter((entry) => !hasText(customerId) || String(entry.businessScope?.customerId ?? '') === String(customerId))
      .filter((entry) => !hasText(entryType) || String(entry.entryType).toUpperCase() === String(entryType).toUpperCase())
      .filter((entry) => !hasText(status) || String(entry.status).toUpperCase() === String(status).toUpperCase())
      .filter((entry) => !hasText(category) || String(entry.category).toUpperCase() === String(category).toUpperCase())
      .filter((entry) => requiredTags.length === 0 || requiredTags.every((tag) => asArray(entry.tags).some((item) => String(item).toLowerCase() === tag)))
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }

  getEntry({ entryId, businessId = null, customerId = null, includeArchived = true } = {}) {
    const key = String(entryId ?? '').trim();
    if (!key) return null;

    const entry = this.entries.get(key) ?? null;
    if (!entry) return null;
    if (!includeArchived && String(entry.status).toUpperCase() === StrategicRegistryStatuses.ARCHIVED) return null;
    if (hasText(businessId) && String(entry.businessScope?.businessId ?? '') !== String(businessId)) return null;
    if (hasText(customerId) && String(entry.businessScope?.customerId ?? '') !== String(customerId)) return null;
    return entry;
  }

  createEntry(payload = {}, { actor = null, reason = null, seedKey = null } = {}) {
    const normalizedScope = defaultBusinessScope(payload.businessScope);
    const duplicate = this.findDuplicateEntry({
      title: payload.title,
      entryType: payload.entryType,
      businessId: normalizedScope.businessId,
      productArea: normalizedScope.productArea
    });

    if (duplicate) {
      return {
        accepted: true,
        code: 'ALREADY_EXISTS',
        entry: duplicate,
        duplicate: true
      };
    }

    let entry;
    try {
      entry = createStrategicRegistryEntry({
        ...payload,
        createdBy: hasText(payload.createdBy) ? payload.createdBy : (actor ?? this.createdBy),
        businessScope: normalizedScope,
        metadata: {
          ...asObject(payload.metadata),
          seedKey: hasText(seedKey) ? seedKey : asObject(payload.metadata).seedKey ?? null
        }
      }, { now: this.now });
    } catch (error) {
      return {
        accepted: false,
        code: 'INVALID_ENTRY',
        reason: String(error?.message ?? 'Entry validation failed.')
      };
    }

    const persisted = this.persistNewEntry(entry);
    if (!persisted.accepted) return persisted;

    this.recordHistory({
      entryId: entry.entryId,
      type: 'ENTRY_CREATED',
      actor: actor ?? entry.createdBy,
      reason,
      changes: {
        status: entry.status,
        entryType: entry.entryType
      }
    });

    this.recordAudit('strategic_entry_created', {
      entryId: entry.entryId,
      entryType: entry.entryType,
      status: entry.status,
      title: entry.title,
      businessScope: entry.businessScope,
      actor: actor ?? entry.createdBy,
      reason
    });

    if (hasText(seedKey)) {
      this.seedIndex.set(seedKey, entry.entryId);
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.seed-index`, key: seedKey, value: entry.entryId });
    }

    return {
      accepted: true,
      code: 'CREATED',
      entry
    };
  }

  updateEntry({ entryId, expectedVersion, patch = {}, actor = null, reason = null } = {}) {
    const current = this.getEntry({ entryId, includeArchived: true });
    if (!current) {
      return { accepted: false, code: 'NOT_FOUND', reason: 'Strategic entry not found.' };
    }

    const expected = Number(expectedVersion);
    if (!Number.isInteger(expected) || expected < 1) {
      return { accepted: false, code: 'INVALID_REQUEST', reason: 'expectedVersion must be a positive integer.' };
    }

    if (expected !== Number(current.version)) {
      return { accepted: false, code: 'VERSION_MISMATCH', reason: 'Stale entry version.', current };
    }

    const forbiddenPatch = ['entryId', 'createdAt', 'createdBy', 'businessScope'];
    if (forbiddenPatch.some((name) => Object.prototype.hasOwnProperty.call(patch, name))) {
      return { accepted: false, code: 'IMMUTABLE_FIELD', reason: 'entryId, createdAt, createdBy, and businessScope are immutable.' };
    }

    const candidate = {
      ...cloneJson(current, {}),
      ...cloneJson(patch, {}),
      entryId: current.entryId,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      businessScope: cloneJson(current.businessScope, {}),
      version: Number(current.version) + 1,
      updatedAt: nowIso(this.now),
      dependencies: sanitizeTags(patch.dependencies ?? current.dependencies),
      risks: sanitizeTags(patch.risks ?? current.risks),
      relatedEntryIds: sanitizeTags(patch.relatedEntryIds ?? current.relatedEntryIds),
      tags: sanitizeTags(patch.tags ?? current.tags)
    };

    const validation = validateStrategicRegistryEntry(candidate);
    if (!validation.isValid) {
      return {
        accepted: false,
        code: 'INVALID_ENTRY',
        reason: validation.issues.join(' | '),
        issues: validation.issues
      };
    }

    const cas = this.compareAndSetEntry({ current, next: candidate, expectedVersion: expected });
    if (!cas.accepted) return cas;

    const changes = this.computeChanges(current, candidate);
    this.recordHistory({
      entryId: candidate.entryId,
      type: 'ENTRY_UPDATED',
      actor: actor ?? this.createdBy,
      reason,
      changes
    });

    this.recordAudit('strategic_entry_updated', {
      entryId: candidate.entryId,
      actor: actor ?? this.createdBy,
      reason,
      changes
    });

    return {
      accepted: true,
      code: 'UPDATED',
      entry: candidate
    };
  }

  changeStatus({
    entryId,
    toStatus,
    expectedVersion,
    actor = null,
    reason = null,
    authorizeArchive = false,
    deferredReason = null,
    rejectionReason = null,
    reconsiderationReason = null
  } = {}) {
    const current = this.getEntry({ entryId, includeArchived: true });
    if (!current) return { accepted: false, code: 'NOT_FOUND', reason: 'Strategic entry not found.' };

    const expected = Number(expectedVersion);
    if (!Number.isInteger(expected) || expected < 1) {
      return { accepted: false, code: 'INVALID_REQUEST', reason: 'expectedVersion must be a positive integer.' };
    }
    if (expected !== Number(current.version)) {
      return { accepted: false, code: 'VERSION_MISMATCH', reason: 'Stale entry version.', current };
    }

    const nextStatus = normalizeStatus(toStatus, current.status);
    const transition = validateStrategicStatusTransition({
      fromStatus: current.status,
      toStatus: nextStatus,
      authorizeArchive,
      reconsiderationReason
    });
    if (!transition.isValid) {
      return { accepted: false, code: 'ILLEGAL_STATUS_TRANSITION', reason: transition.reason };
    }

    const next = {
      ...cloneJson(current, {}),
      status: nextStatus,
      version: Number(current.version) + 1,
      updatedAt: nowIso(this.now)
    };

    if (nextStatus === StrategicRegistryStatuses.DEFERRED) {
      if (!hasText(deferredReason)) {
        return { accepted: false, code: 'INVALID_REQUEST', reason: 'deferredReason is required for DEFERRED status.' };
      }
      next.deferredReason = String(deferredReason).trim();
    }

    if (nextStatus === StrategicRegistryStatuses.REJECTED) {
      if (!hasText(rejectionReason)) {
        return { accepted: false, code: 'INVALID_REQUEST', reason: 'rejectionReason is required for REJECTED status.' };
      }
      next.rejectionReason = String(rejectionReason).trim();
    }

    if (String(current.status).toUpperCase() === StrategicRegistryStatuses.REJECTED && nextStatus === StrategicRegistryStatuses.EVALUATING) {
      next.decisionReason = hasText(reconsiderationReason) ? String(reconsiderationReason).trim() : current.decisionReason;
    }

    const validation = validateStrategicRegistryEntry(next);
    if (!validation.isValid) {
      return {
        accepted: false,
        code: 'INVALID_ENTRY',
        reason: validation.issues.join(' | '),
        issues: validation.issues
      };
    }

    const cas = this.compareAndSetEntry({ current, next, expectedVersion: expected });
    if (!cas.accepted) return cas;

    const event = this.statusToAuditEvent({ fromStatus: current.status, toStatus: nextStatus });
    this.recordHistory({
      entryId: next.entryId,
      type: 'STATUS_CHANGED',
      actor: actor ?? this.createdBy,
      reason,
      fromStatus: current.status,
      toStatus: nextStatus,
      changes: {
        status: { from: current.status, to: nextStatus },
        deferredReason: next.deferredReason,
        rejectionReason: next.rejectionReason,
        reconsiderationReason: hasText(reconsiderationReason) ? reconsiderationReason : null
      }
    });

    this.recordAudit(event, {
      entryId: next.entryId,
      fromStatus: current.status,
      toStatus: nextStatus,
      actor: actor ?? this.createdBy,
      reason,
      deferredReason: nextStatus === StrategicRegistryStatuses.DEFERRED ? next.deferredReason : null,
      rejectionReason: nextStatus === StrategicRegistryStatuses.REJECTED ? next.rejectionReason : null,
      reconsiderationReason: hasText(reconsiderationReason) ? reconsiderationReason : null
    });

    if (String(current.status).toUpperCase() === StrategicRegistryStatuses.REJECTED && nextStatus === StrategicRegistryStatuses.EVALUATING) {
      this.recordAudit('strategic_entry_reconsidered', {
        entryId: next.entryId,
        actor: actor ?? this.createdBy,
        reconsiderationReason: String(reconsiderationReason).trim(),
        rejectionReason: current.rejectionReason
      });
    }

    return {
      accepted: true,
      code: 'STATUS_UPDATED',
      entry: next
    };
  }

  scheduleReview({ entryId, expectedVersion, nextReviewAt = null, reviewTrigger = null, actor = null, reason = null } = {}) {
    return this.updateEntry({
      entryId,
      expectedVersion,
      patch: {
        nextReviewAt: hasText(nextReviewAt) ? String(nextReviewAt).trim() : null,
        reviewTrigger: hasText(reviewTrigger) ? String(reviewTrigger).trim() : null
      },
      actor,
      reason
    }).accepted
      ? this.onReviewScheduled({ entryId, actor, reason, nextReviewAt, reviewTrigger })
      : this.updateEntry({
        entryId,
        expectedVersion,
        patch: {
          nextReviewAt: hasText(nextReviewAt) ? String(nextReviewAt).trim() : null,
          reviewTrigger: hasText(reviewTrigger) ? String(reviewTrigger).trim() : null
        },
        actor,
        reason
      });
  }

  onReviewScheduled({ entryId, actor, reason, nextReviewAt, reviewTrigger }) {
    const entry = this.getEntry({ entryId, includeArchived: true });
    if (!entry) return { accepted: false, code: 'NOT_FOUND', reason: 'Strategic entry not found.' };

    this.recordHistory({
      entryId,
      type: 'REVIEW_SCHEDULED',
      actor: actor ?? this.createdBy,
      reason,
      changes: {
        nextReviewAt: hasText(nextReviewAt) ? String(nextReviewAt).trim() : null,
        reviewTrigger: hasText(reviewTrigger) ? String(reviewTrigger).trim() : null
      }
    });

    this.recordAudit('strategic_review_scheduled', {
      entryId,
      actor: actor ?? this.createdBy,
      reason,
      nextReviewAt: hasText(nextReviewAt) ? String(nextReviewAt).trim() : null,
      reviewTrigger: hasText(reviewTrigger) ? String(reviewTrigger).trim() : null
    });

    return {
      accepted: true,
      code: 'REVIEW_SCHEDULED',
      entry
    };
  }

  linkRelatedEntries({ entryId, relatedEntryIds = [], expectedVersion, actor = null, reason = null } = {}) {
    const current = this.getEntry({ entryId, includeArchived: true });
    if (!current) return { accepted: false, code: 'NOT_FOUND', reason: 'Strategic entry not found.' };

    const normalized = uniqueList([
      ...asArray(current.relatedEntryIds),
      ...sanitizeTags(relatedEntryIds)
    ]).filter((candidate) => candidate !== current.entryId);

    return this.updateEntry({
      entryId,
      expectedVersion,
      patch: { relatedEntryIds: normalized },
      actor,
      reason
    });
  }

  archiveEntry({ entryId, expectedVersion, actor = null, reason = null } = {}) {
    return this.changeStatus({
      entryId,
      toStatus: StrategicRegistryStatuses.ARCHIVED,
      expectedVersion,
      actor,
      reason,
      authorizeArchive: true
    });
  }

  listEntriesDueForReview({ at = nowIso(this.now), businessId = null } = {}) {
    const atMs = Date.parse(String(at));
    return this.listEntries({ businessId, includeArchived: false })
      .filter((entry) => hasText(entry.nextReviewAt))
      .filter((entry) => Date.parse(String(entry.nextReviewAt)) <= atMs)
      .sort((left, right) => String(left.nextReviewAt).localeCompare(String(right.nextReviewAt)));
  }

  listDeferredDependencyReady({ businessId = null, completedDependencyIds = [] } = {}) {
    const completed = new Set([
      ...sanitizeTags(completedDependencyIds),
      ...this.listEntries({ businessId, includeArchived: true })
        .filter((entry) => String(entry.status).toUpperCase() === StrategicRegistryStatuses.COMPLETED)
        .flatMap((entry) => [entry.entryId, String(asObject(entry.metadata).seedKey ?? ''), entry.title])
        .filter((value) => hasText(value))
    ]);

    return this.listEntries({ businessId, status: StrategicRegistryStatuses.DEFERRED, includeArchived: false })
      .filter((entry) => asArray(entry.dependencies).length > 0)
      .filter((entry) => asArray(entry.dependencies).every((dependency) => completed.has(String(dependency))));
  }

  listHighValueOpportunities({ businessId = null } = {}) {
    const highBands = new Set([StrategicValueBands.HIGH, StrategicValueBands.CRITICAL]);
    return this.listEntries({ businessId, entryType: StrategicRegistryEntryTypes.OPPORTUNITY, includeArchived: false })
      .filter((entry) => highBands.has(String(entry.strategicValue).toUpperCase()))
      .filter((entry) => highBands.has(String(entry.revenuePotential).toUpperCase()));
  }

  listRejectedIdeas({ businessId = null } = {}) {
    return this.listEntries({ businessId, status: StrategicRegistryStatuses.REJECTED, includeArchived: true });
  }

  listLessonsLearned({ businessId = null } = {}) {
    return this.listEntries({ businessId, entryType: StrategicRegistryEntryTypes.LESSON_LEARNED, includeArchived: false });
  }

  listActiveInitiatives({ businessId = null } = {}) {
    return this.listEntries({ businessId, status: StrategicRegistryStatuses.ACTIVE, includeArchived: false });
  }

  listEntriesWithoutReviewDate({ businessId = null } = {}) {
    return this.listEntries({ businessId, includeArchived: false })
      .filter((entry) => !hasText(entry.nextReviewAt));
  }

  groupEntriesByProductBusiness({ includeArchived = false } = {}) {
    return this.listEntries({ includeArchived }).reduce((accumulator, entry) => {
      const businessId = String(entry.businessScope?.businessId ?? 'UNSCOPED');
      const productArea = String(entry.businessScope?.productArea ?? 'UNSPECIFIED');
      const key = `${businessId}:${productArea}`;
      const list = accumulator[key] ?? [];
      accumulator[key] = [...list, entry];
      return accumulator;
    }, {});
  }

  listHistory({ entryId = null } = {}) {
    if (hasText(entryId)) {
      const ids = asArray(this.historyByEntry.get(String(entryId).trim()) ?? []);
      return ids.map((historyId) => this.history.get(historyId)).filter(Boolean);
    }
    return Array.from(this.history.values()).sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }

  seedInitialEntries() {
    const created = [];

    SeedEntriesV01.forEach((seed) => {
      const existingBySeed = hasText(this.seedIndex.get(seed.key))
        ? this.getEntry({ entryId: this.seedIndex.get(seed.key), includeArchived: true })
        : null;

      if (existingBySeed) return;

      const existingByTitle = this.findDuplicateEntry({
        title: seed.title,
        entryType: seed.entryType,
        businessId: seed.businessScope.businessId,
        productArea: seed.businessScope.productArea
      });

      if (existingByTitle) {
        this.seedIndex.set(seed.key, existingByTitle.entryId);
        setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.seed-index`, key: seed.key, value: existingByTitle.entryId });
        return;
      }

      const createdEntry = this.createEntry({
        ...seed,
        createdBy: this.createdBy,
        metadata: {
          seedKey: seed.key,
          seededBy: this.createdBy,
          seededAt: nowIso(this.now),
          dependencySeedKeys: asArray(seed.dependencies)
        }
      }, { actor: this.createdBy, reason: 'initial strategic registry seed', seedKey: seed.key });

      if (createdEntry.accepted && createdEntry.entry) {
        created.push(createdEntry.entry);
      }
    });

    this.resolveSeedDependencies();
    return created;
  }

  resolveSeedDependencies() {
    SeedEntriesV01.forEach((seed) => {
      const entryId = this.seedIndex.get(seed.key);
      if (!hasText(entryId)) return;

      const entry = this.getEntry({ entryId, includeArchived: true });
      if (!entry) return;

      const expectedVersion = Number(entry.version);
      const dependencyIds = uniqueList(asArray(seed.dependencies)
        .map((dependencyKey) => this.seedIndex.get(dependencyKey) ?? dependencyKey)
        .filter((candidate) => hasText(candidate)));

      const relatedIds = uniqueList([
        ...asArray(entry.relatedEntryIds),
        ...dependencyIds
      ]).filter((candidate) => candidate !== entry.entryId);

      const patch = {
        dependencies: dependencyIds,
        relatedEntryIds: relatedIds
      };

      const unchanged = stableHash(JSON.stringify(asArray(entry.dependencies))) === stableHash(JSON.stringify(dependencyIds))
        && stableHash(JSON.stringify(asArray(entry.relatedEntryIds))) === stableHash(JSON.stringify(relatedIds));
      if (unchanged) return;

      this.updateEntry({
        entryId,
        expectedVersion,
        patch,
        actor: this.createdBy,
        reason: 'seed dependency resolution'
      });
    });
  }

  findDuplicateEntry({ title, entryType, businessId, productArea } = {}) {
    const normalizedTitle = String(title ?? '').trim().toLowerCase();
    const normalizedType = String(entryType ?? '').trim().toUpperCase();
    const normalizedBusinessId = String(businessId ?? '').trim();
    const normalizedProductArea = String(productArea ?? '').trim();

    return this.listEntries({ includeArchived: true }).find((entry) => (
      String(entry.title).trim().toLowerCase() === normalizedTitle
      && String(entry.entryType).trim().toUpperCase() === normalizedType
      && String(entry.businessScope?.businessId ?? '') === normalizedBusinessId
      && String(entry.businessScope?.productArea ?? '') === normalizedProductArea
    )) ?? null;
  }

  persistNewEntry(entry) {
    const existing = this.entries.get(entry.entryId);
    if (existing) {
      return { accepted: false, code: 'CONFLICT', reason: 'Entry already exists.' };
    }

    this.entries.set(entry.entryId, entry);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.entries`, key: entry.entryId, value: entry });
    return { accepted: true, code: 'OK' };
  }

  compareAndSetEntry({ current, next, expectedVersion } = {}) {
    const namespace = `${this.namespace}.entries`;

    if (
      this.storageProvider
      && typeof this.storageProvider.conditionalSetStateRecord === 'function'
      && typeof this.storageProvider.getStateRecord === 'function'
    ) {
      const result = this.storageProvider.conditionalSetStateRecord({
        namespace,
        key: current.entryId,
        expectedVersion,
        value: next
      });

      if (!result?.ok) {
        if (result?.code === 'VERSION_MISMATCH') {
          const latest = this.storageProvider.getStateRecord({ namespace, key: current.entryId });
          if (latest?.ok) this.entries.set(current.entryId, latest.value);
          return { accepted: false, code: 'VERSION_MISMATCH', reason: 'Stale entry version.' };
        }

        return {
          accepted: false,
          code: 'PERSISTENCE_FAILURE',
          reason: result?.reason ?? 'CAS write failed.'
        };
      }

      this.entries.set(next.entryId, next);
      upsertRecord({ provider: this.storageProvider, namespace, key: next.entryId, value: next });
      return { accepted: true, code: 'OK' };
    }

    const latest = this.entries.get(current.entryId);
    if (!latest || Number(latest.version) !== Number(expectedVersion)) {
      return { accepted: false, code: 'VERSION_MISMATCH', reason: 'Stale in-memory version.' };
    }

    this.entries.set(next.entryId, next);
    upsertRecord({ provider: this.storageProvider, namespace, key: next.entryId, value: next });
    return { accepted: true, code: 'OK' };
  }

  computeChanges(previous = {}, next = {}) {
    const changes = {};
    Object.keys(next).forEach((key) => {
      const before = JSON.stringify(previous[key] ?? null);
      const after = JSON.stringify(next[key] ?? null);
      if (before !== after) {
        changes[key] = {
          from: previous[key] ?? null,
          to: next[key] ?? null
        };
      }
    });
    return changes;
  }

  recordHistory({
    entryId,
    type,
    actor,
    reason = null,
    fromStatus = null,
    toStatus = null,
    changes = {},
    metadata = {}
  } = {}) {
    const historyEntry = createStrategicHistoryEntry({
      entryId,
      type,
      actor,
      reason,
      fromStatus,
      toStatus,
      changes,
      metadata
    }, { now: this.now });

    this.history.set(historyEntry.historyId, historyEntry);
    upsertRecord({
      provider: this.storageProvider,
      namespace: `${this.namespace}.history`,
      key: historyEntry.historyId,
      value: historyEntry
    });

    const index = uniqueList([
      ...asArray(this.historyByEntry.get(historyEntry.entryId) ?? []),
      historyEntry.historyId
    ]);

    this.historyByEntry.set(historyEntry.entryId, index);
    setMetaValue({
      provider: this.storageProvider,
      namespace: `${this.namespace}.history-by-entry`,
      key: historyEntry.entryId,
      value: index
    });

    appendEvent({
      provider: this.storageProvider,
      namespace: `${this.namespace}.history-events`,
      key: historyEntry.historyId,
      value: historyEntry
    });

    return historyEntry;
  }

  recordAudit(event, details = {}) {
    const at = nowIso(this.now);
    const payload = {
      auditId: deterministicId('sreg_audit', `${event}:${at}:${stableHash(JSON.stringify(details))}`),
      event: String(event ?? '').trim(),
      at,
      details: serializeStrategicAuditDetails(details)
    };

    this.audit.set(payload.auditId, payload);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: payload.auditId, value: payload });
    appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.audit-events`, key: payload.auditId, value: payload });
    return payload;
  }

  statusToAuditEvent({ fromStatus, toStatus } = {}) {
    const target = String(toStatus ?? '').toUpperCase();
    if (target === StrategicRegistryStatuses.DEFERRED) return 'strategic_entry_deferred';
    if (target === StrategicRegistryStatuses.PLANNED) return 'strategic_entry_planned';
    if (target === StrategicRegistryStatuses.ACTIVE) return 'strategic_entry_activated';
    if (target === StrategicRegistryStatuses.COMPLETED) return 'strategic_entry_completed';
    if (target === StrategicRegistryStatuses.REJECTED) return 'strategic_entry_rejected';
    if (target === StrategicRegistryStatuses.ARCHIVED) return 'strategic_entry_archived';
    if (String(fromStatus ?? '').toUpperCase() === StrategicRegistryStatuses.REJECTED && target === StrategicRegistryStatuses.EVALUATING) {
      return 'strategic_entry_reconsidered';
    }
    return 'strategic_entry_updated';
  }
}

export function createStrategicIdeasRegistry(options = {}) {
  return new StrategicIdeasRegistry(options);
}
