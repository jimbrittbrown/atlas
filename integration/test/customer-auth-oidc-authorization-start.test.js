import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CustomerAuthManager } from '../src/executive/customer-auth-manager.js';
import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';

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

function createDiscoveryFetchMock({ issuer = 'https://issuer.example' } = {}) {
  return async (url) => {
    if (String(url).endsWith('/.well-known/openid-configuration')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`
        })
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({})
    };
  };
}

function createAuthManager({ storageProvider, nowRef } = {}) {
  return new CustomerAuthManager({
    storageProvider,
    now: () => new Date(nowRef.value).toISOString(),
    providerFactoryArgs: {
      providerType: 'oidc',
      oidcExperimentalEnabled: true,
      fetchImpl: createDiscoveryFetchMock()
    }
  });
}

function createStorageProvider() {
  const base = mkdtempSync(join(tmpdir(), 'atlas-oidc-auth-start-'));
  return new SQLiteStorageProvider({ databasePath: join(base, 'integration.sqlite') });
}

test('successful transaction creation', async () => {
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const storageProvider = createStorageProvider();
    const nowRef = { value: Date.parse('2026-01-01T00:00:00.000Z') };
    const manager = createAuthManager({ storageProvider, nowRef });

    const started = await manager.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/callback',
      scope: 'openid profile email'
    });

    assert.equal(started.accepted, true);
    assert.equal(typeof started.data.authorizationUrl, 'string');
    assert.equal(started.data.authorizationUrl.includes('state='), true);
    assert.equal(started.data.authorizationUrl.includes('nonce='), true);
    assert.equal(started.data.authorizationUrl.includes('code_challenge='), true);
    assert.equal(started.data.expiresAt, '2026-01-01T00:10:00.000Z');

    const stored = manager.oidcTransactionStore.records.get(started.data.state);
    assert.equal('pkceVerifier' in stored, false);
    assert.equal(typeof stored.pkceVerifierEnvelope?.ciphertext, 'string');
    assert.equal(typeof stored.pkceVerifierEnvelope?.keyVersion, 'string');
  });
});

test('duplicate state rejection', async () => {
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const storageProvider = createStorageProvider();
    const nowRef = { value: Date.parse('2026-01-01T00:00:00.000Z') };
    const manager = createAuthManager({ storageProvider, nowRef });

    const first = await manager.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/callback',
      state: 'state-fixed-1'
    });
    const second = await manager.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/callback',
      state: 'state-fixed-1'
    });

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, false);
    assert.equal(second.status, 409);
    assert.equal(second.code, 'CONFLICT');
  });
});

test('expired transaction cleanup', async () => {
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const storageProvider = createStorageProvider();
    const nowRef = { value: Date.parse('2026-01-01T00:00:00.000Z') };
    const manager = createAuthManager({ storageProvider, nowRef });

    const first = await manager.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/callback',
      state: 'state-cleanup-1',
      expiresInMs: 1_000
    });
    assert.equal(first.accepted, true);

    nowRef.value += 2_000;

    const second = await manager.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/callback',
      state: 'state-cleanup-1'
    });

    assert.equal(second.accepted, true);
    assert.equal(second.data.state, 'state-cleanup-1');
  });
});

test('replay prevention', async () => {
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const storageProvider = createStorageProvider();
    const nowRef = { value: Date.parse('2026-01-01T00:00:00.000Z') };
    const manager = createAuthManager({ storageProvider, nowRef });

    const started = await manager.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/callback'
    });

    const firstConsume = manager.consumeOidcAuthorizationTransaction({
      state: started.data.state,
      provider: 'oidc',
      redirectUri: 'https://portal.atlas.example/callback'
    });
    const replayConsume = manager.consumeOidcAuthorizationTransaction({
      state: started.data.state,
      provider: 'oidc',
      redirectUri: 'https://portal.atlas.example/callback'
    });

    assert.equal(firstConsume.accepted, true);
    assert.equal(replayConsume.accepted, false);
    assert.equal(replayConsume.code, 'INVALID_STATE');
  });
});

test('TTL enforcement', async () => {
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const storageProvider = createStorageProvider();
    const nowRef = { value: Date.parse('2026-01-01T00:00:00.000Z') };
    const manager = createAuthManager({ storageProvider, nowRef });

    const started = await manager.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/callback',
      expiresInMs: 1_000
    });

    nowRef.value += 2_000;

    const consumeExpired = manager.consumeOidcAuthorizationTransaction({
      state: started.data.state,
      provider: 'oidc',
      redirectUri: 'https://portal.atlas.example/callback'
    });

    assert.equal(consumeExpired.accepted, false);
    assert.equal(consumeExpired.code, 'TOKEN_EXPIRED');
  });
});

test('provider mismatch', async () => {
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const storageProvider = createStorageProvider();
    const nowRef = { value: Date.parse('2026-01-01T00:00:00.000Z') };
    const manager = createAuthManager({ storageProvider, nowRef });

    const started = await manager.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/callback'
    });

    const mismatch = manager.consumeOidcAuthorizationTransaction({
      state: started.data.state,
      provider: 'local',
      redirectUri: 'https://portal.atlas.example/callback'
    });

    assert.equal(mismatch.accepted, false);
    assert.equal(mismatch.code, 'PROVIDER_MISMATCH');
  });
});

test('persistence recovery', async () => {
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const storageProvider = createStorageProvider();
    const nowRef = { value: Date.parse('2026-01-01T00:00:00.000Z') };

    const managerA = createAuthManager({ storageProvider, nowRef });
    const started = await managerA.startOidcAuthorization({
      redirectUri: 'https://portal.atlas.example/callback',
      state: 'state-persist-1'
    });
    assert.equal(started.accepted, true);

    const managerB = createAuthManager({ storageProvider, nowRef });
    const consumed = managerB.consumeOidcAuthorizationTransaction({
      state: 'state-persist-1',
      provider: 'oidc',
      redirectUri: 'https://portal.atlas.example/callback'
    });

    assert.equal(consumed.accepted, true);
    assert.equal(consumed.data.state, 'state-persist-1');
  });
});
