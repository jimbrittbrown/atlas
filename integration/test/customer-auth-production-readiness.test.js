import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CustomerAuthManager } from '../src/executive/customer-auth-manager.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { createCustomerIdentityProvider } from '../src/executive/customer-identity-provider-factory.js';
import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';

const VALID_KEYRING = JSON.stringify({
  v1: Buffer.alloc(32, 7).toString('base64')
});

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides ?? {})) {
    previous.set(key, process.env[key]);
    if (value == null) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createFetchMock({ issuer = 'https://issuer.example' } = {}) {
  return async (url) => {
    if (String(url).endsWith('/.well-known/openid-configuration')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          end_session_endpoint: `${issuer}/logout`
        })
      };
    }

    if (String(url).endsWith('/jwks')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ keys: [] })
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({})
    };
  };
}

function createAuthManager({
  environment = 'development',
  providerType = 'oidc',
  oidcExperimentalEnabled = true,
  fetchImpl = createFetchMock(),
  storageProvider = null
} = {}) {
  return new CustomerAuthManager({
    missionControl: new CustomerIntakeMissionControl(),
    storageProvider,
    environment,
    providerFactoryArgs: {
      providerType,
      oidcExperimentalEnabled,
      fetchImpl
    }
  });
}

function createStorageProvider() {
  const base = mkdtempSync(join(tmpdir(), 'atlas-auth-production-readiness-'));
  return new SQLiteStorageProvider({ databasePath: join(base, 'auth.sqlite') });
}

test('production startup validation fails when required OIDC secret is missing', async () => {
  await withEnv({
    NODE_ENV: 'production',
    ATLAS_IDENTITY_PROVIDER: 'oidc',
    ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE: 'production',
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: null,
    ATLAS_AUTH_ENCRYPTION_KEY_VERSION: 'v1',
    ATLAS_AUTH_ENCRYPTION_KEYRING_JSON: VALID_KEYRING,
    ATLAS_IDENTITY_OIDC_CALLBACK_URLS: 'https://portal.atlas.example/oidc/callback'
  }, async () => {
    assert.throws(() => createAuthManager({ environment: 'production' }), /AUTH_STARTUP_VALIDATION_FAILED/);
  });
});

test('production startup validation fails on invalid callback configuration', async () => {
  await withEnv({
    NODE_ENV: 'production',
    ATLAS_IDENTITY_PROVIDER: 'oidc',
    ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE: 'production',
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret',
    ATLAS_AUTH_ENCRYPTION_KEY_VERSION: 'v1',
    ATLAS_AUTH_ENCRYPTION_KEYRING_JSON: VALID_KEYRING,
    ATLAS_IDENTITY_OIDC_CALLBACK_URLS: 'http://localhost/callback'
  }, async () => {
    assert.throws(() => createAuthManager({ environment: 'production' }), /AUTH_STARTUP_VALIDATION_FAILED/);
  });
});

test('disabled provider rollout blocks auth flows with graceful degradation', async () => {
  await withEnv({
    NODE_ENV: 'development',
    ATLAS_IDENTITY_PROVIDER: 'oidc',
    ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE: 'disabled',
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret',
    ATLAS_IDENTITY_OIDC_CALLBACK_URLS: 'https://portal.atlas.example/oidc/callback',
    ATLAS_AUTH_ENCRYPTION_KEY_VERSION: 'v1',
    ATLAS_AUTH_ENCRYPTION_KEYRING_JSON: VALID_KEYRING
  }, async () => {
    const manager = createAuthManager({ environment: 'development' });
    const started = await manager.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/oidc/callback'
    });

    assert.equal(manager.providerBlocked(), true);
    assert.equal(started.accepted, false);
    assert.equal(started.status, 503);
  });
});

test('rollout transitions are configurable without code changes', async () => {
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const stages = ['experimental', 'internal', 'beta', 'production'];
    for (const stage of stages) {
      const selection = createCustomerIdentityProvider({
        providerType: 'oidc',
        environment: 'development',
        oidcRolloutStage: stage,
        oidcExperimentalEnabled: true,
        fetchImpl: createFetchMock()
      });

      assert.equal(selection.rollout.stage, stage);
      assert.equal(selection.rollout.enabled, true);
      assert.equal(selection.blocked, false);
    }
  });
});

test('production startup validation succeeds with complete configuration', async () => {
  await withEnv({
    NODE_ENV: 'production',
    ATLAS_IDENTITY_PROVIDER: 'oidc',
    ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE: 'production',
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret',
    ATLAS_AUTH_ENCRYPTION_KEY_VERSION: 'v1',
    ATLAS_AUTH_ENCRYPTION_KEYRING_JSON: VALID_KEYRING,
    ATLAS_IDENTITY_OIDC_CALLBACK_URLS: 'https://portal.atlas.example/oidc/callback'
  }, async () => {
    const storageProvider = createStorageProvider();
    const manager = createAuthManager({ environment: 'production', storageProvider });
    const readiness = manager.getAuthHealth().startupReadiness;
    assert.equal(readiness.ready, true);
    assert.equal(readiness.failStartup, false);
    storageProvider.closeSync();
  });
});

test('emergency provider disable prevents startup in production', async () => {
  await withEnv({
    NODE_ENV: 'production',
    ATLAS_IDENTITY_PROVIDER: 'oidc',
    ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE: 'production',
    ATLAS_IDENTITY_GLOBAL_EMERGENCY_DISABLE: 'true',
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret',
    ATLAS_AUTH_ENCRYPTION_KEY_VERSION: 'v1',
    ATLAS_AUTH_ENCRYPTION_KEYRING_JSON: VALID_KEYRING,
    ATLAS_IDENTITY_OIDC_CALLBACK_URLS: 'https://portal.atlas.example/oidc/callback'
  }, async () => {
    assert.throws(() => createAuthManager({ environment: 'production' }), /AUTH_STARTUP_VALIDATION_FAILED/);
  });
});

test('readiness reporting includes operational health dimensions', async () => {
  await withEnv({
    NODE_ENV: 'development',
    ATLAS_IDENTITY_PROVIDER: 'oidc',
    ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE: 'beta',
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret',
    ATLAS_AUTH_ENCRYPTION_KEY_VERSION: 'v1',
    ATLAS_AUTH_ENCRYPTION_KEYRING_JSON: VALID_KEYRING,
    ATLAS_IDENTITY_OIDC_CALLBACK_URLS: 'https://portal.atlas.example/oidc/callback'
  }, async () => {
    const manager = createAuthManager({ environment: 'development' });
    const health = manager.getAuthHealth();

    assert.equal(typeof health.operationalHealth.providerDiscoveryStatus, 'string');
    assert.equal(typeof health.operationalHealth.jwksFreshness, 'string');
    assert.equal(typeof health.operationalHealth.keyVersion, 'string');
    assert.equal(typeof health.operationalHealth.callbackReadiness, 'boolean');
    assert.equal(typeof health.operationalHealth.refreshReadiness, 'boolean');
    assert.equal(typeof health.operationalHealth.logoutReadiness, 'boolean');
    assert.equal(typeof health.startupReadiness.ready, 'boolean');
    assert.equal(health.providerRollout.stage, 'beta');
  });
});
