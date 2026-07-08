import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetRegistry } from '../src/asset-registry.js';

test('asset registry registers assets with deterministic IDs', () => {
  const registry = new AssetRegistry();

  const firstAsset = registry.registerAsset({
    assetType: 'SCRIPT',
    businessId: 'BIZ-001',
    missionId: 'MISSION-001',
    workerId: 'YOUTUBE-SCRIPT-WORKER-001',
    metadata: { title: 'Episode 1 Script' }
  });
  const secondAsset = registry.registerAsset({
    assetType: 'VOICE',
    businessId: 'BIZ-001',
    missionId: 'MISSION-001',
    workerId: 'VOICE-WORKER-001',
    metadata: { language: 'en-US' }
  });

  assert.equal(firstAsset.assetId, 'ASSET-0001');
  assert.equal(secondAsset.assetId, 'ASSET-0002');
  assert.equal(registry.listAssets().length, 2);
});

test('asset registry retrieves an asset by id', () => {
  const registry = new AssetRegistry();
  const registered = registry.registerAsset({
    assetType: 'VIDEO',
    businessId: 'BIZ-010',
    missionId: 'MISSION-010',
    workerId: 'VIDEO-WORKER-001',
    metadata: { resolution: '1920x1080' }
  });

  const retrieved = registry.getAsset(registered.assetId);

  assert.equal(retrieved.assetId, registered.assetId);
  assert.equal(retrieved.assetType, 'VIDEO');
  assert.equal(retrieved.metadata.resolution, '1920x1080');
});

test('asset registry updates an existing asset', () => {
  const registry = new AssetRegistry();
  const registered = registry.registerAsset({
    assetType: 'IMAGE',
    businessId: 'BIZ-020',
    missionId: 'MISSION-020',
    workerId: 'IMAGE-WORKER-001',
    status: 'REGISTERED',
    metadata: { frameCount: 3 }
  });

  const updated = registry.updateAsset(registered.assetId, {
    status: 'APPROVED',
    metadata: { frameCount: 4, reviewer: 'QUALITY-REVIEW-ENGINE' }
  });

  assert.equal(updated.assetId, registered.assetId);
  assert.equal(updated.status, 'APPROVED');
  assert.equal(updated.metadata.frameCount, 4);
  assert.equal(updated.metadata.reviewer, 'QUALITY-REVIEW-ENGINE');
});

test('asset registry preserves parent asset relationships', () => {
  const registry = new AssetRegistry();
  const scriptAsset = registry.registerAsset({
    assetType: 'SCRIPT',
    businessId: 'BIZ-030',
    missionId: 'MISSION-030',
    workerId: 'YOUTUBE-SCRIPT-WORKER-001',
    metadata: { title: 'Episode 3 Script' }
  });
  const voiceAsset = registry.registerAsset({
    assetType: 'VOICE',
    businessId: 'BIZ-030',
    missionId: 'MISSION-030',
    workerId: 'VOICE-WORKER-001',
    parentAssetIds: [scriptAsset.assetId],
    metadata: { style: 'Cinematic Horror' }
  });

  const retrievedVoiceAsset = registry.getAsset(voiceAsset.assetId);

  assert.deepEqual(retrievedVoiceAsset.parentAssetIds, [scriptAsset.assetId]);
  assert.equal(retrievedVoiceAsset.assetId, 'ASSET-0002');
});
