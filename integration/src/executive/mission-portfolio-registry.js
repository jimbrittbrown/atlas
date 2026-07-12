import {
  CommercialAcceptanceStates,
  createCommercialLineItemIntegrityHash,
  createCommercialProposalVersion,
  moneyMinorToMajorUnits,
  createMissionProposal,
  createPortfolioRecord,
  ProposalStatuses,
  createPortfolioStateMachine
} from './executive-planning-contracts.js';
import { loadRecordMap, upsertRecord } from '../storage/provider-backed-state.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

const SupportedCurrencies = new Set(['USD']);

function parseAmountMinor(value, { fieldName = 'amountMinor', allowZero = true } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldName} must be numeric.`);
  }

  if (!Number.isInteger(numeric)) {
    throw new Error(`${fieldName} must be an integer minor-unit value (cents).`);
  }

  if (numeric < 0 || (!allowZero && numeric === 0)) {
    throw new Error(`${fieldName} must be ${allowZero ? 'non-negative' : 'positive'}.`);
  }

  return numeric;
}

function normalizeCurrency(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return SupportedCurrencies.has(normalized) ? normalized : null;
}

function ensureMoney(money, { fieldName, allowZero = true } = {}) {
  if (!money || typeof money !== 'object' || Array.isArray(money)) {
    throw new Error(`${fieldName} must be an object with amountMinor and currency.`);
  }

  const amountMinor = parseAmountMinor(money.amountMinor, {
    fieldName: `${fieldName}.amountMinor`,
    allowZero
  });
  const currency = normalizeCurrency(money.currency);
  if (!currency) {
    throw new Error(`${fieldName}.currency is unsupported.`);
  }

  return { amountMinor, currency };
}

function hasLegacyAmbiguousPriceFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return ['totalPrice', 'price', 'amount', 'unitPrice'].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export class MissionPortfolioRegistry {
  constructor({ storageAdapter, storageProvider, now, namespace = 'executive.mission-portfolio-registry' } = {}) {
    this.now = now;
    this.storageAdapter = storageAdapter ?? storageProvider ?? null;
    this.namespace = namespace;
    this.records = loadRecordMap({ provider: this.storageAdapter, namespace: this.namespace });
    this.stateMachine = createPortfolioStateMachine();
  }

  persistRecord(record) {
    if (!record?.proposal?.proposalId) return;
    upsertRecord({
      provider: this.storageAdapter,
      namespace: this.namespace,
      key: record.proposal.proposalId,
      value: record
    });
  }

  createProposal(payload = {}) {
    const proposal = createMissionProposal(payload, { now: this.now });
    const record = createPortfolioRecord({ proposal });
    this.records.set(proposal.proposalId, record);
    this.persistRecord(record);
    return record;
  }

  updateProposal(proposalId, patch = {}) {
    const record = this.getProposal(proposalId);
    if (!record) {
      return null;
    }

    const updatedProposal = {
      ...record.proposal,
      ...patch,
      proposalId: record.proposal.proposalId,
      updatedAt: isoNow(this.now)
    };

    record.proposal = updatedProposal;
    this.persistRecord(record);
    return record;
  }

  transitionProposalStatus({ proposalId, toStatus, reason = null } = {}) {
    const record = this.getProposal(proposalId);
    if (!record) {
      return { success: false, reason: 'Proposal not found.' };
    }

    const fromStatus = record.proposal.status;
    const validation = this.stateMachine.validateTransition({ fromStatus, toStatus });

    if (!validation.isValid) {
      return { success: false, reason: validation.reason };
    }

    record.proposal.status = toStatus;
    record.proposal.updatedAt = isoNow(this.now);
    record.proposal.auditTrail.push({
      type: 'STATUS_TRANSITION',
      fromStatus,
      toStatus,
      reason,
      timestamp: isoNow(this.now)
    });

    this.persistRecord(record);

    return { success: true, proposal: record.proposal };
  }

  getProposal(proposalId) {
    return this.records.get(proposalId) ?? null;
  }

  listProposals() {
    return Array.from(this.records.values())
      .map((record) => record.proposal)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  filterByStatus(status) {
    return this.listProposals().filter((proposal) => proposal.status === status);
  }

  filterByMissionType(missionType) {
    const normalized = String(missionType ?? '').toUpperCase().trim();
    return this.listProposals().filter((proposal) => String(proposal.missionType).toUpperCase() === normalized);
  }

  filterByCustomer(customerId) {
    return this.listProposals().filter((proposal) => proposal.customerId === customerId);
  }

  filterBySource(sourceType) {
    const normalized = String(sourceType ?? '').toUpperCase().trim();
    return this.listProposals().filter((proposal) => String(proposal.sourceType).toUpperCase() === normalized);
  }

  detectDuplicateProposal(payload = {}) {
    const title = normalize(payload.title);
    const missionType = normalize(payload.missionType);
    const customerId = normalize(payload.customerId);
    const requestedOutcome = normalize(payload.requestedOutcome);

    return this.listProposals().find((proposal) => (
      normalize(proposal.title) === title
      && normalize(proposal.missionType) === missionType
      && normalize(proposal.customerId) === customerId
      && normalize(proposal.requestedOutcome) === requestedOutcome
      && proposal.status !== ProposalStatuses.CANCELLED
      && proposal.status !== ProposalStatuses.REJECTED
    )) ?? null;
  }

  addDecisionHistory(proposalId, decision) {
    const record = this.getProposal(proposalId);
    if (!record) return null;

    record.proposal.decisionHistory.push(decision);
    record.latestDecision = decision;
    record.proposal.updatedAt = isoNow(this.now);
    record.proposal.auditTrail.push({
      type: 'DECISION_ADDED',
      decisionId: decision.decisionId,
      decision: decision.decision,
      timestamp: isoNow(this.now)
    });

    this.persistRecord(record);

    return record;
  }

  addEvaluationHistory(proposalId, evaluation) {
    const record = this.getProposal(proposalId);
    if (!record) return null;

    record.proposal.evaluationHistory.push(evaluation);
    record.latestEvaluation = evaluation;
    record.proposal.updatedAt = isoNow(this.now);
    record.proposal.auditTrail.push({
      type: 'EVALUATION_ADDED',
      evaluationId: evaluation.evaluationId,
      overallScore: evaluation.overallScore,
      timestamp: isoNow(this.now)
    });

    this.persistRecord(record);

    return record;
  }

  addPrioritizationHistory(proposalId, prioritization) {
    const record = this.getProposal(proposalId);
    if (!record) return null;

    record.proposal.prioritizationHistory.push(prioritization);
    record.proposal.updatedAt = isoNow(this.now);
    record.proposal.auditTrail.push({
      type: 'PRIORITIZATION_ADDED',
      recommendationId: prioritization.recommendationId,
      rank: prioritization.rank,
      priorityBand: prioritization.priorityBand,
      timestamp: isoNow(this.now)
    });

    this.persistRecord(record);

    return record;
  }

  linkProposalToMission({ proposalId, missionId, telemetry = {} } = {}) {
    const record = this.getProposal(proposalId);
    if (!record) return null;

    record.proposal.linkedMissionId = missionId;
    record.linkedMissionId = missionId;
    record.proposal.status = ProposalStatuses.CONVERTED_TO_MISSION;
    record.proposal.updatedAt = isoNow(this.now);
    record.proposal.auditTrail.push({
      type: 'LINKED_TO_MISSION',
      missionId,
      telemetry,
      timestamp: isoNow(this.now)
    });

    this.persistRecord(record);

    return record;
  }

  addFailure(proposalId, failure) {
    const record = this.getProposal(proposalId);
    if (!record) return null;

    record.proposal.failureLog.push({
      ...failure,
      timestamp: failure?.timestamp ?? isoNow(this.now)
    });
    record.proposal.updatedAt = isoNow(this.now);
    this.persistRecord(record);
    return record;
  }

  addCommercialVersion({
    proposalId,
    lineItems = [],
    notes = null,
    createdBy = 'SYSTEM',
    termsVersion = 'ATLAS_WEBSITE_TERMS_V1',
    totalMoneyOverride = null
  } = {}) {
    const record = this.getProposal(proposalId);
    if (!record) {
      return { accepted: false, reason: 'Proposal not found.', proposal: null };
    }

    const commercial = record.proposal.commercial ?? {};
    const activeVersionNumber = Number(commercial.activeVersionNumber ?? 0);
    const nextVersionNumber = Number.isInteger(activeVersionNumber) && activeVersionNumber > 0
      ? activeVersionNumber + 1
      : 1;

    const version = createCommercialProposalVersion({
      proposalId,
      versionNumber: nextVersionNumber,
      lineItems,
      notes,
      createdBy,
      termsVersion,
      totalMoneyOverride
    }, { now: this.now });

    const updatedCommercial = {
      ...commercial,
      activeVersionNumber: version.versionNumber,
      versions: [...(Array.isArray(commercial.versions) ? commercial.versions : []), version],
      acceptance: {
        ...(commercial.acceptance ?? {}),
        state: CommercialAcceptanceStates.PENDING,
        acceptedAt: null,
        acceptedBy: null,
        acceptanceRecordId: null,
        termsVersion: version.termsVersion,
        termsAccepted: false
      },
      priceLock: {
        ...(commercial.priceLock ?? {}),
        locked: false,
        lockRecord: null
      }
    };

    record.proposal.commercial = updatedCommercial;
    record.proposal.updatedAt = isoNow(this.now);
    record.proposal.auditTrail.push({
      type: 'COMMERCIAL_VERSION_ADDED',
      versionNumber: version.versionNumber,
      createdBy,
      timestamp: isoNow(this.now)
    });

    this.persistRecord(record);

    return {
      accepted: true,
      reason: null,
      proposal: record.proposal,
      version
    };
  }

  overrideCommercialPrice({
    proposalId,
    actor,
    reason,
    totalMoney,
    currency = 'USD'
  } = {}) {
    const record = this.getProposal(proposalId);
    if (!record) {
      return { accepted: false, reason: 'Proposal not found.', proposal: null };
    }

    const normalizedActor = String(actor ?? '').trim();
    const normalizedReason = String(reason ?? '').trim();
    if (!normalizedActor) {
      return { accepted: false, reason: 'actor is required for controlled price override.', proposal: null };
    }

    if (!normalizedReason) {
      return { accepted: false, reason: 'reason is required for controlled price override.', proposal: null };
    }

    const commercial = record.proposal.commercial ?? {};
    const versions = Array.isArray(commercial.versions) ? commercial.versions : [];
    const activeVersionNumber = Number(commercial.activeVersionNumber ?? 0);
    const activeVersion = versions.find((item) => Number(item.versionNumber) === activeVersionNumber) ?? null;

    if (!activeVersion) {
      return { accepted: false, reason: 'Active commercial version not found.', proposal: null };
    }

    if (!totalMoney || typeof totalMoney !== 'object' || Array.isArray(totalMoney)) {
      return {
        accepted: false,
        reason: 'totalMoney with amountMinor/currency is required for controlled price override.',
        proposal: null
      };
    }

    if (hasLegacyAmbiguousPriceFields(totalMoney)) {
      return {
        accepted: false,
        reason: 'Ambiguous legacy price fields are not allowed. Use totalMoney.amountMinor and totalMoney.currency.',
        proposal: null
      };
    }

    let normalizedTotalMoney;
    try {
      normalizedTotalMoney = ensureMoney(totalMoney, { fieldName: 'totalMoney', allowZero: false });
    } catch (error) {
      return {
        accepted: false,
        reason: error instanceof Error ? error.message : String(error),
        proposal: null
      };
    }

    const activeTotalMoney = ensureMoney(activeVersion.pricing.totalMoney, {
      fieldName: 'activeVersion.pricing.totalMoney',
      allowZero: false
    });
    if (normalizedTotalMoney.currency !== activeTotalMoney.currency) {
      return {
        accepted: false,
        reason: 'totalMoney.currency must match active version currency.',
        proposal: null
      };
    }

    const versionResult = this.addCommercialVersion({
      proposalId,
      lineItems: activeVersion.lineItems,
      notes: `Price override applied from v${activeVersion.versionNumber}. ${normalizedReason}`,
      createdBy: normalizedActor,
      termsVersion: activeVersion.termsVersion,
      totalMoneyOverride: normalizedTotalMoney
    });

    if (!versionResult.accepted) {
      return versionResult;
    }

    const refreshed = this.getProposal(proposalId);
    const overrideEntry = {
      overrideId: `price_override_${Date.now()}`,
      actor: normalizedActor,
      reason: normalizedReason,
      previousVersionNumber: activeVersion.versionNumber,
      newVersionNumber: versionResult.version.versionNumber,
      previousMoney: {
        ...activeTotalMoney,
        majorUnits: moneyMinorToMajorUnits(activeTotalMoney.amountMinor)
      },
      newMoney: {
        ...versionResult.version.pricing.totalMoney,
        majorUnits: moneyMinorToMajorUnits(versionResult.version.pricing.totalMoney.amountMinor)
      },
      timestamp: isoNow(this.now)
    };

    refreshed.proposal.commercial.overrideHistory = [
      ...(Array.isArray(refreshed.proposal.commercial.overrideHistory)
        ? refreshed.proposal.commercial.overrideHistory
        : []),
      overrideEntry
    ];

    refreshed.proposal.auditTrail.push({
      type: 'COMMERCIAL_PRICE_OVERRIDE',
      overrideId: overrideEntry.overrideId,
      actor: normalizedActor,
      reason: normalizedReason,
      timestamp: isoNow(this.now)
    });

    this.persistRecord(refreshed);

    return {
      accepted: true,
      reason: null,
      proposal: refreshed.proposal,
      override: overrideEntry
    };
  }

  acceptCommercialTerms({
    proposalId,
    customerId,
    projectId,
    acceptedBy,
    termsVersion,
    acceptedAt = isoNow(this.now)
  } = {}) {
    const record = this.getProposal(proposalId);
    if (!record) {
      return { accepted: false, reason: 'Proposal not found.', proposal: null };
    }

    const commercial = record.proposal.commercial ?? {};
    const versions = Array.isArray(commercial.versions) ? commercial.versions : [];
    const activeVersionNumber = Number(commercial.activeVersionNumber ?? 0);
    const activeVersion = versions.find((item) => Number(item.versionNumber) === activeVersionNumber) ?? null;

    if (!activeVersion) {
      return { accepted: false, reason: 'Active commercial version not found.', proposal: null };
    }

    if (!Number.isFinite(Date.parse(String(commercial.expiresAt ?? '')))) {
      return { accepted: false, reason: 'Proposal expiration is invalid.', proposal: null };
    }

    if (Date.parse(String(commercial.expiresAt)) <= Date.now()) {
      record.proposal.commercial.acceptance = {
        ...(record.proposal.commercial.acceptance ?? {}),
        state: CommercialAcceptanceStates.EXPIRED
      };
      record.proposal.auditTrail.push({
        type: 'COMMERCIAL_ACCEPTANCE_REJECTED_EXPIRED',
        timestamp: isoNow(this.now)
      });
      this.persistRecord(record);

      return { accepted: false, reason: 'Proposal has expired.', proposal: record.proposal };
    }

    const normalizedTermsVersion = String(termsVersion ?? activeVersion.termsVersion ?? '').trim();
    if (!normalizedTermsVersion) {
      return { accepted: false, reason: 'termsVersion is required.', proposal: null };
    }

    if (normalizedTermsVersion !== String(activeVersion.termsVersion ?? '').trim()) {
      return { accepted: false, reason: 'Commercial terms version mismatch for active proposal version.', proposal: null };
    }

    const normalizedAcceptedBy = String(acceptedBy ?? '').trim();
    if (!normalizedAcceptedBy) {
      return { accepted: false, reason: 'acceptedBy is required.', proposal: null };
    }

    const acceptanceRecord = {
      acceptanceRecordId: `accept_${Date.now()}`,
      proposalId,
      versionNumber: activeVersion.versionNumber,
      customerId: String(customerId ?? '').trim() || (record.proposal.customerId ?? null),
      projectId: String(projectId ?? '').trim() || (record.proposal.linkedMissionId ?? null),
      acceptedBy: normalizedAcceptedBy,
      acceptedAt: new Date(Date.parse(String(acceptedAt))).toISOString(),
      termsVersion: normalizedTermsVersion,
      lockedQuote: {
        amountMinor: Number(activeVersion.pricing.totalMoney.amountMinor ?? 0),
        currency: String(activeVersion.pricing.totalMoney.currency ?? 'USD').toUpperCase(),
        sourceVersionNumber: activeVersion.versionNumber,
        packageVersionIdentity: (activeVersion.lineItems ?? []).map((item) => ({
          packageType: item.packageType,
          packageCode: item.packageCode,
          packageVersion: item.packageVersion,
          quantity: item.quantity
        })),
        lineItemIntegrityHash: String(activeVersion.lineItemIntegrityHash ?? createCommercialLineItemIntegrityHash(activeVersion))
      }
    };

    const lockedQuoteMoney = ensureMoney({
      amountMinor: acceptanceRecord.lockedQuote.amountMinor,
      currency: acceptanceRecord.lockedQuote.currency
    }, {
      fieldName: 'acceptanceRecord.lockedQuote',
      allowZero: false
    });

    const lockRecord = {
      amountMinor: lockedQuoteMoney.amountMinor,
      currency: lockedQuoteMoney.currency,
      proposalVersion: acceptanceRecord.lockedQuote.sourceVersionNumber,
      packageVersionIdentity: acceptanceRecord.lockedQuote.packageVersionIdentity,
      lineItemIntegrityHash: acceptanceRecord.lockedQuote.lineItemIntegrityHash,
      actor: acceptanceRecord.acceptedBy,
      timestamp: acceptanceRecord.acceptedAt,
      reason: 'CUSTOMER_ACCEPTANCE',
      amountMajor: moneyMinorToMajorUnits(lockedQuoteMoney.amountMinor)
    };

    record.proposal.commercial.acceptance = {
      state: CommercialAcceptanceStates.ACCEPTED,
      acceptedAt: acceptanceRecord.acceptedAt,
      acceptedBy: acceptanceRecord.acceptedBy,
      acceptanceRecordId: acceptanceRecord.acceptanceRecordId,
      customerId: acceptanceRecord.customerId,
      projectId: acceptanceRecord.projectId,
      termsVersion: acceptanceRecord.termsVersion,
      termsAccepted: true
    };

    record.proposal.commercial.acceptanceRecords = [
      ...(Array.isArray(record.proposal.commercial.acceptanceRecords)
        ? record.proposal.commercial.acceptanceRecords
        : []),
      acceptanceRecord
    ];

    record.proposal.commercial.priceLock = {
      locked: true,
      lockRecord
    };

    record.proposal.auditTrail.push({
      type: 'COMMERCIAL_ACCEPTED',
      acceptanceRecordId: acceptanceRecord.acceptanceRecordId,
      customerId: acceptanceRecord.customerId,
      projectId: acceptanceRecord.projectId,
      timestamp: isoNow(this.now)
    });

    record.proposal.updatedAt = isoNow(this.now);
    this.persistRecord(record);

    return {
      accepted: true,
      reason: null,
      proposal: record.proposal,
      acceptanceRecord
    };
  }

  expireProposalIfNeeded(proposalId, { nowMs = Date.now() } = {}) {
    const record = this.getProposal(proposalId);
    if (!record) {
      return { expired: false, reason: 'Proposal not found.', proposal: null };
    }

    const commercial = record.proposal.commercial ?? {};
    const acceptanceState = String(commercial?.acceptance?.state ?? '').toUpperCase();
    if (acceptanceState === CommercialAcceptanceStates.ACCEPTED) {
      return { expired: false, reason: null, proposal: record.proposal };
    }

    const expiryMs = Date.parse(String(commercial.expiresAt ?? ''));
    if (!Number.isFinite(expiryMs)) {
      return { expired: false, reason: 'Proposal expiration is invalid.', proposal: record.proposal };
    }

    if (expiryMs > nowMs) {
      return { expired: false, reason: null, proposal: record.proposal };
    }

    record.proposal.commercial.acceptance = {
      ...(record.proposal.commercial.acceptance ?? {}),
      state: CommercialAcceptanceStates.EXPIRED,
      termsAccepted: false
    };
    record.proposal.updatedAt = isoNow(this.now);
    record.proposal.auditTrail.push({
      type: 'COMMERCIAL_EXPIRED',
      timestamp: isoNow(this.now)
    });
    this.persistRecord(record);

    return { expired: true, reason: null, proposal: record.proposal };
  }

  getPortfolioSummaryMetrics() {
    const proposals = this.listProposals();

    const summary = {
      totalProposals: proposals.length,
      byStatus: {},
      byMissionType: {},
      convertedToMission: proposals.filter((item) => item.status === ProposalStatuses.CONVERTED_TO_MISSION).length,
      averageConfidence: 0
    };

    let confidenceSum = 0;

    proposals.forEach((proposal) => {
      summary.byStatus[proposal.status] = (summary.byStatus[proposal.status] ?? 0) + 1;
      summary.byMissionType[proposal.missionType] = (summary.byMissionType[proposal.missionType] ?? 0) + 1;
      confidenceSum += Number(proposal.confidence ?? 0);
    });

    summary.averageConfidence = proposals.length === 0
      ? 0
      : Number((confidenceSum / proposals.length).toFixed(4));

    return summary;
  }
}
