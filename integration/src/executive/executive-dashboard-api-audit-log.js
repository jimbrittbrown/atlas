import { createHash, randomUUID } from 'node:crypto';
import { appendEvent, loadEventList } from '../storage/provider-backed-state.js';

function sanitizeFilters(filters = {}) {
  const out = {};
  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value == null) return;
    const text = String(value);
    if (text.length > 120) {
      out[key] = `${text.slice(0, 120)}...`;
      return;
    }
    out[key] = text;
  });
  return out;
}

export class ExecutiveDashboardApiAuditLog {
  constructor({ storageProvider, namespace = 'executive.dashboard-api-audit-log' } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;
    this.events = loadEventList({ provider: this.storageProvider, namespace: this.namespace });
  }

  hashClientIdentity(clientId) {
    return createHash('sha256').update(String(clientId ?? 'anonymous'), 'utf8').digest('hex').slice(0, 16);
  }

  record({
    requestId,
    role,
    endpoint,
    operation,
    success,
    responseCategory,
    filters,
    clientId,
    durationMs,
    warnings = [],
    deniedReason = null
  } = {}) {
    const event = {
      auditEventId: `audit_${randomUUID()}`,
      requestId,
      timestamp: new Date().toISOString(),
      authenticatedRole: role ?? null,
      endpoint,
      operation,
      success: Boolean(success),
      responseCategory,
      filters: sanitizeFilters(filters),
      clientIdentityHash: this.hashClientIdentity(clientId),
      durationMs: Number(durationMs ?? 0),
      warnings,
      deniedReason
    };

    this.events.push(event);
    appendEvent({ provider: this.storageProvider, namespace: this.namespace, key: event.auditEventId, value: event });
    return event;
  }

  listEvents() {
    return this.events.slice();
  }

  getStatus() {
    return {
      enabled: true,
      eventCount: this.events.length
    };
  }
}
