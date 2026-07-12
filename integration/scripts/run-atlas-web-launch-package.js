import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { BusinessLaunchFramework } from '../src/executive/business-launch-framework.js';
import { WorkforceRepository } from '../../registry/src/workforce-repository.js';
import { WorkforceManager } from '../../registry/src/workforce-manager.js';
import { WorkforceRegistryService } from '../../registry/src/workforce-registry-service.js';
import { createPerplexityWorkforceMarketDiscovery } from '../src/executive/workforce-market-discovery.js';

const PERPLEXITY_API_KEY = String(process.env.PERPLEXITY_API_KEY ?? '').trim();
const PERPLEXITY_MODEL = String(process.env.PERPLEXITY_RESEARCH_MODEL ?? 'sonar-pro').trim();
const PERPLEXITY_BASE_URL = String(process.env.PERPLEXITY_BASE_URL ?? 'https://api.perplexity.ai').replace(/\/+$/, '');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalizeRole(member = {}) {
  return String(member.role ?? member.specialty ?? '').toLowerCase();
}

function findOpportunity(top10 = []) {
  const list = Array.isArray(top10) ? top10 : [];
  const ranked = [...list].sort((a, b) => Number(a.rank ?? 999) - Number(b.rank ?? 999));

  const directLanding = ranked.find(item => {
    const text = String(item.businessDescription ?? '').toLowerCase();
    return text.includes('landing page') || text.includes('website') || text.includes('web site');
  });

  const webAgencyAdjacent = ranked.find(item =>
    /automation micro|agency/i.test(String(item.businessDescription ?? ''))
  );

  return directLanding ?? webAgencyAdjacent ?? ranked[0] ?? null;
}

function buildAvailableWorkforce(workforceRegistry = {}, specialistRegistry = {}) {
  const workforceSpecialists = Array.isArray(workforceRegistry?.specialists)
    ? workforceRegistry.specialists
    : [];

  const mappedWorkforce = workforceSpecialists.map((member, index) => ({
    workerId: member.workerId ?? member.id ?? `WF-${String(index + 1).padStart(3, '0')}`,
    name: member.name ?? member.displayName ?? 'Unnamed specialist',
    role: member.role ?? member.specialty ?? 'General Specialist',
    standingScore: Number(member.standingScore ?? member.score ?? 0)
  }));

  const documentaryChampion = specialistRegistry?.categories?.['documentary-writing']?.currentChampion ?? null;

  if (documentaryChampion) {
    mappedWorkforce.push({
      workerId: `BENCH-${String(documentaryChampion.providerId ?? 'provider').toUpperCase()}`,
      name: `${documentaryChampion.providerId ?? 'provider'} (${documentaryChampion.modelId ?? 'model'})`,
      role: 'Content Strategy Specialist',
      standingScore: Number(documentaryChampion.overallExecutiveProducerScore ?? 0)
    });
  }

  return mappedWorkforce;
}

function buildApprovedRecommendation({ opportunity }) {
  const description = String(opportunity?.businessDescription ?? '').trim();

  return {
    businessName: 'Atlas Web',
    businessDescription: description.length > 0
      ? description
      : 'Atlas Web is an AI Website and Landing Page Agency operated by Atlas Executive OS.',
    businessMission: 'Launch Atlas Web as Atlas\'s first revenue-generating proof-of-concept company while preserving constitutional specialist-orchestration governance.',
    targetCustomer: opportunity?.targetCustomer
      ?? 'SMBs and professional service businesses needing conversion-optimized websites and landing pages.',
    valueProposition: 'Ship high-conversion websites and landing pages with AI-assisted speed, measurable revenue impact, and executive-governed quality control.',
    revenueModel: opportunity?.revenueModel
      ?? 'Fixed-fee website/landing-page builds plus recurring optimization retainers.',
    pricingStrategy: 'Tiered package pricing with value-based upsells and guarded discount policy.',
    opportunityEvidence: {
      opportunityId: opportunity?.opportunityId ?? null,
      rank: opportunity?.rank ?? null,
      executiveScore: opportunity?.scorecard?.overallExecutiveScore ?? null,
      recommendation: opportunity?.executiveRecommendation ?? null,
      whyRecommended: opportunity?.whyAtlasRecommendsIt ?? null,
      startupCostEstimate: opportunity?.estimatedStartupCost ?? null,
      timeToLaunchEstimate: opportunity?.estimatedTimeToLaunch ?? null,
      timeToFirstRevenueEstimate: opportunity?.estimatedTimeToFirstRevenue ?? null
    }
  };
}

async function enhanceRequiredAISpecialists(launchPackage = {}, { workforceRegistryService } = {}) {

  const assignments = Array.isArray(launchPackage?.requiredAISpecialists?.assignments)
    ? launchPackage.requiredAISpecialists.assignments
    : [];

  const roleOverrides = {
    'Market Research Specialist': 'Market Research Specialist',
    'Offer Strategy Specialist': 'Offer Strategy Specialist',
    'Automation Architect': 'Automation Architect',
    'Growth Marketing Specialist': 'Growth Marketing Specialist',
    'Sales Systems Specialist': 'Sales Systems Specialist',
    'Analytics Specialist': 'Analytics Specialist'
  };

  const revisedAssignments = await Promise.all(assignments.map(async item => {
    const requestedRole = roleOverrides[item.role] ?? item.role;
    const hiringDecision = await workforceRegistryService.hireForCategory(requestedRole);

    if (hiringDecision.decision === 'CHAMPION_SELECTED') {
      return {
        ...item,
        assignmentStatus: 'ASSIGNED',
        workerId: hiringDecision.selectedSpecialistId,
        workerName: hiringDecision.selectedSpecialist?.company ?? 'Assigned specialist',
        standingScore: Number(hiringDecision.selectedSpecialist?.benchmarkScore ?? 0),
        source: 'WORKFORCE_REGISTRY_CHAMPION',
        hiringDecision
      };
    }

    return {
      ...item,
      assignmentStatus: 'BENCHMARK_REQUIRED',
      source: 'MARKET_DISCOVERY_REQUIRED',
      hiringDecisionRequired: true,
      benchmarkReference: {
        benchmarkType: 'specialist-benchmarking',
        benchmarkId: null,
        recommendation: 'PENDING_CEO_APPROVAL_FOR_BENCHMARK',
        championProvider: hiringDecision?.topBenchmarkCandidates?.[0]?.provider ?? null
      },
      hiringDecision
    };
  }));

  const benchmarkRequiredCount = revisedAssignments.filter(item => item.assignmentStatus === 'BENCHMARK_REQUIRED').length;
  const benchmarkSignals = {
    benchmarkId: null,
    activeProviderCount: revisedAssignments.length,
    unavailableProviderCount: benchmarkRequiredCount,
    recommendation: benchmarkRequiredCount > 0
      ? 'RUN_BENCHMARKS_AFTER_CEO_APPROVAL'
      : 'USE_ACTIVE_CHAMPIONS',
    championProvider: benchmarkRequiredCount === 0
      ? revisedAssignments[0]?.workerName ?? null
      : null
  };

  return {
    ...launchPackage.requiredAISpecialists,
    assignments: revisedAssignments,
    benchmarkSignals,
    executiveHiringPolicy: 'Any unfilled specialist role must complete benchmark and CEO hiring decision before entering Asset Creation.'
  };
}

async function applyMissionOverrides(frameworkResult, { opportunity, workforceRegistryService }) {
  const launchPackage = { ...frameworkResult.launchPackage };

  launchPackage.executiveSummary = {
    ...launchPackage.executiveSummary,
    missionType: 'FIRST_OFFICIAL_BUSINESS_LAUNCH_MISSION',
    ceoDecision: 'APPROVED_BUSINESS_ATLAS_WEB',
    pipelineStopPoint: 'STOPPED_BEFORE_ASSET_CREATION',
    constitutionalCompliance: [
      'Article III: Specialist-first hiring logic used.',
      'Article VI: Benchmark evidence referenced in specialist decisions.',
      'Article X: CEO retains final approval authority.'
    ]
  };

  launchPackage.businessMission = 'Launch Atlas Web as Atlas\'s first revenue-generating proof-of-concept company, proving specialist-orchestrated business execution under CEO governance.';

  launchPackage.targetCustomer = opportunity?.targetCustomer
    ?? launchPackage.targetCustomer;

  launchPackage.valueProposition = 'Atlas Web delivers conversion-focused websites and landing pages faster through AI specialist orchestration, with executive quality gates and measurable revenue outcomes.';

  launchPackage.revenueModel = opportunity?.revenueModel
    ?? 'Fixed-fee web/landing page builds, optional recurring CRO and maintenance retainers.';

  launchPackage.pricingStrategy = {
    ...launchPackage.pricingStrategy,
    packaging: [
      'Starter Landing Page Sprint',
      'Growth Website + Funnel Build',
      'Performance Optimization Retainer'
    ],
    guardrails: [
      'No discount beyond 15% without CEO approval.',
      'Retainer pricing reviewed every 30 days based on delivery margin.'
    ]
  };

  launchPackage.requiredAISpecialists = await enhanceRequiredAISpecialists(launchPackage, {
    workforceRegistryService
  });

  launchPackage.requiredHumanDecisions = [
    ...launchPackage.requiredHumanDecisions,
    'CEO decision: authorize transition from Workforce Assignment to Asset Creation.',
    'CEO decision: approve benchmark execution for market-discovered candidates when no active champion exists.',
    'CEO decision: approve temporary external specialist contracting for any unfilled critical role.'
  ];

  launchPackage.websiteRequirements = {
    ...launchPackage.websiteRequirements,
    businessTypeConstraint: 'Do not build production website yet. Requirements only in this package.',
    requiredOutcomes: [
      'Demonstrate clear offer hierarchy and proof sections.',
      'Capture and route qualified leads into sales workflow.',
      'Instrument conversion events from first session.'
    ]
  };

  launchPackage.kpiDashboard = {
    ...launchPackage.kpiDashboard,
    launchMissionKpis: [
      'Qualified calls booked per week',
      'Lead-to-proposal conversion',
      'Proposal win rate',
      'Average project margin',
      'Time to first customer payment'
    ],
    currentStatus: 'PRE_ASSET_CREATION'
  };

  launchPackage.executiveRiskAssessment = {
    ...launchPackage.executiveRiskAssessment,
    missionSpecificRisks: [
      {
        category: 'Workforce Gap Risk',
        signal: 'Workforce Registry may not contain active champions for all required launch roles.',
        mitigation: 'Automatically perform external market discovery and complete CEO-approved benchmark before final hiring decisions.'
      },
      {
        category: 'Execution Prematurity Risk',
        signal: 'Attempting asset creation before CEO package approval.',
        mitigation: 'Hard stop at pipeline stage WORKFORCE_ASSIGNMENT until CEO approval is recorded.'
      }
    ]
  };

  launchPackage.artifactRegister = (frameworkResult.requiredArtifacts ?? []).map(item => {
    const stage = String(item.stage ?? 'UNKNOWN');

    if (stage === 'LAUNCH_PLANNING' || stage === 'WORKFORCE_ASSIGNMENT') {
      return {
        ...item,
        status: 'COMPLETED'
      };
    }

    if (stage === 'ASSET_CREATION') {
      return {
        ...item,
        status: 'BLOCKED_PENDING_CEO_APPROVAL_AND_ASSET_CREATION_GATE'
      };
    }

    return {
      ...item,
      status: 'PENDING_NEXT_PIPELINE_STAGES'
    };
  });

  return launchPackage;
}

function createMissionPipelineStatus(pipeline = []) {
  return pipeline.map(stage => {
    if (stage.stage === 'APPROVED_BUSINESS' || stage.stage === 'LAUNCH_PLANNING' || stage.stage === 'WORKFORCE_ASSIGNMENT') {
      return { ...stage, status: 'COMPLETED_OR_READY' };
    }

    if (stage.stage === 'ASSET_CREATION') {
      return { ...stage, status: 'STOPPED_BY_CEO_GATE' };
    }

    return { ...stage, status: 'NOT_STARTED' };
  });
}

async function main() {
  const opportunityMission = readJson('/root/atlas/review/atlas-opportunity-executive-mission-result.json');
  const workforceRegistry = readJson('/root/atlas/registry/workforce-registry.json');
  const specialistRegistry = readJson('/root/atlas/registry/specialist-registry.json');

  const workforceRepository = new WorkforceRepository({
    registryPath: '/root/atlas/registry/workforce-registry.json'
  });
  const workforceMarketDiscovery = createPerplexityWorkforceMarketDiscovery({
    apiKey: PERPLEXITY_API_KEY,
    model: PERPLEXITY_MODEL,
    baseUrl: PERPLEXITY_BASE_URL
  });
  const workforceManager = new WorkforceManager({
    repository: workforceRepository,
    marketDiscovery: workforceMarketDiscovery
  });
  const workforceRegistryService = new WorkforceRegistryService({
    repository: workforceRepository,
    manager: workforceManager
  });

  const selectedOpportunity = findOpportunity(opportunityMission?.top10 ?? []);

  const framework = new BusinessLaunchFramework();
  const frameworkResult = framework.generate({
    approvedBusinessRecommendation: buildApprovedRecommendation({ opportunity: selectedOpportunity }),
    ceoObjectives: [
      'Launch Atlas\'s first revenue-generating company.',
      'Generate reliable cash flow quickly with strong execution governance.',
      'Use specialist orchestration and benchmark evidence before production spending.'
    ],
    availableWorkforce: buildAvailableWorkforce(workforceRegistry, specialistRegistry),
    availableBudget: {
      allocatedBudget: 25000,
      maxBudget: 60000,
      budgetStatus: 'CEO_REVIEW_REQUIRED'
    },
    currentAtlasAssets: [
      'Opportunity Engine',
      'Business Launch Framework',
      'Workforce Registry',
      'Specialist Benchmark Registry',
      'Executive Review Governance'
    ]
  });

  const launchPackage = await applyMissionOverrides(frameworkResult, {
    opportunity: selectedOpportunity,
    workforceRegistryService
  });

  const output = {
    packageName: 'Business Launch Package',
    business: 'Atlas Web',
    missionStatus: 'COMPLETED_STOPPED_BEFORE_ASSET_CREATION',
    pipelineStatus: createMissionPipelineStatus(frameworkResult.pipeline),
    launchPackage
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/atlas-web-business-launch-package.json', `${JSON.stringify(output, null, 2)}\n`);

  console.log('WROTE=/root/atlas/review/atlas-web-business-launch-package.json');
  console.log(`SELECTED_OPPORTUNITY=${selectedOpportunity?.opportunityId ?? 'NONE'}`);
  console.log('PIPELINE_STOP=ASSET_CREATION');
}

main().catch(error => {
  console.error(`MISSION_FAILED=${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
