import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveProjectionProviderRegistry } from '../src/executive/executive-projection-provider-registry.js';

function createProvider({
  providerId = 'operations.telemetry.provider',
  projectionType = 'OPERATIONS_TELEMETRY',
  contractVersion = '1.0.0',
  required = true,
  sourceDomain = 'OperationsLoop',
  maxAgeMs = 60_000,
  isHealthy,
  project
} = {}) {
  return {
    providerId,
    projectionType,
    contractVersion,
    required,
    sourceDomain,
    maxAgeMs,
    isHealthy,
    project: project ?? (() => ({
      providerId,
      projectionId: `${providerId}.projection.1`,
      projectionType,
      contractVersion,
      source: 'test',
      status: 'AVAILABLE',
      generatedAt: new Date().toISOString(),
      aggregateMetrics: {},
      warnings: [],
      incidents: []
    }))
  };
}

test('registers valid provider contract', () => {
  const registry = new ExecutiveProjectionProviderRegistry();
  registry.registerProvider(createProvider());

  const provider = registry.getProvider('operations.telemetry.provider');
  assert.equal(provider.providerId, 'operations.telemetry.provider');
  assert.equal(provider.contractVersion, '1.0.0');
});

test('rejects duplicate provider ID registration', () => {
  const registry = new ExecutiveProjectionProviderRegistry();
  registry.registerProvider(createProvider());

  assert.throws(() => {
    registry.registerProvider(createProvider());
  }, /already registered/i);
});

test('rejects duplicate projection ownership', () => {
  const registry = new ExecutiveProjectionProviderRegistry();
  registry.registerProvider(createProvider({
    providerId: 'operations.telemetry.provider',
    projectionType: 'OPERATIONS_TELEMETRY'
  }));

  assert.throws(() => {
    registry.registerProvider(createProvider({
      providerId: 'operations.telemetry.backup.provider',
      projectionType: 'OPERATIONS_TELEMETRY'
    }));
  }, /already owned/i);
});

test('throws when resolving unknown provider', () => {
  const registry = new ExecutiveProjectionProviderRegistry();
  assert.throws(() => {
    registry.getProvider('missing.provider');
  }, /Unknown projection provider/i);
});

test('rejects unsupported contract versions on registration', () => {
  const registry = new ExecutiveProjectionProviderRegistry();

  assert.throws(() => {
    registry.registerProvider(createProvider({ contractVersion: '2.0.0' }));
  }, /Unsupported contractVersion/i);
});

test('surfaces provider health failure', () => {
  const registry = new ExecutiveProjectionProviderRegistry();
  registry.registerProvider(createProvider({
    isHealthy: () => false
  }));

  const result = registry.invokeProvider('operations.telemetry.provider');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UNHEALTHY');
  assert.equal(result.failure.type, 'PROVIDER_HEALTH_FAILURE');
});

test('isolates provider projection exceptions', () => {
  const registry = new ExecutiveProjectionProviderRegistry();
  registry.registerProvider(createProvider({
    project: () => {
      throw new Error('provider crash');
    }
  }));

  const result = registry.invokeProvider('operations.telemetry.provider');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'PROJECTION_EXCEPTION');
  assert.equal(result.failure.type, 'PROVIDER_PROJECTION_EXCEPTION');
});

test('rejects malformed projection payloads', () => {
  const registry = new ExecutiveProjectionProviderRegistry();
  registry.registerProvider(createProvider({
    project: () => ({ invalid: true })
  }));

  const result = registry.invokeProvider('operations.telemetry.provider');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'INVALID_PROJECTION');
  assert.equal(result.failure.type, 'MALFORMED_PROJECTION');
});

test('returns stale status for stale projection timestamps', () => {
  const registry = new ExecutiveProjectionProviderRegistry();
  const staleTs = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  registry.registerProvider(createProvider({
    maxAgeMs: 60_000,
    project: () => ({
      providerId: 'operations.telemetry.provider',
      projectionId: 'operations.telemetry.provider.stale',
      projectionType: 'OPERATIONS_TELEMETRY',
      contractVersion: '1.0.0',
      source: 'test',
      status: 'AVAILABLE',
      generatedAt: staleTs,
      aggregateMetrics: {},
      warnings: [],
      incidents: []
    })
  }));

  const result = registry.invokeProvider('operations.telemetry.provider');
  assert.equal(result.ok, true);
  assert.equal(result.status, 'STALE');
  assert.equal(result.freshness.isStale, true);
});

test('fails safely on malformed projection timestamps', () => {
  const registry = new ExecutiveProjectionProviderRegistry();
  registry.registerProvider(createProvider({
    project: () => ({
      providerId: 'operations.telemetry.provider',
      projectionId: 'operations.telemetry.provider.bad-ts',
      projectionType: 'OPERATIONS_TELEMETRY',
      contractVersion: '1.0.0',
      source: 'test',
      status: 'AVAILABLE',
      generatedAt: 'not-a-time',
      aggregateMetrics: {},
      warnings: [],
      incidents: []
    })
  }));

  const result = registry.invokeProvider('operations.telemetry.provider');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'MALFORMED_TIMESTAMP');
  assert.equal(result.failure.type, 'MALFORMED_TIMESTAMP');
});
