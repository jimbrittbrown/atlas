import { createHash, randomUUID } from 'node:crypto';

export const ProposalSourceTypes = Object.freeze({
  CEO: 'CEO',
  CUSTOMER: 'CUSTOMER',
  INTERNAL_DIVISION: 'INTERNAL_DIVISION',
  OPPORTUNITY_ENGINE: 'OPPORTUNITY_ENGINE',
  SYSTEM: 'SYSTEM'
});

export const ProposalStatuses = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  APPROVED: 'APPROVED',
  DEFERRED: 'DEFERRED',
  REJECTED: 'REJECTED',
  CONVERTED_TO_MISSION: 'CONVERTED_TO_MISSION',
  CANCELLED: 'CANCELLED'
});

export const PortfolioPriorityBands = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  HOLD: 'HOLD'
});

export const PlanningRecommendedDecisions = Object.freeze({
  APPROVE: 'APPROVE',
  APPROVE_WITH_CONDITIONS: 'APPROVE_WITH_CONDITIONS',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  DEFER: 'DEFER',
  REJECT: 'REJECT'
});

export const ExecutiveDecisions = Object.freeze({
  APPROVE: 'APPROVE',
  APPROVE_WITH_CONDITIONS: 'APPROVE_WITH_CONDITIONS',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  DEFER: 'DEFER',
  REJECT: 'REJECT',
  CANCEL: 'CANCEL'
});

export const CommercialPackageTypes = Object.freeze({
  LAUNCH_PACKAGE: 'LAUNCH_PACKAGE',
  WEBSITE_CARE: 'WEBSITE_CARE'
});

export const CommercialAcceptanceStates = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED'
});

export const SupportedCommercialCurrencies = Object.freeze(['USD']);

export const CanonicalCommercialPackages = Object.freeze({
  [CommercialPackageTypes.LAUNCH_PACKAGE]: Object.freeze({
    packageType: CommercialPackageTypes.LAUNCH_PACKAGE,
    packageCode: 'ATLAS_LAUNCH_PACKAGE_V1',
    name: 'Atlas Launch Package',
    description: 'Website strategy, design/build, QA, and executive handoff package.',
    billingModel: 'ONE_TIME',
    defaultPriceMoney: Object.freeze({ amountMinor: 250000, currency: 'USD' }),
    deliverables: Object.freeze([
      'Discovery and positioning alignment',
      'Website build and production-ready artifact package',
      'Quality assurance review and revision loop'
    ])
  }),
  [CommercialPackageTypes.WEBSITE_CARE]: Object.freeze({
    packageType: CommercialPackageTypes.WEBSITE_CARE,
    packageCode: 'ATLAS_WEBSITE_CARE_V1',
    name: 'Atlas Website Care',
    description: 'Ongoing updates, monitoring, and monthly optimization/reporting support.',
    billingModel: 'MONTHLY_RECURRING',
    defaultPriceMoney: Object.freeze({ amountMinor: 39500, currency: 'USD' }),
    deliverables: Object.freeze([
      'Monthly maintenance and operational checks',
      'Priority content and asset updates',
      'Monthly performance and business health review'
    ])
  })
});

export const SupportedMissionTypes = Object.freeze([
  'WEBSITE_BUILD',
  'WEBSITE_AUDIT',
  'DOCUMENTARY',
  'LEARNING_ACADEMY',
  'RESEARCH',
  'MARKETING',
  'SALES',
  'SOFTWARE_BUILD',
  'SEO',
  'TRADING_RESEARCH',
  'INTERNAL_OPERATIONS',
  'OTHER'
]);

export const ProposalTransitionMap = Object.freeze({
  [ProposalStatuses.DRAFT]: [ProposalStatuses.SUBMITTED, ProposalStatuses.CANCELLED],
  [ProposalStatuses.SUBMITTED]: [
    ProposalStatuses.UNDER_REVIEW,
    ProposalStatuses.REVISION_REQUIRED,
    ProposalStatuses.DEFERRED,
    ProposalStatuses.REJECTED,
    ProposalStatuses.CANCELLED
  ],
  [ProposalStatuses.UNDER_REVIEW]: [
    ProposalStatuses.APPROVED,
    ProposalStatuses.REVISION_REQUIRED,
    ProposalStatuses.DEFERRED,
    ProposalStatuses.REJECTED,
    ProposalStatuses.CANCELLED
  ],
  [ProposalStatuses.REVISION_REQUIRED]: [
    ProposalStatuses.SUBMITTED,
    ProposalStatuses.UNDER_REVIEW,
    ProposalStatuses.CANCELLED
  ],
  [ProposalStatuses.APPROVED]: [
    ProposalStatuses.CONVERTED_TO_MISSION,
    ProposalStatuses.CANCELLED,
    ProposalStatuses.DEFERRED
  ],
  [ProposalStatuses.DEFERRED]: [
    ProposalStatuses.UNDER_REVIEW,
    ProposalStatuses.APPROVED,
    ProposalStatuses.REJECTED,
    ProposalStatuses.CANCELLED
  ],
  [ProposalStatuses.REJECTED]: [],
  [ProposalStatuses.CONVERTED_TO_MISSION]: [],
  [ProposalStatuses.CANCELLED]: []
});

export function createPortfolioStateMachine() {
  return {
    transitionMap: ProposalTransitionMap,
    terminalStates: new Set([
      ProposalStatuses.REJECTED,
      ProposalStatuses.CONVERTED_TO_MISSION,
      ProposalStatuses.CANCELLED
    ]),
    canTransition(fromStatus, toStatus) {
      return (ProposalTransitionMap[fromStatus] ?? []).includes(toStatus);
    },
    validateTransition({ fromStatus, toStatus }) {
      if (!fromStatus || !toStatus) {
        return { isValid: false, reason: 'Both fromStatus and toStatus are required.' };
      }

      if (this.canTransition(fromStatus, toStatus)) {
        return { isValid: true, reason: null };
      }

      return {
        isValid: false,
        reason: `Invalid proposal transition ${fromStatus} -> ${toStatus}.`
      };
    }
  };
}

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeIsoTimestamp(value, fallback) {
  const parsed = Date.parse(String(value ?? ''));
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }

  return fallback;
}

function getDefaultCommercialExpiration(timestamp) {
  return new Date(Date.parse(timestamp) + (14 * 24 * 60 * 60 * 1000)).toISOString();
}

function clonePackageDefinition(packageType) {
  const definition = CanonicalCommercialPackages[packageType];
  if (!definition) return null;
  return {
    ...definition,
    defaultPriceMoney: { ...definition.defaultPriceMoney },
    deliverables: [...definition.deliverables]
  };
}

function normalizeCommercialCurrency(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized || !SupportedCommercialCurrencies.includes(normalized)) {
    return null;
  }
  return normalized;
}

function parseAmountMinor(value, { fieldName, allowZero = true } = {}) {
  const numeric = Number(value);
  const label = fieldName ?? 'amountMinor';

  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be numeric.`);
  }

  if (!Number.isInteger(numeric)) {
    throw new Error(`${label} must be an integer minor-unit value (cents).`);
  }

  if (numeric < 0 || (!allowZero && numeric === 0)) {
    throw new Error(`${label} must be ${allowZero ? 'non-negative' : 'positive'}.`);
  }

  return numeric;
}

function normalizeMoneyShape(value, {
  fallbackCurrency = 'USD',
  fieldName = 'money',
  allowZero = true
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object containing amountMinor and currency.`);
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'amountMinor')) {
    throw new Error(`${fieldName}.amountMinor is required and must be minor units (cents).`);
  }

  const amountMinor = parseAmountMinor(value.amountMinor, {
    fieldName: `${fieldName}.amountMinor`,
    allowZero
  });

  const currency = normalizeCommercialCurrency(value.currency ?? fallbackCurrency);
  if (!currency) {
    throw new Error(`${fieldName}.currency is unsupported. Supported currencies: ${SupportedCommercialCurrencies.join(', ')}.`);
  }

  return {
    amountMinor,
    currency
  };
}

function rejectAmbiguousLegacyMoneyFields(record = {}, { fieldName = 'record' } = {}) {
  const legacyKeys = ['unitPrice', 'totalPrice', 'price', 'amount'];
  const found = legacyKeys.find((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (found) {
    throw new Error(`${fieldName}.${found} is ambiguous legacy money representation. Use amountMinor/currency money objects.`);
  }
}

export function moneyMinorToMajorUnits(amountMinor) {
  return Number((Number(amountMinor) / 100).toFixed(2));
}

export function createCommercialLineItemIntegrityHash(version = {}) {
  const digestPayload = JSON.stringify({
    proposalId: version.proposalId,
    versionNumber: version.versionNumber,
    termsVersion: version.termsVersion,
    lineItems: version.lineItems,
    totalMoney: version.pricing?.totalMoney ?? null
  });

  return createHash('sha256').update(digestPayload, 'utf8').digest('hex');
}

function normalizeCommercialLineItem(lineItem = {}) {
  const normalizedInput = (lineItem && typeof lineItem === 'object' && !Array.isArray(lineItem))
    ? { ...lineItem }
    : {};
  if (Object.prototype.hasOwnProperty.call(normalizedInput, 'totalPriceMoney')) {
    delete normalizedInput.totalPriceMoney;
  }

  rejectAmbiguousLegacyMoneyFields(normalizedInput, { fieldName: 'lineItem' });

  const normalizedType = String(normalizedInput.packageType ?? '').toUpperCase().trim();
  const canonical = clonePackageDefinition(normalizedType);

  if (!canonical) {
    throw new Error(`Unsupported commercial package type: ${normalizedType || 'UNKNOWN'}.`);
  }

  const quantity = Number.parseInt(String(normalizedInput.quantity ?? 1), 10);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('lineItem.quantity must be a positive integer.');
  }

  const unitPriceMoney = normalizedInput.unitPriceMoney
    ? normalizeMoneyShape(lineItem.unitPriceMoney, {
      fallbackCurrency: canonical.defaultPriceMoney.currency,
      fieldName: 'lineItem.unitPriceMoney',
      allowZero: false
    })
    : { ...canonical.defaultPriceMoney };

  if (unitPriceMoney.currency !== canonical.defaultPriceMoney.currency) {
    throw new Error('lineItem.unitPriceMoney.currency must match canonical package currency.');
  }

  const totalMinor = parseAmountMinor(unitPriceMoney.amountMinor * quantity, {
    fieldName: 'lineItem.totalPriceMoney.amountMinor',
    allowZero: false
  });

  return {
    packageType: canonical.packageType,
    packageCode: canonical.packageCode,
    name: canonical.name,
    billingModel: canonical.billingModel,
    packageVersion: canonical.packageCode,
    quantity,
    unitPriceMoney,
    totalPriceMoney: {
      amountMinor: totalMinor,
      currency: unitPriceMoney.currency
    }
  };
}

export function listCanonicalCommercialPackages() {
  return Object.values(CanonicalCommercialPackages).map((entry) => ({
    ...entry,
    defaultPriceMoney: { ...entry.defaultPriceMoney },
    deliverables: [...entry.deliverables]
  }));
}

export function createCommercialProposalVersion({
  proposalId,
  versionNumber,
  lineItems = [],
  notes = null,
  createdBy = 'SYSTEM',
  termsVersion = 'ATLAS_WEBSITE_TERMS_V1',
  totalMoneyOverride = null
} = {}, { now } = {}) {
  const createdAt = isoNow(now);
  rejectAmbiguousLegacyMoneyFields(totalMoneyOverride ?? {}, { fieldName: 'totalMoneyOverride' });

  const normalizedItems = (Array.isArray(lineItems) ? lineItems : [])
    .map((item) => normalizeCommercialLineItem(item))
    .filter(Boolean);

  if (normalizedItems.length === 0) {
    throw new Error('Commercial proposal version must include at least one valid line item.');
  }

  const currencies = new Set(normalizedItems.map((item) => item.unitPriceMoney.currency));
  if (currencies.size !== 1) {
    throw new Error('All commercial line items must share the same currency.');
  }

  const currency = Array.from(currencies)[0];

  const subtotalMinor = normalizedItems.reduce((sum, item) => {
    return sum + Number(item.totalPriceMoney.amountMinor ?? 0);
  }, 0);

  const subtotalMoney = {
    amountMinor: parseAmountMinor(subtotalMinor, {
      fieldName: 'pricing.subtotalMoney.amountMinor',
      allowZero: false
    }),
    currency
  };

  const overrideMoney = totalMoneyOverride
    ? normalizeMoneyShape(totalMoneyOverride, {
      fallbackCurrency: currency,
      fieldName: 'totalMoneyOverride',
      allowZero: false
    })
    : null;

  if (overrideMoney && overrideMoney.currency !== currency) {
    throw new Error('totalMoneyOverride.currency must match line item currency.');
  }

  const totalMoney = overrideMoney ?? subtotalMoney;

  const version = {
    artifactId: `prop_art_${randomUUID()}`,
    proposalId,
    versionNumber,
    createdAt,
    createdBy,
    notes,
    termsVersion,
    lineItems: normalizedItems,
    pricing: {
      subtotalMoney,
      totalMoney,
      overridden: overrideMoney != null
    }
  };

  return {
    ...version,
    lineItemIntegrityHash: createCommercialLineItemIntegrityHash(version)
  };
}

function normalizeCommercialDetails(payload = {}, { proposalId, timestamp } = {}) {
  const commercialPayload = normalizeObject(payload.commercial);
  const metadataCommercialContext = normalizeObject(payload?.metadata?.commercialContext);
  const includeWebsiteCare = Boolean(
    commercialPayload.includeWebsiteCare
    ?? metadataCommercialContext.includeWebsiteCare
    ?? false
  );

  const baseLineItems = [
    { packageType: CommercialPackageTypes.LAUNCH_PACKAGE, quantity: 1 }
  ];
  if (includeWebsiteCare) {
    baseLineItems.push({ packageType: CommercialPackageTypes.WEBSITE_CARE, quantity: 1 });
  }

  const version1 = createCommercialProposalVersion({
    proposalId,
    versionNumber: 1,
    lineItems: commercialPayload.lineItems ?? baseLineItems,
    notes: commercialPayload.notes ?? 'Initial commercial proposal artifact generated on submission.',
    createdBy: commercialPayload.createdBy ?? 'SYSTEM',
    termsVersion: commercialPayload?.terms?.version ?? 'ATLAS_WEBSITE_TERMS_V1'
  });

  return {
    expiresAt: safeIsoTimestamp(commercialPayload.expiresAt, getDefaultCommercialExpiration(timestamp)),
    activeVersionNumber: 1,
    versions: [version1],
    acceptance: {
      state: CommercialAcceptanceStates.PENDING,
      acceptedAt: null,
      acceptedBy: null,
      acceptanceRecordId: null,
      customerId: null,
      projectId: null,
      termsVersion: version1.termsVersion,
      termsAccepted: false
    },
    acceptanceRecords: [],
    priceLock: {
      locked: false,
      lockRecord: null
    },
    overrideHistory: []
  };
}

export function createMissionProposal(payload = {}, { now } = {}) {
  const timestamp = isoNow(now);
  const proposalId = payload.proposalId ?? `prop_${randomUUID()}`;
  return {
    proposalId,
    sourceType: normalizeString(payload.sourceType).toUpperCase() || ProposalSourceTypes.SYSTEM,
    sourceId: normalizeString(payload.sourceId) || null,
    customerId: normalizeString(payload.customerId) || null,
    title: normalizeString(payload.title),
    description: normalizeString(payload.description),
    missionType: normalizeString(payload.missionType).toUpperCase() || 'OTHER',
    requestedOutcome: normalizeString(payload.requestedOutcome),
    strategicObjective: normalizeString(payload.strategicObjective),
    expectedBusinessValue: Number(payload.expectedBusinessValue ?? 0),
    urgency: Number(payload.urgency ?? 0),
    estimatedEffort: Number(payload.estimatedEffort ?? 0),
    estimatedCost: Number(payload.estimatedCost ?? 0),
    estimatedDuration: Number(payload.estimatedDuration ?? 0),
    dependencies: normalizeArray(payload.dependencies),
    requiredCapabilities: normalizeArray(payload.requiredCapabilities),
    risks: normalizeArray(payload.risks),
    confidence: Number(payload.confidence ?? 0),
    governance: {
      requiresPublishing: Boolean(payload?.governance?.requiresPublishing),
      requiresProductionDeployment: Boolean(payload?.governance?.requiresProductionDeployment),
      createsNewBusinessDivision: Boolean(payload?.governance?.createsNewBusinessDivision)
    },
    metadata: normalizeObject(payload.metadata),
    commercial: normalizeCommercialDetails(payload, { proposalId, timestamp }),
    createdAt: payload.createdAt ?? timestamp,
    updatedAt: payload.updatedAt ?? timestamp,
    status: normalizeString(payload.status).toUpperCase() || ProposalStatuses.DRAFT,
    linkedMissionId: payload.linkedMissionId ?? null,
    decisionHistory: normalizeArray(payload.decisionHistory),
    evaluationHistory: normalizeArray(payload.evaluationHistory),
    prioritizationHistory: normalizeArray(payload.prioritizationHistory),
    auditTrail: normalizeArray(payload.auditTrail),
    failureLog: normalizeArray(payload.failureLog)
  };
}

export function validateMissionProposal(proposal = {}) {
  const issues = [];

  if (!proposal.proposalId || normalizeString(proposal.proposalId).length === 0) {
    issues.push('proposalId is required.');
  }

  if (!Object.values(ProposalSourceTypes).includes(String(proposal.sourceType ?? '').toUpperCase())) {
    issues.push(`sourceType must be one of: ${Object.values(ProposalSourceTypes).join(', ')}.`);
  }

  if (normalizeString(proposal.title).length === 0) {
    issues.push('title is required.');
  }

  if (normalizeString(proposal.description).length === 0) {
    issues.push('description is required.');
  }

  if (!SupportedMissionTypes.includes(String(proposal.missionType ?? '').toUpperCase())) {
    issues.push(`missionType must be one of: ${SupportedMissionTypes.join(', ')}.`);
  }

  if (normalizeString(proposal.requestedOutcome).length === 0) {
    issues.push('requestedOutcome is required.');
  }

  if (normalizeString(proposal.strategicObjective).length === 0) {
    issues.push('strategicObjective is required.');
  }

  if (!Number.isFinite(Number(proposal.expectedBusinessValue))) {
    issues.push('expectedBusinessValue must be numeric.');
  }

  if (!Number.isFinite(Number(proposal.urgency))) {
    issues.push('urgency must be numeric.');
  }

  if (!Number.isFinite(Number(proposal.estimatedEffort))) {
    issues.push('estimatedEffort must be numeric.');
  }

  if (!Number.isFinite(Number(proposal.estimatedCost))) {
    issues.push('estimatedCost must be numeric.');
  }

  if (!Number.isFinite(Number(proposal.estimatedDuration))) {
    issues.push('estimatedDuration must be numeric.');
  }

  if (!Number.isFinite(Number(proposal.confidence))) {
    issues.push('confidence must be numeric.');
  }

  if (!Object.values(ProposalStatuses).includes(String(proposal.status ?? '').toUpperCase())) {
    issues.push(`status must be one of: ${Object.values(ProposalStatuses).join(', ')}.`);
  }

  const commercial = normalizeObject(proposal.commercial);
  const versions = normalizeArray(commercial.versions);
  if (versions.length === 0) {
    issues.push('commercial.versions must contain at least one proposal artifact version.');
  }

  const activeVersionNumber = Number(commercial.activeVersionNumber ?? 0);
  if (!Number.isInteger(activeVersionNumber) || activeVersionNumber <= 0) {
    issues.push('commercial.activeVersionNumber must be a positive integer.');
  }

  const acceptanceState = String(commercial?.acceptance?.state ?? '').toUpperCase();
  if (!Object.values(CommercialAcceptanceStates).includes(acceptanceState)) {
    issues.push(`commercial.acceptance.state must be one of: ${Object.values(CommercialAcceptanceStates).join(', ')}.`);
  }

  versions.forEach((version, index) => {
    const versionPrefix = `commercial.versions[${index}]`;
    try {
      const subtotalMoney = normalizeMoneyShape(version?.pricing?.subtotalMoney, {
        fieldName: `${versionPrefix}.pricing.subtotalMoney`,
        allowZero: false
      });
      const totalMoney = normalizeMoneyShape(version?.pricing?.totalMoney, {
        fieldName: `${versionPrefix}.pricing.totalMoney`,
        allowZero: false
      });

      if (subtotalMoney.currency !== totalMoney.currency) {
        issues.push(`${versionPrefix}.pricing currencies must match.`);
      }

      if (Object.prototype.hasOwnProperty.call(version?.pricing ?? {}, 'totalPrice')) {
        issues.push(`${versionPrefix}.pricing.totalPrice is ambiguous legacy representation.`);
      }

      (normalizeArray(version?.lineItems)).forEach((item, lineItemIndex) => {
        const itemPrefix = `${versionPrefix}.lineItems[${lineItemIndex}]`;
        rejectAmbiguousLegacyMoneyFields(item, { fieldName: itemPrefix });
        const unitMoney = normalizeMoneyShape(item?.unitPriceMoney, {
          fieldName: `${itemPrefix}.unitPriceMoney`,
          allowZero: false
        });
        const totalItemMoney = normalizeMoneyShape(item?.totalPriceMoney, {
          fieldName: `${itemPrefix}.totalPriceMoney`,
          allowZero: false
        });
        if (unitMoney.currency !== totalItemMoney.currency || unitMoney.currency !== totalMoney.currency) {
          issues.push(`${itemPrefix} currencies must match proposal total currency.`);
        }
      });
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  });

  if (!proposal.commercial?.expiresAt || !Number.isFinite(Date.parse(String(proposal.commercial.expiresAt)))) {
    issues.push('commercial.expiresAt must be a valid timestamp.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function createStrategicEvaluation({
  proposalId,
  scoreBreakdown,
  overallScore,
  priorityBand,
  confidenceBand,
  blockingIssues = [],
  warnings = [],
  assumptions = [],
  recommendedDecision,
  recommendedExecutionOrder,
  recommendedMissionType,
  recommendedCapabilities = [],
  recommendedResources = []
} = {}, { now } = {}) {
  return {
    evaluationId: `eval_${randomUUID()}`,
    proposalId,
    scoreBreakdown,
    overallScore,
    priorityBand,
    confidenceBand,
    blockingIssues,
    warnings,
    assumptions,
    recommendedDecision,
    recommendedExecutionOrder,
    recommendedMissionType,
    recommendedCapabilities,
    recommendedResources,
    evaluatedAt: isoNow(now)
  };
}

export function createPriorityRecommendation({
  proposalId,
  priorityBand,
  rank,
  rationale,
  score
} = {}, { now } = {}) {
  return {
    recommendationId: `pr_${randomUUID()}`,
    proposalId,
    priorityBand,
    rank,
    rationale,
    score,
    createdAt: isoNow(now)
  };
}

export function createResourceRecommendation({
  proposalId,
  requiredCapabilities = [],
  availableCapabilities = [],
  capacityConflicts = [],
  staffingPlan = []
} = {}, { now } = {}) {
  return {
    recommendationId: `rr_${randomUUID()}`,
    proposalId,
    requiredCapabilities,
    availableCapabilities,
    capacityConflicts,
    staffingPlan,
    createdAt: isoNow(now)
  };
}

export function createExecutiveDecision({
  proposalId,
  decision,
  decidedBy,
  rationale,
  conditions = [],
  timestamp
} = {}, { now } = {}) {
  return {
    decisionId: `dec_${randomUUID()}`,
    proposalId,
    decision: String(decision ?? '').toUpperCase(),
    decidedBy,
    rationale,
    conditions: Array.isArray(conditions) ? conditions : [],
    timestamp: timestamp ?? isoNow(now)
  };
}

export function validateExecutiveDecision(decision = {}) {
  const issues = [];

  if (!decision.proposalId) issues.push('proposalId is required.');
  if (!decision.decidedBy || normalizeString(decision.decidedBy).length === 0) issues.push('decidedBy is required.');
  if (!decision.rationale || normalizeString(decision.rationale).length === 0) issues.push('rationale is required.');

  if (!Object.values(ExecutiveDecisions).includes(String(decision.decision ?? '').toUpperCase())) {
    issues.push(`decision must be one of: ${Object.values(ExecutiveDecisions).join(', ')}.`);
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function createPortfolioRecord({ proposal, latestEvaluation = null, latestDecision = null } = {}) {
  return {
    proposal,
    latestEvaluation,
    latestDecision,
    linkedMissionId: proposal?.linkedMissionId ?? null
  };
}
