import { randomUUID } from 'node:crypto';

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

export function createMissionProposal(payload = {}, { now } = {}) {
  const timestamp = isoNow(now);
  return {
    proposalId: payload.proposalId ?? `prop_${randomUUID()}`,
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
