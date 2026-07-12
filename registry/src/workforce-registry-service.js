import { WorkforceRepository } from './workforce-repository.js';
import { WorkforceManager } from './workforce-manager.js';
import { WorkforceDashboardModel } from './workforce-dashboard-model.js';

export class WorkforceRegistryService {
  constructor({
    repository = new WorkforceRepository(),
    manager = null,
    dashboardModel = new WorkforceDashboardModel()
  } = {}) {
    this.repository = repository;
    this.manager = manager ?? new WorkforceManager({ repository: this.repository });
    this.dashboardModel = dashboardModel;
  }

  registerSpecialist(payload) {
    return this.manager.registerSpecialist(payload);
  }

  connectSpecialist(specialistId) {
    return this.manager.connectSpecialist(specialistId);
  }

  startBenchmarking(specialistId) {
    return this.manager.startBenchmarking(specialistId);
  }

  completeBenchmark(payload) {
    return this.manager.completeBenchmark(payload);
  }

  retireSpecialist(payload) {
    return this.manager.retireSpecialist(payload);
  }

  async hireForCategory(category, options) {
    return this.manager.hireForCategory(category, options);
  }

  listDueBenchmarkCategories(now) {
    return this.manager.listDueBenchmarkCategories(now);
  }

  getSnapshot() {
    return this.manager.getSnapshot();
  }

  getDashboardModel() {
    return this.dashboardModel.build(this.getSnapshot());
  }
}
