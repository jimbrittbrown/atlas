const test = require('node:test');
const assert = require('node:assert/strict');
const { CEODashboard } = require('./ceo-dashboard.js');
const { OperationsCenter } = require('../operations/operations-center.js');
const { BusinessRegistry } = require('../business/business-registry.js');

function missionFixture({
  missionId,
  businessId,
  state,
  currentStage = null,
  qualityPassed = true,
  publishingStatus = 'NOT_REQUESTED',
  initiatedAt = '2026-07-09T00:00:00.000Z',
  risks = []
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
        }
      }
    }
  };
}

test('empty dashboard', () => {
  const dashboard = new CEODashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(snapshot.executiveSummary.businessCount, 0);
  assert.equal(snapshot.executiveSummary.activeMissionCount, 0);
  assert.equal(snapshot.missionQueue.missionCards.length, 0);
  assert.equal(Array.isArray(snapshot.recommendedActions), true);
  assert.equal(typeof snapshot.diagnostics.snapshotTimestamp, 'string');
});

test('single business snapshot', () => {
  const operationsCenter = new OperationsCenter();
  const businessRegistry = new BusinessRegistry();
  const dashboard = new CEODashboard({
    operationsCenter,
    businessRegistry,
    now: () => Date.parse('2026-07-09T00:10:00.000Z')
  });

  const snapshot = dashboard.generateSnapshot({
    operationsInput: {
      runtimeMissions: [
        missionFixture({
          missionId: 'M-001',
          businessId: 'SYSTEM_INTERNAL',
          state: 'SCRIPTING',
          currentStage: 'SCRIPTING'
        })
      ],
      businessRegistry: {
        businessCount: businessRegistry.getBusinessCount(),
        registeredBusinesses: businessRegistry.listBusinesses().map(profile => profile.businessId),
        businessHealth: businessRegistry.getBusinessHealth(),
        businessProfiles: businessRegistry.listBusinesses()
      }
    }
  });

  assert.equal(snapshot.executiveSummary.businessCount >= 1, true);
  assert.equal(snapshot.executiveSummary.activeMissionCount, 1);
  assert.equal(snapshot.missionQueue.missionCards.length, 1);
  assert.equal(snapshot.missionQueue.missionCards[0].businessName, 'Atlas System Internal');
});

test('multiple businesses snapshot', () => {
  const operationsCenter = new OperationsCenter();
  const businessRegistry = new BusinessRegistry();
  const dashboard = new CEODashboard({
    operationsCenter,
    businessRegistry,
    now: () => Date.parse('2026-07-09T00:20:00.000Z')
  });

  const snapshot = dashboard.generateSnapshot({
    operationsInput: {
      runtimeMissions: [
        missionFixture({
          missionId: 'M-010',
          businessId: 'SYSTEM_INTERNAL',
          state: 'SCRIPTING',
          currentStage: 'SCRIPTING'
        }),
        missionFixture({
          missionId: 'M-011',
          businessId: 'MIDNIGHT_ARCHIVES',
          state: 'COMPLETED',
          currentStage: 'COMPLETED',
          publishingStatus: 'SCHEDULED'
        })
      ],
      businessRegistry: {
        businessCount: businessRegistry.getBusinessCount(),
        registeredBusinesses: businessRegistry.listBusinesses().map(profile => profile.businessId),
        businessHealth: businessRegistry.getBusinessHealth(),
        businessProfiles: businessRegistry.listBusinesses()
      }
    }
  });

  assert.equal(snapshot.executiveSummary.businessCount >= 2, true);
  assert.equal(snapshot.missionQueue.missionCards.some(card => card.businessName === 'Midnight Archives'), true);
});

test('active and completed missions are represented', () => {
  const operationsCenter = new OperationsCenter();
  const dashboard = new CEODashboard({
    operationsCenter,
    now: () => Date.parse('2026-07-09T00:30:00.000Z')
  });

  const snapshot = dashboard.generateSnapshot({
    operationsInput: {
      runtimeMissions: [
        missionFixture({ missionId: 'M-ACT', businessId: 'SYSTEM_INTERNAL', state: 'SCRIPTING', currentStage: 'SCRIPTING' }),
        missionFixture({ missionId: 'M-DONE', businessId: 'SYSTEM_INTERNAL', state: 'COMPLETED', currentStage: 'COMPLETED' })
      ]
    }
  });

  assert.equal(snapshot.missionQueue.activeMissions.length, 1);
  assert.equal(snapshot.missionQueue.completedMissions.length, 1);
  assert.equal(snapshot.missionQueue.missionCards.length, 2);
});

test('executive alerts and pending approvals are summarized', () => {
  const operationsCenter = new OperationsCenter();
  const dashboard = new CEODashboard({
    operationsCenter,
    now: () => Date.parse('2026-07-09T00:40:00.000Z')
  });

  const snapshot = dashboard.generateSnapshot({
    operationsInput: {
      runtimeMissions: [
        missionFixture({
          missionId: 'M-CEO',
          businessId: 'SYSTEM_INTERNAL',
          state: 'CEO_DECISION_PENDING',
          currentStage: 'CEO_DECISION_PENDING',
          qualityPassed: true
        })
      ],
      providerRegistry: {
        status: 'FAILED'
      }
    }
  });

  assert.equal(snapshot.executiveSummary.pendingCEOApprovals >= 1, true);
  assert.equal(snapshot.executiveDecisionsRequired.items.length >= 1, true);
  assert.equal(snapshot.executiveSummary.criticalAlerts >= 1, true);
});

test('risk prioritization sorts recommended actions CRITICAL > HIGH > MEDIUM > LOW', () => {
  const dashboard = new CEODashboard({
    now: () => Date.parse('2026-07-09T00:50:00.000Z')
  });

  const snapshot = dashboard.generateSnapshot({
    operationsInput: {
      executiveAttentionItems: [
        { type: 'QUALITY_BLOCK', severity: 'MEDIUM', missionId: 'M1', message: 'Medium item' },
        { type: 'RUNTIME_FAILURE', severity: 'CRITICAL', missionId: 'M2', message: 'Critical item' },
        { type: 'CEO_APPROVAL', severity: 'HIGH', missionId: 'M3', message: 'High item' },
        { type: 'KNOWLEDGE_CONFLICT', severity: 'LOW', missionId: 'M4', message: 'Low item' }
      ]
    }
  });

  const priorities = snapshot.recommendedActions.map(item => item.priority);
  assert.equal(priorities[0], 'CRITICAL');
  assert.equal(priorities.includes('HIGH'), true);
  assert.equal(priorities.includes('MEDIUM'), true);
  assert.equal(priorities.includes('LOW'), true);
});

test('dashboard normalization emits required executive summary, mission card, and diagnostics schema', () => {
  const dashboard = new CEODashboard({
    now: (() => {
      let tick = 0;
      return () => Date.parse('2026-07-09T01:00:00.000Z') + (tick += 5);
    })()
  });

  const snapshot = dashboard.generateSnapshot({
    operationsInput: {
      diagnostics: {
        snapshotTimestamp: '2026-07-09T01:00:00.000Z',
        runtimeVersion: '1.0.0'
      },
      activeMissions: [
        {
          missionId: 'M-NORM-1',
          businessId: 'SYSTEM_INTERNAL',
          currentStage: 'QUALITY_REVIEW',
          qualityStatus: 'PASS',
          executiveStatus: 'CEO_DECISION_PENDING',
          publishingStatus: 'NOT_REQUESTED',
          runtimeDuration: 120000,
          activeRisks: [{ severity: 'HIGH' }],
          nextRequiredDecision: 'CEO_APPROVAL'
        }
      ],
      businessSummary: {
        businessCount: 1,
        businessProfiles: [{ businessId: 'SYSTEM_INTERNAL', displayName: 'Atlas System Internal' }]
      },
      publishingQueue: [{ missionId: 'M-NORM-1', publishingStatus: 'SCHEDULED' }],
      executiveAttentionItems: [{ type: 'CEO_APPROVAL', severity: 'HIGH', missionId: 'M-NORM-1', message: 'Approval pending.' }]
    },
    runtimeVersion: '1.0.0',
    operationsCenterVersion: '1.0.0',
    businessRegistryVersion: '1.0.0'
  });

  assert.equal(typeof snapshot.executiveSummary.overallHealth, 'string');
  assert.equal(typeof snapshot.executiveSummary.businessCount, 'number');
  assert.equal(typeof snapshot.executiveSummary.activeMissionCount, 'number');
  assert.equal(typeof snapshot.executiveSummary.criticalAlerts, 'number');
  assert.equal(typeof snapshot.executiveSummary.pendingCEOApprovals, 'number');
  assert.equal(typeof snapshot.executiveSummary.publishingReady, 'number');
  assert.equal('highestPriorityRecommendation' in snapshot.executiveSummary, true);

  assert.equal(snapshot.missionQueue.missionCards.length, 1);
  const card = snapshot.missionQueue.missionCards[0];
  assert.equal(typeof card.missionId, 'string');
  assert.equal(typeof card.businessName, 'string');
  assert.equal(typeof card.currentStage, 'string');
  assert.equal(typeof card.qualityDecision, 'string');
  assert.equal(typeof card.executiveDecision, 'string');
  assert.equal(typeof card.publishStatus, 'string');
  assert.equal(typeof card.runtimeDuration, 'number');
  assert.equal(typeof card.riskLevel, 'string');
  assert.equal(typeof card.nextAction, 'string');

  assert.equal(typeof snapshot.diagnostics.snapshotTimestamp, 'string');
  assert.equal(typeof snapshot.diagnostics.generationTime, 'number');
  assert.equal(typeof snapshot.diagnostics.runtimeVersion, 'string');
  assert.equal(typeof snapshot.diagnostics.operationsCenterVersion, 'string');
  assert.equal(typeof snapshot.diagnostics.businessRegistryVersion, 'string');
});
