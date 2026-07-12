import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { WorkforceRepository } from '../../registry/src/workforce-repository.js';
import { WorkforceManager } from '../../registry/src/workforce-manager.js';
import { WorkforceRegistryService } from '../../registry/src/workforce-registry-service.js';
import { createPerplexityWorkforceMarketDiscovery } from '../src/executive/workforce-market-discovery.js';

const PERPLEXITY_API_KEY = String(process.env.PERPLEXITY_API_KEY ?? '').trim();
const PERPLEXITY_MODEL = String(process.env.PERPLEXITY_RESEARCH_MODEL ?? 'sonar-pro').trim();
const PERPLEXITY_BASE_URL = String(process.env.PERPLEXITY_BASE_URL ?? 'https://api.perplexity.ai').replace(/\/+$/, '');

const WORKFORCE_REGISTRY_PATH = '/root/atlas/registry/workforce-registry.json';
const OUTPUT_PATH = '/root/atlas/review/mission-003-atlas-web-v1-strategy-package.json';

function parseJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function toString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, { min = null, max = null, fallback = 0 } = {}) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;

  let normalized = n;
  if (typeof min === 'number') normalized = Math.max(min, normalized);
  if (typeof max === 'number') normalized = Math.min(max, normalized);

  return Number(normalized.toFixed(2));
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

function normalizeCandidate(item = {}, index = 0) {
  return {
    rank: index + 1,
    provider: toString(item.provider, `Provider ${index + 1}`),
    product: toString(item.product, 'Unknown'),
    suitabilityScore: toNumber(item.suitabilityScore, { min: 0, max: 10, fallback: 0 }),
    conversionReadiness: toNumber(item.conversionReadiness, { min: 0, max: 10, fallback: 0 }),
    designQuality: toNumber(item.designQuality, { min: 0, max: 10, fallback: 0 }),
    speedToPrototype: toNumber(item.speedToPrototype, { min: 0, max: 10, fallback: 0 }),
    customizationControl: toNumber(item.customizationControl, { min: 0, max: 10, fallback: 0 }),
    seoAndPerformanceReadiness: toNumber(item.seoAndPerformanceReadiness, { min: 0, max: 10, fallback: 0 }),
    strengths: toArray(item.strengths).map(value => toString(value)).filter(Boolean),
    limitations: toArray(item.limitations).map(value => toString(value)).filter(Boolean),
    rationale: toString(item.rationale, 'Rationale not provided.')
  };
}

function buildMarketResearchFromHiringDecision(hiringDecision = {}) {
  const candidates = toArray(hiringDecision?.topBenchmarkCandidates)
    .map((item, index) => normalizeCandidate({
      provider: item.provider,
      product: item.capability,
      suitabilityScore: Number(item.recommendationScore ?? 0),
      conversionReadiness: Number(item.recommendationScore ?? 0),
      designQuality: Number(item.recommendationScore ?? 0),
      speedToPrototype: Number(item.recommendationScore ?? 0),
      customizationControl: Number(item.recommendationScore ?? 0),
      seoAndPerformanceReadiness: Number(item.recommendationScore ?? 0),
      strengths: item.strengths,
      limitations: item.weaknesses,
      rationale: item.overallRecommendation
    }, index));

  return {
    candidates,
    recommendedChampion: {
      provider: candidates[0]?.provider ?? 'UNKNOWN',
      product: candidates[0]?.product ?? 'UNKNOWN',
      hireRecommendation: 'RUN_BENCHMARK_AFTER_CEO_APPROVAL',
      why: hiringDecision?.marketDiscoveryReport?.overallRecommendation
        ?? 'Benchmark top discovered providers before hiring.',
      risks: [
        'No benchmark run has executed yet.',
        'Champion designation is pending benchmark outcomes and CEO decision.'
      ]
    },
    citations: toArray(hiringDecision?.marketDiscoveryReport?.evidenceSources),
    usage: null
  };
}

function buildWebsiteStrategy(selectedSpecialist) {
  return {
    strategicIntent: 'Atlas Web must project premium trust and immediate conversion confidence for service-business buyers.',
    audience: 'Owner-led local/regional businesses that need more qualified leads and booked jobs.',
    promise: 'Atlas Web designs and builds conversion-focused business websites that turn traffic into booked opportunities.',
    trustPillars: [
      'Executive process transparency',
      'Demonstration-backed quality proof',
      'Research-backed conversion decisions',
      'Clear accountability and measurable outcomes'
    ],
    specialistExecutionModel: `Website production led by ${selectedSpecialist.provider} (${selectedSpecialist.product}) under Atlas executive governance.`
  };
}

function buildInformationArchitecture() {
  return {
    primaryNavigation: ['Home', 'Our Process', 'Demonstration Projects', 'Free Website Audit', 'Contact'],
    globalCta: 'Request Your Free Website Audit',
    pagePurpose: {
      Home: 'Create immediate trust and conversion intent.',
      'Our Process': 'Show clear, executive-grade, repeatable delivery method.',
      'Demonstration Projects': 'Provide capability proof through clearly labeled Atlas demonstrations.',
      'Free Website Audit': 'Capture high-intent leads through low-friction audit request.',
      Contact: 'Offer direct trust-preserving communication and scheduling path.'
    }
  };
}

function buildPageStructure() {
  return {
    home: {
      firstScreenRequirements: [
        'What Atlas Web does stated in one sentence.',
        'Proof of quality signal block.',
        'Trust indicators and credibility markers.',
        'Single clear CTA: Request Your Free Website Audit.'
      ],
      sections: [
        'Hero: conversion-focused websites for service businesses',
        'Proof strip: demonstration metrics and quality claims',
        'Trust section: executive process and compliance language',
        'Offer section: free website audit outcomes',
        'CTA close: audit request form entry'
      ]
    },
    ourProcess: {
      sections: [
        'Step-by-step executive workflow',
        'Research-to-design decision chain',
        'Production quality gates',
        'Handoff and optimization model'
      ]
    },
    demonstrationProjects: {
      sections: [
        'Portfolio demonstrations with disclosure labels',
        'Prospect demonstration framework overview',
        'Before/after structure and audit logic',
        'Quality rationale and supporting references'
      ]
    },
    freeWebsiteAudit: {
      sections: [
        'Audit value proposition',
        'What prospect receives in 48 hours',
        'Short qualification form',
        'Privacy and no-obligation trust statement'
      ]
    },
    contact: {
      sections: [
        'Direct contact options',
        'Response time expectation',
        'Scheduling prompt with CTA continuity'
      ]
    }
  };
}

function buildVisualDirection() {
  return {
    styleIntent: 'Premium, modern, trustworthy, and focused on business outcomes.',
    typographyDirection: 'High-contrast editorial sans with strong hierarchy and short scan-friendly lines.',
    colorSystem: {
      primary: 'Deep navy and slate neutrals',
      accent: 'Controlled electric cyan for CTA emphasis',
      support: 'Warm gray backgrounds for trust sections'
    },
    uiPrinciples: [
      'High legibility over decoration',
      'Deliberate whitespace to signal confidence',
      'Proof modules above fold where possible',
      'Consistent CTA treatment across all pages'
    ],
    imageryApproach: 'Use executive-quality demonstration mockups and structured before/after frames with clear labels.'
  };
}

function buildConversionStrategy() {
  return {
    primaryCta: 'Request Your Free Website Audit',
    conversionModel: [
      'Single core CTA across site to reduce decision friction.',
      'Proof-first sequencing before any detailed process explanation.',
      'Trust markers near every major conversion decision point.',
      'Short audit form with qualifying fields tied to sales readiness.'
    ],
    measurableTargets: [
      'Hero-to-CTA click-through rate',
      'Audit form completion rate',
      'Qualified lead submission rate',
      'Booked audit call conversion rate'
    ],
    frictionControls: [
      'No multi-offer confusion on first session',
      'No dense technical jargon in conversion paths',
      'No conflicting CTA language across pages'
    ]
  };
}

function buildProductionPlan(selectedSpecialist) {
  return {
    status: 'STRATEGY_ONLY_PENDING_CEO_APPROVAL',
    phases: [
      {
        phase: 1,
        name: 'Specialist selection and governance lock',
        outcome: `Champion selected: ${selectedSpecialist.provider} (${selectedSpecialist.product}).`
      },
      {
        phase: 2,
        name: 'Strategy and architecture approval',
        outcome: 'Finalize IA, page structure, visual direction, and conversion model.'
      },
      {
        phase: 3,
        name: 'Design system and content blueprint',
        outcome: 'Produce wireframes, visual system tokens, and page-level copy outlines.'
      },
      {
        phase: 4,
        name: 'Build execution (post-approval only)',
        outcome: 'Generate production website assets using champion specialist workflow.'
      },
      {
        phase: 5,
        name: 'QA and launch readiness',
        outcome: 'Validate conversion flows, mobile fidelity, speed, and analytics instrumentation.'
      }
    ],
    stopGate: 'Do not build Atlas Web until CEO approves this strategy package.'
  };
}

function buildBenchmarkJustification({ hiringDecision, marketResearch }) {
  if (hiringDecision?.decision === 'CHAMPION_SELECTED') {
    return {
      benchmarkStatus: 'BENCHMARK_COMPLETED',
      selectionMode: 'CURRENT_CHAMPION_SELECTED',
      category: 'Website Generation',
      benchmarkEvidence: hiringDecision?.selectedSpecialist,
      why: 'Selected current active champion from Workforce Registry memory in compliance with Atlas Constitution.'
    };
  }

  return {
    benchmarkStatus: 'NO_WEBSITE_GENERATION_BENCHMARK_FOUND',
    selectionMode: 'MARKET_RESEARCH_RECOMMENDATION_PENDING_FORMAL_BENCHMARK',
    category: 'website-generation',
    benchmarkEvidence: {
      topCandidates: marketResearch.candidates,
      recommendation: marketResearch.recommendedChampion
    },
    why: 'No active champion existed in Workforce Registry, so Atlas executed external market discovery and produced top benchmark candidates pending CEO approval.'
  };
}

async function main() {
  const workforceRegistry = parseJsonFile(WORKFORCE_REGISTRY_PATH);

  const repository = new WorkforceRepository({ registryPath: WORKFORCE_REGISTRY_PATH });
  const marketDiscovery = createPerplexityWorkforceMarketDiscovery({
    apiKey: PERPLEXITY_API_KEY,
    model: PERPLEXITY_MODEL,
    baseUrl: PERPLEXITY_BASE_URL
  });
  const manager = new WorkforceManager({ repository, marketDiscovery });
  const workforceService = new WorkforceRegistryService({ repository, manager });

  const hiringDecision = await workforceService.hireForCategory('Website Generation', {
    candidateProviders: ['Lovable', 'Framer', 'Webflow', 'Wix Studio', 'Replit', 'v0']
  });

  const marketResearch = hiringDecision.decision === 'MARKET_DISCOVERY_REQUIRED'
    ? buildMarketResearchFromHiringDecision(hiringDecision)
    : null;

  const selectedSpecialist = hiringDecision.decision === 'CHAMPION_SELECTED'
    ? {
        provider: toString(hiringDecision?.selectedSpecialist?.company, 'UNKNOWN'),
        product: toString(hiringDecision?.selectedSpecialist?.model, 'UNKNOWN'),
        source: 'WORKFORCE_REGISTRY_CHAMPION'
      }
    : {
        provider: toString(marketResearch?.recommendedChampion?.provider, 'UNKNOWN'),
        product: toString(marketResearch?.recommendedChampion?.product, 'UNKNOWN'),
        source: 'MARKET_DISCOVERY_TOP_CANDIDATE_PENDING_BENCHMARK'
      };

  const benchmarkSource = hiringDecision.decision === 'CHAMPION_SELECTED'
    ? 'WORKFORCE_REGISTRY_ACTIVE_CHAMPION'
    : 'MARKET_DISCOVERY_PENDING_CEO_APPROVAL_FOR_BENCHMARK';

  const output = {
    packageName: 'Atlas Executive OS Mission 003 Strategy Package',
    missionId: 'MISSION_003_BUILD_ATLAS_WEB_V1',
    version: '1.0.0',
    constitutionalCompliance: {
      followsConstitution: true,
      rulesApplied: [
        'No hard-coded website generator selection.',
        'Workforce Registry queried before specialist selection.',
        'If no active champion exists in Workforce Registry, external market discovery is mandatory.',
        'CEO approval is required before benchmark execution and hiring decision.'
      ]
    },
    registrySnapshot: {
      workforceRegistryUpdatedAt: workforceRegistry?.meta?.updatedAt ?? null,
      workforceSpecialistCount: toArray(workforceRegistry?.specialists).length
    },
    workforceHiringDecision: hiringDecision,
    selectedWebsiteSpecialist: selectedSpecialist,
    benchmarkJustification: buildBenchmarkJustification({ hiringDecision, marketResearch }),
    websiteStrategy: buildWebsiteStrategy(selectedSpecialist),
    informationArchitecture: buildInformationArchitecture(),
    pageStructure: buildPageStructure(),
    visualDirection: buildVisualDirection(),
    conversionStrategy: buildConversionStrategy(),
    productionPlan: buildProductionPlan(selectedSpecialist),
    missionGuardrails: {
      websiteBuildExecuted: false,
      outreachExecuted: false,
      publishingExecuted: false,
      prospectContactExecuted: false,
      ceoApprovalRequiredBeforeBuild: true,
      ceoApprovalRequiredBeforeBenchmark: true,
      benchmarkExecuted: false
    },
    benchmarkSource,
    externalResearch: marketResearch
      ? {
          provider: 'perplexity',
          model: PERPLEXITY_MODEL,
          citations: marketResearch.citations,
          usage: marketResearch.usage
        }
      : null,
    generatedAt: new Date().toISOString()
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`WROTE=${OUTPUT_PATH}`);
  console.log(`SPECIALIST_PROVIDER=${output.selectedWebsiteSpecialist.provider}`);
  console.log(`SPECIALIST_PRODUCT=${output.selectedWebsiteSpecialist.product}`);
  console.log(`HIRING_DECISION=${output.workforceHiringDecision.decision}`);
  console.log(`BENCHMARK_SOURCE=${output.benchmarkSource}`);
}

main().catch(error => {
  console.error(`MISSION_FAILED=${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
