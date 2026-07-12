import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { CustomerAuthManager } from '../src/executive/customer-auth-manager.js';

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

function base64UrlEncode(value) {
  const asBuffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return asBuffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signJwt({ header, payload, privateKey, algorithm = 'RSA-SHA256' }) {
  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = sign(algorithm, Buffer.from(signingInput, 'utf8'), privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function createRsaJwk({ kid }) {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = keys.publicKey.export({ format: 'jwk' });
  return {
    kid,
    privateKey: keys.privateKey,
    jwk: {
      ...jwk,
      use: 'sig',
      kid,
      alg: 'RS256'
    }
  };
}

function createOidcFetchHarness({ issuer = 'https://issuer.example', key, tokenHandler, logoutHandler } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const value = String(url);
    calls.push({ url: value, method: String(init?.method ?? 'GET').toUpperCase(), body: String(init?.body ?? '') });

    if (value.endsWith('/.well-known/openid-configuration')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          issuer,
          jwks_uri: `${issuer}/jwks`,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          end_session_endpoint: `${issuer}/logout`
        })
      };
    }

    if (value.endsWith('/jwks')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ keys: [key.jwk] })
      };
    }

    if (value.endsWith('/token')) {
      const params = new URLSearchParams(String(init?.body ?? ''));
      const response = tokenHandler?.(params) ?? { ok: false, status: 400, payload: { error: 'invalid_request' } };
      return {
        ok: Boolean(response.ok),
        status: Number(response.status ?? (response.ok ? 200 : 400)),
        json: async () => (response.payload ?? {})
      };
    }

    if (value.startsWith(`${issuer}/logout`)) {
      const response = logoutHandler?.() ?? { ok: true, status: 200, payload: {} };
      if (response.throwError) {
        throw new Error(response.throwError);
      }
      return {
        ok: Boolean(response.ok),
        status: Number(response.status ?? (response.ok ? 200 : 500)),
        json: async () => (response.payload ?? {})
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({})
    };
  };

  fetchImpl.calls = calls;
  return fetchImpl;
}

function issueIdToken({ key, nonce = null, sub = 'oidc-user-1', email = 'user@example.com' } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
    payload: {
      iss: 'https://issuer.example',
      aud: 'atlas-client',
      exp: nowSec + 300,
      iat: nowSec - 10,
      sub,
      email,
      email_verified: true,
      ...(nonce ? { nonce } : {})
    },
    privateKey: key.privateKey
  });
}

function createOidcRuntime({ fetchImpl }) {
  const missionControl = new CustomerIntakeMissionControl();
  const authManager = new CustomerAuthManager({
    missionControl,
    providerFactoryArgs: {
      providerType: 'oidc',
      oidcExperimentalEnabled: true,
      fetchImpl
    }
  });

  return { authManager, missionControl };
}

async function createOidcSession({ authManager, key, refreshToken = 'rt-initial', providerUserId = 'oidc-user-1' } = {}) {
  const start = await authManager.startOidcAuthorization({
    redirectUri: 'https://portal.atlas.example/oidc/callback'
  });
  assert.equal(start.accepted, true);

  const transaction = authManager.oidcTransactionStore.records.get(start.data.state);
  const callbackIdToken = issueIdToken({ key, nonce: transaction.nonce, sub: providerUserId, email: `${providerUserId}@example.com` });

  authManager.identityProvider.fetchImpl = createOidcFetchHarness({
    key,
    tokenHandler: (params) => {
      const grantType = String(params.get('grant_type') ?? '').trim();
      if (grantType === 'authorization_code') {
        return { ok: true, status: 200, payload: { id_token: callbackIdToken, refresh_token: refreshToken } };
      }
      return { ok: false, status: 400, payload: { error: 'invalid_request' } };
    },
    logoutHandler: () => ({ ok: true, status: 200 })
  });

  const callback = await authManager.completeOidcAuthorizationCallback({
    state: start.data.state,
    code: 'code-initial',
    redirectUri: 'https://portal.atlas.example/oidc/callback'
  });
  assert.equal(callback.accepted, true);

  return {
    sessionToken: callback.data.sessionToken,
    customerId: callback.data.customerId
  };
}

test('successful refresh', async () => {
  const key = createRsaJwk({ kid: 'kid-refresh-ok' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createOidcRuntime({ fetchImpl: createOidcFetchHarness({ key }) });
    const established = await createOidcSession({ authManager: runtime.authManager, key, refreshToken: 'rt-ok', providerUserId: 'oidc-refresh-ok' });

    const refreshedIdToken = issueIdToken({ key, sub: 'oidc-refresh-ok', email: 'oidc-refresh-ok@example.com' });
    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      key,
      tokenHandler: (params) => {
        const grantType = String(params.get('grant_type') ?? '').trim();
        if (grantType === 'refresh_token') {
          return { ok: true, status: 200, payload: { id_token: refreshedIdToken, refresh_token: 'rt-ok-next' } };
        }
        return { ok: false, status: 400, payload: { error: 'invalid_request' } };
      },
      logoutHandler: () => ({ ok: true, status: 200 })
    });

    const refreshed = await runtime.authManager.refreshSession({ sessionToken: established.sessionToken });
    assert.equal(refreshed.accepted, true);
    assert.equal(typeof refreshed.data.sessionToken, 'string');

    const providerState = runtime.authManager.getProviderSession(established.customerId);
    assert.equal(providerState.refreshToken, 'rt-ok-next');

    const auditEvents = runtime.authManager.sessionManager.listAuditRecords().map((entry) => entry.event);
    assert.equal(auditEvents.includes('refresh_attempted'), true);
    assert.equal(auditEvents.includes('refresh_succeeded'), true);
  });
});

test('rotated refresh token', async () => {
  const key = createRsaJwk({ kid: 'kid-refresh-rotated' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createOidcRuntime({ fetchImpl: createOidcFetchHarness({ key }) });
    const established = await createOidcSession({ authManager: runtime.authManager, key, refreshToken: 'rt-rotate-start', providerUserId: 'oidc-rotate' });

    const refreshedIdToken = issueIdToken({ key, sub: 'oidc-rotate', email: 'oidc-rotate@example.com' });
    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      key,
      tokenHandler: (params) => ({
        ok: true,
        status: 200,
        payload: {
          id_token: refreshedIdToken,
          refresh_token: 'rt-rotate-next',
          refresh_token_rotated: true
        }
      }),
      logoutHandler: () => ({ ok: true, status: 200 })
    });

    const refreshed = await runtime.authManager.refreshSession({ sessionToken: established.sessionToken });
    assert.equal(refreshed.accepted, true);
    const providerState = runtime.authManager.getProviderSession(established.customerId);
    assert.equal(providerState.refreshToken, 'rt-rotate-next');
  });
});

test('non-rotated refresh token', async () => {
  const key = createRsaJwk({ kid: 'kid-refresh-non-rotated' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createOidcRuntime({ fetchImpl: createOidcFetchHarness({ key }) });
    const established = await createOidcSession({ authManager: runtime.authManager, key, refreshToken: 'rt-stable', providerUserId: 'oidc-stable' });

    const refreshedIdToken = issueIdToken({ key, sub: 'oidc-stable', email: 'oidc-stable@example.com' });
    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      key,
      tokenHandler: () => ({ ok: true, status: 200, payload: { id_token: refreshedIdToken } }),
      logoutHandler: () => ({ ok: true, status: 200 })
    });

    const refreshed = await runtime.authManager.refreshSession({ sessionToken: established.sessionToken });
    assert.equal(refreshed.accepted, true);
    const providerState = runtime.authManager.getProviderSession(established.customerId);
    assert.equal(providerState.refreshToken, 'rt-stable');
  });
});

test('invalid_grant revokes session', async () => {
  const key = createRsaJwk({ kid: 'kid-refresh-invalid-grant' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createOidcRuntime({ fetchImpl: createOidcFetchHarness({ key }) });
    const established = await createOidcSession({ authManager: runtime.authManager, key, refreshToken: 'rt-invalid-grant', providerUserId: 'oidc-invalid-grant' });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      key,
      tokenHandler: () => ({ ok: false, status: 400, payload: { error: 'invalid_grant' } }),
      logoutHandler: () => ({ ok: true, status: 200 })
    });

    const refreshed = await runtime.authManager.refreshSession({ sessionToken: established.sessionToken });
    assert.equal(refreshed.accepted, false);
    assert.equal(refreshed.code, 'TOKEN_EXPIRED');

    const sessionCheck = runtime.authManager.sessionManager.validateSessionToken(established.sessionToken, { rotateIdle: false });
    assert.equal(sessionCheck.valid, false);

    const auditEvents = runtime.authManager.sessionManager.listAuditRecords().map((entry) => entry.event);
    assert.equal(auditEvents.includes('provider_revocation_detected'), true);
  });
});

test('revoked refresh token revokes session', async () => {
  const key = createRsaJwk({ kid: 'kid-refresh-revoked' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createOidcRuntime({ fetchImpl: createOidcFetchHarness({ key }) });
    const established = await createOidcSession({ authManager: runtime.authManager, key, refreshToken: 'rt-revoked', providerUserId: 'oidc-revoked' });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      key,
      tokenHandler: () => ({ ok: false, status: 400, payload: { error: 'revoked_token' } }),
      logoutHandler: () => ({ ok: true, status: 200 })
    });

    const refreshed = await runtime.authManager.refreshSession({ sessionToken: established.sessionToken });
    assert.equal(refreshed.accepted, false);
    assert.equal(refreshed.code, 'ACCOUNT_REVOKED');

    const sessionCheck = runtime.authManager.sessionManager.validateSessionToken(established.sessionToken, { rotateIdle: false });
    assert.equal(sessionCheck.valid, false);
  });
});

test('provider outage keeps session and fails closed', async () => {
  const key = createRsaJwk({ kid: 'kid-refresh-outage' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createOidcRuntime({ fetchImpl: createOidcFetchHarness({ key }) });
    const established = await createOidcSession({ authManager: runtime.authManager, key, refreshToken: 'rt-outage', providerUserId: 'oidc-outage' });

    runtime.authManager.identityProvider.fetchImpl = async () => {
      throw new Error('network timeout');
    };

    const refreshed = await runtime.authManager.refreshSession({ sessionToken: established.sessionToken });
    assert.equal(refreshed.accepted, false);
    assert.equal(refreshed.code, 'PROVIDER_TIMEOUT');

    const sessionCheck = runtime.authManager.sessionManager.validateSessionToken(established.sessionToken, { rotateIdle: false });
    assert.equal(sessionCheck.valid, true);
  });
});

test('local refresh fallback remains supported', async () => {
  const missionControl = new CustomerIntakeMissionControl();
  const authManager = new CustomerAuthManager({ missionControl, providerFactoryArgs: { providerType: 'local' } });

  authManager.register({ email: 'local-refresh@example.com', password: 'atlas-pass-1234' });
  const login = authManager.login({ email: 'local-refresh@example.com', password: 'atlas-pass-1234' });
  assert.equal(login.accepted, true);

  const refreshed = await authManager.refreshSession({ sessionToken: login.data.sessionToken });
  assert.equal(refreshed.accepted, true);
  assert.equal(typeof refreshed.data.sessionToken, 'string');
  assert.notEqual(refreshed.data.sessionToken, login.data.sessionToken);
});

test('successful federated logout', async () => {
  const key = createRsaJwk({ kid: 'kid-logout-ok' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    let logoutCalled = false;
    const runtime = createOidcRuntime({
      fetchImpl: createOidcFetchHarness({
        key,
        tokenHandler: () => ({ ok: false, status: 400, payload: { error: 'invalid_request' } }),
        logoutHandler: () => {
          logoutCalled = true;
          return { ok: true, status: 200 };
        }
      })
    });

    const established = await createOidcSession({ authManager: runtime.authManager, key, refreshToken: 'rt-logout-ok', providerUserId: 'oidc-logout-ok' });
    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      key,
      tokenHandler: () => ({ ok: false, status: 400, payload: { error: 'invalid_request' } }),
      logoutHandler: () => {
        logoutCalled = true;
        return { ok: true, status: 200 };
      }
    });

    const logout = await runtime.authManager.logout({ sessionToken: established.sessionToken });
    assert.equal(logout.accepted, true);
    assert.equal(logout.data.federatedLogout, 'COMPLETED');
    assert.equal(logoutCalled, true);
  });
});

test('provider logout failure', async () => {
  const key = createRsaJwk({ kid: 'kid-logout-fail' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createOidcRuntime({ fetchImpl: createOidcFetchHarness({ key }) });
    const established = await createOidcSession({ authManager: runtime.authManager, key, refreshToken: 'rt-logout-fail', providerUserId: 'oidc-logout-fail' });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      key,
      tokenHandler: () => ({ ok: false, status: 400, payload: { error: 'invalid_request' } }),
      logoutHandler: () => ({ ok: false, status: 500 })
    });

    const logout = await runtime.authManager.logout({ sessionToken: established.sessionToken });
    assert.equal(logout.accepted, true);
    assert.equal(logout.data.federatedLogout, 'FAILED');

    const auditEvents = runtime.authManager.sessionManager.listAuditRecords().map((entry) => entry.event);
    assert.equal(auditEvents.includes('federated_logout_failed'), true);
  });
});

test('local logout fallback', async () => {
  const missionControl = new CustomerIntakeMissionControl();
  const authManager = new CustomerAuthManager({ missionControl, providerFactoryArgs: { providerType: 'local' } });

  authManager.register({ email: 'local-logout@example.com', password: 'atlas-pass-1234' });
  const login = authManager.login({ email: 'local-logout@example.com', password: 'atlas-pass-1234' });
  assert.equal(login.accepted, true);

  const logout = await authManager.logout({ sessionToken: login.data.sessionToken });
  assert.equal(logout.accepted, true);
  assert.equal(logout.data.federatedLogout, 'NOT_SUPPORTED');
});
