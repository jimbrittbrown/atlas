import {
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
