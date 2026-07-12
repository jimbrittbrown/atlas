import { createCustomerIdentityProvider } from './customer-identity-provider-factory.js';
import { CustomerSessionManager } from './customer-session-manager.js';
import { CustomerStatuses } from './customer-intake-mission-control-contracts.js';
import { normalizeEmail, IdentityErrorCodes, IdentityProviderStatuses } from './customer-identity-provider-contracts.js';
import { getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
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
    providerFactoryArgs = {},
    namespace = 'executive.customer-auth'
  } = {}) {
    this.missionControl = missionControl ?? null;
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.namespace = namespace;
    this.identityLinks = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.identity-links` });
    this.loginFailures = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.login-failures` });
    this.authMetrics = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.metrics` });
    this.exposeDevelopmentResetTokens = String(process.env.ATLAS_LOCAL_IDENTITY_EXPOSE_RESET_TOKEN ?? 'false').toLowerCase() === 'true';

    this.providerSelection = createCustomerIdentityProvider({
      storageProvider: this.storageProvider,
      now: this.now,
      logger: this.logger,
      ...providerFactoryArgs
    });

    this.identityProvider = this.providerSelection.provider;
    this.sessionManager = new CustomerSessionManager({
      storageProvider: this.storageProvider,
      now: this.now,
      logger: this.logger,
      namespace: `${namespace}.sessions`
    });
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
    const reason = providerType === 'OIDC'
      ? 'OIDC authentication adapter is selected but not enabled for production use in this build.'
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

    const loginResult = this.identityProvider.login({ email: normalizedEmail, password });
    if (!loginResult.ok) {
      this.incrementLoginFailure(normalizedEmail);
      this.incrementMetric('loginFailed', 1);
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

  logout({ sessionToken } = {}) {
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

    this.sessionManager.revokeSession({ sessionId: validation.session.sessionId, reason: 'LOGOUT' });
    this.incrementMetric('logoutSuccessful', 1);
    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: { loggedOut: true }
    };
  }

  refreshSession({ sessionToken } = {}) {
    const refreshed = this.sessionManager.refreshSessionToken(sessionToken);
    if (!refreshed.refreshed) {
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

    const suspendedCount = this.missionControl?.customerRegistry?.listCustomers?.().filter((customer) => String(customer.status ?? '').toUpperCase() === CustomerStatuses.SUSPENDED).length ?? 0;
    const disabledCount = this.missionControl?.customerRegistry?.listCustomers?.().filter((customer) => String(customer.status ?? '').toUpperCase() === CustomerStatuses.DISABLED).length ?? 0;
    const pendingVerificationCount = this.missionControl?.customerRegistry?.listCustomers?.().filter((customer) => String(customer.status ?? '').toUpperCase() === CustomerStatuses.PENDING_VERIFICATION).length ?? 0;
    const archivedCount = this.missionControl?.customerRegistry?.listCustomers?.().filter((customer) => String(customer.status ?? '').toUpperCase() === CustomerStatuses.BLOCKED).length ?? 0;

    return {
      providerType: this.providerSelection.type,
      providerBlocked: this.providerBlocked(),
      providerStatus: providerHealth,
      warnings: this.providerWarnings(),
      configurationReady: !this.providerBlocked() && providerHealth.readiness !== IdentityProviderStatuses.NOT_CONFIGURED,
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
      suspendedCount,
      disabledCount,
      archivedCount,
      generatedAt: nowIso(this.now)
    };
  }
}
