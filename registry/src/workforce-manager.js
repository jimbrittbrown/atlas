import { WorkforceValidator } from './workforce-validator.js';
import { WorkforceRules } from './workforce-rules.js';
import { WorkforceScheduler } from './workforce-scheduler.js';
import { EmploymentStatus, SpecialistRecord } from './workforce-models.js';

export class WorkforceManager {
  constructor({
    repository,
    validator = new WorkforceValidator(),
    rules = new WorkforceRules(),
    scheduler = new WorkforceScheduler(),
    marketDiscovery = new NullMarketDiscovery()
  }) {
    this.repository = repository;
    this.validator = validator;
    this.rules = rules;
    this.scheduler = scheduler;
    this.marketDiscovery = marketDiscovery;
  }

  registerSpecialist(payload = {}) {
    const snapshot = this.repository.load();
    const candidate = new SpecialistRecord({
      ...payload,
      currentEmploymentStatus: EmploymentStatus.CANDIDATE,
      connectionStatus: payload.connectionStatus ?? 'DISCONNECTED',
      benchmarkStatus: payload.benchmarkStatus ?? 'NOT_BENCHMARKED'
    });

    const validation = this.validator.validateSpecialistPayload(candidate);
    if (!validation.valid) {
      throw new Error(`Invalid specialist payload: ${validation.issues.join(' | ')}`);
    }

    if (snapshot.specialists.some(item => item.specialistId === candidate.specialistId)) {
      throw new Error(`Specialist already exists: ${candidate.specialistId}`);
    }

    snapshot.specialists.push(candidate);
    this.recordEvent(snapshot, 'SPECIALIST_REGISTERED', {
      specialistId: candidate.specialistId,
      category: candidate.category
    });

    snapshot.meta.updatedAt = new Date().toISOString();
    this.repository.save(snapshot);

    return candidate;
  }

  connectSpecialist(specialistId) {
    return this.updateSpecialist(specialistId, specialist => {
      specialist.connectionStatus = 'CONNECTED';
      if (this.rules.shouldPromoteToActive({ specialist })) {
        specialist.currentEmploymentStatus = EmploymentStatus.CONNECTED;
      }
    }, 'SPECIALIST_CONNECTED');
  }

  startBenchmarking(specialistId) {
    return this.updateSpecialist(specialistId, specialist => {
      specialist.benchmarkStatus = 'RUNNING';
      specialist.currentEmploymentStatus = EmploymentStatus.BENCHMARKING;
    }, 'SPECIALIST_BENCHMARK_STARTED');
  }

  completeBenchmark({ category, runAt = new Date().toISOString(), outcomes = [] } = {}) {
    const snapshot = this.repository.load();
    const specialistsById = new Map(snapshot.specialists.map(item => [item.specialistId, item]));

    for (const outcome of outcomes) {
      const specialist = specialistsById.get(outcome.specialistId);
      if (!specialist) {
        continue;
      }

      specialist.benchmarkStatus = 'BENCHMARKED';
      specialist.currentBenchmarkScore = Number(outcome.score ?? specialist.currentBenchmarkScore ?? 0);
      specialist.cost = outcome.cost ?? specialist.cost;
      specialist.speed = outcome.speed ?? specialist.speed;
      specialist.reliability = outcome.reliability ?? specialist.reliability;
      specialist.strengths = Array.isArray(outcome.strengths) ? outcome.strengths : specialist.strengths;
      specialist.weaknesses = Array.isArray(outcome.weaknesses) ? outcome.weaknesses : specialist.weaknesses;
      specialist.bestUseCases = Array.isArray(outcome.bestUseCases) ? outcome.bestUseCases : specialist.bestUseCases;
      specialist.lastBenchmarkDate = runAt;
      specialist.benchmarkHistory = [
        {
          date: runAt,
          score: specialist.currentBenchmarkScore,
          rank: outcome.rank ?? null,
          cost: specialist.cost,
          speed: specialist.speed,
          reliability: specialist.reliability,
          notes: outcome.notes ?? ''
        },
        ...(Array.isArray(specialist.benchmarkHistory) ? specialist.benchmarkHistory : [])
      ].slice(0, 100);
      specialist.updatedAt = new Date().toISOString();
    }

    const standing = this.rules.applyBenchmarkOutcome({
      specialists: snapshot.specialists,
      category
    });

    snapshot.categoryStandings[category] = {
      category,
      currentChampion: standing.champion ? standing.champion.specialistId : null,
      runnerUp: standing.runnerUp ? standing.runnerUp.specialistId : null,
      otherCandidates: standing.otherCandidates.map(item => item.specialistId),
      lastUpdatedAt: runAt
    };

    this.scheduler.updateCategorySchedule({ snapshot, category, runAt, cadenceDays: 30 });
    this.recordEvent(snapshot, 'CATEGORY_BENCHMARK_COMPLETED', {
      category,
      champion: snapshot.categoryStandings[category].currentChampion,
      runnerUp: snapshot.categoryStandings[category].runnerUp,
      sampleSize: outcomes.length
    });

    snapshot.meta.updatedAt = new Date().toISOString();
    this.repository.save(snapshot);

    return snapshot.categoryStandings[category];
  }

  async hireForCategory(category, options = {}) {
    const snapshot = this.repository.load();
    const champion = this.resolveActiveChampion({ snapshot, category });

    if (champion) {
      return {
        category,
        decision: 'CHAMPION_SELECTED',
        selectedSpecialistId: champion.specialistId,
        selectedSpecialist: this.toSpecialistSummary(champion),
        topBenchmarkCandidates: [],
        ceoApprovalRequiredBeforeBenchmark: false,
        benchmarkExecutionStatus: 'NOT_REQUIRED',
        rationale: 'Active champion selected from Workforce Registry standing.'
      };
    }

    const discovery = await this.marketDiscovery.discoverCategory({ category, options, snapshot });
    const candidates = this.normalizeDiscoveryCandidates(discovery?.providers);
    const topCandidates = candidates.slice(0, 3).map((candidate, index) => ({
      rank: index + 1,
      ...candidate
    }));

    this.recordEvent(snapshot, 'WORKFORCE_MARKET_DISCOVERY_COMPLETED', {
      category,
      candidateCount: candidates.length,
      topCandidate: topCandidates[0]?.provider ?? null,
      requiresCeoApprovalBeforeBenchmark: true
    });

    snapshot.meta.updatedAt = new Date().toISOString();
    this.repository.save(snapshot);

    return {
      category,
      decision: 'MARKET_DISCOVERY_REQUIRED',
      selectedSpecialistId: null,
      selectedSpecialist: null,
      topBenchmarkCandidates: topCandidates,
      ceoApprovalRequiredBeforeBenchmark: true,
      benchmarkExecutionStatus: 'PENDING_CEO_APPROVAL',
      rationale: 'No active champion in Workforce Registry. External market discovery completed and top benchmark candidates prepared.',
      marketDiscoveryReport: {
        category,
        generatedAt: discovery?.generatedAt ?? new Date().toISOString(),
        overallRecommendation: String(discovery?.overallRecommendation ?? topCandidates[0]?.overallRecommendation ?? 'Benchmark top-ranked candidates before hiring decision.'),
        providers: candidates,
        evidenceSources: Array.isArray(discovery?.evidenceSources) ? discovery.evidenceSources : []
      }
    };
  }

  retireSpecialist({ specialistId, reason = 'manual-retirement' }) {
    return this.updateSpecialist(specialistId, specialist => {
      if (!this.rules.shouldRetire({ specialist, reason })) {
        specialist.currentEmploymentStatus = EmploymentStatus.RETIRED;
      } else {
        specialist.currentEmploymentStatus = EmploymentStatus.DEPRECATED;
      }
      specialist.connectionStatus = 'DISCONNECTED';
      specialist.benchmarkStatus = 'RETIRED';
      specialist.metadata = {
        ...(specialist.metadata ?? {}),
        retirementReason: reason
      };
    }, 'SPECIALIST_RETIRED', { reason });
  }

  listDueBenchmarkCategories(now = new Date().toISOString()) {
    const snapshot = this.repository.load();
    return this.scheduler.listDueCategories({ snapshot, now });
  }

  getSnapshot() {
    return this.repository.load();
  }

  updateSpecialist(specialistId, mutator, eventType, extraPayload = {}) {
    const snapshot = this.repository.load();
    const specialist = snapshot.specialists.find(item => item.specialistId === specialistId);

    if (!specialist) {
      throw new Error(`Unknown specialist: ${specialistId}`);
    }

    mutator(specialist);
    specialist.updatedAt = new Date().toISOString();
    this.recordEvent(snapshot, eventType, {
      specialistId,
      ...extraPayload
    });

    snapshot.meta.updatedAt = new Date().toISOString();
    this.repository.save(snapshot);

    return specialist;
  }

  recordEvent(snapshot, type, payload = {}) {
    snapshot.eventHistory.unshift({
      type,
      payload,
      timestamp: new Date().toISOString()
    });
    snapshot.eventHistory = snapshot.eventHistory.slice(0, 500);
  }

  resolveActiveChampion({ snapshot, category }) {
    const standing = snapshot?.categoryStandings?.[category];
    if (!standing || !standing.currentChampion) return null;

    const champion = snapshot.specialists.find(item => item.specialistId === standing.currentChampion);
    if (!champion) return null;

    if (
      champion.currentEmploymentStatus === EmploymentStatus.RETIRED
      || champion.currentEmploymentStatus === EmploymentStatus.DEPRECATED
    ) {
      return null;
    }

    return champion;
  }

  toSpecialistSummary(specialist) {
    if (!specialist) return null;

    return {
      specialistId: specialist.specialistId,
      category: specialist.category,
      company: specialist.company,
      model: specialist.model,
      benchmarkScore: specialist.currentBenchmarkScore,
      benchmarkStatus: specialist.benchmarkStatus,
      currentEmploymentStatus: specialist.currentEmploymentStatus
    };
  }

  normalizeDiscoveryCandidates(providers) {
    const list = Array.isArray(providers) ? providers : [];

    return list
      .map((provider, index) => ({
        provider: String(provider?.provider ?? provider?.name ?? `Provider ${index + 1}`),
        company: String(provider?.company ?? provider?.provider ?? provider?.name ?? `Company ${index + 1}`),
        capability: String(provider?.capability ?? 'Specialist capability under review'),
        strengths: Array.isArray(provider?.strengths) ? provider.strengths.map(item => String(item)) : [],
        weaknesses: Array.isArray(provider?.weaknesses) ? provider.weaknesses.map(item => String(item)) : [],
        typicalUseCases: Array.isArray(provider?.typicalUseCases) ? provider.typicalUseCases.map(item => String(item)) : [],
        pricing: String(provider?.pricing ?? 'Pricing evidence pending'),
        apiAvailability: String(provider?.apiAvailability ?? 'UNKNOWN'),
        enterpriseReadiness: String(provider?.enterpriseReadiness ?? 'UNKNOWN'),
        evidenceSources: Array.isArray(provider?.evidenceSources) ? provider.evidenceSources.map(item => String(item)) : [],
        overallRecommendation: String(provider?.overallRecommendation ?? 'Candidate recommended for benchmark evaluation.'),
        recommendationScore: Number(provider?.recommendationScore ?? 0)
      }))
      .sort((a, b) => b.recommendationScore - a.recommendationScore);
  }
}

class NullMarketDiscovery {
  async discoverCategory({ category }) {
    return {
      category,
      generatedAt: new Date().toISOString(),
      overallRecommendation: 'External market discovery provider not configured. Configure provider, then benchmark top three candidates with CEO approval.',
      providers: [],
      evidenceSources: []
    };
  }
}
