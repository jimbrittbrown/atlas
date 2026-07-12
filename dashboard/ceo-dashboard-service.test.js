const test = require('node:test');
const assert = require('node:assert/strict');
const { CEODashboardService } = require('./ceo-dashboard-service.js');
const { OperationsCenter } = require('../operations/operations-center.js');
const { BusinessRegistry } = require('../business/business-registry.js');
const { ProviderRegistry } = require('../providers/provider-registry.js');
const { CredentialRegistry } = require('../providers/credential-registry.js');
const { AssetRegistry } = require('../assets/asset-registry.js');

function missionFixture({
  missionId,
  businessId,
  state,
  qualityPassed = true,
  publishingStatus = 'NOT_REQUESTED',
  completedAt = '2026-07-09T10:00:00.000Z',
  startedAt = '2026-07-09T09:00:00.000Z',
  riskLevel = 'LOW',
  currentStage = null
}) {
  return {
    missionId,
    state,
    runtimeContext: {
      missionId,
      businessId,
      state,
      currentStage,
      initiatedAt: startedAt,
      completedAt,
      riskRegister: [],
      artifacts: {
        qualityReview: {
          passed: qualityPassed,
          overallScore: qualityPassed ? 100 : 0
        },
        publishing: {
          publishStatus: publishingStatus
        }
      }
    },
    riskLevel
  };
}

function createService(now = () => Date.parse('2026-07-09T12:00:00.000Z')) {
  return new CEODashboardService({
    operationsCenter: new OperationsCenter({ now }),
    now,
    runtimeVersion: '2.0.0'
  });
}

test('empty runtime', () => {
  const service = createService();

  const snapshot = service.generateDashboardSnapshot();

  assert.equal(snapshot.executiveSummary.businessCount, 0);
  assert.equal(snapshot.executiveSummary.activeMissionCount, 0);
  assert.equal(snapshot.executiveSummary.completedMissionCount, 0);
  assert.equal(snapshot.executiveSummary.failedMissionCount, 0);
  assert.equal(snapshot.executiveSummary.criticalAlerts, 0);
  assert.equal(snapshot.executiveSummary.pendingCEOApprovals, 0);
  assert.equal(snapshot.executiveSummary.publishingReady, 0);
  assert.equal(Array.isArray(snapshot.business), true);
  assert.equal(Array.isArray(snapshot.missions), true);
  assert.equal(snapshot.missions.length, 0);
  assert.equal(typeof snapshot.diagnostics.generationDuration, 'number');
});

test('one business', () => {
  const now = () => Date.parse('2026-07-09T12:00:00.000Z');
  const service = new CEODashboardService({
    operationsCenter: new OperationsCenter({ now }),
    businessRegistry: new BusinessRegistry(),
    providerRegistry: new ProviderRegistry({ initialProviders: [] }),
    credentialRegistry: new CredentialRegistry({ initialCredentials: [] }),
    assetRegistry: new AssetRegistry(),
    now,
    runtimeVersion: '2.0.0'
  });

  const snapshot = service.generateDashboardSnapshot({
    runtimeMissions: []
  });

  assert.equal(snapshot.business.length >= 1, true);
  const systemBusiness = snapshot.business.find(item => item.businessId === 'SYSTEM_INTERNAL');
  assert.equal(Boolean(systemBusiness), true);
  assert.equal(systemBusiness.displayName, 'Atlas System Internal');
  assert.equal(systemBusiness.activeMissions, 0);
  assert.equal(systemBusiness.completedToday, 0);
  assert.equal(typeof systemBusiness.providerHealth.status, 'string');
  assert.equal(typeof systemBusiness.credentialHealth.status, 'string');
  assert.equal(typeof systemBusiness.knowledgeItems, 'number');
  assert.equal(typeof systemBusiness.assetCount, 'number');
});

test('multiple businesses', () => {
  const service = createService();

  const snapshot = service.generateDashboardSnapshot({
    businessRegistry: new BusinessRegistry(),
    runtimeMissions: [
      missionFixture({ missionId: 'M-001', businessId: 'SYSTEM_INTERNAL', state: 'SCRIPTING' }),
      missionFixture({ missionId: 'M-002', businessId: 'MIDNIGHT_ARCHIVES', state: 'COMPLETED' })
    ]
  });

  assert.equal(snapshot.business.length >= 2, true);
  const businessIds = snapshot.business.map(item => item.businessId);
  assert.equal(businessIds.includes('SYSTEM_INTERNAL'), true);
  assert.equal(businessIds.includes('MIDNIGHT_ARCHIVES'), true);
});

test('active mission', () => {
  const service = createService();

  const snapshot = service.generateDashboardSnapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-ACTIVE', businessId: 'SYSTEM_INTERNAL', state: 'SCRIPTING', currentStage: 'SCRIPTING' })
    ]
  });

  assert.equal(snapshot.executiveSummary.activeMissionCount, 1);
  assert.equal(snapshot.missions[0].missionId, 'M-ACTIVE');
  assert.equal(snapshot.missions[0].stage, 'SCRIPTING');
  assert.equal(snapshot.missions[0].runtimeState, 'SCRIPTING');
  assert.equal(snapshot.missions[0].nextRequiredAction, 'NONE');
});

test('completed mission', () => {
  const service = createService();

  const snapshot = service.generateDashboardSnapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-COMPLETE', businessId: 'MIDNIGHT_ARCHIVES', state: 'COMPLETED', currentStage: 'COMPLETED' })
    ]
  });

  assert.equal(snapshot.executiveSummary.completedMissionCount, 1);
  assert.equal(snapshot.missions[0].runtimeState, 'COMPLETED');
});

test('dashboard generation', () => {
  const now = () => Date.parse('2026-07-09T12:00:00.000Z');
  const service = new CEODashboardService({
    operationsCenter: new OperationsCenter({ now }),
    businessRegistry: new BusinessRegistry(),
    providerRegistry: new ProviderRegistry(),
    credentialRegistry: new CredentialRegistry({
      initialCredentials: [
        {
          credentialId: 'YOUTUBE_API_KEY',
          providerId: 'YOUTUBE',
          environment: 'production',
          configured: true,
          verified: true,
          requiredScopes: [],
          status: 'VERIFIED'
        }
      ]
    }),
    assetRegistry: new AssetRegistry(),
    now,
    runtimeVersion: '2.0.0'
  });

  const snapshot = service.generateDashboardSnapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-QUEUED', businessId: 'SYSTEM_INTERNAL', state: 'CEO_DECISION_PENDING', qualityPassed: true }),
      missionFixture({ missionId: 'M-FAILED', businessId: 'MIDNIGHT_ARCHIVES', state: 'FAILED', qualityPassed: false, riskLevel: 'HIGH' })
    ],
    qualityIntelligence: {
      alerts: [
        { severity: 'CRITICAL', message: 'Critical quality issue' }
      ]
    },
    executiveCouncil: {
      expiredWaivers: [
        { message: 'Waiver expired' }
      ]
    }
  });

  assert.equal(snapshot.executiveSummary.overallHealth, 'WARNING');
  assert.equal(typeof snapshot.executiveSummary.highestPriorityRecommendation, 'string');
  assert.equal(typeof snapshot.executiveSummary.systemVersion, 'string');
  assert.equal(typeof snapshot.executiveSummary.snapshotTimestamp, 'string');
  assert.equal(Array.isArray(snapshot.operations.qualityAlerts), true);
  assert.equal(Array.isArray(snapshot.operations.recentLessons), true);
});

test('ordering', () => {
  const service = createService();

  const snapshot = service.generateDashboardSnapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-LOW', businessId: 'SYSTEM_INTERNAL', state: 'SCRIPTING', riskLevel: 'LOW' }),
      missionFixture({ missionId: 'M-CRITICAL', businessId: 'SYSTEM_INTERNAL', state: 'FAILED', riskLevel: 'CRITICAL' }),
      missionFixture({ missionId: 'M-HIGH', businessId: 'MIDNIGHT_ARCHIVES', state: 'CEO_DECISION_PENDING', riskLevel: 'HIGH' }),
      missionFixture({ missionId: 'M-MEDIUM', businessId: 'MIDNIGHT_ARCHIVES', state: 'QUALITY_REVIEW', riskLevel: 'MEDIUM' })
    ],
    qualityIntelligence: {
      alerts: [
        { severity: 'LOW', message: 'Low alert' },
        { severity: 'CRITICAL', message: 'Critical alert' },
        { severity: 'MEDIUM', message: 'Medium alert' },
        { severity: 'HIGH', message: 'High alert' }
      ]
    }
  });

  const severities = snapshot.executiveQueue.items.map(item => item.severity);
  const expectedPriority = [...severities].sort((left, right) => {
    const leftRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[left] ?? 0;
    const rightRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[right] ?? 0;
    return rightRank - leftRank;
  });

  assert.deepEqual(severities, expectedPriority);
});

test('immutability', () => {
  const service = createService();
  const snapshot = service.generateDashboardSnapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-IMMUTABLE', businessId: 'SYSTEM_INTERNAL', state: 'SCRIPTING' })
    ]
  });

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.executiveSummary), true);
  assert.equal(Object.isFrozen(snapshot.business), true);
  assert.equal(Object.isFrozen(snapshot.missions), true);
  assert.throws(() => {
    snapshot.business.push({});
  });
});