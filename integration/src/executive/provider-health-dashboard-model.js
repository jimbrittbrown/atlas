import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

const KnownProviders = ['Framer', 'Google', 'YouTube', 'Gemini', 'ElevenLabs'];

function normalizeProviderName(name) {
  return String(name ?? '').trim() || 'UNKNOWN_PROVIDER';
}

export class ProviderHealthDashboardModel {
  project({ providerStatuses = [], discoveredProviders = [] } = {}) {
    const map = new Map();

    KnownProviders.forEach((provider) => {
      map.set(provider.toUpperCase(), {
        providerName: provider,
        configuredStatus: DataAvailabilityStatuses.NOT_CONFIGURED,
        authenticationStatus: DataAvailabilityStatuses.NOT_CONFIGURED,
        connectionStatus: DataAvailabilityStatuses.NOT_CONFIGURED,
        readCapabilityStatus: DataAvailabilityStatuses.NOT_CONFIGURED,
        writeCapabilityStatus: DataAvailabilityStatuses.NOT_CONFIGURED,
        lastSuccessfulCheck: null,
        lastFailure: null,
        warnings: ['Provider telemetry not configured in dashboard adapter.'],
        blockingIssues: [],
        capabilityLimitations: []
      });
    });

    discoveredProviders.forEach((providerName) => {
      const normalized = normalizeProviderName(providerName);
      const key = normalized.toUpperCase();
      if (!map.has(key)) {
        map.set(key, {
          providerName: normalized,
          configuredStatus: DataAvailabilityStatuses.NOT_CONNECTED,
          authenticationStatus: DataAvailabilityStatuses.NOT_CONNECTED,
          connectionStatus: DataAvailabilityStatuses.NOT_CONNECTED,
          readCapabilityStatus: DataAvailabilityStatuses.NOT_CONNECTED,
          writeCapabilityStatus: DataAvailabilityStatuses.NOT_CONNECTED,
          lastSuccessfulCheck: null,
          lastFailure: null,
          warnings: ['Provider discovered but no health adapter configured.'],
          blockingIssues: [],
          capabilityLimitations: []
        });
      }
    });

    providerStatuses.forEach((provider) => {
      const key = normalizeProviderName(provider.providerName).toUpperCase();
      map.set(key, {
        providerName: normalizeProviderName(provider.providerName),
        configuredStatus: provider.configuredStatus ?? DataAvailabilityStatuses.PARTIAL,
        authenticationStatus: provider.authenticationStatus ?? DataAvailabilityStatuses.PARTIAL,
        connectionStatus: provider.connectionStatus ?? DataAvailabilityStatuses.PARTIAL,
        readCapabilityStatus: provider.readCapabilityStatus ?? DataAvailabilityStatuses.PARTIAL,
        writeCapabilityStatus: provider.writeCapabilityStatus ?? DataAvailabilityStatuses.PARTIAL,
        lastSuccessfulCheck: provider.lastSuccessfulCheck ?? null,
        lastFailure: provider.lastFailure ?? null,
        warnings: provider.warnings ?? [],
        blockingIssues: provider.blockingIssues ?? [],
        capabilityLimitations: provider.capabilityLimitations ?? []
      });
    });

    const providers = Array.from(map.values());

    return {
      status: providers.length === 0 ? DataAvailabilityStatuses.UNAVAILABLE : DataAvailabilityStatuses.PARTIAL,
      providers
    };
  }
}
