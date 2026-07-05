export class ApprovalServiceAdapter {
  constructor({ approvalService, metricsService = null, performanceService = null }) {
    this.approvalService = approvalService;
    this.metricsService = metricsService;
    this.performanceService = performanceService;
  }

  requestAuthorization({ workflowId, requestId, context = {}, policy = {} }) {
    return this.approvalService.requestApproval({
      workflowId,
      requestId,
      context,
      policy,
      submittedBy: 'executive-service',
    });
  }

  authorize({ approvalId, approvedBy = 'CEO', reason = 'Approved by governance policy' }) {
    const record = this.approvalService.approve({ approvalId, decidedBy: approvedBy, reason });
    if (this.metricsService) {
      this.metricsService.recordMetricEvent({
        name: 'approval_granted',
        category: 'Integration Metrics',
        value: 1,
        status: 'success',
        metadata: {
          workflowId: record.request.workflowId,
          requestId: record.request.requestId,
          service: 'approval-service',
          operation: 'approve',
          source: 'integration',
          tags: ['approval', 'authorized'],
        },
      });
    }
    return record;
  }

  deny({ approvalId, decidedBy = 'CEO', reason = 'Rejected by governance policy' }) {
    const record = this.approvalService.reject({ approvalId, decidedBy, reason });
    if (this.metricsService) {
      this.metricsService.recordMetricEvent({
        name: 'approval_rejected',
        category: 'Error Metrics',
        value: 1,
        status: 'failure',
        metadata: {
          workflowId: record.request.workflowId,
          requestId: record.request.requestId,
          service: 'approval-service',
          operation: 'reject',
          source: 'integration',
          tags: ['approval', 'rejected'],
        },
      });
    }
    return record;
  }

  getAuthorizationStatus(approvalId) {
    return this.approvalService.getApprovalStatus(approvalId);
  }
}
