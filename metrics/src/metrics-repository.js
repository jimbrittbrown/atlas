import { MetricResult } from './models.js';

export class MetricsRepository {
  constructor() {
    this.records = [];
    this.history = [];
  }

  addRecord(record) {
    this.records.push(record);
    this.history.push({
      recordId: record.id,
      eventId: record.event.id,
      category: record.event.category.value,
      action: 'RECORDED',
      timestamp: record.recordedAt,
    });
    return record;
  }

  getById(recordId) {
    return this.records.find((record) => record.id === recordId) ?? null;
  }

  getAll() {
    return [...this.records];
  }

  query(query) {
    const filtered = this.records.filter((record) => {
      const event = record.event;
      if (query.category && event.category.value !== query.category.value) {
        return false;
      }
      if (query.workflowId && event.metadata.workflowId !== query.workflowId) {
        return false;
      }
      if (query.requestId && event.metadata.requestId !== query.requestId) {
        return false;
      }
      if (query.service && event.metadata.service !== query.service) {
        return false;
      }
      if (query.status && event.status !== query.status) {
        return false;
      }
      if (query.tag && !event.metadata.tags.includes(query.tag)) {
        return false;
      }
      if (query.fromTimestamp && event.timestamp < query.fromTimestamp) {
        return false;
      }
      if (query.toTimestamp && event.timestamp > query.toTimestamp) {
        return false;
      }
      return true;
    });

    return new MetricResult({ records: filtered, total: filtered.length });
  }

  getHistory() {
    return [...this.history];
  }
}
