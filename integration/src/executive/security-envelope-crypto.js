import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const DEFAULT_DEVELOPMENT_ENVELOPE_KEY = 'atlas-dev-auth-envelope-key-v1';

function normalizeKeyMaterial(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  const text = String(value).trim();
  if (!text) return null;

  try {
    const asBase64 = Buffer.from(text, 'base64');
    if (asBase64.length === 32) return asBase64;
  } catch {
    // Ignore and continue.
  }

  const asHex = /^[0-9a-fA-F]{64}$/.test(text) ? Buffer.from(text, 'hex') : null;
  if (asHex && asHex.length === 32) return asHex;

  const utf8 = Buffer.from(text, 'utf8');
  if (utf8.length === 32) return utf8;

  return createHash('sha256').update(utf8).digest();
}

function parseKeyRing(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  const text = String(value).trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore malformed key ring and fail closed at call site.
  }

  return {};
}

function normalizeAad(aad) {
  const text = String(aad ?? '').trim();
  if (!text) return null;
  return Buffer.from(text, 'utf8');
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

export class SecurityEnvelopeCrypto {
  constructor({
    activeKeyVersion = process.env.ATLAS_AUTH_ENCRYPTION_KEY_VERSION ?? 'v1',
    keyRing = parseKeyRing(process.env.ATLAS_AUTH_ENCRYPTION_KEYRING_JSON),
    keyResolver = null,
    algorithm = 'aes-256-gcm'
  } = {}) {
    this.activeKeyVersion = String(activeKeyVersion ?? '').trim() || 'v1';
    this.algorithm = algorithm;
    this.keyRing = new Map();
    this.keyResolver = keyResolver;
    this.fallbackSource = null;

    for (const [version, material] of Object.entries(keyRing ?? {})) {
      const key = normalizeKeyMaterial(material);
      if (key && key.length === 32) {
        this.keyRing.set(String(version), key);
      }
    }

    if (!this.keyRing.has(this.activeKeyVersion)) {
      const fallback = process.env.ATLAS_AUTH_ENCRYPTION_KEY
        ?? process.env.ATLAS_AUTH_ENCRYPTION_FALLBACK_KEY
        ?? DEFAULT_DEVELOPMENT_ENVELOPE_KEY;
      const normalized = normalizeKeyMaterial(fallback);
      if (normalized && normalized.length === 32) {
        this.keyRing.set(this.activeKeyVersion, normalized);
        this.fallbackSource = String(fallback ?? '') === DEFAULT_DEVELOPMENT_ENVELOPE_KEY
          ? 'DEFAULT_DEVELOPMENT_FALLBACK'
          : 'ENV_FALLBACK';
      }
    }
  }

  isUsingDevelopmentFallbackKey() {
    return this.fallbackSource === 'DEFAULT_DEVELOPMENT_FALLBACK';
  }

  resolveEncryptionKey() {
    const resolvedByAdapter = this.keyResolver?.resolveEncryptionKey?.({
      keyVersion: this.activeKeyVersion,
      algorithm: this.algorithm
    });
    const resolved = normalizeKeyMaterial(resolvedByAdapter) ?? this.keyRing.get(this.activeKeyVersion) ?? null;
    if (!resolved || resolved.length !== 32) {
      throw new Error('ENCRYPTION_KEY_UNAVAILABLE');
    }
    return { keyVersion: this.activeKeyVersion, key: resolved };
  }

  resolveDecryptionKey(keyVersion) {
    const version = String(keyVersion ?? '').trim();
    if (!version) {
      throw new Error('ENVELOPE_KEY_VERSION_MISSING');
    }

    const resolvedByAdapter = this.keyResolver?.resolveDecryptionKey?.({
      keyVersion: version,
      algorithm: this.algorithm
    });
    const resolved = normalizeKeyMaterial(resolvedByAdapter) ?? this.keyRing.get(version) ?? null;
    if (!resolved || resolved.length !== 32) {
      throw new Error('DECRYPTION_KEY_UNAVAILABLE');
    }

    return resolved;
  }

  encryptString(value, { aad = null } = {}) {
    if (!hasText(value)) {
      throw new Error('PLAINTEXT_MISSING');
    }

    const { keyVersion, key } = this.resolveEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, key, iv);

    const aadBuffer = normalizeAad(aad);
    if (aadBuffer) cipher.setAAD(aadBuffer);

    const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      type: 'SECURITY_ENVELOPE',
      alg: this.algorithm,
      keyVersion,
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: tag.toString('base64')
    };
  }

  decryptString(envelope, { aad = null } = {}) {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error('ENVELOPE_MALFORMED');
    }

    const algorithm = String(envelope.alg ?? '').trim();
    if (!algorithm || algorithm !== this.algorithm) {
      throw new Error('ENVELOPE_ALGORITHM_UNSUPPORTED');
    }

    const key = this.resolveDecryptionKey(envelope.keyVersion);
    const iv = Buffer.from(String(envelope.iv ?? ''), 'base64');
    const ciphertext = Buffer.from(String(envelope.ciphertext ?? ''), 'base64');
    const authTag = Buffer.from(String(envelope.authTag ?? ''), 'base64');

    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
      throw new Error('ENVELOPE_MALFORMED');
    }

    const decipher = createDecipheriv(algorithm, key, iv);
    const aadBuffer = normalizeAad(aad);
    if (aadBuffer) decipher.setAAD(aadBuffer);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    if (!hasText(plaintext)) {
      throw new Error('ENVELOPE_DECRYPT_EMPTY');
    }
    return plaintext;
  }
}
