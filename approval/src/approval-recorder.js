import { ApprovalDecision, ApprovalPolicy, ApprovalRecord, ApprovalRequest, ApprovalStatus } from './models.js';

export class ApprovalRecorder {
  createRequest({ workflowId, requestId, submittedBy = 'executive-service', context = {}, policy = {} }) {
    if (!workflowId || !requestId) {
      throw new Error('Approval request requires workflowId and requestId');
    }

    const now = new Date().toISOString();
    const request = new ApprovalRequest({
      id: `approval-request-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      workflowId,
      requestId,
      submittedBy,
      context,
      policy: policy instanceof ApprovalPolicy ? policy : new ApprovalPolicy(policy),
      submittedAt: now,
    });

    return new ApprovalRecord({
      id: `approval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      request,
      currentStatus: ApprovalStatus.PENDING,
      decisionHistory: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  createDecision({ approvalRequestId, status, decidedBy, reason = '', metadata = {} }) {
    const normalizedStatus = status instanceof ApprovalStatus ? status : ApprovalStatus.fromValue(status);
    const now = new Date().toISOString();
    return new ApprovalDecision({
      id: `approval-decision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      approvalRequestId,
      status: normalizedStatus,
      decidedBy,
      reason,
      metadata,
      decidedAt: now,
    });
  }
}
