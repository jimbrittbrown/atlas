import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLoopHealth(loopState) {
  const state = String(loopState ?? 'UNKNOWN').toUpperCase();
  if (state === 'FAILED') return 'CRITICAL';
  if (state === 'DEGRADED' || state === 'PAUSED') return 'WARNING';
  if (state === 'RUNNING' || state === 'SLEEPING' || state === 'STOPPED') return 'HEALTHY';
  return 'UNKNOWN';
}

function summarizeProviderAvailability(providerStatuses = []) {
  const total = providerStatuses.length;
  const unavailable = providerStatuses.filter((provider) => String(provider?.connectionStatus ?? '').toUpperCase() !== 'AVAILABLE').length;
  const degraded = providerStatuses.filter((provider) => (provider?.blockingIssues ?? []).length > 0).length;

  return {
    totalProviders: total,
    unavailableProviders: unavailable,
    degradedProviders: degraded,
    availableProviders: Math.max(total - unavailable, 0)
  };
}

function validateRequiredTelemetry(projection) {
  const issues = [];

  if (!isObject(projection.runtimeLoopStatus)) {
    issues.push('runtimeLoopStatus is required.');
  }

  if (!isObject(projection.aggregateMetrics)) {
    issues.push('aggregateMetrics is required.');
  }

  if (!isObject(projection.recoveryState)) {
    issues.push('recoveryState is required.');
  }

  if (!Array.isArray(projection.activeAlerts)) {
    issues.push('activeAlerts must be an array.');
  }

  if (!Array.isArray(projection.incidents)) {
    issues.push('incidents must be an array.');
  }

  if (!Array.isArray(projection.warnings)) {
    issues.push('warnings must be an array.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export class ExecutiveOperationsTelemetryAggregator {
  constructor({ operationsLoopManager, providerHealthAdapter, now, logger } = {}) {
    this.operationsLoopManager = operationsLoopManager ?? null;
    this.providerHealthAdapter = providerHealthAdapter ?? { getProviderStatuses: () => [] };
    this.now = now;
    this.logger = logger ?? { log: () => {} };
  }

  buildProjection() {
    if (!this.operationsLoopManager || typeof this.operationsLoopManager.getDashboardProjection !== 'function') {
      throw new Error('Required operations telemetry source is unavailable.');
    }

    const generatedAt = nowIso(this.now);
    const loopProjection = this.operationsLoopManager.getDashboardProjection();
    const providerStatuses = this.providerHealthAdapter?.getProviderStatuses?.() ?? [];
    const providerSummary = summarizeProviderAvailability(providerStatuses);

    const projection = {
      projectionId: 'operations.telemetry',
      projectionType: 'OPERATIONS_TELEMETRY',
      source: 'ExecutiveOperationsLoopManager',
      status: loopProjection?.lastCompletedCycle
        ? DataAvailabilityStatuses.AVAILABLE
        : DataAvailabilityStatuses.PARTIAL,
      timestamp: generatedAt,
      payload: loopProjection,
      aggregateMetrics: {
        totalCycles: Number(loopProjection?.metrics?.totalCycles ?? 0),
        successfulCycles: Number(loopProjection?.metrics?.successfulCycles ?? 0),
        warningCycles: Number(loopProjection?.metrics?.warningCycles ?? 0),
        failedCycles: Number(loopProjection?.metrics?.failedCycles ?? 0),
        actionsConsidered: Number(loopProjection?.metrics?.actionsConsidered ?? 0),
        actionsExecuted: Number(loopProjection?.metrics?.actionsExecuted ?? 0),
        actionsBlocked: Number(loopProjection?.metrics?.actionsBlocked ?? 0),
        activeAlerts: Number(loopProjection?.metrics?.activeAlerts ?? 0),
        recoveriesAttempted: Number(loopProjection?.metrics?.recoveriesAttempted ?? 0),
        recoveriesSuccessful: Number(loopProjection?.metrics?.recoveriesSuccessful ?? 0),
        recoveriesEscalated: Number(loopProjection?.metrics?.recoveriesEscalated ?? 0)
      },
      warnings: Array.isArray(loopProjection?.lastCompletedCycle?.warnings)
        ? [...loopProjection.lastCompletedCycle.warnings]
        : [],
      incidents: Array.isArray(loopProjection?.lastCompletedCycle?.errors)
        ? [...loopProjection.lastCompletedCycle.errors]
        : [],
      runtimeLoopStatus: {
        loopState: loopProjection?.loopState ?? 'UNKNOWN',
        health: normalizeLoopHealth(loopProjection?.loopState),
        heartbeat: loopProjection?.heartbeat ?? null,
        configurationSummary: loopProjection?.configurationSummary ?? null,
        lastCompletedCycleState: loopProjection?.lastCompletedCycle?.state ?? null,
        nextRecommendedWakeTime: loopProjection?.lastCompletedCycle?.nextRecommendedWakeTime ?? null
      },
      missionExecutionHealth: {
        recentFindings: Array.isArray(loopProjection?.recentFindings) ? loopProjection.recentFindings.slice(0, 20) : [],
        blockedActions: Array.isArray(loopProjection?.blockedActions) ? loopProjection.blockedActions.slice(0, 20) : []
      },
      queuePressure: {
        activeAlerts: Number(loopProjection?.activeAlerts?.length ?? 0),
        pendingRecoveries: Number(loopProjection?.recoveryStatus?.recentRecoveries?.length ?? 0),
        blockedActions: Number(loopProjection?.blockedActions?.length ?? 0),
        findingsInQueue: Number(loopProjection?.recentFindings?.length ?? 0)
      },
      providerAvailabilitySummary: {
        ...providerSummary,
        providers: providerStatuses.map((provider) => ({
          providerName: provider?.providerName ?? 'UNKNOWN_PROVIDER',
          connectionStatus: provider?.connectionStatus ?? DataAvailabilityStatuses.PARTIAL,
          readCapabilityStatus: provider?.readCapabilityStatus ?? DataAvailabilityStatuses.PARTIAL,
          writeCapabilityStatus: provider?.writeCapabilityStatus ?? DataAvailabilityStatuses.PARTIAL,
          warnings: Array.isArray(provider?.warnings) ? provider.warnings : [],
          blockingIssues: Array.isArray(provider?.blockingIssues) ? provider.blockingIssues : []
        }))
      },
      recoveryState: {
        recoveryEnabled: Boolean(loopProjection?.recoveryStatus?.recoveryEnabled),
        recentRecoveries: Array.isArray(loopProjection?.recoveryStatus?.recentRecoveries)
          ? loopProjection.recoveryStatus.recentRecoveries.slice(0, 20)
          : []
      },
      activeAlerts: Array.isArray(loopProjection?.activeAlerts) ? loopProjection.activeAlerts.slice(0, 20) : []
    };

    const validation = validateRequiredTelemetry(projection);
    if (!validation.isValid) {
      throw new Error(`Required operations telemetry projection invalid: ${validation.issues.join(' | ')}`);
    }

    this.logger.log({
      event: 'executive_operations_telemetry_aggregated',
      projectionId: projection.projectionId,
      status: projection.status,
      timestamp: projection.timestamp
    });

    return projection;
  }
}
