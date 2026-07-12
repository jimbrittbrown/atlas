const test = require('node:test');
const assert = require('node:assert/strict');
const { ProviderRegistry } = require('./provider-registry.js');
const { CredentialRegistry } = require('./credential-registry.js');
const { OperationsCenter } = require('../operations/operations-center.js');
const { CEODashboard } = require('../dashboard/ceo-dashboard.js');

function buildCredentialRegistry() {
  return new CredentialRegistry({
    environment: 'production',
    initialCredentials: [
      {
        credentialId: 'GOOGLE_CLOUD_PROJECT',
        providerId: 'GOOGLE_CLOUD',
        environment: 'production',
        configured: true,
        verified: true,
        lastValidated: '2026-07-09T00:00:00.000Z',
        requiredScopes: [],
        status: 'VERIFIED',
        validationMessage: 'Configured and verified.'
      },
      {
        credentialId: 'GOOGLE_APPLICATION_CREDENTIALS_JSON',
        providerId: 'GOOGLE_CLOUD',
        environment: 'production',
        configured: true,
        verified: true,
        lastValidated: '2026-07-09T00:00:00.000Z',
        requiredScopes: [],
        status: 'VERIFIED',
        validationMessage: 'Configured and verified.'
      }
    ]
  });
}

test('provider registration includes canonical providers', () => {
  const registry = new ProviderRegistry();

  assert.equal(registry.hasProvider('GOOGLE_CLOUD'), true);
  assert.equal(registry.hasProvider('VERTEX_AI'), true);
  assert.equal(registry.hasProvider('GEMINI'), true);
  assert.equal(registry.hasProvider('YOUTUBE'), true);
  assert.equal(registry.hasProvider('ELEVENLABS'), true);
  assert.equal(registry.getProviderCount() >= 5, true);
});

test('duplicate provider registration is rejected', () => {
  const registry = new ProviderRegistry({ initialProviders: [] });

  registry.registerProvider({
    providerId: 'CUSTOM_PROVIDER',
    displayName: 'Custom Provider',
    category: 'OTHER',
    status: 'ENABLED',
    environment: 'production',
    health: 'UNKNOWN',
    capabilities: [],
    requiredCredentials: []
  });

  assert.throws(
    () => registry.registerProvider({
      providerId: 'CUSTOM_PROVIDER',
      displayName: 'Custom Provider',
      category: 'OTHER',
      status: 'ENABLED',
      environment: 'production',
      health: 'UNKNOWN',
      capabilities: [],
      requiredCredentials: []
    }),
    /Provider already registered/
  );
});

test('provider validation reports unknown providers', () => {
  const registry = new ProviderRegistry();
  const credentials = buildCredentialRegistry();

  const result = registry.validateProviderConfiguration({
    providerId: 'NON_EXISTENT',
    environment: 'production',
    credentialRegistry: credentials
  });

  assert.equal(result.isValid, false);
  assert.equal(result.code, 'UNKNOWN_PROVIDER');
});

test('provider validation reports disabled providers', () => {
  const registry = new ProviderRegistry({
    initialProviders: [
      {
        providerId: 'DISABLED_TEST',
        displayName: 'Disabled Test',
        category: 'OTHER',
        status: 'DISABLED',
        environment: 'production',
        health: 'UNKNOWN',
        capabilities: [],
        requiredCredentials: []
      }
    ]
  });

  const result = registry.validateProviderConfiguration({
    providerId: 'DISABLED_TEST',
    environment: 'production',
    credentialRegistry: new CredentialRegistry({ environment: 'production' })
  });

  assert.equal(result.isValid, false);
  assert.equal(result.code, 'DISABLED_PROVIDER');
});

test('provider validation reports environment mismatch', () => {
  const registry = new ProviderRegistry({
    initialProviders: [
      {
        providerId: 'ENV_TEST',
        displayName: 'Environment Test',
        category: 'OTHER',
        status: 'ENABLED',
        environment: 'staging',
        health: 'UNKNOWN',
        capabilities: [],
        requiredCredentials: []
      }
    ]
  });

  const result = registry.validateProviderConfiguration({
    providerId: 'ENV_TEST',
    environment: 'production',
    credentialRegistry: new CredentialRegistry({ environment: 'production' })
  });

  assert.equal(result.isValid, false);
  assert.equal(result.code, 'ENVIRONMENT_MISMATCH');
});

test('provider summary and operations integration expose provider signals', () => {
  const providerRegistry = new ProviderRegistry({
    initialProviders: [
      {
        providerId: 'HEALTHY_PROVIDER',
        displayName: 'Healthy Provider',
        category: 'OTHER',
        status: 'ENABLED',
        environment: 'production',
        health: 'HEALTHY',
        capabilities: [],
        requiredCredentials: ['HEALTHY_CRED'],
        quotaStatus: {
          status: 'WARNING',
          warnings: ['LOW_REMAINING_QUOTA']
        }
      },
      {
        providerId: 'FAILED_PROVIDER',
        displayName: 'Failed Provider',
        category: 'OTHER',
        status: 'ENABLED',
        environment: 'production',
        health: 'FAILED',
        capabilities: [],
        requiredCredentials: ['FAILED_CRED'],
        quotaStatus: {
          status: 'UNKNOWN',
          warnings: []
        }
      }
    ]
  });

  const credentialRegistry = new CredentialRegistry({
    environment: 'production',
    initialCredentials: [
      {
        credentialId: 'HEALTHY_CRED',
        providerId: 'HEALTHY_PROVIDER',
        environment: 'production',
        configured: true,
        verified: true,
        requiredScopes: [],
        status: 'VERIFIED',
        validationMessage: 'ok'
      }
    ]
  });

  const providerSummary = providerRegistry.getProviderSummary({
    environment: 'production',
    credentialRegistry
  });

  assert.equal(providerSummary.providerCount, 2);
  assert.equal(providerSummary.healthyProviders, 1);
  assert.equal(providerSummary.failedProviders.includes('FAILED_PROVIDER'), true);
  assert.equal(providerSummary.quotaWarnings.length, 1);

  const operationsCenter = new OperationsCenter();
  const snapshot = operationsCenter.snapshot({
    providerRegistry: {
      status: providerRegistry.getHealth(),
      ...providerSummary,
      missingCredentials: ['FAILED_CRED']
    },
    credentialRegistry: {
      status: 'WARNING',
      credentialCount: 1,
      configuredCredentials: 1,
      verifiedCredentials: 1,
      warningCredentials: 1,
      verificationFailures: ['FAILED_PROVIDER']
    }
  });

  assert.equal(typeof snapshot.providerSummary, 'object');
  assert.equal(typeof snapshot.credentialSummary, 'object');
  assert.equal(Array.isArray(snapshot.missingCredentials), true);
  assert.equal(Array.isArray(snapshot.failedProviders), true);
  assert.equal(Array.isArray(snapshot.quotaWarnings), true);
  assert.equal(Array.isArray(snapshot.verificationFailures), true);

  const dashboard = new CEODashboard();
  const ceo = dashboard.generateSnapshot({
    operationsInput: snapshot
  });

  assert.equal(typeof ceo.executiveSummary.configuredProviders, 'number');
  assert.equal(typeof ceo.executiveSummary.healthyProviders, 'number');
  assert.equal(typeof ceo.executiveSummary.credentialWarnings, 'number');
  assert.equal(typeof ceo.executiveSummary.providerAlerts, 'number');
  assert.equal(typeof ceo.executiveSummary.productionReadyProviders, 'number');
});
