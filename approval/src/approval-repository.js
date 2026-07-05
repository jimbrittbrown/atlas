import { ApprovalResult } from './models.js';

export class ApprovalRepository {
  constructor() {
    this.records = [];
    this.history = [];
  }

  addRecord(record) {
    this.records.push(record);
    this.history.push({
      approvalId: record.id,
      action: 'REQUESTED',
      status: record.currentStatus.value,
      timestamp: record.createdAt,
    });
    return record;
  }

  updateRecord(record) {
    const index = this.records.findIndex((item) => item.id === record.id);
    if (index < 0) {
      throw new Error(`Unknown approval record: ${record.id}`);
    }
    this.records[index] = record;
    this.history.push({
      approvalId: record.id,
      action: 'DECIDED',
      status: record.currentStatus.value,
      timestamp: record.updatedAt,
    });
    return record;
  }

  getById(approvalId) {
    return this.records.find((record) => record.id === approvalId) ?? null;
  }

  query(query) {
    const filtered = this.records.filter((record) => {
      if (query.workflowId && record.request.workflowId !== query.workflowId) {
        return false;
      }
      if (query.requestId && record.request.requestId !== query.requestId) {
        return false;
      }
      if (query.status && record.currentStatus.value !== query.status) {
        return false;
      }
      if (query.decidedBy) {
        const lastDecision = record.decisionHistory[record.decisionHistory.length - 1];
        if (!lastDecision || lastDecision.decidedBy !== query.decidedBy) {
          return false;
        }
      }
      return true;
    });
    return new ApprovalResult({ records: filtered, total: filtered.length });
  }

  getHistory() {
    return [...this.history];
  }
}
