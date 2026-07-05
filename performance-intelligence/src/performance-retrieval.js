import { PerformanceQuery } from './models.js';

export class PerformanceRetrieval {
  constructor(repository) {
    this.repository = repository;
  }

  search(query = {}) {
    const performanceQuery = query instanceof PerformanceQuery ? query : new PerformanceQuery(query);
    return this.repository.query(performanceQuery);
  }

  getHistory() {
    return this.repository.getHistory();
  }
}
