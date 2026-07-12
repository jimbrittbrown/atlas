const test = require('node:test');
const assert = require('node:assert/strict');
const { BusinessRegistry } = require('./business-registry.js');
const { MIDNIGHT_ARCHIVES_PROFILE } = require('../profiles/midnight-archives-profile.js');
const { OperationsCenter } = require('../operations/operations-center.js');

function missionFixture({ missionId, businessId, state }) {
  return {
    missionId,
    state,
    runtimeContext: {
      missionId,
      businessId,
      state,
      currentStage: state,
      initiatedAt: '2026-07-09T00:00:00.000Z',
      riskRegister: [],
      artifacts: {
        qualityReview: {
          passed: true
        },
        publishing: {
          publishStatus: 'NOT_REQUESTED'
        }
      }
    }
  };
}

test('business registration includes MIDNIGHT_ARCHIVES as official registered business', () => {
  const registry = new BusinessRegistry();

  assert.equal(registry.hasBusiness('MIDNIGHT_ARCHIVES'), true);
  assert.equal(registry.getBusinessCount() >= 2, true);
});

test('duplicate registration is rejected', () => {
  const registry = new BusinessRegistry();

  assert.throws(
    () => registry.registerBusiness(MIDNIGHT_ARCHIVES_PROFILE),
    /Business already registered/
  );
});

test('profile loading returns immutable runtime business profile', () => {
  const registry = new BusinessRegistry();
  const profile = registry.getRuntimeBusinessProfile('MIDNIGHT_ARCHIVES');

  assert.equal(profile.businessId, 'MIDNIGHT_ARCHIVES');
  assert.equal(profile.displayName, 'Midnight Archives');
  assert.equal(Object.isFrozen(profile), true);

  profile.displayName = 'Changed Name';
  assert.equal(profile.displayName, 'Midnight Archives');
});

test('knowledge partition is dedicated to midnight archives namespace', () => {
  const registry = new BusinessRegistry();
  const profile = registry.getRuntimeBusinessProfile('MIDNIGHT_ARCHIVES');

  assert.equal(profile.knowledgePartition, 'knowledge/midnight-archives/');
});

test('asset root and subfolder layout are generated for midnight archives', () => {
  const registry = new BusinessRegistry();
  const profile = registry.getRuntimeBusinessProfile('MIDNIGHT_ARCHIVES');

  assert.equal(profile.assetRoot, 'assets/midnight-archives/');
  assert.equal(profile.assetLayout.scripts, 'assets/midnight-archives/scripts/');
  assert.equal(profile.assetLayout.voice, 'assets/midnight-archives/voice/');
  assert.equal(profile.assetLayout.images, 'assets/midnight-archives/images/');
  assert.equal(profile.assetLayout.video, 'assets/midnight-archives/video/');
  assert.equal(profile.assetLayout.thumbnails, 'assets/midnight-archives/thumbnails/');
  assert.equal(profile.assetLayout.reports, 'assets/midnight-archives/reports/');
  assert.equal(profile.assetLayout.releaseCandidates, 'assets/midnight-archives/release-candidates/');
});

test('metrics namespace and reserved metrics are defined', () => {
  const registry = new BusinessRegistry();
  const profile = registry.getRuntimeBusinessProfile('MIDNIGHT_ARCHIVES');

  assert.equal(profile.metricsNamespace, 'midnight_archives');
  assert.deepEqual(profile.metrics.reservedMetrics, [
    'views',
    'CTR',
    'watch time',
    'retention',
    'subscribers',
    'upload latency',
    'quality score'
  ]);
});

test('operations aggregation includes business registry outputs', () => {
  const registry = new BusinessRegistry();
  const operationsCenter = new OperationsCenter();

  const dashboard = operationsCenter.snapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-REG-1', businessId: 'SYSTEM_INTERNAL', state: 'COMPLETED' }),
      missionFixture({ missionId: 'M-REG-2', businessId: 'MIDNIGHT_ARCHIVES', state: 'SCRIPTING' })
    ],
    businessRegistry: {
      businessCount: registry.getBusinessCount(),
      registeredBusinesses: registry.listBusinesses().map(profile => profile.businessId),
      businessHealth: registry.getBusinessHealth(),
      businessProfiles: registry.listBusinesses()
    }
  });

  assert.equal(dashboard.businessSummary.businessCount >= 2, true);
  assert.equal(dashboard.businessSummary.registeredBusinesses.includes('MIDNIGHT_ARCHIVES'), true);
  assert.equal(typeof dashboard.businessSummary.businessHealth.MIDNIGHT_ARCHIVES, 'string');
  assert.equal(Array.isArray(dashboard.businessSummary.businessProfiles), true);
  assert.equal(typeof dashboard.businessSummary.missionCountByBusiness.MIDNIGHT_ARCHIVES, 'number');
});
