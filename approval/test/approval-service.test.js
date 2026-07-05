import test from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalService } from '../src/approval-service.js';

test('handles requestApproval and getApprovalStatus for pending state', () => {
  const service = new ApprovalService();
  const record = service.requestApproval({ workflowId: 'wf-1000', requestId: 'req-1000' });
  const status = service.getApprovalStatus(record.id);

  assert.equal(status.authorized, false);
  assert.equal(status.status, 'PENDING');
});

test('approves request and reports authorization true', () => {
  const service = new ApprovalService();
  const record = service.requestApproval({ workflowId: 'wf-1001', requestId: 'req-1001' });
  service.approve({ approvalId: record.id, decidedBy: 'CEO', reason: 'Approved by CEO' });

  const status = service.getApprovalStatus(record.id);
  assert.equal(status.authorized, true);
  assert.equal(status.status, 'APPROVED');
  assert.equal(service.isAuthorized(record.id), true);
});

test('rejects request and records rejection reason', () => {
  const service = new ApprovalService();
  const record = service.requestApproval({ workflowId: 'wf-1002', requestId: 'req-1002' });
  service.reject({ approvalId: record.id, decidedBy: 'CEO', reason: 'Policy mismatch' });

  const status = service.getApprovalStatus(record.id);
  assert.equal(status.authorized, false);
  assert.equal(status.status, 'REJECTED');
  assert.equal(status.reason, 'Policy mismatch');
});

test('validates CEO-required policies', () => {
  const service = new ApprovalService();
  const validation = service.validateApprovalPolicy(
    { requiresCeoApproval: true, allowedApprovers: ['CEO'] },
    { status: 'APPROVED', decidedBy: 'CEO' }
  );

  assert.equal(validation.valid, true);
});

test('rejects policy violations for unauthorized approver', () => {
  const service = new ApprovalService();
  const record = service.requestApproval({
    workflowId: 'wf-1003',
    requestId: 'req-1003',
    policy: { requiresCeoApproval: true, allowedApprovers: ['CEO'] },
  });

  assert.throws(() => {
    service.approve({ approvalId: record.id, decidedBy: 'CTO', reason: 'Attempted delegated approval' });
  }, /Approval policy validation failed/);
});

test('returns approval history by workflow query', () => {
  const service = new ApprovalService();
  const recordA = service.requestApproval({ workflowId: 'wf-1004', requestId: 'req-1004' });
  service.approve({ approvalId: recordA.id, decidedBy: 'CEO' });

  const recordB = service.requestApproval({ workflowId: 'wf-1005', requestId: 'req-1005' });
  service.reject({ approvalId: recordB.id, decidedBy: 'CEO', reason: 'Denied' });

  const history = service.getApprovalHistory({ workflowId: 'wf-1004' });
  assert.equal(history.total, 1);
  assert.equal(history.records[0].id, recordA.id);
});
