import { createRequire } from 'node:module';
import { createDemoDashboardInput } from './ceo-operations-console-data.js';

const require = createRequire(import.meta.url);
const { CEODashboardService } = require('../../dashboard/ceo-dashboard-service.js');

export class CEOOperationsConsoleService {
  constructor({ dashboardService = null, dashboardInput = null } = {}) {
    this.dashboardService = dashboardService ?? new CEODashboardService();
    this.dashboardInput = dashboardInput ?? createDemoDashboardInput();
  }

  getDashboardSnapshot() {
    return this.dashboardService.generateDashboardSnapshot(this.dashboardInput);
  }

  getDashboardPayload() {
    const snapshot = this.getDashboardSnapshot();
    const viewModel = this.buildViewModel();

    return {
      generatedAt: snapshot.diagnostics?.snapshotTimestamp ?? new Date().toISOString(),
      snapshot,
      viewModel
    };
  }

  buildViewModel() {
    const providerRegistry = this.dashboardInput.providerRegistry ?? {};
    const credentialRegistry = this.dashboardInput.credentialRegistry ?? {};
    const knowledgeRegistry = this.dashboardInput.knowledgeRegistry ?? {};
    const runtimeMissions = Array.isArray(this.dashboardInput.runtimeMissions) ? this.dashboardInput.runtimeMissions : [];

    const recentLessons = runtimeMissions.flatMap(mission => {
      const lessons = mission?.runtimeContext?.artifacts?.lessonsLearned ?? mission?.recentLessonsLearned ?? [];

      return Array.isArray(lessons)
        ? lessons.map(lesson => ({
            title: lesson.title ?? lesson.lesson ?? String(lesson)
          }))
        : [];
    });

    const validatedLearning = Array.isArray(knowledgeRegistry.updates)
      ? knowledgeRegistry.updates.map(item => ({ title: item.title ?? item.message ?? String(item) }))
      : [];

    const knowledgeCandidates = Array.isArray(knowledgeRegistry.items)
      ? knowledgeRegistry.items.map(item => ({ title: item.title ?? item.message ?? String(item) }))
      : [];

    return {
      providerCount: Number(providerRegistry.providerCount ?? providerRegistry.providerSummary?.providerCount ?? 0),
      credentialWarningCount: Number(credentialRegistry.warningCredentials ?? credentialRegistry.credentialSummary?.warningCredentials ?? 0),
      quotaWarningCount: Array.isArray(providerRegistry.quotaWarnings) ? providerRegistry.quotaWarnings.length : 0,
      recentLessons,
      validatedLearning,
      knowledgeCandidates
    };
  }
}
