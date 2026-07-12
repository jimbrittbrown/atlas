const test = require('node:test');
const assert = require('node:assert/strict');
const { AssetRegistry, AssetTypes, AssetLifecycleStates } = require('./asset-registry.js');
const { OperationsCenter } = require('../operations/operations-center.js');
const { CEODashboard } = require('../dashboard/ceo-dashboard.js');

function createRegistry(now = () => Date.parse('2026-07-09T00:00:00.000Z')) {
  return new AssetRegistry({ now });
}

test('asset registration normalizes canonical asset types', () => {
  const registry = createRegistry();

  const script = registry.registerAsset({
    assetType: 'SCRIPT',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-001',
    createdBy: 'MISSION-RUNTIME',
    storageLocation: '/var/lib/atlas/assets/scripts/script-001.txt',
    checksum: 'abc123',
    sizeBytes: 128,
    mimeType: 'text/plain',
    tags: ['mission', 'script']
  });

  const voice = registry.registerAsset({
    assetType: 'VOICE_AUDIO',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-001',
    parentAssetId: script.assetId,
    createdBy: 'VOICE-WORKER-001',
    storageLocation: '/var/lib/atlas/assets/voice/voice-001.wav',
    checksum: 'def456',
    sizeBytes: 1024,
    mimeType: 'audio/wav',
    tags: ['mission', 'voice']
  });

  assert.equal(script.assetType, AssetTypes.SCRIPT);
  assert.equal(voice.assetType, AssetTypes.VOICE);
  assert.equal(voice.parentAssetId, script.assetId);
  assert.equal(voice.rootMissionId, 'MISSION-001');
});

test('duplicate asset registration is rejected', () => {
  const registry = createRegistry();

  registry.registerAsset({
    assetId: 'ASSET-9000',
    assetType: 'VIDEO',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-001',
    createdBy: 'VIDEO-WORKER-001'
  });

  assert.throws(() => registry.registerAsset({
    assetId: 'ASSET-9000',
    assetType: 'VIDEO',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-001',
    createdBy: 'VIDEO-WORKER-001'
  }), /Asset already registered/);
});

test('lineage resolves from root mission to derived asset', () => {
  const registry = createRegistry();
  const script = registry.registerAsset({
    assetType: 'SCRIPT',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-002',
    createdBy: 'MISSION-RUNTIME'
  });
  const voice = registry.registerAsset({
    assetType: 'VOICE_AUDIO',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-002',
    parentAssetId: script.assetId,
    createdBy: 'VOICE-WORKER-001'
  });
  const video = registry.registerAsset({
    assetType: 'VIDEO',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-002',
    parentAssetId: voice.assetId,
    createdBy: 'VIDEO-WORKER-001'
  });

  const lineage = registry.resolveLineage(video.assetId);

  assert.deepEqual(lineage.lineageAssetIds, [script.assetId, voice.assetId, video.assetId]);
  assert.equal(lineage.rootMissionId, 'MISSION-002');
});

test('version history tracks immutable revisions', () => {
  const registry = createRegistry();
  const asset = registry.registerAsset({
    assetType: 'IMAGE',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-003',
    createdBy: 'IMAGE-WORKER-001',
    status: 'GENERATED',
    lifecycleStage: 'GENERATED',
    metadata: { frame: 1 }
  });

  registry.updateAsset(asset.assetId, {
    status: 'VALIDATED',
    lifecycleStage: 'VALIDATED',
    metadata: { frame: 1, reviewer: 'QUALITY-REVIEW-ENGINE' }
  });

  const history = registry.getVersionHistory(asset.assetId);

  assert.equal(history.length, 2);
  assert.equal(history[0].version, 1);
  assert.equal(history[1].version, 2);
  assert.equal(history[1].metadata.reviewer, 'QUALITY-REVIEW-ENGINE');
});

test('lifecycle transitions are validated and applied', () => {
  const registry = createRegistry();
  const asset = registry.registerAsset({
    assetType: 'RELEASE_CANDIDATE',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-004',
    createdBy: 'RUNTIME',
    status: 'NEW',
    lifecycleStage: 'NEW'
  });

  const generated = registry.transitionAssetLifecycle(asset.assetId, 'GENERATED');
  const validated = registry.transitionAssetLifecycle(asset.assetId, 'VALIDATED');
  const approved = registry.transitionAssetLifecycle(asset.assetId, 'APPROVED');

  assert.equal(generated.lifecycleStage, AssetLifecycleStates.GENERATED);
  assert.equal(validated.lifecycleStage, AssetLifecycleStates.VALIDATED);
  assert.equal(approved.lifecycleStage, AssetLifecycleStates.APPROVED);
  assert.throws(() => registry.transitionAssetLifecycle(asset.assetId, 'NEW'), /Invalid lifecycle transition/);
});

test('orphan detection surfaces missing parents', () => {
  const registry = createRegistry();
  const orphan = registry.registerAsset({
    assetType: 'VIDEO',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-005',
    parentAssetId: 'ASSET-DOES-NOT-EXIST',
    createdBy: 'VIDEO-WORKER-001'
  });

  const orphans = registry.getOrphanAssets();

  assert.equal(orphan.parentAssetId, 'ASSET-DOES-NOT-EXIST');
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].assetId, orphan.assetId);
});

test('operations and dashboard integration expose asset summaries', () => {
  const registry = createRegistry();
  const script = registry.registerAsset({
    assetType: 'SCRIPT',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-006',
    createdBy: 'MISSION-RUNTIME',
    storageLocation: '/var/lib/atlas/assets/scripts/script-006.txt',
    checksum: '111',
    sizeBytes: 111,
    mimeType: 'text/plain',
    status: 'GENERATED',
    lifecycleStage: 'GENERATED'
  });
  registry.registerAsset({
    assetType: 'RELEASE_CANDIDATE',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-006',
    parentAssetId: script.assetId,
    createdBy: 'RUNTIME',
    status: 'APPROVED',
    lifecycleStage: 'APPROVED'
  });

  const operationsCenter = new OperationsCenter();
  const snapshot = operationsCenter.snapshot({
    assetRegistry: registry
  });

  assert.equal(snapshot.assetCount, 2);
  assert.equal(snapshot.releaseCandidateCount, 1);
  assert.equal(snapshot.approvedAssets, 1);
  assert.equal(snapshot.assetsAwaitingReview >= 0, true);
  assert.equal(typeof snapshot.assetHealth.status, 'string');
  assert.equal(Array.isArray(snapshot.recentAssets), true);
  assert.equal(typeof snapshot.assetStorageSummary.totalBytes, 'number');

  const dashboard = new CEODashboard();
  const ceo = dashboard.generateSnapshot({
    operationsInput: snapshot
  });

  assert.equal(typeof ceo.executiveSummary.assetsCreatedToday, 'number');
  assert.equal(typeof ceo.executiveSummary.releaseCandidateCount, 'number');
  assert.equal(typeof ceo.executiveSummary.approvedAssets, 'number');
  assert.equal(typeof ceo.executiveSummary.assetsAwaitingReview, 'number');
  assert.equal(typeof ceo.executiveSummary.assetIntegrityWarnings, 'number');
});

test('asset summary reports health and storage details', () => {
  const registry = createRegistry();
  registry.registerAsset({
    assetType: 'IMAGE',
    businessId: 'SYSTEM_INTERNAL',
    missionId: 'MISSION-007',
    createdBy: 'IMAGE-WORKER-001',
    status: 'GENERATED',
    lifecycleStage: 'GENERATED',
    storageLocation: '/var/lib/atlas/assets/images/image-007.png',
    checksum: '222',
    sizeBytes: 2048,
    mimeType: 'image/png'
  });

  const summary = registry.getAssetSummary();

  assert.equal(summary.assetCount, 1);
  assert.equal(summary.assetStorageSummary.totalBytes, 2048);
  assert.equal(summary.assetHealth.status, 'WARNING');
  assert.equal(Array.isArray(summary.recentAssets), true);
});