import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { WorkforceManager } from '../../registry/src/workforce-manager.js';
import { WorkforceRegistryService } from '../../registry/src/workforce-registry-service.js';
import { createPerplexityWorkforceMarketDiscovery } from '../src/executive/workforce-market-discovery.js';

const PERPLEXITY_API_KEY = String(process.env.PERPLEXITY_API_KEY ?? '').trim();
const PERPLEXITY_MODEL = String(process.env.PERPLEXITY_RESEARCH_MODEL ?? 'sonar-pro').trim();
const PERPLEXITY_BASE_URL = String(process.env.PERPLEXITY_BASE_URL ?? 'https://api.perplexity.ai').replace(/\/+$/, '');

const WORKFORCE_REGISTRY_PATH = '/root/atlas/registry/workforce-registry.json';
const OUTPUT_JSON_PATH = '/root/atlas/review/mission-006-first-external-workforce-discovery.json';
const OUTPUT_MD_PATH = '/root/atlas/review/mission-006-first-external-workforce-discovery.md';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function toNumber(value, fallback = 0, min = 0, max = 10) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  const bounded = Math.max(min, Math.min(max, n));
  return Number(bounded.toFixed(2));
}

function extractJson(text) {
  const raw = String(text ?? '').trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate);
}

async function callPerplexity({ system, user }) {
  const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      temperature: 0.1,
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
    usage: body?.usage ?? null
  };
}

function averageScores(row) {
  const keys = [
    'overallQuality',
    'visualDesignCapability',
    'conversionCapability',
    'marketingWebsiteQuality',
    'cmsCapability',
    'responsiveDesign',
    'speed',
    'aiGenerationQuality',
    'editingWorkflow',
    'enterpriseReadiness',
    'apiAvailability',
    'costEfficiency',
    'longTermViability',
    'communityAdoption'
  ];

  const values = keys.map(key => toNumber(row?.[key], 0, 0, 10));
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / keys.length).toFixed(2));
}

function normalizeMatrixRow(item = {}, index = 0) {
  const normalized = {
    rank: index + 1,
    provider: toString(item.provider, `Provider ${index + 1}`),
    company: toString(item.company, toString(item.provider, `Company ${index + 1}`)),
    overallQuality: toNumber(item.overallQuality, 0),
    visualDesignCapability: toNumber(item.visualDesignCapability, 0),
    conversionCapability: toNumber(item.conversionCapability, 0),
    marketingWebsiteQuality: toNumber(item.marketingWebsiteQuality, 0),
    cmsCapability: toNumber(item.cmsCapability, 0),
    responsiveDesign: toNumber(item.responsiveDesign, 0),
    speed: toNumber(item.speed, 0),
    aiGenerationQuality: toNumber(item.aiGenerationQuality, 0),
    editingWorkflow: toNumber(item.editingWorkflow, 0),
    enterpriseReadiness: toNumber(item.enterpriseReadiness, 0),
    apiAvailability: toNumber(item.apiAvailability, 0),
    costEfficiency: toNumber(item.costEfficiency, 0),
    longTermViability: toNumber(item.longTermViability, 0),
    communityAdoption: toNumber(item.communityAdoption, 0),
    estimatedCostBand: toString(item.estimatedCostBand, 'UNKNOWN'),
    strengths: toArray(item.strengths).map(value => toString(value)).filter(Boolean),
    weaknesses: toArray(item.weaknesses).map(value => toString(value)).filter(Boolean),
    evidenceSources: toArray(item.evidenceSources).map(value => toString(value)).filter(Boolean)
  };

  return {
    ...normalized,
    weightedScore: averageScores(normalized)
  };
}

function buildFallbackMatrix(topCandidates = []) {
  return topCandidates.map((item, index) => {
    const inferred = toNumber(item.recommendationScore, 6, 0, 10);

    return normalizeMatrixRow({
      provider: item.provider,
      company: item.company,
      overallQuality: inferred,
      visualDesignCapability: inferred,
      conversionCapability: inferred,
      marketingWebsiteQuality: inferred,
      cmsCapability: inferred,
      responsiveDesign: inferred,
      speed: inferred,
      aiGenerationQuality: inferred,
      editingWorkflow: inferred,
      enterpriseReadiness: inferred,
      apiAvailability: inferred,
      costEfficiency: inferred,
      longTermViability: inferred,
      communityAdoption: inferred,
      estimatedCostBand: item.pricing,
      strengths: item.strengths,
      weaknesses: item.weaknesses,
      evidenceSources: item.evidenceSources
    }, index);
  });
}

async function buildComparisonMatrix({ topFiveCandidates }) {
  if (!PERPLEXITY_API_KEY) {
    return {
      matrix: buildFallbackMatrix(topFiveCandidates),
      citations: [],
      usage: null,
      note: 'PERPLEXITY_API_KEY missing. Matrix scores inferred from discovery recommendation scores.'
    };
  }

  const providerList = topFiveCandidates
    .map(item => `${item.provider} (${item.company})`)
    .join(', ');

  const prompt = [
    'Build a strict JSON-only comparison matrix for these website-generation leaders:',
    providerList,
    '',
    'Return JSON with this shape:',
    '{',
    '  "matrix": [',
    '    {',
    '      "provider": "",',
    '      "company": "",',
    '      "overallQuality": 0,',
    '      "visualDesignCapability": 0,',
    '      "conversionCapability": 0,',
    '      "marketingWebsiteQuality": 0,',
    '      "cmsCapability": 0,',
    '      "responsiveDesign": 0,',
    '      "speed": 0,',
    '      "aiGenerationQuality": 0,',
    '      "editingWorkflow": 0,',
    '      "enterpriseReadiness": 0,',
    '      "apiAvailability": 0,',
    '      "costEfficiency": 0,',
    '      "longTermViability": 0,',
    '      "communityAdoption": 0,',
    '      "estimatedCostBand": "",',
    '      "strengths": [""],',
    '      "weaknesses": [""],',
    '      "evidenceSources": [""]',
    '    }',
    '  ]',
    '}',
    'Rules:',
    '- Keep scores between 0 and 10.',
    '- Use current market context for 2026.',
    '- Include concrete evidence sources for each provider.'
  ].join('\n');

  const response = await callPerplexity({
    system: 'You are Atlas Workforce Market Evaluation Analyst. Return strict JSON only.',
    user: prompt
  });

  const payload = extractJson(response.text);
  const matrix = toArray(payload?.matrix)
    .map((item, index) => normalizeMatrixRow(item, index))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    matrix,
    citations: response.citations ?? [],
    usage: response.usage ?? null,
    note: null
  };
}

function buildBenchmarkRecommendation(topThree = []) {
  return {
    status: 'PENDING_CEO_APPROVAL',
    benchmarkCandidates: topThree.map((item, index) => ({
      rank: index + 1,
      provider: item.provider,
      company: item.company,
      rationale: item.overallRecommendation
    })),
    selectionPolicy: 'Do not assign champion before benchmark completion and CEO approval.'
  };
}

function estimateBenchmark(topThree = []) {
  const defaultCostPerProvider = 1500;
  const totalCost = defaultCostPerProvider * topThree.length;

  return {
    assumptions: [
      'Benchmark run includes one production-grade marketing website test build per provider.',
      'Includes setup, QA review, performance measurement, and executive scoring.',
      'No procurement commitments are made before CEO approval.'
    ],
    estimatedBenchmarkCostUsd: {
      perProvider: defaultCostPerProvider,
      providerCount: topThree.length,
      total: totalCost
    },
    estimatedBenchmarkTime: {
      perProviderBusinessDays: 3,
      totalBusinessDays: topThree.length * 3,
      totalCalendarWeeks: Number(((topThree.length * 3) / 5).toFixed(1))
    }
  };
}

function buildMarkdownReport(payload) {
  const matrixRows = payload.candidateComparisonMatrix.matrix
    .map(item => [
      item.rank,
      item.provider,
      item.overallQuality,
      item.visualDesignCapability,
      item.conversionCapability,
      item.cmsCapability,
      item.enterpriseReadiness,
      item.apiAvailability,
      item.costEfficiency,
      item.communityAdoption,
      item.weightedScore
    ].join(' | '))
    .join('\n');

  const benchmarkRows = payload.benchmarkRecommendation.benchmarkCandidates
    .map(item => `- #${item.rank} ${item.provider} (${item.company}): ${item.rationale}`)
    .join('\n');

  return [
    '# Mission 006: First External Workforce Discovery',
    '',
    '## Mission Status',
    `- Decision: ${payload.workflowExecution.hiringDecision}`,
    `- Champion Selected: ${payload.workflowExecution.championSelected}`,
    `- Benchmark Executed: ${payload.workflowExecution.benchmarkExecuted}`,
    `- CEO Approval Required Before Benchmark: ${payload.workflowExecution.ceoApprovalRequiredBeforeBenchmark}`,
    '',
    '## Market Discovery Report',
    `- Category: ${payload.marketDiscoveryReport.category}`,
    `- Generated At: ${payload.marketDiscoveryReport.generatedAt}`,
    `- Overall Recommendation: ${payload.marketDiscoveryReport.overallRecommendation}`,
    `- Top 5 Candidate Count: ${payload.marketDiscoveryReport.topFiveCandidates.length}`,
    '',
    '## Candidate Comparison Matrix (Top 5)',
    '| Rank | Provider | Overall | Visual | Conversion | CMS | Enterprise | API | Cost | Community | Weighted |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    matrixRows,
    '',
    '## Benchmark Recommendation (Top 3)',
    benchmarkRows,
    '',
    '## Estimated Benchmark Cost',
    `- Per Provider (USD): ${payload.estimatedBenchmarkCost.estimatedBenchmarkCostUsd.perProvider}`,
    `- Provider Count: ${payload.estimatedBenchmarkCost.estimatedBenchmarkCostUsd.providerCount}`,
    `- Total Estimated Cost (USD): ${payload.estimatedBenchmarkCost.estimatedBenchmarkCostUsd.total}`,
    '',
    '## Estimated Benchmark Time',
    `- Per Provider (Business Days): ${payload.estimatedBenchmarkTime.estimatedBenchmarkTime.perProviderBusinessDays}`,
    `- Total (Business Days): ${payload.estimatedBenchmarkTime.estimatedBenchmarkTime.totalBusinessDays}`,
    `- Total (Calendar Weeks): ${payload.estimatedBenchmarkTime.estimatedBenchmarkTime.totalCalendarWeeks}`,
    '',
    '## CEO Recommendation',
    `- ${payload.ceoRecommendation}`,
    ''
  ].join('\n');
}

class ReadOnlyWorkforceRepository {
  constructor(snapshot) {
    this.snapshot = snapshot;
  }

  load() {
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  save(snapshot) {
    this.snapshot = JSON.parse(JSON.stringify(snapshot));
    return this.load();
  }
}

async function run() {
  const snapshot = JSON.parse(readFileSync(WORKFORCE_REGISTRY_PATH, 'utf8'));
  const repository = new ReadOnlyWorkforceRepository(snapshot);

  const marketDiscovery = createPerplexityWorkforceMarketDiscovery({
    apiKey: PERPLEXITY_API_KEY,
    model: PERPLEXITY_MODEL,
    baseUrl: PERPLEXITY_BASE_URL
  });

  const manager = new WorkforceManager({ repository, marketDiscovery });
  const service = new WorkforceRegistryService({ repository, manager });

  const hiringDecision = await service.hireForCategory('Website Generation', {
    candidateProviders: [
      'Lovable',
      'Framer',
      'Webflow',
      'Wix Studio',
      'Replit',
      'v0',
      'Bubble',
      'Squarespace',
      'WordPress + Elementor',
      'Typedream'
    ]
  });

  if (hiringDecision.decision !== 'MARKET_DISCOVERY_REQUIRED') {
    throw new Error(`Mission 006 expected MARKET_DISCOVERY_REQUIRED, received ${hiringDecision.decision}`);
  }

  const providers = toArray(hiringDecision?.marketDiscoveryReport?.providers);
  if (providers.length < 5) {
    throw new Error(`Mission 006 expected at least 5 market candidates, received ${providers.length}`);
  }

  const topFiveCandidates = providers.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    provider: item.provider,
    company: item.company,
    capability: item.capability,
    strengths: item.strengths,
    weaknesses: item.weaknesses,
    typicalUseCases: item.typicalUseCases,
    pricing: item.pricing,
    apiAvailability: item.apiAvailability,
    enterpriseReadiness: item.enterpriseReadiness,
    evidenceSources: item.evidenceSources,
    overallRecommendation: item.overallRecommendation,
    recommendationScore: item.recommendationScore
  }));

  const matrixResult = await buildComparisonMatrix({ topFiveCandidates });
  const topThreeBenchmark = providers.slice(0, 3);
  const benchmarkRecommendation = buildBenchmarkRecommendation(topThreeBenchmark);
  const benchmarkEstimates = estimateBenchmark(topThreeBenchmark);

  const output = {
    missionId: 'MISSION_006_FIRST_EXTERNAL_WORKFORCE_DISCOVERY',
    generatedAt: new Date().toISOString(),
    workflowExecution: {
      workflow: 'WORKFORCE_REGISTRY_CHECK_THEN_EXTERNAL_MARKET_DISCOVERY',
      hiringDecision: hiringDecision.decision,
      championSelected: false,
      benchmarkExecuted: false,
      ceoApprovalRequiredBeforeBenchmark: true,
      registryUpdated: false
    },
    marketDiscoveryReport: {
      category: hiringDecision.marketDiscoveryReport.category,
      generatedAt: hiringDecision.marketDiscoveryReport.generatedAt,
      overallRecommendation: hiringDecision.marketDiscoveryReport.overallRecommendation,
      topFiveCandidates,
      evidenceSources: Array.from(new Set(topFiveCandidates.flatMap(item => toArray(item.evidenceSources))))
    },
    candidateComparisonMatrix: {
      matrix: matrixResult.matrix,
      matrixNote: matrixResult.note
    },
    benchmarkRecommendation,
    estimatedBenchmarkCost: benchmarkEstimates,
    estimatedBenchmarkTime: benchmarkEstimates,
    ceoRecommendation: 'Approve benchmark execution for the top 3 candidates. Do not assign a champion until benchmark results are complete and reviewed.',
    researchMetadata: {
      provider: PERPLEXITY_API_KEY ? 'perplexity' : 'none-configured',
      model: PERPLEXITY_MODEL,
      citations: matrixResult.citations,
      usage: matrixResult.usage
    }
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(OUTPUT_MD_PATH, `${buildMarkdownReport(output)}\n`);

  console.log(`WROTE=${OUTPUT_JSON_PATH}`);
  console.log(`WROTE=${OUTPUT_MD_PATH}`);
  console.log(`TOP_5_COUNT=${output.marketDiscoveryReport.topFiveCandidates.length}`);
  console.log(`TOP_3_BENCHMARK=${output.benchmarkRecommendation.benchmarkCandidates.map(item => item.provider).join(', ')}`);
  console.log(`CEO_APPROVAL_REQUIRED=${output.workflowExecution.ceoApprovalRequiredBeforeBenchmark}`);
}

run().catch(error => {
  console.error(`MISSION_FAILED=${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
