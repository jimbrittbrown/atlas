import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function toMillis(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hashSecret(secret, pepper) {
  return createHash('sha256').update(`${secret}:${pepper}`, 'utf8').digest('hex');
}

function issueCsrfToken() {
  return randomBytes(32).toString('base64url');
}

function isValidCsrfTokenFormat(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

function parseToken(token) {
  const text = String(token ?? '').trim();
  const match = /^((?:csn_)[a-z0-9-]+)\.([a-f0-9]{64})$/i.exec(text);
  if (!match) return null;
  return { sessionId: match[1], secret: match[2] };
}

export class CustomerSessionManager {
  constructor({
    storageProvider,
    now,
    logger,
    namespace = 'executive.customer-auth.sessions',
    idleTimeoutMs = toMillis(process.env.ATLAS_AUTH_SESSION_IDLE_TIMEOUT_MS, 30 * 60 * 1000),
    absoluteTimeoutMs = toMillis(process.env.ATLAS_AUTH_SESSION_ABSOLUTE_TIMEOUT_MS, 12 * 60 * 60 * 1000),
    pepper = process.env.ATLAS_AUTH_SESSION_PEPPER ?? 'atlas-dev-pepper'
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.namespace = namespace;
    this.idleTimeoutMs = idleTimeoutMs;
    this.absoluteTimeoutMs = absoluteTimeoutMs;
    this.pepper = pepper;
    this.sessions = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.records` });
    this.audit = getMetaMap({ provider: this.storageProvider, namespace: `${namespace}.audit` });
    this.recoverSessions();
  }

  recoverSessions() {
    let recoveredActive = 0;
    let expiredOnRecovery = 0;

    for (const session of this.sessions.values()) {
      const status = String(session?.status ?? '').toUpperCase();
      if (status !== 'ACTIVE') continue;

      if (this.isExpired(session)) {
        const expired = {
          ...session,
          status: 'EXPIRED',
          expiresAt: nowIso(this.now)
        };
        this.sessions.set(session.sessionId, expired);
        setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.records`, key: session.sessionId, value: expired });
        expiredOnRecovery += 1;
        continue;
      }

      recoveredActive += 1;
    }

    this.createAudit('SESSION_RECOVERY_COMPLETED', {
      recoveredActive,
      expiredOnRecovery,
      totalRecords: this.sessions.size
    });
  }

  cleanupExpiredSessions() {
    let expiredUpdated = 0;
    for (const session of this.sessions.values()) {
      if (String(session.status ?? '').toUpperCase() !== 'ACTIVE') continue;
      if (!this.isExpired(session)) continue;

      const expired = {
        ...session,
        status: 'EXPIRED',
        expiresAt: nowIso(this.now)
      };
      this.sessions.set(session.sessionId, expired);
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.records`, key: session.sessionId, value: expired });
      expiredUpdated += 1;
    }

    if (expiredUpdated > 0) {
      this.createAudit('SESSION_CLEANUP_COMPLETED', { expiredUpdated });
    }

    return expiredUpdated;
  }

  createAudit(event, details = {}) {
    const record = {
      auditId: `auth_audit_${randomUUID()}`,
      timestamp: nowIso(this.now),
      event,
      details
    };
    this.audit.set(record.auditId, record);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: record.auditId, value: record });
    return record;
  }

  createSession({ customerId, role = 'CUSTOMER', accountStatus = 'ACTIVE', metadata = {} } = {}) {
    this.cleanupExpiredSessions();

    const createdAt = nowIso(this.now);
    const createdMs = Date.parse(createdAt);
    const idleExpiresAt = new Date(createdMs + this.idleTimeoutMs).toISOString();
    const absoluteExpiresAt = new Date(createdMs + this.absoluteTimeoutMs).toISOString();

    const sessionId = `csn_${randomUUID()}`;
    const secret = randomBytes(32).toString('hex');
    const csrfToken = issueCsrfToken();
    const record = {
      sessionId,
      customerId,
      role,
      accountStatus,
      secretHash: hashSecret(secret, this.pepper),
      createdAt,
      lastUsedAt: createdAt,
      idleExpiresAt,
      absoluteExpiresAt,
      expiresAt: idleExpiresAt,
      revokedAt: null,
      revokedReason: null,
      status: 'ACTIVE',
      rotationCounter: 0,
      metadata: {
        lastIpHash: metadata.lastIpHash ?? null,
        lastUserAgentHash: metadata.lastUserAgentHash ?? null,
        csrfTokenHash: hashSecret(csrfToken, this.pepper)
      }
    };

    this.sessions.set(sessionId, record);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.records`, key: sessionId, value: record });
    this.createAudit('SESSION_CREATED', { sessionId, customerId, role, accountStatus });

    return {
      sessionToken: `${sessionId}.${secret}`,
      csrfToken,
      session: record
    };
  }

  revokeSession({ sessionId, reason = 'LOGOUT' } = {}) {
    const session = this.sessions.get(sessionId) ?? null;
    if (!session) return false;

    const updated = {
      ...session,
      status: 'REVOKED',
      revokedAt: nowIso(this.now),
      revokedReason: reason,
      expiresAt: nowIso(this.now)
    };
    this.sessions.set(sessionId, updated);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.records`, key: sessionId, value: updated });
    this.createAudit('SESSION_REVOKED', { sessionId, customerId: updated.customerId, reason });
    return true;
  }

  revokeAllSessions({ customerId, reason = 'REVOKE_ALL' } = {}) {
    this.cleanupExpiredSessions();
    const sessions = Array.from(this.sessions.values()).filter((session) => session.customerId === customerId && session.status === 'ACTIVE');
    sessions.forEach((session) => this.revokeSession({ sessionId: session.sessionId, reason }));
    this.createAudit('SESSION_REVOKE_ALL', { customerId, count: sessions.length, reason });
    return sessions.length;
  }

  isExpired(session) {
    const nowMs = Date.now();
    return Date.parse(session.idleExpiresAt) <= nowMs || Date.parse(session.absoluteExpiresAt) <= nowMs;
  }

  validateSessionToken(token, { customerId = null, rotateIdle = true } = {}) {
    this.cleanupExpiredSessions();
    const parsed = parseToken(token);
    if (!parsed) {
      this.createAudit('SESSION_REJECTED', { reason: 'MALFORMED_TOKEN' });
      return { valid: false, reason: 'INVALID_TOKEN', session: null };
    }

    const session = this.sessions.get(parsed.sessionId) ?? null;
    if (!session) {
      this.createAudit('SESSION_REJECTED', { reason: 'SESSION_NOT_FOUND', sessionId: parsed.sessionId });
      return { valid: false, reason: 'SESSION_NOT_FOUND', session: null };
    }

    if (session.status !== 'ACTIVE') {
      this.createAudit('SESSION_REJECTED', { reason: 'SESSION_NOT_ACTIVE', sessionId: session.sessionId });
      return { valid: false, reason: 'SESSION_REVOKED', session: null };
    }

    if (this.isExpired(session)) {
      const expired = {
        ...session,
        status: 'EXPIRED',
        expiresAt: nowIso(this.now)
      };
      this.sessions.set(session.sessionId, expired);
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.records`, key: session.sessionId, value: expired });
      this.createAudit('SESSION_EXPIRED', { sessionId: session.sessionId, customerId: session.customerId });
      return { valid: false, reason: 'SESSION_EXPIRED', session: null };
    }

    if (customerId && session.customerId !== customerId) {
      this.createAudit('SESSION_REJECTED', { reason: 'CUSTOMER_MISMATCH', sessionId: session.sessionId });
      return { valid: false, reason: 'CUSTOMER_MISMATCH', session: null };
    }

    const presentedHash = hashSecret(parsed.secret, this.pepper);
    const left = Buffer.from(presentedHash, 'hex');
    const right = Buffer.from(session.secretHash, 'hex');
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      this.createAudit('SESSION_REJECTED', { reason: 'SECRET_MISMATCH', sessionId: session.sessionId });
      return { valid: false, reason: 'REPLAY_REJECTED', session: null };
    }

    const updated = rotateIdle
      ? {
          ...session,
          lastUsedAt: nowIso(this.now),
          idleExpiresAt: new Date(Date.now() + this.idleTimeoutMs).toISOString(),
          expiresAt: new Date(Date.now() + this.idleTimeoutMs).toISOString()
        }
      : session;

    if (rotateIdle) {
      this.sessions.set(session.sessionId, updated);
      setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.records`, key: session.sessionId, value: updated });
      this.createAudit('SESSION_VALIDATED', { sessionId: session.sessionId, customerId: session.customerId });
    }

    return { valid: true, reason: null, session: updated };
  }

  refreshSessionToken(token) {
    const validation = this.validateSessionToken(token, { rotateIdle: false });
    if (!validation.valid || !validation.session) {
      return { refreshed: false, reason: validation.reason, sessionToken: null, session: null };
    }

    const secret = randomBytes(32).toString('hex');
    const csrfToken = issueCsrfToken();
    const updated = {
      ...validation.session,
      secretHash: hashSecret(secret, this.pepper),
      rotationCounter: Number(validation.session.rotationCounter ?? 0) + 1,
      lastUsedAt: nowIso(this.now),
      idleExpiresAt: new Date(Date.now() + this.idleTimeoutMs).toISOString(),
      expiresAt: new Date(Date.now() + this.idleTimeoutMs).toISOString(),
      metadata: {
        ...(validation.session.metadata ?? {}),
        csrfTokenHash: hashSecret(csrfToken, this.pepper)
      }
    };

    this.sessions.set(updated.sessionId, updated);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.records`, key: updated.sessionId, value: updated });
    this.createAudit('SESSION_REFRESHED', { sessionId: updated.sessionId, customerId: updated.customerId, rotationCounter: updated.rotationCounter });

    return {
      refreshed: true,
      reason: null,
      sessionToken: `${updated.sessionId}.${secret}`,
      csrfToken,
      session: updated
    };
  }

  validateCsrfToken({ session, csrfToken } = {}) {
    if (!session || typeof session !== 'object') {
      this.createAudit('SESSION_CSRF_REJECTED', { reason: 'SESSION_MISSING' });
      return { valid: false, reason: 'SESSION_MISSING' };
    }

    if (!isValidCsrfTokenFormat(csrfToken)) {
      this.createAudit('SESSION_CSRF_REJECTED', { reason: 'CSRF_MALFORMED', sessionId: session.sessionId ?? null });
      return { valid: false, reason: 'CSRF_MALFORMED' };
    }

    const expectedHash = session.metadata?.csrfTokenHash ?? null;
    if (typeof expectedHash !== 'string' || expectedHash.length !== 64) {
      this.createAudit('SESSION_CSRF_REJECTED', { reason: 'CSRF_NOT_ISSUED', sessionId: session.sessionId ?? null });
      return { valid: false, reason: 'CSRF_NOT_ISSUED' };
    }

    const presentedHash = hashSecret(csrfToken, this.pepper);
    const left = Buffer.from(presentedHash, 'hex');
    const right = Buffer.from(expectedHash, 'hex');
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      this.createAudit('SESSION_CSRF_REJECTED', { reason: 'CSRF_MISMATCH', sessionId: session.sessionId ?? null });
      return { valid: false, reason: 'CSRF_MISMATCH' };
    }

    this.createAudit('SESSION_CSRF_VALIDATED', { sessionId: session.sessionId ?? null, customerId: session.customerId ?? null });
    return { valid: true, reason: null };
  }

  getSessionStats() {
    const values = Array.from(this.sessions.values());
    const counts = values.reduce((acc, session) => {
      const status = String(session.status ?? 'UNKNOWN').toUpperCase();
      acc[status] = Number(acc[status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      total: values.length,
      active: Number(counts.ACTIVE ?? 0),
      expired: Number(counts.EXPIRED ?? 0),
      revoked: Number(counts.REVOKED ?? 0)
    };
  }

  listAuditRecords() {
    return Array.from(this.audit.values()).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }
}
