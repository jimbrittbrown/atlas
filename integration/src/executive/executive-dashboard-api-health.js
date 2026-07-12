import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

export class ExecutiveDashboardApiHealth {
  project({
    auth,
    dashboard,
    snapshotRegistry,
    retention,
    rateLimiter,
    auditLog,
    lastSnapshot = null,
    lastError = null
  } = {}) {
    const authConfigured = Boolean(auth?.isConfigured?.());
    const dashboardAvailable = Boolean(dashboard);
    const snapshotRegistryAvailable = Boolean(snapshotRegistry);

    let dashboardGenerationStatus = DataAvailabilityStatuses.PARTIAL;
    if (lastSnapshot) dashboardGenerationStatus = DataAvailabilityStatuses.AVAILABLE;
    if (!dashboardAvailable) dashboardGenerationStatus = DataAvailabilityStatuses.UNAVAILABLE;

    const readinessScore = [
      authConfigured ? 1 : 0,
      dashboardAvailable ? 1 : 0,
      snapshotRegistryAvailable ? 1 : 0,
      lastError ? 0 : 1
    ].reduce((sum, value) => sum + value, 0) / 4;

    let readinessClassification = 'NOT_READY';
    if (readinessScore >= 0.9) readinessClassification = 'READY';
    else if (readinessScore >= 0.6) readinessClassification = 'PARTIALLY_READY';

    return {
      apiStatus: 'AVAILABLE',
      authenticationConfigured: authConfigured,
      dashboardFacadeAvailable: dashboardAvailable,
      snapshotRegistryAvailable,
      dashboardGenerationStatus,
      lastSuccessfulSnapshot: lastSnapshot
        ? {
            snapshotId: lastSnapshot.snapshotId,
            createdAt: lastSnapshot.createdAt,
            generatedAt: lastSnapshot.snapshot?.generatedAt ?? null
          }
        : null,
      lastDashboardError: lastError ? { message: lastError.message ?? String(lastError), timestamp: new Date().toISOString() } : null,
      rateLimiterStatus: rateLimiter?.getStatus?.() ?? { enabled: false },
      auditLoggerStatus: auditLog?.getStatus?.() ?? { enabled: false },
      persistenceStatus: retention?.getStatus?.() ?? { enabled: false, persistence: 'UNKNOWN' },
      readinessClassification,
      readinessScore: Number(readinessScore.toFixed(4)),
      knownLimitations: [
        'v1 uses in-memory rate limiting and snapshot retention.',
        'v1 token auth is env-var based and should be replaced with managed secrets in production.'
      ]
    };
  }
}
