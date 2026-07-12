import test from 'node:test';
import assert from 'node:assert/strict';
import { OpportunityEngine } from '../src/executive/opportunity-engine.js';
import { OpportunityPortfolios } from '../src/executive/opportunity-engine-contracts.js';
import { OpportunityDashboardModel } from '../src/executive/opportunity-dashboard-model.js';

test('opportunity engine returns top 10 ranked recommendations with required fields', async () => {
  const engine = new OpportunityEngine();

  const candidates = Array.from({ length: 12 }, (_, index) => ({
    opportunityId: `OPP-${String(index + 1).padStart(3, '0')}`,
    businessDescription: `Opportunity ${index + 1}`,
    targetCustomer: 'SMB operators',
    revenueModel: 'Subscription + setup fee',
    whyAtlasRecommendsIt: `Rationale for opportunity ${index + 1}`,
    requiredSpecialists: ['Research', 'Long-form Writing', 'Analytics'],
    automationPercentage: 70,
    estimatedStartupCost: `$${(index + 1) * 1000}`,
    estimatedTimeToLaunch: `${index + 2} weeks`,
    estimatedTimeToFirstRevenue: `${index + 3} weeks`,
    risks: ['Execution risk', 'Competition risk'],
    confidence: 'MEDIUM',
    assessments: {
      probabilityOfSuccess: 9 - (index * 0.2),
      timeToFirstRevenueScore: 8 - (index * 0.15),
      startupCostScore: 8 - (index * 0.1),
      automationPotential: 7,
      scalability: 8,
      competitionScore: 6,
      requiredAISpecialistsScore: 7,
      atlasStrategicValue: 8,
      longTermPotential: 8
    }
  }));

  const result = await engine.evaluate({
    ceoObjective: 'Build profitable opportunities with balanced cash flow and scale',
    portfolio: OpportunityPortfolios.CASH_FLOW,
    discoveryContext: {
      candidateOpportunities: candidates
    }
  });

  assert.equal(result.rankedRecommendations.length, 10);
  const top = result.rankedRecommendations[0];

  assert.equal(typeof top.businessDescription, 'string');
  assert.equal(typeof top.targetCustomer, 'string');
  assert.equal(typeof top.revenueModel, 'string');
  assert.equal(typeof top.whyAtlasRecommendsIt, 'string');
  assert.equal(Array.isArray(top.requiredSpecialists), true);
  assert.equal(typeof top.automationPercentage, 'number');
  assert.equal(typeof top.estimatedStartupCost, 'string');
  assert.equal(typeof top.estimatedTimeToLaunch, 'string');
  assert.equal(typeof top.estimatedTimeToFirstRevenue, 'string');
  assert.equal(Array.isArray(top.risks), true);
  assert.equal(typeof top.confidence, 'string');
  assert.equal(typeof top.executiveRecommendation, 'string');
  assert.equal(typeof top.scorecard.overallExecutiveScore, 'number');

  for (let i = 1; i < result.rankedRecommendations.length; i += 1) {
    assert.equal(
      result.rankedRecommendations[i - 1].scorecard.overallExecutiveScore
      >= result.rankedRecommendations[i].scorecard.overallExecutiveScore,
      true
    );
  }
});

test('opportunity engine evaluates both permanent portfolios', async () => {
  const engine = new OpportunityEngine();

  const sharedCandidates = [
    {
      opportunityId: 'OPP-A',
      businessDescription: 'Short-cycle automation service',
      targetCustomer: 'Local service SMBs',
      revenueModel: 'Monthly retainer',
      whyAtlasRecommendsIt: 'Fast launch and moderate automation',
      requiredSpecialists: ['Research', 'Marketing Copy', 'SEO'],
      automationPercentage: 74,
      estimatedStartupCost: '$2500',
      estimatedTimeToLaunch: '3 weeks',
      estimatedTimeToFirstRevenue: '5 weeks',
      risks: ['Market saturation'],
      confidence: 'MEDIUM',
      assessments: {
        probabilityOfSuccess: 7.5,
        timeToFirstRevenueScore: 9,
        startupCostScore: 8,
        automationPotential: 7,
        scalability: 6,
        competitionScore: 5,
        requiredAISpecialistsScore: 7,
        atlasStrategicValue: 6,
        longTermPotential: 6.5
      }
    },
    {
      opportunityId: 'OPP-B',
      businessDescription: 'Strategic enterprise intelligence product',
      targetCustomer: 'Mid-market operations teams',
      revenueModel: 'Annual contracts',
      whyAtlasRecommendsIt: 'High strategic value and long-term upside',
      requiredSpecialists: ['Research', 'Coding', 'Data Analysis'],
      automationPercentage: 62,
      estimatedStartupCost: '$15000',
      estimatedTimeToLaunch: '10 weeks',
      estimatedTimeToFirstRevenue: '16 weeks',
      risks: ['Long sales cycle'],
      confidence: 'MEDIUM',
      assessments: {
        probabilityOfSuccess: 7,
        timeToFirstRevenueScore: 5,
        startupCostScore: 4,
        automationPotential: 8,
        scalability: 9,
        competitionScore: 6,
        requiredAISpecialistsScore: 6,
        atlasStrategicValue: 9,
        longTermPotential: 9
      }
    }
  ];

  const result = await engine.evaluatePortfolios({
    ceoObjective: 'Balance immediate cash flow with enterprise value',
    discoveryContext: {
      candidateOpportunities: sharedCandidates
    }
  });

  assert.equal(Boolean(result.portfolios[OpportunityPortfolios.CASH_FLOW]), true);
  assert.equal(Boolean(result.portfolios[OpportunityPortfolios.ENTERPRISE]), true);
  assert.equal(
    result.portfolios[OpportunityPortfolios.CASH_FLOW].rankedRecommendations.length > 0,
    true
  );
  assert.equal(
    result.portfolios[OpportunityPortfolios.ENTERPRISE].rankedRecommendations.length > 0,
    true
  );
});

test('dashboard model projects CEO dashboard fields', () => {
  const dashboardModel = new OpportunityDashboardModel();

  const dashboard = dashboardModel.build({
    portfolioResults: {
      [OpportunityPortfolios.CASH_FLOW]: {
        rankedRecommendations: [
          {
            opportunityId: 'OPP-CEO-01',
            rank: 1,
            businessDescription: 'Primary recommended business',
            estimatedTimeToFirstRevenue: '6 weeks',
            requiredSpecialists: ['Research', 'Long-form Writing', 'Analytics'],
            executiveRecommendation: 'STRONG_RECOMMENDATION',
            scorecard: {
              overallExecutiveScore: 8.7
            }
          }
        ]
      },
      [OpportunityPortfolios.ENTERPRISE]: {
        rankedRecommendations: []
      }
    }
  });

  assert.equal(dashboard.recommendedBusiness, 'Primary recommended business');
  assert.equal(dashboard.currentRank, 1);
  assert.equal(dashboard.expectedROI, 'HIGH');
  assert.equal(dashboard.estimatedTimeToRevenue, '6 weeks');
  assert.equal(Array.isArray(dashboard.requiredSpecialists), true);
  assert.equal(dashboard.launchRecommendation, 'STRONG_RECOMMENDATION');
});
