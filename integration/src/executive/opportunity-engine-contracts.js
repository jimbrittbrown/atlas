export const OpportunityObjectives = Object.freeze({
  CASH_FLOW_QUICKLY: 'Generate cash flow quickly',
  LONG_TERM_ENTERPRISE_VALUE: 'Maximize long-term enterprise value',
  BUILD_STRATEGIC_ASSETS: 'Build strategic assets',
  LOW_STARTUP_COST: 'Low startup cost',
  HIGH_AUTOMATION_POTENTIAL: 'High automation potential',
  LOW_OPERATIONAL_COMPLEXITY: 'Low operational complexity',
  HIGH_PROBABILITY_OF_SUCCESS: 'High probability of success',
  HIGH_SCALABILITY: 'High scalability'
});

export const OpportunityPortfolios = Object.freeze({
  CASH_FLOW: 'Cash Flow',
  ENTERPRISE: 'Enterprise'
});

export function normalizeOpportunityScore(value) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return 0;
  return Number(Math.max(0, Math.min(10, numeric)).toFixed(2));
}

export function buildDefaultObjectiveWeights() {
  return {
    [OpportunityObjectives.CASH_FLOW_QUICKLY]: 1,
    [OpportunityObjectives.LONG_TERM_ENTERPRISE_VALUE]: 1,
    [OpportunityObjectives.BUILD_STRATEGIC_ASSETS]: 1,
    [OpportunityObjectives.LOW_STARTUP_COST]: 1,
    [OpportunityObjectives.HIGH_AUTOMATION_POTENTIAL]: 1,
    [OpportunityObjectives.LOW_OPERATIONAL_COMPLEXITY]: 1,
    [OpportunityObjectives.HIGH_PROBABILITY_OF_SUCCESS]: 1,
    [OpportunityObjectives.HIGH_SCALABILITY]: 1
  };
}
