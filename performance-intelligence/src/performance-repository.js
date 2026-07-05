import { PerformanceResult } from './models.js';

export class PerformanceRepository {
  constructor() {
    this.records = [];
    this.history = [];
  }

  addRecord(record) {
    this.records.push(record);
    this.history.push({
      workflowId: record.workflowId,
      requestId: record.requestId,
      status: record.status.value,
      action: 'GENERATED',
      timestamp: record.generatedAt,
    });
    return record;
  }

  getAll() {
    return [...this.records];
  }

  query(query) {
    const filtered = this.records.filter((record) => {
      if (query.workflowId && record.workflowId !== query.workflowId) {
        return false;
      }
      if (query.requestId && record.requestId !== query.requestId) {
        return false;
      }
      if (query.status && record.status.value !== query.status) {
        return false;
      }
      if (query.tag && !record.context.tags.includes(query.tag)) {
        return false;
      }
      return true;
    });

    return new PerformanceResult({ records: filtered, total: filtered.length });
  }

  getHistory() {
    return [...this.history];
  }
}
