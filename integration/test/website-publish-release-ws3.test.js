import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SpecialistWebsiteProviderAdapter,
  WebsiteProviderAdapterRegistry
} from '../src/executive/website-provider-adapters.js';
import { WebsitePublishReleaseManager } from '../src/executive/website-publish-release-manager.js';
import {
  WebsitePublishChecklistItems,
  WebsitePublishReleaseStatuses
} from '../src/executive/website-publish-release-contracts.js';

class PublishReadyAdapter extends SpecialistWebsiteProviderAdapter {
  constructor() {
    super({ name: 'WS3 Publish Ready Adapter', type: 'FRAMER' });
  }

  async publishWebsite({ generatedWebsite } = {}) {
    return {
      websiteId: generatedWebsite?.websiteId ?? 'ws3-site',
      status: 'PUBLISHED',
      publishedUrl: 'https://go-live.example'
    };
  }
}

class PublishVerificationFailAdapter extends SpecialistWebsiteProviderAdapter {
  constructor() {
    super({ name: 'WS3 Publish Fail Adapter', type: 'FRAMER' });
  }

  async publishWebsite() {
    return {
      websiteId: 'ws3-site-fail',
      status: 'PENDING',
      publishedUrl: null
    };
  }
}

function createChecklist({ completed = true, by = 'qa-lead' } = {}) {
  return WebsitePublishChecklistItems.map((itemId) => ({
    itemId,
    status: completed ? 'COMPLETED' : 'PENDING',
    completedBy: completed ? by : null,
    completedAt: completed ? new Date().toISOString() : null
  }));
}

function createManager({ adapter = new PublishReadyAdapter() } = {}) {
  const registry = new WebsiteProviderAdapterRegistry()
    .register({ adapterType: 'FRAMER', adapter })
    .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });

  return new WebsitePublishReleaseManager({
    providerAdapterRegistry: registry
  });
}

function createRelease(manager, overrides = {}) {
  const created = manager.createRelease({
    projectId: 'mis_project_1',
    missionId: 'mis_project_1',
    customerId: 'cust_1',
    businessId: 'biz_1',
    websiteBuildReference: 'build_123',
    artifactReference: 'artifact_123',
    targetProvider: 'FRAMER',
    deploymentTarget: 'PRODUCTION',
    qaReference: 'qa_123',
    paymentReference: 'pay_123',
    rollbackReference: 'rollback_123',
    ...overrides
  });

  assert.equal(created.accepted, true);
  return created.data.release.releaseId;
}

test('WS-3 publish gate fails closed before approvals/checklist and opens after canonical approvals', async () => {
  const manager = createManager();
  const releaseId = createRelease(manager);

  const ineligible = manager.evaluateReleaseEligibility({ releaseId });
  assert.equal(ineligible.accepted, true);
  assert.equal(ineligible.data.eligible, false);
  assert.equal(ineligible.data.reasons.some((item) => item.includes('Customer go-live approval')), true);

  const checklistSaved = manager.saveChecklist({
    releaseId,
    items: createChecklist({ completed: true }),
    updatedBy: 'qa-engine'
  });
  assert.equal(checklistSaved.accepted, true);

  const customerApproval = manager.recordCustomerGoLiveApproval({
    releaseId,
    projectId: 'mis_project_1',
    customerId: 'cust_1',
    approvedBy: 'customer-owner',
    approved: true
  });
  assert.equal(customerApproval.accepted, true);

  const ceoApproval = manager.recordCeoPublishApproval({
    releaseId,
    approvedBy: 'ceo',
    approved: true
  });
  assert.equal(ceoApproval.accepted, true);

  const eligible = manager.evaluateReleaseEligibility({ releaseId });
  assert.equal(eligible.accepted, true);
  assert.equal(eligible.data.eligible, true);

  const release = manager.getReleaseById(releaseId);
  assert.equal(release.status, WebsitePublishReleaseStatuses.APPROVED);
});

test('WS-3 execute publish enforces approved state, verification, and idempotency', async () => {
  const manager = createManager();
  const releaseId = createRelease(manager);

  const premature = await manager.executePublish({
    releaseId,
    idempotencyKey: 'idem-publish-1',
    requestedBy: 'operator'
  });
  assert.equal(premature.accepted, false);
  assert.equal(premature.code, 'INVALID_RELEASE_STATE');

  manager.saveChecklist({ releaseId, items: createChecklist({ completed: true }), updatedBy: 'qa' });
  manager.recordCustomerGoLiveApproval({
    releaseId,
    projectId: 'mis_project_1',
    customerId: 'cust_1',
    approvedBy: 'customer-owner',
    approved: true
  });
  manager.recordCeoPublishApproval({ releaseId, approvedBy: 'ceo', approved: true });

  const published = await manager.executePublish({
    releaseId,
    idempotencyKey: 'idem-publish-2',
    requestedBy: 'operator'
  });

  assert.equal(published.accepted, true);
  assert.equal(published.data.status, WebsitePublishReleaseStatuses.PUBLISHED);
  assert.equal(typeof published.data.liveUrl, 'string');

  const replay = await manager.executePublish({
    releaseId,
    idempotencyKey: 'idem-publish-2',
    requestedBy: 'operator'
  });

  assert.equal(replay.accepted, true);
  assert.equal(replay.code, 'IDEMPOTENT_REPLAY');
});

test('WS-3 publish verification failure moves release to FAILED', async () => {
  const manager = createManager({ adapter: new PublishVerificationFailAdapter() });
  const releaseId = createRelease(manager);

  manager.saveChecklist({ releaseId, items: createChecklist({ completed: true }), updatedBy: 'qa' });
  manager.recordCustomerGoLiveApproval({
    releaseId,
    projectId: 'mis_project_1',
    customerId: 'cust_1',
    approvedBy: 'customer-owner',
    approved: true
  });
  manager.recordCeoPublishApproval({ releaseId, approvedBy: 'ceo', approved: true });

  const result = await manager.executePublish({
    releaseId,
    idempotencyKey: 'idem-fail-1',
    requestedBy: 'operator'
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, 'PUBLISH_VERIFICATION_FAILED');

  const release = manager.getReleaseById(releaseId);
  assert.equal(release.status, WebsitePublishReleaseStatuses.FAILED);
});

test('WS-3 rollback is guarded and available only from publish/failure lifecycle states', async () => {
  const manager = createManager();
  const releaseId = createRelease(manager);

  const earlyRollback = await manager.executeRollback({ releaseId, requestedBy: 'operator' });
  assert.equal(earlyRollback.accepted, false);
  assert.equal(earlyRollback.code, 'INVALID_TRANSITION');

  manager.saveChecklist({ releaseId, items: createChecklist({ completed: true }), updatedBy: 'qa' });
  manager.recordCustomerGoLiveApproval({
    releaseId,
    projectId: 'mis_project_1',
    customerId: 'cust_1',
    approvedBy: 'customer-owner',
    approved: true
  });
  manager.recordCeoPublishApproval({ releaseId, approvedBy: 'ceo', approved: true });
  await manager.executePublish({ releaseId, idempotencyKey: 'idem-roll-1', requestedBy: 'operator' });

  const rollback = await manager.executeRollback({
    releaseId,
    requestedBy: 'operator',
    reason: 'post-publish-monitoring-alert'
  });

  assert.equal(rollback.accepted, true);
  assert.equal(rollback.data.status, WebsitePublishReleaseStatuses.ROLLED_BACK);
});
