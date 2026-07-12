import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { OidcIdentityProviderAdapter } from '../src/executive/customer-identity-provider-oidc.js';

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

function createFetchMock({
  issuer = 'https://issuer.example',
  discoveryStatus = 200,
  discoveryPayload = null,
  jwksStatus = 200,
  jwksPayloads = [],
  failDiscovery = false,
  failJwks = false
} = {}) {
  const calls = [];
  let jwksIndex = 0;

  const defaultDiscovery = {
    issuer,
    jwks_uri: `${issuer}/jwks`,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`
  };

  const mock = async (url) => {
    calls.push(String(url));

    if (String(url).endsWith('/.well-known/openid-configuration')) {
      if (failDiscovery) {
        throw new Error('discovery-network-failure');
      }

      return {
        ok: discoveryStatus >= 200 && discoveryStatus < 300,
        status: discoveryStatus,
        json: async () => (discoveryPayload ?? defaultDiscovery)
      };
    }

    if (String(url).includes('/jwks')) {
      if (failJwks) {
        throw new Error('jwks-network-failure');
      }

      const payload = jwksPayloads[Math.min(jwksIndex, Math.max(jwksPayloads.length - 1, 0))] ?? { keys: [] };
      jwksIndex += 1;
      return {
        ok: jwksStatus >= 200 && jwksStatus < 300,
        status: jwksStatus,
        json: async () => payload
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({})
    };
  };

  mock.calls = calls;
  return mock;
}

function createOidcFixture({ fetchImpl, nowRef }) {
  return new OidcIdentityProviderAdapter({
    fetchImpl,
    now: () => nowRef.value,
    config: {
      issuerUrl: 'https://issuer.example',
      clientId: 'atlas-client',
      clientSecret: 'atlas-secret',
      audience: 'atlas-audience'
    }
  });
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

function standardPayload({ overrides = {}, nowSec = 1_700_000_000 } = {}) {
  return {
    iss: 'https://issuer.example',
    aud: 'atlas-client',
    exp: nowSec + 300,
    iat: nowSec - 10,
    sub: 'user-1',
    nonce: 'nonce-123',
    ...overrides
  };
}

test('valid JWT verifies successfully', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-valid' });

  const fetchImpl = createFetchMock({
    jwksPayloads: [{ keys: [key.jwk] }]
  });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const idToken = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
    payload: standardPayload({ nowSec }),
    privateKey: key.privateKey
  });

  const result = await adapter.verifyIdToken({ idToken, expectedNonce: 'nonce-123' });
  assert.equal(result.ok, true);
  assert.equal(result.data.claims.sub, 'user-1');
});

test('invalid signature fails closed', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-sig' });

  const fetchImpl = createFetchMock({ jwksPayloads: [{ keys: [key.jwk] }] });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const token = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
    payload: standardPayload({ nowSec }),
    privateKey: key.privateKey
  });
  const tampered = `${token.split('.')[0]}.${base64UrlEncode(JSON.stringify(standardPayload({ nowSec, overrides: { sub: 'tampered' } })))}.${token.split('.')[2]}`;

  const result = await adapter.verifyIdToken({ idToken: tampered, expectedNonce: 'nonce-123' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TOKEN_INVALID');
});

test('issuer mismatch fails claim validation', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-iss' });

  const fetchImpl = createFetchMock({ jwksPayloads: [{ keys: [key.jwk] }] });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const idToken = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
    payload: standardPayload({ nowSec, overrides: { iss: 'https://evil.example' } }),
    privateKey: key.privateKey
  });

  const result = await adapter.verifyIdToken({ idToken, expectedNonce: 'nonce-123' });
  assert.equal(result.ok, false);
  assert.equal(result.error.details.reason, 'ISSUER_MISMATCH');
});

test('audience mismatch fails claim validation', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-aud' });

  const fetchImpl = createFetchMock({ jwksPayloads: [{ keys: [key.jwk] }] });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const idToken = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
    payload: standardPayload({ nowSec, overrides: { aud: 'other-client' } }),
    privateKey: key.privateKey
  });

  const result = await adapter.verifyIdToken({ idToken, expectedNonce: 'nonce-123' });
  assert.equal(result.ok, false);
  assert.equal(result.error.details.reason, 'AUDIENCE_MISMATCH');
});

test('expired token is rejected', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-exp' });

  const fetchImpl = createFetchMock({ jwksPayloads: [{ keys: [key.jwk] }] });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const idToken = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
    payload: standardPayload({ nowSec, overrides: { exp: nowSec - 120 } }),
    privateKey: key.privateKey
  });

  const result = await adapter.verifyIdToken({ idToken, expectedNonce: 'nonce-123', clockSkewSec: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TOKEN_EXPIRED');
});

test('future iat beyond skew is rejected', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-iat' });

  const fetchImpl = createFetchMock({ jwksPayloads: [{ keys: [key.jwk] }] });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const idToken = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
    payload: standardPayload({ nowSec, overrides: { iat: nowSec + 300 } }),
    privateKey: key.privateKey
  });

  const result = await adapter.verifyIdToken({ idToken, expectedNonce: 'nonce-123', clockSkewSec: 30 });
  assert.equal(result.ok, false);
  assert.equal(result.error.details.reason, 'IAT_IN_FUTURE');
});

test('unsupported algorithm is rejected', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-unsupported' });

  const fetchImpl = createFetchMock({ jwksPayloads: [{ keys: [key.jwk] }] });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: key.kid }));
  const payload = base64UrlEncode(JSON.stringify(standardPayload({ nowSec })));
  const token = `${header}.${payload}.${base64UrlEncode('sig')}`;

  const result = await adapter.verifyIdToken({ idToken: token, expectedNonce: 'nonce-123' });
  assert.equal(result.ok, false);
  assert.equal(result.error.details.reason, 'ALG_UNSUPPORTED');
});

test('alg none is rejected', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-none' });

  const fetchImpl = createFetchMock({ jwksPayloads: [{ keys: [key.jwk] }] });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT', kid: key.kid }));
  const payload = base64UrlEncode(JSON.stringify(standardPayload({ nowSec })));
  const token = `${header}.${payload}.${base64UrlEncode('sig')}`;

  const result = await adapter.verifyIdToken({ idToken: token, expectedNonce: 'nonce-123' });
  assert.equal(result.ok, false);
  assert.equal(result.error.details.reason, 'ALG_NONE_REJECTED');
});

test('unknown kid fails after one immediate JWKS refresh', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const signingKey = createRsaJwk({ kid: 'kid-signing' });
  const otherKey = createRsaJwk({ kid: 'kid-other' });

  const fetchImpl = createFetchMock({
    jwksPayloads: [
      { keys: [otherKey.jwk] },
      { keys: [otherKey.jwk] }
    ]
  });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const idToken = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: signingKey.kid },
    payload: standardPayload({ nowSec }),
    privateKey: signingKey.privateKey
  });

  const result = await adapter.verifyIdToken({ idToken, expectedNonce: 'nonce-123' });
  assert.equal(result.ok, false);
  assert.equal(result.error.details.reason, 'KID_NOT_FOUND');
});

test('unknown kid is resolved after JWKS refresh when new key appears', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const oldKey = createRsaJwk({ kid: 'kid-old' });
  const newKey = createRsaJwk({ kid: 'kid-new' });

  const fetchImpl = createFetchMock({
    jwksPayloads: [
      { keys: [oldKey.jwk] },
      { keys: [newKey.jwk] }
    ]
  });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const firstToken = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: oldKey.kid },
    payload: standardPayload({ nowSec }),
    privateKey: oldKey.privateKey
  });
  const firstResult = await adapter.verifyIdToken({ idToken: firstToken, expectedNonce: 'nonce-123' });
  assert.equal(firstResult.ok, true);

  const secondToken = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: newKey.kid },
    payload: standardPayload({ nowSec }),
    privateKey: newKey.privateKey
  });
  const secondResult = await adapter.verifyIdToken({ idToken: secondToken, expectedNonce: 'nonce-123' });
  assert.equal(secondResult.ok, true);
});

test('stale JWKS cache can be used when refresh fails before hard TTL and fails after hard TTL', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-stale' });

  const fetchImpl = createFetchMock({ jwksPayloads: [{ keys: [key.jwk] }] });
  const adapter = createOidcFixture({ fetchImpl, nowRef });

  const token = signJwt({
    header: { alg: 'RS256', typ: 'JWT', kid: key.kid },
    payload: standardPayload({ nowSec, overrides: { exp: nowSec + (30 * 60 * 60) } }),
    privateKey: key.privateKey
  });

  const warm = await adapter.verifyIdToken({ idToken: token, expectedNonce: 'nonce-123' });
  assert.equal(warm.ok, true);

  adapter.fetchImpl = createFetchMock({ failJwks: true });
  nowRef.value += 11 * 60 * 1000;
  const staleOk = await adapter.verifyIdToken({ idToken: token, expectedNonce: 'nonce-123' });
  assert.equal(staleOk.ok, true);

  nowRef.value += 25 * 60 * 60 * 1000;
  const staleExpired = await adapter.verifyIdToken({ idToken: token, expectedNonce: 'nonce-123' });
  assert.equal(staleExpired.ok, false);
  assert.equal(staleExpired.error.code, 'PROVIDER_UNAVAILABLE');
});

test('discovery failure and malformed metadata fail closed', async () => {
  const nowSec = 1_700_000_000;
  const nowRef = { value: nowSec * 1000 };
  const key = createRsaJwk({ kid: 'kid-discovery' });

  const networkFailAdapter = createOidcFixture({
    fetchImpl: createFetchMock({ failDiscovery: true }),
    nowRef
  });
  const discoveryFailure = await networkFailAdapter.discoverProviderMetadata();
  assert.equal(discoveryFailure.ok, false);
  assert.equal(discoveryFailure.error.code, 'PROVIDER_UNAVAILABLE');

  const malformedAdapter = createOidcFixture({
    fetchImpl: createFetchMock({
      discoveryPayload: {
        issuer: 'https://mismatch.example',
        jwks_uri: 'https://mismatch.example/jwks'
      },
      jwksPayloads: [{ keys: [key.jwk] }]
    }),
    nowRef
  });

  const malformed = await malformedAdapter.discoverProviderMetadata();
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, 'PROVIDER_UNAVAILABLE');
});