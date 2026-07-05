import { MemoryResult } from './models.js';

export class MemoryRepository {
  constructor() {
    this.records = [];
    this.auditHistory = [];
  }

  addRecord(record) {
    this.records.push(record);
    this.auditHistory.push({
      recordId: record.id,
      action: 'RECORDED',
      category: record.entry.category.value,
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
      if (query.category && record.entry.category.value !== query.category.value) {
        return false;
      }
      if (query.workflowId && record.entry.metadata.workflowId !== query.workflowId) {
        return false;
      }
      if (query.requestId && record.entry.metadata.requestId !== query.requestId) {
        return false;
      }
      if (query.tag && !record.entry.metadata.tags.includes(query.tag)) {
        return false;
      }
      if (query.referenceType && !record.entry.references.some((reference) => reference.referenceType === query.referenceType)) {
        return false;
      }
      return true;
    });

    return new MemoryResult({ records: filtered, total: filtered.length });
  }

  getAuditHistory() {
    return [...this.auditHistory];
  }
}
