import { ExternalScreenplayGovernanceEvaluator } from '../external-writer/governance/external-screenplay-governance-evaluator.js';
import { DocumentaryWritingGovernanceScorer } from './documentary-writing-governance-scorer.js';

export class SpecialistBenchmarkFramework {
  constructor({
    category = 'documentary-writing',
    governanceEvaluator = null,
    scorer = null
  } = {}) {
    this.category = category;
    this.governanceEvaluator = governanceEvaluator ?? new ExternalScreenplayGovernanceEvaluator();
    this.scorer = scorer ?? new DocumentaryWritingGovernanceScorer();
    this.providers = new Map();
  }

  registerProvider(provider) {
    const providerId = String(provider?.identity?.() ?? '').trim();
    if (providerId.length === 0) {
      throw new Error('Benchmark provider must declare identity().');
    }

    this.providers.set(providerId, provider);
    return providerId;
  }

  listProviders() {
    return [...this.providers.keys()].sort((a, b) => a.localeCompare(b));
  }

  async run({ benchmarkId, input, evaluationContext = {} } = {}) {
    const startedAt = Date.now();
    const runAt = new Date(startedAt).toISOString();
    const providerResults = [];

    for (const providerId of this.listProviders()) {
      const provider = this.providers.get(providerId);
      const configured = Boolean(provider?.isConfigured?.());

      if (!configured) {
        providerResults.push({
          providerId,
          modelId: provider?.modelIdentity?.() ?? null,
          status: 'UNAVAILABLE',
          missingEnvironmentVariables: provider?.requiredEnvironmentVariables?.() ?? [],
          runtimeMs: null,
          cost: null,
          governance: null,
          scores: null,
          weaknesses: {
            weakCategories: [],
            editorialIssueTypes: [],
            recommendationSignals: [],
            factualStatus: 'UNKNOWN'
          },
          error: 'Provider not configured.'
        });
        continue;
      }

      const providerStart = Date.now();
      try {
        const execution = await provider.execute({ input });
        const runtimeMs = Date.now() - providerStart;
        const governance = this.governanceEvaluator.evaluate({
          screenplay: execution?.normalizedResult?.screenplay ?? '',
          researchPackage: input?.verifiedResearchPackage ?? null,
          topic: evaluationContext?.topic ?? ''
        });

        const scores = this.scorer.score({
          providerResult: {
            result: execution?.normalizedResult ?? null
          },
          governance,
          input
        });

        providerResults.push({
          providerId,
          modelId: execution?.normalizedResult?.modelIdentity ?? provider?.modelIdentity?.() ?? null,
          status: 'COMPLETED',
          runtimeMs,
          cost: this.extractCost(execution?.normalizedResult?.usage),
          governance,
          scores,
          weaknesses: scores.weaknesses,
          usage: execution?.normalizedResult?.usage ?? null,
          screenplayLength: String(execution?.normalizedResult?.screenplay ?? '').length,
          screenplay: execution?.normalizedResult?.screenplay ?? ''
        });
      } catch (error) {
        providerResults.push({
          providerId,
          modelId: provider?.modelIdentity?.() ?? null,
          status: 'FAILED',
          runtimeMs: Date.now() - providerStart,
          cost: null,
          governance: null,
          scores: null,
          weaknesses: {
            weakCategories: [],
            editorialIssueTypes: [],
            recommendationSignals: [],
            factualStatus: 'UNKNOWN'
          },
          error: String(error?.message ?? error)
        });
      }
    }

    const rankings = this.rankProviders(providerResults);
    const recommendation = this.buildRecommendation({ rankings, providerResults });

    return {
      benchmarkId: benchmarkId ?? `BENCHMARK-${Date.now()}`,
      category: this.category,
      runAt,
      completedInMs: Date.now() - startedAt,
      providerResults,
      rankings,
      executiveProducerRecommendation: recommendation
    };
  }

  rankProviders(providerResults = []) {
    return providerResults
      .filter(item => item.status === 'COMPLETED' && item.scores)
      .map(item => ({
        providerId: item.providerId,
        modelId: item.modelId,
        overallExecutiveProducerScore: Number(item.scores.overallExecutiveProducerScore ?? 0),
        goldStandardCompliance: Number(item.scores.goldStandardCompliance ?? 0),
        factualPreservation: Number(item.scores.factualPreservation ?? 0),
        runtimeMs: item.runtimeMs,
        cost: item.cost,
        weaknesses: item.weaknesses
      }))
      .sort((a, b) => {
        if (b.overallExecutiveProducerScore !== a.overallExecutiveProducerScore) {
          return b.overallExecutiveProducerScore - a.overallExecutiveProducerScore;
        }

        if (b.goldStandardCompliance !== a.goldStandardCompliance) {
          return b.goldStandardCompliance - a.goldStandardCompliance;
        }

        if (b.factualPreservation !== a.factualPreservation) {
          return b.factualPreservation - a.factualPreservation;
        }

        const costA = Number.isFinite(Number(a.cost)) ? Number(a.cost) : Number.POSITIVE_INFINITY;
        const costB = Number.isFinite(Number(b.cost)) ? Number(b.cost) : Number.POSITIVE_INFINITY;
        if (costA !== costB) {
          return costA - costB;
        }

        return Number(a.runtimeMs ?? Number.POSITIVE_INFINITY) - Number(b.runtimeMs ?? Number.POSITIVE_INFINITY);
      });
  }

  buildRecommendation({ rankings = [], providerResults = [] } = {}) {
    if (rankings.length === 0) {
      return {
        recommendation: 'NO_HIRE_RECOMMENDATION',
        rationale: 'No configured provider produced a benchmark-complete screenplay.',
        champion: null,
        runnerUp: null
      };
    }

    const champion = rankings[0];
    const runnerUp = rankings[1] ?? null;
    const unavailable = providerResults.filter(item => item.status !== 'COMPLETED').map(item => item.providerId);

    return {
      recommendation: 'HIRE_CURRENT_CHAMPION',
      rationale: `Champion selected by benchmark score hierarchy for ${this.category}.`,
      champion,
      runnerUp,
      unavailableProviders: unavailable
    };
  }

  extractCost(usage) {
    if (Number.isFinite(Number(usage?.cost?.total_cost))) {
      return Number(usage.cost.total_cost);
    }

    return null;
  }
}
