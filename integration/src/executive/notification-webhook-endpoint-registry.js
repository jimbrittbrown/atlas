import {
  validateWebhookEndpoint,
  WebhookDispatchErrorCodes
} from './notification-webhook-provider-contracts.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function normalizeHostList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function canonicalEndpoint(endpoint) {
  try {
    return new URL(String(endpoint ?? '').trim()).toString();
  } catch {
    return String(endpoint ?? '').trim();
  }
}

export class NotificationWebhookEndpointRegistry {
  constructor({
    now,
    requireHttps = true,
    allowUnsafeTargets = false,
    globalAllowlist = normalizeHostList(process.env.ATLAS_WEBHOOK_ENDPOINT_ALLOWLIST),
    approvedEndpoints = []
  } = {}) {
    this.now = now;
    this.requireHttps = Boolean(requireHttps);
    this.allowUnsafeTargets = Boolean(allowUnsafeTargets);
    this.globalAllowlist = [...globalAllowlist];
    this.entries = new Map();

    approvedEndpoints.forEach((entry) => this.registerEndpoint(entry));
  }

  registerEndpoint({ endpoint, businessId, customerId = null, ownerReference = null, enabled = true, tags = [] } = {}) {
    const key = canonicalEndpoint(endpoint);
    this.entries.set(key, Object.freeze({
      endpoint: key,
      businessId: hasText(businessId) ? String(businessId).trim() : null,
      customerId: hasText(customerId) ? String(customerId).trim() : null,
      ownerReference: hasText(ownerReference) ? String(ownerReference).trim() : null,
      enabled: Boolean(enabled),
      tags: Array.isArray(tags) ? [...tags].map((item) => String(item).trim()).filter(Boolean) : [],
      updatedAt: nowIso(this.now)
    }));

    return this.entries.get(key);
  }

  listApprovedEndpoints() {
    return Array.from(this.entries.values());
  }

  resolveOwnership({ endpoint, businessId, customerId = null }) {
    const key = canonicalEndpoint(endpoint);
    const entry = this.entries.get(key);
    if (!entry) {
      return {
        accepted: false,
        code: WebhookDispatchErrorCodes.INVALID_ENDPOINT,
        reason: 'Endpoint is not registered for webhook delivery.'
      };
    }

    if (!entry.enabled) {
      return {
        accepted: false,
        code: WebhookDispatchErrorCodes.INVALID_ENDPOINT,
        reason: 'Endpoint is disabled.'
      };
    }

    if (hasText(entry.businessId) && String(entry.businessId) !== String(businessId)) {
      return {
        accepted: false,
        code: WebhookDispatchErrorCodes.ENDPOINT_OWNERSHIP_MISMATCH,
        reason: 'Business ownership mismatch for endpoint.'
      };
    }

    if (hasText(entry.customerId) && hasText(customerId) && String(entry.customerId) !== String(customerId)) {
      return {
        accepted: false,
        code: WebhookDispatchErrorCodes.ENDPOINT_OWNERSHIP_MISMATCH,
        reason: 'Customer ownership mismatch for endpoint.'
      };
    }

    return { accepted: true, endpoint: entry.endpoint, entry };
  }

  validateEndpointSafety(endpoint) {
    const result = validateWebhookEndpoint(endpoint, {
      requireHttps: this.requireHttps,
      allowUnsafeTargets: this.allowUnsafeTargets,
      allowlist: this.globalAllowlist
    });

    if (!result.accepted) {
      return {
        accepted: false,
        code: WebhookDispatchErrorCodes.UNSAFE_ENDPOINT,
        reason: result.issues.join(' '),
        issues: result.issues
      };
    }

    return {
      accepted: true,
      endpoint: result.endpoint
    };
  }

  authorizeEndpoint({ endpoint, businessId, customerId = null }) {
    const ownership = this.resolveOwnership({ endpoint, businessId, customerId });
    if (!ownership.accepted) return ownership;

    const safety = this.validateEndpointSafety(ownership.endpoint);
    if (!safety.accepted) return safety;

    return {
      accepted: true,
      endpoint: safety.endpoint,
      entry: ownership.entry
    };
  }

  validateStartup({ production = false } = {}) {
    const issues = [];
    if (production && this.entries.size === 0) {
      issues.push('No approved webhook endpoints are registered.');
    }

    this.listApprovedEndpoints().forEach((entry) => {
      const safety = this.validateEndpointSafety(entry.endpoint);
      if (!safety.accepted) {
        issues.push(`Endpoint ${entry.endpoint} is unsafe: ${safety.reason}`);
      }
      if (!hasText(entry.businessId)) {
        issues.push(`Endpoint ${entry.endpoint} missing businessId ownership.`);
      }
    });

    return {
      accepted: issues.length === 0,
      issues,
      failStartup: Boolean(production && issues.length > 0)
    };
  }
}
