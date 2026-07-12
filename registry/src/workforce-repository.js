import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  WorkforceCategories,
  WorkforceRegistrySnapshot,
  WorkforceCategoryStanding
} from './workforce-models.js';

export class WorkforceRepository {
  constructor({
    registryPath = '/root/atlas/registry/workforce-registry.json'
  } = {}) {
    this.registryPath = registryPath;
  }

  load() {
    if (!existsSync(this.registryPath)) {
      return this.createEmpty();
    }

    try {
      const parsed = JSON.parse(readFileSync(this.registryPath, 'utf8'));
      return this.normalize(parsed);
    } catch {
      return this.createEmpty();
    }
  }

  save(snapshot) {
    const normalized = this.normalize(snapshot);
    mkdirSync(dirname(this.registryPath), { recursive: true });
    writeFileSync(this.registryPath, `${JSON.stringify(normalized, null, 2)}\n`);
    return normalized;
  }

  createEmpty() {
    const now = new Date().toISOString();
    const standings = {};
    const schedules = {};

    for (const category of WorkforceCategories) {
      standings[category] = new WorkforceCategoryStanding({ category, lastUpdatedAt: now });
      schedules[category] = {
        cadence: 'P30D',
        lastRunAt: null,
        nextRunDueAt: null,
        active: true
      };
    }

    return new WorkforceRegistrySnapshot({
      meta: {
        registryName: 'Atlas Workforce Registry',
        version: 1,
        createdAt: now,
        updatedAt: now
      },
      specialists: [],
      categoryStandings: standings,
      benchmarkSchedules: schedules,
      eventHistory: []
    });
  }

  normalize(data = {}) {
    const baseline = this.createEmpty();

    return {
      meta: {
        registryName: data?.meta?.registryName ?? baseline.meta.registryName,
        version: Number(data?.meta?.version ?? baseline.meta.version),
        createdAt: data?.meta?.createdAt ?? baseline.meta.createdAt,
        updatedAt: data?.meta?.updatedAt ?? baseline.meta.updatedAt
      },
      specialists: Array.isArray(data?.specialists) ? data.specialists : [],
      categoryStandings: {
        ...baseline.categoryStandings,
        ...(typeof data?.categoryStandings === 'object' && data.categoryStandings !== null ? data.categoryStandings : {})
      },
      benchmarkSchedules: {
        ...baseline.benchmarkSchedules,
        ...(typeof data?.benchmarkSchedules === 'object' && data.benchmarkSchedules !== null ? data.benchmarkSchedules : {})
      },
      eventHistory: Array.isArray(data?.eventHistory) ? data.eventHistory : []
    };
  }
}
