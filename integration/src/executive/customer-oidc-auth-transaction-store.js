import { loadRecordMap, upsertRecord, deleteRecord } from '../storage/provider-backed-state.js';

function nowMs(nowFn) {
  const value = nowFn?.();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ''));
  if (Number.isFinite(parsed)) return parsed;
  return Date.now();
}

function nowIso(nowFn) {
  return new Date(nowMs(nowFn)).toISOString();
}

function isText(value) {
  return String(value ?? '').trim().length > 0;
}

export class CustomerOidcAuthTransactionStore {
  constructor({
    storageProvider,
    now,
    namespace = 'executive.customer-auth.oidc-transactions',
    defaultTtlMs = 10 * 60 * 1000
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.namespace = namespace;
    this.defaultTtlMs = Number.isFinite(Number(defaultTtlMs)) && Number(defaultTtlMs) > 0
      ? Number(defaultTtlMs)
      : 10 * 60 * 1000;
    this.records = loadRecordMap({ provider: this.storageProvider, namespace: this.namespace });
  }

  isExpired(record) {
    if (!record?.expiresAt) return true;
    return Date.parse(String(record.expiresAt)) <= nowMs(this.now);
  }

  cleanupExpiredTransactions() {
    let removed = 0;
    for (const [state, record] of this.records.entries()) {
      if (!record || this.isExpired(record)) {
        this.records.delete(state);
        deleteRecord({ provider: this.storageProvider, namespace: this.namespace, key: state });
        removed += 1;
      }
    }
    return removed;
  }

  createTransaction({
    state,
    nonce,
    pkceVerifier,
    providerType,
    redirectUri,
    transactionId,
    createdAt = null,
    ttlMs = this.defaultTtlMs
  } = {}) {
    this.cleanupExpiredTransactions();

    const key = String(state ?? '').trim();
    if (!isText(key) || !isText(nonce) || !isText(pkceVerifier) || !isText(providerType) || !isText(redirectUri)) {
      return { ok: false, code: 'INVALID_REQUEST', reason: 'State, nonce, PKCE verifier, provider, and redirect URI are required.', data: null };
    }

    if (this.records.has(key)) {
      return { ok: false, code: 'CONFLICT', reason: 'OIDC transaction state already exists.', data: null };
    }

    const ttl = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0 ? Number(ttlMs) : this.defaultTtlMs;
    const createdMs = createdAt ? Date.parse(String(createdAt)) : nowMs(this.now);
    const createdAtIso = Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : nowIso(this.now);
    const expiresAtIso = new Date((Number.isFinite(createdMs) ? createdMs : nowMs(this.now)) + ttl).toISOString();

    const record = {
      transactionId: transactionId ?? `oidc_txn_${key}`,
      state: key,
      nonce: String(nonce),
      pkceVerifier: String(pkceVerifier),
      providerType: String(providerType),
      redirectUri: String(redirectUri),
      createdAt: createdAtIso,
      expiresAt: expiresAtIso,
      consumedAt: null
    };

    this.records.set(key, record);
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key, value: record });
    return { ok: true, code: 'OK', reason: null, data: record };
  }

  consumeTransaction({ state, providerType, redirectUri } = {}) {
    const key = String(state ?? '').trim();
    if (!isText(key)) {
      return { ok: false, code: 'INVALID_REQUEST', reason: 'OIDC state is required.', data: null };
    }

    const record = this.records.get(key) ?? null;
    if (!record) {
      return { ok: false, code: 'NOT_FOUND', reason: 'OIDC transaction not found.', data: null };
    }

    if (this.isExpired(record)) {
      this.records.delete(key);
      deleteRecord({ provider: this.storageProvider, namespace: this.namespace, key });
      return { ok: false, code: 'TOKEN_EXPIRED', reason: 'OIDC transaction has expired.', data: null };
    }

    if (record.consumedAt) {
      return { ok: false, code: 'INVALID_STATE', reason: 'OIDC transaction has already been consumed.', data: null };
    }

    if (isText(providerType) && String(record.providerType) !== String(providerType)) {
      return { ok: false, code: 'PROVIDER_MISMATCH', reason: 'OIDC provider does not match transaction.', data: null };
    }

    if (isText(redirectUri) && String(record.redirectUri) !== String(redirectUri)) {
      return { ok: false, code: 'INVALID_REQUEST', reason: 'OIDC redirect URI does not match transaction.', data: null };
    }

    const consumed = {
      ...record,
      consumedAt: nowIso(this.now)
    };
    this.records.set(key, consumed);
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key, value: consumed });
    return { ok: true, code: 'OK', reason: null, data: consumed };
  }

  cancelTransaction({ state } = {}) {
    const key = String(state ?? '').trim();
    if (!isText(key)) return false;
    const existed = this.records.has(key);
    this.records.delete(key);
    deleteRecord({ provider: this.storageProvider, namespace: this.namespace, key });
    return existed;
  }

  getStats() {
    this.cleanupExpiredTransactions();
    let active = 0;
    let consumed = 0;
    for (const record of this.records.values()) {
      if (record?.consumedAt) consumed += 1;
      else active += 1;
    }
    return {
      total: this.records.size,
      active,
      consumed
    };
  }
}