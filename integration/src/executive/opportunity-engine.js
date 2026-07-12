import { OpportunityScorecard } from './opportunity-scorecard.js';
import {
  OpportunityPortfolios,
  buildDefaultObjectiveWeights
} from './opportunity-engine-contracts.js';

export class OpportunityEngine {
  constructor({
    marketDiscovery = null,
    opportunityResearch = null,
    competitiveAnalysis = null,
    businessModelAnalysis = null,
    financialEstimate = null,
    riskAssessment = null,
    strategicFit = null,
    scorecard = null,
    objectiveWeights = null
  } = {}) {
    this.marketDiscovery = marketDiscovery ?? new DefaultMarketDiscovery();
    this.opportunityResearch = opportunityResearch ?? new DefaultOpportunityResearch();
    this.competitiveAnalysis = competitiveAnalysis ?? new DefaultCompetitiveAnalysis();
    this.businessModelAnalysis = businessModelAnalysis ?? new DefaultBusinessModelAnalysis();
    this.financialEstimate = financialEstimate ?? new DefaultFinancialEstimate();
    this.riskAssessment = riskAssessment ?? new DefaultRiskAssessment();
    this.strategicFit = strategicFit ?? new DefaultStrategicFit();
    this.scorecard = scorecard ?? new OpportunityScorecard({ objectiveWeights: objectiveWeights ?? buildDefaultObjectiveWeights() });
  }

  async evaluate({ ceoObjective = '', portfolio = OpportunityPortfolios.CASH_FLOW, discoveryContext = {} } = {}) {
    const discovered = await this.marketDiscovery.discover({ ceoObjective, portfolio, discoveryContext });
    const researched = await this.opportunityResearch.research(discovered, { ceoObjective, portfolio, discoveryContext });
    const competitive = await this.competitiveAnalysis.analyze(researched, { ceoObjective, portfolio, discoveryContext });
    const modeled = await this.businessModelAnalysis.analyze(competitive, { ceoObjective, portfolio, discoveryContext });
    const financiallyEstimated = await this.financialEstimate.estimate(modeled, { ceoObjective, portfolio, discoveryContext });
    const riskAssessed = await this.riskAssessment.assess(financiallyEstimated, { ceoObjective, portfolio, discoveryContext });
    const strategicallyEvaluated = await this.strategicFit.evaluate(riskAssessed, { ceoObjective, portfolio, discoveryContext });

    const rankedRecommendations = strategicallyEvaluated
      .map(opportunity => this.buildRecommendation({ opportunity, portfolio }))
      .sort((a, b) => b.scorecard.overallExecutiveScore - a.scorecard.overallExecutiveScore)
      .slice(0, 10)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    return {
      ceoObjective,
      portfolio,
      evaluatedAt: new Date().toISOString(),
      recommendationCount: rankedRecommendations.length,
      rankedRecommendations
    };
  }

  async evaluatePortfolios({ ceoObjective = '', discoveryContext = {} } = {}) {
    const cashFlow = await this.evaluate({
      ceoObjective,
      portfolio: OpportunityPortfolios.CASH_FLOW,
      discoveryContext
    });

    const enterprise = await this.evaluate({
      ceoObjective,
      portfolio: OpportunityPortfolios.ENTERPRISE,
      discoveryContext
    });

    return {
      ceoObjective,
      evaluatedAt: new Date().toISOString(),
      portfolios: {
        [OpportunityPortfolios.CASH_FLOW]: cashFlow,
        [OpportunityPortfolios.ENTERPRISE]: enterprise
      }
    };
  }

  buildRecommendation({ opportunity, portfolio }) {
    const scorecard = this.scorecard.score({ opportunity, portfolio });

    return {
      opportunityId: opportunity.opportunityId,
      businessDescription: opportunity.businessDescription,
      targetCustomer: opportunity.targetCustomer,
      revenueModel: opportunity.revenueModel,
      whyAtlasRecommendsIt: opportunity.whyAtlasRecommendsIt,
      requiredSpecialists: opportunity.requiredSpecialists,
      automationPercentage: Number(opportunity.automationPercentage ?? 0),
      estimatedStartupCost: opportunity.estimatedStartupCost,
      estimatedTimeToLaunch: opportunity.estimatedTimeToLaunch,
      estimatedTimeToFirstRevenue: opportunity.estimatedTimeToFirstRevenue,
      risks: opportunity.risks,
      confidence: opportunity.confidence,
      executiveRecommendation: this.resolveExecutiveRecommendation(scorecard),
      scorecard
    };
  }

  resolveExecutiveRecommendation(scorecard) {
    const score = Number(scorecard?.overallExecutiveScore ?? 0);

    if (score >= 8) return 'STRONG_RECOMMENDATION';
    if (score >= 6.5) return 'RECOMMEND_WITH_CONDITIONS';
    if (score >= 5) return 'WATCHLIST';
    return 'DO_NOT_PRIORITIZE';
  }
}

class DefaultMarketDiscovery {
  async discover({ discoveryContext = {} } = {}) {
    return Array.isArray(discoveryContext?.candidateOpportunities)
      ? discoveryContext.candidateOpportunities
      : [];
  }
}

class DefaultOpportunityResearch {
  async research(opportunities = []) {
    return opportunities.map(item => ({
      ...item,
      research: item.research ?? {}
    }));
  }
}

class DefaultCompetitiveAnalysis {
  async analyze(opportunities = []) {
    return opportunities.map(item => ({
      ...item,
      competition: item.competition ?? {}
    }));
  }
}

class DefaultBusinessModelAnalysis {
  async analyze(opportunities = []) {
    return opportunities.map(item => ({
      ...item,
      businessModel: item.businessModel ?? {}
    }));
  }
}

class DefaultFinancialEstimate {
  async estimate(opportunities = []) {
    return opportunities.map(item => ({
      ...item,
      financials: item.financials ?? {}
    }));
  }
}

class DefaultRiskAssessment {
  async assess(opportunities = []) {
    return opportunities.map(item => ({
      ...item,
      riskProfile: item.riskProfile ?? {}
    }));
  }
}

class DefaultStrategicFit {
  async evaluate(opportunities = []) {
    return opportunities.map((item, index) => ({
      opportunityId: item.opportunityId ?? `OPPORTUNITY-${String(index + 1).padStart(3, '0')}`,
      businessDescription: item.businessDescription ?? 'Opportunity description pending.',
      targetCustomer: item.targetCustomer ?? 'Target customer pending.',
      revenueModel: item.revenueModel ?? 'Revenue model pending.',
      whyAtlasRecommendsIt: item.whyAtlasRecommendsIt ?? 'Awaiting evidence-backed strategic rationale.',
      requiredSpecialists: Array.isArray(item.requiredSpecialists) ? item.requiredSpecialists : [],
      automationPercentage: Number(item.automationPercentage ?? 0),
      estimatedStartupCost: item.estimatedStartupCost ?? 'UNKNOWN',
      estimatedTimeToLaunch: item.estimatedTimeToLaunch ?? 'UNKNOWN',
      estimatedTimeToFirstRevenue: item.estimatedTimeToFirstRevenue ?? 'UNKNOWN',
      risks: Array.isArray(item.risks) ? item.risks : [],
      confidence: item.confidence ?? 'LOW',
      assessments: {
        probabilityOfSuccess: Number(item?.assessments?.probabilityOfSuccess ?? 0),
        timeToFirstRevenueScore: Number(item?.assessments?.timeToFirstRevenueScore ?? 0),
        startupCostScore: Number(item?.assessments?.startupCostScore ?? 0),
        automationPotential: Number(item?.assessments?.automationPotential ?? 0),
        scalability: Number(item?.assessments?.scalability ?? 0),
        competitionScore: Number(item?.assessments?.competitionScore ?? 0),
        requiredAISpecialistsScore: Number(item?.assessments?.requiredAISpecialistsScore ?? 0),
        atlasStrategicValue: Number(item?.assessments?.atlasStrategicValue ?? 0),
        longTermPotential: Number(item?.assessments?.longTermPotential ?? 0)
      }
    }));
  }
}
