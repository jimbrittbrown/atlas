import {
  createPriorityRecommendation,
  createResourceRecommendation,
  createStrategicEvaluation,
  PlanningRecommendedDecisions,
  PortfolioPriorityBands
} from './executive-planning-contracts.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round4(value) {
  return Number(Number(value).toFixed(4));
}

function normalizeRisk(risks = []) {
  if (!Array.isArray(risks) || risks.length === 0) {
    return 0;
  }

  const total = risks.reduce((sum, risk) => {
    if (typeof risk === 'number') {
      return sum + clamp(risk, 0, 1);
    }

    if (risk && typeof risk === 'object') {
      return sum + clamp(Number(risk.severity ?? 0.5), 0, 1);
    }

    return sum + 0.5;
  }, 0);

  return clamp(total / risks.length, 0, 1);
}

function normalizeDependenciesReadiness(dependencies = [], dependencyStatuses = {}) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    return 1;
  }

  const readyCount = dependencies.filter((dependencyId) => {
    const dependencyStatus = String(dependencyStatuses?.[dependencyId] ?? '').toUpperCase();
    return dependencyStatus === 'APPROVED' || dependencyStatus === 'CONVERTED_TO_MISSION';
  }).length;

  return clamp(readyCount / dependencies.length, 0, 1);
}

function normalizeResourceAvailability(requiredCapabilities = [], availableCapabilities = []) {
  if (!Array.isArray(requiredCapabilities) || requiredCapabilities.length === 0) {
    return 1;
  }

  const available = new Set((availableCapabilities ?? []).map((item) => String(item).toUpperCase()));
  const matched = requiredCapabilities.filter((capability) => available.has(String(capability).toUpperCase())).length;
  return clamp(matched / requiredCapabilities.length, 0, 1);
}

function normalizeFeasibility({ estimatedEffort = 0, estimatedCost = 0, estimatedDuration = 0 }) {
  const effortScore = 1 - clamp(Number(estimatedEffort) / 100, 0, 1);
  const costScore = 1 - clamp(Number(estimatedCost) / 1000000, 0, 1);
  const durationScore = 1 - clamp(Number(estimatedDuration) / 365, 0, 1);
  return round4((effortScore + costScore + durationScore) / 3);
}

function normalizeTimeToValue(estimatedDuration = 0, urgency = 0) {
  const fastDelivery = 1 - clamp(Number(estimatedDuration) / 365, 0, 1);
  const urgentDemand = clamp(Number(urgency) / 100, 0, 1);
  return round4((fastDelivery * 0.7) + (urgentDemand * 0.3));
}

export const PlanningScoreWeights = Object.freeze({
  strategicAlignment: 0.16,
  expectedBusinessValue: 0.14,
  urgency: 0.12,
  confidence: 0.1,
  feasibility: 0.1,
  resourceAvailability: 0.1,
  dependencyReadiness: 0.08,
  risk: 0.08,
  estimatedEffort: 0.04,
  estimatedCost: 0.04,
  timeToValue: 0.04
});

export class ExecutivePlanningEngine {
  constructor({ now } = {}) {
    this.now = now;
  }

  computeScoreBreakdown(proposal, context = {}) {
    const strategicAlignment = clamp(Number(context.strategicAlignment ?? 0.7), 0, 1);
    const expectedBusinessValue = clamp(Number(proposal.expectedBusinessValue ?? 0) / 100, 0, 1);
    const urgency = clamp(Number(proposal.urgency ?? 0) / 100, 0, 1);
    const confidence = clamp(Number(proposal.confidence ?? 0), 0, 1);
    const feasibility = normalizeFeasibility(proposal);

    const availableCapabilities = context.availableCapabilities ?? [];
    const resourceAvailability = normalizeResourceAvailability(proposal.requiredCapabilities, availableCapabilities);

    const dependencyReadiness = normalizeDependenciesReadiness(
      proposal.dependencies,
      context.dependencyStatuses
    );

    const risk = 1 - normalizeRisk(proposal.risks);
    const estimatedEffort = 1 - clamp(Number(proposal.estimatedEffort ?? 0) / 100, 0, 1);
    const estimatedCost = 1 - clamp(Number(proposal.estimatedCost ?? 0) / 1000000, 0, 1);
    const timeToValue = normalizeTimeToValue(proposal.estimatedDuration, proposal.urgency);

    return {
      strategicAlignment,
      expectedBusinessValue,
      urgency,
      confidence,
      feasibility,
      resourceAvailability,
      dependencyReadiness,
      risk,
      estimatedEffort,
      estimatedCost,
      timeToValue
    };
  }

  computeOverallScore(scoreBreakdown) {
    const weighted = Object.entries(PlanningScoreWeights).reduce((sum, [key, weight]) => {
      return sum + (Number(scoreBreakdown[key] ?? 0) * Number(weight));
    }, 0);

    return round4(weighted);
  }

  resolvePriorityBand(overallScore, blockingIssues = []) {
    if (blockingIssues.length > 0) {
      return PortfolioPriorityBands.HOLD;
    }

    if (overallScore >= 0.85) return PortfolioPriorityBands.CRITICAL;
    if (overallScore >= 0.7) return PortfolioPriorityBands.HIGH;
    if (overallScore >= 0.5) return PortfolioPriorityBands.MEDIUM;
    if (overallScore >= 0.35) return PortfolioPriorityBands.LOW;
    return PortfolioPriorityBands.HOLD;
  }

  resolveConfidenceBand(confidenceScore) {
    if (confidenceScore >= 0.8) return 'HIGH';
    if (confidenceScore >= 0.6) return 'MEDIUM';
    return 'LOW';
  }

  resolveRecommendedDecision({ overallScore, blockingIssues, warnings }) {
    if (blockingIssues.length > 0) {
      return PlanningRecommendedDecisions.REVISION_REQUIRED;
    }

    if (overallScore >= 0.8) return PlanningRecommendedDecisions.APPROVE;
    if (overallScore >= 0.7 && warnings.length <= 1) return PlanningRecommendedDecisions.APPROVE_WITH_CONDITIONS;
    if (overallScore >= 0.55) return PlanningRecommendedDecisions.DEFER;
    return PlanningRecommendedDecisions.REJECT;
  }

  evaluateProposal(proposal, context = {}) {
    const scoreBreakdown = this.computeScoreBreakdown(proposal, context);
    const overallScore = this.computeOverallScore(scoreBreakdown);

    const blockingIssues = [];
    const warnings = [];
    const assumptions = [];

    if (scoreBreakdown.dependencyReadiness < 0.5) {
      blockingIssues.push('Dependencies are not ready for execution.');
    }

    if (scoreBreakdown.resourceAvailability < 0.5) {
      blockingIssues.push('Required capabilities are not sufficiently available.');
    }

    if (scoreBreakdown.risk < 0.45) {
      warnings.push('Risk profile is elevated and requires mitigation plan.');
    }

    if (scoreBreakdown.feasibility < 0.5) {
      warnings.push('Feasibility is constrained by effort/cost/duration profile.');
    }

    assumptions.push('Scores use deterministic normalized weighting model v1.');
    assumptions.push('Resource availability is based on current Workforce Director snapshot.');

    const priorityBand = this.resolvePriorityBand(overallScore, blockingIssues);
    const confidenceBand = this.resolveConfidenceBand(scoreBreakdown.confidence);
    const recommendedDecision = this.resolveRecommendedDecision({
      overallScore,
      blockingIssues,
      warnings
    });

    const recommendedExecutionOrder = clamp(Math.round((1 - overallScore) * 100), 1, 100);

    const recommendedResources = (context.availableWorkers ?? [])
      .filter((worker) => worker.status === 'IDLE')
      .slice(0, 5)
      .map((worker) => ({
        workerId: worker.workerId,
        workerName: worker.workerName,
        specialty: worker.specialty
      }));

    return createStrategicEvaluation({
      proposalId: proposal.proposalId,
      scoreBreakdown,
      overallScore,
      priorityBand,
      confidenceBand,
      blockingIssues,
      warnings,
      assumptions,
      recommendedDecision,
      recommendedExecutionOrder,
      recommendedMissionType: proposal.missionType,
      recommendedCapabilities: proposal.requiredCapabilities,
      recommendedResources
    }, { now: this.now });
  }

  createPriorityRecommendation({ proposal, evaluation, rank }) {
    return createPriorityRecommendation({
      proposalId: proposal.proposalId,
      priorityBand: evaluation.priorityBand,
      rank,
      rationale: `Overall score ${evaluation.overallScore} mapped to ${evaluation.priorityBand}.`,
      score: evaluation.overallScore
    }, { now: this.now });
  }

  createResourceRecommendation({ proposal, availableCapabilities = [], capacityConflicts = [], staffingPlan = [] }) {
    return createResourceRecommendation({
      proposalId: proposal.proposalId,
      requiredCapabilities: proposal.requiredCapabilities,
      availableCapabilities,
      capacityConflicts,
      staffingPlan
    }, { now: this.now });
  }
}
