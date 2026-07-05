import { ApprovalLogger } from './approval-logger.js';
import { ApprovalManager } from './approval-manager.js';
import { ApprovalQuery, ApprovalStatus } from './models.js';
import { ApprovalRecorder } from './approval-recorder.js';
import { ApprovalRepository } from './approval-repository.js';
import { ApprovalRetrieval } from './approval-retrieval.js';

export class ApprovalService {
  constructor({
    repository = new ApprovalRepository(),
    recorder = new ApprovalRecorder(),
    manager = null,
    retrieval = null,
    logger = new ApprovalLogger(),
  } = {}) {
    this.repository = repository;
    this.recorder = recorder;
    this.manager = manager ?? new ApprovalManager(this.repository, this.recorder);
    this.retrieval = retrieval ?? new ApprovalRetrieval(this.repository);
    this.logger = logger;
  }

  requestApproval(payload) {
    const record = this.manager.requestApproval(payload);
    this.logger.log({ message: 'Approval requested', approvalId: record.id, workflowId: record.request.workflowId, timestamp: record.createdAt });
    return record;
  }

  approve({ approvalId, decidedBy = 'CEO', reason = 'Approved', metadata = {} }) {
    const record = this.manager.recordDecision({
      approvalId,
      status: ApprovalStatus.APPROVED,
      decidedBy,
      reason,
      metadata,
    });
    this.logger.log({ message: 'Approval granted', approvalId: record.id, decidedBy, timestamp: record.updatedAt });
    return record;
  }

  reject({ approvalId, decidedBy = 'CEO', reason = 'Rejected', metadata = {} }) {
    const record = this.manager.recordDecision({
      approvalId,
      status: ApprovalStatus.REJECTED,
      decidedBy,
      reason,
      metadata,
    });
    this.logger.log({ message: 'Approval rejected', approvalId: record.id, decidedBy, reason, timestamp: record.updatedAt });
    return record;
  }

  getApprovalStatus(approvalId) {
    return this.manager.getApprovalStatus(approvalId);
  }

  getApprovalHistory(query = {}) {
    const approvalQuery = query instanceof ApprovalQuery ? query : new ApprovalQuery(query);
    return this.retrieval.search(approvalQuery);
  }

  validateApprovalPolicy(policy, context = {}) {
    return this.manager.validateApprovalPolicy(policy, context);
  }

  recordDecision(payload) {
    const record = this.manager.recordDecision(payload);
    this.logger.log({ message: 'Approval decision recorded', approvalId: record.id, timestamp: record.updatedAt });
    return record;
  }

  isAuthorized(approvalId) {
    return this.manager.isAuthorized(approvalId);
  }

  getHistory() {
    return this.retrieval.getHistory();
  }
}
