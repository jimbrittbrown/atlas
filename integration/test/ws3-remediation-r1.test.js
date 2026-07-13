import test from 'node:test';
import assert from 'node:assert/strict';
import { WebsitePublishReleaseManager } from '../src/executive/website-publish-release-manager.js';
import { WebsitePublishChecklistItems, WebsitePublishReleaseStatuses } from '../src/executive/website-publish-release-contracts.js';
import { SpecialistWebsiteProviderAdapter, WebsiteProviderAdapterRegistry } from '../src/executive/website-provider-adapters.js';
import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';

class SpyAdapter extends SpecialistWebsiteProviderAdapter {
  constructor({ publishResult = null, restoreResult = null, throwOnRestore = null } = {}) {
    super({ name: 'WS3 R1 Spy Adapter', type: 'FRAMER' });
    this.publishCalls = [];
    this.restoreCalls = [];
    this.publishResult = publishResult ?? {
      websiteId: 'build_123',
      status: 'PUBLISHED',
      publishedUrl: 'https://staging.example'
    };
    this.restoreResult = restoreResult ?? {
      status: 'RESTORED',
      restored: true,
      restoredReference: 'rb_ref_1',
      liveUrl: 'https://staging.example'
    };
    this.throwOnRestore = throwOnRestore;
  }

  async publishWebsite(payload = {}) {
    this.publishCalls.push(payload);
    return this.publishResult;
  }

  async restoreWebsite(payload = {}) {
    this.restoreCalls.push(payload);
    if (this.throwOnRestore) {
      throw new Error(this.throwOnRestore);
    }
    return this.restoreResult;
  }
}

function checklistComplete() {
  return WebsitePublishChecklistItems.map((itemId) => ({
    itemId,
    status: 'COMPLETED',
    completedBy: 'qa',
    completedAt: new Date().toISOString()
  }));
}

function createManager({ adapter, ceoApprovalMaxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  const dbPath = `/tmp/ws3-r1-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`;
  const storage = new SQLiteStorageProvider({ databasePath: dbPath });
  storage.initializeSync();

  const registry = new WebsiteProviderAdapterRegistry()
    .register({ adapterType: 'FRAMER', adapter: adapter ?? new SpyAdapter() })
    .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });

  return {
    storage,
    manager: new WebsitePublishReleaseManager({
      providerAdapterRegistry: registry,
      storageProvider: storage,
      ceoApprovalMaxAgeMs
    })
  };
}

function createRelease(manager, overrides = {}) {
  const created = manager.createRelease({
    projectId: 'proj_1',
    missionId: 'mis_1',
    customerId: 'cust_1',
    businessId: 'biz_1',
    websiteBuildReference: 'build_123',
    artifactReference: 'artifact_123',
    targetProvider: 'FRAMER',
    deploymentTarget: 'STAGING',
    qaReference: 'qa_1',
    paymentReference: 'pay_1',
    rollbackReference: 'rb_ref_1',
    ...overrides
  });
  assert.equal(created.accepted, true);
  return created.data.release.releaseId;
}

async function makePublishReady(manager, releaseId) {
  manager.saveChecklist({ releaseId, items: checklistComplete(), updatedBy: 'qa' });
  manager.recordCustomerGoLiveApproval({
    releaseId,
    projectId: 'proj_1',
    customerId: 'cust_1',
    approvedBy: 'customer-owner',
    approved: true
  });
  manager.recordCeoPublishApproval({ releaseId, approvedBy: 'ceo', approved: true });
}

test('WS3-R1 valid CEO approval propagates provider publish authorization signal', async () => {
  const adapter = new SpyAdapter();
  const { manager } = createManager({ adapter });
  const releaseId = createRelease(manager);
  await makePublishReady(manager, releaseId);

  const result = await manager.executePublish({
    releaseId,
    idempotencyKey: 'idem-pub-r1-1',
    requestedBy: 'operator'
  });

  assert.equal(result.accepted, true);
  assert.equal(adapter.publishCalls.length, 1);
  assert.equal(adapter.publishCalls[0].ceoApproved, true);
  assert.equal(adapter.publishCalls[0].approvalContext.releaseId, releaseId);
});

test('WS3-R1 caller cannot spoof ceoApproved=true when persisted approval is missing', async () => {
  const adapter = new SpyAdapter();
  const { manager } = createManager({ adapter });
  const releaseId = createRelease(manager);

  manager.saveChecklist({ releaseId, items: checklistComplete(), updatedBy: 'qa' });
  manager.recordCustomerGoLiveApproval({
    releaseId,
    projectId: 'proj_1',
    customerId: 'cust_1',
    approvedBy: 'customer-owner',
    approved: true
  });

  const result = await manager.executePublish({
    releaseId,
    idempotencyKey: 'idem-pub-r1-2',
    requestedBy: 'operator',
    ceoApproved: true
  });

  assert.equal(result.accepted, false);
  assert.equal(adapter.publishCalls.length, 0);
});

test('WS3-R1 stale CEO approval blocks publish', async () => {
  const adapter = new SpyAdapter();
  const { manager } = createManager({ adapter, ceoApprovalMaxAgeMs: 5 });
  const releaseId = createRelease(manager);
  await makePublishReady(manager, releaseId);

  const release = manager.getReleaseById(releaseId);
  const approvalId = release.approvals.ceoPublishApprovalId;
  const approval = manager.ceoApprovals.get(approvalId);
  manager.ceoApprovals.set(approvalId, {
    ...approval,
    approvedAt: '2000-01-01T00:00:00.000Z'
  });

  const result = await manager.executePublish({
    releaseId,
    idempotencyKey: 'idem-pub-r1-3',
    requestedBy: 'operator'
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, 'CEO_APPROVAL_STALE');
  assert.equal(adapter.publishCalls.length, 0);
});

test('WS3-R1 revoked CEO approval blocks publish', async () => {
  const adapter = new SpyAdapter();
  const { manager } = createManager({ adapter });
  const releaseId = createRelease(manager);
  await makePublishReady(manager, releaseId);
  manager.recordCeoPublishApproval({ releaseId, approvedBy: 'ceo', approved: false });

  const result = await manager.executePublish({
    releaseId,
    idempotencyKey: 'idem-pub-r1-4',
    requestedBy: 'operator'
  });

  assert.equal(result.accepted, false);
  assert.equal(adapter.publishCalls.length, 0);
});

test('WS3-R1 CEO approval tied to another release/build blocks publish', async () => {
  const adapter = new SpyAdapter();
  const { manager } = createManager({ adapter });

  const releaseIdA = createRelease(manager, { websiteBuildReference: 'build_A' });
  const releaseIdB = createRelease(manager, { websiteBuildReference: 'build_B' });

  await makePublishReady(manager, releaseIdA);
  manager.saveChecklist({ releaseId: releaseIdB, items: checklistComplete(), updatedBy: 'qa' });
  manager.recordCustomerGoLiveApproval({
    releaseId: releaseIdB,
    projectId: 'proj_1',
    customerId: 'cust_1',
    approvedBy: 'customer-owner',
    approved: true
  });

  const releaseA = manager.getReleaseById(releaseIdA);
  const releaseB = manager.getReleaseById(releaseIdB);
  const tampered = {
    ...releaseB,
    approvals: {
      ...releaseB.approvals,
      ceoPublishApprovalId: releaseA.approvals.ceoPublishApprovalId
    },
    ceoApprovalReference: releaseA.ceoApprovalReference,
    status: WebsitePublishReleaseStatuses.APPROVED
  };
  manager.persistRelease(tampered);

  const result = await manager.executePublish({
    releaseId: releaseIdB,
    idempotencyKey: 'idem-pub-r1-5',
    requestedBy: 'operator'
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, 'CEO_APPROVAL_MISMATCH');
});

test('WS3-R1 provider restore is invoked and release only rolls back after successful restore', async () => {
  const adapter = new SpyAdapter({
    restoreResult: {
      status: 'RESTORED',
      restored: true,
      restoredReference: 'rb_ref_1',
      liveUrl: 'https://staging.example'
    }
  });
  const { manager } = createManager({ adapter });
  const releaseId = createRelease(manager);
  await makePublishReady(manager, releaseId);
  await manager.executePublish({ releaseId, idempotencyKey: 'idem-pub-r1-6', requestedBy: 'operator' });

  const rollback = await manager.executeRollback({
    releaseId,
    idempotencyKey: 'idem-rb-r1-1',
    requestedBy: 'operator'
  });

  assert.equal(rollback.accepted, true);
  assert.equal(adapter.restoreCalls.length, 1);
  assert.equal(adapter.restoreCalls[0].rollbackReference, 'rb_ref_1');
  assert.equal(manager.getReleaseById(releaseId).status, WebsitePublishReleaseStatuses.ROLLED_BACK);
});

test('WS3-R1 failed restore does not claim rollback success', async () => {
  const adapter = new SpyAdapter({ throwOnRestore: 'restore failed: test' });
  const { manager } = createManager({ adapter });
  const releaseId = createRelease(manager);
  await makePublishReady(manager, releaseId);
  await manager.executePublish({ releaseId, idempotencyKey: 'idem-pub-r1-7', requestedBy: 'operator' });

  const rollback = await manager.executeRollback({
    releaseId,
    idempotencyKey: 'idem-rb-r1-2',
    requestedBy: 'operator'
  });

  assert.equal(rollback.accepted, false);
  assert.equal(rollback.code, 'ROLLBACK_RESTORE_FAILED');
  assert.notEqual(manager.getReleaseById(releaseId).status, WebsitePublishReleaseStatuses.ROLLED_BACK);
});

test('WS3-R1 rollback replay with same idempotency key succeeds without second provider call', async () => {
  const adapter = new SpyAdapter();
  const { manager } = createManager({ adapter });
  const releaseId = createRelease(manager);
  await makePublishReady(manager, releaseId);
  await manager.executePublish({ releaseId, idempotencyKey: 'idem-pub-r1-8', requestedBy: 'operator' });

  const first = await manager.executeRollback({
    releaseId,
    idempotencyKey: 'idem-rb-r1-3',
    requestedBy: 'operator'
  });
  const replay = await manager.executeRollback({
    releaseId,
    idempotencyKey: 'idem-rb-r1-3',
    requestedBy: 'operator'
  });

  assert.equal(first.accepted, true);
  assert.equal(replay.accepted, true);
  assert.equal(replay.code, 'IDEMPOTENT_REPLAY');
  assert.equal(adapter.restoreCalls.length, 1);
});

test('WS3-R1 conflicting rollback replay is rejected and records are not duplicated', async () => {
  const adapter = new SpyAdapter();
  const { manager, storage } = createManager({ adapter });
  const releaseId = createRelease(manager);
  await makePublishReady(manager, releaseId);
  await manager.executePublish({ releaseId, idempotencyKey: 'idem-pub-r1-9', requestedBy: 'operator' });

  await manager.executeRollback({
    releaseId,
    idempotencyKey: 'idem-rb-r1-4',
    requestedBy: 'operator'
  });

  const historyLength = manager.getReleaseById(releaseId).history.length;
  const conflict = await manager.executeRollback({
    releaseId,
    idempotencyKey: 'idem-rb-r1-5',
    requestedBy: 'operator',
    rollbackReference: 'rb_other'
  });

  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, 'CONFLICTING_ROLLBACK_REQUEST');
  assert.equal(adapter.restoreCalls.length, 1);
  assert.equal(manager.getReleaseById(releaseId).history.length, historyLength);

  const auditEvents = storage.listEventsSync('executive.website-publish-release-manager.audit').map((entry) => entry.value);
  assert.equal(auditEvents.length >= 1, true);
  assert.equal(auditEvents.some((event) => JSON.stringify(event).includes('apiKey')), false);
});
