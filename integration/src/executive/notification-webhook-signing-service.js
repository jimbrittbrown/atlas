import { createHash, createHmac } from 'node:crypto';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function parseKeyRing(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    return {};
  }

  return {};
}

function normalizeKeyMaterial(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  try {
    const b64 = Buffer.from(text, 'base64');
    if (b64.length >= 16) return b64;
  } catch {
    // noop
  }

  if (/^[0-9a-fA-F]+$/.test(text) && text.length % 2 === 0) {
    const hex = Buffer.from(text, 'hex');
    if (hex.length >= 16) return hex;
  }

  const utf8 = Buffer.from(text, 'utf8');
  return createHash('sha256').update(utf8).digest();
}

function bodyDigest(body) {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  return `sha256:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`;
}

export class NotificationWebhookSigningService {
  constructor({
    now,
    keyVersion = process.env.ATLAS_WEBHOOK_SIGNING_KEY_VERSION ?? 'v1',
    keyRing = parseKeyRing(process.env.ATLAS_WEBHOOK_SIGNING_KEYRING_JSON),
    replayWindowSeconds = Number.parseInt(String(process.env.ATLAS_WEBHOOK_REPLAY_WINDOW_SECONDS ?? '300'), 10),
    developmentFallbackKey = process.env.ATLAS_WEBHOOK_LOCAL_TEST_SIGNING_KEY ?? 'atlas-webhook-local-test-key',
    allowDevelopmentFallback = String(process.env.NODE_ENV ?? 'development') !== 'production'
  } = {}) {
    this.now = now;
    this.keyVersion = String(keyVersion ?? 'v1').trim() || 'v1';
    this.replayWindowSeconds = Number.isFinite(replayWindowSeconds) ? replayWindowSeconds : 300;

    this.keyRing = new Map();
    Object.entries(keyRing ?? {}).forEach(([version, key]) => {
      const normalized = normalizeKeyMaterial(key);
      if (normalized) this.keyRing.set(String(version), normalized);
    });

    if (!this.keyRing.has(this.keyVersion) && allowDevelopmentFallback) {
      const fallback = normalizeKeyMaterial(developmentFallbackKey);
      if (fallback) this.keyRing.set(this.keyVersion, fallback);
    }
  }

  validateConfiguration({ production = false } = {}) {
    const issues = [];
    if (!hasText(this.keyVersion)) issues.push('Signing key version is required.');
    if (!this.keyRing.has(this.keyVersion)) {
      issues.push('Signing key material is missing for active key version.');
    }
    if (!Number.isFinite(this.replayWindowSeconds) || this.replayWindowSeconds < 30 || this.replayWindowSeconds > 3600) {
      issues.push('Replay window must be between 30 and 3600 seconds.');
    }

    return {
      accepted: issues.length === 0,
      issues,
      failStartup: Boolean(production && issues.length > 0)
    };
  }

  canonicalInput({ timestamp, requestId, method, endpoint, bodyDigestValue, keyVersion }) {
    return [
      String(timestamp),
      String(requestId),
      String(method).toUpperCase(),
      String(endpoint),
      String(bodyDigestValue),
      String(keyVersion)
    ].join('\n');
  }

  createSignature({ requestId, method = 'POST', endpoint, body }) {
    const key = this.keyRing.get(this.keyVersion);
    if (!key) {
      return {
        accepted: false,
        code: 'SIGNING_CONFIGURATION_MISSING',
        reason: 'Signing key for active key version is unavailable.'
      };
    }

    const timestamp = nowIso(this.now);
    const digest = bodyDigest(body);
    const canonical = this.canonicalInput({
      timestamp,
      requestId,
      method,
      endpoint,
      bodyDigestValue: digest,
      keyVersion: this.keyVersion
    });
    const signature = createHmac('sha256', key).update(canonical, 'utf8').digest('hex');

    return {
      accepted: true,
      metadata: {
        version: 'v1',
        algorithm: 'HMAC-SHA256',
        keyVersion: this.keyVersion,
        timestamp,
        requestId,
        bodyDigest: digest,
        replayWindowSeconds: this.replayWindowSeconds,
        signatureHeader: `v1,t=${timestamp},kid=${this.keyVersion},rid=${requestId},sig=${signature}`
      }
    };
  }
}
