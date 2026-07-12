import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';
import { ExecutiveProjectionProviderRegistry } from './executive-projection-provider-registry.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function createProjectionEnvelope({
  providerId,
  projectionId = null,
  projectionType,
  contractVersion = '1.0.0',
  source,
  status,
  generatedAt,
  aggregateMetrics = {},
  warnings = [],
  incidents = [],
  payload = null,
  freshness = null
} = {}, { now } = {}) {
  const timestamp = generatedAt ?? isoNow(now);
  const resolvedProjectionId = projectionId
    ?? `${providerId ?? 'projection.provider'}.${String(timestamp).replace(/[:.]/g, '-')}`;
  return {
    providerId,
    projectionId: resolvedProjectionId,
    projectionType,
    contractVersion,
    source,
    status,
    generatedAt: timestamp,
    timestamp,
    aggregateMetrics,
    warnings: Array.isArray(warnings) ? warnings : [],
    incidents: Array.isArray(incidents) ? incidents : [],
    freshness: freshness ?? {
      policy: 'MAX_AGE_MS',
      checkedAt: isoNow(now),
      stale: false
    },
    payload
  };
}

export function createExecutiveProjectionProviderRegistry({
  operationsTelemetryAggregator,
  websiteProductionManager,
  customerPortalManager,
  now,
  logger,
  providers = []
} = {}) {
  const registry = new ExecutiveProjectionProviderRegistry({ now, logger });

  registry.registerProvider({
    providerId: 'operations.telemetry.provider',
    projectionType: 'OPERATIONS_TELEMETRY',
    contractVersion: '1.0.0',
    required: true,
    sourceDomain: 'OperationsLoop',
    maxAgeMs: 10 * 60 * 1000,
    dependencies: ['operationsLoopManager', 'providerHealthAdapter'],
    isHealthy: () => Boolean(operationsTelemetryAggregator && typeof operationsTelemetryAggregator.buildProjection === 'function'),
    project: () => {
      if (!operationsTelemetryAggregator || typeof operationsTelemetryAggregator.buildProjection !== 'function') {
        throw new Error('Operations telemetry aggregator is not connected.');
      }

      const base = operationsTelemetryAggregator.buildProjection();
      return createProjectionEnvelope({
        providerId: 'operations.telemetry.provider',
        projectionType: 'OPERATIONS_TELEMETRY',
        source: 'ExecutiveOperationsTelemetryAggregator',
        status: base?.status ?? DataAvailabilityStatuses.PARTIAL,
        generatedAt: base?.timestamp,
        aggregateMetrics: base?.aggregateMetrics ?? {},
        warnings: base?.warnings ?? [],
        incidents: base?.incidents ?? [],
        payload: base?.payload ?? null
      }, { now });
    }
  });

  registry.registerProvider({
    providerId: 'website.production.provider',
    projectionType: 'WEBSITE_PRODUCTION',
    contractVersion: '1.0.0',
    required: false,
    sourceDomain: 'WebsiteProduction',
    maxAgeMs: 15 * 60 * 1000,
    dependencies: ['websiteProductionManager'],
    isHealthy: () => {
      if (!websiteProductionManager) return false;
      return typeof websiteProductionManager.getDashboardProjection === 'function';
    },
    project: () => {
      if (!websiteProductionManager || typeof websiteProductionManager.getDashboardProjection !== 'function') {
        return createProjectionEnvelope({
          providerId: 'website.production.provider',
          projectionType: 'WEBSITE_PRODUCTION',
          source: 'WebsiteProductionProviderAdapter',
          status: DataAvailabilityStatuses.PARTIAL,
          aggregateMetrics: {
            totalReviews: 0,
            awaitingCeoApproval: 0
          },
          warnings: ['Website production projection provider is unavailable.'],
          incidents: [],
          payload: {
            status: DataAvailabilityStatuses.PARTIAL,
            totalReviews: 0,
            awaitingCeoApproval: 0,
            records: []
          }
        }, { now });
      }

      const payload = websiteProductionManager.getDashboardProjection();
      return createProjectionEnvelope({
        providerId: 'website.production.provider',
        projectionType: 'WEBSITE_PRODUCTION',
        source: 'WebsiteProductionManager',
        status: payload?.status ?? DataAvailabilityStatuses.PARTIAL,
        aggregateMetrics: {
          totalReviews: Number(payload?.totalReviews ?? 0),
          awaitingCeoApproval: Number(payload?.awaitingCeoApproval ?? 0)
        },
        warnings: [],
        incidents: [],
        payload
      }, { now });
    }
  });

  registry.registerProvider({
    providerId: 'customer.portal.provider',
    projectionType: 'CUSTOMER_PORTAL',
    contractVersion: '1.0.0',
    required: false,
    sourceDomain: 'CustomerPortal',
    maxAgeMs: 15 * 60 * 1000,
    dependencies: ['customerPortalManager'],
    isHealthy: () => {
      if (!customerPortalManager) return false;
      return typeof customerPortalManager.getDashboardProjection === 'function';
    },
    project: () => {
      if (!customerPortalManager || typeof customerPortalManager.getDashboardProjection !== 'function') {
        return createProjectionEnvelope({
          providerId: 'customer.portal.provider',
          projectionType: 'CUSTOMER_PORTAL',
          source: 'CustomerPortalProviderAdapter',
          status: DataAvailabilityStatuses.PARTIAL,
          aggregateMetrics: {
            totalRequests: 0,
            totalRevisionRequests: 0
          },
          warnings: ['Customer portal projection provider is unavailable.'],
          incidents: [],
          payload: {
            status: DataAvailabilityStatuses.PARTIAL,
            totalRequests: 0,
            totalRevisionRequests: 0,
            auth: null,
            payments: null
          }
        }, { now });
      }

      const payload = customerPortalManager.getDashboardProjection();
      return createProjectionEnvelope({
        providerId: 'customer.portal.provider',
        projectionType: 'CUSTOMER_PORTAL',
        source: 'CustomerPortalManager',
        status: payload?.status ?? DataAvailabilityStatuses.PARTIAL,
        aggregateMetrics: {
          totalRequests: Number(payload?.totalRequests ?? 0),
          totalRevisionRequests: Number(payload?.totalRevisionRequests ?? 0)
        },
        warnings: [],
        incidents: [],
        payload
      }, { now });
    }
  });

  registry.registerProviders(providers);

  return registry;
}
