import { ApprovalPolicy, ApprovalStatus, AuthorizationStatus } from './models.js';

export class ApprovalManager {
  constructor(repository, recorder) {
    this.repository = repository;
    this.recorder = recorder;
  }

  requestApproval(payload) {
    const record = this.recorder.createRequest(payload);
    return this.repository.addRecord(record);
  }

  validateApprovalPolicy(policy, decisionContext = {}) {
    const normalizedPolicy = policy instanceof ApprovalPolicy ? policy : new ApprovalPolicy(policy);
    const violations = [];

    if (!normalizedPolicy.allowedApprovers || normalizedPolicy.allowedApprovers.length === 0) {
      violations.push('Policy must define at least one allowed approver');
    }

    if (normalizedPolicy.requiresCeoApproval && !normalizedPolicy.allowedApprovers.includes('CEO')) {
      violations.push('CEO must be an allowed approver when requiresCeoApproval is true');
    }

    if (decisionContext.status === 'APPROVED' || decisionContext.status?.value === 'APPROVED') {
      if (normalizedPolicy.requiresCeoApproval && decisionContext.decidedBy !== 'CEO') {
        violations.push('CEO approval is required by policy');
      }
      if (!normalizedPolicy.allowedApprovers.includes(decisionContext.decidedBy)) {
        violations.push('Approver is not allowed by policy');
      }
    }

    return { valid: violations.length === 0, violations, policy: normalizedPolicy };
  }

  recordDecision({ approvalId, status, decidedBy, reason = '', metadata = {} }) {
    const record = this.repository.getById(approvalId);
    if (!record) {
      throw new Error(`Unknown approval record: ${approvalId}`);
    }

    const statusValue = status instanceof ApprovalStatus ? status.value : status;
    const validation = this.validateApprovalPolicy(record.request.policy, { status: statusValue, decidedBy });
    if (!validation.valid) {
      throw new Error(`Approval policy validation failed: ${validation.violations.join('; ')}`);
    }

    const decision = this.recorder.createDecision({
      approvalRequestId: record.request.id,
      status: statusValue,
      decidedBy,
      reason,
      metadata,
    });

    record.decisionHistory.push(decision);
    record.currentStatus = decision.status;
    record.updatedAt = decision.decidedAt;
    return this.repository.updateRecord(record);
  }

  getApprovalStatus(approvalId) {
    const record = this.repository.getById(approvalId);
    if (!record) {
      throw new Error(`Unknown approval record: ${approvalId}`);
    }

    const lastDecision = record.decisionHistory[record.decisionHistory.length - 1];
    return new AuthorizationStatus({
      approvalId: record.id,
      authorized: record.currentStatus.value === ApprovalStatus.APPROVED.value,
      status: record.currentStatus.value,
      reason: lastDecision?.reason ?? '',
    });
  }

  getApprovalHistory(query) {
    return this.repository.query(query);
  }

  isAuthorized(approvalId) {
    return this.getApprovalStatus(approvalId).authorized;
  }
}
