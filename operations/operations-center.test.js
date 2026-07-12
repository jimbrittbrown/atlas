const test = require('node:test');
const assert = require('node:assert/strict');
const { OperationsCenter } = require('./operations-center.js');
const { HealthStatuses, AlertSeverities, AttentionTypes } = require('./operations-center-contracts.js');

function missionFixture({
  missionId,
  businessId,
  state,
  currentStage = null,
  qualityPassed = true,
  publishingStatus = 'NOT_REQUESTED',
  initiatedAt = '2026-07-09T00:00:00.000Z',
  risks = [],
  executiveOutcome = null
}) {
  return {
    missionId,
    state,
    runtimeContext: {
      missionId,
      businessId,
      state,
      currentStage,
      initiatedAt,
      riskRegister: risks,
      artifacts: {
        qualityReview: {
          passed: qualityPassed
        },
        publishing: {
          publishStatus: publishingStatus
        },
        executiveCouncilRuntime: executiveOutcome ? { outcome: executiveOutcome } : null
      }
    }
  };
}

test('dashboard aggregation summarizes mission partitions', () => {
  const operationsCenter = new OperationsCenter({ now: () => Date.parse('2026-07-09T00:10:00.000Z') });

  const dashboard = operationsCenter.snapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-1', businessId: 'SYSTEM_INTERNAL', state: 'SCRIPTING' }),
      missionFixture({ missionId: 'M-2', businessId: 'SYSTEM_INTERNAL', state: 'COMPLETED' }),
      missionFixture({ missionId: 'M-3', businessId: 'MIDNIGHT_ARCHIVES', state: 'FAILED', qualityPassed: false })
    ],
    queuedMissions: [{ missionId: 'Q-1', businessId: 'SYSTEM_INTERNAL' }]
  });

  assert.equal(dashboard.activeMissions.length, 1);
  assert.equal(dashboard.completedMissions.length, 1);
  assert.equal(dashboard.failedMissions.length, 1);
  assert.equal(dashboard.queuedMissions.length, 1);
  assert.equal(dashboard.runtimeStatus.totalMissions, 3);
});

test('mission normalization produces required mission view shape', () => {
  const operationsCenter = new OperationsCenter({ now: () => Date.parse('2026-07-09T00:10:00.000Z') });

  const dashboard = operationsCenter.snapshot({
    runtimeMissions: [
      missionFixture({
        missionId: 'M-4',
        businessId: 'MIDNIGHT_ARCHIVES',
        state: 'CEO_DECISION_PENDING',
        currentStage: 'CEO_DECISION_PENDING',
        qualityPassed: true,
        publishingStatus: 'NOT_REQUESTED',
        risks: [{ code: 'RISK-1', severity: 'HIGH' }]
      })
    ]
  });

  const mission = dashboard.activeMissions[0];
  assert.equal(typeof mission.missionId, 'string');
  assert.equal(typeof mission.businessId, 'string');
  assert.equal(typeof mission.currentStage, 'string');
  assert.equal(typeof mission.currentState, 'string');
  assert.equal(typeof mission.qualityStatus, 'string');
  assert.equal(typeof mission.executiveStatus, 'string');
  assert.equal(typeof mission.publishingStatus, 'string');
  assert.equal(typeof mission.runtimeDuration, 'number');
  assert.equal(Array.isArray(mission.activeRisks), true);
  assert.equal(typeof mission.nextRequiredDecision, 'string');
  assert.equal(mission.nextRequiredDecision, 'CEO_APPROVAL');
});

test('health aggregation escalates to worst component status', () => {
  const operationsCenter = new OperationsCenter();

  const dashboard = operationsCenter.snapshot({
    missionRuntime: { status: HealthStatuses.HEALTHY },
    mediaEngine: { status: HealthStatuses.WARNING },
    qualityIntelligence: { status: HealthStatuses.HEALTHY },
    publishing: { status: HealthStatuses.DEGRADED },
    knowledgeRegistry: { status: HealthStatuses.HEALTHY },
    providerRegistry: { status: HealthStatuses.FAILED },
    credentialRegistry: { status: HealthStatuses.HEALTHY },
    operationsCenter: { status: HealthStatuses.HEALTHY }
  });

  assert.equal(dashboard.systemHealth, HealthStatuses.FAILED);
});

test('executive queue generation surfaces mandatory attention types', () => {
  const operationsCenter = new OperationsCenter();

  const dashboard = operationsCenter.snapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-5', businessId: 'SYSTEM_INTERNAL', state: 'CEO_DECISION_PENDING' }),
      missionFixture({ missionId: 'M-6', businessId: 'SYSTEM_INTERNAL', state: 'FAILED', qualityPassed: false })
    ],
    providerRegistry: { status: HealthStatuses.FAILED },
    credentialRegistry: { status: HealthStatuses.FAILED },
    knowledgeRegistry: {
      status: HealthStatuses.HEALTHY,
      conflicts: [{ message: 'Knowledge conflict detected.' }]
    },
    executiveCouncil: {
      expiredWaivers: [{ message: 'Waiver expired.' }]
    },
    operationsCenter: {
      criticalOperationalAlerts: [{ message: 'Critical runtime alert.' }]
    }
  });

  const attentionTypes = new Set(dashboard.executiveAttentionItems.map(item => item.type));

  assert.equal(attentionTypes.has(AttentionTypes.CEO_APPROVAL), true);
  assert.equal(attentionTypes.has(AttentionTypes.RUNTIME_FAILURE), true);
  assert.equal(attentionTypes.has(AttentionTypes.CREDENTIAL_FAILURE), true);
  assert.equal(attentionTypes.has(AttentionTypes.PROVIDER_OUTAGE), true);
  assert.equal(attentionTypes.has(AttentionTypes.KNOWLEDGE_CONFLICT), true);
  assert.equal(attentionTypes.has(AttentionTypes.EXPIRED_WAIVER), true);
  assert.equal(attentionTypes.has(AttentionTypes.CRITICAL_OPERATIONAL_ALERT), true);
});

test('alert prioritization orders critical alerts first', () => {
  const operationsCenter = new OperationsCenter();

  const dashboard = operationsCenter.snapshot({
    runtimeMissions: [missionFixture({ missionId: 'M-7', businessId: 'SYSTEM_INTERNAL', state: 'CEO_DECISION_PENDING' })],
    qualityIntelligence: {
      alerts: [
        { severity: AlertSeverities.CRITICAL, message: 'Critical quality issue' },
        { severity: AlertSeverities.LOW, message: 'Low quality issue' }
      ]
    },
    providerRegistry: { status: HealthStatuses.FAILED }
  });

  const severities = dashboard.executiveAttentionItems.map(item => item.severity);
  const first = severities[0];

  assert.equal(first, AlertSeverities.CRITICAL);
});

test('empty runtime returns stable dashboard shape', () => {
  const operationsCenter = new OperationsCenter();
  const dashboard = operationsCenter.snapshot({});

  assert.equal(Array.isArray(dashboard.activeMissions), true);
  assert.equal(Array.isArray(dashboard.queuedMissions), true);
  assert.equal(Array.isArray(dashboard.completedMissions), true);
  assert.equal(Array.isArray(dashboard.failedMissions), true);
  assert.equal(Array.isArray(dashboard.executiveAttentionItems), true);
  assert.equal(Array.isArray(dashboard.qualityAlerts), true);
  assert.equal(Array.isArray(dashboard.publishingQueue), true);
  assert.equal(Array.isArray(dashboard.knowledgeUpdates), true);
  assert.equal(Array.isArray(dashboard.recentLessonsLearned), true);
  assert.equal(typeof dashboard.diagnostics.snapshotTimestamp, 'string');
});

test('multiple businesses are summarized independently', () => {
  const operationsCenter = new OperationsCenter();

  const dashboard = operationsCenter.snapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-8', businessId: 'SYSTEM_INTERNAL', state: 'SCRIPTING' }),
      missionFixture({ missionId: 'M-9', businessId: 'MIDNIGHT_ARCHIVES', state: 'COMPLETED' }),
      missionFixture({ missionId: 'M-10', businessId: 'MIDNIGHT_ARCHIVES', state: 'FAILED', qualityPassed: false })
    ],
    queuedMissions: [
      { missionId: 'Q-2', businessId: 'SYSTEM_INTERNAL' },
      { missionId: 'Q-3', businessId: 'MIDNIGHT_ARCHIVES' }
    ],
    businessAdmission: {
      admittedCount: 2,
      rejectedCount: 0
    }
  });

  const byBusiness = new Map(dashboard.businessSummary.businesses.map(item => [item.businessId, item]));

  assert.equal(byBusiness.get('SYSTEM_INTERNAL').activeMissions, 1);
  assert.equal(byBusiness.get('SYSTEM_INTERNAL').queuedMissions, 1);
  assert.equal(byBusiness.get('MIDNIGHT_ARCHIVES').completedMissions, 1);
  assert.equal(byBusiness.get('MIDNIGHT_ARCHIVES').failedMissions, 1);
  assert.equal(byBusiness.get('MIDNIGHT_ARCHIVES').queuedMissions, 1);
});

test('multiple missions populate publishing queue and quality alerts', () => {
  const operationsCenter = new OperationsCenter();

  const dashboard = operationsCenter.snapshot({
    runtimeMissions: [
      missionFixture({ missionId: 'M-11', businessId: 'SYSTEM_INTERNAL', state: 'PUBLISHING', publishingStatus: 'SCHEDULED' }),
      missionFixture({ missionId: 'M-12', businessId: 'MIDNIGHT_ARCHIVES', state: 'QUALITY_REVIEW', qualityPassed: false })
    ],
    qualityIntelligence: {
      alerts: [{ severity: 'HIGH', message: 'Global quality warning' }]
    }
  });

  assert.equal(dashboard.publishingQueue.length, 1);
  assert.equal(dashboard.publishingQueue[0].missionId, 'M-11');
  assert.equal(dashboard.qualityAlerts.length >= 2, true);
});
