import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class SpecialistRegistryStore {
  constructor({ registryPath = '/root/atlas/registry/specialist-registry.json' } = {}) {
    this.registryPath = registryPath;
  }

  load() {
    if (!existsSync(this.registryPath)) {
      return this.createEmptyRegistry();
    }

    try {
      const parsed = JSON.parse(readFileSync(this.registryPath, 'utf8'));
      return this.normalizeRegistry(parsed);
    } catch {
      return this.createEmptyRegistry();
    }
  }

  save(registry) {
    const normalized = this.normalizeRegistry(registry);
    mkdirSync(dirname(this.registryPath), { recursive: true });
    writeFileSync(this.registryPath, `${JSON.stringify(normalized, null, 2)}\n`);

    return normalized;
  }

  recordBenchmark({ benchmarkResult, benchmarkType = 'documentary-writing' }) {
    const registry = this.load();
    const benchmarkId = String(benchmarkResult?.benchmarkId ?? 'UNKNOWN');
    const runAt = String(benchmarkResult?.runAt ?? new Date().toISOString());
    const champion = benchmarkResult?.rankings?.[0] ?? null;

    registry.meta.updatedAt = runAt;
    registry.benchmarkHistory.unshift({
      benchmarkId,
      benchmarkType,
      runAt,
      champion: champion
        ? {
            providerId: champion.providerId,
            modelId: champion.modelId,
            overallExecutiveProducerScore: champion.overallExecutiveProducerScore
          }
        : null,
      providerCount: Array.isArray(benchmarkResult?.providerResults)
        ? benchmarkResult.providerResults.length
        : 0
    });

    registry.benchmarkHistory = registry.benchmarkHistory.slice(0, 50);

    if (!registry.categories[benchmarkType]) {
      registry.categories[benchmarkType] = {
        currentChampion: null,
        runnerUp: null,
        lastBenchmarkId: null,
        rerunPolicy: {
          cadence: 'P30D',
          nextRunDueAt: null
        },
        latestBenchmarkSummary: null
      };
    }

    registry.categories[benchmarkType].lastBenchmarkId = benchmarkId;
    registry.categories[benchmarkType].currentChampion = benchmarkResult?.rankings?.[0] ?? null;
    registry.categories[benchmarkType].runnerUp = benchmarkResult?.rankings?.[1] ?? null;
    registry.categories[benchmarkType].latestBenchmarkSummary = {
      benchmarkId,
      runAt,
      recommendation: benchmarkResult?.executiveProducerRecommendation ?? null,
      activeProviderCount: Array.isArray(benchmarkResult?.rankings) ? benchmarkResult.rankings.length : 0,
      unavailableProviderCount: Array.isArray(benchmarkResult?.providerResults)
        ? benchmarkResult.providerResults.filter(item => item.status !== 'COMPLETED').length
        : 0
    };

    registry.categories[benchmarkType].rerunPolicy.nextRunDueAt = this.computeNextRunDate(runAt, 30);

    return this.save(registry);
  }

  computeNextRunDate(anchor, days) {
    const start = new Date(anchor);
    if (Number.isNaN(start.getTime())) {
      return null;
    }

    start.setUTCDate(start.getUTCDate() + days);
    return start.toISOString();
  }

  createEmptyRegistry() {
    return {
      meta: {
        registryName: 'Atlas Specialist Registry',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      categories: {},
      benchmarkHistory: []
    };
  }

  normalizeRegistry(registry = {}) {
    return {
      meta: {
        registryName: registry?.meta?.registryName ?? 'Atlas Specialist Registry',
        version: Number(registry?.meta?.version ?? 1),
        createdAt: registry?.meta?.createdAt ?? new Date().toISOString(),
        updatedAt: registry?.meta?.updatedAt ?? new Date().toISOString()
      },
      categories: typeof registry?.categories === 'object' && registry?.categories !== null
        ? registry.categories
        : {},
      benchmarkHistory: Array.isArray(registry?.benchmarkHistory)
        ? registry.benchmarkHistory
        : []
    };
  }
}
