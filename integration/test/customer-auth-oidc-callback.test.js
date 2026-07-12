import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { ExecutiveDashboardApiRateLimiter } from '../src/executive/executive-dashboard-api-rate-limiter.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';
import { CustomerAuthManager } from '../src/executive/customer-auth-manager.js';
import { CustomerStatuses } from '../src/executive/customer-intake-mission-control-contracts.js';

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

function createOidcFetchMock({
  issuer = 'https://issuer.example',
  jwks,
  codeHandler,
  tokenNetworkFailure = false
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
          token_endpoint: `${issuer}/token`
        })
      };
    }

    if (value.endsWith('/jwks')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ keys: jwks })
      };
    }

    if (value.endsWith('/token')) {
      if (tokenNetworkFailure) {
        throw new Error('provider-token-outage');
      }

      const bodyText = String(init?.body ?? '');
      const params = new URLSearchParams(bodyText);
      const code = String(params.get('code') ?? '').trim();
      const response = codeHandler?.(code, params) ?? { ok: false, status: 400, payload: { error: 'invalid_grant' } };
      return {
        ok: Boolean(response.ok),
        status: Number(response.status ?? (response.ok ? 200 : 400)),
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
  const planning = new ExecutivePlanningSystem({ missionControl });
  const authManager = new CustomerAuthManager({
    missionControl,
    providerFactoryArgs: {
      providerType: 'oidc',
      oidcExperimentalEnabled: true,
      fetchImpl
    }
  });

  const customerPortalManager = new CustomerPortalManager({
    missionControl,
    executivePlanningSystem: planning,
    workforceDirector: missionControl.workforceDirector,
    authManager
  });

  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    customerPortalManager
  });

  const dashboard = new ExecutiveOperationsDashboard({ manager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    rateLimiter: new ExecutiveDashboardApiRateLimiter(),
    env: {
      ...process.env,
      ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE: 'secure_cookie',
      ATLAS_CUSTOMER_TRUSTED_ORIGINS: 'https://portal.atlas.example',
      ATLAS_CUSTOMER_ENFORCE_TRUSTED_ORIGIN: 'true'
    },
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'token-customer',
      ATLAS_DASHBOARD_API_TOKEN_CEO: 'token-ceo',
      ATLAS_DASHBOARD_API_TOKEN: 'token-ceo'
    } })
  });

  return { api, manager, authManager };
}

async function callApi(api, {
  path,
  method = 'GET',
  body = {},
  query = {},
  token = null,
  origin = null,
  clientId = 'customer-oidc-callback-tests'
} = {}) {
  const headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(origin ? { origin } : {}),
    'x-client-id': clientId
  };

  return api.handleRequest({
    method,
    path,
    body,
    query,
    headers,
    clientId
  });
}

function readSetCookies(response) {
  const value = response?.responseHeaders?.['set-cookie'];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

function assertRedirect(response, expectedCode = null) {
  assert.equal(response.httpStatus, 302);
  const location = String(response.responseHeaders?.location ?? '');
  assert.equal(location.length > 0, true);
  if (expectedCode) {
    assert.equal(location.includes(`code=${expectedCode}`), true);
  }
  return location;
}

async function startFlow({ api, state = null, portalRedirectUri = '/customer/portal/projects/alpha' } = {}) {
  const start = await callApi(api, {
    path: '/api/v1/customer/auth/oidc/start',
    method: 'POST',
    body: {
      redirectUri: 'https://portal.atlas.example/oidc/callback',
      portalRedirectUri,
      ...(state ? { state } : {})
    },
    origin: 'https://portal.atlas.example'
  });

  assert.equal(start.httpStatus, 200);
  return start.envelope.data;
}

test('successful callback completion', async () => {
  const key = createRsaJwk({ kid: 'kid-success' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({
      fetchImpl: createOidcFetchMock({
        jwks: [key.jwk],
        codeHandler: (code) => {
          const nowSec = Math.floor(Date.now() / 1000);
          const payload = {
            iss: 'https://issuer.example',
            aud: 'atlas-client',
            exp: nowSec + 300,
            iat: nowSec - 10,
            sub: 'oidc-user-success',
            email: 'success@example.com',
            email_verified: true,
            nonce: `nonce-for-${code}`
          };
          const idToken = signJwt({
            header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
            payload,
            privateKey: key.privateKey
          });
          return { ok: true, status: 200, payload: { id_token: idToken } };
        }
      })
    });

    const started = await startFlow({ api: runtime.api, portalRedirectUri: '/customer/portal/deep-link' });

    const transaction = runtime.authManager.oidcTransactionStore.records.get(started.state);
    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signJwt({
      header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
      payload: {
        iss: 'https://issuer.example',
        aud: 'atlas-client',
        exp: nowSec + 300,
        iat: nowSec - 10,
        sub: 'oidc-user-success',
        email: 'success@example.com',
        email_verified: true,
        nonce: transaction.nonce
      },
      privateKey: key.privateKey
    });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [key.jwk],
      codeHandler: () => ({ ok: true, status: 200, payload: { id_token: idToken } })
    });

    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: {
        state: started.state,
        code: 'code-success',
        redirect_uri: 'https://portal.atlas.example/oidc/callback'
      }
    });

    const location = assertRedirect(callback);
    assert.equal(location.includes('auth=ok'), true);
    assert.equal(location.includes('/customer/portal/deep-link'), true);
    const setCookies = readSetCookies(callback);
    assert.equal(setCookies.some((entry) => String(entry).includes('atlas_customer_session=')), true);
    assert.equal(setCookies.some((entry) => String(entry).includes('atlas_customer_csrf=')), true);
  });
});

test('duplicate callback', async () => {
  const key = createRsaJwk({ kid: 'kid-dup' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [key.jwk], codeHandler: () => ({ ok: false, status: 400, payload: { error: 'invalid_grant' } }) }) });
    const started = await startFlow({ api: runtime.api });
    const record = runtime.authManager.oidcTransactionStore.records.get(started.state);

    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signJwt({
      header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
      payload: {
        iss: 'https://issuer.example',
        aud: 'atlas-client',
        exp: nowSec + 300,
        iat: nowSec - 10,
        sub: 'oidc-user-dup',
        email: 'dup@example.com',
        email_verified: true,
        nonce: record.nonce
      },
      privateKey: key.privateKey
    });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [key.jwk],
      codeHandler: () => ({ ok: true, status: 200, payload: { id_token: idToken } })
    });

    const first = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-dup', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });
    assert.equal(first.httpStatus, 302);

    const second = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-dup', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });
    assertRedirect(second, 'INVALID_STATE');
  });
});

test('invalid state', async () => {
  const key = createRsaJwk({ kid: 'kid-invalid-state' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [key.jwk], codeHandler: () => ({ ok: false, status: 400, payload: { error: 'invalid_grant' } }) }) });
    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: 'unknown-state', code: 'code-invalid-state', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });
    assertRedirect(callback, 'NOT_FOUND');
  });
});

test('nonce mismatch', async () => {
  const key = createRsaJwk({ kid: 'kid-nonce' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [key.jwk], codeHandler: () => ({ ok: false, status: 400, payload: { error: 'invalid_grant' } }) }) });
    const started = await startFlow({ api: runtime.api });

    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signJwt({
      header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
      payload: {
        iss: 'https://issuer.example',
        aud: 'atlas-client',
        exp: nowSec + 300,
        iat: nowSec - 10,
        sub: 'oidc-user-nonce',
        email: 'nonce@example.com',
        email_verified: true,
        nonce: 'wrong-nonce'
      },
      privateKey: key.privateKey
    });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [key.jwk],
      codeHandler: () => ({ ok: true, status: 200, payload: { id_token: idToken } })
    });

    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-nonce', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });

    assertRedirect(callback, 'TOKEN_INVALID');
  });
});

test('provider outage', async () => {
  const key = createRsaJwk({ kid: 'kid-outage' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [key.jwk], codeHandler: () => ({ ok: false, status: 400, payload: { error: 'invalid_grant' } }) }) });
    const started = await startFlow({ api: runtime.api });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [key.jwk],
      tokenNetworkFailure: true
    });

    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-outage', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });

    assertRedirect(callback, 'PROVIDER_UNAVAILABLE');
  });
});

test('expired authorization code', async () => {
  const key = createRsaJwk({ kid: 'kid-expired-code' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [key.jwk] }) });
    const started = await startFlow({ api: runtime.api });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [key.jwk],
      codeHandler: () => ({ ok: false, status: 400, payload: { error: 'invalid_grant', error_description: 'expired code' } })
    });

    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-expired', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });

    assertRedirect(callback, 'TOKEN_EXPIRED');
  });
});

test('invalid signature', async () => {
  const trusted = createRsaJwk({ kid: 'kid-trusted' });
  const attacker = createRsaJwk({ kid: 'kid-attacker' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [trusted.jwk] }) });
    const started = await startFlow({ api: runtime.api });
    const record = runtime.authManager.oidcTransactionStore.records.get(started.state);

    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signJwt({
      header: { alg: 'RS256', typ: 'JWT', kid: attacker.kid },
      payload: {
        iss: 'https://issuer.example',
        aud: 'atlas-client',
        exp: nowSec + 300,
        iat: nowSec - 10,
        sub: 'oidc-user-attacker',
        email: 'attacker@example.com',
        email_verified: true,
        nonce: record.nonce
      },
      privateKey: attacker.privateKey
    });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [trusted.jwk],
      codeHandler: () => ({ ok: true, status: 200, payload: { id_token: idToken } })
    });

    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-invalid-sig', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });

    assertRedirect(callback, 'TOKEN_INVALID');
  });
});

test('disabled customer', async () => {
  const key = createRsaJwk({ kid: 'kid-disabled' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [key.jwk] }) });
    const customer = runtime.authManager.resolveOrCreateCustomer({ email: 'disabled@example.com' }).customer;
    runtime.manager.missionControl.customerRegistry.updateCustomer(customer.customerId, { status: CustomerStatuses.DISABLED });
    const link = runtime.authManager.buildIdentityLink({
      providerUserId: 'oidc-user-disabled',
      normalizedEmail: 'disabled@example.com',
      emailVerified: true,
      customerId: customer.customerId
    });
    runtime.authManager.persistIdentityLink(link);

    const started = await startFlow({ api: runtime.api });
    const record = runtime.authManager.oidcTransactionStore.records.get(started.state);
    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signJwt({
      header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
      payload: {
        iss: 'https://issuer.example',
        aud: 'atlas-client',
        exp: nowSec + 300,
        iat: nowSec - 10,
        sub: 'oidc-user-disabled',
        email: 'disabled@example.com',
        email_verified: true,
        nonce: record.nonce
      },
      privateKey: key.privateKey
    });
    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [key.jwk],
      codeHandler: () => ({ ok: true, status: 200, payload: { id_token: idToken } })
    });

    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-disabled', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });

    assertRedirect(callback, 'ACCOUNT_DISABLED');
  });
});

test('suspended customer', async () => {
  const key = createRsaJwk({ kid: 'kid-suspended' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [key.jwk] }) });
    const customer = runtime.authManager.resolveOrCreateCustomer({ email: 'suspended@example.com' }).customer;
    runtime.manager.missionControl.customerRegistry.updateCustomer(customer.customerId, { status: CustomerStatuses.SUSPENDED });
    const link = runtime.authManager.buildIdentityLink({
      providerUserId: 'oidc-user-suspended',
      normalizedEmail: 'suspended@example.com',
      emailVerified: true,
      customerId: customer.customerId
    });
    runtime.authManager.persistIdentityLink(link);

    const started = await startFlow({ api: runtime.api });
    const record = runtime.authManager.oidcTransactionStore.records.get(started.state);
    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signJwt({
      header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
      payload: {
        iss: 'https://issuer.example',
        aud: 'atlas-client',
        exp: nowSec + 300,
        iat: nowSec - 10,
        sub: 'oidc-user-suspended',
        email: 'suspended@example.com',
        email_verified: true,
        nonce: record.nonce
      },
      privateKey: key.privateKey
    });
    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [key.jwk],
      codeHandler: () => ({ ok: true, status: 200, payload: { id_token: idToken } })
    });

    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-suspended', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });

    assertRedirect(callback, 'ACCOUNT_SUSPENDED');
  });
});

test('persistence failure', async () => {
  const key = createRsaJwk({ kid: 'kid-persistence' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [key.jwk] }) });
    const started = await startFlow({ api: runtime.api });
    const record = runtime.authManager.oidcTransactionStore.records.get(started.state);
    const nowSec = Math.floor(Date.now() / 1000);

    const idToken = signJwt({
      header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
      payload: {
        iss: 'https://issuer.example',
        aud: 'atlas-client',
        exp: nowSec + 300,
        iat: nowSec - 10,
        sub: 'oidc-user-persistence',
        email: 'persist@example.com',
        email_verified: true,
        nonce: record.nonce
      },
      privateKey: key.privateKey
    });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [key.jwk],
      codeHandler: () => ({ ok: true, status: 200, payload: { id_token: idToken } })
    });

    const originalCommit = runtime.authManager.oidcTransactionStore.commitConsumption.bind(runtime.authManager.oidcTransactionStore);
    runtime.authManager.oidcTransactionStore.commitConsumption = () => ({ ok: false, code: 'PERSISTENCE_FAILURE', reason: 'simulated' });

    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-persistence', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });

    assertRedirect(callback, 'PERSISTENCE_FAILURE');
    runtime.authManager.oidcTransactionStore.commitConsumption = originalCommit;
  });
});

test('session creation failure', async () => {
  const key = createRsaJwk({ kid: 'kid-session-failure' });
  await withEnv({
    ATLAS_IDENTITY_OIDC_ISSUER_URL: 'https://issuer.example',
    ATLAS_IDENTITY_OIDC_CLIENT_ID: 'atlas-client',
    ATLAS_IDENTITY_OIDC_CLIENT_SECRET: 'atlas-secret'
  }, async () => {
    const runtime = createRuntime({ fetchImpl: createOidcFetchMock({ jwks: [key.jwk] }) });
    const started = await startFlow({ api: runtime.api });
    const record = runtime.authManager.oidcTransactionStore.records.get(started.state);
    const nowSec = Math.floor(Date.now() / 1000);

    const idToken = signJwt({
      header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
      payload: {
        iss: 'https://issuer.example',
        aud: 'atlas-client',
        exp: nowSec + 300,
        iat: nowSec - 10,
        sub: 'oidc-user-session-failure',
        email: 'sessionfail@example.com',
        email_verified: true,
        nonce: record.nonce
      },
      privateKey: key.privateKey
    });

    runtime.authManager.identityProvider.fetchImpl = createOidcFetchMock({
      jwks: [key.jwk],
      codeHandler: () => ({ ok: true, status: 200, payload: { id_token: idToken } })
    });

    const originalCreateSession = runtime.authManager.sessionManager.createSession.bind(runtime.authManager.sessionManager);
    runtime.authManager.sessionManager.createSession = () => {
      throw new Error('session-store-down');
    };

    const callback = await callApi(runtime.api, {
      path: '/api/v1/customer/auth/oidc/callback',
      method: 'GET',
      query: { state: started.state, code: 'code-session-failure', redirect_uri: 'https://portal.atlas.example/oidc/callback' }
    });

    assertRedirect(callback, 'SESSION_CREATION_FAILED');
    runtime.authManager.sessionManager.createSession = originalCreateSession;
  });
});
