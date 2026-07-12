import { OpportunityPortfolios } from './opportunity-engine-contracts.js';

export class OpportunityDashboardModel {
  build({ portfolioResults = {} } = {}) {
    const cashFlow = portfolioResults?.[OpportunityPortfolios.CASH_FLOW] ?? { rankedRecommendations: [] };
    const enterprise = portfolioResults?.[OpportunityPortfolios.ENTERPRISE] ?? { rankedRecommendations: [] };

    const cashFlowTop = cashFlow.rankedRecommendations?.[0] ?? null;
    const enterpriseTop = enterprise.rankedRecommendations?.[0] ?? null;

    return {
      generatedAt: new Date().toISOString(),
      recommendedBusiness: cashFlowTop?.businessDescription ?? enterpriseTop?.businessDescription ?? 'NO_RECOMMENDATION',
      currentRank: cashFlowTop?.rank ?? enterpriseTop?.rank ?? null,
      expectedROI: this.estimateROI(cashFlowTop ?? enterpriseTop),
      estimatedTimeToRevenue: cashFlowTop?.estimatedTimeToFirstRevenue ?? enterpriseTop?.estimatedTimeToFirstRevenue ?? 'UNKNOWN',
      requiredSpecialists: cashFlowTop?.requiredSpecialists ?? enterpriseTop?.requiredSpecialists ?? [],
      launchRecommendation: cashFlowTop?.executiveRecommendation ?? enterpriseTop?.executiveRecommendation ?? 'NO_RECOMMENDATION',
      portfolioSnapshots: {
        [OpportunityPortfolios.CASH_FLOW]: this.buildPortfolioSnapshot(cashFlow),
        [OpportunityPortfolios.ENTERPRISE]: this.buildPortfolioSnapshot(enterprise)
      }
    };
  }

  buildPortfolioSnapshot(portfolioResult = {}) {
    const ranked = Array.isArray(portfolioResult?.rankedRecommendations)
      ? portfolioResult.rankedRecommendations
      : [];
    const top = ranked[0] ?? null;

    return {
      recommendationCount: ranked.length,
      topOpportunity: top
        ? {
            opportunityId: top.opportunityId,
            businessDescription: top.businessDescription,
            overallExecutiveScore: top?.scorecard?.overallExecutiveScore ?? null,
            executiveRecommendation: top.executiveRecommendation
          }
        : null
    };
  }

  estimateROI(recommendation) {
    if (!recommendation?.scorecard) return 'UNKNOWN';

    const score = Number(recommendation.scorecard.overallExecutiveScore ?? 0);
    if (score >= 8) return 'HIGH';
    if (score >= 6.5) return 'MEDIUM';
    if (score >= 5) return 'LOW_TO_MEDIUM';
    return 'LOW';
  }
}
