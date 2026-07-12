import { loadRecordMap, upsertRecord, deleteRecord } from '../storage/provider-backed-state.js';
import { randomUUID } from 'node:crypto';
import { SecurityEnvelopeCrypto } from './security-envelope-crypto.js';

function getProvider(store) {
  return store?.storageProvider && typeof store.storageProvider === 'object'
    ? store.storageProvider
    : null;
}

function conditionalSetRecord({ store, key, expectedVersion, value }) {
  const provider = getProvider(store);
  if (!provider || typeof provider.conditionalSetStateRecord !== 'function') {
    store.persistRecord(key, value);
    return { ok: true, code: 'OK', reason: null };
  }

  const result = provider.conditionalSetStateRecord({
    namespace: store.namespace,
    key,
    expectedVersion,
    value
  });

  if (result?.ok) {
    store.records.set(key, value);
    return { ok: true, code: 'OK', reason: null };
  }

  if (result?.code === 'VERSION_MISMATCH') {
    const latest = provider.getStateRecord({ namespace: store.namespace, key });
    if (latest?.ok) {
      store.records.set(key, latest.value);
    }
    return {
      ok: false,
      code: 'INVALID_STATE',
      reason: 'OIDC transaction was modified by another worker.',
      data: null
    };
  }

  return {
    ok: false,
    code: 'PERSISTENCE_FAILURE',
    reason: 'Conditional write failed for OIDC transaction.',
    data: null
  };
}

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

const OidcTransactionStates = Object.freeze({
  CREATED: 'CREATED',
  RESERVED: 'RESERVED',
  CONSUMED: 'CONSUMED'
});

function nextVersion(record) {
  return Number(record?.version ?? 0) + 1;
}

export class CustomerOidcAuthTransactionStore {
  constructor({
    storageProvider,
    now,
    namespace = 'executive.customer-auth.oidc-transactions',
    defaultTtlMs = 10 * 60 * 1000,
    verifierCipher = null
  } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.namespace = namespace;
    this.defaultTtlMs = Number.isFinite(Number(defaultTtlMs)) && Number(defaultTtlMs) > 0
      ? Number(defaultTtlMs)
      : 10 * 60 * 1000;
    this.verifierCipher = verifierCipher ?? new SecurityEnvelopeCrypto();
    this.records = loadRecordMap({ provider: this.storageProvider, namespace: this.namespace });
  }

  encryptPkceVerifier({ state, pkceVerifier } = {}) {
    return this.verifierCipher.encryptString(String(pkceVerifier), {
      aad: `oidc_txn:${String(state ?? '').trim()}`
    });
  }

  decryptPkceVerifier({ state, envelope } = {}) {
    return this.verifierCipher.decryptString(envelope, {
      aad: `oidc_txn:${String(state ?? '').trim()}`
    });
  }

  materializeRecord(record) {
    if (!record || typeof record !== 'object') {
      return { ok: false, code: 'INVALID_STATE', reason: 'OIDC transaction record is missing or malformed.', data: null };
    }

    if (record.pkceVerifierEnvelope && typeof record.pkceVerifierEnvelope === 'object') {
      try {
        const pkceVerifier = this.decryptPkceVerifier({ state: record.state, envelope: record.pkceVerifierEnvelope });
        return {
          ok: true,
          code: 'OK',
          reason: null,
          data: {
            ...record,
            pkceVerifier,
            pkceVerifierEnvelope: record.pkceVerifierEnvelope,
            pkceVerifierCiphertext: true
          }
        };
      } catch {
        return {
          ok: false,
          code: 'TOKEN_INVALID',
          reason: 'OIDC transaction verifier decryption failed.',
          data: null
        };
      }
    }

    return {
      ok: false,
      code: 'TOKEN_INVALID',
      reason: 'OIDC transaction verifier envelope is missing.',
      data: null
    };
  }

  persistRecord(key, value) {
    this.records.set(key, value);
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key, value });
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
    portalRedirectUri = null,
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

    let pkceVerifierEnvelope;
    try {
      pkceVerifierEnvelope = this.encryptPkceVerifier({ state: key, pkceVerifier });
    } catch {
      return { ok: false, code: 'PERSISTENCE_FAILURE', reason: 'Failed to encrypt PKCE verifier.', data: null };
    }

    const record = {
      transactionId: transactionId ?? `oidc_txn_${key}`,
      state: key,
      nonce: String(nonce),
      pkceVerifierEnvelope,
      providerType: String(providerType),
      redirectUri: String(redirectUri),
      portalRedirectUri: isText(portalRedirectUri) ? String(portalRedirectUri) : null,
      createdAt: createdAtIso,
      expiresAt: expiresAtIso,
      consumedAt: null,
      consumedReason: null,
      status: OidcTransactionStates.CREATED,
      reservationId: null,
      reservationOwner: null,
      reservationExpiresAt: null,
      reservedAt: null,
      version: 1
    };

    this.persistRecord(key, record);
    return { ok: true, code: 'OK', reason: null, data: record };
  }

  reserveTransaction({ state, providerType, redirectUri, reservationOwner = 'callback' } = {}) {
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

    if (record.status === OidcTransactionStates.CONSUMED || record.consumedAt) {
      return { ok: false, code: 'INVALID_STATE', reason: 'OIDC transaction has already been consumed.', data: null };
    }

    const materialized = this.materializeRecord(record);
    if (!materialized.ok) {
      return materialized;
    }

    if (isText(providerType) && String(record.providerType) !== String(providerType)) {
      return { ok: false, code: 'PROVIDER_MISMATCH', reason: 'OIDC provider does not match transaction.', data: null };
    }

    if (isText(redirectUri) && String(record.redirectUri) !== String(redirectUri)) {
      return { ok: false, code: 'INVALID_REQUEST', reason: 'OIDC redirect URI does not match transaction.', data: null };
    }

    const now = nowMs(this.now);
    const reservationActive = record.status === OidcTransactionStates.RESERVED
      && isText(record.reservationId)
      && Date.parse(String(record.reservationExpiresAt ?? '')) > now;

    if (reservationActive) {
      return { ok: false, code: 'INVALID_STATE', reason: 'OIDC transaction is already reserved.', data: null };
    }

    const reserved = {
      ...record,
      status: OidcTransactionStates.RESERVED,
      reservationId: `oidc_res_${randomUUID()}`,
      reservationOwner: String(reservationOwner),
      reservedAt: nowIso(this.now),
      reservationExpiresAt: new Date(now + 2 * 60 * 1000).toISOString(),
      version: nextVersion(record)
    };
    try {
      const persisted = conditionalSetRecord({
        store: this,
        key,
        expectedVersion: Number(record.version ?? 0),
        value: reserved
      });
      if (!persisted.ok) {
        return persisted;
      }
      return {
        ok: true,
        code: 'OK',
        reason: null,
        data: {
          ...reserved,
          pkceVerifier: materialized.data.pkceVerifier,
          pkceVerifierCiphertext: true
        }
      };
    } catch {
      return { ok: false, code: 'PERSISTENCE_FAILURE', reason: 'Failed to reserve OIDC transaction.', data: null };
    }
  }

  releaseReservation({ state, reservationId } = {}) {
    const key = String(state ?? '').trim();
    if (!isText(key) || !isText(reservationId)) {
      return { ok: false, code: 'INVALID_REQUEST', reason: 'State and reservationId are required.', data: null };
    }

    const record = this.records.get(key) ?? null;
    if (!record) {
      return { ok: false, code: 'NOT_FOUND', reason: 'OIDC transaction not found.', data: null };
    }

    if (record.status !== OidcTransactionStates.RESERVED || String(record.reservationId) !== String(reservationId)) {
      return { ok: false, code: 'INVALID_STATE', reason: 'OIDC transaction reservation is not active.', data: null };
    }

    const released = {
      ...record,
      status: OidcTransactionStates.CREATED,
      reservationId: null,
      reservationOwner: null,
      reservedAt: null,
      reservationExpiresAt: null,
      version: nextVersion(record)
    };
    try {
      const persisted = conditionalSetRecord({
        store: this,
        key,
        expectedVersion: Number(record.version ?? 0),
        value: released
      });
      if (!persisted.ok) {
        return persisted;
      }
      return { ok: true, code: 'OK', reason: null, data: released };
    } catch {
      return { ok: false, code: 'PERSISTENCE_FAILURE', reason: 'Failed to release OIDC transaction reservation.', data: null };
    }
  }

  commitConsumption({ state, reservationId, consumedReason = 'COMPLETED' } = {}) {
    const key = String(state ?? '').trim();
    if (!isText(key) || !isText(reservationId)) {
      return { ok: false, code: 'INVALID_REQUEST', reason: 'State and reservationId are required.', data: null };
    }

    const record = this.records.get(key) ?? null;
    if (!record) {
      return { ok: false, code: 'NOT_FOUND', reason: 'OIDC transaction not found.', data: null };
    }

    if (record.status === OidcTransactionStates.CONSUMED || record.consumedAt) {
      return { ok: false, code: 'INVALID_STATE', reason: 'OIDC transaction has already been consumed.', data: null };
    }

    if (record.status !== OidcTransactionStates.RESERVED || String(record.reservationId) !== String(reservationId)) {
      return { ok: false, code: 'INVALID_STATE', reason: 'OIDC transaction reservation is not active.', data: null };
    }

    const consumed = {
      ...record,
      status: OidcTransactionStates.CONSUMED,
      consumedAt: nowIso(this.now),
      consumedReason: String(consumedReason),
      reservationId: null,
      reservationOwner: null,
      reservedAt: null,
      reservationExpiresAt: null,
      version: nextVersion(record)
    };

    try {
      const persisted = conditionalSetRecord({
        store: this,
        key,
        expectedVersion: Number(record.version ?? 0),
        value: consumed
      });
      if (!persisted.ok) {
        return persisted;
      }
      return { ok: true, code: 'OK', reason: null, data: consumed };
    } catch {
      return { ok: false, code: 'PERSISTENCE_FAILURE', reason: 'Failed to commit OIDC transaction consumption.', data: null };
    }
  }

  consumeTransaction({ state, providerType, redirectUri } = {}) {
    const reserved = this.reserveTransaction({ state, providerType, redirectUri, reservationOwner: 'direct-consume' });
    if (!reserved.ok) return reserved;
    return this.commitConsumption({ state, reservationId: reserved.data.reservationId, consumedReason: 'DIRECT_CONSUME' });
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
    let reserved = 0;
    for (const record of this.records.values()) {
      if (record?.status === OidcTransactionStates.CONSUMED || record?.consumedAt) consumed += 1;
      else if (record?.status === OidcTransactionStates.RESERVED) reserved += 1;
      else active += 1;
    }
    return {
      total: this.records.size,
      active,
      reserved,
      consumed
    };
  }
}