import { mkdirSync, writeFileSync } from 'node:fs';
import { OpportunityEngine } from '../src/executive/opportunity-engine.js';
import { WorkforceRepository } from '../../registry/src/workforce-repository.js';
import { WorkforceManager } from '../../registry/src/workforce-manager.js';
import { WorkforceRegistryService } from '../../registry/src/workforce-registry-service.js';
import { createPerplexityWorkforceMarketDiscovery } from '../src/executive/workforce-market-discovery.js';
import {
  OpportunityObjectives,
  OpportunityPortfolios
} from '../src/executive/opportunity-engine-contracts.js';

const PERPLEXITY_API_KEY = String(process.env.PERPLEXITY_API_KEY ?? '').trim();
const PERPLEXITY_MODEL = String(process.env.PERPLEXITY_RESEARCH_MODEL ?? 'sonar-pro').trim();
const PERPLEXITY_BASE_URL = String(process.env.PERPLEXITY_BASE_URL ?? 'https://api.perplexity.ai').replace(/\/+$/, '');
const WORKFORCE_REGISTRY_PATH = '/root/atlas/registry/workforce-registry.json';

const CEO_OBJECTIVE = 'Generate reliable cash flow as quickly as possible while strengthening Atlas itself.';

function assertConfigured() {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('Missing PERPLEXITY_API_KEY. Cannot run fresh external opportunity research mission.');
  }
}

function extractJsonBlock(text) {
  const markdownMatch = String(text ?? '').match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = markdownMatch ? markdownMatch[1] : String(text ?? '').trim();
  return JSON.parse(candidate);
}

async function callPerplexity({ system, user, temperature = 0.2 }) {
  const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = String(body?.error?.message ?? `Perplexity request failed: HTTP ${response.status}`);
    throw new Error(message);
  }

  return {
    text: String(body?.choices?.[0]?.message?.content ?? '').trim(),
    citations: Array.isArray(body?.citations) ? body.citations : [],
    usage: body?.usage ?? null,
    raw: body
  };
}

function normalizeScore(value) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return 0;
  return Number(Math.max(0, Math.min(10, numeric)).toFixed(2));
}

function normalizePercent(value) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return 0;
  return Number(Math.max(0, Math.min(100, numeric)).toFixed(1));
}

function normalizeString(value, fallback) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function normalizeStringArray(values, fallback = []) {
  if (!Array.isArray(values)) return fallback;
  const normalized = values
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function toOpportunity(item, index) {
  return {
    opportunityId: normalizeString(item?.opportunityId, `OPP-${String(index + 1).padStart(3, '0')}`),
    businessDescription: normalizeString(item?.businessDescription, 'Opportunity description pending.'),
    targetCustomer: normalizeString(item?.targetCustomer, 'Target customer pending.'),
    revenueModel: normalizeString(item?.revenueModel, 'Revenue model pending.'),
    whyAtlasRecommendsIt: normalizeString(item?.whyAtlasRecommendsIt, 'Awaiting external strategic rationale.'),
    requiredSpecialists: normalizeStringArray(item?.requiredSpecialists, ['External research specialist']),
    automationPercentage: normalizePercent(item?.automationPercentage),
    estimatedStartupCost: normalizeString(item?.startupCost, 'UNKNOWN'),
    estimatedTimeToLaunch: normalizeString(item?.estimatedTimeToLaunch, 'UNKNOWN'),
    estimatedTimeToFirstRevenue: normalizeString(item?.estimatedTimeToFirstRevenue, 'UNKNOWN'),
    risks: normalizeStringArray(item?.keyRisks, ['Risk analysis pending.']),
    confidence: normalizeString(item?.confidence, 'MEDIUM'),
    demandAnalysis: normalizeString(item?.demandAnalysis, 'Demand analysis pending.'),
    competitionAnalysis: normalizeString(item?.competitiveAnalysis, 'Competition analysis pending.'),
    strategicValue: normalizeString(item?.atlasStrategicValueNarrative, 'Strategic value narrative pending.'),
    assessments: {
      probabilityOfSuccess: normalizeScore(item?.scores?.probabilityOfSuccess),
      timeToFirstRevenueScore: normalizeScore(item?.scores?.timeToFirstRevenueScore),
      startupCostScore: normalizeScore(item?.scores?.startupCostScore),
      automationPotential: normalizeScore(item?.scores?.automationPotential),
      scalability: normalizeScore(item?.scores?.scalability),
      competitionScore: normalizeScore(item?.scores?.competitionScore),
      requiredAISpecialistsScore: normalizeScore(item?.scores?.requiredAISpecialistsScore),
      atlasStrategicValue: normalizeScore(item?.scores?.atlasStrategicValue),
      longTermPotential: normalizeScore(item?.scores?.longTermPotential)
    }
  };
}

function toMarkdown({ missionResult, recommendation, thirtyDayPlan }) {
  const top10 = missionResult.rankedRecommendations;

  const tableRows = top10
    .map(item => {
      return `| ${item.rank} | ${item.businessDescription} | ${item.targetCustomer} | ${item.revenueModel} | ${item.estimatedStartupCost} | ${item.estimatedTimeToLaunch} | ${item.estimatedTimeToFirstRevenue} | ${item.automationPercentage}% | ${item.scorecard.overallExecutiveScore} | ${item.executiveRecommendation} |`;
    })
    .join('\n');

  const detailBlocks = top10
    .map(item => {
      const specialists = item.requiredSpecialists.join(', ');
      const risks = item.risks.join('; ');
      return [
        `### #${item.rank} ${item.businessDescription}`,
        `- Target customer: ${item.targetCustomer}`,
        `- Revenue model: ${item.revenueModel}`,
        `- Startup cost: ${item.estimatedStartupCost}`,
        `- Estimated time to launch: ${item.estimatedTimeToLaunch}`,
        `- Estimated time to first revenue: ${item.estimatedTimeToFirstRevenue}`,
        `- Required AI specialists: ${specialists}`,
        `- Automation percentage: ${item.automationPercentage}%`,
        `- Key risks: ${risks}`,
        `- Confidence: ${item.confidence}`,
        `- Executive recommendation: ${item.executiveRecommendation}`,
        `- Why this ranked: ${item.whyAtlasRecommendsIt}`,
        ''
      ].join('\n');
    })
    .join('\n');

  const citations = missionResult.researchCitations.length > 0
    ? missionResult.researchCitations.map(url => `- ${url}`).join('\n')
    : '- No citations returned by external provider.';

  return [
    '# Atlas Executive Mission: Opportunity Discovery Decision',
    '',
    `CEO Objective: ${CEO_OBJECTIVE}`,
    `Evaluated At: ${missionResult.evaluatedAt}`,
    `Portfolio: ${missionResult.portfolio}`,
    '',
    '## Top 10 Ranked Opportunities',
    '',
    '| Rank | Business | Target Customer | Revenue Model | Startup Cost | Time to Launch | Time to First Revenue | Automation | Executive Score | Recommendation |',
    '|---:|---|---|---|---|---|---|---:|---:|---|',
    tableRows,
    '',
    '## Opportunity Details',
    '',
    detailBlocks,
    '## Final Executive Recommendation: First Proof-of-Concept Company',
    '',
    `Recommended POC: ${recommendation.businessDescription}`,
    '',
    `Why selected: ${recommendation.selectionWhy}`,
    '',
    `Why it outranked the other nine: ${recommendation.outrankWhy}`,
    '',
    `Long-term Atlas strategy fit: ${recommendation.strategyFit}`,
    '',
    '### First 30 Days',
    '',
    ...thirtyDayPlan,
    '',
    '## External Research Citations',
    '',
    citations,
    ''
  ].join('\n');
}

async function buildWorkforceDependency(topRecommendation, workforceRegistryService) {
  const roles = normalizeStringArray(topRecommendation?.requiredSpecialists, []);
  const decisions = [];

  for (const role of roles) {
    const decision = await workforceRegistryService.hireForCategory(role);
    decisions.push({
      role,
      decision
    });
  }

  return {
    requiredRoleCount: roles.length,
    championCoveredRoles: decisions.filter(item => item.decision?.decision === 'CHAMPION_SELECTED').length,
    marketDiscoveryRequiredRoles: decisions.filter(item => item.decision?.decision === 'MARKET_DISCOVERY_REQUIRED').length,
    decisions
  };
}

async function runMission() {
  assertConfigured();

  const workforceRepository = new WorkforceRepository({
    registryPath: WORKFORCE_REGISTRY_PATH
  });
  const workforceManager = new WorkforceManager({
    repository: workforceRepository,
    marketDiscovery: createPerplexityWorkforceMarketDiscovery({
      apiKey: PERPLEXITY_API_KEY,
      model: PERPLEXITY_MODEL,
      baseUrl: PERPLEXITY_BASE_URL
    })
  });
  const workforceRegistryService = new WorkforceRegistryService({
    repository: workforceRepository,
    manager: workforceManager
  });

  const discoverySpecialist = await callPerplexity({
    system: 'You are Atlas Market Discovery Specialist. Return concise, citation-grounded market opportunities. Reply with valid JSON only.',
    user: [
      'CEO objective:',
      CEO_OBJECTIVE,
      '',
      'Find 20 digital business opportunities suitable for launch in 30-90 days with low upfront capital and high automation potential.',
      'Return JSON object: { "opportunities": [ { "opportunityId", "businessDescription", "targetCustomer", "signalSummary" } ] }.',
      'Do not include markdown. JSON only.'
    ].join('\n')
  });

  const discoveryPayload = extractJsonBlock(discoverySpecialist.text);
  const discovered = Array.isArray(discoveryPayload?.opportunities) ? discoveryPayload.opportunities : [];

  const analysisSpecialist = await callPerplexity({
    system: 'You are Atlas Opportunity Analyst Specialist. Evaluate opportunities with objective scoring for executive investment decisions. Reply with valid JSON only.',
    user: [
      'CEO objective:',
      CEO_OBJECTIVE,
      '',
      'Input opportunities:',
      JSON.stringify(discovered, null, 2),
      '',
      'Research process requirements:',
      '1. Market discovery',
      '2. Opportunity research',
      '3. Competitive analysis',
      '4. Demand analysis',
      '5. Startup cost estimate',
      '6. Time-to-market estimate',
      '7. Automation assessment',
      '8. AI specialist requirements',
      '9. Risk assessment',
      '10. Atlas strategic value',
      '',
      'Return JSON object with key "opportunities". Provide at least 12 opportunities with fields:',
      '- opportunityId',
      '- businessDescription',
      '- targetCustomer',
      '- revenueModel',
      '- startupCost',
      '- estimatedTimeToLaunch',
      '- estimatedTimeToFirstRevenue',
      '- requiredSpecialists (array)',
      '- automationPercentage (0-100)',
      '- keyRisks (array)',
      '- confidence',
      '- whyAtlasRecommendsIt',
      '- demandAnalysis',
      '- competitiveAnalysis',
      '- atlasStrategicValueNarrative',
      '- scores: { probabilityOfSuccess, timeToFirstRevenueScore, startupCostScore, automationPotential, scalability, competitionScore, requiredAISpecialistsScore, atlasStrategicValue, longTermPotential } all 0-10',
      '',
      'Scoring bias: heavily favor 30-90 day revenue, low upfront cost, high automation, reusable Atlas capabilities, and enterprise scale-up potential.',
      'Do not include markdown. JSON only.'
    ].join('\n')
  });

  const analysisPayload = extractJsonBlock(analysisSpecialist.text);
  const analyzed = Array.isArray(analysisPayload?.opportunities) ? analysisPayload.opportunities : [];

  const riskSpecialist = await callPerplexity({
    system: 'You are Atlas Risk and Strategic Value Specialist. Refine risk and strategic value assumptions. Reply with valid JSON only.',
    user: [
      'Refine the following opportunities by stress-testing risk and strategic value assumptions.',
      'Keep IDs stable and return same shape under key "opportunities".',
      JSON.stringify(analyzed, null, 2),
      '',
      'Ensure recommendations remain realistic for 30-90 day early revenue horizon and low capital constraints.',
      'Do not include markdown. JSON only.'
    ].join('\n')
  });

  const refinedPayload = extractJsonBlock(riskSpecialist.text);
  const refined = Array.isArray(refinedPayload?.opportunities) ? refinedPayload.opportunities : [];

  const candidateOpportunities = refined.map(toOpportunity);

  if (candidateOpportunities.length === 0) {
    throw new Error('External specialists returned no opportunities to evaluate.');
  }

  const objectiveWeights = {
    [OpportunityObjectives.CASH_FLOW_QUICKLY]: 1.6,
    [OpportunityObjectives.LOW_STARTUP_COST]: 1.35,
    [OpportunityObjectives.HIGH_AUTOMATION_POTENTIAL]: 1.3,
    [OpportunityObjectives.BUILD_STRATEGIC_ASSETS]: 1.25,
    [OpportunityObjectives.HIGH_PROBABILITY_OF_SUCCESS]: 1.25,
    [OpportunityObjectives.HIGH_SCALABILITY]: 1.15,
    [OpportunityObjectives.LOW_OPERATIONAL_COMPLEXITY]: 1.1,
    [OpportunityObjectives.LONG_TERM_ENTERPRISE_VALUE]: 1.1
  };

  const engine = new OpportunityEngine({ objectiveWeights });

  const missionResult = await engine.evaluate({
    ceoObjective: CEO_OBJECTIVE,
    portfolio: OpportunityPortfolios.CASH_FLOW,
    discoveryContext: { candidateOpportunities }
  });

  missionResult.researchCitations = Array.from(new Set([
    ...discoverySpecialist.citations,
    ...analysisSpecialist.citations,
    ...riskSpecialist.citations
  ])).slice(0, 30);

  const top = missionResult.rankedRecommendations[0];
  const workforceDependency = await buildWorkforceDependency(top, workforceRegistryService);

  const recommendationSpecialist = await callPerplexity({
    system: 'You are Atlas Executive Recommendation Specialist. Return concise strategic justification and a 30-day plan as JSON only.',
    user: [
      'Top opportunity selected by Opportunity Engine:',
      JSON.stringify(top, null, 2),
      '',
      'Return JSON with keys:',
      '- selectionWhy',
      '- outrankWhy',
      '- strategyFit',
      '- first30Days (array of 4 weekly bullets, each beginning with Week 1..Week 4)',
      'Do not include markdown. JSON only.'
    ].join('\n')
  });

  const recommendationPayload = extractJsonBlock(recommendationSpecialist.text);

  const recommendation = {
    businessDescription: top.businessDescription,
    selectionWhy: normalizeString(recommendationPayload?.selectionWhy, 'Selected for fastest cash-flow path with high automation and strategic reuse value.'),
    outrankWhy: normalizeString(recommendationPayload?.outrankWhy, 'It provided the strongest combined score on time-to-revenue, startup efficiency, and execution probability.'),
    strategyFit: normalizeString(recommendationPayload?.strategyFit, 'Creates reusable operating systems and specialist playbooks that compound into future Atlas businesses.')
  };

  const thirtyDayPlan = normalizeStringArray(
    recommendationPayload?.first30Days,
    [
      'Week 1: Validate offer, define ICP, and secure first pilot conversations.',
      'Week 2: Build minimum automation stack and outbound acquisition workflow.',
      'Week 3: Launch pilot delivery, instrument KPIs, and tune messaging based on conversion.',
      'Week 4: Convert pilot to paid retainers, document SOPs, and prepare scaling backlog.'
    ]
  );

  const output = {
    mission: {
      name: 'ATLAS_EXECUTIVE_MISSION_OPPORTUNITY_DISCOVERY_001',
      objective: CEO_OBJECTIVE,
      evaluatedAt: missionResult.evaluatedAt,
      portfolio: missionResult.portfolio
    },
    externalSpecialists: {
      provider: 'perplexity',
      model: PERPLEXITY_MODEL,
      stages: {
        marketDiscovery: {
          opportunityCount: discovered.length,
          citations: discoverySpecialist.citations,
          usage: discoverySpecialist.usage
        },
        opportunityAnalysis: {
          opportunityCount: analyzed.length,
          citations: analysisSpecialist.citations,
          usage: analysisSpecialist.usage
        },
        riskAndStrategicReview: {
          opportunityCount: refined.length,
          citations: riskSpecialist.citations,
          usage: riskSpecialist.usage
        },
        executiveRecommendation: {
          citations: recommendationSpecialist.citations,
          usage: recommendationSpecialist.usage
        }
      }
    },
    top10: missionResult.rankedRecommendations,
    finalRecommendation: {
      ...recommendation,
      first30Days: thirtyDayPlan,
      workforceHiringDependency: workforceDependency
    }
  };

  mkdirSync('/root/atlas/review', { recursive: true });

  writeFileSync('/root/atlas/review/atlas-opportunity-executive-mission-result.json', `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(
    '/root/atlas/review/atlas-opportunity-executive-mission-report.md',
    `${toMarkdown({ missionResult, recommendation, thirtyDayPlan })}\n`
  );

  console.log(`MISSION_OBJECTIVE=${CEO_OBJECTIVE}`);
  console.log(`TOP_OPPORTUNITY=${top.businessDescription}`);
  console.log(`TOP_SCORE=${top.scorecard.overallExecutiveScore}`);
  console.log('WROTE=/root/atlas/review/atlas-opportunity-executive-mission-result.json');
  console.log('WROTE=/root/atlas/review/atlas-opportunity-executive-mission-report.md');
}

runMission().catch(error => {
  console.error(`MISSION_FAILED=${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
