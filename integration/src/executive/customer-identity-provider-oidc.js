import {
  createIdentityError,
  createIdentityResult,
  IdentityErrorCodes,
  IdentityProviderStatuses,
  normalizeEmail
} from './customer-identity-provider-contracts.js';
import { createPublicKey, verify } from 'node:crypto';

const OIDC_DISCOVERY_PATH = '/.well-known/openid-configuration';
const SupportedJwtAlgorithms = new Set(['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512']);

function normalizeIssuer(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.replace(/\/$/, '');
}

function nowMs(nowFn) {
  if (typeof nowFn === 'function') {
    const value = nowFn();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Date.parse(String(value ?? ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function base64UrlDecodeToBuffer(value) {
  const text = String(value ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = text.length % 4;
  const padded = pad === 0 ? text : `${text}${'='.repeat(4 - pad)}`;
  return Buffer.from(padded, 'base64');
}

function parseJwt(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || parts.some((part) => !part || String(part).trim().length === 0)) {
    return { ok: false, reason: 'JWT_MALFORMED', header: null, payload: null, signature: null, signingInput: null };
  }

  try {
    const header = JSON.parse(base64UrlDecodeToBuffer(parts[0]).toString('utf8'));
    const payload = JSON.parse(base64UrlDecodeToBuffer(parts[1]).toString('utf8'));
    const signature = base64UrlDecodeToBuffer(parts[2]);
    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    return { ok: true, reason: null, header, payload, signature, signingInput };
  } catch {
    return { ok: false, reason: 'JWT_MALFORMED', header: null, payload: null, signature: null, signingInput: null };
  }
}

function algorithmDigest(jwtAlg) {
  switch (jwtAlg) {
    case 'RS256':
    case 'ES256':
      return 'sha256';
    case 'RS384':
    case 'ES384':
      return 'sha384';
    case 'RS512':
    case 'ES512':
      return 'sha512';
    default:
      return null;
  }
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function toScopeText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean).join(' ');
  }
  return String(value ?? '').trim();
}

export class OidcIdentityProviderAdapter {
  constructor({
    fetchImpl = globalThis.fetch,
    logger,
    config = {},
    now,
    discoverySoftTtlMs = 10 * 60 * 1000,
    discoveryHardTtlMs = 24 * 60 * 60 * 1000,
    jwksSoftTtlMs = 10 * 60 * 1000,
    jwksHardTtlMs = 24 * 60 * 60 * 1000,
    clockSkewSec = 60
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.logger = logger ?? { log: () => {} };
    this.now = now;
    this.discoverySoftTtlMs = discoverySoftTtlMs;
    this.discoveryHardTtlMs = jwksHardTtlMs > discoveryHardTtlMs ? jwksHardTtlMs : discoveryHardTtlMs;
    this.jwksSoftTtlMs = jwksSoftTtlMs;
    this.jwksHardTtlMs = jwksHardTtlMs;
    this.clockSkewSec = Number.parseInt(String(clockSkewSec ?? ''), 10) > 0
      ? Number.parseInt(String(clockSkewSec), 10)
      : 60;
    this.config = {
      issuerUrl: config.issuerUrl ?? process.env.ATLAS_IDENTITY_OIDC_ISSUER_URL ?? '',
      clientId: config.clientId ?? process.env.ATLAS_IDENTITY_OIDC_CLIENT_ID ?? '',
      clientSecret: config.clientSecret ?? process.env.ATLAS_IDENTITY_OIDC_CLIENT_SECRET ?? '',
      audience: config.audience ?? process.env.ATLAS_IDENTITY_OIDC_AUDIENCE ?? '',
      managementToken: config.managementToken ?? process.env.ATLAS_IDENTITY_OIDC_MANAGEMENT_TOKEN ?? ''
    };
    this.discoveryCache = new Map();
    this.jwksCache = new Map();
  }

  getProviderName() {
    return 'OIDC_EXTERNAL';
  }

  isConfigured() {
    return hasText(this.config.issuerUrl)
      && hasText(this.config.clientId)
      && hasText(this.config.clientSecret);
  }

  getStatus() {
    if (!this.isConfigured()) {
      return {
        mode: IdentityProviderStatuses.NOT_CONFIGURED,
        readiness: IdentityProviderStatuses.NOT_CONFIGURED,
        connectivity: IdentityProviderStatuses.NOT_CONNECTED,
        warnings: ['OIDC provider is selected but not fully configured.']
      };
    }

    return {
      mode: IdentityProviderStatuses.DEGRADED,
      readiness: IdentityProviderStatuses.DEGRADED,
      connectivity: IdentityProviderStatuses.CONNECTED,
      warnings: [
        'OIDC adapter is partial and not production-complete.',
        'Cryptographic validation is available; callback exchange, refresh, and logout federation are not implemented yet.'
      ]
    };
  }

  async startAuthorization({
    state,
    nonce,
    redirectUri,
    pkceChallenge,
    pkceMethod = 'S256',
    scope = 'openid profile email',
    prompt = null,
    loginHint = null,
    additionalParams = {}
  } = {}) {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (!hasText(state) || !hasText(nonce) || !hasText(redirectUri) || !hasText(pkceChallenge)) {
      return this.failure({
        code: IdentityErrorCodes.INVALID_REQUEST,
        message: 'OIDC authorization start requires state, nonce, redirect URI, and PKCE challenge.',
        details: { reason: 'AUTH_START_INPUT_INVALID' }
      });
    }

    const discovery = await this.discoverProviderMetadata();
    if (!discovery.ok) return discovery;

    const authorizationEndpoint = String(discovery.data?.metadata?.authorization_endpoint ?? '').trim();
    if (!authorizationEndpoint) {
      return this.failure({
        code: IdentityErrorCodes.PROVIDER_UNAVAILABLE,
        message: 'OIDC discovery metadata is missing authorization endpoint.',
        details: { reason: 'AUTHORIZATION_ENDPOINT_MISSING' }
      });
    }

    const query = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: String(redirectUri),
      scope: toScopeText(scope) || 'openid profile email',
      state: String(state),
      nonce: String(nonce),
      code_challenge: String(pkceChallenge),
      code_challenge_method: String(pkceMethod || 'S256')
    });

    if (hasText(this.config.audience)) {
      query.set('audience', String(this.config.audience));
    }
    if (hasText(prompt)) {
      query.set('prompt', String(prompt));
    }
    if (hasText(loginHint)) {
      query.set('login_hint', String(loginHint));
    }

    Object.entries(additionalParams ?? {}).forEach(([key, value]) => {
      if (!hasText(key) || value == null) return;
      query.set(String(key), String(value));
    });

    return this.success({
      authorizationEndpoint,
      authorizationUrl: `${authorizationEndpoint}?${query.toString()}`,
      state: String(state),
      nonce: String(nonce),
      pkceMethod: String(pkceMethod || 'S256')
    });
  }

  async exchangeAuthorizationCode({
    code,
    redirectUri,
    pkceVerifier,
    expectedNonce = null,
    expectedState = null,
    receivedState = null
  } = {}) {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (!hasText(code) || !hasText(redirectUri) || !hasText(pkceVerifier)) {
      return this.failure({
        code: IdentityErrorCodes.INVALID_REQUEST,
        message: 'OIDC callback exchange requires code, redirectUri, and PKCE verifier.',
        details: { reason: 'CALLBACK_INPUT_INVALID' }
      });
    }

    const discovery = await this.discoverProviderMetadata();
    if (!discovery.ok) return discovery;

    const tokenEndpoint = String(discovery.data?.metadata?.token_endpoint ?? '').trim();
    if (!tokenEndpoint) {
      return this.failure({
        code: IdentityErrorCodes.PROVIDER_UNAVAILABLE,
        message: 'OIDC discovery metadata is missing token endpoint.',
        details: { reason: 'TOKEN_ENDPOINT_MISSING' }
      });
    }

    let payload;
    let response;
    try {
      const requestBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: String(redirectUri),
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code_verifier: String(pkceVerifier)
      });

      response = await this.fetchImpl(tokenEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json'
        },
        body: requestBody.toString()
      });
      payload = await response.json();
    } catch (error) {
      return this.failure({
        code: IdentityErrorCodes.PROVIDER_UNAVAILABLE,
        message: 'OIDC authorization code exchange failed.',
        details: {
          reason: error instanceof Error ? error.message : String(error)
        }
      });
    }

    if (!response?.ok) {
      const invalidGrant = String(payload?.error ?? '').toLowerCase() === 'invalid_grant';
      return this.failure({
        code: invalidGrant ? IdentityErrorCodes.TOKEN_EXPIRED : IdentityErrorCodes.PROVIDER_UNAVAILABLE,
        message: invalidGrant
          ? 'OIDC authorization code is invalid or expired.'
          : 'OIDC authorization code exchange failed.',
        details: {
          status: response?.status ?? null,
          providerError: payload?.error ?? null,
          providerErrorDescription: payload?.error_description ?? null
        }
      });
    }

    const idToken = String(payload?.id_token ?? '').trim();
    if (!idToken) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'OIDC token response is missing id_token.',
        details: { reason: 'ID_TOKEN_MISSING' }
      });
    }

    const verifyResult = await this.verifyIdToken({
      idToken,
      expectedIssuer: this.config.issuerUrl,
      expectedAudience: this.config.clientId,
      expectedNonce,
      expectedState,
      receivedState
    });
    if (!verifyResult.ok) return verifyResult;

    const claims = verifyResult.data.claims ?? {};
    return this.success({
      claims,
      providerUserId: claims.sub ?? null,
      email: normalizeEmail(claims.email ?? ''),
      emailVerified: Boolean(claims.email_verified ?? false),
      keyId: verifyResult.data.keyId,
      algorithm: verifyResult.data.algorithm
    });
  }

  failure({ code = IdentityErrorCodes.PROVIDER_UNAVAILABLE, message = 'OIDC operation failed.', details = null } = {}) {
    return createIdentityResult({
      ok: false,
      error: createIdentityError({ code, message, details }),
      providerStatus: this.getStatus()
    });
  }

  success(data) {
    return createIdentityResult({
      ok: true,
      data,
      providerStatus: this.getStatus()
    });
  }

  discoverEndpoint() {
    const issuer = normalizeIssuer(this.config.issuerUrl);
    return `${issuer}${OIDC_DISCOVERY_PATH}`;
  }

  parseJsonResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response object.');
    }

    if (!response.ok) {
      throw new Error(`HTTP_${response.status ?? 'UNKNOWN'}`);
    }

    return response.json();
  }

  isCacheUsable(cacheRecord, { softTtlMs, hardTtlMs } = {}) {
    if (!cacheRecord) return { softValid: false, hardValid: false, ageMs: null };
    const ageMs = nowMs(this.now) - Number(cacheRecord.fetchedAtMs ?? 0);
    return {
      softValid: ageMs >= 0 && ageMs <= softTtlMs,
      hardValid: ageMs >= 0 && ageMs <= hardTtlMs,
      ageMs
    };
  }

  validateDiscoveryMetadata(metadata = {}) {
    const configuredIssuer = normalizeIssuer(this.config.issuerUrl);
    const metadataIssuer = normalizeIssuer(metadata.issuer);

    if (!configuredIssuer || !metadataIssuer) {
      return { valid: false, reason: 'DISCOVERY_ISSUER_MISSING' };
    }

    if (configuredIssuer !== metadataIssuer) {
      return { valid: false, reason: 'DISCOVERY_ISSUER_MISMATCH' };
    }

    if (!hasText(metadata.jwks_uri)) {
      return { valid: false, reason: 'DISCOVERY_JWKS_URI_MISSING' };
    }

    return { valid: true, reason: null };
  }

  async fetchDiscoveryMetadata() {
    const response = await this.fetchImpl(this.discoverEndpoint(), {
      method: 'GET',
      headers: { accept: 'application/json' }
    });
    const metadata = await this.parseJsonResponse(response);
    const validation = this.validateDiscoveryMetadata(metadata);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }
    return metadata;
  }

  async discoverProviderMetadata({ forceRefresh = false } = {}) {
    if (!this.isConfigured()) return this.notConfiguredResult();

    const issuer = normalizeIssuer(this.config.issuerUrl);
    const cached = this.discoveryCache.get(issuer) ?? null;
    const cachedValidity = this.isCacheUsable(cached, {
      softTtlMs: this.discoverySoftTtlMs,
      hardTtlMs: this.discoveryHardTtlMs
    });

    if (!forceRefresh && cached && cachedValidity.softValid) {
      return this.success({ metadata: cached.metadata, cache: { hit: true, stale: false, ageMs: cachedValidity.ageMs } });
    }

    try {
      const metadata = await this.fetchDiscoveryMetadata();
      this.discoveryCache.set(issuer, {
        metadata,
        fetchedAtMs: nowMs(this.now)
      });
      return this.success({ metadata, cache: { hit: false, stale: false, ageMs: 0 } });
    } catch (error) {
      if (!forceRefresh && cached && cachedValidity.hardValid) {
        this.logger.log({
          event: 'oidc_discovery_stale_cache_used',
          issuer,
          reason: error instanceof Error ? error.message : String(error)
        });
        return this.success({ metadata: cached.metadata, cache: { hit: true, stale: true, ageMs: cachedValidity.ageMs } });
      }

      return this.failure({
        code: IdentityErrorCodes.PROVIDER_UNAVAILABLE,
        message: 'OIDC discovery failed or returned invalid metadata.',
        details: {
          issuer,
          reason: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  normalizeJwksPayload(payload = {}) {
    const keys = Array.isArray(payload?.keys) ? payload.keys : null;
    if (!keys) return null;

    const byKid = new Map();
    keys.forEach((key) => {
      if (!hasText(key?.kid) || !hasText(key?.kty)) return;
      byKid.set(String(key.kid), key);
    });

    if (byKid.size === 0) return null;
    return byKid;
  }

  async fetchJwks(issuer) {
    const discovery = await this.discoverProviderMetadata();
    if (!discovery.ok) {
      throw new Error(discovery.error?.message ?? 'DISCOVERY_FAILED');
    }

    const response = await this.fetchImpl(discovery.data.metadata.jwks_uri, {
      method: 'GET',
      headers: { accept: 'application/json' }
    });
    const payload = await this.parseJsonResponse(response);
    const byKid = this.normalizeJwksPayload(payload);
    if (!byKid) {
      throw new Error('JWKS_MALFORMED');
    }

    const cacheRecord = {
      issuer,
      jwksUri: discovery.data.metadata.jwks_uri,
      keysByKid: byKid,
      fetchedAtMs: nowMs(this.now)
    };

    this.jwksCache.set(issuer, cacheRecord);
    return cacheRecord;
  }

  async resolveSigningKey({ kid, forceRefresh = false } = {}) {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (!hasText(kid)) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'JWT header kid is required for key resolution.',
        details: { reason: 'KID_MISSING' }
      });
    }

    const issuer = normalizeIssuer(this.config.issuerUrl);
    const cached = this.jwksCache.get(issuer) ?? null;
    const cacheValidity = this.isCacheUsable(cached, {
      softTtlMs: this.jwksSoftTtlMs,
      hardTtlMs: this.jwksHardTtlMs
    });

    const tryCached = () => {
      if (!cached || !cacheValidity.hardValid) return null;
      return cached.keysByKid.get(String(kid)) ?? null;
    };

    if (!forceRefresh && cached && cacheValidity.softValid) {
      const key = tryCached();
      if (key) {
        return this.success({ key, cache: { hit: true, stale: false, refreshed: false } });
      }
    }

    try {
      const refreshed = await this.fetchJwks(issuer);
      const key = refreshed.keysByKid.get(String(kid)) ?? null;
      if (key) {
        return this.success({ key, cache: { hit: false, stale: false, refreshed: true } });
      }

      const staleKey = tryCached();
      if (staleKey) {
        this.logger.log({
          event: 'oidc_jwks_stale_key_used',
          issuer,
          kid
        });
        return this.success({ key: staleKey, cache: { hit: true, stale: true, refreshed: true } });
      }

      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'Signing key not found after JWKS refresh.',
        details: { reason: 'KID_NOT_FOUND', issuer, kid }
      });
    } catch (error) {
      const staleKey = tryCached();
      if (!forceRefresh && staleKey) {
        this.logger.log({
          event: 'oidc_jwks_refresh_failed_stale_key_used',
          issuer,
          kid,
          reason: error instanceof Error ? error.message : String(error)
        });
        return this.success({ key: staleKey, cache: { hit: true, stale: true, refreshed: false } });
      }

      return this.failure({
        code: IdentityErrorCodes.PROVIDER_UNAVAILABLE,
        message: 'Unable to resolve signing keys from provider JWKS endpoint.',
        details: {
          issuer,
          kid,
          reason: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  validateAuthorizationContext({ expectedNonce = null, receivedNonce = null, expectedState = null, receivedState = null } = {}) {
    if (hasText(expectedNonce) && !hasText(receivedNonce)) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'Nonce is missing from OIDC token claims.',
        details: { reason: 'NONCE_MISSING' }
      });
    }

    if (hasText(expectedNonce) && String(expectedNonce) !== String(receivedNonce)) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'Nonce does not match expected value.',
        details: { reason: 'NONCE_MISMATCH' }
      });
    }

    if (hasText(expectedState) && !hasText(receivedState)) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'State is missing from OIDC callback context.',
        details: { reason: 'STATE_MISSING' }
      });
    }

    if (hasText(expectedState) && String(expectedState) !== String(receivedState)) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'State does not match expected value.',
        details: { reason: 'STATE_MISMATCH' }
      });
    }

    return this.success({ valid: true });
  }

  validateIdTokenClaims({
    claims,
    expectedIssuer = this.config.issuerUrl,
    expectedAudience = this.config.clientId,
    expectedNonce = null,
    expectedState = null,
    receivedState = null,
    now = null,
    clockSkewSec = this.clockSkewSec
  } = {}) {
    if (!claims || typeof claims !== 'object') {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'ID token claims are missing or malformed.',
        details: { reason: 'CLAIMS_MALFORMED' }
      });
    }

    const nowSeconds = Number.isFinite(now) ? Math.floor(now) : Math.floor(nowMs(this.now) / 1000);
    const skew = Number.isFinite(Number(clockSkewSec)) ? Number(clockSkewSec) : this.clockSkewSec;

    const configuredIssuer = normalizeIssuer(expectedIssuer);
    const actualIssuer = normalizeIssuer(claims.iss);
    if (!configuredIssuer || !actualIssuer || configuredIssuer !== actualIssuer) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'ID token issuer claim validation failed.',
        details: { reason: 'ISSUER_MISMATCH', expectedIssuer: configuredIssuer, actualIssuer }
      });
    }

    const audienceClaim = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const audienceMatch = audienceClaim.some((entry) => String(entry ?? '').trim() === String(expectedAudience ?? '').trim());
    if (!audienceMatch) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'ID token audience claim validation failed.',
        details: { reason: 'AUDIENCE_MISMATCH', expectedAudience, actualAudience: audienceClaim }
      });
    }

    const exp = Number(claims.exp);
    if (!Number.isFinite(exp) || nowSeconds > exp + skew) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_EXPIRED,
        message: 'ID token has expired.',
        details: { reason: 'EXP_EXPIRED', exp, nowSeconds, skew }
      });
    }

    const iat = Number(claims.iat);
    if (!Number.isFinite(iat)) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'ID token iat claim is missing or invalid.',
        details: { reason: 'IAT_INVALID' }
      });
    }

    if (iat > nowSeconds + skew) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'ID token iat claim is in the future beyond allowed skew.',
        details: { reason: 'IAT_IN_FUTURE', iat, nowSeconds, skew }
      });
    }

    const contextValidation = this.validateAuthorizationContext({
      expectedNonce,
      receivedNonce: claims.nonce,
      expectedState,
      receivedState
    });
    if (!contextValidation.ok) return contextValidation;

    return this.success({ valid: true });
  }

  verifyJwtSignature({ token, allowAlgorithms = SupportedJwtAlgorithms } = {}) {
    const parsed = parseJwt(token);
    if (!parsed.ok) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'JWT is malformed.',
        details: { reason: parsed.reason }
      });
    }

    const alg = String(parsed.header?.alg ?? '').trim();
    if (!alg || String(alg).toLowerCase() === 'none') {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'JWT algorithm none is not permitted.',
        details: { reason: 'ALG_NONE_REJECTED' }
      });
    }

    if (!allowAlgorithms.has(alg)) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'JWT algorithm is not supported.',
        details: { reason: 'ALG_UNSUPPORTED', alg }
      });
    }

    if (!hasText(parsed.header?.kid)) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'JWT kid header is required.',
        details: { reason: 'KID_MISSING' }
      });
    }

    return this.success({
      parsed,
      kid: parsed.header.kid,
      alg
    });
  }

  async verifyIdToken({
    idToken,
    expectedIssuer = this.config.issuerUrl,
    expectedAudience = this.config.clientId,
    expectedNonce = null,
    expectedState = null,
    receivedState = null,
    now = null,
    clockSkewSec = this.clockSkewSec
  } = {}) {
    if (!this.isConfigured()) return this.notConfiguredResult();

    const parsedValidation = this.verifyJwtSignature({ token: idToken });
    if (!parsedValidation.ok) return parsedValidation;

    const { parsed, kid, alg } = parsedValidation.data;
    const keyResult = await this.resolveSigningKey({ kid, forceRefresh: false });
    if (!keyResult.ok) return keyResult;

    try {
      const keyObject = createPublicKey({ key: keyResult.data.key, format: 'jwk' });
      const digestAlgorithm = algorithmDigest(alg);
      if (!digestAlgorithm) {
        return this.failure({
          code: IdentityErrorCodes.TOKEN_INVALID,
          message: 'JWT algorithm is not supported.',
          details: { reason: 'ALG_UNSUPPORTED', alg }
        });
      }

      const signatureValid = verify(digestAlgorithm, parsed.signingInput, keyObject, parsed.signature);
      if (!signatureValid) {
        return this.failure({
          code: IdentityErrorCodes.TOKEN_INVALID,
          message: 'JWT signature verification failed.',
          details: { reason: 'SIGNATURE_INVALID', kid, alg }
        });
      }
    } catch (error) {
      return this.failure({
        code: IdentityErrorCodes.TOKEN_INVALID,
        message: 'JWT signature verification failed.',
        details: {
          reason: error instanceof Error ? error.message : String(error),
          kid,
          alg
        }
      });
    }

    const claimsValidation = this.validateIdTokenClaims({
      claims: parsed.payload,
      expectedIssuer,
      expectedAudience,
      expectedNonce,
      expectedState,
      receivedState,
      now,
      clockSkewSec
    });
    if (!claimsValidation.ok) return claimsValidation;

    return this.success({
      header: parsed.header,
      claims: parsed.payload,
      keyId: kid,
      algorithm: alg
    });
  }

  notConfiguredResult() {
    return createIdentityResult({
      ok: false,
      error: createIdentityError({
        code: IdentityErrorCodes.PROVIDER_NOT_CONFIGURED,
        message: 'External identity provider is not configured.'
      }),
      providerStatus: this.getStatus()
    });
  }

  register({ email } = {}) {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return createIdentityResult({
      ok: false,
      error: createIdentityError({
        code: IdentityErrorCodes.PROVIDER_UNAVAILABLE,
        message: 'OIDC provider registration endpoint is not implemented in v1 adapter.'
      }),
      providerStatus: this.getStatus()
    });
  }

  login({ email } = {}) {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return createIdentityResult({
      ok: false,
      error: createIdentityError({
        code: IdentityErrorCodes.PROVIDER_UNAVAILABLE,
        message: 'OIDC provider login endpoint is not implemented in v1 adapter.'
      }),
      providerStatus: this.getStatus()
    });
  }

  logout() {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return createIdentityResult({ ok: true, data: { loggedOut: true }, providerStatus: this.getStatus() });
  }

  validateSession() {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return createIdentityResult({ ok: true, data: { valid: true }, providerStatus: this.getStatus() });
  }

  refreshSession() {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return createIdentityResult({ ok: true, data: { refreshed: true }, providerStatus: this.getStatus() });
  }

  requestPasswordReset({ email } = {}) {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return createIdentityResult({ ok: true, data: { accepted: true, generic: true, email: normalizeEmail(email) }, providerStatus: this.getStatus() });
  }

  completePasswordReset() {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return createIdentityResult({
      ok: false,
      error: createIdentityError({ code: IdentityErrorCodes.PROVIDER_UNAVAILABLE, message: 'OIDC reset completion is not implemented in v1 adapter.' }),
      providerStatus: this.getStatus()
    });
  }

  lookupUser() {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return createIdentityResult({ ok: true, data: null, providerStatus: this.getStatus() });
  }

  linkIdentity({ providerUserId, linkedCustomerId } = {}) {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return createIdentityResult({ ok: true, data: { providerUserId, linkedCustomerId }, providerStatus: this.getStatus() });
  }

  healthReport() {
    const status = this.getStatus();
    if (!this.isConfigured()) {
      return {
        provider: this.getProviderName(),
        ...status
      };
    }

    return {
      provider: this.getProviderName(),
      ...status,
      issuerConfigured: hasText(this.config.issuerUrl),
      clientConfigured: hasText(this.config.clientId),
      managementConfigured: hasText(this.config.managementToken),
      discoveryCacheEntries: this.discoveryCache.size,
      jwksCacheEntries: this.jwksCache.size
    };
  }
}
