import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveOperationsTelemetryAggregator } from '../src/executive/executive-operations-telemetry-aggregator.js';

function createLoopProjection(overrides = {}) {
  return {
    loopState: 'RUNNING',
    currentCycle: null,
    lastCompletedCycle: {
      cycleId: 'ops-cycle-1',
      state: 'COMPLETED',
      warnings: [],
      errors: [],
      nextRecommendedWakeTime: '2026-07-12T00:10:00.000Z'
    },
    heartbeat: {
      lastStartedAt: '2026-07-12T00:00:00.000Z',
      lastBeatAt: '2026-07-12T00:05:00.000Z',
      lastSuccessfulAt: '2026-07-12T00:05:00.000Z'
    },
    metrics: {
      totalCycles: 10,
      successfulCycles: 8,
      warningCycles: 1,
      failedCycles: 1,
      actionsConsidered: 20,
      actionsExecuted: 12,
      actionsBlocked: 8,
      activeAlerts: 2,
      recoveriesAttempted: 4,
      recoveriesSuccessful: 3,
      recoveriesEscalated: 1
    },
    recentFindings: [],
    recentSafeActions: [],
    blockedActions: [],
    recoveryStatus: {
      recentRecoveries: [],
      recoveryEnabled: true
    },
    activeAlerts: [],
    configurationSummary: {},
    governanceStatus: {
      dryRun: true,
      publishAttempted: false,
      deployAttempted: false,
      destructiveOperationAttempted: false,
      ceoApprovalBypassed: false,
      existingExecutionManagersReused: true
    },
    dataFreshness: [],
    limitations: [],
    ...overrides
  };
}

test('operations telemetry aggregator emits operational-only projection contract', () => {
  const aggregator = new ExecutiveOperationsTelemetryAggregator({
    operationsLoopManager: {
      getDashboardProjection() {
        return createLoopProjection();
      }
    },
    providerHealthAdapter: {
      getProviderStatuses() {
        return [{
          providerName: 'Framer',
          connectionStatus: 'AVAILABLE',
          readCapabilityStatus: 'AVAILABLE',
          writeCapabilityStatus: 'PARTIAL',
          warnings: [],
          blockingIssues: []
        }];
      }
    },
    now: () => '2026-07-12T00:06:00.000Z'
  });

  const projection = aggregator.buildProjection();

  assert.equal(projection.projectionType, 'OPERATIONS_TELEMETRY');
  assert.equal(projection.source, 'ExecutiveOperationsLoopManager');
  assert.equal(typeof projection.timestamp, 'string');
  assert.equal(typeof projection.aggregateMetrics.totalCycles, 'number');
  assert.equal(typeof projection.runtimeLoopStatus.loopState, 'string');
  assert.equal(Array.isArray(projection.warnings), true);
  assert.equal(Array.isArray(projection.incidents), true);
  assert.equal(Array.isArray(projection.activeAlerts), true);
  assert.equal(typeof projection.providerAvailabilitySummary.totalProviders, 'number');
  assert.equal(Object.prototype.hasOwnProperty.call(projection, 'customerPipeline'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, 'workforce'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, 'websiteProduction'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, 'payments'), false);
});

test('operations telemetry aggregation fails closed when required loop source is unavailable', () => {
  const aggregator = new ExecutiveOperationsTelemetryAggregator({
    operationsLoopManager: null
  });

  assert.throws(() => {
    aggregator.buildProjection();
  }, /required operations telemetry source/i);
});
