import { createCustomerIdentityProvider } from './customer-identity-provider-factory.js';
import { CustomerSessionManager } from './customer-session-manager.js';
import { CustomerStatuses } from './customer-intake-mission-control-contracts.js';
import { normalizeEmail, IdentityErrorCodes, IdentityProviderStatuses } from './customer-identity-provider-contracts.js';
import { getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';
import { CustomerOidcAuthTransactionStore } from './customer-oidc-auth-transaction-store.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DEFAULT_DEVELOPMENT_ENVELOPE_KEY, SecurityEnvelopeCrypto } from './security-envelope-crypto.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function nowMs(nowFn) {
  const value = nowFn?.();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ''));
  if (Number.isFinite(parsed)) return parsed;
  return Date.now();
}

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex').slice(0, 16);
}

function boolFlag(value, fallback = false) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}

function isHttpsUrl(value) {
  try {
    const parsed = new URL(String(value ?? '').trim());
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function parseCsv(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function genericAuthFailure() {
  return {
    accepted: false,
    status: 401,
    code: 'UNAUTHORIZED',
    reason: 'Invalid credentials or account is unavailable.',
    data: null
  };
}

const RestrictedLifecycleStatuses = new Set([
  CustomerStatuses.SUSPENDED,
  CustomerStatuses.DISABLED,
  CustomerStatuses.BLOCKED
]);

const PendingLifecycleStatuses = new Set([
  CustomerStatuses.PENDING_VERIFICATION,
  CustomerStatuses.INTAKE_REVIEW
]);

function lifecycleDecision(status) {
  const normalized = String(status ?? '').toUpperCase();
  if (RestrictedLifecycleStatuses.has(normalized)) {
    return {
      allowed: false,
      code: normalized === CustomerStatuses.SUSPENDED
        ? 'ACCOUNT_SUSPENDED'
        : (normalized === CustomerStatuses.DISABLED ? 'ACCOUNT_DISABLED' : 'ACCOUNT_ARCHIVED'),
      reason: normalized === CustomerStatuses.SUSPENDED
        ? 'Account is suspended.'
        : (normalized === CustomerStatuses.DISABLED ? 'Account is disabled.' : 'Account is archived or blocked.')
    };
  }

  if (PendingLifecycleStatuses.has(normalized)) {
    return {
      allowed: false,
      code: 'EMAIL_NOT_VERIFIED',
      reason: 'Email verification is required before sign-in.'
    };
  }

  return {
    allowed: true,
    code: null,
    reason: null
  };
}

export class CustomerAuthManager {
  constructor({
    missionControl,
    storageProvider,
    now,
    logger,
    environment = process.env.NODE_ENV ?? 'development',
    providerFactoryArgs = {},
    namespace = 'executive.customer-auth'
  } = {}) {
    this.missionControl = missionControl ?? null;
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.environment = String(environment ?? 'development').toLowerCase();
    this.logger = logger ?? { log: () => {} };
    this.namespace = namespace;
    this.identityLinks = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.identity-links` });
    this.loginFailures = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.login-failures` });
    this.authMetrics = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.metrics` });
    this.providerSessions = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.provider-sessions` });
    this.exposeDevelopmentResetTokens = String(process.env.ATLAS_LOCAL_IDENTITY_EXPOSE_RESET_TOKEN ?? 'false').toLowerCase() === 'true';

    this.providerSelection = createCustomerIdentityProvider({
      storageProvider: this.storageProvider,
      now: this.now,
      logger: this.logger,
      environment: this.environment,
      ...providerFactoryArgs
    });

    this.identityProvider = this.providerSelection.provider;
    this.sessionManager = new CustomerSessionManager({
      storageProvider: this.storageProvider,
      now: this.now,
      logger: this.logger,
      namespace: `${namespace}.sessions`
    });
    this.envelopeCrypto = new SecurityEnvelopeCrypto();
    this.oidcTransactionStore = new CustomerOidcAuthTransactionStore({
      storageProvider: this.storageProvider,
      now: this.now,
      verifierCipher: this.envelopeCrypto,
      namespace: `${namespace}.oidc-transactions`
    });

    this.identityProvider.setTelemetryRecorder?.((eventName, details = {}) => {
      this.recordProviderTelemetry(eventName, details.providerType ?? this.providerSelection.type);
    });

    this.startupReadiness = this.evaluateOperationalReadiness();
    if (this.startupReadiness.failStartup) {
      throw new Error(`AUTH_STARTUP_VALIDATION_FAILED: ${this.startupReadiness.summary}`);
    }
  }

  isProductionMode() {
    return this.environment === 'production';
  }

  parseConfiguredCallbackUrls() {
    return parseCsv(process.env.ATLAS_IDENTITY_OIDC_CALLBACK_URLS);
  }

  evaluateOperationalReadiness() {
    const checks = {
      providerConfiguration: { ready: true, issues: [] },
      cryptoConfiguration: { ready: true, issues: [] },
      callbackConfiguration: { ready: true, issues: [] },
      telemetryAvailability: { ready: true, issues: [] },
      auditAvailability: { ready: true, issues: [] },
      persistenceAvailability: { ready: true, issues: [] }
    };

    const providerType = String(this.providerSelection.type ?? '').trim().toLowerCase();
    const rollout = this.providerSelection.rollout ?? {
      stage: 'disabled',
      enabled: false,
      emergencyDisabled: false
    };
    const providerStatus = this.identityProvider.getStatus?.() ?? {};
    const configuredCallbacks = this.parseConfiguredCallbackUrls();

    if (providerType === 'oidc') {
      if (!this.identityProvider.isConfigured?.()) {
        checks.providerConfiguration.ready = false;
        checks.providerConfiguration.issues.push('OIDC provider configuration is incomplete.');
      }

      const issuer = String(this.identityProvider.config?.issuerUrl ?? process.env.ATLAS_IDENTITY_OIDC_ISSUER_URL ?? '').trim();
      if (!isHttpsUrl(issuer)) {
        checks.providerConfiguration.ready = false;
        checks.providerConfiguration.issues.push('OIDC issuer must be a valid HTTPS URL.');
      }

      if (!hasText(this.identityProvider.config?.clientSecret ?? process.env.ATLAS_IDENTITY_OIDC_CLIENT_SECRET)) {
        checks.providerConfiguration.ready = false;
        checks.providerConfiguration.issues.push('OIDC client secret is required.');
      }

      if (!hasText(this.identityProvider.config?.clientId ?? process.env.ATLAS_IDENTITY_OIDC_CLIENT_ID)) {
        checks.providerConfiguration.ready = false;
        checks.providerConfiguration.issues.push('OIDC client id is required.');
      }

      if (configuredCallbacks.length === 0) {
        checks.callbackConfiguration.ready = false;
        checks.callbackConfiguration.issues.push('ATLAS_IDENTITY_OIDC_CALLBACK_URLS must include at least one callback URL.');
      }
      if (configuredCallbacks.some((url) => !isHttpsUrl(url))) {
        checks.callbackConfiguration.ready = false;
        checks.callbackConfiguration.issues.push('OIDC callback URLs must be valid HTTPS URLs.');
      }

      const keyringRaw = String(process.env.ATLAS_AUTH_ENCRYPTION_KEYRING_JSON ?? '').trim();
      const activeKeyVersion = String(process.env.ATLAS_AUTH_ENCRYPTION_KEY_VERSION ?? this.envelopeCrypto.activeKeyVersion ?? '').trim();
      const hasKeyring = keyringRaw.length > 0;
      if (!hasKeyring) {
        checks.cryptoConfiguration.ready = false;
        checks.cryptoConfiguration.issues.push('ATLAS_AUTH_ENCRYPTION_KEYRING_JSON is required for OIDC production encryption.');
      }
      if (!activeKeyVersion) {
        checks.cryptoConfiguration.ready = false;
        checks.cryptoConfiguration.issues.push('ATLAS_AUTH_ENCRYPTION_KEY_VERSION is required for production key versioning.');
      }
      if (this.envelopeCrypto.isUsingDevelopmentFallbackKey() || String(process.env.ATLAS_AUTH_ENCRYPTION_KEY ?? '') === DEFAULT_DEVELOPMENT_ENVELOPE_KEY) {
        checks.cryptoConfiguration.ready = false;
        checks.cryptoConfiguration.issues.push('Development fallback encryption key is not allowed in production readiness.');
      }

      if (!rollout.enabled || rollout.stage === 'disabled') {
        checks.providerConfiguration.ready = false;
        checks.providerConfiguration.issues.push('OIDC rollout stage is disabled.');
      }
      if (rollout.emergencyDisabled) {
        checks.providerConfiguration.ready = false;
        checks.providerConfiguration.issues.push('OIDC provider is disabled by emergency kill switch.');
      }
      if (providerStatus.readiness === IdentityProviderStatuses.NOT_CONFIGURED) {
        checks.providerConfiguration.ready = false;
        checks.providerConfiguration.issues.push('OIDC provider readiness is NOT_CONFIGURED.');
      }
    }

    if (typeof this.identityProvider.setTelemetryRecorder !== 'function') {
      checks.telemetryAvailability.ready = false;
      checks.telemetryAvailability.issues.push('Provider telemetry recorder is unavailable.');
    }

    if (typeof this.sessionManager.createAudit !== 'function') {
      checks.auditAvailability.ready = false;
      checks.auditAvailability.issues.push('Audit infrastructure is unavailable.');
    }

    if (!this.storageProvider && this.isProductionMode()) {
      checks.persistenceAvailability.ready = false;
      checks.persistenceAvailability.issues.push('Persistent storage provider is required in production mode.');
    }

    const failedChecks = Object.entries(checks).filter(([, value]) => !value.ready);
    const failStartup = this.isProductionMode() && providerType === 'oidc' && failedChecks.length > 0;

    return {
      environment: this.environment,
      providerType,
      rollout,
      checks,
      ready: failedChecks.length === 0,
      failStartup,
      summary: failedChecks.map(([name, value]) => `${name}: ${value.issues.join('; ')}`).join(' | ') || 'READY'
    };
  }

  generateOidcState() {
    return `oidc_state_${toBase64Url(randomBytes(18))}`;
  }

  generateOidcNonce() {
    return `oidc_nonce_${toBase64Url(randomBytes(18))}`;
  }

  generatePkceVerifier() {
    return toBase64Url(randomBytes(48));
  }

  createPkceChallenge(verifier) {
    return toBase64Url(createHash('sha256').update(String(verifier), 'utf8').digest());
  }

  providerBlocked() {
    return Boolean(this.providerSelection.blocked);
  }

  providerWarnings() {
    return this.providerSelection.warnings ?? [];
  }

  getIdentityLinkByEmail(email) {
    const normalized = normalizeEmail(email);
    return Array.from(this.identityLinks.values()).find((link) => link.normalizedEmail === normalized) ?? null;
  }

  getIdentityLinkByProviderUserId(providerUserId) {
    return Array.from(this.identityLinks.values()).find((link) => link.providerUserId === providerUserId) ?? null;
  }

  buildIdentityLink({ providerUserId, normalizedEmail, emailVerified, customerId, existingLink = null } = {}) {
    const providerType = this.providerSelection.type;
    const providerName = this.identityProvider.getProviderName?.() ?? providerType;
    const timestamp = nowIso(this.now);
    const linkId = existingLink?.linkId ?? `cidl_${providerType}_${providerUserId}`;

    return {
      linkId,
      providerType,
      providerName,
      providerUserId,
      normalizedEmail,
      verificationStatus: emailVerified ? 'VERIFIED' : 'PENDING',
      emailVerified: Boolean(emailVerified),
      customerId,
      disabled: Boolean(existingLink?.disabled ?? false),
      revoked: Boolean(existingLink?.revoked ?? false),
      createdAt: existingLink?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
  }

  persistIdentityLink(link) {
    this.identityLinks.set(link.linkId, link);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.identity-links`, key: link.linkId, value: link });
  }

  incrementMetric(metricName, amount = 1) {
    const key = String(metricName ?? '').trim();
    if (!key) return;
    const next = Number(this.authMetrics.get(key) ?? 0) + Number(amount);
    this.authMetrics.set(key, next);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.metrics`, key, value: next });
  }

  incrementLoginFailure(email) {
    const normalized = normalizeEmail(email);
    const current = Number(this.loginFailures.get(normalized) ?? 0) + 1;
    this.loginFailures.set(normalized, current);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.login-failures`, key: normalized, value: current });
  }

  clearLoginFailure(email) {
    const normalized = normalizeEmail(email);
    this.loginFailures.set(normalized, 0);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.login-failures`, key: normalized, value: 0 });
  }

  recordRateLimitEvent() {
    this.incrementMetric('rateLimitEvents', 1);
  }

  recordSecurityEvent(eventName) {
    const metric = String(eventName ?? '').trim();
    if (!metric) return;
    this.incrementMetric(metric, 1);
  }

  recordAuditEvent(event, details = {}) {
    try {
      this.sessionManager.createAudit?.(event, details);
    } catch {
      // Audit should never block auth flow.
    }
  }

  recordProviderTelemetry(eventName, providerType = this.providerSelection.type) {
    const event = String(eventName ?? '').trim();
    const provider = String(providerType ?? this.providerSelection.type ?? 'unknown').trim().toLowerCase() || 'unknown';
    if (!event) return;
    this.incrementMetric(`securityTelemetry.${event}.total`, 1);
    this.incrementMetric(`securityTelemetry.${event}.provider.${provider}`, 1);
  }

  buildSecurityTelemetrySnapshot() {
    const metric = (name) => Number(this.authMetrics.get(`securityTelemetry.${name}.total`) ?? 0);
    const loginSuccess = metric('login_success');
    const loginAttempts = metric('login_attempt');
    const loginSuccessRate = loginAttempts > 0 ? Number((loginSuccess / loginAttempts).toFixed(4)) : 0;
    return {
      loginSuccessRate,
      callbackFailures: metric('callback_failure'),
      refreshFailures: metric('refresh_failure'),
      jwksRefreshCount: metric('jwks_refresh'),
      unknownKidEvents: metric('unknown_kid'),
      replayAttempts: metric('replay_attempt'),
      nonceFailures: metric('nonce_failure'),
      providerOutages: metric('provider_outage'),
      logoutFailures: metric('logout_failure')
    };
  }

  getProviderCapabilities() {
    return this.identityProvider.getCapabilities?.() ?? {
      refresh: { supported: false, providerManaged: false },
      logout: { supported: true, federatedSupported: false }
    };
  }

  getProviderSession(customerId) {
    return this.providerSessions.get(String(customerId ?? '')) ?? null;
  }

  persistProviderSession(customerId, value) {
    const key = String(customerId ?? '').trim();
    if (!key) return;
    this.providerSessions.set(key, value);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.provider-sessions`, key, value });
  }

  resolveOrCreateCustomer({ email, companyName = null, contactName = null } = {}) {
    const normalized = normalizeEmail(email);
    const registry = this.missionControl?.customerRegistry;
    const existing = registry?.listCustomers?.().find((customer) => normalizeEmail(customer.email) === normalized) ?? null;

    if (existing) {
      return {
        customer: existing,
        created: false
      };
    }

    const created = registry?.createCustomer?.({
      companyName: companyName ?? `Customer ${normalized}`,
      contactName: contactName ?? normalized,
      email: normalized,
      phone: 'UNSPECIFIED',
      website: `https://${normalized.replace(/@.*/, '').replace(/[^a-z0-9-]/g, '') || 'customer'}.example`,
      industry: 'UNSPECIFIED',
      status: CustomerStatuses.PENDING_VERIFICATION
    });

    return {
      customer: created?.customer ?? null,
      created: true
    };
  }

  rejectBlockedProvider() {
    const providerType = String(this.providerSelection.type ?? 'unknown').toUpperCase();
    const rollout = this.providerSelection.rollout ?? {};
    const reason = providerType === 'OIDC'
      ? (rollout.emergencyDisabled
          ? 'OIDC authentication is disabled by emergency kill switch.'
          : (rollout.enabled === false
              ? 'OIDC authentication rollout stage is disabled.'
              : 'OIDC authentication is blocked due to provider configuration readiness.'))
      : 'Development authentication is blocked in this environment without emergency override.';

    return {
      accepted: false,
      status: 503,
      code: 'PROVIDER_NOT_CONFIGURED',
      reason,
      data: {
        providerStatus: this.providerSelection.status ?? IdentityProviderStatuses.DEVELOPMENT_ONLY,
        warnings: this.providerWarnings()
      }
    };
  }

  register({ email, password, companyName = null, contactName = null } = {}) {
    if (this.providerBlocked()) return this.rejectBlockedProvider();

    const normalizedEmail = normalizeEmail(email);

    const result = this.identityProvider.register({
      email: normalizedEmail,
      password,
      metadata: {
        requestedAt: nowIso(this.now)
      }
    });

    if (!result.ok) {
      if (result.error?.code === IdentityErrorCodes.DUPLICATE_ACCOUNT) {
        const providerLookup = this.identityProvider.lookupUser?.({ email: normalizedEmail });
        const providerUser = providerLookup?.ok ? providerLookup.data : null;
        if (providerUser?.providerUserId) {
          const customerResolution = this.resolveOrCreateCustomer({ email: normalizedEmail, companyName, contactName });
          if (!customerResolution.customer) {
            return {
              accepted: false,
              status: 500,
              code: 'INTERNAL_ERROR',
              reason: 'Unable to resolve customer account for existing identity.',
              data: null
            };
          }

          const existingLink = this.getIdentityLinkByProviderUserId(providerUser.providerUserId)
            ?? this.getIdentityLinkByEmail(normalizedEmail);
          const link = this.buildIdentityLink({
            providerUserId: providerUser.providerUserId,
            normalizedEmail,
            emailVerified: Boolean(providerUser.emailVerified),
            customerId: customerResolution.customer.customerId,
            existingLink
          });
          this.persistIdentityLink(link);

          this.incrementMetric('registrationsIdempotent', 1);
          return {
            accepted: true,
            status: 200,
            code: 'OK',
            reason: null,
            data: {
              customerId: customerResolution.customer.customerId,
              email: normalizedEmail,
              verificationRequired: !link.emailVerified,
              alreadyRegistered: true,
              providerStatus: result.providerStatus,
              warnings: this.providerWarnings()
            }
          };
        }
      }

      this.incrementMetric('registrationFailures', 1);
      return {
        accepted: false,
        status: result.error?.code === IdentityErrorCodes.DUPLICATE_ACCOUNT ? 409 : 400,
        code: result.error?.code ?? 'INVALID_REQUEST',
        reason: result.error?.message ?? 'Registration failed.',
        data: {
          providerStatus: result.providerStatus
        }
      };
    }

    const customerResolution = this.resolveOrCreateCustomer({ email: normalizedEmail, companyName, contactName });
    if (!customerResolution.customer) {
      this.incrementMetric('registrationFailures', 1);
      return {
        accepted: false,
        status: 500,
        code: 'INTERNAL_ERROR',
        reason: 'Unable to resolve customer account.',
        data: null
      };
    }

    const existingLink = this.getIdentityLinkByProviderUserId(result.data.providerUserId)
      ?? this.getIdentityLinkByEmail(normalizedEmail);
    const link = this.buildIdentityLink({
      providerUserId: result.data.providerUserId,
      normalizedEmail,
      emailVerified: Boolean(result.data.emailVerified),
      customerId: customerResolution.customer.customerId,
      existingLink
    });
    this.persistIdentityLink(link);
    this.identityProvider.linkIdentity?.({ providerUserId: link.providerUserId, linkedCustomerId: link.customerId });

    const targetStatus = link.emailVerified ? CustomerStatuses.ACTIVE : CustomerStatuses.PENDING_VERIFICATION;
    this.missionControl?.customerRegistry?.updateCustomer?.(customerResolution.customer.customerId, {
      status: targetStatus
    });
    this.incrementMetric('registrationsSuccessful', 1);

    const registrationSession = link.emailVerified
      ? this.sessionManager.createSession({
          customerId: customerResolution.customer.customerId,
          role: 'CUSTOMER',
          accountStatus: targetStatus,
          metadata: {}
        })
      : null;

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        customerId: customerResolution.customer.customerId,
        email: link.normalizedEmail,
        verificationRequired: !link.emailVerified,
        ...(registrationSession
          ? {
              sessionToken: registrationSession.sessionToken,
              csrfToken: registrationSession.csrfToken,
              sessionId: registrationSession.session.sessionId,
              expiresAt: registrationSession.session.expiresAt,
              idleExpiresAt: registrationSession.session.idleExpiresAt,
              absoluteExpiresAt: registrationSession.session.absoluteExpiresAt,
              developmentAuthentication: this.providerSelection.type === 'local'
            }
          : {}),
        providerStatus: result.providerStatus,
        warnings: this.providerWarnings()
      }
    };
  }

  login({ email, password } = {}) {
    if (this.providerBlocked()) return this.rejectBlockedProvider();

    const normalizedEmail = normalizeEmail(email);
    this.recordProviderTelemetry('login_attempt');

    const loginResult = this.identityProvider.login({ email: normalizedEmail, password });
    if (!loginResult.ok) {
      this.incrementLoginFailure(normalizedEmail);
      this.incrementMetric('loginFailed', 1);
      this.recordProviderTelemetry('login_failure');
      const code = loginResult.error?.code;

      if (code === IdentityErrorCodes.EMAIL_NOT_VERIFIED) {
        return {
          accepted: false,
          status: 403,
          code: 'EMAIL_NOT_VERIFIED',
          reason: 'Email verification is required before sign-in.',
          data: { providerStatus: loginResult.providerStatus }
        };
      }

      return genericAuthFailure();
    }

    this.clearLoginFailure(normalizedEmail);

    const link = this.getIdentityLinkByProviderUserId(loginResult.data.providerUserId)
      ?? this.getIdentityLinkByEmail(loginResult.data.email);

    const customer = link
      ? this.missionControl?.customerRegistry?.getCustomerById?.(link.customerId)
      : this.resolveOrCreateCustomer({ email: loginResult.data.email }).customer;

    if (!customer) {
      this.incrementMetric('loginFailed', 1);
      return {
        accepted: false,
        status: 404,
        code: 'NOT_FOUND',
        reason: 'Customer account not found.',
        data: null
      };
    }

    const lifecycle = lifecycleDecision(customer.status);
    if (!lifecycle.allowed) {
      if (lifecycle.code === 'ACCOUNT_SUSPENDED') this.incrementMetric('deniedSuspended', 1);
      if (lifecycle.code === 'ACCOUNT_DISABLED') this.incrementMetric('deniedDisabled', 1);
      if (lifecycle.code === 'ACCOUNT_ARCHIVED') this.incrementMetric('deniedArchived', 1);
      return {
        accepted: false,
        status: 403,
        code: lifecycle.code,
        reason: lifecycle.reason,
        data: null
      };
    }

    const session = this.sessionManager.createSession({
      customerId: customer.customerId,
      role: 'CUSTOMER',
      accountStatus: customer.status,
      metadata: {}
    });
    this.incrementMetric('loginSuccessful', 1);
    this.recordProviderTelemetry('login_success');

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        customerId: customer.customerId,
        accountStatus: customer.status,
        sessionToken: session.sessionToken,
        csrfToken: session.csrfToken,
        sessionId: session.session.sessionId,
        expiresAt: session.session.expiresAt,
        idleExpiresAt: session.session.idleExpiresAt,
        absoluteExpiresAt: session.session.absoluteExpiresAt,
        providerStatus: loginResult.providerStatus,
        developmentAuthentication: this.providerSelection.type === 'local'
      }
    };
  }

  async startOidcAuthorization({
    redirectUri,
    scope = 'openid profile email',
    prompt = null,
    loginHint = null,
    expiresInMs = null,
    provider = 'oidc',
    portalRedirectUri = null,
    state = null,
    nonce = null
  } = {}) {
    if (this.providerBlocked()) return this.rejectBlockedProvider();

    const requestedProvider = String(provider ?? 'oidc').trim().toLowerCase();
    if (requestedProvider !== String(this.providerSelection.type ?? '').trim().toLowerCase()) {
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: 'PROVIDER_MISMATCH'
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 409,
        code: 'PROVIDER_MISMATCH',
        reason: 'Requested provider does not match configured authentication provider.',
        data: null
      };
    }

    if (requestedProvider !== 'oidc') {
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: 'INVALID_REQUEST'
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: 'Authorization-start flow is only available for OIDC provider.',
        data: null
      };
    }

    const redirect = String(redirectUri ?? '').trim();
    if (!redirect) {
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: 'redirectUri is required.',
        data: null
      };
    }

    const resolvedState = String(state ?? this.generateOidcState()).trim();
    const resolvedNonce = String(nonce ?? this.generateOidcNonce()).trim();
    const pkceVerifier = this.generatePkceVerifier();
    const pkceChallenge = this.createPkceChallenge(pkceVerifier);

    const transaction = this.oidcTransactionStore.createTransaction({
      state: resolvedState,
      nonce: resolvedNonce,
      pkceVerifier,
      providerType: requestedProvider,
      redirectUri: redirect,
      portalRedirectUri,
      transactionId: `oidc_txn_${randomUUID()}`,
      createdAt: new Date(nowMs(this.now)).toISOString(),
      ttlMs: expiresInMs
    });

    if (!transaction.ok) {
      this.recordAuditEvent('auth_start', {
        providerType: requestedProvider,
        outcome: 'FAILED',
        code: transaction.code
      });
      return {
        accepted: false,
        status: transaction.code === 'CONFLICT' ? 409 : 400,
        code: transaction.code,
        reason: transaction.reason,
        data: null
      };
    }

    const providerResult = await this.identityProvider.startAuthorization?.({
      state: resolvedState,
      nonce: resolvedNonce,
      redirectUri: redirect,
      pkceChallenge,
      pkceMethod: 'S256',
      scope,
      prompt,
      loginHint
    });

    if (!providerResult || !providerResult.ok) {
      this.oidcTransactionStore.cancelTransaction({ state: resolvedState });
      this.recordAuditEvent('auth_start', {
        providerType: requestedProvider,
        outcome: 'FAILED',
        code: providerResult?.error?.code ?? 'PROVIDER_UNAVAILABLE'
      });
      this.recordProviderTelemetry('provider_outage');
      return {
        accepted: false,
        status: 503,
        code: providerResult?.error?.code ?? 'PROVIDER_UNAVAILABLE',
        reason: providerResult?.error?.message ?? 'Unable to initialize OIDC authorization.',
        data: {
          providerStatus: providerResult?.providerStatus ?? this.identityProvider.getStatus?.() ?? null
        }
      };
    }

    this.recordAuditEvent('auth_start', {
      providerType: requestedProvider,
      outcome: 'STARTED',
      stateHash: stableHash(resolvedState),
      nonceHash: stableHash(resolvedNonce),
      transactionId: transaction.data.transactionId
    });

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        provider: requestedProvider,
        transactionId: transaction.data.transactionId,
        state: transaction.data.state,
        nonce: transaction.data.nonce,
        redirectUri: transaction.data.redirectUri,
        portalRedirectUri: transaction.data.portalRedirectUri,
        expiresAt: transaction.data.expiresAt,
        authorizationUrl: providerResult.data.authorizationUrl,
        authorizationEndpoint: providerResult.data.authorizationEndpoint,
        codeChallengeMethod: providerResult.data.pkceMethod ?? 'S256'
      }
    };
  }

  resolveCustomerByNormalizedEmail(normalizedEmail) {
    return this.missionControl?.customerRegistry?.listCustomers?.()
      ?.find((customer) => normalizeEmail(customer.email) === normalizedEmail) ?? null;
  }

  async completeOidcAuthorizationCallback({ state, code, redirectUri, provider = 'oidc' } = {}) {
    if (this.providerBlocked()) return this.rejectBlockedProvider();

    const requestedProvider = String(provider ?? 'oidc').trim().toLowerCase();
    if (requestedProvider !== String(this.providerSelection.type ?? '').trim().toLowerCase()) {
      return {
        accepted: false,
        status: 409,
        code: 'PROVIDER_MISMATCH',
        reason: 'Requested provider does not match configured authentication provider.',
        data: null
      };
    }

    if (requestedProvider !== 'oidc') {
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: 'OIDC callback completion is only available for OIDC provider.',
        data: null
      };
    }

    const normalizedState = String(state ?? '').trim();
    const normalizedCode = String(code ?? '').trim();
    const normalizedRedirect = String(redirectUri ?? '').trim();
    if (!normalizedState || !normalizedCode) {
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        reason: 'CALLBACK_INPUT_INVALID'
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: 'state and code are required for OIDC callback completion.',
        data: null
      };
    }

    this.recordAuditEvent('callback_received', {
      providerType: requestedProvider,
      stateHash: stableHash(normalizedState),
      codeHash: stableHash(normalizedCode)
    });
    this.recordProviderTelemetry('login_attempt');

    const reserved = this.oidcTransactionStore.reserveTransaction({
      state: normalizedState,
      providerType: requestedProvider,
      redirectUri: normalizedRedirect || null,
      reservationOwner: 'callback-completion'
    });

    const statusByCode = {
      INVALID_REQUEST: 400,
      NOT_FOUND: 404,
      TOKEN_EXPIRED: 409,
      TOKEN_INVALID: 401,
      INVALID_STATE: 409,
      PROVIDER_MISMATCH: 409,
      PERSISTENCE_FAILURE: 500
    };

    if (!reserved.ok) {
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: reserved.code
      });
      this.recordProviderTelemetry('callback_failure');
      if (reserved.code === 'INVALID_STATE') {
        this.recordAuditEvent('replay_detected', {
          providerType: requestedProvider,
          stateHash: stableHash(normalizedState)
        });
        this.recordProviderTelemetry('replay_attempt');
      }
      return {
        accepted: false,
        status: statusByCode[reserved.code] ?? 400,
        code: reserved.code,
        reason: reserved.reason,
        data: null
      };
    }

    const releaseReservation = () => this.oidcTransactionStore.releaseReservation({
      state: normalizedState,
      reservationId: reserved.data.reservationId
    });
    const commitReservation = (reason) => this.oidcTransactionStore.commitConsumption({
      state: normalizedState,
      reservationId: reserved.data.reservationId,
      consumedReason: reason
    });

    const providerResult = await this.identityProvider.exchangeAuthorizationCode?.({
      code: normalizedCode,
      redirectUri: reserved.data.redirectUri,
      pkceVerifier: reserved.data.pkceVerifier,
      expectedNonce: reserved.data.nonce,
      expectedState: reserved.data.state,
      receivedState: normalizedState
    });

    if (!providerResult || !providerResult.ok) {
      const providerCode = providerResult?.error?.code ?? 'PROVIDER_UNAVAILABLE';
      const retryable = providerCode === IdentityErrorCodes.PROVIDER_UNAVAILABLE;
      const settle = retryable ? releaseReservation() : commitReservation('CALLBACK_FAILED');
      if (!settle?.ok) {
        this.recordAuditEvent('callback_validation_failed', {
          providerType: requestedProvider,
          code: 'PERSISTENCE_FAILURE'
        });
        return {
          accepted: false,
          status: 500,
          code: 'PERSISTENCE_FAILURE',
          reason: 'Failed to persist callback transaction state.',
          data: null
        };
      }

      this.recordAuditEvent('token_exchange_failed', {
        providerType: requestedProvider,
        code: providerCode
      });
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: providerCode
      });
      this.recordProviderTelemetry('callback_failure');
      if (providerCode === IdentityErrorCodes.PROVIDER_UNAVAILABLE || providerCode === IdentityErrorCodes.PROVIDER_TIMEOUT) {
        this.recordAuditEvent('provider_outage_detected', {
          providerType: requestedProvider,
          code: providerCode
        });
        this.recordProviderTelemetry('provider_outage');
      }

      const validationReason = String(providerResult?.error?.details?.reason ?? '').trim().toUpperCase();
      if (validationReason === 'NONCE_MISMATCH' || validationReason === 'NONCE_MISSING') {
        this.recordAuditEvent('nonce_mismatch_detected', {
          providerType: requestedProvider,
          stateHash: stableHash(normalizedState)
        });
        this.recordProviderTelemetry('nonce_failure');
      }
      if (validationReason === 'STATE_MISMATCH' || validationReason === 'STATE_MISSING') {
        this.recordAuditEvent('replay_detected', {
          providerType: requestedProvider,
          stateHash: stableHash(normalizedState)
        });
        this.recordProviderTelemetry('replay_attempt');
      }

      return {
        accepted: false,
        status: providerCode === IdentityErrorCodes.PROVIDER_UNAVAILABLE ? 503 : 401,
        code: providerCode,
        reason: providerResult?.error?.message ?? 'OIDC callback processing failed.',
        data: {
          providerStatus: providerResult?.providerStatus ?? this.identityProvider.getStatus?.() ?? null,
          portalRedirectUri: reserved.data.portalRedirectUri
        }
      };
    }

    const claims = providerResult.data?.claims ?? {};
    this.recordAuditEvent('token_verified', {
      providerType: requestedProvider,
      providerUserIdHash: stableHash(providerResult.data?.providerUserId ?? claims.sub ?? '')
    });
    const providerUserId = String(providerResult.data?.providerUserId ?? claims.sub ?? '').trim();
    const normalizedEmail = normalizeEmail(providerResult.data?.email ?? claims.email ?? '');
    const emailVerified = Boolean(providerResult.data?.emailVerified ?? claims.email_verified ?? false);

    if (!providerUserId || !normalizedEmail) {
      const settled = commitReservation('CALLBACK_FAILED');
      if (!settled.ok) {
        return {
          accepted: false,
          status: 500,
          code: 'PERSISTENCE_FAILURE',
          reason: 'Failed to persist callback transaction state.',
          data: null
        };
      }
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: 'TOKEN_INVALID'
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 401,
        code: 'TOKEN_INVALID',
        reason: 'OIDC claims are missing required subject or email attributes.',
        data: {
          portalRedirectUri: reserved.data.portalRedirectUri
        }
      };
    }

    const existingByProvider = this.getIdentityLinkByProviderUserId(providerUserId);
    const existingByEmail = this.getIdentityLinkByEmail(normalizedEmail);

    if (existingByEmail && existingByProvider && existingByEmail.linkId !== existingByProvider.linkId) {
      const settled = commitReservation('CALLBACK_FAILED');
      if (!settled.ok) {
        return {
          accepted: false,
          status: 500,
          code: 'PERSISTENCE_FAILURE',
          reason: 'Failed to persist callback transaction state.',
          data: null
        };
      }
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: 'PROVIDER_MISMATCH'
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 409,
        code: 'PROVIDER_MISMATCH',
        reason: 'OIDC identity conflicts with existing Atlas identity link.',
        data: {
          portalRedirectUri: reserved.data.portalRedirectUri
        }
      };
    }

    const existingLink = existingByProvider ?? existingByEmail ?? null;
    const linkedCustomer = existingLink
      ? this.missionControl?.customerRegistry?.getCustomerById?.(existingLink.customerId) ?? null
      : null;
    const resolvedCustomer = linkedCustomer
      ?? this.resolveOrCreateCustomer({ email: normalizedEmail }).customer
      ?? this.resolveCustomerByNormalizedEmail(normalizedEmail);

    if (!resolvedCustomer) {
      const settled = commitReservation('CALLBACK_FAILED');
      if (!settled.ok) {
        return {
          accepted: false,
          status: 500,
          code: 'PERSISTENCE_FAILURE',
          reason: 'Failed to persist callback transaction state.',
          data: null
        };
      }
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: 'NOT_FOUND'
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 404,
        code: 'NOT_FOUND',
        reason: 'Customer account could not be resolved from OIDC claims.',
        data: {
          portalRedirectUri: reserved.data.portalRedirectUri
        }
      };
    }

    try {
      const link = this.buildIdentityLink({
        providerUserId,
        normalizedEmail,
        emailVerified,
        customerId: existingLink?.customerId ?? resolvedCustomer.customerId,
        existingLink
      });
      this.persistIdentityLink(link);
      this.identityProvider.linkIdentity?.({ providerUserId: link.providerUserId, linkedCustomerId: link.customerId });
    } catch {
      const settled = releaseReservation();
      if (!settled.ok) {
        return {
          accepted: false,
          status: 500,
          code: 'PERSISTENCE_FAILURE',
          reason: 'Failed to persist identity mapping after callback.',
          data: null
        };
      }
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: 'PERSISTENCE_FAILURE'
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 500,
        code: 'PERSISTENCE_FAILURE',
        reason: 'Failed to persist identity mapping after callback.',
        data: {
          portalRedirectUri: reserved.data.portalRedirectUri
        }
      };
    }

    let effectiveCustomer = resolvedCustomer;
    const currentStatus = String(resolvedCustomer.status ?? '').toUpperCase();
    if (emailVerified && PendingLifecycleStatuses.has(currentStatus)) {
      this.missionControl?.customerRegistry?.updateCustomer?.(resolvedCustomer.customerId, {
        status: CustomerStatuses.ACTIVE
      });
      effectiveCustomer = this.missionControl?.customerRegistry?.getCustomerById?.(resolvedCustomer.customerId) ?? {
        ...resolvedCustomer,
        status: CustomerStatuses.ACTIVE
      };
    }

    const lifecycle = lifecycleDecision(effectiveCustomer.status);
    if (!lifecycle.allowed) {
      const settled = commitReservation('CALLBACK_COMPLETED');
      if (!settled.ok) {
        return {
          accepted: false,
          status: 500,
          code: 'PERSISTENCE_FAILURE',
          reason: 'Failed to persist callback transaction state.',
          data: null
        };
      }
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: lifecycle.code
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 403,
        code: lifecycle.code,
        reason: lifecycle.reason,
        data: {
          portalRedirectUri: reserved.data.portalRedirectUri
        }
      };
    }

    let session;
    try {
      session = this.sessionManager.createSession({
        customerId: effectiveCustomer.customerId,
        role: 'CUSTOMER',
        accountStatus: effectiveCustomer.status,
        metadata: {}
      });
    } catch {
      const settled = releaseReservation();
      if (!settled.ok) {
        return {
          accepted: false,
          status: 500,
          code: 'PERSISTENCE_FAILURE',
          reason: 'Failed to persist callback transaction state.',
          data: null
        };
      }
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: 'SESSION_CREATION_FAILED'
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 500,
        code: 'SESSION_CREATION_FAILED',
        reason: 'Failed to create customer session after OIDC callback.',
        data: {
          portalRedirectUri: reserved.data.portalRedirectUri
        }
      };
    }

    const consumed = commitReservation('CALLBACK_COMPLETED');
    if (!consumed.ok) {
      this.sessionManager.revokeSession({ sessionId: session.session.sessionId, reason: 'CALLBACK_TRANSACTION_COMMIT_FAILED' });
      this.recordAuditEvent('callback_validation_failed', {
        providerType: requestedProvider,
        code: 'PERSISTENCE_FAILURE'
      });
      this.recordProviderTelemetry('callback_failure');
      return {
        accepted: false,
        status: 500,
        code: 'PERSISTENCE_FAILURE',
        reason: 'Failed to persist callback transaction state.',
        data: null
      };
    }

    this.incrementMetric('loginSuccessful', 1);
    this.recordProviderTelemetry('login_success');
    this.recordAuditEvent('atlas_session_issued', {
      providerType: requestedProvider,
      customerId: effectiveCustomer.customerId,
      sessionId: session.session.sessionId
    });
    this.persistProviderSession(effectiveCustomer.customerId, {
      providerType: this.providerSelection.type,
      providerUserId,
      refreshToken: providerResult.data?.refreshToken ?? null,
      latestIdToken: providerResult.data?.idToken ?? null,
      updatedAt: nowIso(this.now)
    });
    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        customerId: effectiveCustomer.customerId,
        accountStatus: effectiveCustomer.status,
        sessionToken: session.sessionToken,
        csrfToken: session.csrfToken,
        sessionId: session.session.sessionId,
        expiresAt: session.session.expiresAt,
        idleExpiresAt: session.session.idleExpiresAt,
        absoluteExpiresAt: session.session.absoluteExpiresAt,
        providerStatus: providerResult.providerStatus,
        portalRedirectUri: reserved.data.portalRedirectUri
      }
    };
  }

  consumeOidcAuthorizationTransaction({ state, provider = 'oidc', redirectUri = null } = {}) {
    const consumed = this.oidcTransactionStore.consumeTransaction({
      state,
      providerType: provider,
      redirectUri
    });

    if (!consumed.ok) {
      if (consumed.code === 'INVALID_STATE') {
        this.recordAuditEvent('replay_detected', {
          providerType: provider,
          stateHash: stableHash(state)
        });
        this.recordProviderTelemetry('replay_attempt', provider);
      }
      const statusByCode = {
        INVALID_REQUEST: 400,
        NOT_FOUND: 404,
        INVALID_STATE: 409,
        TOKEN_EXPIRED: 409,
        PROVIDER_MISMATCH: 409,
        PERSISTENCE_FAILURE: 500
      };
      return {
        accepted: false,
        status: statusByCode[consumed.code] ?? 400,
        code: consumed.code,
        reason: consumed.reason,
        data: null
      };
    }

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: consumed.data
    };
  }

  authenticateSession({ sessionToken, customerId = null } = {}) {
    const validation = this.sessionManager.validateSessionToken(sessionToken, { customerId });
    if (!validation.valid || !validation.session) {
      return {
        accepted: false,
        status: 401,
        code: 'UNAUTHORIZED',
        reason: 'Session is invalid or expired.',
        data: null
      };
    }

    const customer = this.missionControl?.customerRegistry?.getCustomerById?.(validation.session.customerId) ?? null;
    if (!customer) {
      return {
        accepted: false,
        status: 404,
        code: 'NOT_FOUND',
        reason: 'Customer not found for session.',
        data: null
      };
    }

    const lifecycle = lifecycleDecision(customer.status);
    if (!lifecycle.allowed && lifecycle.code !== 'EMAIL_NOT_VERIFIED') {
      this.sessionManager.revokeSession({ sessionId: validation.session.sessionId, reason: 'ACCOUNT_STATUS_RESTRICTED' });
      return {
        accepted: false,
        status: 403,
        code: lifecycle.code,
        reason: 'Account is not authorized for active sessions.',
        data: null
      };
    }

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        customer,
        session: validation.session
      }
    };
  }

  async logout({ sessionToken } = {}) {
    const validation = this.sessionManager.validateSessionToken(sessionToken, { rotateIdle: false });
    if (!validation.valid || !validation.session) {
      return {
        accepted: true,
        status: 200,
        code: 'OK',
        reason: null,
        data: { loggedOut: true }
      };
    }

    this.recordAuditEvent('logout_started', {
      customerId: validation.session.customerId,
      sessionId: validation.session.sessionId,
      providerType: this.providerSelection.type
    });

    const providerSession = this.getProviderSession(validation.session.customerId);
    const capabilities = this.getProviderCapabilities();

    this.sessionManager.revokeSession({ sessionId: validation.session.sessionId, reason: 'LOGOUT' });
    this.incrementMetric('logoutSuccessful', 1);

    if (!capabilities.logout?.federatedSupported) {
      this.recordAuditEvent('logout_completed', {
        customerId: validation.session.customerId,
        sessionId: validation.session.sessionId,
        federated: false
      });
      return {
        accepted: true,
        status: 200,
        code: 'OK',
        reason: null,
        data: { loggedOut: true, federatedLogout: 'NOT_SUPPORTED' }
      };
    }

    const federated = await this.identityProvider.federatedLogout?.({
      idTokenHint: providerSession?.latestIdToken ?? null,
      postLogoutRedirectUri: null
    });

    if (!federated || !federated.ok) {
      this.recordProviderTelemetry('logout_failure');
      if (federated?.error?.code === IdentityErrorCodes.PROVIDER_UNAVAILABLE || federated?.error?.code === IdentityErrorCodes.PROVIDER_TIMEOUT) {
        this.recordAuditEvent('provider_outage_detected', {
          customerId: validation.session.customerId,
          sessionId: validation.session.sessionId,
          code: federated?.error?.code
        });
        this.recordProviderTelemetry('provider_outage');
      }
      this.recordAuditEvent('federated_logout_failed', {
        customerId: validation.session.customerId,
        sessionId: validation.session.sessionId,
        code: federated?.error?.code ?? IdentityErrorCodes.PROVIDER_UNAVAILABLE
      });
      this.recordAuditEvent('logout_completed', {
        customerId: validation.session.customerId,
        sessionId: validation.session.sessionId,
        federated: false
      });
      return {
        accepted: true,
        status: 200,
        code: 'OK',
        reason: null,
        data: { loggedOut: true, federatedLogout: 'FAILED' }
      };
    }

    this.recordAuditEvent('federated_logout_completed', {
      customerId: validation.session.customerId,
      sessionId: validation.session.sessionId
    });
    this.recordAuditEvent('logout_completed', {
      customerId: validation.session.customerId,
      sessionId: validation.session.sessionId,
      federated: true
    });
    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: { loggedOut: true, federatedLogout: 'COMPLETED' }
    };
  }

  async refreshSession({ sessionToken } = {}) {
    const validation = this.sessionManager.validateSessionToken(sessionToken, { rotateIdle: false });
    if (!validation.valid || !validation.session) {
      this.incrementMetric('sessionRefreshFailed', 1);
      return {
        accepted: false,
        status: 401,
        code: 'UNAUTHORIZED',
        reason: 'Session refresh rejected.',
        data: null
      };
    }

    const capabilities = this.getProviderCapabilities();
    if (!capabilities.refresh?.supported) {
      this.incrementMetric('sessionRefreshFailed', 1);
      return {
        accepted: false,
        status: 400,
        code: 'UNSUPPORTED_CAPABILITY',
        reason: 'Provider does not support refresh lifecycle.',
        data: null
      };
    }

    if (capabilities.refresh?.providerManaged === false) {
      const refreshedLocal = this.sessionManager.refreshSessionToken(sessionToken);
      if (!refreshedLocal.refreshed) {
        this.incrementMetric('sessionRefreshFailed', 1);
        return {
          accepted: false,
          status: 401,
          code: 'UNAUTHORIZED',
          reason: 'Session refresh rejected.',
          data: null
        };
      }

      this.recordAuditEvent('refresh_attempted', {
        customerId: validation.session.customerId,
        sessionId: validation.session.sessionId,
        providerType: this.providerSelection.type
      });
      this.recordAuditEvent('refresh_succeeded', {
        customerId: validation.session.customerId,
        sessionId: validation.session.sessionId,
        rotatedRefreshToken: false
      });
      this.incrementMetric('sessionRefreshSuccessful', 1);

      return {
        accepted: true,
        status: 200,
        code: 'OK',
        reason: null,
        data: {
          sessionToken: refreshedLocal.sessionToken,
          csrfToken: refreshedLocal.csrfToken,
          sessionId: refreshedLocal.session.sessionId,
          expiresAt: refreshedLocal.session.expiresAt,
          idleExpiresAt: refreshedLocal.session.idleExpiresAt,
          absoluteExpiresAt: refreshedLocal.session.absoluteExpiresAt,
          rotationCounter: refreshedLocal.session.rotationCounter
        }
      };
    }

    const providerState = this.getProviderSession(validation.session.customerId);
    if (!providerState?.refreshToken) {
      this.incrementMetric('sessionRefreshFailed', 1);
      return {
        accepted: false,
        status: 401,
        code: 'UNAUTHORIZED',
        reason: 'Provider refresh token is unavailable for this session.',
        data: null
      };
    }

    this.recordAuditEvent('refresh_attempted', {
      customerId: validation.session.customerId,
      sessionId: validation.session.sessionId,
      providerType: this.providerSelection.type
    });

    const refreshedProvider = await this.identityProvider.refreshProviderSession?.({
      refreshToken: providerState.refreshToken,
      expectedSubject: providerState.providerUserId ?? null
    });

    if (!refreshedProvider || !refreshedProvider.ok) {
      const code = refreshedProvider?.error?.code ?? 'PROVIDER_UNAVAILABLE';
      this.recordAuditEvent('refresh_failed', {
        customerId: validation.session.customerId,
        sessionId: validation.session.sessionId,
        providerType: this.providerSelection.type,
        code
      });
      this.recordProviderTelemetry('refresh_failure');
      if (code === IdentityErrorCodes.PROVIDER_UNAVAILABLE || code === IdentityErrorCodes.PROVIDER_TIMEOUT) {
        this.recordAuditEvent('provider_outage_detected', {
          customerId: validation.session.customerId,
          sessionId: validation.session.sessionId,
          providerType: this.providerSelection.type,
          code
        });
        this.recordProviderTelemetry('provider_outage');
      }

      const revokeCodes = new Set([
        IdentityErrorCodes.TOKEN_EXPIRED,
        IdentityErrorCodes.ACCOUNT_REVOKED,
        IdentityErrorCodes.ACCOUNT_DISABLED,
        IdentityErrorCodes.TOKEN_INVALID
      ]);

      if (revokeCodes.has(code)) {
        this.sessionManager.revokeSession({
          sessionId: validation.session.sessionId,
          reason: 'PROVIDER_REVOCATION_DETECTED'
        });
        this.recordAuditEvent('provider_revocation_detected', {
          customerId: validation.session.customerId,
          sessionId: validation.session.sessionId,
          code
        });
      }

      this.incrementMetric('sessionRefreshFailed', 1);
      return {
        accepted: false,
        status: code === IdentityErrorCodes.PROVIDER_UNAVAILABLE ? 503 : 401,
        code,
        reason: refreshedProvider?.error?.message ?? 'Provider refresh failed.',
        data: null
      };
    }

    this.persistProviderSession(validation.session.customerId, {
      ...providerState,
      refreshToken: refreshedProvider.data.refreshToken,
      latestIdToken: refreshedProvider.data.idToken ?? providerState.latestIdToken ?? null,
      providerUserId: refreshedProvider.data.providerUserId ?? providerState.providerUserId ?? null,
      updatedAt: nowIso(this.now)
    });

    const refreshed = this.sessionManager.refreshSessionToken(sessionToken);
    if (!refreshed.refreshed) {
      this.recordAuditEvent('refresh_failed', {
        customerId: validation.session.customerId,
        sessionId: validation.session.sessionId,
        code: 'SESSION_REFRESH_FAILED'
      });
      this.recordProviderTelemetry('refresh_failure');
      this.incrementMetric('sessionRefreshFailed', 1);
      return {
        accepted: false,
        status: 401,
        code: 'UNAUTHORIZED',
        reason: 'Session refresh rejected.',
        data: null
      };
    }

    this.incrementMetric('sessionRefreshSuccessful', 1);
    this.recordAuditEvent('refresh_succeeded', {
      customerId: validation.session.customerId,
      sessionId: validation.session.sessionId,
      rotatedRefreshToken: Boolean(refreshedProvider.data.refreshTokenRotated)
    });

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        sessionToken: refreshed.sessionToken,
        csrfToken: refreshed.csrfToken,
        sessionId: refreshed.session.sessionId,
        expiresAt: refreshed.session.expiresAt,
        idleExpiresAt: refreshed.session.idleExpiresAt,
        absoluteExpiresAt: refreshed.session.absoluteExpiresAt,
        rotationCounter: refreshed.session.rotationCounter
      }
    };
  }

  requestPasswordReset({ email } = {}) {
    if (this.providerBlocked()) return this.rejectBlockedProvider();
    const response = this.identityProvider.requestPasswordReset({ email });
    this.incrementMetric('passwordResetRequested', 1);
    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        accepted: true,
        message: 'If an account exists, reset instructions have been issued.',
        developmentResetToken: this.exposeDevelopmentResetTokens ? (response.data?.developmentResetToken ?? null) : null
      }
    };
  }

  completePasswordReset({ token, newPassword } = {}) {
    if (this.providerBlocked()) return this.rejectBlockedProvider();
    const response = this.identityProvider.completePasswordReset({ token, newPassword });
    if (!response.ok) {
      this.incrementMetric('passwordResetFailed', 1);
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: response.error?.message ?? 'Password reset failed.',
        data: null
      };
    }

    const normalizedEmail = normalizeEmail(response.data?.email ?? response.data?.normalizedEmail ?? response.data?.accountEmail ?? '');
    const link = normalizedEmail ? this.getIdentityLinkByEmail(normalizedEmail) : null;
    const linkedCustomerId = link?.customerId
      ?? this.missionControl?.customerRegistry?.listCustomers?.().find((customer) => normalizeEmail(customer.email) === normalizedEmail)?.customerId
      ?? null;
    if (linkedCustomerId) {
      this.sessionManager.revokeAllSessions({ customerId: linkedCustomerId, reason: 'PASSWORD_RESET' });
    }
    this.incrementMetric('passwordResetCompleted', 1);

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: { completed: true }
    };
  }

  revokeAllSessions({ customerId } = {}) {
    const count = this.sessionManager.revokeAllSessions({ customerId, reason: 'REVOKE_ALL' });
    this.incrementMetric('revokeAllIssued', 1);
    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        customerId,
        revokedSessions: count
      }
    };
  }

  getCurrentSession({ sessionToken } = {}) {
    const auth = this.authenticateSession({ sessionToken });
    if (!auth.accepted) return auth;

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        customerId: auth.data.customer.customerId,
        accountStatus: auth.data.customer.status,
        sessionId: auth.data.session.sessionId,
        expiresAt: auth.data.session.expiresAt,
        idleExpiresAt: auth.data.session.idleExpiresAt,
        absoluteExpiresAt: auth.data.session.absoluteExpiresAt
      }
    };
  }

  getAuthHealth() {
    const providerHealth = this.identityProvider.healthReport?.() ?? this.identityProvider.getStatus?.() ?? {};
    const sessionStats = this.sessionManager.getSessionStats();
    const startupReadiness = this.startupReadiness ?? this.evaluateOperationalReadiness();
    const rollout = this.providerSelection.rollout ?? { stage: 'disabled', enabled: false, emergencyDisabled: false };

    const operationalHealth = {
      providerDiscoveryStatus: providerHealth.discovery?.status ?? 'UNKNOWN',
      jwksFreshness: providerHealth.jwks?.freshness ?? 'UNKNOWN',
      keyVersion: this.envelopeCrypto.activeKeyVersion,
      providerConnectivity: providerHealth.connectivity ?? IdentityProviderStatuses.NOT_CONNECTED,
      callbackReadiness: startupReadiness.checks.callbackConfiguration.ready,
      refreshReadiness: Boolean(this.getProviderCapabilities().refresh?.supported),
      logoutReadiness: Boolean(this.getProviderCapabilities().logout?.supported),
      startupReadiness: startupReadiness.ready,
      rolloutStage: rollout.stage,
      emergencyDisabled: Boolean(rollout.emergencyDisabled)
    };

    const suspendedCount = this.missionControl?.customerRegistry?.listCustomers?.().filter((customer) => String(customer.status ?? '').toUpperCase() === CustomerStatuses.SUSPENDED).length ?? 0;
    const disabledCount = this.missionControl?.customerRegistry?.listCustomers?.().filter((customer) => String(customer.status ?? '').toUpperCase() === CustomerStatuses.DISABLED).length ?? 0;
    const pendingVerificationCount = this.missionControl?.customerRegistry?.listCustomers?.().filter((customer) => String(customer.status ?? '').toUpperCase() === CustomerStatuses.PENDING_VERIFICATION).length ?? 0;
    const archivedCount = this.missionControl?.customerRegistry?.listCustomers?.().filter((customer) => String(customer.status ?? '').toUpperCase() === CustomerStatuses.BLOCKED).length ?? 0;

    return {
      providerType: this.providerSelection.type,
      providerBlocked: this.providerBlocked(),
      providerRollout: rollout,
      providerStatus: providerHealth,
      warnings: this.providerWarnings(),
      configurationReady: !this.providerBlocked() && providerHealth.readiness !== IdentityProviderStatuses.NOT_CONFIGURED,
      startupReadiness,
      operationalHealth,
      sessions: sessionStats,
      pendingVerificationCount,
      failedLoginCount: Array.from(this.loginFailures.values()).reduce((sum, value) => sum + Number(value ?? 0), 0),
      authCounters: {
        registrationsSuccessful: Number(this.authMetrics.get('registrationsSuccessful') ?? 0),
        registrationsIdempotent: Number(this.authMetrics.get('registrationsIdempotent') ?? 0),
        registrationFailures: Number(this.authMetrics.get('registrationFailures') ?? 0),
        loginSuccessful: Number(this.authMetrics.get('loginSuccessful') ?? 0),
        loginFailed: Number(this.authMetrics.get('loginFailed') ?? 0),
        passwordResetRequested: Number(this.authMetrics.get('passwordResetRequested') ?? 0),
        passwordResetCompleted: Number(this.authMetrics.get('passwordResetCompleted') ?? 0),
        passwordResetFailed: Number(this.authMetrics.get('passwordResetFailed') ?? 0),
        logoutSuccessful: Number(this.authMetrics.get('logoutSuccessful') ?? 0),
        sessionRefreshSuccessful: Number(this.authMetrics.get('sessionRefreshSuccessful') ?? 0),
        sessionRefreshFailed: Number(this.authMetrics.get('sessionRefreshFailed') ?? 0),
        revokeAllIssued: Number(this.authMetrics.get('revokeAllIssued') ?? 0),
        deniedSuspended: Number(this.authMetrics.get('deniedSuspended') ?? 0),
        deniedDisabled: Number(this.authMetrics.get('deniedDisabled') ?? 0),
        deniedArchived: Number(this.authMetrics.get('deniedArchived') ?? 0),
        rateLimitEvents: Number(this.authMetrics.get('rateLimitEvents') ?? 0),
        originAccepted: Number(this.authMetrics.get('originAccepted') ?? 0),
        originRejected: Number(this.authMetrics.get('originRejected') ?? 0),
        missingOriginRejected: Number(this.authMetrics.get('missingOriginRejected') ?? 0),
        csrfValidated: Number(this.authMetrics.get('csrfValidated') ?? 0),
        csrfMissing: Number(this.authMetrics.get('csrfMissing') ?? 0),
        csrfMismatch: Number(this.authMetrics.get('csrfMismatch') ?? 0),
        csrfMalformed: Number(this.authMetrics.get('csrfMalformed') ?? 0),
        protectedRequestDenied: Number(this.authMetrics.get('protectedRequestDenied') ?? 0)
      },
      securityTelemetry: this.buildSecurityTelemetrySnapshot(),
      suspendedCount,
      disabledCount,
      archivedCount,
      oidcTransactions: this.oidcTransactionStore.getStats(),
      generatedAt: nowIso(this.now)
    };
  }
}
