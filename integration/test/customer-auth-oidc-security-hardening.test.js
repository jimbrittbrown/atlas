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

function createOidcFetchHarness({
  issuer = 'https://issuer.example',
  jwksKeys = [],
  tokenHandler,
  tokenError = null,
  logoutHandler
} = {}) {
  return async (url, init = {}) => {
    const value = String(url);

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
        json: async () => ({ keys: jwksKeys })
      };
    }

    if (value.endsWith('/token')) {
      if (tokenError) throw tokenError;
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
}

function createRuntime({ fetchImpl }) {
  const missionControl = new CustomerIntakeMissionControl();
  const authManager = new CustomerAuthManager({
    missionControl,
    providerFactoryArgs: {
      providerType: 'oidc',
      oidcExperimentalEnabled: true,
      fetchImpl
    }
  });
  return { authManager };
}

async function startAndCompleteSession({ authManager, key, providerUserId = 'oidc-session-user', refreshToken = 'rt-session' } = {}) {
  const start = await authManager.startOidcAuthorization({
    redirectUri: 'https://portal.atlas.example/oidc/callback'
  });
  assert.equal(start.accepted, true);

  const tx = authManager.oidcTransactionStore.records.get(start.data.state);
  const idToken = issueIdToken({ key, nonce: tx.nonce, sub: providerUserId, email: `${providerUserId}@example.com` });

  authManager.identityProvider.fetchImpl = createOidcFetchHarness({
    jwksKeys: [key.jwk],
    tokenHandler: (params) => {
      const grantType = String(params.get('grant_type') ?? '').trim();
      if (grantType === 'authorization_code') {
        return { ok: true, status: 200, payload: { id_token: idToken, refresh_token: refreshToken } };
      }
      return { ok: false, status: 400, payload: { error: 'invalid_request' } };
    },
    logoutHandler: () => ({ ok: true, status: 200 })
  });

  const callback = await authManager.completeOidcAuthorizationCallback({
    state: start.data.state,
    code: 'code-session',
    redirectUri: 'https://portal.atlas.example/oidc/callback'
  });
  assert.equal(callback.accepted, true);

  return {
    sessionToken: callback.data.sessionToken,
    customerId: callback.data.customerId,
    state: start.data.state
  };
}

test('replay attempts are denied with audit and telemetry', async () => {
  const key = createRsaJwk({ kid: 'kid-replay' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchHarness({ jwksKeys: [key.jwk] }) });
    const start = await runtime.authManager.startOidcAuthorization({ redirectUri: 'https://portal.atlas.example/oidc/callback' });
    assert.equal(start.accepted, true);

    const first = runtime.authManager.consumeOidcAuthorizationTransaction({
      state: start.data.state,
      provider: 'oidc',
      redirectUri: 'https://portal.atlas.example/oidc/callback'
    });
    const second = runtime.authManager.consumeOidcAuthorizationTransaction({
      state: start.data.state,
      provider: 'oidc',
      redirectUri: 'https://portal.atlas.example/oidc/callback'
    });

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, false);
    assert.equal(second.code, 'INVALID_STATE');

    const audits = runtime.authManager.sessionManager.listAuditRecords().map((entry) => entry.event);
    assert.equal(audits.includes('replay_detected'), true);

    const telemetry = runtime.authManager.getAuthHealth().securityTelemetry;
    assert.equal(telemetry.replayAttempts > 0, true);
  });
});

test('nonce mismatch and malformed JWT callback are denied', async () => {
  const key = createRsaJwk({ kid: 'kid-nonce-mismatch' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchHarness({ jwksKeys: [key.jwk] }) });
    const start = await runtime.authManager.startOidcAuthorization({ redirectUri: 'https://portal.atlas.example/oidc/callback' });
    assert.equal(start.accepted, true);

    const tx = runtime.authManager.oidcTransactionStore.records.get(start.data.state);
    const nonceMismatchToken = issueIdToken({ key, nonce: `${tx.nonce}-tampered`, sub: 'nonce-user', email: 'nonce-user@example.com' });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      jwksKeys: [key.jwk],
      tokenHandler: () => ({ ok: true, status: 200, payload: { id_token: nonceMismatchToken } })
    });

    const mismatchResult = await runtime.authManager.completeOidcAuthorizationCallback({
      state: start.data.state,
      code: 'nonce-mismatch-code',
      redirectUri: 'https://portal.atlas.example/oidc/callback'
    });
    assert.equal(mismatchResult.accepted, false);
    assert.equal(mismatchResult.code, 'TOKEN_INVALID');

    const startMalformed = await runtime.authManager.startOidcAuthorization({ redirectUri: 'https://portal.atlas.example/oidc/callback' });
    assert.equal(startMalformed.accepted, true);

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      jwksKeys: [key.jwk],
      tokenHandler: () => ({ ok: true, status: 200, payload: { id_token: 'not-a-jwt' } })
    });

    const malformed = await runtime.authManager.completeOidcAuthorizationCallback({
      state: startMalformed.data.state,
      code: 'malformed-jwt-code',
      redirectUri: 'https://portal.atlas.example/oidc/callback'
    });
    assert.equal(malformed.accepted, false);
    assert.equal(malformed.code, 'TOKEN_INVALID');

    const audits = runtime.authManager.sessionManager.listAuditRecords().map((entry) => entry.event);
    assert.equal(audits.includes('nonce_mismatch_detected'), true);
    assert.equal(audits.includes('callback_validation_failed'), true);
    assert.equal(audits.includes('token_exchange_failed'), true);

    const telemetry = runtime.authManager.getAuthHealth().securityTelemetry;
    assert.equal(telemetry.nonceFailures > 0, true);
    assert.equal(telemetry.callbackFailures > 0, true);
  });
});

test('corrupted encrypted verifier fails closed', async () => {
  const key = createRsaJwk({ kid: 'kid-corrupt-verifier' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchHarness({ jwksKeys: [key.jwk] }) });
    const start = await runtime.authManager.startOidcAuthorization({ redirectUri: 'https://portal.atlas.example/oidc/callback' });
    assert.equal(start.accepted, true);

    const record = runtime.authManager.oidcTransactionStore.records.get(start.data.state);
    const corrupted = {
      ...record,
      pkceVerifierEnvelope: {
        ...record.pkceVerifierEnvelope,
        ciphertext: 'AAAA'
      }
    };
    runtime.authManager.oidcTransactionStore.records.set(start.data.state, corrupted);

    const result = await runtime.authManager.completeOidcAuthorizationCallback({
      state: start.data.state,
      code: 'code-corrupted',
      redirectUri: 'https://portal.atlas.example/oidc/callback'
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, 'TOKEN_INVALID');

    const audits = runtime.authManager.sessionManager.listAuditRecords().map((entry) => entry.event);
    assert.equal(audits.includes('callback_validation_failed'), true);
  });
});

test('audit payload redaction masks sensitive values', async () => {
  const key = createRsaJwk({ kid: 'kid-audit-redaction' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchHarness({ jwksKeys: [key.jwk] }) });

    runtime.authManager.recordAuditEvent('refresh_failed', {
      refreshToken: 'rt-sensitive',
      idToken: 'id-token-sensitive',
      nested: {
        clientSecret: 'secret-sensitive',
        sessionToken: 'session-sensitive'
      }
    });

    const latest = runtime.authManager.sessionManager.listAuditRecords().slice(-1)[0];
    assert.equal(latest.event, 'refresh_failed');
    assert.equal(latest.details.refreshToken, '[REDACTED]');
    assert.equal(latest.details.idToken, '[REDACTED]');
    assert.equal(latest.details.nested.clientSecret, '[REDACTED]');
    assert.equal(latest.details.nested.sessionToken, '[REDACTED]');
  });
});

test('provider outage, refresh failure, and logout failure emit telemetry', async () => {
  const key = createRsaJwk({ kid: 'kid-telemetry' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchHarness({ jwksKeys: [key.jwk] }) });
    const session = await startAndCompleteSession({ authManager: runtime.authManager, key, providerUserId: 'telemetry-user', refreshToken: 'rt-telemetry' });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      jwksKeys: [key.jwk],
      tokenError: new Error('timeout waiting for token endpoint'),
      logoutHandler: () => ({ ok: false, status: 500 })
    });

    const refreshed = await runtime.authManager.refreshSession({ sessionToken: session.sessionToken });
    assert.equal(refreshed.accepted, false);

    const logout = await runtime.authManager.logout({ sessionToken: session.sessionToken });
    assert.equal(logout.accepted, true);
    assert.equal(logout.data.federatedLogout, 'FAILED');

    const telemetry = runtime.authManager.getAuthHealth().securityTelemetry;
    assert.equal(telemetry.refreshFailures > 0, true);
    assert.equal(telemetry.providerOutages > 0, true);
    assert.equal(telemetry.logoutFailures > 0, true);
    assert.equal(telemetry.jwksRefreshCount > 0, true);
    assert.equal(telemetry.loginSuccessRate > 0, true);
  });
});

test('unknown kid emits telemetry and callback denial', async () => {
  const signingKey = createRsaJwk({ kid: 'kid-signing-missing' });
  const publishedKey = createRsaJwk({ kid: 'kid-published' });

  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchHarness({ jwksKeys: [publishedKey.jwk] }) });
    const start = await runtime.authManager.startOidcAuthorization({ redirectUri: 'https://portal.atlas.example/oidc/callback' });
    assert.equal(start.accepted, true);

    const tx = runtime.authManager.oidcTransactionStore.records.get(start.data.state);
    const idToken = issueIdToken({
      key: signingKey,
      nonce: tx.nonce,
      sub: 'unknown-kid-user',
      email: 'unknown-kid-user@example.com'
    });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchHarness({
      jwksKeys: [publishedKey.jwk],
      tokenHandler: () => ({ ok: true, status: 200, payload: { id_token: idToken } })
    });

    const callback = await runtime.authManager.completeOidcAuthorizationCallback({
      state: start.data.state,
      code: 'code-unknown-kid',
      redirectUri: 'https://portal.atlas.example/oidc/callback'
    });

    assert.equal(callback.accepted, false);
    assert.equal(callback.code, 'TOKEN_INVALID');

    const telemetry = runtime.authManager.getAuthHealth().securityTelemetry;
    assert.equal(telemetry.unknownKidEvents > 0, true);
  });
});
