export class ApprovalStatus {
  static PENDING = new ApprovalStatus('PENDING');
  static APPROVED = new ApprovalStatus('APPROVED');
  static REJECTED = new ApprovalStatus('REJECTED');

  static all() {
    return [ApprovalStatus.PENDING, ApprovalStatus.APPROVED, ApprovalStatus.REJECTED];
  }

  static fromValue(value) {
    const status = ApprovalStatus.all().find((item) => item.value === value);
    if (!status) {
      throw new Error(`Unknown approval status: ${value}`);
    }
    return status;
  }

  constructor(value) {
    this.value = value;
  }
}

export class ApprovalPolicy {
  constructor({
    id = 'policy-default',
    name = 'Default Atlas Approval Policy',
    requiresCeoApproval = true,
    allowedApprovers = ['CEO'],
  } = {}) {
    this.id = id;
    this.name = name;
    this.requiresCeoApproval = requiresCeoApproval;
    this.allowedApprovers = [...allowedApprovers];
  }
}

export class ApprovalRequest {
  constructor({
    id,
    workflowId,
    requestId,
    submittedBy = 'executive-service',
    context = {},
    policy = new ApprovalPolicy(),
    submittedAt = new Date().toISOString(),
  }) {
    this.id = id;
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.submittedBy = submittedBy;
    this.context = context;
    this.policy = policy;
    this.submittedAt = submittedAt;
  }
}

export class ApprovalDecision {
  constructor({
    id,
    approvalRequestId,
    status,
    decidedBy,
    reason = '',
    metadata = {},
    decidedAt = new Date().toISOString(),
  }) {
    this.id = id;
    this.approvalRequestId = approvalRequestId;
    this.status = status;
    this.decidedBy = decidedBy;
    this.reason = reason;
    this.metadata = metadata;
    this.decidedAt = decidedAt;
  }
}

export class ApprovalRecord {
  constructor({
    id,
    request,
    currentStatus = ApprovalStatus.PENDING,
    decisionHistory = [],
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
  }) {
    this.id = id;
    this.request = request;
    this.currentStatus = currentStatus;
    this.decisionHistory = [...decisionHistory];
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export class ApprovalQuery {
  constructor({ workflowId = null, requestId = null, status = null, decidedBy = null } = {}) {
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.status = status;
    this.decidedBy = decidedBy;
  }
}

export class ApprovalResult {
  constructor({ records = [], total = 0 }) {
    this.records = records;
    this.total = total;
  }
}

export class AuthorizationStatus {
  constructor({ approvalId, authorized, status, reason = '' }) {
    this.approvalId = approvalId;
    this.authorized = authorized;
    this.status = status;
    this.reason = reason;
  }
}
