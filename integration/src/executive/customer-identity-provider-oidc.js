import {
  createIdentityError,
  createIdentityResult,
  IdentityErrorCodes,
  IdentityProviderStatuses,
  normalizeEmail
} from './customer-identity-provider-contracts.js';

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

export class OidcIdentityProviderAdapter {
  constructor({
    fetchImpl = globalThis.fetch,
    logger,
    config = {}
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.logger = logger ?? { log: () => {} };
    this.config = {
      issuerUrl: config.issuerUrl ?? process.env.ATLAS_IDENTITY_OIDC_ISSUER_URL ?? '',
      clientId: config.clientId ?? process.env.ATLAS_IDENTITY_OIDC_CLIENT_ID ?? '',
      clientSecret: config.clientSecret ?? process.env.ATLAS_IDENTITY_OIDC_CLIENT_SECRET ?? '',
      audience: config.audience ?? process.env.ATLAS_IDENTITY_OIDC_AUDIENCE ?? '',
      managementToken: config.managementToken ?? process.env.ATLAS_IDENTITY_OIDC_MANAGEMENT_TOKEN ?? ''
    };
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
      connectivity: IdentityProviderStatuses.NOT_CONNECTED,
      warnings: [
        'OIDC adapter is foundation-only in v1 and is not production-complete.',
        'Missing issuer discovery, signature/audience validation, callback state/nonce checks, and provider callback handling.'
      ]
    };
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
      managementConfigured: hasText(this.config.managementToken)
    };
  }
}
