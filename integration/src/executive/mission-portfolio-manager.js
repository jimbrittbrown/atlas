import {
  createExecutiveDecision,
  ExecutiveDecisions,
  PlanningRecommendedDecisions,
  ProposalStatuses,
  validateExecutiveDecision,
  validateMissionProposal
} from './executive-planning-contracts.js';
import { MissionPortfolioRegistry } from './mission-portfolio-registry.js';
import { ExecutivePlanningEngine } from './executive-planning-engine.js';
import { MissionConversionBridge } from './mission-conversion-bridge.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

const DefaultGovernanceConfig = Object.freeze({
  highCostThreshold: 250000,
  highRiskThreshold: 0.7,
  resourceLimit: 0.85
});

export class MissionPortfolioManager {
  constructor({
    portfolioRegistry,
    planningEngine,
    conversionBridge,
    workforceDirector,
    missionControl,
    storageProvider,
    governanceConfig = {},
    now,
    logger
  } = {}) {
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.missionControl = missionControl;
    this.workforceDirector = workforceDirector ?? missionControl?.workforceDirector ?? null;

    this.portfolioRegistry = portfolioRegistry ?? new MissionPortfolioRegistry({ now, storageProvider });
    this.planningEngine = planningEngine ?? new ExecutivePlanningEngine({ now });
    this.conversionBridge = conversionBridge ?? new MissionConversionBridge({
      missionControl,
      missionRegistry: missionControl?.missionRegistry,
      now
    });

    this.governanceConfig = {
      ...DefaultGovernanceConfig,
      ...governanceConfig
    };
  }

  getWorkforceSnapshot() {
    if (!this.workforceDirector) {
      return {
        workers: [],
        dashboard: {
          activeWorkers: 0,
          idleWorkers: 0,
          workerUtilization: 0,
          currentWorkload: []
        },
        availableCapabilities: []
      };
    }

    const workers = this.workforceDirector.listWorkers();
    const dashboard = this.workforceDirector.buildDashboard();
    const availableCapabilities = Array.from(new Set(
      workers
        .filter((worker) => worker.status === 'IDLE')
        .flatMap((worker) => worker.capabilities ?? [])
        .map((capability) => String(capability).toUpperCase())
    ));

    const estimatedStartAvailability = workers.reduce((acc, worker) => {
      (worker.capabilities ?? []).forEach((capability) => {
        const key = String(capability).toUpperCase();
        if (!acc[key]) {
          acc[key] = {
            capability: key,
            availableNow: 0,
            nextAvailableEstimate: null
          };
        }

        if (worker.status === 'IDLE') {
          acc[key].availableNow += 1;
          if (!acc[key].nextAvailableEstimate) {
            acc[key].nextAvailableEstimate = isoNow(this.now);
          }
        }

        if (worker.status === 'BUSY' && !acc[key].nextAvailableEstimate) {
          acc[key].nextAvailableEstimate = 'AFTER_CURRENT_ASSIGNMENTS';
        }
      });
      return acc;
    }, {});

    return {
      workers,
      dashboard,
      availableCapabilities,
      estimatedStartAvailability: Object.values(estimatedStartAvailability)
    };
  }

  detectResourceConflicts(proposals = []) {
    const conflicts = [];
    const capabilityToProposalIds = new Map();

    proposals.forEach((proposal) => {
      (proposal.requiredCapabilities ?? []).forEach((capability) => {
        const key = String(capability).toUpperCase();
        const ids = capabilityToProposalIds.get(key) ?? [];
        ids.push(proposal.proposalId);
        capabilityToProposalIds.set(key, ids);
      });
    });

    for (const [capability, proposalIds] of capabilityToProposalIds.entries()) {
      if (proposalIds.length > 1) {
        conflicts.push({
          type: 'RESOURCE_CONFLICT',
          capability,
          proposalIds
        });
      }
    }

    return conflicts;
  }

  detectDependencyConflicts(proposals = []) {
    const knownStatuses = proposals.reduce((acc, proposal) => {
      acc[proposal.proposalId] = proposal.status;
      return acc;
    }, {});

    const conflicts = [];

    proposals.forEach((proposal) => {
      (proposal.dependencies ?? []).forEach((dependencyId) => {
        const status = String(knownStatuses[dependencyId] ?? '').toUpperCase();
        if (status !== 'APPROVED' && status !== 'CONVERTED_TO_MISSION') {
          conflicts.push({
            type: 'DEPENDENCY_CONFLICT',
            proposalId: proposal.proposalId,
            dependencyId,
            dependencyStatus: status || 'UNKNOWN'
          });
        }
      });
    });

    return conflicts;
  }

  detectCapacityConflicts({ proposals = [], workforceSnapshot } = {}) {
    const totalEffort = proposals.reduce((sum, proposal) => sum + Number(proposal.estimatedEffort ?? 0), 0);
    const capacityBaseline = Math.max((workforceSnapshot?.workers?.length ?? 0) * 20, 1);
    const demandRatio = totalEffort / capacityBaseline;

    if (demandRatio <= 1) {
      return [];
    }

    return [{
      type: 'CAPACITY_CONFLICT',
      totalEffort,
      capacityBaseline,
      demandRatio: Number(demandRatio.toFixed(4))
    }];
  }

  requiresCeoApproval({ proposal, evaluation, workforceSnapshot } = {}) {
    const reasons = [];

    if (Number(proposal.estimatedCost ?? 0) >= this.governanceConfig.highCostThreshold) {
      reasons.push('High-cost mission exceeds threshold.');
    }

    const numericRisk = Array.isArray(proposal.risks) && proposal.risks.length > 0
      ? proposal.risks.reduce((sum, risk) => sum + Number(risk?.severity ?? risk ?? 0.5), 0) / proposal.risks.length
      : 0;

    if (numericRisk >= this.governanceConfig.highRiskThreshold) {
      reasons.push('High-risk mission requires CEO approval.');
    }

    if (proposal.governance?.requiresPublishing === true) {
      reasons.push('Publishing-capable mission requires CEO approval.');
    }

    if (proposal.governance?.requiresProductionDeployment === true) {
      reasons.push('Production deployment mission requires CEO approval.');
    }

    if ((workforceSnapshot?.dashboard?.workerUtilization ?? 0) / 100 >= this.governanceConfig.resourceLimit) {
      reasons.push('Resource utilization exceeds configured threshold.');
    }

    if (proposal.governance?.createsNewBusinessDivision === true) {
      reasons.push('New business division creation requires CEO approval.');
    }

    if (evaluation?.priorityBand === 'CRITICAL' && evaluation?.overallScore >= 0.9) {
      reasons.push('Critical strategic proposal requires explicit CEO sign-off.');
    }

    return {
      required: reasons.length > 0,
      reasons
    };
  }

  buildEvaluationContext(proposal) {
    const workforceSnapshot = this.getWorkforceSnapshot();
    const proposals = this.portfolioRegistry.listProposals();
    const dependencyStatuses = proposals.reduce((acc, item) => {
      acc[item.proposalId] = item.status;
      return acc;
    }, {});

    return {
      workforceSnapshot,
      dependencyStatuses,
      strategicAlignment: proposal.metadata?.strategicAlignment ?? 0.7,
      availableCapabilities: workforceSnapshot.availableCapabilities,
      availableWorkers: workforceSnapshot.workers
    };
  }

  submitProposal(payload = {}) {
    const recordExists = this.portfolioRegistry.detectDuplicateProposal(payload);

    if (recordExists) {
      return {
        accepted: false,
        duplicateDetected: true,
        reason: 'Duplicate proposal detected.',
        proposal: recordExists
      };
    }

    const record = this.portfolioRegistry.createProposal({
      ...payload,
      status: ProposalStatuses.SUBMITTED
    });

    const validation = validateMissionProposal(record.proposal);

    if (!validation.isValid) {
      this.portfolioRegistry.updateProposal(record.proposal.proposalId, {
        status: ProposalStatuses.REVISION_REQUIRED
      });
      this.portfolioRegistry.addFailure(record.proposal.proposalId, {
        action: 'VALIDATION_FAILED',
        issues: validation.issues
      });

      return {
        accepted: false,
        duplicateDetected: false,
        reason: validation.issues.join(' | '),
        proposal: this.portfolioRegistry.getProposal(record.proposal.proposalId)?.proposal ?? null
      };
    }

    this.portfolioRegistry.transitionProposalStatus({
      proposalId: record.proposal.proposalId,
      toStatus: ProposalStatuses.UNDER_REVIEW,
      reason: 'Submitted for executive evaluation.'
    });

    return {
      accepted: true,
      duplicateDetected: false,
      proposal: this.portfolioRegistry.getProposal(record.proposal.proposalId)?.proposal ?? null
    };
  }

  evaluateProposal(proposalId) {
    const record = this.portfolioRegistry.getProposal(proposalId);
    if (!record) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    const context = this.buildEvaluationContext(record.proposal);
    const evaluation = this.planningEngine.evaluateProposal(record.proposal, context);

    this.portfolioRegistry.addEvaluationHistory(proposalId, evaluation);

    const ceoGate = this.requiresCeoApproval({
      proposal: record.proposal,
      evaluation,
      workforceSnapshot: context.workforceSnapshot
    });

    const resourceRecommendation = this.planningEngine.createResourceRecommendation({
      proposal: record.proposal,
      availableCapabilities: context.availableCapabilities,
      capacityConflicts: this.detectCapacityConflicts({
        proposals: this.portfolioRegistry.listProposals(),
        workforceSnapshot: context.workforceSnapshot
      }),
      staffingPlan: evaluation.recommendedResources
    });

    return {
      proposal: this.portfolioRegistry.getProposal(proposalId)?.proposal ?? null,
      evaluation,
      resourceRecommendation,
      ceoApprovalGate: ceoGate,
      context
    };
  }

  evaluateAllUnderReview() {
    const candidates = this.portfolioRegistry.listProposals().filter((proposal) => (
      proposal.status === ProposalStatuses.UNDER_REVIEW
      || proposal.status === ProposalStatuses.SUBMITTED
      || proposal.status === ProposalStatuses.DEFERRED
      || proposal.status === ProposalStatuses.REVISION_REQUIRED
    ));

    return candidates.map((proposal) => {
      if (proposal.status === ProposalStatuses.SUBMITTED) {
        this.portfolioRegistry.transitionProposalStatus({
          proposalId: proposal.proposalId,
          toStatus: ProposalStatuses.UNDER_REVIEW,
          reason: 'Batch evaluation entered review.'
        });
      }

      return this.evaluateProposal(proposal.proposalId);
    });
  }

  rankPortfolio() {
    const proposals = this.portfolioRegistry.listProposals();
    const enriched = proposals.map((proposal) => ({
      proposal,
      latestEvaluation: proposal.evaluationHistory[proposal.evaluationHistory.length - 1] ?? null
    }));

    const ranked = enriched
      .slice()
      .sort((a, b) => Number(b.latestEvaluation?.overallScore ?? 0) - Number(a.latestEvaluation?.overallScore ?? 0));

    ranked.forEach((item, index) => {
      if (!item.latestEvaluation) {
        return;
      }

      const prioritization = this.planningEngine.createPriorityRecommendation({
        proposal: item.proposal,
        evaluation: item.latestEvaluation,
        rank: index + 1
      });

      this.portfolioRegistry.addPrioritizationHistory(item.proposal.proposalId, prioritization);
    });

    const latest = this.portfolioRegistry.listProposals().map((proposal) => {
      const evalEntry = proposal.evaluationHistory[proposal.evaluationHistory.length - 1] ?? null;
      const priorityEntry = proposal.prioritizationHistory[proposal.prioritizationHistory.length - 1] ?? null;
      return {
        proposal,
        evaluation: evalEntry,
        prioritization: priorityEntry
      };
    }).sort((a, b) => Number(a.prioritization?.rank ?? Number.MAX_SAFE_INTEGER) - Number(b.prioritization?.rank ?? Number.MAX_SAFE_INTEGER));

    const proposalsOnly = latest.map((item) => item.proposal);
    const resourceConflicts = this.detectResourceConflicts(proposalsOnly);
    const dependencyConflicts = this.detectDependencyConflicts(proposalsOnly);
    const workforceSnapshot = this.getWorkforceSnapshot();
    const capacityConflicts = this.detectCapacityConflicts({ proposals: proposalsOnly, workforceSnapshot });

    return {
      ranked: latest,
      resourceConflicts,
      dependencyConflicts,
      capacityConflicts,
      workforceSnapshot
    };
  }

  applyExecutiveDecision(rawDecision = {}) {
    const decision = createExecutiveDecision(rawDecision, { now: this.now });
    const validation = validateExecutiveDecision(decision);

    if (!validation.isValid) {
      return {
        applied: false,
        reason: validation.issues.join(' | '),
        decision: null
      };
    }

    const record = this.portfolioRegistry.getProposal(decision.proposalId);
    if (!record) {
      return {
        applied: false,
        reason: 'Proposal not found.',
        decision
      };
    }

    const latestEvaluation = record.proposal.evaluationHistory[record.proposal.evaluationHistory.length - 1] ?? null;
    const workforceSnapshot = this.getWorkforceSnapshot();
    const ceoGate = this.requiresCeoApproval({
      proposal: record.proposal,
      evaluation: latestEvaluation,
      workforceSnapshot
    });

    const decider = String(decision.decidedBy ?? '').toUpperCase();
    if (ceoGate.required && decider !== 'CEO') {
      return {
        applied: false,
        reason: `CEO approval required: ${ceoGate.reasons.join(' | ')}`,
        decision
      };
    }

    let targetStatus = ProposalStatuses.UNDER_REVIEW;

    switch (decision.decision) {
      case ExecutiveDecisions.APPROVE:
      case ExecutiveDecisions.APPROVE_WITH_CONDITIONS:
        targetStatus = ProposalStatuses.APPROVED;
        break;
      case ExecutiveDecisions.REVISION_REQUIRED:
        targetStatus = ProposalStatuses.REVISION_REQUIRED;
        break;
      case ExecutiveDecisions.DEFER:
        targetStatus = ProposalStatuses.DEFERRED;
        break;
      case ExecutiveDecisions.REJECT:
        targetStatus = ProposalStatuses.REJECTED;
        break;
      case ExecutiveDecisions.CANCEL:
        targetStatus = ProposalStatuses.CANCELLED;
        break;
      default:
        targetStatus = ProposalStatuses.UNDER_REVIEW;
    }

    const transition = this.portfolioRegistry.transitionProposalStatus({
      proposalId: decision.proposalId,
      toStatus: targetStatus,
      reason: decision.rationale
    });

    if (!transition.success) {
      return {
        applied: false,
        reason: transition.reason,
        decision
      };
    }

    this.portfolioRegistry.addDecisionHistory(decision.proposalId, decision);

    return {
      applied: true,
      reason: null,
      decision,
      proposal: this.portfolioRegistry.getProposal(decision.proposalId)?.proposal ?? null,
      ceoApprovalGate: ceoGate
    };
  }

  async convertProposalToMission(proposalId) {
    const record = this.portfolioRegistry.getProposal(proposalId);
    if (!record) {
      return {
        converted: false,
        reason: 'Proposal not found.',
        missionId: null
      };
    }

    const latestDecision = record.proposal.decisionHistory[record.proposal.decisionHistory.length - 1] ?? null;
    const latestEvaluation = record.proposal.evaluationHistory[record.proposal.evaluationHistory.length - 1] ?? null;

    const result = await this.conversionBridge.convertApprovedProposal({
      proposal: record.proposal,
      evaluation: latestEvaluation,
      decision: latestDecision
    });

    if (result.converted && result.missionId) {
      this.portfolioRegistry.linkProposalToMission({
        proposalId,
        missionId: result.missionId,
        telemetry: result.telemetry
      });
    }

    return result;
  }

  retryEvaluation(proposalId) {
    try {
      return {
        retried: true,
        result: this.evaluateProposal(proposalId)
      };
    } catch (error) {
      this.portfolioRegistry.addFailure(proposalId, {
        action: 'RETRY_EVALUATION_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      return {
        retried: false,
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  resumeReview(proposalId) {
    const record = this.portfolioRegistry.getProposal(proposalId);
    if (!record) {
      return { resumed: false, reason: 'Proposal not found.' };
    }

    const transition = this.portfolioRegistry.transitionProposalStatus({
      proposalId,
      toStatus: ProposalStatuses.UNDER_REVIEW,
      reason: 'Review resumed by executive planning manager.'
    });

    return {
      resumed: transition.success,
      reason: transition.success ? null : transition.reason,
      proposal: this.portfolioRegistry.getProposal(proposalId)?.proposal ?? null
    };
  }

  pauseProposal({ proposalId, decidedBy = 'CEO', rationale = 'Paused by executive decision', conditions = [] } = {}) {
    return this.applyExecutiveDecision({
      proposalId,
      decision: ExecutiveDecisions.DEFER,
      decidedBy,
      rationale,
      conditions,
      timestamp: isoNow(this.now)
    });
  }

  resumePausedProposal(proposalId) {
    return this.resumeReview(proposalId);
  }

  reEvaluateProposal(proposalId) {
    return this.retryEvaluation(proposalId);
  }

  rollbackProposalStatus({ proposalId, toStatus, reason = 'Rollback requested' } = {}) {
    const record = this.portfolioRegistry.getProposal(proposalId);
    if (!record) {
      return { rolledBack: false, reason: 'Proposal not found.' };
    }

    const currentStatus = record.proposal.status;
    record.proposal.status = toStatus;
    record.proposal.updatedAt = isoNow(this.now);
    record.proposal.auditTrail.push({
      type: 'STATUS_ROLLBACK',
      fromStatus: currentStatus,
      toStatus,
      reason,
      timestamp: isoNow(this.now)
    });

    return {
      rolledBack: true,
      proposal: record.proposal
    };
  }

  cancelProposal({ proposalId, decidedBy = 'SYSTEM', rationale = 'Cancelled by manager', conditions = [] } = {}) {
    return this.applyExecutiveDecision({
      proposalId,
      decision: ExecutiveDecisions.CANCEL,
      decidedBy,
      rationale,
      conditions,
      timestamp: isoNow(this.now)
    });
  }

  getPortfolioView() {
    const ranking = this.rankPortfolio();
    const summary = this.portfolioRegistry.getPortfolioSummaryMetrics();

    return {
      summary,
      ...ranking,
      proposals: this.portfolioRegistry.listProposals()
    };
  }

  recommendNextExecutiveActions() {
    const proposals = this.portfolioRegistry.listProposals();
    const actions = [];

    proposals.forEach((proposal) => {
      const latestEvaluation = proposal.evaluationHistory[proposal.evaluationHistory.length - 1] ?? null;

      if (!latestEvaluation) {
        actions.push({
          type: 'EVALUATE_PROPOSAL',
          proposalId: proposal.proposalId,
          reason: 'No evaluation history found.'
        });
        return;
      }

      if (
        proposal.status === ProposalStatuses.UNDER_REVIEW
        && latestEvaluation.recommendedDecision === PlanningRecommendedDecisions.APPROVE
      ) {
        actions.push({
          type: 'REQUEST_DECISION',
          proposalId: proposal.proposalId,
          reason: 'High score with approve recommendation pending executive decision.'
        });
      }

      if (proposal.status === ProposalStatuses.REVISION_REQUIRED) {
        actions.push({
          type: 'REQUEST_REVISION_RESPONSE',
          proposalId: proposal.proposalId,
          reason: 'Proposal is revision-required and awaiting updates.'
        });
      }

      if (proposal.status === ProposalStatuses.APPROVED && !proposal.linkedMissionId) {
        actions.push({
          type: 'CONVERT_TO_MISSION',
          proposalId: proposal.proposalId,
          reason: 'Approved proposal is ready for Mission Control conversion.'
        });
      }
    });

    return actions.slice(0, 20);
  }
}
