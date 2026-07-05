import { MetricQuery } from './models.js';

export class MetricsRetrieval {
  constructor(repository) {
    this.repository = repository;
  }

  getById(recordId) {
    return this.repository.getById(recordId);
  }

  search(query = {}) {
    const metricQuery = query instanceof MetricQuery ? query : new MetricQuery(query);
    return this.repository.query(metricQuery);
  }

  getHistory() {
    return this.repository.getHistory();
  }
}
