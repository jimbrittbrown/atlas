import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  createIdentityError,
  createIdentityResult,
  createProviderUserRecord,
  IdentityErrorCodes,
  IdentityProviderStatuses,
  normalizeEmail
} from './customer-identity-provider-contracts.js';
import { getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function hashPassword(password, salt) {
  return scryptSync(String(password ?? ''), salt, 64).toString('hex');
}

function issueToken(prefix) {
  return `${prefix}_${randomUUID()}_${randomBytes(16).toString('hex')}`;
}

function hashResetToken(token, pepper) {
  return createHash('sha256').update(`${String(token ?? '')}:${pepper}`, 'utf8').digest('hex');
}

export class LocalDevelopmentIdentityProviderAdapter {
  constructor({
    storageProvider,
    now,
    logger,
    autoVerify = String(process.env.ATLAS_LOCAL_IDENTITY_AUTO_VERIFY ?? 'true').toLowerCase() === 'true',
    exposeResetTokens = String(process.env.ATLAS_LOCAL_IDENTITY_EXPOSE_RESET_TOKEN ?? 'false').toLowerCase() === 'true',
    resetTokenPepper = process.env.ATLAS_LOCAL_IDENTITY_RESET_TOKEN_PEPPER ?? 'atlas-local-reset-pepper',
    namespace = 'executive.customer-identity-provider.local'
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.autoVerify = autoVerify;
    this.exposeResetTokens = exposeResetTokens;
    this.resetTokenPepper = resetTokenPepper;
    this.namespace = namespace;
    this.users = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.users` });
    this.resetTokens = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.reset-tokens` });
  }

  getProviderName() {
    return 'LOCAL_DEVELOPMENT';
  }

  getStatus() {
    return {
      mode: IdentityProviderStatuses.DEVELOPMENT_ONLY,
      readiness: IdentityProviderStatuses.CONFIGURED,
      connectivity: IdentityProviderStatuses.CONNECTED,
      warnings: ['Development authentication provider is active. Not for production use.']
    };
  }

  getCapabilities() {
    return {
      refresh: {
        supported: true,
        providerManaged: false
      },
      logout: {
        supported: true,
        federatedSupported: false
      }
    };
  }

  register({ email, password, metadata = {} } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || String(password ?? '').length < 8) {
      return createIdentityResult({
        ok: false,
        error: createIdentityError({ code: IdentityErrorCodes.INVALID_REQUEST, message: 'Email and password (min 8 chars) are required.' }),
        providerStatus: this.getStatus()
      });
    }

    if (this.users.has(normalizedEmail)) {
      return createIdentityResult({
        ok: false,
        error: createIdentityError({ code: IdentityErrorCodes.DUPLICATE_ACCOUNT, message: 'Account already exists.' }),
        providerStatus: this.getStatus()
      });
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const user = {
      ...createProviderUserRecord({
        providerUserId: `lpid_${randomUUID()}`,
        email: normalizedEmail,
        emailVerified: this.autoVerify,
        metadata
      }, { now: this.now }),
      passwordSalt: salt,
      passwordHash,
      linkedCustomerId: metadata.linkedCustomerId ?? null,
      verificationToken: this.autoVerify ? null : issueToken('verify')
    };

    this.users.set(normalizedEmail, user);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.users`, key: normalizedEmail, value: user });

    return createIdentityResult({
      ok: true,
      data: {
        providerUserId: user.providerUserId,
        email: user.email,
        emailVerified: user.emailVerified,
        verificationRequired: !user.emailVerified,
        verificationToken: user.verificationToken
      },
      providerStatus: this.getStatus()
    });
  }

  login({ email, password } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const user = this.users.get(normalizedEmail) ?? null;
    if (!user) {
      return createIdentityResult({
        ok: false,
        error: createIdentityError({ code: IdentityErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials.' }),
        providerStatus: this.getStatus()
      });
    }

    const computed = hashPassword(password, user.passwordSalt);
    const left = Buffer.from(computed, 'hex');
    const right = Buffer.from(user.passwordHash, 'hex');
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return createIdentityResult({
        ok: false,
        error: createIdentityError({ code: IdentityErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials.' }),
        providerStatus: this.getStatus()
      });
    }

    if (!user.emailVerified) {
      return createIdentityResult({
        ok: false,
        error: createIdentityError({ code: IdentityErrorCodes.EMAIL_NOT_VERIFIED, message: 'Email verification is required before login.' }),
        providerStatus: this.getStatus()
      });
    }

    return createIdentityResult({
      ok: true,
      data: {
        providerUserId: user.providerUserId,
        email: user.email,
        emailVerified: user.emailVerified,
        linkedCustomerId: user.linkedCustomerId ?? null
      },
      providerStatus: this.getStatus()
    });
  }

  logout() {
    return createIdentityResult({ ok: true, data: { loggedOut: true }, providerStatus: this.getStatus() });
  }

  federatedLogout() {
    return createIdentityResult({
      ok: false,
      error: createIdentityError({
        code: IdentityErrorCodes.UNSUPPORTED_CAPABILITY,
        message: 'Federated logout is not supported by local development provider.',
        details: { reason: 'FEDERATED_LOGOUT_UNSUPPORTED' }
      }),
      providerStatus: this.getStatus()
    });
  }

  validateSession() {
    return createIdentityResult({ ok: true, data: { valid: true }, providerStatus: this.getStatus() });
  }

  refreshSession() {
    return createIdentityResult({
      ok: false,
      error: createIdentityError({
        code: IdentityErrorCodes.UNSUPPORTED_CAPABILITY,
        message: 'Refresh token lifecycle is not supported by local development provider.',
        details: { reason: 'REFRESH_UNSUPPORTED' }
      }),
      providerStatus: this.getStatus()
    });
  }

  requestPasswordReset({ email } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const user = this.users.get(normalizedEmail) ?? null;

    if (!user) {
      return createIdentityResult({
        ok: true,
        data: {
          accepted: true,
          generic: true,
          developmentResetToken: this.exposeResetTokens ? issueToken('reset') : null
        },
        providerStatus: this.getStatus()
      });
    }

    const token = issueToken('reset');
    const tokenHash = hashResetToken(token, this.resetTokenPepper);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const record = {
      tokenHash,
      email: user.email,
      providerUserId: user.providerUserId,
      expiresAt,
      used: false,
      createdAt: nowIso(this.now)
    };

    this.resetTokens.set(tokenHash, record);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.reset-tokens`, key: tokenHash, value: record });

    return createIdentityResult({
      ok: true,
      data: {
        accepted: true,
        generic: true,
        developmentResetToken: this.exposeResetTokens ? token : null
      },
      providerStatus: this.getStatus()
    });
  }

  completePasswordReset({ token, newPassword } = {}) {
    const tokenHash = hashResetToken(token, this.resetTokenPepper);
    const record = this.resetTokens.get(tokenHash) ?? null;
    if (!record || record.used || Date.parse(record.expiresAt) <= Date.now()) {
      return createIdentityResult({
        ok: false,
        error: createIdentityError({ code: IdentityErrorCodes.TOKEN_INVALID, message: 'Password reset token is invalid or expired.' }),
        providerStatus: this.getStatus()
      });
    }

    if (String(newPassword ?? '').length < 8) {
      return createIdentityResult({
        ok: false,
        error: createIdentityError({ code: IdentityErrorCodes.INVALID_REQUEST, message: 'New password must be at least 8 characters.' }),
        providerStatus: this.getStatus()
      });
    }

    const user = this.users.get(record.email) ?? null;
    if (!user) {
      return createIdentityResult({
        ok: false,
        error: createIdentityError({ code: IdentityErrorCodes.ACCOUNT_NOT_FOUND, message: 'Account not found.' }),
        providerStatus: this.getStatus()
      });
    }

    const salt = randomBytes(16).toString('hex');
    const updated = {
      ...user,
      passwordSalt: salt,
      passwordHash: hashPassword(newPassword, salt),
      updatedAt: nowIso(this.now)
    };

    this.users.set(record.email, updated);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.users`, key: record.email, value: updated });

    const usedRecord = { ...record, used: true };
    this.resetTokens.set(tokenHash, usedRecord);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.reset-tokens`, key: tokenHash, value: usedRecord });

    return createIdentityResult({
      ok: true,
      data: {
        completed: true,
        email: record.email
      },
      providerStatus: this.getStatus()
    });
  }

  lookupUser({ email, providerUserId } = {}) {
    if (providerUserId) {
      const user = Array.from(this.users.values()).find((item) => item.providerUserId === providerUserId) ?? null;
      return createIdentityResult({ ok: true, data: user, providerStatus: this.getStatus() });
    }

    const user = this.users.get(normalizeEmail(email)) ?? null;
    return createIdentityResult({ ok: true, data: user, providerStatus: this.getStatus() });
  }

  linkIdentity({ providerUserId, linkedCustomerId } = {}) {
    const user = Array.from(this.users.values()).find((item) => item.providerUserId === providerUserId) ?? null;
    if (!user) {
      return createIdentityResult({
        ok: false,
        error: createIdentityError({ code: IdentityErrorCodes.ACCOUNT_NOT_FOUND, message: 'Provider user not found.' }),
        providerStatus: this.getStatus()
      });
    }

    const updated = {
      ...user,
      linkedCustomerId,
      linkedAt: nowIso(this.now),
      updatedAt: nowIso(this.now)
    };

    this.users.set(updated.email, updated);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.users`, key: updated.email, value: updated });

    return createIdentityResult({ ok: true, data: updated, providerStatus: this.getStatus() });
  }

  verifyEmailForDevelopment({ email } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const user = this.users.get(normalizedEmail) ?? null;
    if (!user) return false;
    const updated = { ...user, emailVerified: true, verificationToken: null, updatedAt: nowIso(this.now) };
    this.users.set(normalizedEmail, updated);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.users`, key: normalizedEmail, value: updated });
    return true;
  }

  healthReport() {
    const status = this.getStatus();
    return {
      provider: this.getProviderName(),
      ...status,
      userCount: this.users.size,
      resetTokenCount: this.resetTokens.size
    };
  }
}
