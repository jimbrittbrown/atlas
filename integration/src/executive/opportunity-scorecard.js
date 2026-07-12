import {
  OpportunityObjectives,
  buildDefaultObjectiveWeights,
  normalizeOpportunityScore
} from './opportunity-engine-contracts.js';

export class OpportunityScorecard {
  constructor({ objectiveWeights = buildDefaultObjectiveWeights() } = {}) {
    this.objectiveWeights = {
      ...buildDefaultObjectiveWeights(),
      ...(objectiveWeights ?? {})
    };
  }

  score({ opportunity = {}, portfolio = 'Cash Flow' } = {}) {
    const probabilityOfSuccess = normalizeOpportunityScore(opportunity?.assessments?.probabilityOfSuccess ?? 0);
    const timeToFirstRevenue = normalizeOpportunityScore(opportunity?.assessments?.timeToFirstRevenueScore ?? 0);
    const startupCost = normalizeOpportunityScore(opportunity?.assessments?.startupCostScore ?? 0);
    const automationPotential = normalizeOpportunityScore(opportunity?.assessments?.automationPotential ?? 0);
    const scalability = normalizeOpportunityScore(opportunity?.assessments?.scalability ?? 0);
    const competition = normalizeOpportunityScore(opportunity?.assessments?.competitionScore ?? 0);
    const requiredAISpecialists = normalizeOpportunityScore(opportunity?.assessments?.requiredAISpecialistsScore ?? 0);
    const atlasStrategicValue = normalizeOpportunityScore(opportunity?.assessments?.atlasStrategicValue ?? 0);
    const longTermPotential = normalizeOpportunityScore(opportunity?.assessments?.longTermPotential ?? 0);

    const weighted = this.weightedAggregate({
      probabilityOfSuccess,
      timeToFirstRevenue,
      startupCost,
      automationPotential,
      scalability,
      competition,
      requiredAISpecialists,
      atlasStrategicValue,
      longTermPotential,
      portfolio
    });

    return {
      probabilityOfSuccess,
      timeToFirstRevenue,
      startupCost,
      automationPotential,
      scalability,
      competition,
      requiredAISpecialists,
      atlasStrategicValue,
      longTermPotential,
      overallExecutiveScore: weighted
    };
  }

  weightedAggregate(scores) {
    const cashFlowBias = scores.portfolio === 'Cash Flow' ? 1.15 : 1;
    const enterpriseBias = scores.portfolio === 'Enterprise' ? 1.15 : 1;

    const weightedInputs = [
      {
        objective: OpportunityObjectives.HIGH_PROBABILITY_OF_SUCCESS,
        value: scores.probabilityOfSuccess,
        multiplier: 1
      },
      {
        objective: OpportunityObjectives.CASH_FLOW_QUICKLY,
        value: scores.timeToFirstRevenue,
        multiplier: cashFlowBias
      },
      {
        objective: OpportunityObjectives.LOW_STARTUP_COST,
        value: scores.startupCost,
        multiplier: cashFlowBias
      },
      {
        objective: OpportunityObjectives.HIGH_AUTOMATION_POTENTIAL,
        value: scores.automationPotential,
        multiplier: 1
      },
      {
        objective: OpportunityObjectives.HIGH_SCALABILITY,
        value: scores.scalability,
        multiplier: enterpriseBias
      },
      {
        objective: OpportunityObjectives.BUILD_STRATEGIC_ASSETS,
        value: scores.atlasStrategicValue,
        multiplier: enterpriseBias
      },
      {
        objective: OpportunityObjectives.LONG_TERM_ENTERPRISE_VALUE,
        value: scores.longTermPotential,
        multiplier: enterpriseBias
      },
      {
        objective: OpportunityObjectives.LOW_OPERATIONAL_COMPLEXITY,
        value: scores.requiredAISpecialists,
        multiplier: 1
      },
      {
        objective: OpportunityObjectives.HIGH_PROBABILITY_OF_SUCCESS,
        value: scores.competition,
        multiplier: 1
      }
    ];

    let weightedTotal = 0;
    let weightSum = 0;

    for (const item of weightedInputs) {
      const baseWeight = Number(this.objectiveWeights[item.objective] ?? 1);
      const weight = baseWeight * Number(item.multiplier ?? 1);
      weightedTotal += Number(item.value ?? 0) * weight;
      weightSum += weight;
    }

    return normalizeOpportunityScore(weightSum === 0 ? 0 : weightedTotal / weightSum);
  }
}
